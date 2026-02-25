// saveGame.js
import { gameState } from './gameState.js'
import { factories } from './main.js'
import { units } from './main.js'
import { mapGrid } from './main.js'
import { builtinMissions, getBuiltinMissionById } from './missions/index.js'
import { cleanupOreFromBuildings } from './gameSetup.js'
import {
  TILE_SIZE,
  TANKER_SUPPLY_CAPACITY,
  setMapDimensions,
  DEFAULT_MAP_TILES_X,
  DEFAULT_MAP_TILES_Y,
  AMMO_TRUCK_CARGO,
  HELIPAD_AMMO_RESERVE,
  MINE_HEALTH,
  MINE_ARM_DELAY,
  MINE_DEPLOY_STOP_TIME
} from './config.js'
import { enforceSmokeParticleCapacity } from './utils/smokeUtils.js'
import { createUnit } from './units.js'
import { buildingData, placeBuilding } from './buildings.js'
import { showNotification } from './ui/notifications.js'
import { milestoneSystem } from './game/milestoneSystem.js'
import { initializeOccupancyMap } from './units.js'
import { getTextureManager, getMapRenderer } from './rendering.js'
import { assignHarvesterToOptimalRefinery } from './game/harvesterLogic.js'
import { productionQueue } from './productionQueue.js'
import {
  getCurrentGame,
  MAP_SEED_STORAGE_KEY,
  MAP_WIDTH_TILES_STORAGE_KEY,
  MAP_HEIGHT_TILES_STORAGE_KEY
} from './main.js'
import { updateDangerZoneMaps } from './game/dangerZoneMap.js'
import { getKeyboardHandler } from './inputHandler.js'
import { ensurePlayerBuildHistoryLoaded } from './savePlayerBuildPatterns.js'
import { getUniqueId } from './utils.js'
import { rebuildMineLookup } from './game/mineSystem.js'
import { regenerateAllInviteTokens } from './network/multiplayerStore.js'
import { refreshSidebarMultiplayer } from './ui/sidebarMultiplayer.js'
import { stopHostInvite } from './network/webrtcSession.js'
import { gameRandom } from './utils/gameRandom.js'

const BUILTIN_SAVE_PREFIX = 'builtin:'
const LAST_GAME_LABEL = 'lastGame'
const LAST_GAME_STORAGE_KEY = `rts_save_${LAST_GAME_LABEL}`
const LAST_GAME_RESUME_FLAG_KEY = 'rts_lastGame_resume_pending'
const AUTO_SAVE_INTERVAL_MS = 60_000
const PAUSE_OBSERVER_INTERVAL_MS = 1000

let lastGameAutoSaveInterval = null
let pauseWatchInterval = null
let lastPauseState = Boolean(gameState.gamePaused)

function markLastGameResumePending() {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(LAST_GAME_RESUME_FLAG_KEY, 'true')
  } catch (err) {
    window.logger.warn('Failed to set auto-resume flag for last game:', err)
  }
}

function clearLastGameResumePending() {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.removeItem(LAST_GAME_RESUME_FLAG_KEY)
  } catch (err) {
    window.logger.warn('Failed to clear auto-resume flag for last game:', err)
  }
}

function canPersistLastGame() {
  return typeof localStorage !== 'undefined' && gameState.gameStarted && !gameState.gameOver
}

function saveLastGameCheckpoint(reason = '') {
  if (!canPersistLastGame()) return

  try {
    saveGame(LAST_GAME_LABEL)
    if (reason) {
      window.logger(`Auto-saved ${LAST_GAME_LABEL} checkpoint (${reason})`)
    }
  } catch (err) {
    window.logger.warn('Failed to auto-save last game checkpoint:', err)
  }
}

function startLastGameAutoSaveLoop() {
  if (lastGameAutoSaveInterval !== null) return

  lastGameAutoSaveInterval = setInterval(() => {
    saveLastGameCheckpoint('interval')
  }, AUTO_SAVE_INTERVAL_MS)
}

function startPauseWatcher() {
  if (pauseWatchInterval !== null) return

  pauseWatchInterval = setInterval(() => {
    const currentlyPaused = Boolean(gameState.gamePaused)

    if (currentlyPaused && !lastPauseState) {
      markLastGameResumePending()
      saveLastGameCheckpoint('pause')
    } else if (!currentlyPaused && lastPauseState) {
      clearLastGameResumePending()
    }

    lastPauseState = currentlyPaused
  }, PAUSE_OBSERVER_INTERVAL_MS)
}

function setupLifecycleSaves() {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        saveLastGameCheckpoint('hidden')
      }
    })
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => saveLastGameCheckpoint('pagehide'))
  }
}

function syncLoadedMapSettings(widthTiles, heightTiles, mapSeed) {
  const widthInput = document.getElementById('mapWidthTiles')
  if (widthInput) {
    widthInput.value = widthTiles
  }

  const heightInput = document.getElementById('mapHeightTiles')
  if (heightInput) {
    heightInput.value = heightTiles
  }

  const seedInput = document.getElementById('mapSeed')
  if (seedInput && typeof mapSeed === 'string') {
    seedInput.value = mapSeed
  }

  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(MAP_WIDTH_TILES_STORAGE_KEY, widthTiles.toString())
  } catch (err) {
    window.logger.warn('Failed to persist loaded map width to localStorage:', err)
  }

  try {
    localStorage.setItem(MAP_HEIGHT_TILES_STORAGE_KEY, heightTiles.toString())
  } catch (err) {
    window.logger.warn('Failed to persist loaded map height to localStorage:', err)
  }

  if (typeof mapSeed === 'string') {
    try {
      localStorage.setItem(MAP_SEED_STORAGE_KEY, mapSeed)
    } catch (err) {
      window.logger.warn('Failed to persist loaded map seed to localStorage:', err)
    }
  }
}

function createDefaultMapTile() {
  return { type: 'land', ore: false, seedCrystal: false, noBuild: 0 }
}

function ensureMapGridMatchesDimensions(grid, width, height) {
  if (!Array.isArray(grid)) {
    return Array.from({ length: height }, () =>
      Array.from({ length: width }, () => createDefaultMapTile())
    )
  }

  grid.length = height
  for (let y = 0; y < height; y++) {
    if (!Array.isArray(grid[y])) {
      grid[y] = []
    }
    const row = grid[y]
    row.length = width
    for (let x = 0; x < width; x++) {
      if (!row[x] || typeof row[x] !== 'object') {
        row[x] = createDefaultMapTile()
        continue
      }

      const tile = row[x]
      if (typeof tile.type !== 'string') {
        tile.type = 'land'
      }
      if (typeof tile.ore !== 'boolean') {
        tile.ore = false
      }
      if (typeof tile.seedCrystal !== 'boolean') {
        tile.seedCrystal = false
      }
      if (!Number.isFinite(tile.noBuild)) {
        tile.noBuild = 0
      }
    }
  }

  return grid
}

// === Save/Load Game Logic ===
export function getSaveGames() {
  const saves = builtinMissions.map(mission => ({
    key: `${BUILTIN_SAVE_PREFIX}${mission.id}`,
    label: mission.label,
    time: mission.time,
    builtin: true,
    description: mission.description
  }))

  if (typeof localStorage !== 'undefined') {
    for (const key in localStorage) {
      if (key.startsWith('rts_save_')) {
        try {
          const save = JSON.parse(localStorage.getItem(key))
          saves.push({
            key,
            label: save?.label || '(no label)',
            time: save?.time || 0,
            builtin: false,
            description: null
          })
        } catch (err) {
          window.logger.warn('Error processing saved game:', err)
        }
      }
    }
  }

  saves.sort((a, b) => {
    if (a.builtin && !b.builtin) return -1
    if (!a.builtin && b.builtin) return 1
    return (b.time || 0) - (a.time || 0)
  })

  return saves
}

export function saveGame(label) {
  ensurePlayerBuildHistoryLoaded()
  const perfNow = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now()

  // Gather AI player money (budget) from all AI factories
  const aiFactoryBudgets = {}
  factories.forEach(factory => {
    if (factory.owner !== gameState.humanPlayer && factory.budget !== undefined) {
      aiFactoryBudgets[factory.owner || factory.id] = factory.budget
    }
  })

  // Gather all units (human player and AI players)
  const allUnits = units.map(u => {
    const serialized = {
      type: u.type,
      owner: u.owner,
      x: u.x,
      y: u.y,
      tileX: u.tileX,
      tileY: u.tileY,
      health: u.health,
      maxHealth: u.maxHealth,
      id: u.id,
      gas: u.gas,
      maxGas: u.maxGas,
      supplyGas: u.supplyGas,
      maxSupplyGas: u.maxSupplyGas,
      gasRefillTimer: u.gasRefillTimer,
      refueling: u.refueling,
      outOfGasPlayed: u.outOfGasPlayed,
      // Ammunition system properties
      ammunition: u.ammunition,
      maxAmmunition: u.maxAmmunition,
      ammoCargo: u.ammoCargo,
      maxAmmoCargo: u.maxAmmoCargo,
      rocketAmmo: u.rocketAmmo,
      maxRocketAmmo: u.maxRocketAmmo,
      apacheAmmoEmpty: u.apacheAmmoEmpty,
      canFire: u.canFire,
      // Harvester-specific properties
      oreCarried: u.oreCarried,
      assignedRefinery: u.assignedRefinery,
      oreField: u.oreField,
      path: u.path || [],
      // Save target as ID only to avoid circular references
      targetId: u.target?.id || null,
      targetType: u.target ? (u.target.type || 'unknown') : null,
      groupNumber: u.groupNumber,
      // Experience/Leveling system properties
      level: u.level || 0,
      experience: u.experience || 0,
      baseCost: u.baseCost,
      rangeMultiplier: u.rangeMultiplier,
      fireRateMultiplier: u.fireRateMultiplier,
      armor: u.armor,
      selfRepair: u.selfRepair,
      damageValue: u.damageValue,
      totalRepairPaid: u.totalRepairPaid,
      isRestoredFromWreck: u.isRestoredFromWreck
      // Note: lastAttacker is excluded to prevent circular references
      // Add more fields if needed
    }

    if (u.type === 'mineLayer') {
      serialized.mineCapacity = u.mineCapacity
      serialized.remainingMines = u.remainingMines
      serialized.deployTargetX = Number.isFinite(u.deployTargetX) ? u.deployTargetX : null
      serialized.deployTargetY = Number.isFinite(u.deployTargetY) ? u.deployTargetY : null
      serialized.mineDeployRemaining = u.deployingMine && typeof u.deployStartTime === 'number'
        ? Math.max(0, MINE_DEPLOY_STOP_TIME - (perfNow - u.deployStartTime))
        : 0
    }

    if (u.type === 'mineSweeper') {
      serialized.sweeping = Boolean(u.sweeping)
    }

    return serialized
  })

  const allWrecks = Array.isArray(gameState.unitWrecks)
    ? gameState.unitWrecks.map(wreck => ({
      id: wreck.id,
      sourceUnitId: wreck.sourceUnitId,
      unitType: wreck.unitType,
      owner: wreck.owner,
      x: wreck.x,
      y: wreck.y,
      tileX: wreck.tileX,
      tileY: wreck.tileY,
      direction: wreck.direction,
      turretDirection: wreck.turretDirection,
      createdAt: wreck.createdAt,
      cost: wreck.cost,
      buildDuration: wreck.buildDuration,
      assignedTankId: wreck.assignedTankId,
      towedBy: wreck.towedBy,
      isBeingRecycled: wreck.isBeingRecycled,
      recycleStartedAt: wreck.recycleStartedAt,
      recycleDuration: wreck.recycleDuration,
      noiseSeed: wreck.noiseSeed,
      spriteCacheKey: wreck.spriteCacheKey,
      maxHealth: wreck.maxHealth,
      health: wreck.health,
      occupancyTileX: wreck.occupancyTileX,
      occupancyTileY: wreck.occupancyTileY
    }))
    : []

  // Gather all buildings (player and enemy)
  const allBuildings = gameState.buildings.map(b => ({
    type: b.type,
    owner: b.owner,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    health: b.health,
    maxHealth: b.maxHealth,
    id: b.id,
    rallyPoint: b.rallyPoint, // Save rally point if it exists
    fuel: typeof b.fuel === 'number' ? b.fuel : undefined,
    maxFuel: typeof b.maxFuel === 'number' ? b.maxFuel : undefined,
    fuelReloadTime: typeof b.fuelReloadTime === 'number' ? b.fuelReloadTime : undefined,
    // Ammunition system properties for buildings
    ammo: typeof b.ammo === 'number' ? b.ammo : undefined,
    maxAmmo: typeof b.maxAmmo === 'number' ? b.maxAmmo : undefined,
    ammoReloadTime: typeof b.ammoReloadTime === 'number' ? b.ammoReloadTime : undefined,
    needsAmmo: typeof b.needsAmmo === 'boolean' ? b.needsAmmo : undefined,
    landedUnitId: b.landedUnitId,
    damageValue: b.damageValue
    // Add more fields if needed
  }))

  // Gather factory rally points as well
  const factoryRallyPoints = factories.map(f => ({
    id: f.id,
    rallyPoint: f.rallyPoint
  }))

  // Gather all ore positions (now using ore property instead of tile type)
  const orePositions = []
  for (let y = 0; y < mapGrid.length; y++) {
    for (let x = 0; x < mapGrid[y].length; x++) {
      if (mapGrid[y][x].ore) {
        orePositions.push({ x, y })
      }
    }
  }

  // Save the full mapGrid tile types for restoring building/wall/terrain occupancy
  const mapGridTypes = mapGrid.map(row => row.map(tile => tile.type))

  // Save everything in a single object
  const saveData = {
    // Only save specific gameState properties to avoid circular references and reduce size
    gameState: {
      money: gameState.money,
      gameTime: gameState.gameTime,
      frameCount: gameState.frameCount,
      wins: gameState.wins,
      losses: gameState.losses,
      gameStarted: gameState.gameStarted,
      gamePaused: gameState.gamePaused,
      gameOver: gameState.gameOver,
      gameOverMessage: gameState.gameOverMessage,
      gameResult: gameState.gameResult,
      playerUnitsDestroyed: gameState.playerUnitsDestroyed,
      enemyUnitsDestroyed: gameState.enemyUnitsDestroyed,
      playerBuildingsDestroyed: gameState.playerBuildingsDestroyed,
      enemyBuildingsDestroyed: gameState.enemyBuildingsDestroyed,
      totalMoneyEarned: gameState.totalMoneyEarned,
      scrollOffset: gameState.scrollOffset,
      speedMultiplier: gameState.speedMultiplier,
      powerSupply: gameState.powerSupply,
      playerBuildHistory: gameState.playerBuildHistory,
      currentSessionId: gameState.currentSessionId,
      enemyLastBuildingTime: gameState.enemyLastBuildingTime,
      radarActive: gameState.radarActive,
      gridVisible: gameState.gridVisible,
      occupancyVisible: gameState.occupancyVisible,
      fpsVisible: gameState.fpsVisible,
      benchmarkActive: Boolean(gameState.benchmarkActive),
      useTankImages: gameState.useTankImages,
      entityImageOpacityLevel: gameState.entityImageOpacityLevel,
      useTurretImages: gameState.useTurretImages,
      nextVehicleFactoryIndex: gameState.nextVehicleFactoryIndex,
      refineryStatus: gameState.refineryStatus,
      playerCount: gameState.playerCount,
      humanPlayer: gameState.humanPlayer,
      availableUnitTypes: Array.from(gameState.availableUnitTypes || []),
      availableBuildingTypes: Array.from(gameState.availableBuildingTypes || []),
      newUnitTypes: Array.from(gameState.newUnitTypes || []),
      newBuildingTypes: Array.from(gameState.newBuildingTypes || []),
      defeatedPlayers: gameState.defeatedPlayers instanceof Set ?
        Array.from(gameState.defeatedPlayers) :
        (Array.isArray(gameState.defeatedPlayers) ? gameState.defeatedPlayers : []),
      selectedWreckId: gameState.selectedWreckId || null,
      buildingPlacementMode: Boolean(gameState.buildingPlacementMode),
      currentBuildingType: gameState.currentBuildingType || null,
      chainBuildPrimed: Boolean(gameState.chainBuildPrimed),
      chainBuildMode: Boolean(gameState.chainBuildMode),
      chainStartX: Number.isFinite(gameState.chainStartX) ? gameState.chainStartX : 0,
      chainStartY: Number.isFinite(gameState.chainStartY) ? gameState.chainStartY : 0,
      chainBuildingType: gameState.chainBuildingType || null,
      blueprints: Array.isArray(gameState.blueprints)
        ? gameState.blueprints.map(bp => ({
          type: bp.type,
          x: Number.isFinite(bp.x) ? bp.x : 0,
          y: Number.isFinite(bp.y) ? bp.y : 0
        }))
        : [],
      mines: Array.isArray(gameState.mines)
        ? gameState.mines.map(mine => ({
          id: mine.id,
          tileX: mine.tileX,
          tileY: mine.tileY,
          owner: mine.owner,
          health: mine.health,
          maxHealth: mine.maxHealth,
          active: Boolean(mine.active),
          armDelayRemaining: !mine.active && typeof mine.armedAt === 'number'
            ? Math.max(0, mine.armedAt - perfNow)
            : 0
        }))
        : [],
      mineDeploymentPreview: gameState.mineDeploymentPreview
        ? {
          startX: gameState.mineDeploymentPreview.startX,
          startY: gameState.mineDeploymentPreview.startY,
          endX: gameState.mineDeploymentPreview.endX,
          endY: gameState.mineDeploymentPreview.endY
        }
        : null,
      sweepAreaPreview: gameState.sweepAreaPreview
        ? {
          startX: gameState.sweepAreaPreview.startX,
          startY: gameState.sweepAreaPreview.startY,
          endX: gameState.sweepAreaPreview.endX,
          endY: gameState.sweepAreaPreview.endY
        }
        : null,
      mineFreeformPaint: gameState.mineFreeformPaint instanceof Set
        ? Array.from(gameState.mineFreeformPaint)
        : (Array.isArray(gameState.mineFreeformPaint) ? [...gameState.mineFreeformPaint] : null)
    },
    aiFactoryBudgets, // Save AI player budgets
    units: allUnits,
    unitWrecks: allWrecks,
    buildings: allBuildings,
    factoryRallyPoints, // Save factory rally points
    orePositions,
    mapGridTypes, // ADDED: save mapGrid tile types
    targetedOreTiles: gameState.targetedOreTiles || {}, // Save targeted ore tiles for harvesters
    achievedMilestones: milestoneSystem.getAchievedMilestones(), // Save milestone progress
    productionQueueState: productionQueue.getSerializableState()
  }

  const saveObj = {
    label: label || 'Unnamed',
    time: Date.now(),
    state: JSON.stringify(saveData)
  }
  localStorage.setItem('rts_save_' + saveObj.label, JSON.stringify(saveObj))
}

export function loadGame(key) {
  let saveObj = null

  if (key.startsWith(BUILTIN_SAVE_PREFIX)) {
    const missionId = key.slice(BUILTIN_SAVE_PREFIX.length)
    const mission = getBuiltinMissionById(missionId)
    if (!mission) {
      window.logger.warn('Built-in mission not found:', missionId)
      return
    }
    saveObj = {
      label: mission.label,
      state: mission.state
    }
  } else {
    if (typeof localStorage === 'undefined') {
      window.logger.warn('localStorage is not available, unable to load save:', key)
      return
    }
    const raw = localStorage.getItem(key)
    if (!raw) {
      window.logger.warn('Save game not found:', key)
      return
    }
    try {
      saveObj = JSON.parse(raw)
    } catch (err) {
      window.logger.warn('Failed to parse saved game metadata:', err)
      return
    }
  }

  if (saveObj && saveObj.state !== undefined) {
    let stateString
    if (typeof saveObj.state === 'string') {
      stateString = saveObj.state
    } else if (saveObj.state && typeof saveObj.state === 'object') {
      stateString = JSON.stringify(saveObj.state)
    } else {
      window.logger.warn('Invalid save game format for key:', key)
      return
    }

    let loaded
    try {
      loaded = JSON.parse(stateString)
    } catch (err) {
      window.logger.warn('Failed to parse saved game state:', err)
      return
    }

    Object.assign(gameState, loaded.gameState)

    // Clear defeat/victory state when loading - let the game check conditions fresh
    gameState.gameOver = false
    gameState.gameOverMessage = null
    gameState.gameResult = null
    gameState.localPlayerDefeated = false
    gameState.isSpectator = false
    // Ensure game is marked as started
    gameState.gameStarted = true

    const savedWidthTiles = Number.isFinite(loaded?.gameState?.mapTilesX)
      ? loaded.gameState.mapTilesX
      : DEFAULT_MAP_TILES_X
    const savedHeightTiles = Number.isFinite(loaded?.gameState?.mapTilesY)
      ? loaded.gameState.mapTilesY
      : DEFAULT_MAP_TILES_Y
    const { width: appliedWidth, height: appliedHeight } = setMapDimensions(savedWidthTiles, savedHeightTiles)
    gameState.mapTilesX = appliedWidth
    gameState.mapTilesY = appliedHeight

    const savedSeed = typeof loaded?.gameState?.mapSeed === 'string'
      ? loaded.gameState.mapSeed
      : (loaded?.gameState?.mapSeed != null ? String(loaded.gameState.mapSeed) : null)
    if (typeof savedSeed === 'string') {
      gameState.mapSeed = savedSeed
    }
    syncLoadedMapSettings(appliedWidth, appliedHeight, savedSeed)

    const pendingFactoryBudgets = loaded.aiFactoryBudgets || null
    const legacyEnemyMoney = loaded.enemyMoney

    if (Array.isArray(loaded.gameState?.blueprints)) {
      gameState.blueprints = loaded.gameState.blueprints.map(bp => ({
        type: bp.type,
        x: Number.isFinite(bp.x) ? bp.x : 0,
        y: Number.isFinite(bp.y) ? bp.y : 0
      }))
    } else {
      gameState.blueprints = []
    }

    gameState.buildingPlacementMode = Boolean(loaded.gameState?.buildingPlacementMode)
    gameState.currentBuildingType = typeof loaded.gameState?.currentBuildingType === 'string'
      ? loaded.gameState.currentBuildingType
      : null

    gameState.chainBuildPrimed = Boolean(loaded.gameState?.chainBuildPrimed)
    gameState.chainBuildMode = Boolean(loaded.gameState?.chainBuildMode)
    gameState.chainStartX = Number.isFinite(loaded.gameState?.chainStartX) ? loaded.gameState.chainStartX : 0
    gameState.chainStartY = Number.isFinite(loaded.gameState?.chainStartY) ? loaded.gameState.chainStartY : 0
    gameState.chainBuildingType = typeof loaded.gameState?.chainBuildingType === 'string'
      ? loaded.gameState.chainBuildingType
      : null
    gameState.entityImageOpacityLevel = Number.isFinite(loaded.gameState?.entityImageOpacityLevel)
      ? Math.max(0, Math.min(2, loaded.gameState.entityImageOpacityLevel))
      : 0

    gameState.draggedBuildingType = null
    gameState.draggedBuildingButton = null
    gameState.draggedUnitType = null
    gameState.draggedUnitButton = null
    gameState.chainBuildingButton = null

    const sanitizeRect = rect => {
      if (!rect || typeof rect !== 'object') return null
      const startX = Number.isFinite(rect.startX) ? rect.startX : 0
      const startY = Number.isFinite(rect.startY) ? rect.startY : 0
      const endX = Number.isFinite(rect.endX) ? rect.endX : startX
      const endY = Number.isFinite(rect.endY) ? rect.endY : startY
      return { startX, startY, endX, endY }
    }

    gameState.mineDeploymentPreview = sanitizeRect(loaded.gameState?.mineDeploymentPreview)
    gameState.sweepAreaPreview = sanitizeRect(loaded.gameState?.sweepAreaPreview)

    const savedFreeformPaint = loaded.gameState?.mineFreeformPaint
    if (Array.isArray(savedFreeformPaint) && savedFreeformPaint.length > 0) {
      gameState.mineFreeformPaint = new Set(savedFreeformPaint)
    } else {
      gameState.mineFreeformPaint = null
    }

    // Rehydrate Set from saved array
    if (Array.isArray(loaded.gameState.defeatedPlayers)) {
      gameState.defeatedPlayers = new Set(loaded.gameState.defeatedPlayers)
    } else if (!(gameState.defeatedPlayers instanceof Set)) {
      gameState.defeatedPlayers = new Set()
    }

    // Rehydrate other Set properties
    if (Array.isArray(loaded.gameState.availableUnitTypes)) {
      gameState.availableUnitTypes = new Set(loaded.gameState.availableUnitTypes)
    }
    if (Array.isArray(loaded.gameState.availableBuildingTypes)) {
      gameState.availableBuildingTypes = new Set(loaded.gameState.availableBuildingTypes)
    }
    if (Array.isArray(loaded.gameState.newUnitTypes)) {
      gameState.newUnitTypes = new Set(loaded.gameState.newUnitTypes)
    }
    if (Array.isArray(loaded.gameState.newBuildingTypes)) {
      gameState.newBuildingTypes = new Set(loaded.gameState.newBuildingTypes)
    }

    const perfNowAfterLoad = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now()

    if (Array.isArray(loaded.gameState?.mines)) {
      gameState.mines = loaded.gameState.mines.map(savedMine => {
        const tileX = Number.isFinite(savedMine.tileX) ? savedMine.tileX : 0
        const tileY = Number.isFinite(savedMine.tileY) ? savedMine.tileY : 0
        const health = Number.isFinite(savedMine.health) ? savedMine.health : MINE_HEALTH
        const maxHealth = Number.isFinite(savedMine.maxHealth) ? savedMine.maxHealth : MINE_HEALTH
        const armDelayRemaining = Number.isFinite(savedMine.armDelayRemaining)
          ? Math.max(0, savedMine.armDelayRemaining)
          : 0
        const armedAt = perfNowAfterLoad + armDelayRemaining
        const deployTime = armedAt - MINE_ARM_DELAY
        const active = armDelayRemaining <= 0 ? true : Boolean(savedMine.active)
        return {
          id: savedMine.id || getUniqueId(),
          tileX,
          tileY,
          owner: savedMine.owner || gameState.humanPlayer,
          health,
          maxHealth,
          deployTime,
          armedAt,
          active
        }
      })
    } else {
      gameState.mines = []
    }

    rebuildMineLookup()

    const loadedWrecks = Array.isArray(loaded.unitWrecks) ? loaded.unitWrecks : []
    gameState.unitWrecks = loadedWrecks.map(wreck => {
      const baseX = typeof wreck.x === 'number' ? wreck.x : 0
      const baseY = typeof wreck.y === 'number' ? wreck.y : 0
      const computedTileX = Number.isFinite(wreck.tileX)
        ? wreck.tileX
        : Math.floor((baseX + TILE_SIZE / 2) / TILE_SIZE)
      const computedTileY = Number.isFinite(wreck.tileY)
        ? wreck.tileY
        : Math.floor((baseY + TILE_SIZE / 2) / TILE_SIZE)
      const computedMaxHealth = Math.max(1, wreck.maxHealth ?? wreck.health ?? 1)
      const computedHealth = Math.min(
        computedMaxHealth,
        Math.max(0, wreck.health ?? computedMaxHealth)
      )

      const perfNow = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now()

      return {
        id: wreck.id || `${wreck.sourceUnitId || 'wreck'}-${computedTileX}-${computedTileY}`,
        sourceUnitId: wreck.sourceUnitId || null,
        unitType: wreck.unitType || 'unknown',
        owner: wreck.owner || null,
        x: baseX,
        y: baseY,
        tileX: computedTileX,
        tileY: computedTileY,
        direction: typeof wreck.direction === 'number' ? wreck.direction : 0,
        turretDirection: typeof wreck.turretDirection === 'number'
          ? wreck.turretDirection
          : (typeof wreck.direction === 'number' ? wreck.direction : 0),
        createdAt: typeof wreck.createdAt === 'number' ? wreck.createdAt : perfNow,
        cost: typeof wreck.cost === 'number' ? wreck.cost : 0,
        buildDuration: typeof wreck.buildDuration === 'number' ? wreck.buildDuration : null,
        assignedTankId: typeof wreck.assignedTankId === 'string' ? wreck.assignedTankId : null,
        towedBy: typeof wreck.towedBy === 'string' ? wreck.towedBy : null,
        isBeingRecycled: Boolean(wreck.isBeingRecycled),
        recycleStartedAt: typeof wreck.recycleStartedAt === 'number' ? wreck.recycleStartedAt : null,
        recycleDuration: typeof wreck.recycleDuration === 'number' ? wreck.recycleDuration : null,
        noiseSeed: typeof wreck.noiseSeed === 'number' ? wreck.noiseSeed : gameRandom(),
        spriteCacheKey: wreck.spriteCacheKey || wreck.unitType || 'default',
        maxHealth: computedMaxHealth,
        health: computedHealth,
        occupancyTileX: Number.isFinite(wreck.occupancyTileX) ? wreck.occupancyTileX : computedTileX,
        occupancyTileY: Number.isFinite(wreck.occupancyTileY) ? wreck.occupancyTileY : computedTileY
      }
    })

    if (!Array.isArray(gameState.unitWrecks)) {
      gameState.unitWrecks = []
    }

    if (gameState.selectedWreckId) {
      const selectedExists = gameState.unitWrecks.some(w => w.id === gameState.selectedWreckId)
      if (!selectedExists) {
        gameState.selectedWreckId = null
      }
    }

    // Ensure smokeParticles is properly initialized and clean up any invalid particles
    if (!Array.isArray(gameState.smokeParticles)) {
      gameState.smokeParticles = []
    } else {
      // Clean up any invalid smoke particles from saved data
      gameState.smokeParticles = gameState.smokeParticles.filter(p =>
        p && typeof p === 'object' &&
        typeof p.x === 'number' &&
        typeof p.y === 'number' &&
        typeof p.size === 'number' &&
        p.size > 0 &&
        typeof p.startTime === 'number' &&
        typeof p.duration === 'number'
      )
    }

    // Smoke particle pools are transient and should always be reset on load/save
    gameState.smokeParticlePool = []
    enforceSmokeParticleCapacity(gameState)

    // Restore AI player budgets
    units.length = 0
    loaded.units.forEach(u => {
      // Rehydrate unit using createUnit logic
      // Find the factory for owner (player/enemy)
      let factory = factories.find(f => (f.owner === u.owner || f.id === u.owner))
      if (!factory) {
        // fallback: use first factory of that owner
        factory = factories.find(f => f.owner === u.owner) || factories[0]
      }
      // Skip this unit if no factory exists (shouldn't happen in valid save games)
      if (!factory) {
        window.logger.warn('Skipping unit with no factory:', u.type, 'owner:', u.owner)
        return
      }
      // Use tileX/tileY if present, else calculate from x/y
      const tileX = u.tileX !== undefined ? u.tileX : Math.floor(u.x / TILE_SIZE)
      const tileY = u.tileY !== undefined ? u.tileY : Math.floor(u.y / TILE_SIZE)
      const hydrated = createUnit(factory, u.type, tileX, tileY)
      // Store the default maxHealth from createUnit before Object.assign overwrites it
      const defaultMaxHealth = hydrated.maxHealth
      // Copy over all saved properties (health, id, etc.)
      Object.assign(hydrated, u)
      // Ensure maxHealth is valid (fix for older save games that may not have saved maxHealth)
      if (!Number.isFinite(hydrated.maxHealth) || hydrated.maxHealth <= 0) {
        hydrated.maxHealth = defaultMaxHealth || hydrated.health || 100
      }
      // Ensure tileX/tileY/x/y are consistent
      hydrated.tileX = tileX
      hydrated.tileY = tileY
      hydrated.x = u.x
      hydrated.y = u.y
      hydrated.gas = u.gas
      hydrated.maxGas = u.maxGas
      if (typeof u.supplyGas === 'number') {
        hydrated.supplyGas = u.supplyGas
      } else if (hydrated.type === 'tankerTruck') {
        // Fallback for older save games
        hydrated.supplyGas = TANKER_SUPPLY_CAPACITY
      }
      if (typeof u.maxSupplyGas === 'number') {
        hydrated.maxSupplyGas = u.maxSupplyGas
      } else if (hydrated.type === 'tankerTruck') {
        hydrated.maxSupplyGas = TANKER_SUPPLY_CAPACITY
      }
      hydrated.gasRefillTimer = u.gasRefillTimer
      hydrated.refueling = u.refueling
      hydrated.outOfGasPlayed = u.outOfGasPlayed

      // Restore ammunition system properties
      if (typeof u.ammunition === 'number') {
        hydrated.ammunition = u.ammunition
      } else if (hydrated.maxAmmunition && typeof hydrated.ammunition !== 'number') {
        // Fallback for older saves - initialize to max if not saved
        hydrated.ammunition = hydrated.maxAmmunition
      }
      if (typeof u.maxAmmunition === 'number') {
        hydrated.maxAmmunition = u.maxAmmunition
      }
      if (typeof u.ammoCargo === 'number') {
        hydrated.ammoCargo = u.ammoCargo
      } else if (hydrated.type === 'ammunitionTruck' && typeof hydrated.ammoCargo !== 'number') {
        // Fallback for older saves - initialize ammo trucks to full capacity
        hydrated.ammoCargo = hydrated.maxAmmoCargo || AMMO_TRUCK_CARGO
      }
      if (typeof u.maxAmmoCargo === 'number') {
        hydrated.maxAmmoCargo = u.maxAmmoCargo
      }
      if (typeof u.rocketAmmo === 'number') {
        hydrated.rocketAmmo = u.rocketAmmo
      } else if (hydrated.type === 'apache' && typeof hydrated.rocketAmmo !== 'number') {
        // Fallback for older saves - initialize Apache to full rocket ammo
        hydrated.rocketAmmo = hydrated.maxRocketAmmo || 38
      }
      if (typeof u.maxRocketAmmo === 'number') {
        hydrated.maxRocketAmmo = u.maxRocketAmmo
      }
      if (hydrated.type === 'f22Raptor') {
        hydrated.maxRocketAmmo = 8
        hydrated.rocketAmmo = Math.max(0, Math.min(typeof hydrated.rocketAmmo === 'number' ? hydrated.rocketAmmo : 8, 8))
      }
      if (typeof u.apacheAmmoEmpty === 'boolean') {
        hydrated.apacheAmmoEmpty = u.apacheAmmoEmpty
      } else if (hydrated.type === 'apache') {
        // Fallback - assume not empty if not saved
        hydrated.apacheAmmoEmpty = false
      }
      if (typeof u.canFire === 'boolean') {
        hydrated.canFire = u.canFire
      } else if (hydrated.type === 'apache') {
        // Fallback - assume can fire if not saved
        hydrated.canFire = true
      }

      // Ensure path is always an array
      if (!Array.isArray(hydrated.path)) hydrated.path = []

      // Initialize/restore experience system for combat units
      if (hydrated.type !== 'harvester') {
        // Ensure experience properties exist
        hydrated.level = u.level || 0
        hydrated.experience = u.experience || 0
        hydrated.baseCost = u.baseCost || (function() {
          const costs = { tank: 1000, rocketTank: 2000, 'tank-v2': 2000, 'tank-v3': 3000, tank_v1: 1000 }
          return costs[hydrated.type] || 1000
        })()

        // Restore level bonuses if they exist
        if (u.rangeMultiplier) hydrated.rangeMultiplier = u.rangeMultiplier
        if (u.fireRateMultiplier) hydrated.fireRateMultiplier = u.fireRateMultiplier
        if (u.armor && u.armor > 1) hydrated.armor = u.armor
        if (u.selfRepair) hydrated.selfRepair = u.selfRepair

        window.logger(`🔄 Loaded ${hydrated.type}: Level ${hydrated.level}, Experience ${hydrated.experience}`)
      }

      if (hydrated.type === 'mineLayer') {
        if (typeof u.remainingMines === 'number') {
          hydrated.remainingMines = u.remainingMines
        }
        if (typeof u.mineCapacity === 'number') {
          hydrated.mineCapacity = u.mineCapacity
        }
        hydrated.deployTargetX = Number.isFinite(u.deployTargetX) ? u.deployTargetX : null
        hydrated.deployTargetY = Number.isFinite(u.deployTargetY) ? u.deployTargetY : null

        if (typeof u.mineDeployRemaining === 'number' && u.mineDeployRemaining > 0) {
          const remaining = Math.min(MINE_DEPLOY_STOP_TIME, u.mineDeployRemaining)
          hydrated.deployingMine = true
          hydrated.deployStartTime = perfNowAfterLoad - (MINE_DEPLOY_STOP_TIME - remaining)
        } else {
          hydrated.deployingMine = false
          hydrated.deployStartTime = null
        }
      }

      delete hydrated.mineDeployRemaining

      if (hydrated.type === 'mineSweeper') {
        hydrated.sweeping = Boolean(u.sweeping)
      }

      // Restore harvester-specific properties and re-assign to refineries if needed
      if (hydrated.type === 'harvester') {
        hydrated.oreCarried = u.oreCarried || 0
        hydrated.oreField = u.oreField || null

        // If harvester had an assigned refinery but it's lost during save/load, reassign
        if (u.assignedRefinery) {
          hydrated.assignedRefinery = u.assignedRefinery
        } else {
          // Re-assign harvester to optimal refinery after loading
          // This will be handled after all buildings are loaded
          hydrated.needsRefineryAssignment = true
        }
      }

      units.push(hydrated)
    })

    if (Array.isArray(gameState.unitWrecks) && gameState.unitWrecks.length > 0) {
      const validUnitIds = new Set(units.map(unit => unit.id))
      gameState.unitWrecks.forEach(wreck => {
        if (wreck.assignedTankId && !validUnitIds.has(wreck.assignedTankId)) {
          wreck.assignedTankId = null
        }
        if (wreck.towedBy && !validUnitIds.has(wreck.towedBy)) {
          wreck.towedBy = null
        }
      })
    }

    // Restore target references after all units and buildings are loaded
    units.forEach(unit => {
      if (unit.targetId) {
        // Find target by ID in units or buildings
        let target = units.find(u => u.id === unit.targetId)
        if (!target) {
          target = gameState.buildings.find(b => b.id === unit.targetId)
        }
        if (target) {
          unit.target = target
        }
        // Clean up temporary properties
        delete unit.targetId
        delete unit.targetType
      }
    })

    // Rebuild control groups based on restored units
    const kbHandler = getKeyboardHandler()
    if (kbHandler && typeof kbHandler.rebuildControlGroupsFromUnits === 'function') {
      kbHandler.rebuildControlGroupsFromUnits(units)
    }

    gameState.buildings.length = 0
    gameState.factories.length = 0
    factories.length = 0
    loaded.buildings.forEach(b => {
      // Rehydrate defensive buildings (turrets) so they work after loading
      const building = { ...b }
      // Ensure we restore building flag so selection works correctly
      building.isBuilding = true

      // Ensure all buildings have maxHealth restored for proper health bar rendering
      const data = buildingData[building.type]
      if (data) {
        // Always restore maxHealth from building data to ensure consistency
        building.maxHealth = data.health

        if (typeof data.maxFuel === 'number') {
          if (typeof building.maxFuel !== 'number' || building.maxFuel <= 0) {
            building.maxFuel = data.maxFuel
          }

          if (typeof building.fuel !== 'number') {
            building.fuel = building.maxFuel
          } else if (building.fuel > building.maxFuel) {
            building.fuel = building.maxFuel
          }

          if (typeof building.fuelReloadTime !== 'number' && typeof data.fuelReloadTime === 'number') {
            building.fuelReloadTime = data.fuelReloadTime
          }
        }
      }

      // Restore ammunition system properties for buildings
      if (typeof b.ammo === 'number') {
        building.ammo = b.ammo
      } else if ((building.type === 'helipad' || building.type === 'airstrip') && typeof building.ammo !== 'number') {
        // Fallback for older saves - initialize helipad ammo to full capacity
        building.ammo = building.maxAmmo || HELIPAD_AMMO_RESERVE
      }
      if (typeof b.maxAmmo === 'number') {
        building.maxAmmo = b.maxAmmo
      } else if ((building.type === 'helipad' || building.type === 'airstrip') && typeof building.maxAmmo !== 'number') {
        // Fallback for older saves - set max ammo for helipads
        building.maxAmmo = HELIPAD_AMMO_RESERVE
      }
      if (typeof b.ammoReloadTime === 'number') {
        building.ammoReloadTime = b.ammoReloadTime
      }
      if (typeof b.needsAmmo === 'boolean') {
        building.needsAmmo = b.needsAmmo
      } else if (building.type === 'helipad' || building.type === 'airstrip') {
        // Fallback - calculate needsAmmo based on current ammo level
        building.needsAmmo = building.ammo < (building.maxAmmo * 0.25)
      }
      if (b.landedUnitId) {
        building.landedUnitId = b.landedUnitId
      }

      // Defensive turrets: turretGunV1/V2/V3, rocketTurret, teslaCoil, artilleryTurret
      if (building.type && (building.type.startsWith('turretGun') || building.type === 'rocketTurret' || building.type === 'teslaCoil' || building.type === 'artilleryTurret')) {
        // Get config from buildingData
        const data = buildingData[building.type]
        // Set all runtime properties if missing
        building.fireRange = data.fireRange
        building.minFireRange = data.minFireRange || 0
        building.fireCooldown = data.fireCooldown
        building.damage = data.damage
        building.armor = data.armor || 1
        building.projectileType = data.projectileType
        building.projectileSpeed = data.projectileSpeed
        if (typeof building.lastShotTime !== 'number') building.lastShotTime = 0
        if (typeof building.turretDirection !== 'number') building.turretDirection = 0
        if (typeof building.targetDirection !== 'number') building.targetDirection = 0
        // Burst fire
        if (data.burstFire) {
          building.burstFire = true
          building.burstCount = data.burstCount || 3
          building.burstDelay = data.burstDelay || 150
          if (typeof building.currentBurst !== 'number') building.currentBurst = 0
          if (typeof building.lastBurstTime !== 'number') building.lastBurstTime = 0
        }
        // Tesla coil specific properties
        if (data.isTeslaCoil) {
          building.isTeslaCoil = true
        }
        // Artillery turret identifier
        if (building.type === 'artilleryTurret') {
          building.isArtillery = true
        }
      }

      // Restore rally point for vehicle factories only
      if (building.rallyPoint && building.type === 'vehicleFactory') {
        // Rally point is already in the building data from save
      } else if (building.type === 'vehicleFactory') {
        // Initialize rally point as null for vehicle factories
        building.rallyPoint = null
      }

      gameState.buildings.push(building)

      if (building.type === 'constructionYard') {
        // Ensure construction yards are treated as factories
        if (typeof building.productionCountdown !== 'number') {
          building.productionCountdown = 0
        }
        if (!('budget' in building)) {
          building.budget = 0
        }
        if (!('rallyPoint' in building)) {
          building.rallyPoint = null
        }
        factories.push(building)
        // Avoid double-push when gameState.factories is the same reference as factories
        if (gameState.factories !== factories) {
          gameState.factories.push(building)
        }
      }
    })

    // Restore factory rally points
    if (loaded.factoryRallyPoints) {
      loaded.factoryRallyPoints.forEach(factoryData => {
        const factory = factories.find(f => f.id === factoryData.id)
        if (factory && factoryData.rallyPoint) {
          factory.rallyPoint = factoryData.rallyPoint
        }
      })
    }

    if (pendingFactoryBudgets) {
      Object.entries(pendingFactoryBudgets).forEach(([playerId, budget]) => {
        const aiFactory = factories.find(f => f.owner === playerId || f.id === playerId)
        if (aiFactory && typeof budget === 'number') {
          aiFactory.budget = budget
        }
      })
    } else if (legacyEnemyMoney !== undefined) {
      const enemyFactory = factories.find(f => f.id === 'enemy')
      if (enemyFactory && typeof legacyEnemyMoney === 'number') {
        enemyFactory.budget = legacyEnemyMoney
      }
    }
    // Initialize mapGrid as 2D array if not already done
    const mapWidth = gameState.mapTilesX || 100
    const mapHeight = gameState.mapTilesY || 100
    const normalizedMapGrid = ensureMapGridMatchesDimensions(mapGrid, mapWidth, mapHeight)
    if (normalizedMapGrid !== mapGrid) {
      mapGrid.length = 0
      normalizedMapGrid.forEach((row, index) => {
        mapGrid[index] = row
      })
    }
    // Ensure gameState.mapGrid points at the canonical exported mapGrid (avoid destructive sync)
    if (gameState.mapGrid !== mapGrid) {
      gameState.mapGrid = mapGrid
    }
    // Initialize occupancyMap as 2D array
    if (!gameState.occupancyMap) {
      gameState.occupancyMap = []
    }
    gameState.occupancyMap.length = 0
    for (let y = 0; y < mapHeight; y++) {
      gameState.occupancyMap[y] = []
      for (let x = 0; x < mapWidth; x++) {
        gameState.occupancyMap[y][x] = 0
      }
    }
    // Restore mapGrid tile types (excluding 'building' to avoid black spots)
    if (loaded.mapGridTypes) {
      for (let y = 0; y < mapGrid.length; y++) {
        for (let x = 0; x < mapGrid[y].length; x++) {
          if (loaded.mapGridTypes[y] && loaded.mapGridTypes[y][x]) {
            // Don't restore 'building' tile type - let building placement handle this
            if (loaded.mapGridTypes[y][x] !== 'building') {
              mapGrid[y][x].type = loaded.mapGridTypes[y][x]
            }
          }
        }
      }
    } else {
      // Fallback: clear ore overlays
      for (let y = 0; y < mapGrid.length; y++) {
        for (let x = 0; x < mapGrid[y].length; x++) {
          mapGrid[y][x].ore = false
        }
      }
    }

    // Restore ore overlays from saved positions
    if (loaded.orePositions) {
      loaded.orePositions.forEach(pos => {
        if (mapGrid[pos.y] && mapGrid[pos.y][pos.x]) {
          mapGrid[pos.y][pos.x].ore = true
        }
      })
    }

    // Clear stale building references before re-placing buildings from the save
    for (let y = 0; y < mapGrid.length; y++) {
      if (!mapGrid[y]) continue
      for (let x = 0; x < mapGrid[y].length; x++) {
        const tile = mapGrid[y][x]
        if (tile && tile.building) {
          delete tile.building
        }
        if (tile && tile.buildOnlyOccupied) {
          delete tile.buildOnlyOccupied
        }
        if (tile && tile.airstripStreet) {
          delete tile.airstripStreet
        }
        if (tile && tile.noBuild) {
          delete tile.noBuild
        }
      }
    }

    // Re-place all buildings through canonical placement logic so occupancy and passability
    // are restored exactly like a freshly built structure.
    gameState.buildings.forEach(building => {
      placeBuilding(building, mapGrid, gameState.occupancyMap, { recordTransition: false })
    })

    // Ensure no ore overlaps with buildings or factories after loading
    cleanupOreFromBuildings(mapGrid, gameState.buildings, factories)

    // Invalidate SOT (Smoothening Overlay Texture) mask to force recomputation
    // This ensures the map renders correctly after loading a new map
    const mapRenderer = getMapRenderer()
    if (mapRenderer) {
      mapRenderer.invalidateAllChunks()
    }

    gameState.occupancyMap = initializeOccupancyMap(units, mapGrid, getTextureManager())
    updateDangerZoneMaps(gameState)

    // Restore targeted ore tiles for harvester system
    if (loaded.targetedOreTiles) {
      gameState.targetedOreTiles = loaded.targetedOreTiles
    } else {
      gameState.targetedOreTiles = {}
    }

    // Restore milestone progress
    if (loaded.achievedMilestones && Array.isArray(loaded.achievedMilestones)) {
      // Use the new method to set milestones
      milestoneSystem.setAchievedMilestones(loaded.achievedMilestones)
    }

    // Re-assign harvesters to refineries after all buildings are loaded
    units.forEach(unit => {
      if (unit.type === 'harvester' && unit.needsRefineryAssignment) {
        // Filter buildings by owner for assignment
        const ownerGameState = {
          buildings: gameState.buildings.filter(b => b.owner === unit.owner)
        }
        assignHarvesterToOptimalRefinery(unit, ownerGameState)
        delete unit.needsRefineryAssignment
      }
    })

    // Sync tech tree with player's existing buildings to enable correct build options
    const gameInstance = getCurrentGame()
    if (gameInstance && gameInstance.productionController) {
      productionQueue.setProductionController(gameInstance.productionController)
      if (typeof gameInstance.productionController.setupAllProductionButtons === 'function') {
        gameInstance.productionController.setupAllProductionButtons()
      }
      gameInstance.productionController.syncTechTreeWithBuildings()
    }

    productionQueue.restoreFromSerializableState(loaded.productionQueueState || null)

    // Auto-start the game after loading
    gameState.gamePaused = false
    gameState.gameStarted = true

    if (gameInstance && gameInstance.gameLoop && typeof gameInstance.gameLoop.resumeFromPause === 'function') {
      gameInstance.gameLoop.resumeFromPause()
    }

    // Update pause button to show pause icon since game is now running
    const pauseBtn = document.getElementById('pauseBtn')
    if (pauseBtn) {
      const playPauseIcon = pauseBtn.querySelector('.play-pause-icon')
      if (playPauseIcon) {
        playPauseIcon.textContent = '⏸'
      }
    }

    // Resume production after unpause
    productionQueue.resumeProductionAfterUnpause()

    // Center camera on player's construction yard for missions
    if (key.startsWith(BUILTIN_SAVE_PREFIX)) {
      const gameInstance = getCurrentGame()
      if (gameInstance && typeof gameInstance.centerOnPlayerFactory === 'function') {
        gameInstance.centerOnPlayerFactory()
      }
    }

    // T017: Regenerate invite tokens and establish new host on save load
    // Stop any existing invite monitors before regenerating
    if (Array.isArray(gameState.partyStates)) {
      gameState.partyStates.forEach(party => {
        stopHostInvite(party.partyId)
      })
    }

    // Clear party states to force fresh regeneration
    gameState.partyStates = []

    // Regenerate all invite tokens - the loader becomes the new host
    regenerateAllInviteTokens().then(() => {
      // Refresh the sidebar UI after tokens are regenerated
      refreshSidebarMultiplayer()
    }).catch(err => {
      window.logger.warn('Failed to regenerate multiplayer tokens on load:', err)
    })

    showNotification('Game loaded: ' + (saveObj.label || key))
  }
}

export function deleteGame(key) {
  if (key.startsWith(BUILTIN_SAVE_PREFIX)) {
    window.logger.warn('Built-in missions cannot be deleted:', key)
    return
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(key)
  }
}

export function updateSaveGamesList() {
  const list = document.getElementById('saveGamesList')
  if (!list) return // Early return if element doesn't exist

  list.innerHTML = ''
  const saves = getSaveGames()
  saves.forEach(save => {
    const li = document.createElement('li')
    li.style.display = 'flex'
    li.style.justifyContent = 'space-between'
    li.style.alignItems = 'center'
    li.style.padding = '2px 0'
    const label = document.createElement('span')
    const subtitleText = save.builtin
      ? ''
      : new Date(save.time).toLocaleString()
    const missionBadge = save.builtin
      ? '<span style="margin-left:6px;padding:2px 6px;border-radius:4px;background:#1f6f43;color:#fff;font-size:0.65rem;font-weight:600;letter-spacing:0.05em;">MISSION</span>'
      : ''
    label.innerHTML = `${save.label}${missionBadge}${subtitleText ? `<br><small>${subtitleText}</small>` : ''}`
    label.style.flex = '1'
    // Add tooltip for mission description on hover/tap
    if (save.builtin && save.description) {
      label.title = save.description
      label.style.cursor = 'help'
      // For touch devices, show description on click
      label.addEventListener('click', (_e) => {
        if (window.matchMedia('(pointer: coarse)').matches) {
          // Touch device - show alert with description
          alert(`${save.label}\n\n${save.description}`)
        }
      })
    }
    const loadBtn = document.createElement('button')
    loadBtn.textContent = '▶'
    loadBtn.title = 'Load save game'
    loadBtn.classList.add('action-button')
    loadBtn.style.marginLeft = '6px'
    loadBtn.onclick = () => { loadGame(save.key) }
    li.appendChild(label)
    li.appendChild(loadBtn)
    if (!save.builtin) {
      const delBtn = document.createElement('button')
      delBtn.textContent = '✗'
      delBtn.title = 'Delete save'
      delBtn.classList.add('action-button')
      delBtn.style.marginLeft = '5px'
      delBtn.onclick = () => { deleteGame(save.key); updateSaveGamesList() }
      li.appendChild(delBtn)
    }
    list.appendChild(li)
  })
}

// Add initialization function to set up event listeners
export function initSaveGameSystem() {
  const saveGameBtn = document.getElementById('saveGameBtn')
  const saveLabelInput = document.getElementById('saveLabelInput')

  // Helper to perform the save action
  const performSave = () => {
    const label = document.getElementById('saveLabelInput').value.trim()
    saveGame(label)
    updateSaveGamesList()
    showNotification('Game saved as: ' + (label || 'Unnamed'))
  }

  if (saveGameBtn) {
    saveGameBtn.addEventListener('click', performSave)
  }

  // Allow saving by pressing Enter in the input field
  if (saveLabelInput) {
    saveLabelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        performSave()
      }
    })
  }

  // Initial population of save games list
  updateSaveGamesList()
}

export function initLastGameRecovery() {
  startLastGameAutoSaveLoop()
  startPauseWatcher()
  setupLifecycleSaves()
}

export function maybeResumeLastPausedGame() {
  if (typeof localStorage === 'undefined') return false

  let shouldResume = false

  try {
    shouldResume = localStorage.getItem(LAST_GAME_RESUME_FLAG_KEY) === 'true'
  } catch (err) {
    window.logger.warn('Failed to read auto-resume flag for last game:', err)
    return false
  }

  let hasLastGame = false
  try {
    hasLastGame = Boolean(localStorage.getItem(LAST_GAME_STORAGE_KEY))
  } catch (err) {
    window.logger.warn('Failed to read last game checkpoint:', err)
    return false
  }

  if (shouldResume && hasLastGame) {
    // Check if the saved game was already over (don't auto-resume finished games)
    try {
      const raw = localStorage.getItem(LAST_GAME_STORAGE_KEY)
      if (raw) {
        const saveObj = JSON.parse(raw)
        if (saveObj?.state) {
          const stateString = typeof saveObj.state === 'string' ? saveObj.state : JSON.stringify(saveObj.state)
          const loaded = JSON.parse(stateString)
          if (loaded?.gameState?.gameOver) {
            window.logger('Not auto-resuming - saved game was already finished')
            clearLastGameResumePending()
            return false
          }
        }
      }
    } catch (err) {
      window.logger.warn('Failed to check saved game state:', err)
    }

    loadGame(LAST_GAME_STORAGE_KEY)
    clearLastGameResumePending()
    showNotification('Resumed your last paused game automatically')
    return true
  }

  if (shouldResume && !hasLastGame) {
    clearLastGameResumePending()
  }

  return false
}
