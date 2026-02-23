// Main Game Update Module - Coordinates all game systems
import {
  TILE_SIZE,
  SMOKE_EMIT_INTERVAL,
  BUILDING_SMOKE_EMIT_INTERVAL,
  UNIT_SMOKE_SOFT_CAP_RATIO,
  MAX_SMOKE_PARTICLES
} from './config.js'

import { emitSmokeParticles } from './utils/smokeUtils.js'

import { logPerformance } from './performanceUtils.js'

import { updateEnemyAI } from './enemy.js'
import { cleanupDestroyedSelectedUnits, getUnitCommandsHandler } from './inputHandler.js'
import { updateBuildingsUnderRepair, updateBuildingsAwaitingRepair, buildingData, cacheBuildingSmokeScales } from './buildings.js'
import { handleSelfRepair } from './utils.js'
import { updateGuardBehavior } from './behaviours/guard.js'
import { units as mainUnits } from './main.js'

// Import spatial partitioning for optimized collision detection
import { rebuildSpatialQuadtree } from './game/spatialQuadtree.js'

// Import modular game systems
import { updateUnitMovement, updateSpawnExit } from './game/unitMovement.js'
import { updateUnitCombat, cleanupAttackGroupTargets } from './game/unitCombat.js'
import { updateHarvesterLogic } from './game/harvesterLogic.js'
import { updateWorkshopLogic } from './game/workshopLogic.js'
import { updateBullets } from './game/bulletSystem.js'
import { updateWreckPhysics } from './game/unitWreckManager.js'
import { updateHospitalLogic } from './game/hospitalLogic.js'
import { updateAmbulanceLogic } from './game/ambulanceSystem.js'
import { updateGasStationLogic } from './game/gasStationLogic.js'
import { updateAmmunitionSystem } from './game/ammunitionSystem.js'
import { updateHelipadLogic } from './game/helipadLogic.js'
import { updateTankerTruckLogic } from './game/tankerTruckLogic.js'
import { updateAmmunitionTruckLogic } from './game/ammunitionTruckLogic.js'
import { updateRecoveryTankLogic } from './game/recoveryTankSystem.js'
import { updateMines } from './game/mineSystem.js'
import { updateMineLayerBehavior } from './game/mineLayerBehavior.js'
import { updateMineSweeperBehavior } from './game/mineSweeperBehavior.js'
import { updateBuildings, updateTeslaCoilEffects } from './game/buildingSystem.js'
import { cleanupSoundCooldowns } from './game/soundCooldownManager.js'
import { processCommandQueues } from './game/commandQueue.js'
import {
  updateMapScrolling,
  updateCameraFollow,
  updateOreSpread,
  updateExplosions,
  updateSmokeParticles,
  updateDustParticles,
  cleanupDestroyedUnits,
  updateUnitCollisions,
  updateGameTime,
  handleRightClickDeselect,
  cleanupDestroyedFactories,
  checkGameEndConditions
} from './game/gameStateManager.js'
import { updateGlobalPathfinding } from './game/pathfinding.js'
import { logUnitStatus } from './utils/logger.js'
import { updateRemoteControlledUnits } from './game/remoteControl.js'
import { updateShadowOfWar } from './game/shadowOfWar.js'
import { processPendingRemoteCommands, isHost, COMMAND_TYPES, updateUnitInterpolation } from './network/gameCommandSync.js'
import { createBuilding, placeBuilding, updatePowerSupply } from './buildings.js'
import { buildingCosts } from './main.js'
import { unitCosts } from './units.js'
import { updateDangerZoneMaps } from './game/dangerZoneMap.js'
import { spawnUnit } from './units.js'

export const updateGame = logPerformance(function updateGame(delta, mapGrid, factories, units, bullets, gameState) {
  try {
    const now = performance.now()
    const occupancyMap = gameState.occupancyMap

    // Check if we're a remote client (not the host)
    const isRemoteClient = !isHost() && gameState.multiplayerSession?.isRemote

    // Process pending remote commands from clients (host only)
    if (isHost()) {
      const remoteCommands = processPendingRemoteCommands()

      const chargePartyProductionCost = (partyId, cost) => {
        const normalizedCost = Number(cost) || 0
        if (normalizedCost <= 0) {
          return true
        }

        if (partyId === gameState.humanPlayer) {
          if ((Number(gameState.money) || 0) < normalizedCost) {
            return false
          }
          gameState.money -= normalizedCost
          return true
        }

        const ownerFactory = (factories || []).find((factory) => (factory.owner || factory.id) === partyId)
        if (!ownerFactory || !Number.isFinite(ownerFactory.budget)) {
          return false
        }

        if (ownerFactory.budget < normalizedCost) {
          return false
        }

        ownerFactory.budget -= normalizedCost
        return true
      }

      remoteCommands.forEach(cmd => {
        if (cmd.commandType === COMMAND_TYPES.BUILDING_PLACE && cmd.payload) {
          const { buildingType, x, y } = cmd.payload
          const owner = cmd.sourcePartyId
          const buildCost = Number(buildingCosts?.[buildingType]) || 0

          if (!chargePartyProductionCost(owner, buildCost)) {
            window.logger.warn('[Host] Rejecting BUILDING_PLACE due to insufficient funds:', owner, buildingType, buildCost)
            return
          }

          const newBuilding = createBuilding(buildingType, x, y)
          newBuilding.owner = owner
          if (!gameState.buildings) gameState.buildings = []
          gameState.buildings.push(newBuilding)
          updateDangerZoneMaps(gameState)
          placeBuilding(newBuilding, mapGrid)
          updatePowerSupply(gameState.buildings, gameState)
        } else if (cmd.commandType === COMMAND_TYPES.BUILDING_SELL && cmd.payload) {
          // Apply building sell from client
          const { buildingId, sellStartTime } = cmd.payload
          const building = gameState.buildings.find(b => b.id === buildingId)
          if (building && !building.isBeingSold) {
            building.isBeingSold = true
            building.sellStartTime = sellStartTime
          }
        } else if (cmd.commandType === COMMAND_TYPES.UNIT_MOVE && cmd.payload) {
          // Apply unit move command from client
          const { unitIds, targetX, targetY } = cmd.payload
          const partyId = cmd.sourcePartyId
          // Convert pixel coordinates to tile coordinates
          const tileX = Math.floor(targetX / TILE_SIZE)
          const tileY = Math.floor(targetY / TILE_SIZE)
          window.logger('[Host] Processing UNIT_MOVE from party:', partyId, 'unitIds:', unitIds, 'target pixels:', targetX, targetY, 'tiles:', tileX, tileY)
          unitIds.forEach(unitId => {
            // Find unit by ID - owner check is implicit since client can only select their own units
            const unit = mainUnits.find(u => u.id === unitId)
            if (unit) {
              // Verify ownership before applying command
              if (unit.owner === partyId) {
                // Set movement target in TILE coordinates - the movement system will handle pathfinding
                unit.moveTarget = { x: tileX, y: tileY }
                unit.attackTarget = null
                unit.guardPosition = null
                window.logger('[Host] Unit', unitId, 'moveTarget set to tile', tileX, tileY)
              } else {
                window.logger.warn('[Host] Unit', unitId, 'owner mismatch:', unit.owner, '!==', partyId)
              }
            } else {
              window.logger.warn('[Host] Unit not found:', unitId)
            }
          })
        } else if (cmd.commandType === COMMAND_TYPES.UNIT_ATTACK && cmd.payload) {
          // Apply unit attack command from client
          const { unitIds, targetId, targetX, targetY } = cmd.payload
          const partyId = cmd.sourcePartyId
          window.logger('[Host] Processing UNIT_ATTACK from party:', partyId, 'unitIds:', unitIds, 'targetId:', targetId)
          unitIds.forEach(unitId => {
            const unit = mainUnits.find(u => u.id === unitId && u.owner === partyId)
            if (unit) {
              // Find the target
              const target = mainUnits.find(u => u.id === targetId) ||
                             gameState.buildings.find(b => b.id === targetId) ||
                             factories.find(f => f.id === targetId)
              if (target) {
                // Combat system uses unit.target, not unit.attackTarget
                unit.target = target
                unit.moveTarget = null
                unit.guardPosition = null
                unit.path = null // Clear path so unit stops and attacks
                window.logger('[Host] Unit', unitId, 'target set to', target.id || target.type)
              } else if (targetX !== undefined && targetY !== undefined) {
                // Attack move to position - convert pixels to tiles
                const tileX = Math.floor(targetX / TILE_SIZE)
                const tileY = Math.floor(targetY / TILE_SIZE)
                unit.moveTarget = { x: tileX, y: tileY }
                unit.target = null
              } else {
                window.logger.warn('[Host] Target not found:', targetId)
              }
            } else {
              window.logger.warn('[Host] Unit not found or owner mismatch:', unitId, partyId)
            }
          })
        } else if (cmd.commandType === COMMAND_TYPES.UNIT_STOP && cmd.payload) {
          // Apply unit stop command from client
          const { unitIds } = cmd.payload
          const partyId = cmd.sourcePartyId
          unitIds.forEach(unitId => {
            const unit = mainUnits.find(u => u.id === unitId && u.owner === partyId)
            if (unit) {
              unit.path = null
              unit.moveTarget = null
              unit.attackTarget = null
              unit.guardPosition = null
              unit.target = null  // Clear the combat target to stop firing
              unit.forcedAttack = false
              unit.attackQueue = []
              unit.attackGroupTargets = []
            }
          })
        } else if (cmd.commandType === COMMAND_TYPES.UNIT_GUARD && cmd.payload) {
          // Apply unit guard command from client
          const { unitIds, guardX, guardY } = cmd.payload
          const partyId = cmd.sourcePartyId
          unitIds.forEach(unitId => {
            const unit = mainUnits.find(u => u.id === unitId && u.owner === partyId)
            if (unit) {
              unit.guardPosition = { x: guardX, y: guardY }
              unit.attackTarget = null
            }
          })
        } else if (cmd.commandType === COMMAND_TYPES.UNIT_SPAWN && cmd.payload) {
          // Client requests host to spawn a unit
          const { unitType, factoryId, rallyPoint } = cmd.payload
          const partyId = cmd.sourcePartyId
          const unitCost = Number(unitCosts?.[unitType]) || 0

          if (!chargePartyProductionCost(partyId, unitCost)) {
            window.logger.warn('[Host] Rejecting UNIT_SPAWN due to insufficient funds:', partyId, unitType, unitCost)
            return
          }

          // Find the factory for spawning
          let spawnFactory = null
          if (factoryId) {
            spawnFactory = gameState.buildings.find(b => b.id === factoryId && b.owner === partyId)
          }

          // Fallback to finding appropriate factory by type
          if (!spawnFactory) {
            const vehicleUnitTypes = ['tank', 'tank-v2', 'rocketTank', 'tank_v1', 'tank-v3', 'harvester', 'ambulance', 'tankerTruck', 'ammunitionTruck', 'recoveryTank', 'howitzer', 'mineLayer', 'mineSweeper']
            if (vehicleUnitTypes.includes(unitType)) {
              spawnFactory = gameState.buildings.find(b => b.type === 'vehicleFactory' && b.owner === partyId)
            } else if (unitType === 'apache' || unitType === 'f22') {
              spawnFactory = gameState.buildings.find(b => b.type === 'helipad' && b.owner === partyId)
            }
          }

          if (spawnFactory) {
            const newUnit = spawnUnit(
              spawnFactory,
              unitType,
              mainUnits,
              mapGrid,
              rallyPoint,
              gameState.occupancyMap
            )
            if (newUnit) {
              newUnit.owner = partyId
              mainUnits.push(newUnit)
            }
          }
        }
        // Note: CLIENT_STATE_UPDATE is no longer processed - host is authoritative
      })
    }

    if (gameState.gamePaused) {
      return
    }

    // Update game time (both host and client need this for animations)
    updateGameTime(gameState, delta)

    // Update unit interpolation for smooth movement on remote clients
    // This must be called every frame to interpolate between host snapshots
    if (isRemoteClient) {
      updateUnitInterpolation() // Also handles bullet interpolation
    }

    // Update movement speeds for all units based on speed multiplier
    units.forEach(unit => {
      unit.effectiveSpeed = unit.speed * gameState.speedMultiplier
    })

    // Clean up unit selection - prevent null references
    cleanupDestroyedSelectedUnits()

    // Handle right-click deselection
    handleRightClickDeselect(gameState, units)

    // Map scrolling with inertia (client needs this for UI)
    updateMapScrolling(gameState, mapGrid)
    // Keep camera focused on followed unit when enabled
    updateCameraFollow(gameState, units, mapGrid)

    // === HOST-ONLY GAME LOGIC ===
    // Remote clients skip all game simulation - they receive state from host
    if (!isRemoteClient) {
      // Rebuild spatial quadtree for efficient neighbor queries this frame
      rebuildSpatialQuadtree(units)

      // Process queued unit commands before running unit systems
      const unitCommands = getUnitCommandsHandler()
      processCommandQueues(units, mapGrid, unitCommands, gameState.buildings)

      // Apply remote control inputs for selected tanks
      updateRemoteControlledUnits(units, bullets, mapGrid, occupancyMap)

      // Unit system updates
      units.forEach(unit => {
        updateGuardBehavior(unit, mapGrid, occupancyMap, now)
      })
      updateUnitMovement(units, mapGrid, occupancyMap, gameState, now, factories)
      updateSpawnExit(units, factories, mapGrid, occupancyMap)
      updateUnitCombat(units, bullets, mapGrid, gameState, now)
      updateHarvesterLogic(units, mapGrid, occupancyMap, gameState, factories, now)
      updateWorkshopLogic(units, gameState.buildings, mapGrid, delta)

      updateRecoveryTankLogic(units, gameState, delta)

      updateHospitalLogic(units, gameState.buildings, gameState, delta)
      updateAmbulanceLogic(units, gameState, delta)
      updateGasStationLogic(units, gameState.buildings, gameState, delta)
      updateAmmunitionSystem(units, gameState.buildings, gameState, delta)
      updateHelipadLogic(units, gameState.buildings, gameState, delta)
      updateTankerTruckLogic(units, gameState, delta)
      updateAmmunitionTruckLogic(units, gameState, delta)
      // Update mine system (arming, etc.)
      updateMines(now)
      // Update mine layer behavior (deployment, auto-refill)
      updateMineLayerBehavior(units, now)
      // Update mine sweeper behavior (sweeping mode, speed, dust)
      updateMineSweeperBehavior(units, gameState, now)
      // Handle self-repair for level 3 units
      units.forEach(unit => {
        handleSelfRepair(unit, now)
      })

      // Global pathfinding recalculation
      updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)

      // Bullet system updates
      updateBullets(bullets, units, factories, gameState, mapGrid)

      // Update wreck inertia and drift after impacts
      updateWreckPhysics(gameState, units, delta)

      // Building system updates
      updateBuildings(gameState, units, bullets, factories, mapGrid, delta)

      // Tesla Coil effects
      updateTeslaCoilEffects(units)

      // Unit collision resolution
      updateUnitCollisions(units, mapGrid)

      // Ore spreading mechanism
      updateOreSpread(gameState, mapGrid, factories)

      // Cleanup destroyed units
      cleanupDestroyedUnits(units, gameState)

      // Cleanup destroyed factories
      cleanupDestroyedFactories(factories, mapGrid, gameState)

      // Cleanup sound cooldowns for destroyed units
      cleanupSoundCooldowns(units)

      // Check for game end conditions after factory/building destruction
      checkGameEndConditions(factories, gameState)

      // Enemy AI updates
      updateEnemyAI(units, factories, bullets, mapGrid, gameState)

      // Update buildings under repair
      if (gameState.buildingsUnderRepair && gameState.buildingsUnderRepair.length > 0) {
        updateBuildingsUnderRepair(gameState, now)
      }

      // Update buildings awaiting repair (countdown for buildings under attack)
      updateBuildingsAwaitingRepair(gameState, now)

      // Self-repair for level 3 units
      handleSelfRepair(units, now)
    }
    // === END HOST-ONLY GAME LOGIC ===

    // === VISUAL UPDATES (both host and client) ===
    // Ensure smoke particle array exists before checking length
    if (!Array.isArray(gameState.smokeParticles)) {
      gameState.smokeParticles = []
    }

    // Emit smoke for heavily damaged ground vehicles
    const unitSmokeLimit = MAX_SMOKE_PARTICLES * UNIT_SMOKE_SOFT_CAP_RATIO

    units.forEach(unit => {
      // Ensure maxHealth is valid (fix for loaded games with missing maxHealth)
      const maxHealth = unit.maxHealth || unit.health || 100
      const healthRatio = unit.health / maxHealth

      // Check if unit type should emit smoke when heavily damaged
      // Uses string.includes('tank') to match tank_v1, tank-v2, tank-v3, rocketTank
      const isSmokeEmittingType =
        unit.type.includes('tank') ||
        unit.type === 'harvester' ||
        unit.type === 'howitzer' ||
        unit.type === 'recoveryTank'

      const shouldEmitSmoke = healthRatio < 0.25 && isSmokeEmittingType

      if (shouldEmitSmoke) {
        if (gameState.smokeParticles.length >= unitSmokeLimit) {
          return
        }

        if (!unit.lastSmokeTime || now - unit.lastSmokeTime > SMOKE_EMIT_INTERVAL) {
          // Emit smoke from the BACK of the unit (opposite to direction of travel)
          // direction = 0 means facing right (east), so back is to the left (west)
          const direction = unit.direction || 0
          const offsetX = -Math.cos(direction) * TILE_SIZE * 0.35
          const offsetY = -Math.sin(direction) * TILE_SIZE * 0.35

          const particleCount = 1
          emitSmokeParticles(
            gameState,
            unit.x + TILE_SIZE / 2 + offsetX,
            unit.y + TILE_SIZE / 2 + offsetY,
            now,
            particleCount
          )
          unit.lastSmokeTime = now
        }
      }
    })

    // Emit smoke for buildings with smoke spots
    // Performance optimization: Use cached scale factors instead of computing per-frame
    if (gameState.buildings && gameState.buildings.length > 0) {
      gameState.buildings.forEach(building => {
        const buildingConfig = buildingData[building.type]
        if (
          !buildingConfig?.smokeSpots?.length
        ) {
          return // Skip buildings without smoke spots
        }

        if (!building.constructionFinished) {
          return // Do not emit smoke before construction animation completes
        }

        // Initialize smoke emission tracking for each spot if not exists (legacy building support)
        if (!building.smokeEmissionTrackers) {
          building.smokeEmissionTrackers = buildingConfig.smokeSpots.map(() => ({
            lastEmissionTime: 0,
            emissionStage: 0
          }))
        }

        // Check if smoke scales are cached; if not, attempt to cache them
        if (!building.smokeScalesCached) {
          cacheBuildingSmokeScales(building, buildingConfig)
          // If still not cached after attempt, skip this frame
          if (!building.smokeScalesCached) {
            return
          }
        }

        // Use pre-calculated cached smoke spot positions for performance
        const cachedSpots = building.cachedSmokeSpots
        const buildingOriginX = building.x * TILE_SIZE
        const buildingOriginY = building.y * TILE_SIZE

        // Emit smoke from each smoke spot using cached coordinates
        cachedSpots.forEach((cachedSpot, spotIndex) => {
          const tracker = building.smokeEmissionTrackers[spotIndex]
          const timeSinceLastEmission = now - tracker.lastEmissionTime

          if (timeSinceLastEmission > BUILDING_SMOKE_EMIT_INTERVAL) {
            // Use pre-calculated scaled coordinates
            const smokeX = buildingOriginX + cachedSpot.scaledX
            const smokeY = buildingOriginY + cachedSpot.scaledY

            // Emit more particles per puff for visible building smoke
            emitSmokeParticles(gameState, smokeX, smokeY, now, 3)

            tracker.lastEmissionTime = now
            tracker.emissionStage = (tracker.emissionStage + 1) % 4
          }
        })
      })
    }

    // Cleanup destroyed attack group targets (visual cleanup, safe for client)
    cleanupAttackGroupTargets(gameState)

    // Explosion effects (visual, both need this)
    updateExplosions(gameState)
    updateSmokeParticles(gameState)
    updateDustParticles(gameState)

    // Update fog of war visibility (visual, both need this)
    updateShadowOfWar(gameState, units, mapGrid, factories)

    // Log status changes for units with logging enabled
    units.forEach(unit => {
      if (unit.loggingEnabled) {
        logUnitStatus(unit)
      }
    })

  } catch (error) {
    console.error('Critical error in updateGame:', error)
    console.trace() // Add stack trace to see exactly where the error occurs
    // Don't allow the game to completely crash
  }
}, false)

// Re-export Tesla Coil effects for backward compatibility
export { updateTeslaCoilEffects }
