import { buildingData, createBuilding, canPlaceBuilding, placeBuilding, updatePowerSupply } from '../buildings.js'
import { spawnEnemyUnit } from './enemySpawner.js'
import {
  resetAttackDirections,
  manageAICrewHealing,
  manageAITankerTrucks,
  manageAIRecoveryTanks,
  manageAIAmmunitionTrucks,
  manageAIAmmunitionMonitoring,
  manageAIRepairs
} from './enemyStrategies.js'
import { getUnitCost } from '../utils.js'
import { updateAIUnit } from './enemyUnitBehavior.js'
import { findBuildingPosition } from './enemyBuilding.js'
import { updateDangerZoneMaps } from '../game/dangerZoneMap.js'
import { logPerformance } from '../performanceUtils.js'
import { RECOVERY_TANK_RATIO, UNIT_COSTS } from '../config.js'
import { gameState } from '../gameState.js'
import { getLlmSettings } from './llmSettings.js'
import { processLlmBuildQueue, processLlmUnitQueue, markLlmBuildComplete, markLlmUnitComplete } from '../ai-api/applier.js'
import { ensureAirstripOperations, claimAirstripParkingSlot } from '../utils/airstripUtils.js'

const AI_SELL_PRIORITY = [
  'turretGunV1',
  'turretGunV2',
  'turretGunV3',
  'rocketTurret',
  'teslaCoil',
  'artilleryTurret',
  'radarStation',
  'helipad',
  'airstrip',
  'ammunitionFactory',
  'gasStation',
  'hospital',
  'vehicleWorkshop',
  'vehicleFactory',
  'powerPlant'
]
import { gameRandom } from '../utils/gameRandom.js'

const AI_SELL_PRIORITY_MAP = AI_SELL_PRIORITY.reduce((acc, type, index) => {
  acc[type] = index
  return acc
}, {})

const PROTECTED_AI_BUILDINGS = new Set(['constructionYard', 'oreRefinery'])

function getSellPriorityIndex(type) {
  return AI_SELL_PRIORITY_MAP[type] ?? AI_SELL_PRIORITY.length
}

function canSellBuildingType(type, counts) {
  if (PROTECTED_AI_BUILDINGS.has(type)) {
    return false
  }

  const count = counts[type] || 0

  if (type === 'vehicleFactory' || type === 'powerPlant') {
    return count > 1
  }

  return true
}

function sellBuildingsForEmergencyFunds(aiPlayerId, aiFactory, aiBuildings, requiredBudget) {
  if (!aiFactory || !aiBuildings || requiredBudget <= 0) {
    return false
  }

  if (aiFactory.budget >= requiredBudget) {
    return false
  }

  const buildingCounts = aiBuildings.reduce((acc, building) => {
    if (building.owner === aiPlayerId && !building.isBeingSold && building.health > 0) {
      acc[building.type] = (acc[building.type] || 0) + 1
    }
    return acc
  }, {})

  const sellableBuildings = aiBuildings
    .filter(
      building =>
        building.owner === aiPlayerId &&
        !building.isBeingSold &&
        building.health > 0 &&
        buildingData[building.type] &&
        canSellBuildingType(building.type, buildingCounts)
    )
    .sort((a, b) => getSellPriorityIndex(a.type) - getSellPriorityIndex(b.type))

  let soldAny = false

  for (const building of sellableBuildings) {
    if (aiFactory.budget >= requiredBudget) {
      break
    }

    const data = buildingData[building.type]
    if (!data || !data.cost) {
      continue
    }

    const sellValue = Math.floor(data.cost * 0.7)
    building.isBeingSold = true
    building.sellStartTime = performance.now()
    aiFactory.budget += sellValue
    buildingCounts[building.type] = (buildingCounts[building.type] || 1) - 1
    soldAny = true
  }

  return soldAny
}

function ensureAIEconomyRecovery(aiPlayerId, aiFactory, aiBuildings, aiHarvesters) {
  if (!aiFactory) {
    return
  }

  const hasRefinery = aiBuildings.some(
    building => building.owner === aiPlayerId && building.type === 'oreRefinery' && !building.isBeingSold && building.health > 0
  )

  const needsRefinery = !hasRefinery
  const needsHarvester = hasRefinery && aiHarvesters.length === 0

  if (!needsRefinery && !needsHarvester) {
    return
  }

  const requiredBudget = needsRefinery ? buildingData.oreRefinery.cost : UNIT_COSTS.harvester

  if (requiredBudget <= 0) {
    return
  }

  sellBuildingsForEmergencyFunds(aiPlayerId, aiFactory, aiBuildings, requiredBudget)
}

function findSimpleBuildingPosition(buildingType, mapGrid, factories, aiPlayerId) {
  // Validate inputs
  if (!buildingType) {
    window.logger.warn('findSimpleBuildingPosition called with undefined buildingType')
    return null
  }

  if (!buildingData[buildingType]) {
    window.logger.warn(`findSimpleBuildingPosition called with unknown buildingType: ${buildingType}`)
    return null
  }

  const factory = factories.find(f => f.id === aiPlayerId)
  if (!factory) return null

  const buildingWidth = buildingData[buildingType].width
  const buildingHeight = buildingData[buildingType].height

  const isDefensive =
    buildingType.startsWith('turretGun') ||
    buildingType === 'rocketTurret' ||
    buildingType === 'teslaCoil' ||
    buildingType === 'artilleryTurret'

  let angleOffset = 0
  if (isDefensive) {
    const playerFactory = factories.find(
      f => f.id === gameState.humanPlayer || f.id === 'player1'
    )
    if (playerFactory) {
      const fx = factory.x + Math.floor(factory.width / 2)
      const fy = factory.y + Math.floor(factory.height / 2)
      const px = playerFactory.x + Math.floor(playerFactory.width / 2)
      const py = playerFactory.y + Math.floor(playerFactory.height / 2)
      angleOffset = (Math.atan2(py - fy, px - fx) * 180) / Math.PI
      if (angleOffset < 0) angleOffset += 360
    }
  }

  // Use appropriate spacing based on building type
  let minDistance = 2 // MINIMUM 2 tiles spacing for all buildings
  if (buildingType === 'oreRefinery' || buildingType === 'vehicleFactory') {
    minDistance = 4 // More space for refineries and factories
  } else if (buildingType === 'concreteWall') {
    minDistance = 2 // Walls now also require 2-tile spacing to prevent clustering
  }

  // Extended spiral search around the factory with appropriate spacing
  for (let radius = minDistance; radius <= 20; radius++) {
    for (let step = 0; step < 360; step += 30) {
      const angle = ((angleOffset + step) % 360) * (Math.PI / 180)
      const x = factory.x + Math.round(Math.cos(angle) * radius)
      const y = factory.y + Math.round(Math.sin(angle) * radius)

      // Check bounds
      if (x < 0 || y < 0 || x + buildingWidth >= mapGrid[0].length || y + buildingHeight >= mapGrid.length) {
        continue
      }

      // Check if all tiles are valid with minimal clearance requirements
      let valid = true

      // For refineries and vehicle factories, check extra clearance around the building
      let clearanceNeeded = 2 // Default minimum clearance to enforce 2-tile spacing
      if (buildingType === 'oreRefinery' || buildingType === 'vehicleFactory') {
        clearanceNeeded = 3
      } else if (buildingType === 'concreteWall') {
        clearanceNeeded = 2 // Walls now also require 2-tile clearance
      }

      for (let by = y - clearanceNeeded; by < y + buildingHeight + clearanceNeeded && valid; by++) {
        for (let bx = x - clearanceNeeded; bx < x + buildingWidth + clearanceNeeded && valid; bx++) {
          // Only check the core building area for basic validity
          if (by >= y && by < y + buildingHeight && bx >= x && bx < x + buildingWidth) {
            if (by >= 0 && by < mapGrid.length && bx >= 0 && bx < mapGrid[0].length) {
              const tile = mapGrid[by][bx]
              if (tile.type === 'water' || tile.type === 'rock' || tile.building || tile.seedCrystal) {
                valid = false
              }
            } else {
              valid = false // Out of bounds
            }
          }
          // Check clearance area for obstacles (but allow land/street) - relaxed for smaller buildings
          else if (clearanceNeeded > 0 && (buildingType === 'oreRefinery' || buildingType === 'vehicleFactory')) {
            if (by >= 0 && by < mapGrid.length && bx >= 0 && bx < mapGrid[0].length) {
              const tile = mapGrid[by][bx]
              if (tile.type === 'water' || tile.type === 'rock' || tile.building) {
                valid = false
              }
            }
          }
        }
      }

      if (valid) {
        return { x, y }
      }
    }
  }

  return null
}

function calculateAIPowerState(aiPlayerId, aiBuildings, aiFactory) {
  let totalPower = 0
  let totalProduction = 0
  let totalConsumption = 0

  aiBuildings.forEach(building => {
    const power = building.power || 0
    totalPower += power

    if (power > 0) {
      totalProduction += power
    } else if (power < 0) {
      totalConsumption += Math.abs(power)
    }
  })

  if (aiFactory && aiFactory.owner === aiPlayerId && aiFactory.health > 0) {
    const factoryAlreadyCounted = aiBuildings.some(building => {
      if (building.type !== 'constructionYard') return false
      if (building === aiFactory) return true
      if (building.id && aiFactory.id && building.id === aiFactory.id) return true
      return building.x === aiFactory.x && building.y === aiFactory.y
    })

    if (!factoryAlreadyCounted) {
      const factoryPower = buildingData.constructionYard?.power || 0
      totalPower += factoryPower
      if (factoryPower > 0) {
        totalProduction += factoryPower
      }
    }
  }

  return {
    totalPower,
    totalProduction,
    totalConsumption
  }
}

function _updateAIPlayer(aiPlayerId, units, factories, bullets, mapGrid, gameState, occupancyMap, now, targetedOreTiles) {
  const aiFactory = factories.find(
    f => (f.id === aiPlayerId || f.owner === aiPlayerId) && f.health > 0
  )

  // If no active construction yard remains this AI cannot build
  if (!aiFactory) {
    return
  }

  manageAIRepairs(aiPlayerId, aiFactory, gameState, now)

  // Define the keys we'll use for this AI player's state
  const lastBuildingTimeKey = `${aiPlayerId}LastBuildingTime`
  const lastProductionKey = `${aiPlayerId}LastProductionTime`

  // Early return if no buildings exist in game state
  if (!gameState.buildings) {
    return
  }

  // Calculate AI's current buildings and harvesters (used by both recovery and building logic)
  const aiBuildings = gameState.buildings.filter(b => b.owner === aiPlayerId)
  const aiHarvesters = units.filter(
    u => u.owner === aiPlayerId && u.type === 'harvester' && u.health > 0
  )
  const llmStrategicActive = getLlmSettings().strategic.enabled
  const allowStrategicDecisions = !llmStrategicActive

  // Process LLM building & unit queues when LLM strategic AI is active.
  // This uses the same timer-based construction system as the local AI,
  // ensuring buildings/units are produced one at a time (fair to the player).
  if (llmStrategicActive && aiFactory) {
    processLlmBuildQueue(gameState, aiPlayerId, aiFactory, factories, mapGrid, units, gameState.buildings, now)
    processLlmUnitQueue(gameState, aiPlayerId, aiFactory, factories, units, gameState.buildings, now)
  }

  // Ensure AI can recover from economic collapse by selling buildings if needed
  // This must run BEFORE the budget check so it can execute when budget is low/zero
  if (allowStrategicDecisions) {
    ensureAIEconomyRecovery(aiPlayerId, aiFactory, aiBuildings, aiHarvesters)
  }

  // Debug logging (enable temporarily to debug building issues)
  // Enhanced build order: Core buildings -> Defense -> Advanced structures
  // Building construction runs independently from unit production
  if (allowStrategicDecisions && now - (gameState[lastBuildingTimeKey] || 0) >= 6000 && aiFactory.budget > 1000 &&
      !aiFactory.currentlyBuilding) {
    const powerPlants = aiBuildings.filter(b => b.type === 'powerPlant')
    const vehicleFactories = aiBuildings.filter(b => b.type === 'vehicleFactory')
    const oreRefineries = aiBuildings.filter(b => b.type === 'oreRefinery')
    const turrets = aiBuildings.filter(
      b =>
        b.type.startsWith('turretGun') ||
        b.type === 'rocketTurret' ||
        b.type === 'artilleryTurret'
    )
    const rocketTurrets = aiBuildings.filter(b => b.type === 'rocketTurret')
    const artilleryTurrets = aiBuildings.filter(b => b.type === 'artilleryTurret')
    const radarStations = aiBuildings.filter(b => b.type === 'radarStation')
    const teslaCoils = aiBuildings.filter(b => b.type === 'teslaCoil')
    const hospitals = aiBuildings.filter(b => b.type === 'hospital')
    const gasStations = aiBuildings.filter(b => b.type === 'gasStation')
    const vehicleWorkshops = aiBuildings.filter(b => b.type === 'vehicleWorkshop')
    const helipads = aiBuildings.filter(b => b.type === 'helipad')
    const airstrips = aiBuildings.filter(b => b.type === 'airstrip')
    const ammunitionFactories = aiBuildings.filter(b => b.type === 'ammunitionFactory')
    const turretGunCount = aiBuildings.filter(b => b.type.startsWith('turretGun')).length
    const aiTanks = units.filter(
      u =>
        u.owner === aiPlayerId &&
        (u.type === 'tank_v1' || u.type === 'tank-v2' || u.type === 'tank-v3')
    )
    const tanksInProduction = ['tank_v1', 'tank-v2', 'tank-v3'].includes(
      aiFactory.currentlyProducingUnit
    )
      ? 1
      : 0
    const totalTanks = aiTanks.length + tanksInProduction

    const REQUIRED_HARVESTERS = 4
    const harvesterGoalMet = aiHarvesters.length >= REQUIRED_HARVESTERS
    const hasVehicleFactory = vehicleFactories.length > 0
    const hasOreRefinery = oreRefineries.length > 0

    // Check if first tank has been produced (harvester hunter)
    const harvesterHunterQueuedKey = `${aiPlayerId}HarvesterHunterQueued`
    const harvesterHunterExists = units.some(
      u => u.owner === aiPlayerId && u.harvesterHunter && u.health > 0
    )
    const harvesterHunterQueued = Boolean(gameState[harvesterHunterQueuedKey])
    const firstTankProduced = harvesterHunterExists || (!harvesterHunterQueued && aiTanks.length > 0)

    const { totalPower: currentPower } = calculateAIPowerState(aiPlayerId, aiBuildings, aiFactory)
    const canAffordPowerPlant = aiFactory.budget >= buildingData.powerPlant.cost
    const hasPowerPlant = powerPlants.length > 0

    let buildingType = null
    let cost = 0

    // Prevent the AI from pursuing optional buildings until the early economy is established AND first tank is produced
    const allowAdditionalBuildings = harvesterGoalMet && firstTankProduced

    // Always prioritise power plants if the AI has none or is out of power
    if (!hasPowerPlant) {
      if (canAffordPowerPlant) {
        buildingType = 'powerPlant'
        cost = buildingData.powerPlant.cost
      }
    } else if (currentPower <= 0 && canAffordPowerPlant) {
      buildingType = 'powerPlant'
      cost = buildingData.powerPlant.cost

    // Early economy - first Ore Refinery once power is secured
    } else if (oreRefineries.length === 0 && aiFactory.budget >= buildingData.oreRefinery.cost) {
      buildingType = 'oreRefinery'
      cost = buildingData.oreRefinery.cost
    // Production - Vehicle Factory for unit production
    } else if (vehicleFactories.length === 0 && aiFactory.budget >= buildingData.vehicleFactory.cost) {
      buildingType = 'vehicleFactory'
      cost = buildingData.vehicleFactory.cost
    } else if (
      vehicleFactories.length > 0 &&
      aiHarvesters.length > 0 &&
      gasStations.length === 0 &&
      aiFactory.budget >= buildingData.gasStation.cost
    ) {
      // Build gas station only after the first harvester is produced
      buildingType = 'gasStation'
      cost = buildingData.gasStation.cost
    } else if (aiBuildings.filter(b => b.type === 'vehicleWorkshop').length === 0) {
      // Build a vehicle workshop once a factory exists
      buildingType = 'vehicleWorkshop'
      cost = buildingData.vehicleWorkshop.cost
    } else if (hospitals.length === 0 && aiFactory.budget >= buildingData.hospital.cost) {
      buildingType = 'hospital'
      cost = buildingData.hospital.cost
    } else if (
      vehicleFactories.length > 0 &&
      hospitals.length > 0 &&
      ammunitionFactories.length === 0 &&
      aiFactory.budget >= buildingData.ammunitionFactory.cost
    ) {
      // FR-030, FR-035: Build/rebuild ammunition factory after vehicle factory and hospital
      // This handles both initial construction and rebuilding after destruction
      buildingType = 'ammunitionFactory'
      cost = buildingData.ammunitionFactory.cost
    } else if (
      gasStations.length > 0 &&
      hospitals.length > 0 &&
      vehicleWorkshops.length > 0 &&
      radarStations.length === 0 &&
      aiFactory.budget >= buildingData.radarStation.cost
    ) {
      buildingType = 'radarStation'
      cost = buildingData.radarStation.cost
    } else if (
      gasStations.length > 0 &&
      hospitals.length > 0 &&
      vehicleWorkshops.length > 0 &&
      radarStations.length > 0 &&
      helipads.length === 0 &&
      aiFactory.budget >= buildingData.helipad.cost
    ) {
      buildingType = 'helipad'
      cost = buildingData.helipad.cost
    } else if (
      radarStations.length > 0 &&
      helipads.length > 0 &&
      airstrips.length === 0 &&
      aiFactory.budget >= buildingData.airstrip.cost
    ) {
      buildingType = 'airstrip'
      cost = buildingData.airstrip.cost
    } else if (turrets.length < 3) {
      // Basic defense: choose turret based on budget
      const allowTurretGun = turretGunCount < 2 || totalTanks >= 4
      if (aiFactory.budget >= buildingData.rocketTurret.cost) {
        buildingType = 'rocketTurret'
        cost = buildingData.rocketTurret.cost
      } else if (allowTurretGun && aiFactory.budget >= buildingData.turretGunV3.cost) {
        buildingType = 'turretGunV3'
        cost = buildingData.turretGunV3.cost
      } else if (allowTurretGun && aiFactory.budget >= buildingData.turretGunV2.cost) {
        buildingType = 'turretGunV2'
        cost = buildingData.turretGunV2.cost
      } else if (allowTurretGun && aiFactory.budget >= buildingData.turretGunV1.cost) {
        buildingType = 'turretGunV1'
        cost = buildingData.turretGunV1.cost
      }
    } else if (radarStations.length === 0 && aiFactory.budget >= buildingData.radarStation.cost) {
      // Radar station for advanced defense and map control
      buildingType = 'radarStation'
      cost = buildingData.radarStation.cost
    } else if (rocketTurrets.length === 0 && radarStations.length > 0 && aiFactory.budget >= 4000) {
      // Early special defenses - build at least one of each before expansion
      buildingType = 'rocketTurret'
      cost = buildingData.rocketTurret.cost
    } else if (teslaCoils.length === 0 && radarStations.length > 0 && aiFactory.budget >= buildingData.teslaCoil.cost) {
      buildingType = 'teslaCoil'
      cost = buildingData.teslaCoil.cost
    } else if (artilleryTurrets.length === 0 && aiFactory.budget >= buildingData.artilleryTurret.cost) {
      buildingType = 'artilleryTurret'
      cost = buildingData.artilleryTurret.cost
    } else if (oreRefineries.length === 1 && aiHarvesters.length >= 4 && aiFactory.budget >= buildingData.oreRefinery.cost) {
      // Second refinery (max 2 before advanced buildings)
      buildingType = 'oreRefinery'
      cost = buildingData.oreRefinery.cost
    // Core support buildings (required before expansion)
    } else if (teslaCoils.length < 2 && radarStations.length > 0 && aiFactory.budget >= buildingData.teslaCoil.cost) {
      // Advanced defense (Tesla Coils require radar)
      buildingType = 'teslaCoil'
      cost = buildingData.teslaCoil.cost

    // Expansion - more production buildings (only after core support buildings)
    } else if (vehicleFactories.length < 2 && hospitals.length > 0 && radarStations.length > 0 && vehicleWorkshops.length > 0 && aiFactory.budget >= buildingData.vehicleFactory.cost) {
      buildingType = 'vehicleFactory'
      cost = buildingData.vehicleFactory.cost

    // Additional refineries (only after core support buildings and if harvesters justify it)
    } else if (oreRefineries.length < 3 && hospitals.length > 0 && radarStations.length > 0 && vehicleWorkshops.length > 0) {
      const maxHarvestersForRefineries = oreRefineries.length * 4 // 1:4 ratio (4 harvesters per refinery)
      const harvesterCountInProduction = aiFactory.currentlyProducingUnit === 'harvester' ? 1 : 0

      if (aiHarvesters.length + harvesterCountInProduction >= maxHarvestersForRefineries && aiFactory.budget >= buildingData.oreRefinery.cost) {
        buildingType = 'oreRefinery'
        cost = buildingData.oreRefinery.cost
      }
    } else if (turrets.length < 6) {
      // Advanced defense: tesla coils, then rocket turrets, then V3 turrets
      if (aiFactory.budget >= buildingData.teslaCoil.cost && teslaCoils.length < 3 && radarStations.length > 0) {
        buildingType = 'teslaCoil'
        cost = buildingData.teslaCoil.cost
      } else if (aiFactory.budget >= buildingData.rocketTurret.cost) {
        buildingType = 'rocketTurret'
        cost = buildingData.rocketTurret.cost
      } else if (aiFactory.budget >= buildingData.artilleryTurret.cost) {
        buildingType = 'artilleryTurret'
        cost = buildingData.artilleryTurret.cost
      } else {
        const allowTurretGun = turretGunCount < 2 || totalTanks >= 4
        if (allowTurretGun) {
          buildingType = 'turretGunV3'
          cost = buildingData.turretGunV3.cost
        }
      }
    // Phase 9: Power plants for high energy consumption
    } else if (powerPlants.length < 3 && aiFactory.budget >= buildingData.powerPlant.cost) {
      buildingType = 'powerPlant'
      cost = buildingData.powerPlant.cost
    }

    if (!allowAdditionalBuildings) {
      // Before the AI has four active harvesters AND first tank, only allow essential economic structures
      const isPowerPlant = buildingType === 'powerPlant'
      const isRefinery = buildingType === 'oreRefinery'
      const isVehicleFactory = buildingType === 'vehicleFactory'

      const allowPowerPlant = isPowerPlant && (!powerPlants.length || currentPower <= 0)
      const allowRefinery = isRefinery && !hasOreRefinery
      const allowVehicleFactory = isVehicleFactory && !hasVehicleFactory

      if (!(allowPowerPlant || allowRefinery || allowVehicleFactory)) {
        buildingType = null
        cost = 0
      }
    }

    if (!buildingType && currentPower <= 0 && canAffordPowerPlant) {
      buildingType = 'powerPlant'
      cost = buildingData.powerPlant.cost
    }

    if (!allowAdditionalBuildings && buildingType) {
      // Re-validate after any fallback logic assigns a building (must have 4 harvesters AND first tank)
      const isPowerPlant = buildingType === 'powerPlant'
      const isRefinery = buildingType === 'oreRefinery'
      const isVehicleFactory = buildingType === 'vehicleFactory'

      const allowPowerPlant = isPowerPlant && (!powerPlants.length || currentPower <= 0)
      const allowRefinery = isRefinery && !hasOreRefinery
      const allowVehicleFactory = isVehicleFactory && !hasVehicleFactory

      if (!(allowPowerPlant || allowRefinery || allowVehicleFactory)) {
        buildingType = null
        cost = 0
      }
    }

    if (buildingType && buildingType !== 'powerPlant') {
      const buildingPowerImpact = buildingData[buildingType]?.power || 0

      if (buildingPowerImpact < 0 && currentPower + buildingPowerImpact < 0) {
        if (canAffordPowerPlant) {
          buildingType = 'powerPlant'
          cost = buildingData.powerPlant.cost
        } else {
          buildingType = null
          cost = 0
        }
      }
    }

    // Attempt to start building construction (don't place immediately)
    if (buildingType && aiFactory.budget >= cost) {
      // Try advanced positioning first, then fallback to simple positioning
      let position = findBuildingPosition(buildingType, mapGrid, units, gameState.buildings, factories, aiPlayerId)

      if (!position) {
        window.logger(`AI ${aiPlayerId} could not find position for ${buildingType}, trying simpler placement`)
        position = findSimpleBuildingPosition(buildingType, mapGrid, factories, aiPlayerId)
      }

      if (position) {
        // Start construction process instead of placing immediately
        aiFactory.budget = Math.max(0, aiFactory.budget - cost)
        aiFactory.currentlyBuilding = buildingType
        aiFactory.buildStartTime = now
        // Build duration aligned with player: base 750ms * (cost/500)
        aiFactory.buildDuration = 750 * (cost / 500)
        // Slow down construction if enemy power is negative
        if (gameState.enemyPowerSupply < 0) {
          aiFactory.buildDuration = aiFactory.buildDuration / Math.max(gameState.enemyBuildSpeedModifier, 0.01)
        }
        // Apply game speed multiplier
        aiFactory.buildDuration = aiFactory.buildDuration / gameState.speedMultiplier
        aiFactory.buildingPosition = position // Store position for completion
        gameState[lastBuildingTimeKey] = now
      } else {
        window.logger(`AI ${aiPlayerId} failed to find any position for ${buildingType}`)
        gameState[lastBuildingTimeKey] = now
      }
    }
  }

  // Complete building construction when timer finishes
  if (aiFactory && aiFactory.currentlyBuilding && now - aiFactory.buildStartTime > aiFactory.buildDuration) {
    const buildingType = aiFactory.currentlyBuilding
    const position = aiFactory.buildingPosition

    // Validate that buildingType is valid before proceeding
    if (!buildingType) {
      console.error(`AI ${aiPlayerId} currentlyBuilding is null/undefined, resetting construction`, {
        currentlyBuilding: aiFactory.currentlyBuilding,
        buildStartTime: aiFactory.buildStartTime,
        buildDuration: aiFactory.buildDuration
      })
      aiFactory.currentlyBuilding = null
      aiFactory.buildStartTime = null
      aiFactory.buildDuration = null
      aiFactory.buildingPosition = null
      return
    }

    if (!buildingData[buildingType]) {
      console.error(`AI ${aiPlayerId} currentlyBuilding is invalid type: ${buildingType}, resetting construction`, {
        currentlyBuilding: aiFactory.currentlyBuilding,
        availableTypes: Object.keys(buildingData)
      })
      aiFactory.currentlyBuilding = null
      aiFactory.buildStartTime = null
      aiFactory.buildDuration = null
      aiFactory.buildingPosition = null
      return
    }

    if (position) {
      // Double-check position is still valid before placing
      if (canPlaceBuilding(buildingType, position.x, position.y, gameState.mapGrid || mapGrid, units, gameState.buildings, factories, aiPlayerId)) {
        const newBuilding = createBuilding(buildingType, position.x, position.y)
        newBuilding.owner = aiPlayerId
        gameState.buildings.push(newBuilding)
        updateDangerZoneMaps(gameState)
        placeBuilding(newBuilding, mapGrid)
        updatePowerSupply(gameState.buildings, gameState)
      } else {
        // Position became invalid, try to find an alternative position immediately

        // Try the advanced algorithm first
        let alternativePosition = findBuildingPosition(buildingType, mapGrid, units, gameState.buildings, factories, aiPlayerId)

        // If that fails, try the simple algorithm
        if (!alternativePosition) {
          alternativePosition = findSimpleBuildingPosition(buildingType, mapGrid, factories, aiPlayerId)
        }

        if (alternativePosition) {
          // Found an alternative position, place the building there
          const newBuilding = createBuilding(buildingType, alternativePosition.x, alternativePosition.y)
          newBuilding.owner = aiPlayerId
          gameState.buildings.push(newBuilding)
          updateDangerZoneMaps(gameState)
          placeBuilding(newBuilding, mapGrid)
          updatePowerSupply(gameState.buildings, gameState)
        } else {
          // No alternative position found, refund the cost as last resort
          aiFactory.budget += buildingData[buildingType]?.cost || 0
        }
      }
    }

    // Clear construction state
    aiFactory.currentlyBuilding = null
    aiFactory.buildingPosition = null

    // Mark the LLM queue item as completed when LLM is driving builds
    if (llmStrategicActive) {
      markLlmBuildComplete(gameState, aiPlayerId)
    }
  }

  // Complete unit production when timer finishes
  if (aiFactory && aiFactory.currentlyProducingUnit && now - aiFactory.unitBuildStartTime > aiFactory.unitBuildDuration) {
    const unitType = aiFactory.currentlyProducingUnit
    const spawnFactory = aiFactory.unitSpawnBuilding || aiFactory

    // If the spawn factory was destroyed before production completed, cancel the spawn
    if (!(!spawnFactory || spawnFactory.health <= 0 || !gameState.buildings.includes(spawnFactory))) {
      const newUnit = spawnEnemyUnit(spawnFactory, unitType, units, mapGrid, gameState, aiFactory.unitBuildStartTime, aiPlayerId)

      if (newUnit) {
        units.push(newUnit)

        // Immediately trigger recovery tank assignment for newly spawned recovery tanks
        if (unitType === 'recoveryTank') {
          // Mark as ready for immediate assignment
          newUnit.lastRecoveryCommandTime = 0
          newUnit.freshlySpawned = true

          // Release from factory immediately for recovery tanks
          newUnit.holdInFactory = false
          newUnit.spawnedInFactory = false

          // Force immediate assignment with multiple attempts
          const attemptAssignment = () => {
            manageAIRecoveryTanks(units, gameState, mapGrid, now)
          }

          // Try multiple times to ensure assignment succeeds
          setTimeout(attemptAssignment, 50)
          setTimeout(attemptAssignment, 200)
          setTimeout(attemptAssignment, 500)
        }
      } else {
        window.logger.warn(`Failed to spawn ${aiPlayerId} ${unitType}`)
      }
    }

    // Clear unit production state
    aiFactory.currentlyProducingUnit = null
    aiFactory.unitBuildStartTime = null
    aiFactory.unitBuildDuration = null
    aiFactory.unitSpawnBuilding = null

    // Mark the LLM queue item as completed when LLM is driving production
    if (llmStrategicActive) {
      markLlmUnitComplete(gameState, aiPlayerId)
    }
  }

  // --- AI Unit Production ---
  // Only allow unit production after all required buildings are present
  if (allowStrategicDecisions &&
      gameState.buildings.filter(b => b.owner === aiPlayerId && b.type === 'powerPlant').length > 0 &&
      gameState.buildings.filter(b => b.owner === aiPlayerId && b.type === 'vehicleFactory').length > 0 &&
      gameState.buildings.filter(b => b.owner === aiPlayerId && b.type === 'oreRefinery').length > 0) {

    // Check if we need to produce the harvester hunter immediately
    const harvesterHunterQueuedKey = `${aiPlayerId}HarvesterHunterQueued`
    const harvesterHunterExists = units.some(
      u => u.owner === aiPlayerId && u.harvesterHunter && u.health > 0
    )
    const harvesterHunterQueued = Boolean(gameState[harvesterHunterQueuedKey])
    const aiHarvestersForCheck = units.filter(u => u.owner === aiPlayerId && u.type === 'harvester')
    const needsHarvesterHunter = !harvesterHunterExists && !harvesterHunterQueued && aiHarvestersForCheck.length >= 4

    // Reduce cooldown to 1 second when harvester hunter needs to be produced immediately
    const productionCooldown = needsHarvesterHunter ? 1000 : 8000

    // Don't produce units if already producing a unit
    if ( aiFactory && !aiFactory.currentlyProducingUnit && now - (gameState[lastProductionKey] || 0) >= productionCooldown ) {
      const aiHarvesters = units.filter(u => u.owner === aiPlayerId && u.type === 'harvester')
      const aiAmbulances = units.filter(u => u.owner === aiPlayerId && u.type === 'ambulance')
      const aiTankers = units.filter(u => u.owner === aiPlayerId && u.type === 'tankerTruck')
      const aiAmmoTrucks = units.filter(u => u.owner === aiPlayerId && u.type === 'ammunitionTruck')
      const aiApaches = units.filter(u => u.owner === aiPlayerId && u.type === 'apache' && u.health > 0)
      const aiF22s = units.filter(u => u.owner === aiPlayerId && u.type === 'f22Raptor' && u.health > 0)
      const aiBuildings = gameState.buildings.filter(b => b.owner === aiPlayerId)
      const aiRefineries = aiBuildings.filter(b => b.type === 'oreRefinery')
      const gasStations = aiBuildings.filter(b => b.type === 'gasStation')
      const ammunitionFactoriesForProduction = aiBuildings.filter(b => b.type === 'ammunitionFactory')
      const hasHospital = aiBuildings.some(b => b.type === 'hospital')
      const helipadsForProduction = aiBuildings.filter(b => b.type === 'helipad' && b.health > 0)
      const airstripsForProduction = aiBuildings.filter(b => b.type === 'airstrip' && b.health > 0)
      const rocketTurretsBuilt = aiBuildings.filter(b => b.type === 'rocketTurret').length
      const teslaCoilsBuilt = aiBuildings.filter(b => b.type === 'teslaCoil').length
      const artilleryTurretsBuilt = aiBuildings.filter(b => b.type === 'artilleryTurret').length
      const specialDefensesReady = rocketTurretsBuilt > 0 && teslaCoilsBuilt > 0 && artilleryTurretsBuilt > 0
      let unitType = 'tank_v1'
      let forceHarvesterHunter = false

      // Enhanced production rules:
      // 1. Build up to 4 harvesters per refinery (strict limit)
      // 2. Build a tanker truck when none exists and a harvester is present
      // 3. Always build ambulance if none exists and hospital is available
      // 4. Check if we need recovery tanks based on combat unit ratio
      // 5. Only build tanks if hospital exists (for crew support)
      // 6. Then build diverse combat units
      // 7. Focus on advanced units when budget is high
      // 8. Maintain harvester count but prioritize combat

      const MAX_HARVESTERS = aiRefineries.length * 4 // Strict 4 harvesters per refinery limit
      const harvesterCountInProduction = aiFactory.currentlyProducingUnit === 'harvester' ? 1 : 0
      const currentHarvesterTotal = aiHarvesters.length + harvesterCountInProduction
      const apacheCountInProduction = aiFactory.currentlyProducingUnit === 'apache' ? 1 : 0
      const f22CountInProduction = aiFactory.currentlyProducingUnit === 'f22Raptor' ? 1 : 0
      const HIGH_BUDGET_THRESHOLD = 12000
      const VERY_HIGH_BUDGET_THRESHOLD = 20000
      const isHighBudget = aiFactory.budget >= HIGH_BUDGET_THRESHOLD
      const isVeryHighBudget = aiFactory.budget >= VERY_HIGH_BUDGET_THRESHOLD
      const apacheCapacity = helipadsForProduction.length
      const needApache = apacheCapacity > 0 && (aiApaches.length + apacheCountInProduction) < apacheCapacity
      const multiF22BudgetThreshold = 10000
      const f22PerAirstripTarget = aiFactory.budget > multiF22BudgetThreshold ? 2 : 1
      const f22Capacity = airstripsForProduction.length * f22PerAirstripTarget
      const needF22 = f22Capacity > 0 && (aiF22s.length + f22CountInProduction) < f22Capacity

      // Check if we need to force the harvester hunter (use variables from above)
      if (needsHarvesterHunter) {
        unitType = 'tank_v1'
        forceHarvesterHunter = true
      } else if (aiTankers.length === 0 && aiHarvesters.length > 0 && gasStations.length > 0) {
        // Ensure at least one tanker truck exists to refuel units
        unitType = 'tankerTruck'
      } else if (
        ammunitionFactoriesForProduction.length > 0 &&
        aiAmmoTrucks.length < ammunitionFactoriesForProduction.length * 2 &&
        aiFactory.budget >= getUnitCost('ammunitionTruck')
      ) {
        // FR-031, FR-036: Build 1-2 ammunition supply trucks per ammunition factory
        // This handles both initial production and replacement after destruction
        unitType = 'ammunitionTruck'
      } else if (currentHarvesterTotal < MAX_HARVESTERS) {
        // Priority: Build up harvesters first, but strict limit of 4 per refinery
        unitType = 'harvester'
      } else if (hasHospital && aiAmbulances.length === 0) {
        // Always ensure at least one ambulance exists if hospital is available
        unitType = 'ambulance'
      } else if (needF22 && aiFactory.budget >= getUnitCost('f22Raptor')) {
        unitType = 'f22Raptor'
      } else if (needApache && aiFactory.budget >= getUnitCost('apache')) {
        unitType = 'apache'
      } else {
        // Check if we need recovery tanks based on combat unit ratio
        const aiRecoveryTanks = units.filter(u => u.owner === aiPlayerId && u.type === 'recoveryTank' && u.health > 0)
        const aiCombatUnits = units.filter(u =>
          u.owner === aiPlayerId &&
          (u.type === 'tank_v1' || u.type === 'tank-v2' || u.type === 'tank-v3' || u.type === 'rocketTank') &&
          u.health > 0
        )

        const requiredRecoveryTanks = Math.ceil(aiCombatUnits.length / RECOVERY_TANK_RATIO)
        const needsRecoveryTank = aiRecoveryTanks.length < requiredRecoveryTanks && aiCombatUnits.length >= RECOVERY_TANK_RATIO

        if (needsRecoveryTank && aiFactory.budget >= getUnitCost('recoveryTank')) {
          unitType = 'recoveryTank'
        } else {
          // We have enough harvesters and ambulance, hospital exists, now focus on diverse combat units
          const rand = gameRandom()
          if (forceHarvesterHunter) {
            // Always produce the harvester hunter tank immediately
            unitType = 'tank_v1'
          } else if (!specialDefensesReady) {
            // Delay other tank production until key defenses are built
            unitType = 'none' // No combat units until defenses are ready
          } else if (isVeryHighBudget) {
            // Very high budget: Focus on elite units
            if (rand < 0.1) unitType = 'tank_v1'
            else if (rand < 0.3) unitType = 'tank-v2'
            else if (rand < 0.6) unitType = 'tank-v3'
            else unitType = 'rocketTank'
          } else if (isHighBudget) {
            // High budget: Balanced advanced units
            if (rand < 0.2) unitType = 'tank_v1'
            else if (rand < 0.5) unitType = 'tank-v2'
            else if (rand < 0.75) unitType = 'rocketTank'
            else unitType = 'tank-v3'
          } else {
            // Normal budget: Mix of basic and medium units
            if (rand < 0.5) unitType = 'tank_v1'
            else if (rand < 0.8) unitType = 'tank-v2'
            else unitType = 'rocketTank'
          }
        }
      }
      // Determine cost based on unit type
      const cost = getUnitCost(unitType)

      if (unitType !== 'none' && aiFactory.budget >= cost) {
        // Find appropriate spawn factory for this unit type
        let spawnFactory = aiFactory // Default to main construction yard

        // Harvesters and other vehicle units should spawn from vehicle factories
        if (
          unitType === 'harvester' ||
          unitType === 'tank_v1' ||
          unitType === 'tank-v2' ||
          unitType === 'tank-v3' ||
          unitType === 'rocketTank' ||
          unitType === 'ambulance' ||
          unitType === 'tankerTruck' ||
          unitType === 'ammunitionTruck'
        ) {
          const aiVehicleFactories = gameState.buildings.filter(
            b => b.type === 'vehicleFactory' && b.owner === aiPlayerId
          )

          if (aiVehicleFactories.length > 0) {
            // Use round-robin to select the next vehicle factory
            const factoryIndexKey = `next${aiPlayerId}VehicleFactoryIndex`
            gameState[factoryIndexKey] = gameState[factoryIndexKey] ?? 0
            spawnFactory = aiVehicleFactories[gameState[factoryIndexKey] % aiVehicleFactories.length]
            gameState[factoryIndexKey]++
          } else {
            console.error(`Cannot spawn ${unitType}: AI player ${aiPlayerId} has no Vehicle Factory.`)
            // Skip this production cycle and try again later
            gameState[lastProductionKey] = now
            return
          }
        } else if (unitType === 'apache') {
          if (helipadsForProduction.length > 0) {
            const helipadIndexKey = `next${aiPlayerId}HelipadIndex`
            gameState[helipadIndexKey] = gameState[helipadIndexKey] ?? 0
            spawnFactory = helipadsForProduction[gameState[helipadIndexKey] % helipadsForProduction.length]
            gameState[helipadIndexKey]++
          } else {
            console.error(`Cannot spawn apache: AI player ${aiPlayerId} has no Helipad.`)
            gameState[lastProductionKey] = now
            return
          }
        } else if (unitType === 'f22Raptor') {
          const availableAirstrips = airstripsForProduction.filter(airstrip => {
            ensureAirstripOperations(airstrip)
            return claimAirstripParkingSlot(airstrip) >= 0
          })

          if (availableAirstrips.length > 0) {
            const airstripIndexKey = `next${aiPlayerId}AirstripIndex`
            gameState[airstripIndexKey] = gameState[airstripIndexKey] ?? 0
            spawnFactory = availableAirstrips[gameState[airstripIndexKey] % availableAirstrips.length]
            gameState[airstripIndexKey]++
          } else {
            gameState[lastProductionKey] = now
            return
          }
        }

        // Determine cost based on unit type
        const cost = getUnitCost(unitType)
        // Record production details and delay spawning until build time completes
        aiFactory.budget = Math.max(0, aiFactory.budget - cost)
        aiFactory.currentlyProducingUnit = unitType
        aiFactory.unitBuildStartTime = now
        // Base unit production time
        aiFactory.unitBuildDuration = 10000
        // Slow production if enemy power is negative
        if (gameState.enemyPowerSupply < 0) {
          aiFactory.unitBuildDuration = aiFactory.unitBuildDuration / Math.max(gameState.enemyBuildSpeedModifier, 0.01)
        }
        // Apply game speed multiplier
        aiFactory.unitBuildDuration = aiFactory.unitBuildDuration / gameState.speedMultiplier
        aiFactory.unitSpawnBuilding = spawnFactory
        gameState[lastProductionKey] = now
        if (forceHarvesterHunter) {
          gameState[harvesterHunterQueuedKey] = true
        }

        // Reset attack directions periodically to ensure varied attack patterns
        // This happens roughly every 4-5 unit productions (40-50 seconds)
        if (gameRandom() < 0.25) {
          resetAttackDirections()
        }
      }
    }
  }

  // --- Update AI Units ---
  units.forEach(unit => {
    if (unit.owner !== aiPlayerId) return

    updateAIUnit(unit, units, gameState, mapGrid, now, aiPlayerId, targetedOreTiles, bullets)
  })

  // --- Manage AI Crew Healing ---
  // Run crew management for this AI player
  const aiUnits = units.filter(u => u.owner === aiPlayerId)
  if (aiUnits.length > 0) {
    manageAICrewHealing(units, gameState, now)
    manageAITankerTrucks(units, gameState, mapGrid)
    manageAIRecoveryTanks(units, gameState, mapGrid, now)
    manageAIAmmunitionTrucks(units, gameState, mapGrid)
    manageAIAmmunitionMonitoring(units, gameState, mapGrid)
  }
}

const updateAIPlayer = logPerformance(_updateAIPlayer, false)

export { updateAIPlayer }
