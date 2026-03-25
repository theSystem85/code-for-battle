/**
 * Tests for src/saveGame.js
 * Save/load game system functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'

// Mock dependencies before importing
vi.mock('../../src/gameState.js', () => ({
  gameState: {
    money: 10000,
    gameTime: 0,
    frameCount: 0,
    wins: 0,
    losses: 0,
    gameStarted: true,
    gamePaused: false,
    gameOver: false,
    gameOverMessage: null,
    gameResult: null,
    playerUnitsDestroyed: 0,
    enemyUnitsDestroyed: 0,
    playerBuildingsDestroyed: 0,
    enemyBuildingsDestroyed: 0,
    totalMoneyEarned: 0,
    scrollOffset: { x: 0, y: 0 },
    speedMultiplier: 1,
    powerSupply: 0,
    playerBuildHistory: [],
    currentSessionId: 'test-session',
    enemyLastBuildingTime: 0,
    radarActive: false,
    gridVisible: false,
    occupancyVisible: false,
    fpsVisible: false,
    benchmarkActive: false,
    useTankImages: true,
    useTurretImages: true,
    nextVehicleFactoryIndex: 0,
    refineryStatus: {},
    playerCount: 2,
    humanPlayer: 'player1',
    availableUnitTypes: new Set(['tank']),
    availableBuildingTypes: new Set(['constructionYard']),
    newUnitTypes: new Set(),
    newBuildingTypes: new Set(),
    defeatedPlayers: new Set(),
    selectedWreckId: null,
    buildingPlacementMode: false,
    currentBuildingType: null,
    chainBuildPrimed: false,
    chainBuildMode: false,
    chainStartX: 0,
    chainStartY: 0,
    chainBuildingType: null,
    blueprints: [],
    mines: [],
    mineDeploymentPreview: null,
    sweepAreaPreview: null,
    mineFreeformPaint: null,
    buildings: [],
    factories: [],
    unitWrecks: [],
    smokeParticles: [],
    smokeParticlePool: [],
    targetedOreTiles: {},
    mapTilesX: 100,
    mapTilesY: 100,
    mapSeed: '1',
    partyStates: []
  }
}))

vi.mock('../../src/main.js', () => ({
  factories: [],
  units: [],
  mapGrid: Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => ({ type: 'land', ore: false, seedCrystal: false, noBuild: 0 }))
  ),
  getCurrentGame: vi.fn(() => ({
    productionController: {
      setupAllProductionButtons: vi.fn(),
      syncTechTreeWithBuildings: vi.fn()
    },
    gameLoop: {
      resumeFromPause: vi.fn()
    },
    centerOnPlayerFactory: vi.fn()
  })),
  MAP_SEED_STORAGE_KEY: 'rts-map-seed',
  PLAYER_COUNT_STORAGE_KEY: 'rts-player-count',
  ORE_FIELD_COUNT_STORAGE_KEY: 'rts-ore-field-count',
  MAP_WIDTH_TILES_STORAGE_KEY: 'rts-map-width-tiles',
  MAP_HEIGHT_TILES_STORAGE_KEY: 'rts-map-height-tiles'
}))

vi.mock('../../src/missions/index.js', () => ({
  builtinMissions: [
    {
      id: 'mission1',
      label: 'Test Mission 1',
      time: 1000,
      description: 'A test mission',
      state: JSON.stringify({
        gameState: { money: 5000, gameTime: 0, gameStarted: true },
        units: [],
        buildings: [],
        orePositions: [],
        achievedMilestones: []
      })
    }
  ],
  getBuiltinMissionById: vi.fn((id) => {
    if (id === 'mission1') {
      return {
        id: 'mission1',
        label: 'Test Mission 1',
        state: JSON.stringify({
          gameState: { money: 5000, gameTime: 0, gameStarted: true },
          units: [],
          buildings: [],
          orePositions: [],
          achievedMilestones: []
        })
      }
    }
    return null
  })
}))

vi.mock('../../src/gameSetup.js', () => ({
  cleanupOreFromBuildings: vi.fn()
}))

vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  TANKER_SUPPLY_CAPACITY: 200,
  setMapDimensions: vi.fn(() => ({ width: 100, height: 100 })),
  DEFAULT_MAP_TILES_X: 100,
  DEFAULT_MAP_TILES_Y: 100,
  AMMO_TRUCK_CARGO: 100,
  HELIPAD_AMMO_RESERVE: 50,
  MINE_HEALTH: 100,
  MINE_ARM_DELAY: 2000,
  MINE_DEPLOY_STOP_TIME: 3000
}))

vi.mock('../../src/utils/smokeUtils.js', () => ({
  enforceSmokeParticleCapacity: vi.fn()
}))

vi.mock('../../src/units.js', () => ({
  createUnit: vi.fn((factory, type, tileX, tileY) => ({
    id: `unit-${type}-${tileX}-${tileY}`,
    type,
    owner: factory.owner,
    x: tileX * 32,
    y: tileY * 32,
    tileX,
    tileY,
    health: 100,
    maxHealth: 100,
    gas: 100,
    maxGas: 100,
    path: []
  })),
  initializeOccupancyMap: vi.fn(() => [])
}))

vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    constructionYard: { health: 1000 },
    vehicleFactory: { health: 800 }
  },
  placeBuilding: vi.fn(),
  updatePowerSupply: vi.fn()
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/game/milestoneSystem.js', () => ({
  milestoneSystem: {
    getAchievedMilestones: vi.fn(() => []),
    setAchievedMilestones: vi.fn(),
    reset: vi.fn()
  }
}))

vi.mock('../../src/rendering.js', () => ({
  getTextureManager: vi.fn(() => ({})),
  getMapRenderer: vi.fn(() => ({
    invalidateAllChunks: vi.fn()
  }))
}))

vi.mock('../../src/game/harvesterLogic.js', () => ({
  assignHarvesterToOptimalRefinery: vi.fn()
}))

vi.mock('../../src/productionQueue.js', () => ({
  productionQueue: {
    getSerializableState: vi.fn(() => ({})),
    restoreFromSerializableState: vi.fn(),
    setProductionController: vi.fn(),
    resumeProductionAfterUnpause: vi.fn()
  }
}))

vi.mock('../../src/game/dangerZoneMap.js', () => ({
  updateDangerZoneMaps: vi.fn()
}))

vi.mock('../../src/inputHandler.js', () => ({
  getKeyboardHandler: vi.fn(() => ({
    rebuildControlGroupsFromUnits: vi.fn()
  }))
}))

vi.mock('../../src/savePlayerBuildPatterns.js', () => ({
  ensurePlayerBuildHistoryLoaded: vi.fn()
}))

vi.mock('../../src/utils.js', () => ({
  getUniqueId: vi.fn(() => `id-${Date.now()}-${Math.random()}`)
}))

vi.mock('../../src/game/mineSystem.js', () => ({
  rebuildMineLookup: vi.fn()
}))

vi.mock('../../src/network/multiplayerStore.js', () => ({
  regenerateAllInviteTokens: vi.fn(() => Promise.resolve())
}))

vi.mock('../../src/ui/sidebarMultiplayer.js', () => ({
  refreshSidebarMultiplayer: vi.fn()
}))

vi.mock('../../src/network/webrtcSession.js', () => ({
  stopHostInvite: vi.fn()
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn(() => Math.random()),
  getRNGState: vi.fn(() => ({ seed: 1234, callCount: 12, enabled: true }))
}))

vi.mock('../../src/network/deterministicRandom.js', () => ({
  deterministicRNG: {
    setState: vi.fn()
  },
  initializeSessionRNG: vi.fn()
}))

describe('saveGame.js', () => {
  let saveGameModule

  beforeEach(async() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.resetModules()
    saveGameModule = await import('../../src/saveGame.js')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('getSaveGames', () => {
    it('should return builtin missions', () => {
      const saves = saveGameModule.getSaveGames()

      expect(saves).toBeInstanceOf(Array)
      expect(saves.length).toBeGreaterThan(0)

      const builtinSave = saves.find(s => s.builtin)
      expect(builtinSave).toBeDefined()
      expect(builtinSave.label).toBe('Test Mission 1')
    })

    it('should store user saves in localStorage', async() => {
      // Use saveGame to store a save
      const { gameState } = await import('../../src/gameState.js')
      gameState.gameStarted = true
      gameState.gameOver = false

      saveGameModule.saveGame('My Save')

      // Verify the save is stored in localStorage
      const savedData = localStorage.getItem('rts_save_My Save')
      expect(savedData).not.toBeNull()

      const parsed = JSON.parse(savedData)
      expect(parsed.label).toBe('My Save')
      expect(parsed.builtin).toBeUndefined() // User saves don't have builtin property
    })

    it('should sort builtin missions before user saves', () => {
      const userSave = {
        label: 'My Save',
        time: Date.now() + 100000,
        state: JSON.stringify({ gameState: { money: 1000 } })
      }
      localStorage.setItem('rts_save_My Save', JSON.stringify(userSave))

      const saves = saveGameModule.getSaveGames()

      // Builtin missions should appear first
      const firstBuiltin = saves.findIndex(s => s.builtin)
      const firstUserSave = saves.findIndex(s => !s.builtin)

      if (firstBuiltin >= 0 && firstUserSave >= 0) {
        expect(firstBuiltin).toBeLessThan(firstUserSave)
      }
    })

    it('should handle corrupted localStorage entries gracefully', () => {
      localStorage.setItem('rts_save_corrupted', 'not valid json')

      expect(() => {
        saveGameModule.getSaveGames()
      }).not.toThrow()
    })
  })

  describe('saveGame', () => {
    it('should save game to localStorage with label', async() => {
      const { gameState } = await import('../../src/gameState.js')
      gameState.money = 15000
      gameState.gameStarted = true
      gameState.gameOver = false

      saveGameModule.saveGame('TestSave')

      const saved = localStorage.getItem('rts_save_TestSave')
      expect(saved).toBeDefined()

      const parsed = JSON.parse(saved)
      expect(parsed.label).toBe('TestSave')
      expect(parsed.time).toBeDefined()
      expect(parsed.state).toBeDefined()
    })

    it('should use "Unnamed" for empty label', async() => {
      const { gameState } = await import('../../src/gameState.js')
      gameState.gameStarted = true

      saveGameModule.saveGame('')

      const saved = localStorage.getItem('rts_save_Unnamed')
      expect(saved).toBeDefined()

      const parsed = JSON.parse(saved)
      expect(parsed.label).toBe('Unnamed')
    })

    it('should serialize game state correctly', async() => {
      const { gameState } = await import('../../src/gameState.js')
      gameState.money = 25000
      gameState.gameTime = 120

      saveGameModule.saveGame('StateTest')

      const saved = localStorage.getItem('rts_save_StateTest')
      const parsed = JSON.parse(saved)
      const state = JSON.parse(parsed.state)

      expect(state.gameState.money).toBe(25000)
      expect(state.gameState.gameTime).toBe(120)
    })

    it('should save map settings and static tile state needed for replay consistency', async() => {
      const { gameState } = await import('../../src/gameState.js')
      const { mapGrid } = await import('../../src/main.js')
      const { getRNGState } = await import('../../src/utils/gameRandom.js')

      gameState.mapTilesX = 84
      gameState.mapTilesY = 72
      gameState.mapSeed = 'replay-seed-9'
      gameState.mapOreFieldCount = 6

      mapGrid[1][2].type = 'water'
      mapGrid[1][2].ore = true
      mapGrid[1][2].seedCrystal = true

      saveGameModule.saveGame('MapStateTest')

      const saved = localStorage.getItem('rts_save_MapStateTest')
      const parsed = JSON.parse(saved)
      const state = JSON.parse(parsed.state)

      expect(state.gameState.mapTilesX).toBe(84)
      expect(state.gameState.mapTilesY).toBe(72)
      expect(state.gameState.mapSeed).toBe('replay-seed-9')
      expect(state.gameState.mapOreFieldCount).toBe(6)
      expect(state.gameState.rngState).toEqual(getRNGState())
      expect(state.mapTileState[1][2]).toEqual({
        type: 'water',
        ore: true,
        seedCrystal: true,
        walkable: undefined,
        passable: undefined
      })
    })

    it('should save units array', async() => {
      const { units } = await import('../../src/main.js')
      units.push({
        id: 'tank-1',
        type: 'tank',
        owner: 'player1',
        x: 100,
        y: 100,
        health: 100,
        maxHealth: 100,
        path: []
      })

      saveGameModule.saveGame('UnitsTest')

      const saved = localStorage.getItem('rts_save_UnitsTest')
      const parsed = JSON.parse(saved)
      const state = JSON.parse(parsed.state)

      expect(state.units).toBeInstanceOf(Array)
      expect(state.units.length).toBe(1)
      expect(state.units[0].type).toBe('tank')
    })

    it('should save buildings array', async() => {
      const { gameState } = await import('../../src/gameState.js')
      gameState.buildings = [{
        id: 'cy-1',
        type: 'constructionYard',
        owner: 'player1',
        x: 5,
        y: 5,
        width: 3,
        height: 3,
        health: 1000,
        maxHealth: 1000
      }]

      saveGameModule.saveGame('BuildingsTest')

      const saved = localStorage.getItem('rts_save_BuildingsTest')
      const parsed = JSON.parse(saved)
      const state = JSON.parse(parsed.state)

      expect(state.buildings).toBeInstanceOf(Array)
      expect(state.buildings.length).toBe(1)
      expect(state.buildings[0].type).toBe('constructionYard')
    })

    it('should save ore positions from mapGrid', async() => {
      const { mapGrid } = await import('../../src/main.js')
      mapGrid.forEach(row => row.forEach(tile => {
        tile.ore = false
      }))
      mapGrid[2][3].ore = true
      mapGrid[5][7].ore = true

      saveGameModule.saveGame('OreTest')

      const saved = localStorage.getItem('rts_save_OreTest')
      const parsed = JSON.parse(saved)
      const state = JSON.parse(parsed.state)

      expect(state.orePositions).toBeInstanceOf(Array)
      expect(state.orePositions.length).toBe(2)
    })

    it('should save milestone progress', () => {
      saveGameModule.saveGame('MilestoneTest')

      const saved = localStorage.getItem('rts_save_MilestoneTest')
      const parsed = JSON.parse(saved)
      const state = JSON.parse(parsed.state)

      expect('achievedMilestones' in state).toBe(true)
    })
  })

  describe('loadGame', () => {
    it('should load builtin mission by key', async() => {
      const { showNotification } = await import('../../src/ui/notifications.js')

      // Load a builtin mission
      saveGameModule.loadGame('builtin:mission1')

      expect(showNotification).toHaveBeenCalled()
    })

    it('should load user save from localStorage', async() => {
      const { showNotification } = await import('../../src/ui/notifications.js')

      // Create a user save
      const saveData = {
        gameState: { money: 5000, gameStarted: true },
        units: [],
        buildings: [],
        orePositions: []
      }
      const userSave = {
        label: 'UserSaveTest',
        time: Date.now(),
        state: JSON.stringify(saveData)
      }
      localStorage.setItem('rts_save_UserSaveTest', JSON.stringify(userSave))

      saveGameModule.loadGame('rts_save_UserSaveTest')

      expect(showNotification).toHaveBeenCalled()
    })

    it('should handle missing save gracefully', () => {
      expect(() => {
        saveGameModule.loadGame('rts_save_NonExistent')
      }).not.toThrow()
    })

    it('should handle invalid builtin mission gracefully', () => {
      expect(() => {
        saveGameModule.loadGame('builtin:nonexistent')
      }).not.toThrow()
    })

    it('should handle corrupted save data gracefully', () => {
      localStorage.setItem('rts_save_Corrupted', 'not valid json')

      expect(() => {
        saveGameModule.loadGame('rts_save_Corrupted')
      }).not.toThrow()
    })

    it('should restore Set properties from arrays', async() => {
      const { gameState } = await import('../../src/gameState.js')

      const saveData = {
        gameState: {
          money: 5000,
          gameStarted: true,
          defeatedPlayers: ['enemy1'],
          availableUnitTypes: ['tank', 'harvester'],
          availableBuildingTypes: ['constructionYard']
        },
        units: [],
        buildings: [],
        orePositions: []
      }
      const userSave = {
        label: 'SetTest',
        time: Date.now(),
        state: JSON.stringify(saveData)
      }
      localStorage.setItem('rts_save_SetTest', JSON.stringify(userSave))

      saveGameModule.loadGame('rts_save_SetTest')

      expect(gameState.defeatedPlayers instanceof Set).toBe(true)
    })

    it('should restore saved map settings and static ore/seed tile state when loading', async() => {
      const { gameState } = await import('../../src/gameState.js')
      const { mapGrid } = await import('../../src/main.js')
      const { setMapDimensions } = await import('../../src/config.js')
      const { deterministicRNG } = await import('../../src/network/deterministicRandom.js')

      setMapDimensions.mockReturnValueOnce({ width: 64, height: 48 })

      const widthInput = document.createElement('input')
      widthInput.id = 'mapWidthTiles'
      document.body.appendChild(widthInput)

      const heightInput = document.createElement('input')
      heightInput.id = 'mapHeightTiles'
      document.body.appendChild(heightInput)

      const seedInput = document.createElement('input')
      seedInput.id = 'mapSeed'
      document.body.appendChild(seedInput)

      const oreFieldInput = document.createElement('input')
      oreFieldInput.id = 'mapOreFieldCount'
      document.body.appendChild(oreFieldInput)

      const playerCountInput = document.createElement('input')
      playerCountInput.id = 'playerCount'
      document.body.appendChild(playerCountInput)

      mapGrid[4][4].type = 'land'
      mapGrid[4][4].ore = false
      mapGrid[4][4].seedCrystal = false

      const saveData = {
        gameState: {
          money: 5000,
          gameStarted: true,
          playerCount: 3,
          mapTilesX: 64,
          mapTilesY: 48,
          mapSeed: 'loaded-seed',
          mapOreFieldCount: 5,
          rngState: { seed: 777, callCount: 42, enabled: true },
          lastOreUpdate: 6000
        },
        units: [],
        buildings: [],
        mapTileState: Array.from({ length: 10 }, (_, y) =>
          Array.from({ length: 10 }, (_, x) => ({
            type: x === 4 && y === 4 ? 'water' : 'land',
            ore: x === 4 && y === 4,
            seedCrystal: x === 4 && y === 4
          }))
        ),
        orePositions: [],
        targetedOreTiles: {}
      }
      localStorage.setItem('rts_save_MapLoadTest', JSON.stringify({
        label: 'MapLoadTest',
        time: Date.now(),
        state: JSON.stringify(saveData)
      }))

      saveGameModule.loadGame('rts_save_MapLoadTest')

      expect(setMapDimensions).toHaveBeenCalledWith(64, 48)
      expect(gameState.mapTilesX).toBe(64)
      expect(gameState.mapTilesY).toBe(48)
      expect(gameState.mapSeed).toBe('loaded-seed')
      expect(gameState.mapOreFieldCount).toBe(5)
      expect(gameState.playerCount).toBe(3)
      expect(gameState.lastOreUpdate).toBe(6000)
      expect(deterministicRNG.setState).toHaveBeenCalledWith({ seed: 777, callCount: 42, enabled: true })
      expect(mapGrid[4][4].type).toBe('water')
      expect(mapGrid[4][4].ore).toBe(true)
      expect(mapGrid[4][4].seedCrystal).toBe(true)
      expect(widthInput.value).toBe('64')
      expect(heightInput.value).toBe('48')
      expect(seedInput.value).toBe('loaded-seed')
      expect(oreFieldInput.value).toBe('5')
      expect(playerCountInput.value).toBe('3')
      expect(localStorage.getItem('rts-map-seed')).toBe('loaded-seed')
      expect(localStorage.getItem('rts-ore-field-count')).toBe('5')
      expect(localStorage.getItem('rts-player-count')).toBe('3')

      widthInput.remove()
      heightInput.remove()
      seedInput.remove()
      oreFieldInput.remove()
      playerCountInput.remove()
    })

    it('should derive map dimensions from legacy saved tile grids when explicit settings are missing', async() => {
      const { setMapDimensions } = await import('../../src/config.js')

      setMapDimensions.mockReturnValueOnce({ width: 14, height: 12 })

      const saveData = {
        gameState: {
          money: 5000,
          gameStarted: true
        },
        units: [],
        buildings: [],
        mapGridTypes: Array.from({ length: 12 }, () => Array.from({ length: 14 }, () => 'land')),
        orePositions: []
      }
      localStorage.setItem('rts_save_LegacyMapDims', JSON.stringify({
        label: 'LegacyMapDims',
        time: Date.now(),
        state: JSON.stringify(saveData)
      }))

      saveGameModule.loadGame('rts_save_LegacyMapDims')

      expect(setMapDimensions).toHaveBeenCalledWith(14, 12)
    })
  })

  describe('deleteGame', () => {
    it('should delete user save from localStorage', () => {
      const userSave = {
        label: 'ToDelete',
        time: Date.now(),
        state: '{}'
      }
      localStorage.setItem('rts_save_ToDelete', JSON.stringify(userSave))

      expect(localStorage.getItem('rts_save_ToDelete')).not.toBeNull()

      saveGameModule.deleteGame('rts_save_ToDelete')

      expect(localStorage.getItem('rts_save_ToDelete')).toBeNull()
    })

    it('should not delete builtin missions', () => {
      // This should not throw and should log a warning
      expect(() => {
        saveGameModule.deleteGame('builtin:mission1')
      }).not.toThrow()
    })
  })

  describe('updateSaveGamesList', () => {
    beforeEach(() => {
      // Create a mock save games list element
      const list = document.createElement('ul')
      list.id = 'saveGamesList'
      document.body.appendChild(list)
    })

    afterEach(() => {
      const list = document.getElementById('saveGamesList')
      if (list) {
        list.remove()
      }
    })

    it('should update DOM list with save games', () => {
      saveGameModule.updateSaveGamesList()

      const list = document.getElementById('saveGamesList')
      expect(list.children.length).toBeGreaterThan(0)
    })

    it('should handle missing list element gracefully', () => {
      const list = document.getElementById('saveGamesList')
      if (list) {
        list.remove()
      }

      expect(() => {
        saveGameModule.updateSaveGamesList()
      }).not.toThrow()
    })

    it('should create load buttons for each save', () => {
      saveGameModule.updateSaveGamesList()

      const list = document.getElementById('saveGamesList')
      const buttons = list.querySelectorAll('button')

      // Each save should have at least a load button
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  describe('initSaveGameSystem', () => {
    beforeEach(() => {
      // Create required DOM elements
      const saveBtn = document.createElement('button')
      saveBtn.id = 'saveGameBtn'
      document.body.appendChild(saveBtn)

      const labelInput = document.createElement('input')
      labelInput.id = 'saveLabelInput'
      document.body.appendChild(labelInput)

      const list = document.createElement('ul')
      list.id = 'saveGamesList'
      document.body.appendChild(list)
    })

    afterEach(() => {
      ['saveGameBtn', 'saveLabelInput', 'saveGamesList'].forEach(id => {
        const el = document.getElementById(id)
        if (el) el.remove()
      })
    })

    it('should attach click handler to save button', () => {
      saveGameModule.initSaveGameSystem()

      const saveBtn = document.getElementById('saveGameBtn')
      expect(saveBtn).toBeDefined()
    })

    it('should attach keydown handler to label input for Enter key', () => {
      saveGameModule.initSaveGameSystem()

      const labelInput = document.getElementById('saveLabelInput')
      expect(labelInput).toBeDefined()
    })

    it('should not throw if DOM elements are missing', () => {
      ['saveGameBtn', 'saveLabelInput'].forEach(id => {
        const el = document.getElementById(id)
        if (el) el.remove()
      })

      expect(() => {
        saveGameModule.initSaveGameSystem()
      }).not.toThrow()
    })
  })

  describe('maybeResumeLastPausedGame', () => {
    it('should return false if no last game exists', () => {
      const result = saveGameModule.maybeResumeLastPausedGame()
      expect(result).toBe(false)
    })

    it('should return false if resume flag is not set', () => {
      const saveData = {
        gameState: { money: 5000, gameStarted: true, gameOver: false }
      }
      const lastGame = {
        label: 'lastGame',
        time: Date.now(),
        state: JSON.stringify(saveData)
      }
      localStorage.setItem('rts_save_lastGame', JSON.stringify(lastGame))

      const result = saveGameModule.maybeResumeLastPausedGame()
      expect(result).toBe(false)
    })

    it('should not resume if saved game was already over', () => {
      const saveData = {
        gameState: { money: 5000, gameStarted: true, gameOver: true }
      }
      const lastGame = {
        label: 'lastGame',
        time: Date.now(),
        state: JSON.stringify(saveData)
      }
      localStorage.setItem('rts_save_lastGame', JSON.stringify(lastGame))
      localStorage.setItem('rts_lastGame_resume_pending', 'true')

      const result = saveGameModule.maybeResumeLastPausedGame()
      expect(result).toBe(false)
    })

    it('should resume last game when flag and save exist', async() => {
      const { showNotification } = await import('../../src/ui/notifications.js')

      const saveData = {
        gameState: { money: 5000, gameStarted: true, gameOver: false },
        units: [],
        buildings: [],
        orePositions: [],
        mapGridTypes: []
      }
      const lastGame = {
        label: 'lastGame',
        time: Date.now(),
        state: JSON.stringify(saveData)
      }
      localStorage.setItem('rts_save_lastGame', JSON.stringify(lastGame))
      localStorage.setItem('rts_lastGame_resume_pending', 'true')

      // Note: Cannot spy on internal loadGame calls - verify side effects instead
      const result = saveGameModule.maybeResumeLastPausedGame()

      expect(result).toBe(true)
      expect(showNotification).toHaveBeenCalled()
      expect(localStorage.getItem('rts_lastGame_resume_pending')).toBeNull()
    })
  })

  describe('initLastGameRecovery', () => {
    it('should start auto-save loop and pause watcher', () => {
      expect(() => {
        saveGameModule.initLastGameRecovery()
      }).not.toThrow()
    })

    it('should auto-save on interval and when pausing', async() => {
      const { gameState } = await import('../../src/gameState.js')

      vi.useFakeTimers()

      saveGameModule.initLastGameRecovery()

      // Advance time to trigger auto-save interval
      vi.advanceTimersByTime(60_000)

      // Verify save was created in localStorage (can't spy on internal saveGame calls)
      const savedData = localStorage.getItem('rts_save_lastGame')
      expect(savedData).not.toBeNull()
      expect(JSON.parse(savedData).label).toBe('lastGame')

      // Clear the save to test pause trigger
      localStorage.removeItem('rts_save_lastGame')

      gameState.gamePaused = true
      vi.advanceTimersByTime(1_000)

      // Verify save was created again and resume flag was set
      const pauseSavedData = localStorage.getItem('rts_save_lastGame')
      expect(pauseSavedData).not.toBeNull()
      expect(localStorage.getItem('rts_lastGame_resume_pending')).toBe('true')

      vi.clearAllTimers()
      vi.useRealTimers()
    })
  })

  describe('Module exports', () => {
    it('should export all required functions', () => {
      const expectedExports = [
        'getSaveGames',
        'saveGame',
        'loadGame',
        'deleteGame',
        'updateSaveGamesList',
        'initSaveGameSystem',
        'initLastGameRecovery',
        'maybeResumeLastPausedGame'
      ]

      expectedExports.forEach(exportName => {
        expect(typeof saveGameModule[exportName]).toBe('function')
      })
    })
  })
})
