// Building configuration and management
import { playSound } from './sound.js'
import { showNotification } from './ui/notifications.js'
import { gameState } from './gameState.js'
import { recordBuildingStarted } from './ai-api/transitionCollector.js'
import { logPerformance } from './performanceUtils.js'
import {
  PLAYER_POSITIONS,
  MAP_TILES_X,
  MAP_TILES_Y,
  TILE_SIZE
} from './config.js'
import { updateDangerZoneMaps } from './game/dangerZoneMap.js'
import { ensureServiceRadius } from './utils/serviceRadius.js'
import { getUniqueId } from './utils.js'
import { getMapRenderer } from './rendering.js'
import { getBuildingImage } from './buildingImageMap.js'
import { isAirstripBlockedLocalTile } from './utils/buildingPassability.js'
import { ensureAirstripOperations } from './utils/airstripUtils.js'

// Re-export buildingData from the data module to maintain backwards compatibility
export { buildingData } from './data/buildingData.js'
import { buildingData } from './data/buildingData.js'

// Re-export validation functions from the validation module to maintain backwards compatibility
// The actual implementations are in src/validation/buildingPlacement.js
export { isNearExistingBuilding, isTileValid } from './validation/buildingPlacement.js'
import { canPlaceBuilding as canPlaceBuildingBase } from './validation/buildingPlacement.js'

// Wrapper for canPlaceBuilding that passes gameState.mapEditMode for backwards compatibility
export function canPlaceBuilding(type, tileX, tileY, mapGrid, units, buildings, factories, owner = 'player') {
  return canPlaceBuildingBase(type, tileX, tileY, mapGrid, units, buildings, factories, owner, {
    mapEditMode: gameState.mapEditMode
  })
}

/**
 * Precompute and cache smoke emission scale factors for a building.
 * This avoids expensive per-frame image lookups and scale calculations.
 * @param {Object} building - The building to cache smoke scales for
 * @param {Object} buildingConfig - The building's configuration from buildingData
 */
export function cacheBuildingSmokeScales(building, buildingConfig) {
  if (!buildingConfig?.smokeSpots?.length) {
    return
  }

  // Attempt to get the cached building image
  const buildingImage = getBuildingImage(building.type)
  if (!buildingImage) {
    // Image not loaded yet - register a callback to cache when it's ready
    getBuildingImage(building.type, (img) => {
      if (img && building) {
        computeAndStoreSmokeScales(building, buildingConfig, img)
      }
    })
    return
  }

  computeAndStoreSmokeScales(building, buildingConfig, buildingImage)
}

/**
 * Internal helper to compute and store smoke scale factors.
 * @param {Object} building - The building to cache smoke scales for
 * @param {Object} buildingConfig - The building's configuration
 * @param {HTMLImageElement} buildingImage - The loaded building image
 */
function computeAndStoreSmokeScales(building, buildingConfig, buildingImage) {
  const renderedWidth = building.width * TILE_SIZE
  const renderedHeight = building.height * TILE_SIZE
  const actualImageWidth = buildingImage.naturalWidth || buildingImage.width
  const actualImageHeight = buildingImage.naturalHeight || buildingImage.height

  // Calculate individual scaling factors for X and Y (important for non-square images)
  const scaleX = renderedWidth / actualImageWidth
  const scaleY = renderedHeight / actualImageHeight

  // Store cached scale factors on the building
  building.smokeScaleX = scaleX
  building.smokeScaleY = scaleY

  // Pre-calculate scaled smoke spot positions (in world pixel coordinates relative to building origin)
  building.cachedSmokeSpots = buildingConfig.smokeSpots.map((spot) => ({
    scaledX: spot.x * scaleX,
    scaledY: spot.y * scaleY
  }))

  // Mark smoke scales as cached
  building.smokeScalesCached = true
}

export function createBuilding(type, x, y) {
  if (!buildingData[type]) return null

  const data = buildingData[type]

  const building = {
    id: getUniqueId(), // Generate unique ID for syncing
    type,
    x,
    y,
    width: data.width,
    height: data.height,
    health: data.health,
    maxHealth: data.health,
    power: data.power,
    isBuilding: true,
    owner: 'neutral', // Default owner, should be set explicitly when added to gameState
    damageValue: 0,
    // Timestamp for construction animation
    constructionStartTime: performance.now(),
    constructionFinished: false
  }

  if (type === 'helipad' || type === 'airstrip') {
    building.landedUnitId = null
  }

  if (type === 'airstrip') {
    ensureAirstripOperations(building)
  }

  if (type === 'street') {
    building.selectable = false
  }

  if (typeof data.maxFuel === 'number') {
    building.maxFuel = data.maxFuel
    building.fuel = data.maxFuel
    if (typeof data.fuelReloadTime === 'number') {
      building.fuelReloadTime = data.fuelReloadTime
    }
  }

  if (typeof data.maxAmmo === 'number') {
    building.maxAmmo = data.maxAmmo
    building.ammo = data.maxAmmo
    if (typeof data.ammoReloadTime === 'number') {
      building.ammoReloadTime = data.ammoReloadTime
    }
  }

  // Initialize rally point for vehicle factories and workshops
  if (type === 'vehicleFactory' || type === 'vehicleWorkshop' || type === 'airstrip') {
    building.rallyPoint = null
  }

  // Initialize service radius for support buildings
  ensureServiceRadius(building)

  // Initialize smoke emission trackers and cache scale factors for buildings with smoke spots
  if (data.smokeSpots?.length > 0) {
    // Initialize smoke emission trackers for each spot
    building.smokeEmissionTrackers = data.smokeSpots.map(() => ({
      lastEmissionTime: 0,
      emissionStage: 0
    }))
    // Cache smoke scale factors (this will be computed once when image is available)
    cacheBuildingSmokeScales(building, data)
  }

  // Add combat properties for defensive buildings (including teslaCoil)
  if (type === 'rocketTurret' || type.startsWith('turretGun') || type === 'teslaCoil' || type === 'artilleryTurret') {
    building.fireRange = data.fireRange
    building.minFireRange = data.minFireRange || 0
    building.fireCooldown = data.fireCooldown
    building.damage = data.damage
    building.armor = data.armor || 1
    building.projectileType = data.projectileType
    building.projectileSpeed = data.projectileSpeed
    building.lastShotTime = 0

    // Set initial turret direction towards nearest enemy base for defensive buildings
    if (data.fireRange && (building.type.startsWith('turretGun') || building.type === 'rocketTurret' || building.type === 'artilleryTurret')) {
      building.turretDirection = calculateInitialTurretDirection(building.x, building.y, building.owner)
    } else {
      building.turretDirection = 0 // Direction the turret is facing
    }

    building.targetDirection = 0 // Direction the turret should face
    if (data.isTeslaCoil) {
      building.isTeslaCoil = true
      building.teslaState = 'idle'
      building.teslaChargeStartTime = 0
      building.teslaFireStartTime = 0
    }
    if (building.type === 'artilleryTurret') {
      building.isArtillery = true
    }
    building.holdFire = false
    building.forcedAttackTarget = null
    // Add burst fire capabilities
    if (data.burstFire) {
      building.burstFire = true
      building.burstCount = data.burstCount || 3
      building.burstDelay = data.burstDelay || 150
      building.currentBurst = 0
      building.lastBurstTime = 0
    }
  }

  return building
}

/**
 * Calculate initial turret direction towards the nearest enemy base
 * @param {number} buildingX - Building X position in tiles
 * @param {number} buildingY - Building Y position in tiles
 * @param {string} owner - Building owner ('player' or enemy player ID)
 * @returns {number} Angle in radians pointing towards nearest enemy base
 */
function calculateInitialTurretDirection(buildingX, buildingY, owner) {
  const buildingCenterX = buildingX + 0.5 // Center of building tile
  const buildingCenterY = buildingY + 0.5

  let nearestEnemyDistance = Infinity
  let targetDirection = 0

  // Check all player positions for enemies
  Object.entries(PLAYER_POSITIONS).forEach(([playerId, position]) => {
    // Skip if this is the same owner
    if (playerId === owner || (owner === 'player' && playerId === 'player1')) {
      return
    }

    // For human player, all other players are enemies
    // For AI players, human player is the enemy
    const isEnemy = (owner === 'player' && playerId !== 'player1') ||
                   (owner !== 'player' && playerId === 'player1')

    if (isEnemy) {
      const enemyX = position.x * MAP_TILES_X
      const enemyY = position.y * MAP_TILES_Y
      const distance = Math.hypot(enemyX - buildingCenterX, enemyY - buildingCenterY)

      if (distance < nearestEnemyDistance) {
        nearestEnemyDistance = distance
        targetDirection = Math.atan2(enemyY - buildingCenterY, enemyX - buildingCenterX)
      }
    }
  })

  return targetDirection
}

// Place building in the map grid
export function placeBuilding(building, mapGrid, occupancyMap = gameState.occupancyMap, options = {}) {
  // Create an array to store original tile types
  building.originalTiles = []

  for (let y = building.y; y < building.y + building.height; y++) {
    building.originalTiles[y - building.y] = []

    for (let x = building.x; x < building.x + building.width; x++) {
      // Store the original tile type before changing it
      building.originalTiles[y - building.y][x - building.x] = mapGrid[y][x].type

      // Mark tile as having a building (for collision detection) but preserve the original tile type for rendering
      mapGrid[y][x].building = building
      const localX = x - building.x
      const localY = y - building.y
      const isStreetTile = building.type === 'street'
      const isAirstripPassableTile =
        building.type === 'airstrip' &&
        !isAirstripBlockedLocalTile(localX, localY, building.width, building.height)
      const isBuildOnlyTile = isStreetTile || isAirstripPassableTile

      if (isBuildOnlyTile) {
        mapGrid[y][x].buildOnlyOccupied = (mapGrid[y][x].buildOnlyOccupied || 0) + 1
      } else if (occupancyMap && occupancyMap[y] && occupancyMap[y][x] !== undefined) {
        occupancyMap[y][x] = (occupancyMap[y][x] || 0) + 1
      }

      // Remove any ore from tiles where buildings are placed
      if (mapGrid[y][x].ore) {
        mapGrid[y][x].ore = false
        // Clear any cached texture variations for this tile to force re-render
        mapGrid[y][x].textureVariation = null
      }

      if (isStreetTile) {
        mapGrid[y][x].type = 'street'
      }

      if (isAirstripPassableTile) {
        mapGrid[y][x].airstripStreet = true
      }

      // DON'T change the tile type - keep the original background texture visible
      // mapGrid[y][x].type = 'building' // REMOVED: This was causing solid color rendering
    }
  }

  // Reserve tiles around certain buildings for pathing but keep them passable
  const addNoBuild = (x, y) => {
    if (!mapGrid[y] || !mapGrid[y][x]) return
    mapGrid[y][x].noBuild = (mapGrid[y][x].noBuild || 0) + 1
  }

  if (building.type === 'vehicleFactory' || building.type === 'oreRefinery' || building.type === 'vehicleWorkshop') {
    const belowY = building.y + building.height
    if (belowY < mapGrid.length) {
      for (let x = building.x; x < building.x + building.width; x++) {
        addNoBuild(x, belowY)
      }
    }

    // For vehicle workshop, also reserve an additional row for waiting area
    if (building.type === 'vehicleWorkshop') {
      const waitingY = building.y + building.height + 1
      if (waitingY < mapGrid.length) {
        for (let x = building.x; x < building.x + building.width; x++) {
          addNoBuild(x, waitingY)
        }
      }
    }
  }

  if (building.type === 'oreRefinery') {
    for (let y = building.y - 1; y <= building.y + building.height; y++) {
      for (let x = building.x - 1; x <= building.x + building.width; x++) {
        if (y >= 0 && x >= 0 && y < mapGrid.length && x < mapGrid[0].length) {
          if (x < building.x || x >= building.x + building.width ||
              y < building.y || y >= building.y + building.height) {
            addNoBuild(x, y)
          }
        }
      }
    }
  }

  if (options.recordTransition !== false && gameState.gameStarted && !gameState.mapEditMode) {
    recordBuildingStarted({
      building,
      tick: gameState.frameCount,
      timeSeconds: gameState.gameTime
    })
  }
}

// Remove building from the map grid: restore original tiles and clear building flag
export function clearBuildingFromMapGrid(building, mapGrid, occupancyMap = gameState.occupancyMap) {
  const changedTiles = [] // Track tiles that had type changes for SOT mask update

  for (let y = building.y; y < building.y + building.height; y++) {
    for (let x = building.x; x < building.x + building.width; x++) {
      if (mapGrid[y] && mapGrid[y][x]) {
        // Restore the original tile type if it was saved, otherwise default to 'land'
        if (building.originalTiles &&
            building.originalTiles[y - building.y] &&
            building.originalTiles[y - building.y][x - building.x]) {
          mapGrid[y][x].type = building.originalTiles[y - building.y][x - building.x]
        } else {
          mapGrid[y][x].type = 'land'
          // Make sure ore property exists when restoring tiles
          if (mapGrid[y][x].ore === undefined) {
            mapGrid[y][x].ore = false
          }
        }
        changedTiles.push({ x, y })
        // Clear any building reference to unblock this tile for pathfinding
        delete mapGrid[y][x].building
        if (mapGrid[y][x].airstripStreet) {
          delete mapGrid[y][x].airstripStreet
        }
        const localX = x - building.x
        const localY = y - building.y
        const isStreetTile = building.type === 'street'
        const isAirstripPassableTile =
          building.type === 'airstrip' &&
          !isAirstripBlockedLocalTile(localX, localY, building.width, building.height)
        const isBuildOnlyTile = isStreetTile || isAirstripPassableTile

        if (isBuildOnlyTile) {
          mapGrid[y][x].buildOnlyOccupied = Math.max(0, (mapGrid[y][x].buildOnlyOccupied || 0) - 1)
          if (mapGrid[y][x].buildOnlyOccupied <= 0) {
            delete mapGrid[y][x].buildOnlyOccupied
          }
        } else if (occupancyMap && occupancyMap[y] && occupancyMap[y][x] !== undefined) {
          occupancyMap[y][x] = Math.max(0, (occupancyMap[y][x] || 0) - 1)
        }
      }
    }
  }

  const removeNoBuild = (x, y) => {
    if (mapGrid[y] && mapGrid[y][x] && mapGrid[y][x].noBuild) {
      mapGrid[y][x].noBuild--
      if (mapGrid[y][x].noBuild <= 0) {
        delete mapGrid[y][x].noBuild
      }
    }
  }

  if (building.type === 'vehicleFactory' || building.type === 'oreRefinery' || building.type === 'vehicleWorkshop') {
    const belowY = building.y + building.height
    if (belowY < mapGrid.length) {
      for (let x = building.x; x < building.x + building.width; x++) {
        removeNoBuild(x, belowY)
      }
    }

    // For vehicle workshop, also clean up the waiting area
    if (building.type === 'vehicleWorkshop') {
      const waitingY = building.y + building.height + 1
      if (waitingY < mapGrid.length) {
        for (let x = building.x; x < building.x + building.width; x++) {
          removeNoBuild(x, waitingY)
        }
      }
    }
  }

  if (building.type === 'oreRefinery') {
    for (let y = building.y - 1; y <= building.y + building.height; y++) {
      for (let x = building.x - 1; x <= building.x + building.width; x++) {
        if (y >= 0 && x >= 0 && y < mapGrid.length && x < mapGrid[0].length) {
          if (x < building.x || x >= building.x + building.width ||
              y < building.y || y >= building.y + building.height) {
            removeNoBuild(x, y)
          }
        }
      }
    }
  }

  // Update SOT mask for all changed tiles (batched for efficiency)
  if (changedTiles.length > 0) {
    const mapRenderer = getMapRenderer()
    if (mapRenderer && mapRenderer.sotMask) {
      changedTiles.forEach(({ x, y }) => {
        mapRenderer.updateSOTMaskForTile(mapGrid, x, y)
      })
    }
  }
}

// Update the game's power supply
export function updatePowerSupply(buildings, gameState) {
  const prevPlayerPower = gameState.playerPowerSupply || 0
  const prevEnemyPower = gameState.enemyPowerSupply || 0

  // Player power calculation
  let playerTotalPower = 0
  let playerTotalProduction = 0
  let playerTotalConsumption = 0

  // Enemy power calculation
  let enemyTotalPower = 0
  let enemyTotalProduction = 0
  let enemyTotalConsumption = 0

  // Track if player has a radar station
  let playerHasRadarStation = false

  // Add main factory power supply (+50) for each player if their factory is alive
  if (gameState.factories) {
    gameState.factories.forEach(factory => {
      if (factory.health > 0) {
        const factoryPower = buildingData.constructionYard.power // Use the building data value (+50)
        if (factory.owner === gameState.humanPlayer) {
          playerTotalPower += factoryPower
          playerTotalProduction += factoryPower
        } else if (factory.owner !== gameState.humanPlayer) {
          enemyTotalPower += factoryPower
          enemyTotalProduction += factoryPower
        }
      }
    })
  }

  buildings.forEach(building => {
    // Skip buildings with no owner
    if (!building.owner) return

    const buildingPower = Number.isFinite(building.power) ? building.power : 0

    if (building.owner === gameState.humanPlayer) {
      playerTotalPower += buildingPower

      // Track production and consumption separately
      if (buildingPower > 0) {
        playerTotalProduction += buildingPower
      } else if (buildingPower < 0) {
        playerTotalConsumption += Math.abs(buildingPower)
      }

      // Check if player has a radar station
      if (building.type === 'radarStation' && building.health > 0) {
        playerHasRadarStation = true
      }
    } else if (building.owner !== gameState.humanPlayer) {
      // For now, aggregate all non-human players as "enemy" for power tracking
      enemyTotalPower += buildingPower

      // Track production and consumption separately
      if (buildingPower > 0) {
        enemyTotalProduction += buildingPower
      } else if (buildingPower < 0) {
        enemyTotalConsumption += Math.abs(buildingPower)
      }
    }
  })

  // Store values in gameState
  gameState.playerPowerSupply = playerTotalPower
  gameState.playerTotalPowerProduction = playerTotalProduction
  gameState.playerPowerConsumption = playerTotalConsumption

  gameState.enemyPowerSupply = enemyTotalPower
  gameState.enemyTotalPowerProduction = enemyTotalProduction
  gameState.enemyPowerConsumption = enemyTotalConsumption

  const playerCross = (prevPlayerPower >= 0 && playerTotalPower < 0) || (prevPlayerPower < 0 && playerTotalPower >= 0)
  const enemyCross = (prevEnemyPower >= 0 && enemyTotalPower < 0) || (prevEnemyPower < 0 && enemyTotalPower >= 0)

  if (playerCross || enemyCross) {
    updateDangerZoneMaps(gameState)
  }

  // Calculate energy percentage for UI display
  // Calculate energy percentage for informational purposes
  if (playerTotalProduction > 0) {
    Math.max(0, 100 - (playerTotalConsumption / playerTotalProduction) * 100)
  } else if (playerTotalConsumption > 0) {
    // If no production but consumption exists
    0
  }

  // Calculate production speed penalty when power is negative
  if (playerTotalPower < 0) {
    // New formula: scale production by (production capacity / consumption)
    if (playerTotalConsumption > 0) {
      gameState.playerBuildSpeedModifier =
        playerTotalProduction / playerTotalConsumption
    } else {
      // Shouldn't happen when power is negative, but guard against divide by zero
      gameState.playerBuildSpeedModifier = 0
    }

    // Enable low energy mode
    gameState.lowEnergyMode = true

    // Disable radar when power is negative, even if radar station exists
    gameState.radarActive = false
  } else {
    // Normal speed when power is positive
    gameState.playerBuildSpeedModifier = 1.0
    gameState.lowEnergyMode = false

    // Radar is active only if player has a radar station and power is positive
    gameState.radarActive = playerHasRadarStation
  }

  // Calculate enemy speed penalty when power is negative
  if (enemyTotalPower < 0) {
    if (enemyTotalConsumption > 0) {
      gameState.enemyBuildSpeedModifier =
        enemyTotalProduction / enemyTotalConsumption
    } else {
      gameState.enemyBuildSpeedModifier = 0
    }
  } else {
    gameState.enemyBuildSpeedModifier = 1.0
  }

  // For backward compatibility
  gameState.powerSupply = playerTotalPower
  gameState.totalPowerProduction = playerTotalProduction
  gameState.powerConsumption = playerTotalConsumption

  return playerTotalPower
}

// Calculate the repair cost for a building
export function calculateRepairCost(building) {
  // Get the original cost of the building
  const type = building.type
  const originalCost = buildingData[type].cost

  // Calculate the percentage of damage
  const damagePercent = 1 - (building.health / building.maxHealth)

  // Formula: repair cost = damage percentage * original cost * 0.3
  const repairCost = Math.ceil(damagePercent * originalCost * 0.3)

  return repairCost
}

function isPlayerOwnedBuilding(building) {
  if (!building) return true
  const owner = building.owner
  const humanPlayer = gameState.humanPlayer || 'player1'
  if (!owner) return true
  if (owner === humanPlayer) return true
  // Older saves may still mark the human player as 'player'
  if (owner === 'player' && humanPlayer === 'player1') return true
  return false
}

function getBudgetControllerForBuilding(building) {
  if (!building) return null

  if (isPlayerOwnedBuilding(building)) {
    return {
      type: 'player',
      available: () => gameState.money || 0,
      hasFunds: amount => (gameState.money || 0) >= amount,
      spend: amount => {
        gameState.money = Math.max(0, (gameState.money || 0) - amount)
      }
    }
  }

  const ownerId = building.owner
  if (!ownerId) return null

  const ownerFactory = (gameState.factories || []).find(factory => {
    if (!factory) return false
    if (factory.owner === ownerId || factory.id === ownerId) {
      return factory.health > 0
    }
    return false
  })

  if (ownerFactory && typeof ownerFactory.budget === 'number') {
    return {
      type: 'ai',
      factory: ownerFactory,
      available: () => ownerFactory.budget,
      hasFunds: amount => ownerFactory.budget >= amount,
      spend: amount => {
        ownerFactory.budget = Math.max(0, ownerFactory.budget - amount)
      }
    }
  }

  return null
}

// Repair a building to full health
export function repairBuilding(building, gameState) {
  if (building.type === 'concreteWall') {
    return { success: false, message: 'Concrete walls cannot be repaired' }
  }
  // Only repair if building is damaged
  if (building.health >= building.maxHealth) {
    return { success: false, message: 'Building already at full health' }
  }

  // Calculate repair cost
  const repairCost = calculateRepairCost(building)

  // Setup gradual repair
  if (!gameState.buildingsUnderRepair) {
    gameState.buildingsUnderRepair = []
  }

  const healthToRepair = building.maxHealth - building.health

  // Repair time is 2x of build time
  // Estimate build time based on building cost (500 cost = 1 second base duration)
  const baseDuration = 1000 // 1 second base
  const buildingCost = buildingData[building.type].cost
  const buildDuration = baseDuration * (buildingCost / 500)
  const repairDuration = buildDuration * 2.0 // 2x build time

  gameState.buildingsUnderRepair.push({
    building: building,
    startTime: performance.now(),
    duration: repairDuration,
    startHealth: building.health,
    targetHealth: building.maxHealth,
    healthToRepair: healthToRepair,
    cost: repairCost,
    costPaid: 0
  })
  return { success: true, message: 'Building repair started', cost: repairCost }
}

// Function to mark a building for repair pausing (deferred processing)
export function markBuildingForRepairPause(building) {
  // Simply mark the building - actual pausing will happen in update cycle
  if (building) {
    building.needsRepairPause = true
    building.lastAttackedTime = performance.now()
  }
}

// Function to pause active repair when a building is attacked
export function pauseActiveRepair(_building) {
  // TEMPORARILY DISABLED - CAUSING INFINITE EXPLOSION BUG
  return false
}

// Update buildings that are currently under repair
export const updateBuildingsUnderRepair = logPerformance(function updateBuildingsUnderRepair(gameState, currentTime) {
  if (!gameState.buildingsUnderRepair || gameState.buildingsUnderRepair.length === 0) {
    return
  }

  // First, process any buildings marked for repair pause
  processPendingRepairPauses(gameState, currentTime)

  for (let i = gameState.buildingsUnderRepair.length - 1; i >= 0; i--) {
    const repairInfo = gameState.buildingsUnderRepair[i]
    const building = repairInfo.building
    const budgetController = getBudgetControllerForBuilding(building)
    const isPlayerBuilding = isPlayerOwnedBuilding(building)
    let progress = (currentTime - repairInfo.startTime) / repairInfo.duration

    if (repairInfo.paused) {
      const availableFunds = budgetController ? budgetController.available() : 0
      if (availableFunds > 0) {
        repairInfo.startTime = currentTime - progress * repairInfo.duration
        repairInfo.paused = false
      } else {
        repairInfo.startTime = currentTime - progress * repairInfo.duration
        continue
      }
    }

    progress = (currentTime - repairInfo.startTime) / repairInfo.duration

    const expectedPaid = Math.min(progress, 1) * repairInfo.cost
    const deltaCost = expectedPaid - repairInfo.costPaid
    if (deltaCost > 0) {
      if (budgetController && budgetController.hasFunds(deltaCost)) {
        budgetController.spend(deltaCost)
        repairInfo.costPaid += deltaCost
      } else {
        repairInfo.paused = true
        repairInfo.startTime = currentTime - progress * repairInfo.duration
        if (isPlayerBuilding) {
          playSound('repairPaused', 1.0, 0, true)
          showNotification('Repair paused: not enough money.')
        }
        continue
      }
    }

    if (progress >= 1.0) {
      repairInfo.building.health = repairInfo.targetHealth
      gameState.buildingsUnderRepair.splice(i, 1)
      if (isPlayerBuilding) {
        playSound('repairFinished', 1.0, 0, true)
      }
    } else {
      const newHealth = repairInfo.startHealth + (repairInfo.healthToRepair * progress)
      repairInfo.building.health = newHealth
    }
  }
})

// Process buildings marked for repair pause (safe deferred processing)
function processPendingRepairPauses(gameState, currentTime) {
  if (!gameState.buildingsUnderRepair) return

  // Collect buildings that need repair pause
  const buildingsToProcess = []

  // Check all buildings under repair for pause marks
  gameState.buildingsUnderRepair.forEach(repairInfo => {
    if (repairInfo.building.needsRepairPause) {
      buildingsToProcess.push(repairInfo.building)
    }
  })

  // Process pause requests safely
  buildingsToProcess.forEach(building => {
    actuallyPauseRepair(building, gameState, currentTime)
    delete building.needsRepairPause // Clear the mark
  })
}

// Actually pause the repair (safe version)
function actuallyPauseRepair(building, gameState, currentTime) {
  if (!gameState.buildingsUnderRepair) return

  // Find the repair entry for this building
  let repairIndex = -1
  let activeRepair = null

  for (let i = 0; i < gameState.buildingsUnderRepair.length; i++) {
    if (gameState.buildingsUnderRepair[i].building === building) {
      activeRepair = gameState.buildingsUnderRepair[i]
      repairIndex = i
      break
    }
  }

  if (activeRepair && repairIndex !== -1) {
    // Calculate remaining work
    const healthRepaired = Math.max(0, building.health - activeRepair.startHealth)
    const remainingHealthToRepair = Math.max(0, activeRepair.healthToRepair - healthRepaired)
    const remainingCost = Math.max(0, activeRepair.cost - activeRepair.costPaid)

    // Remove from active repairs
    gameState.buildingsUnderRepair.splice(repairIndex, 1)

    // Add to awaiting repairs if there's work remaining
    if (remainingHealthToRepair > 1 && remainingCost > 1) {
      if (!gameState.buildingsAwaitingRepair) {
        gameState.buildingsAwaitingRepair = []
      }

      // Check for duplicates
      const alreadyAwaiting = gameState.buildingsAwaitingRepair.some(ar => ar.building === building)
      if (!alreadyAwaiting) {
        const isFactory = (building.id !== undefined && building.type === undefined)

        gameState.buildingsAwaitingRepair.push({
          building: building,
          repairCost: remainingCost,
          healthToRepair: remainingHealthToRepair,
          lastAttackedTime: building.lastAttackedTime || currentTime,
          isFactory: isFactory,
          factoryCost: isFactory ? 5000 : undefined,
          initiatedByAI: !isPlayerOwnedBuilding(building)
        })

        if (isPlayerOwnedBuilding(building)) {
          playSound('repairPaused', 1.0, 0, true)
          showNotification('Repair paused due to attack!')
        }
      }
    }
  }
}

// Update buildings that are awaiting repair (under attack cooldown)
export const updateBuildingsAwaitingRepair = logPerformance(function updateBuildingsAwaitingRepair(gameState, currentTime) {
  if (!gameState.buildingsAwaitingRepair || gameState.buildingsAwaitingRepair.length === 0) {
    return
  }

  for (let i = gameState.buildingsAwaitingRepair.length - 1; i >= 0; i--) {
    const awaitingRepair = gameState.buildingsAwaitingRepair[i]
    const building = awaitingRepair.building

    if (building.type === 'concreteWall') {
      gameState.buildingsAwaitingRepair.splice(i, 1)
      continue
    }

    // Check if building was attacked more recently than when we started waiting
    // This resets the countdown if the building gets attacked again
    if (building.lastAttackedTime && building.lastAttackedTime > awaitingRepair.lastAttackedTime) {
      // Building was attacked again - reset the countdown
      awaitingRepair.lastAttackedTime = building.lastAttackedTime
      if (!awaitingRepair.initiatedByAI && isPlayerOwnedBuilding(building)) {
        playSound('Repair_impossible_when_under_attack', 1.0, 30, true)
        showNotification('Repair countdown reset - building under attack!')
      }
    }

    const timeSinceLastAttack = (currentTime - awaitingRepair.lastAttackedTime) / 1000

    // Store countdown info for rendering
    awaitingRepair.remainingCooldown = Math.max(0, 10 - timeSinceLastAttack)

    if (timeSinceLastAttack >= 10) {
      // Cooldown complete - start the repair automatically
      const building = awaitingRepair.building

      // Check if building is still damaged
      if (building.health < building.maxHealth) {
        if (awaitingRepair.isFactory) {
          // Start factory repair
          if (!gameState.buildingsUnderRepair) {
            gameState.buildingsUnderRepair = []
          }

          const baseDuration = 1000
          const buildDuration = baseDuration * (awaitingRepair.factoryCost / 500)
          const repairDuration = buildDuration * 2.0

          gameState.buildingsUnderRepair.push({
            building: building,
            startTime: currentTime,
            duration: repairDuration,
            startHealth: building.health,
            targetHealth: building.maxHealth,
            healthToRepair: awaitingRepair.healthToRepair,
            cost: awaitingRepair.repairCost,
            costPaid: 0
          })

          if (!awaitingRepair.initiatedByAI && isPlayerOwnedBuilding(building)) {
            showNotification(`Factory repair started for $${awaitingRepair.repairCost}`)
            playSound('repairStarted', 1.0, 0, true)
          }
        } else {
          // Start building repair manually (don't use repairBuilding as it starts immediately)
          if (!gameState.buildingsUnderRepair) {
            gameState.buildingsUnderRepair = []
          }

          // Repair time is 2x of build time
          const baseDuration = 1000
          const buildingCost = buildingData[building.type].cost
          const buildDuration = baseDuration * (buildingCost / 500)
          const repairDuration = buildDuration * 2.0

          gameState.buildingsUnderRepair.push({
            building: building,
            startTime: currentTime,
            duration: repairDuration,
            startHealth: building.health,
            targetHealth: building.maxHealth,
            healthToRepair: awaitingRepair.healthToRepair,
            cost: awaitingRepair.repairCost,
            costPaid: 0
          })

          if (!awaitingRepair.initiatedByAI && isPlayerOwnedBuilding(building)) {
            showNotification(`Building repair started for $${awaitingRepair.repairCost}`)
            playSound('repairStarted', 1.0, 0, true)
          }
        }
      }

      // Remove from awaiting list
      gameState.buildingsAwaitingRepair.splice(i, 1)
    }
  }
})
