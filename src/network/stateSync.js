/**
 * Game State Synchronization Module
 * Handles state snapshots, interpolation, and synchronization between host and clients
 * Extracted from gameCommandSync.js for better modularity
 */

import { gameState } from '../gameState.js'
import { placeBuilding } from '../buildings.js'
import { units as mainUnits, bullets as mainBullets, factories as mainFactories, regenerateMapForClient } from '../main.js'
import { setMapDimensions, ORE_SPREAD_ENABLED, setOreSpreadEnabled } from '../config.js'
import { broadcastGameCommand } from './commandBroadcast.js'

// Re-export COMMAND_TYPES for convenience (will need to import from gameCommandSync or define here)
// For now, we'll assume it's imported where needed

// Interval for game state snapshots (ms) - 100ms for smoother movement sync
const GAME_STATE_SYNC_INTERVAL_MS = 100

// Handle for periodic state sync
let stateSyncHandle = null

// Track if client has been initialized (first snapshot received)
let clientInitialized = false

// Store the client's partyId (for remote clients)
let clientPartyId = null

// Track if tech tree needs to be synced (after first buildings sync)
let needsTechTreeSync = true

// Track if map has been synced from host (for client map regeneration)
let mapSynced = false

// Reference to production controller for tech tree sync
let productionControllerRef = null

// ============ INTERPOLATION STATE ============
// Track unit positions for smooth interpolation between snapshots
const unitInterpolationState = new Map() // unitId -> { prevX, prevY, targetX, targetY, prevDir, targetDir, startTime }
// Track bullet positions for smooth interpolation between snapshots
const bulletInterpolationState = new Map() // bulletId -> { prevX, prevY, targetX, targetY }
let lastSnapshotTime = 0
const INTERPOLATION_DURATION_MS = GAME_STATE_SYNC_INTERVAL_MS // Match the sync interval

/**
 * Set reference to production controller for tech tree sync
 * @param {Object} controller - Production controller instance
 */
export function setProductionControllerRef(controller) {
  productionControllerRef = controller
}

/**
 * Request tech tree sync after buildings are synced from host
 */
function requestTechTreeSync() {
  if (productionControllerRef && typeof productionControllerRef.syncTechTreeWithBuildings === 'function') {
    // Delay slightly to ensure all buildings are fully initialized
    setTimeout(() => {
      productionControllerRef.syncTechTreeWithBuildings()
      window.logger('[GameCommandSync] Tech tree synced with existing buildings')
    }, 100)
  }
}

/**
 * Update unit and bullet interpolation for smooth movement between snapshots (client only)
 * Call this every frame from the game loop
 */
export function updateUnitInterpolation() {
  if (isHost()) {
    return // Host doesn't need interpolation - it has the authoritative state
  }

  const now = performance.now()
  const elapsed = now - lastSnapshotTime
  const t = Math.min(1, elapsed / INTERPOLATION_DURATION_MS) // Clamp to 0-1

  // Interpolate each unit's position
  mainUnits.forEach(unit => {
    const state = unitInterpolationState.get(unit.id)
    if (!state) {
      return // No interpolation state for this unit
    }

    // Linear interpolation for position
    unit.x = state.prevX + (state.targetX - state.prevX) * t
    unit.y = state.prevY + (state.targetY - state.prevY) * t

    // Update tile position based on interpolated position
    unit.tileX = Math.floor(unit.x / 32) // TILE_SIZE = 32
    unit.tileY = Math.floor(unit.y / 32)

    // Interpolate direction (handle wraparound for angles)
    if (state.targetDir !== undefined && state.prevDir !== undefined) {
      let diff = state.targetDir - state.prevDir
      // Handle wraparound (angles go from 0 to 2*PI)
      if (diff > Math.PI) diff -= Math.PI * 2
      if (diff < -Math.PI) diff += Math.PI * 2
      unit.direction = state.prevDir + diff * t
    }

    // Interpolate turret direction if present
    if (state.targetTurretDir !== undefined && state.prevTurretDir !== undefined) {
      let diff = state.targetTurretDir - state.prevTurretDir
      if (diff > Math.PI) diff -= Math.PI * 2
      if (diff < -Math.PI) diff += Math.PI * 2
      unit.turretDirection = state.prevTurretDir + diff * t
    }
  })

  // Interpolate each bullet's position
  mainBullets.forEach(bullet => {
    const state = bulletInterpolationState.get(bullet.id)
    if (!state) {
      return // No interpolation state for this bullet
    }

    // Linear interpolation for position
    bullet.x = state.prevX + (state.targetX - state.prevX) * t
    bullet.y = state.prevY + (state.targetY - state.prevY) * t
  })
}

/**
 * Set the client's party ID (called when remote client connects)
 * @param {string} partyId - The partyId this client controls
 */
export function setClientPartyId(partyId) {
  clientPartyId = partyId
  clientInitialized = false // Reset initialization flag for new connection
  needsTechTreeSync = true // Reset tech tree sync flag for new connection
}

/**
 * Get the client's party ID
 * @returns {string|null}
 */
export function getClientPartyId() {
  return clientPartyId
}

/**
 * Reset client state (called on disconnect)
 */
export function resetClientState() {
  clientPartyId = null
  clientInitialized = false
  needsTechTreeSync = true
  mapSynced = false
}

/**
 * Check if the current session is the host
 * @returns {boolean}
 */
function isHost() {
  return gameState.multiplayerSession?.localRole === 'host' || !gameState.multiplayerSession?.isRemote
}

/**
 * Check if a remote session is connected
 * @returns {boolean}
 */
function hasActiveRemoteSession() {
  const isRemote = Boolean(gameState.multiplayerSession?.isRemote)

  if (isHost()) {
    // Check if any party has connected peers
    if (!Array.isArray(gameState.partyStates)) {
      return false
    }
    for (const party of gameState.partyStates) {
      if (party.partyId === gameState.humanPlayer) {
        continue // Skip self
      }
      const monitor = getActiveHostMonitor(party.partyId)
      // Check if monitor has an active session (connected client)
      if (monitor && monitor.activeSession) {
        return true
      }
    }
    return false
  }

  return isRemote
}

function getPartyAuthoritativeMoney(partyId) {
  if (!partyId) {
    return 0
  }

  if (partyId === gameState.humanPlayer) {
    return Number.isFinite(gameState.money) ? gameState.money : 0
  }

  const ownerFactory = (mainFactories || []).find(factory => (factory.owner || factory.id) === partyId)
  if (!ownerFactory || !Number.isFinite(ownerFactory.budget)) {
    return 0
  }

  return ownerFactory.budget
}

function createPartyMoneySnapshot() {
  const partyMoney = {}

  const partyIds = Array.isArray(gameState.partyStates) && gameState.partyStates.length > 0
    ? gameState.partyStates.map(party => party.partyId)
    : []

  if (gameState.humanPlayer && !partyIds.includes(gameState.humanPlayer)) {
    partyIds.push(gameState.humanPlayer)
  }

  ;(mainFactories || []).forEach(factory => {
    const partyId = factory.owner || factory.id
    if (partyId && !partyIds.includes(partyId)) {
      partyIds.push(partyId)
    }
  })

  partyIds.forEach(partyId => {
    partyMoney[partyId] = getPartyAuthoritativeMoney(partyId)
  })

  return partyMoney
}

/**
 * Create a game state snapshot for synchronization
 * @returns {Object} Game state snapshot
 */
export function createGameStateSnapshot() {
  const now = performance.now()

  // Serialize units with essential properties - use mainUnits from main.js as that's the authoritative array
  const units = (mainUnits || []).map(unit => ({
    id: unit.id,
    type: unit.type,
    owner: unit.owner,
    x: unit.x,
    y: unit.y,
    tileX: unit.tileX,
    tileY: unit.tileY,
    health: unit.health,
    maxHealth: unit.maxHealth,
    direction: unit.direction,
    turretDirection: unit.turretDirection,
    target: unit.target ? { id: unit.target.id, x: unit.target.x, y: unit.target.y } : null,
    moveTarget: unit.moveTarget,
    gas: unit.gas,
    maxGas: unit.maxGas,
    ammunition: unit.ammunition,
    maxAmmunition: unit.maxAmmunition,
    oreCarried: unit.oreCarried,
    crew: unit.crew,
    // Animation/firing state - convert to elapsed time for cross-machine sync
    muzzleFlashElapsed: unit.muzzleFlashStartTime ? now - unit.muzzleFlashStartTime : null,
    recoilElapsed: unit.recoilStartTime ? now - unit.recoilStartTime : null,
    lastShotTime: unit.lastShotTime,
    // Movement state
    path: unit.path,
    pathIndex: unit.pathIndex,
    vx: unit.vx,
    vy: unit.vy,
    speed: unit.speed,
    // Combat state
    attackTarget: unit.attackTarget ? { id: unit.attackTarget.id } : null,
    guardPosition: unit.guardPosition,
    // Leveling/experience state
    level: unit.level,
    bountyCounter: unit.bountyCounter,
    baseCost: unit.baseCost,
    // Status effects
    isMoving: unit.isMoving,
    isAttacking: unit.isAttacking,
    remainingMines: unit.remainingMines,
    sweeping: unit.sweeping
  }))

  // Serialize buildings with essential properties
  const buildings = (gameState.buildings || []).map(building => {
    const constructionElapsed = typeof building.constructionStartTime === 'number'
      ? Math.max(0, now - building.constructionStartTime)
      : null
    const sellElapsed = typeof building.sellStartTime === 'number'
      ? Math.max(0, now - building.sellStartTime)
      : null
    return {
      id: building.id,
      type: building.type,
      owner: building.owner,
      x: building.x,
      y: building.y,
      width: building.width,
      height: building.height,
      health: building.health,
      maxHealth: building.maxHealth,
      constructionProgress: building.constructionProgress,
      constructionStartTime: building.constructionStartTime,
      constructionElapsed,
      constructionFinished: building.constructionFinished,
      isBeingBuilt: building.isBeingBuilt,
      isBeingSold: building.isBeingSold,
      sellStartTime: building.sellStartTime,
      sellElapsed,
      ammo: building.ammo,
      maxAmmo: building.maxAmmo,
      turretDirection: building.turretDirection,
      // Animation state - convert to elapsed time for cross-machine sync
      muzzleFlashElapsed: building.muzzleFlashStartTime ? now - building.muzzleFlashStartTime : null,
      recoilElapsed: building.recoilStartTime ? now - building.recoilStartTime : null
    }
  })

  // Serialize bullets/projectiles with full properties - use mainBullets from main.js as that's the authoritative array
  const bullets = (mainBullets || []).map(bullet => ({
    id: bullet.id,
    x: bullet.x,
    y: bullet.y,
    startX: bullet.startX,
    startY: bullet.startY,
    targetX: bullet.targetX,
    targetY: bullet.targetY,
    vx: bullet.vx,
    vy: bullet.vy,
    owner: bullet.owner,
    damage: bullet.damage,
    type: bullet.type,
    projectileType: bullet.projectileType,
    originType: bullet.originType,
    speed: bullet.speed,
    startTime: bullet.startTime,
    ballistic: bullet.ballistic,
    homing: bullet.homing,
    dx: bullet.dx,
    dy: bullet.dy,
    distance: bullet.distance,
    flightDuration: bullet.flightDuration,
    ballisticDuration: bullet.ballisticDuration,
    arcHeight: bullet.arcHeight
  }))

  // Serialize factories (construction yards) with essential properties
  const factories = (mainFactories || []).map(factory => ({
    id: factory.id,
    type: factory.type,
    owner: factory.owner,
    x: factory.x,
    y: factory.y,
    width: factory.width,
    height: factory.height,
    health: factory.health,
    maxHealth: factory.maxHealth,
    budget: factory.budget,
    rallyPoint: factory.rallyPoint,
    productionCountdown: factory.productionCountdown
  }))

  // Serialize explosions
  const explosions = (gameState.explosions || []).map(exp => ({
    x: exp.x,
    y: exp.y,
    startElapsed: typeof exp.startTime === 'number' ? Math.max(0, now - exp.startTime) : 0,
    duration: exp.duration,
    maxRadius: exp.maxRadius
  }))

  // Serialize unit wrecks
  const unitWrecks = (gameState.unitWrecks || []).map(wreck => ({
    id: wreck.id,
    sourceUnitId: wreck.sourceUnitId,
    unitType: wreck.unitType,
    x: wreck.x,
    y: wreck.y,
    tileX: wreck.tileX,
    tileY: wreck.tileY,
    direction: wreck.direction,
    turretDirection: wreck.turretDirection,
    createdAt: wreck.createdAt,
    owner: wreck.owner,
    health: wreck.health,
    maxHealth: wreck.maxHealth,
    spriteCacheKey: wreck.spriteCacheKey
  }))

  return {
    units,
    buildings,
    bullets,
    factories,
    explosions,
    unitWrecks,
    money: gameState.money,
    partyMoney: createPartyMoneySnapshot(),
    gamePaused: gameState.gamePaused,
    gameStarted: gameState.gameStarted,
    partyStates: gameState.partyStates,
    // Include map seed, dimensions, and player count so client can generate matching map
    mapSeed: gameState.mapSeed,
    mapTilesX: gameState.mapTilesX,
    mapTilesY: gameState.mapTilesY,
    playerCount: gameState.playerCount,
    mapOreFieldCount: gameState.mapOreFieldCount,
    // Game settings that clients must inherit from host
    oreSpreadEnabled: ORE_SPREAD_ENABLED,
    shadowOfWarEnabled: gameState.shadowOfWarEnabled,
    showEnemyResources: gameState.showEnemyResources,
    // Sync defeated players so clients can detect their own defeat
    defeatedPlayers: gameState.defeatedPlayers instanceof Set
      ? Array.from(gameState.defeatedPlayers)
      : (Array.isArray(gameState.defeatedPlayers) ? gameState.defeatedPlayers : []),
    timestamp: Date.now()
  }
}

/**
 * Sync the map from host (seed, dimensions, playerCount) and regenerate if needed
 * @param {string} seed - Map seed from host
 * @param {number} width - Map width in tiles
 * @param {number} height - Map height in tiles
 * @param {number} playerCount - Number of players from host
 * @param {number} mapOreFieldCount - Number of ore fields from host
 */
function syncClientMap(seed, width, height, playerCount, mapOreFieldCount) {
  if (!seed || !width || !height) {
    return false
  }

  // Only regenerate map once per connection
  if (mapSynced) {
    return true
  }

  window.logger('[GameCommandSync] Syncing map from host - seed:', seed, 'dimensions:', width, 'x', height, 'playerCount:', playerCount, 'mapOreFieldCount:', mapOreFieldCount)

  // Update map dimensions in config module
  setMapDimensions(width, height)

  // Store the host's map seed and player count BEFORE map generation
  // Player count affects road generation in gameSetup.js
  gameState.mapSeed = seed
  gameState.mapTilesX = width
  gameState.mapTilesY = height
  if (playerCount) {
    gameState.playerCount = playerCount
  }
  if (Number.isFinite(mapOreFieldCount)) {
    gameState.mapOreFieldCount = mapOreFieldCount
  }

  // Call main.js function to regenerate map with host's seed and generation settings
  if (typeof regenerateMapForClient === 'function') {
    regenerateMapForClient(seed, width, height, playerCount, mapOreFieldCount)
    window.logger('[GameCommandSync] Client map regenerated with host seed:', seed, 'playerCount:', playerCount, 'mapOreFieldCount:', mapOreFieldCount)
  } else {
    // Fallback: Initialize empty map grid if regenerateMapForClient is not available
    window.logger.warn('[GameCommandSync] regenerateMapForClient not available, creating empty map grid')
    gameState.mapGrid = []
    for (let y = 0; y < height; y++) {
      gameState.mapGrid[y] = []
      for (let x = 0; x < width; x++) {
        gameState.mapGrid[y][x] = { type: 'land', ore: false, seedCrystal: false, noBuild: 0 }
      }
    }
  }

  // Initialize occupancyMap
  if (!gameState.occupancyMap || gameState.occupancyMap.length !== height ||
      (gameState.occupancyMap[0] && gameState.occupancyMap[0].length !== width)) {
    window.logger('[GameCommandSync] Initializing client occupancyMap:', width, 'x', height)
    gameState.occupancyMap = []
    for (let y = 0; y < height; y++) {
      gameState.occupancyMap[y] = []
      for (let x = 0; x < width; x++) {
        gameState.occupancyMap[y][x] = 0
      }
    }
  }

  mapSynced = true
  return true
}

/**
 * Apply a game state snapshot received from the host
 * @param {Object} snapshot - The game state snapshot
 */
export function applyGameStateSnapshot(snapshot) {
  if (!snapshot || isHost()) {
    return
  }

  // On first snapshot, initialize client with their partyId
  if (!clientInitialized && clientPartyId) {
    gameState.humanPlayer = clientPartyId
    window.logger('[GameCommandSync] Client initialized as party:', clientPartyId)

    // Mark as initialized so we only do this once
    clientInitialized = true
  }

  // Get current time for animation timestamp conversions (used by units and buildings)
  const now = performance.now()

  // Remote clients are host-authoritative for economy and must adopt host party money.
  const localPartyId = clientPartyId || gameState.humanPlayer
  if (localPartyId && snapshot.partyMoney && typeof snapshot.partyMoney === 'object') {
    const syncedMoney = snapshot.partyMoney[localPartyId]
    if (Number.isFinite(syncedMoney)) {
      gameState.money = syncedMoney
    }
  }

  // Sync game pause state
  if (typeof snapshot.gamePaused === 'boolean') {
    gameState.gamePaused = snapshot.gamePaused
  }

  // Sync game started state
  if (typeof snapshot.gameStarted === 'boolean') {
    gameState.gameStarted = snapshot.gameStarted
  }

  // Sync party states
  if (Array.isArray(snapshot.partyStates)) {
    gameState.partyStates = snapshot.partyStates
  }

  // Sync map seed, dimensions, and player count from host, regenerate map if needed
  // This must happen before syncing buildings so placeBuilding can work
  if (snapshot.mapSeed && snapshot.mapTilesX && snapshot.mapTilesY) {
    syncClientMap(snapshot.mapSeed, snapshot.mapTilesX, snapshot.mapTilesY, snapshot.playerCount, snapshot.mapOreFieldCount)
  }

  // Sync game settings from host - clients cannot change these
  if (typeof snapshot.oreSpreadEnabled === 'boolean') {
    setOreSpreadEnabled(snapshot.oreSpreadEnabled)
    // Update the checkbox UI to reflect host's setting
    const oreCheckbox = document.getElementById('oreSpreadCheckbox')
    if (oreCheckbox) {
      oreCheckbox.checked = snapshot.oreSpreadEnabled
    }
  }
  if (typeof snapshot.shadowOfWarEnabled === 'boolean') {
    gameState.shadowOfWarEnabled = snapshot.shadowOfWarEnabled
    // Update the checkbox UI to reflect host's setting
    const shadowCheckbox = document.getElementById('shadowOfWarCheckbox')
    if (shadowCheckbox) {
      shadowCheckbox.checked = snapshot.shadowOfWarEnabled
    }
  }

  // Sync showEnemyResources setting from host
  if (typeof snapshot.showEnemyResources === 'boolean') {
    gameState.showEnemyResources = snapshot.showEnemyResources
  }

  // Sync defeated players from host - check if local player is in the defeated list
  if (Array.isArray(snapshot.defeatedPlayers)) {
    // Convert to Set
    gameState.defeatedPlayers = new Set(snapshot.defeatedPlayers)

    // Check if the local player (client's humanPlayer) was just defeated
    if (gameState.defeatedPlayers.has(gameState.humanPlayer) && !gameState.localPlayerDefeated && !gameState.isSpectator) {
      gameState.localPlayerDefeated = true
      gameState.gameResult = 'defeat'
      gameState.gameOverMessage = 'DEFEAT'
      gameState.losses++
      // Play defeat sound only once
      if (!gameState._defeatSoundPlayed) {
        gameState._defeatSoundPlayed = true
        // Import playSound dynamically to avoid circular dependency
        import('../sound.js').then(({ playSound }) => {
          playSound('battleLost', 1.0, 0, true)
        })
      }
    }
  }

  // Sync units - update the mainUnits array from main.js (which is what rendering uses)
  // This ensures all units from all parties are visible
  // Use interpolation for smooth movement between snapshots
  if (Array.isArray(snapshot.units)) {
    // Create a map of existing units by ID for merging non-serialized properties
    const existingById = new Map()
    mainUnits.forEach(u => {
      if (u.id) existingById.set(u.id, u)
    })

    // Track which unit IDs are in this snapshot (to clean up removed units from interpolation state)
    const snapshotUnitIds = new Set()

    // Build the updated units array, preserving local-only properties (like cached sprites)
    const updatedUnits = snapshot.units.map(snapshotUnit => {
      snapshotUnitIds.add(snapshotUnit.id)
      const existing = existingById.get(snapshotUnit.id)

      // Convert elapsed times back to absolute start times for animations
      // This allows animations to work correctly across machines with different performance.now() bases
      const muzzleFlashStartTime = snapshotUnit.muzzleFlashElapsed != null
        ? now - snapshotUnit.muzzleFlashElapsed
        : null
      const recoilStartTime = snapshotUnit.recoilElapsed != null
        ? now - snapshotUnit.recoilElapsed
        : null

      if (existing) {
        // Set up interpolation: store current position as prev, snapshot as target
        unitInterpolationState.set(snapshotUnit.id, {
          prevX: existing.x,
          prevY: existing.y,
          targetX: snapshotUnit.x,
          targetY: snapshotUnit.y,
          prevDir: existing.direction,
          targetDir: snapshotUnit.direction,
          prevTurretDir: existing.turretDirection,
          targetTurretDir: snapshotUnit.turretDirection
        })

        // Merge all snapshot data EXCEPT position (which we'll interpolate) and elapsed times (already converted)
        const { x, y, tileX, tileY, direction, turretDirection, muzzleFlashElapsed: _mfe, recoilElapsed: _re, ...nonPositionData } = snapshotUnit
        Object.assign(existing, nonPositionData)
        // Apply converted animation times
        existing.muzzleFlashStartTime = muzzleFlashStartTime
        existing.recoilStartTime = recoilStartTime
        // Store target position for when interpolation completes
        existing._targetX = x
        existing._targetY = y
        existing._targetTileX = tileX
        existing._targetTileY = tileY
        existing._targetDirection = direction
        existing._targetTurretDirection = turretDirection
        return existing
      } else {
        // New unit from host - no interpolation, just place it
        unitInterpolationState.set(snapshotUnit.id, {
          prevX: snapshotUnit.x,
          prevY: snapshotUnit.y,
          targetX: snapshotUnit.x,
          targetY: snapshotUnit.y,
          prevDir: snapshotUnit.direction,
          targetDir: snapshotUnit.direction,
          prevTurretDir: snapshotUnit.turretDirection,
          targetTurretDir: snapshotUnit.turretDirection
        })
        // Create new unit with converted animation times
        const { muzzleFlashElapsed: _mfe, recoilElapsed: _re, ...unitData } = snapshotUnit
        return {
          ...unitData,
          muzzleFlashStartTime,
          recoilStartTime
        }
      }
    })

    // Clean up interpolation state for units that no longer exist
    for (const unitId of unitInterpolationState.keys()) {
      if (!snapshotUnitIds.has(unitId)) {
        unitInterpolationState.delete(unitId)
      }
    }

    // Update snapshot time for interpolation
    lastSnapshotTime = now

    // Replace contents of mainUnits array in-place (so GameLoop reference stays valid)
    mainUnits.length = 0
    mainUnits.push(...updatedUnits)

    // Also keep gameState.units in sync
    gameState.units = mainUnits
  }

  // Sync buildings - replace entire array from host snapshot
  // This ensures all buildings (including new ones) are properly synced
  if (Array.isArray(snapshot.buildings)) {
    // Create a map of existing buildings by ID and position for merging non-serialized properties
    const existingByIdOrPos = new Map()
    ;(gameState.buildings || []).forEach(b => {
      const key = b.id || `${b.type}_${b.x}_${b.y}`
      existingByIdOrPos.set(key, b)
    })

    // Track new buildings for occupancy map update
    const newBuildings = []

    // Replace buildings array with snapshot data, preserving any local-only properties
    gameState.buildings = snapshot.buildings.map(snapshotBuilding => {
      const key = snapshotBuilding.id || `${snapshotBuilding.type}_${snapshotBuilding.x}_${snapshotBuilding.y}`
      const existing = existingByIdOrPos.get(key)

      // Convert elapsed times back to absolute start times for animations
      const muzzleFlashStartTime = snapshotBuilding.muzzleFlashElapsed != null
        ? now - snapshotBuilding.muzzleFlashElapsed
        : null
      const recoilStartTime = snapshotBuilding.recoilElapsed != null
        ? now - snapshotBuilding.recoilElapsed
        : null

      const constructionStartTime = snapshotBuilding.constructionElapsed != null
        ? now - snapshotBuilding.constructionElapsed
        : (snapshotBuilding.constructionStartTime ?? existing?.constructionStartTime ?? now)
      const sellStartTime = snapshotBuilding.sellElapsed != null
        ? now - snapshotBuilding.sellElapsed
        : (snapshotBuilding.sellStartTime ?? existing?.sellStartTime ?? null)

      if (existing) {
        // Merge snapshot data into existing building to preserve non-synced properties
        // But respect construction animation state from snapshot
        const { muzzleFlashElapsed: _mfe, recoilElapsed: _re, constructionElapsed: _ce, sellElapsed: _se, ...buildingData } = snapshotBuilding
        Object.assign(existing, buildingData)
        // Apply converted animation times
        existing.muzzleFlashStartTime = muzzleFlashStartTime
        existing.recoilStartTime = recoilStartTime
        existing.constructionStartTime = constructionStartTime
        existing.sellStartTime = sellStartTime
        return existing
      } else {
        // New building from host - use snapshot's construction state if available
        // Otherwise start construction animation
        const { muzzleFlashElapsed: _mfe2, recoilElapsed: _re2, constructionElapsed: _ce2, sellElapsed: _se2, ...buildingData } = snapshotBuilding
        const newBuilding = {
          ...buildingData,
          muzzleFlashStartTime,
          recoilStartTime,
          isBuilding: true,
          constructionFinished: snapshotBuilding.constructionFinished === true,
          constructionStartTime,
          sellStartTime
        }
        newBuildings.push(newBuilding)
        return newBuilding
      }
    })

    // Place new buildings in the map grid and occupancy map
    // Must check that mapGrid is properly initialized (not just truthy but has rows/columns)
    const mapGridReady = gameState.mapGrid && gameState.mapGrid.length > 0 &&
                         Array.isArray(gameState.mapGrid[0]) && gameState.mapGrid[0].length > 0
    if (newBuildings.length > 0 && mapGridReady) {
      window.logger('[GameCommandSync] Placing', newBuildings.length, 'new buildings in client mapGrid')
      newBuildings.forEach(building => {
        // Verify building position is within map bounds before placing
        if (building.y >= 0 && building.y + (building.height || 1) <= gameState.mapGrid.length &&
            building.x >= 0 && building.x + (building.width || 1) <= (gameState.mapGrid[0]?.length || 0)) {
          placeBuilding(building, gameState.mapGrid, gameState.occupancyMap, { recordTransition: false })
        } else {
          window.logger.warn('[GameCommandSync] Building outside map bounds:', building.type, 'at', building.x, building.y)
        }
      })

      // Trigger tech tree sync after buildings are added
      if (needsTechTreeSync) {
        needsTechTreeSync = false
        requestTechTreeSync()
      }
    } else if (newBuildings.length > 0) {
      window.logger.warn('[GameCommandSync] Cannot place buildings - mapGrid not ready. newBuildings:', newBuildings.length, 'mapGrid length:', gameState.mapGrid?.length)
    }
  }

  // Sync factories - update both gameState.factories and mainFactories from main.js
  if (Array.isArray(snapshot.factories)) {
    const existingFactories = gameState.factories || []
    const snapshotFactoryIds = new Set(snapshot.factories.map(f => f.id))

    // Remove factories that no longer exist
    gameState.factories = existingFactories.filter(f => snapshotFactoryIds.has(f.id))

    // Update or add factories
    snapshot.factories.forEach(snapshotFactory => {
      const existing = gameState.factories.find(f => f.id === snapshotFactory.id)
      if (existing) {
        // Update existing factory properties
        Object.assign(existing, snapshotFactory)
      } else {
        // Add new factory
        gameState.factories.push(snapshotFactory)
      }
    })

    // Also sync mainFactories array from main.js for compatibility
    mainFactories.length = 0
    mainFactories.push(...gameState.factories)
  }

  // Sync bullets - update the mainBullets array from main.js with interpolation
  if (Array.isArray(snapshot.bullets)) {
    // Create a map of existing bullets by ID
    const existingById = new Map()
    mainBullets.forEach(b => {
      if (b.id) existingById.set(b.id, b)
    })

    // Track which bullet IDs are in this snapshot
    const snapshotBulletIds = new Set()

    // Build the updated bullets array with interpolation
    const updatedBullets = snapshot.bullets.map(snapshotBullet => {
      snapshotBulletIds.add(snapshotBullet.id)
      const existing = existingById.get(snapshotBullet.id)

      if (existing) {
        // Set up interpolation for existing bullet
        bulletInterpolationState.set(snapshotBullet.id, {
          prevX: existing.x,
          prevY: existing.y,
          targetX: snapshotBullet.x,
          targetY: snapshotBullet.y
        })

        // Merge non-position data
        const { x, y, ...nonPositionData } = snapshotBullet
        Object.assign(existing, nonPositionData)
        existing._targetX = x
        existing._targetY = y
        return existing
      } else {
        // New bullet - no interpolation needed
        bulletInterpolationState.set(snapshotBullet.id, {
          prevX: snapshotBullet.x,
          prevY: snapshotBullet.y,
          targetX: snapshotBullet.x,
          targetY: snapshotBullet.y
        })
        return { ...snapshotBullet }
      }
    })

    // Clean up interpolation state for bullets that no longer exist
    for (const bulletId of bulletInterpolationState.keys()) {
      if (!snapshotBulletIds.has(bulletId)) {
        bulletInterpolationState.delete(bulletId)
      }
    }

    // Replace contents of mainBullets array in-place
    mainBullets.length = 0
    mainBullets.push(...updatedBullets)

    // Also keep gameState.bullets in sync
    gameState.bullets = mainBullets
  }

  // Sync explosions
  if (Array.isArray(snapshot.explosions)) {
    // Merge explosions - add new ones that don't exist locally
    const existingExplosions = gameState.explosions || []
    const existingKeys = new Set(existingExplosions.map(e => `${e.x}_${e.y}_${e.startTime}`))

    snapshot.explosions.forEach(exp => {
      const startTime = exp.startElapsed != null
        ? now - exp.startElapsed
        : (exp.startTime ?? now)
      const normalized = {
        ...exp,
        startTime,
        duration: exp.duration ?? 500
      }
      const key = `${normalized.x}_${normalized.y}_${Math.round(startTime)}`
      if (!existingKeys.has(key)) {
        existingExplosions.push(normalized)
        existingKeys.add(key)
      }
    })
    gameState.explosions = existingExplosions
  }

  // Sync unit wrecks
  if (Array.isArray(snapshot.unitWrecks)) {
    // Initialize if needed
    if (!gameState.unitWrecks) {
      gameState.unitWrecks = []
    }

    // Create a map of existing wrecks by ID
    const existingById = new Map()
    gameState.unitWrecks.forEach(w => {
      if (w.id) existingById.set(w.id, w)
    })

    // Sync wrecks from snapshot
    const updatedWrecks = snapshot.unitWrecks.map(snapshotWreck => {
      const existing = existingById.get(snapshotWreck.id)
      if (existing) {
        // Update existing wreck
        Object.assign(existing, snapshotWreck)
        return existing
      } else {
        // New wreck from host
        return { ...snapshotWreck }
      }
    })

    // Replace wrecks array
    gameState.unitWrecks = updatedWrecks
  }
}

/**
 * Create a client state update for the host
 * Only includes units and buildings owned by this client
 * @returns {Object}
 */
function createClientStateUpdate() {
  const now = performance.now()
  const partyId = gameState.humanPlayer

  // Only include units owned by this client - use mainUnits as that's authoritative
  const units = mainUnits
    .filter(u => u.owner === partyId)
    .map(unit => ({
      id: unit.id,
      x: unit.x,
      y: unit.y,
      health: unit.health,
      direction: unit.direction,
      turretDirection: unit.turretDirection,
      gas: unit.gas,
      ammunition: unit.ammunition,
      crew: unit.crew,
      muzzleFlashStartTime: unit.muzzleFlashStartTime,
      recoilStartTime: unit.recoilStartTime,
      target: unit.target ? { id: unit.target.id } : null,
      moveTarget: unit.moveTarget,
      path: unit.path,
      remainingMines: unit.remainingMines,
      sweeping: unit.sweeping
    }))

  // Only include buildings owned by this client
  const buildings = (gameState.buildings || [])
    .filter(b => b.owner === partyId)
    .map(building => ({
      id: building.id,
      health: building.health,
      constructionElapsed: typeof building.constructionStartTime === 'number' ? Math.max(0, now - building.constructionStartTime) : null,
      constructionStartTime: building.constructionStartTime,
      sellElapsed: typeof building.sellStartTime === 'number' ? Math.max(0, now - building.sellStartTime) : null,
      constructionFinished: building.constructionFinished,
      ammo: building.ammo,
      turretDirection: building.turretDirection,
      muzzleFlashStartTime: building.muzzleFlashStartTime
    }))

  // Include explosions created by this client's units
  const explosions = (gameState.explosions || []).map(exp => ({
    x: exp.x,
    y: exp.y,
    startElapsed: typeof exp.startTime === 'number' ? Math.max(0, now - exp.startTime) : 0,
    duration: exp.duration,
    maxRadius: exp.maxRadius
  }))

  return {
    partyId,
    units,
    buildings,
    explosions,
    timestamp: Date.now()
  }
}

/**
 * Send client state update to host (client only)
 * Currently unused - reserved for future client->host state updates
 */
function _sendClientStateUpdate() {
  if (isHost() || !hasActiveRemoteSession()) {
    return
  }

  const update = createClientStateUpdate()
  broadcastGameCommand(
    'client-state-update',
    update,
    gameState.humanPlayer
  )
}

/**
 * Broadcast game state snapshot to all connected peers (host only)
 */
function broadcastGameStateSnapshot() {
  if (!isHost()) {
    return
  }

  const snapshot = createGameStateSnapshot()
  broadcastGameCommand(
    'game-state-snapshot',
    snapshot,
    gameState.humanPlayer
  )
}

// Handle for client state sync
let clientSyncHandle = null

/**
 * Start periodic game state synchronization
 * Host broadcasts full snapshots to clients
 * Clients do NOT send state updates - they only send user commands
 */
export function startGameStateSync() {
  if (isHost()) {
    // Host: broadcast full snapshots
    if (stateSyncHandle) return

    stateSyncHandle = setInterval(() => {
      if (hasActiveRemoteSession()) {
        broadcastGameStateSnapshot()
      }
    }, GAME_STATE_SYNC_INTERVAL_MS)
  }
  // Note: Client no longer sends periodic state updates
  // Client only sends user commands (move, attack, build, etc.)
}

/**
 * Stop game state synchronization
 */
export function stopGameStateSync() {
  if (stateSyncHandle) {
    clearInterval(stateSyncHandle)
    stateSyncHandle = null
  }
  if (clientSyncHandle) {
    clearInterval(clientSyncHandle)
    clientSyncHandle = null
  }
}

/**
 * Notify that a new client has connected to the host
 * This ensures the first snapshot includes all map configuration data
 */
export function notifyClientConnected() {
  window.logger('[GameCommandSync] New client connected, first snapshot will include full map data')
  // The mapSynced flag is only used on clients, not on the host
  // The host always includes map data in snapshots anyway
  // This function serves as a hook for any host-side initialization when a client connects
}

/**
 * Check if this client is in a multiplayer session as a remote player
 * @returns {boolean}
 */
export function isRemoteClient() {
  return !isHost() && gameState.multiplayerSession?.isRemote === true
}

// Import dependencies needed for broadcasting
import { getActiveHostMonitor } from './webrtcSession.js'
