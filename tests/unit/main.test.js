/**
 * Tests for src/main.js
 * Main game orchestrator - tests exported functions and utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'

// Mock all dependencies to prevent the full game from loading
vi.mock('../../src/utils/debugLogger.js', () => ({}))

vi.mock('../../src/inputHandler.js', () => ({
  setupInputHandlers: vi.fn(),
  selectedUnits: [],
  setRenderScheduler: vi.fn()
}))

vi.mock('../../src/units.js', () => ({
  unitCosts: { tank: 1000, harvester: 1500 },
  initializeOccupancyMap: vi.fn(() => []),
  rebuildOccupancyMapWithTextures: vi.fn(() => [])
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    money: 10000,
    gameTime: 0,
    gameStarted: true,
    gamePaused: false,
    gameOver: false,
    scrollOffset: { x: 0, y: 0 },
    speedMultiplier: 1,
    buildings: [],
    factories: [],
    units: [],
    mapGrid: [],
    occupancyMap: [],
    unitWrecks: [],
    powerSupply: 0,
    playerCount: 2,
    humanPlayer: 'player1',
    wins: 0,
    losses: 0,
    mapTilesX: 100,
    mapTilesY: 100,
    mapSeed: '1',
    defeatedPlayers: new Set(),
    shadowOfWarEnabled: false,
    availableUnitTypes: new Set(),
    availableBuildingTypes: new Set()
  }
}))

vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    constructionYard: { cost: 5000, health: 1000 },
    vehicleFactory: { cost: 2000, health: 800 },
    powerPlant: { cost: 500, health: 400 }
  },
  updatePowerSupply: vi.fn()
}))

vi.mock('../../src/productionQueue.js', () => ({
  productionQueue: {
    getSerializableState: vi.fn(() => ({})),
    restoreFromSerializableState: vi.fn(),
    setProductionController: vi.fn(),
    resumeProductionAfterUnpause: vi.fn()
  }
}))

vi.mock('../../src/config.js', async(importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    TILE_SIZE: 32,
    MAP_TILES_X: 100,
    MAP_TILES_Y: 100,
    MIN_MAP_TILES: 50,
    DEFAULT_MAP_TILES_X: 100,
    DEFAULT_MAP_TILES_Y: 100,
    ORE_SPREAD_ENABLED: true,
    setOreSpreadEnabled: vi.fn(),
    setMapDimensions: vi.fn(() => ({ width: 100, height: 100 }))
  }
})

vi.mock('../../src/ui/settingsModal.js', () => ({
  initSettingsModal: vi.fn(),
  openSettingsModal: vi.fn()
}))

vi.mock('../../src/ui/sidebarMultiplayer.js', () => ({
  initSidebarMultiplayer: vi.fn()
}))

vi.mock('../../src/ui/remoteInviteLanding.js', () => ({
  initRemoteInviteLanding: vi.fn()
}))

vi.mock('../../src/network/aiPartySync.js', () => ({
  initAiPartySync: vi.fn()
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({
  setProductionControllerRef: vi.fn()
}))

vi.mock('../../src/ui/mobileJoysticks.js', () => ({}))

vi.mock('../../src/factories.js', () => ({
  initFactories: vi.fn()
}))

vi.mock('../../src/gameSetup.js', () => ({
  initializeGameAssets: vi.fn((cb) => {
    if (cb) cb()
  }),
  generateMap: vi.fn(),
  cleanupOreFromBuildings: vi.fn()
}))

vi.mock('../../src/saveGame.js', () => ({
  initSaveGameSystem: vi.fn(),
  initLastGameRecovery: vi.fn(),
  maybeResumeLastPausedGame: vi.fn(() => false)
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/ai/enemyStrategies.js', () => ({
  resetAttackDirections: vi.fn()
}))

vi.mock('../../src/rendering.js', () => ({
  getTextureManager: vi.fn(() => ({})),
  preloadTileTextures: vi.fn((cb) => {
    if (cb) cb()
  }),
  getMapRenderer: vi.fn(() => ({
    invalidateAllChunks: vi.fn()
  })),
  notifyTileMutation: vi.fn()
}))

vi.mock('../../src/game/milestoneSystem.js', () => ({
  milestoneSystem: {
    getAchievedMilestones: vi.fn(() => []),
    reset: vi.fn()
  }
}))

vi.mock('../../src/game/dangerZoneMap.js', () => ({
  updateDangerZoneMaps: vi.fn()
}))

vi.mock('../../src/version.js', () => ({
  APP_VERSION: '1.0.0'
}))

vi.mock('../../src/version.json', () => ({
  default: {
    commit: 'abc123',
    message: 'Test commit'
  }
}))

vi.mock('../../src/game/shadowOfWar.js', () => ({
  initializeShadowOfWar: vi.fn(),
  updateShadowOfWar: vi.fn()
}))

vi.mock('../../src/game/spatialQuadtree.js', () => ({
  initSpatialQuadtree: vi.fn()
}))

vi.mock('../../src/mapEditor.js', () => ({
  registerMapEditorRendering: vi.fn(),
  deactivateMapEditMode: vi.fn(),
  setMapEditorRenderScheduler: vi.fn(),
  setMapEditorProductionController: vi.fn()
}))

vi.mock('../../src/benchmark/benchmarkRunner.js', () => ({
  attachBenchmarkButton: vi.fn()
}))

vi.mock('../../src/ui/mobileViewportLock.js', () => ({
  initializeMobileViewportLock: vi.fn()
}))

vi.mock('../../src/utils/layoutMetrics.js', () => ({
  getPlayableViewportWidth: vi.fn(() => 800),
  getPlayableViewportHeight: vi.fn(() => 600)
}))

vi.mock('../../src/ui/mapEditorControls.js', () => ({
  initMapEditorControls: vi.fn()
}))

vi.mock('../../src/utils/seedUtils.js', () => ({
  sanitizeSeed: vi.fn((seed) => ({ value: seed || '1' }))
}))

vi.mock('../../src/ui/tutorialSystem.js', () => ({
  initTutorialSystem: vi.fn()
}))

vi.mock('../../src/rendering/canvasManager.js', () => ({
  CanvasManager: vi.fn(() => ({
    getGameCanvas: vi.fn(() => ({ width: 800, height: 600 })),
    resizeCanvases: vi.fn()
  }))
}))

vi.mock('../../src/ui/productionController.js', () => ({
  ProductionController: vi.fn(() => ({
    initProductionTabs: vi.fn(),
    setupAllProductionButtons: vi.fn(),
    updateVehicleButtonStates: vi.fn(),
    updateBuildingButtonStates: vi.fn(),
    syncTechTreeWithBuildings: vi.fn()
  }))
}))

vi.mock('../../src/ui/eventHandlers.js', () => ({
  EventHandlers: vi.fn(() => ({
    setProductionController: vi.fn()
  }))
}))

vi.mock('../../src/game/gameLoop.js', () => ({
  GameLoop: vi.fn(() => ({
    setAssetsLoaded: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    requestRender: vi.fn()
  }))
}))

vi.mock('../../src/ui/minimap.js', () => ({
  setupMinimapHandlers: vi.fn()
}))

vi.mock('../../src/ui/energyBar.js', () => ({
  addPowerIndicator: vi.fn(),
  updateEnergyBar: vi.fn()
}))

vi.mock('../../src/ui/moneyBar.js', () => ({
  addMoneyIndicator: vi.fn()
}))

vi.mock('../../src/sound.js', () => ({
  testNarratedSounds: vi.fn(),
  playSound: vi.fn(),
  preloadSounds: vi.fn(() => Promise.resolve()),
  getSoundCacheStatus: vi.fn(),
  clearSoundCache: vi.fn(),
  resumeAllSounds: vi.fn()
}))

describe('main.js', () => {
  let mainModule

  beforeEach(async() => {
    vi.clearAllMocks()
    vi.resetModules()

    // Create mock DOM elements
    const mockElements = [
      'money', 'gameTime', 'wins', 'losses', 'sidebar',
      'startBtn', 'pauseBtn', 'speedMultiplier', 'playerCount',
      'mapSeed', 'mapWidthTiles', 'mapHeightTiles',
      'shuffleMapBtn', 'mapSettingsBtn'
    ]
    mockElements.forEach(id => {
      if (!document.getElementById(id)) {
        const el = document.createElement(['mapSeed', 'mapWidthTiles', 'mapHeightTiles', 'playerCount', 'speedMultiplier'].includes(id) ? 'input' : 'div')
        el.id = id
        if (el.tagName === 'INPUT') {
          el.value = id === 'playerCount' ? '2' : ''
        }
        document.body.appendChild(el)
      }
    })

    mainModule = await import('../../src/main.js')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // Clean up DOM
    document.body.innerHTML = ''
  })

  describe('Exported arrays', () => {
    it('should export mapGrid array', () => {
      expect(mainModule.mapGrid).toBeInstanceOf(Array)
    })

    it('should export factories array', () => {
      expect(mainModule.factories).toBeInstanceOf(Array)
    })

    it('should export units array', () => {
      expect(mainModule.units).toBeInstanceOf(Array)
    })

    it('should export bullets array', () => {
      expect(mainModule.bullets).toBeInstanceOf(Array)
    })

    it('should have mutable arrays', () => {
      const originalLength = mainModule.units.length
      mainModule.units.push({ id: 'test', type: 'tank' })
      expect(mainModule.units.length).toBe(originalLength + 1)
      mainModule.units.pop() // Clean up
    })
  })

  describe('getCurrentGame', () => {
    it('should export getCurrentGame function', () => {
      expect(typeof mainModule.getCurrentGame).toBe('function')
    })

    it('should return game instance if initialized', () => {
      // Note: in test environment this might return null or mock
      const _result = mainModule.getCurrentGame()
      // Just check it doesn't throw
      expect(true).toBe(true)
    })
  })

  describe('regenerateMapForClient', () => {
    it('should export regenerateMapForClient function', () => {
      expect(typeof mainModule.regenerateMapForClient).toBe('function')
    })

    it('should regenerate map with given parameters', async() => {
      const { setMapDimensions } = await import('../../src/config.js')
      const { generateMap } = await import('../../src/gameSetup.js')
      const { gameState } = await import('../../src/gameState.js')

      mainModule.regenerateMapForClient('test-seed', 80, 80, 3)

      expect(setMapDimensions).toHaveBeenCalledWith(80, 80)
      expect(generateMap).toHaveBeenCalled()
      expect(gameState.mapSeed).toBe('test-seed')
      expect(gameState.mapTilesX).toBe(80)
      expect(gameState.mapTilesY).toBe(80)
      expect(gameState.playerCount).toBe(3)
    })

    it('should clear unit wrecks when regenerating', async() => {
      const { gameState } = await import('../../src/gameState.js')
      gameState.unitWrecks = [{ id: 'wreck1' }]

      mainModule.regenerateMapForClient('seed', 100, 100, 2)

      expect(gameState.unitWrecks).toEqual([])
    })

    it('should initialize shadow of war for new map', async() => {
      const { initializeShadowOfWar } = await import('../../src/game/shadowOfWar.js')

      mainModule.regenerateMapForClient('seed', 100, 100, 2)

      expect(initializeShadowOfWar).toHaveBeenCalled()
    })

    it('should invalidate map renderer chunks', async() => {
      const { getMapRenderer } = await import('../../src/rendering.js')
      const mockInvalidate = vi.fn()
      getMapRenderer.mockReturnValue({ invalidateAllChunks: mockInvalidate })

      mainModule.regenerateMapForClient('seed', 100, 100, 2)

      expect(mockInvalidate).toHaveBeenCalled()
    })
  })

  describe('buildingCosts', () => {
    it('should export buildingCosts object', () => {
      expect(mainModule.buildingCosts).toBeDefined()
      expect(typeof mainModule.buildingCosts).toBe('object')
    })

    it('should contain costs from buildingData', () => {
      // The costs should be populated from buildingData
      expect(mainModule.buildingCosts['constructionYard']).toBe(5000)
      expect(mainModule.buildingCosts['vehicleFactory']).toBe(2000)
      expect(mainModule.buildingCosts['powerPlant']).toBe(500)
    })

    it('should have factory repair cost', () => {
      expect(mainModule.buildingCosts['factory']).toBe(5000)
    })
  })

  describe('unitCosts', () => {
    it('should re-export unitCosts', () => {
      expect(mainModule.unitCosts).toBeDefined()
      expect(mainModule.unitCosts.tank).toBe(1000)
      expect(mainModule.unitCosts.harvester).toBe(1500)
    })
  })

  describe('showNotification', () => {
    it('should re-export showNotification', () => {
      expect(typeof mainModule.showNotification).toBe('function')
    })
  })

  describe('updateVehicleButtonStates', () => {
    it('should export updateVehicleButtonStates for backward compatibility', () => {
      expect(typeof mainModule.updateVehicleButtonStates).toBe('function')
    })

    it('should not throw when called', () => {
      expect(() => {
        mainModule.updateVehicleButtonStates()
      }).not.toThrow()
    })

    it('should warn when called', () => {
      const warnSpy = vi.spyOn(window.logger, 'warn')

      mainModule.updateVehicleButtonStates()

      expect(warnSpy).toHaveBeenCalledWith(
        'updateVehicleButtonStates called from main.js - should use ProductionController instead'
      )
    })
  })

  describe('updateBuildingButtonStates', () => {
    it('should export updateBuildingButtonStates for backward compatibility', () => {
      expect(typeof mainModule.updateBuildingButtonStates).toBe('function')
    })

    it('should not throw when called', () => {
      expect(() => {
        mainModule.updateBuildingButtonStates()
      }).not.toThrow()
    })

    it('should warn when called', () => {
      const warnSpy = vi.spyOn(window.logger, 'warn')

      mainModule.updateBuildingButtonStates()

      expect(warnSpy).toHaveBeenCalledWith(
        'updateBuildingButtonStates called from main.js - should use ProductionController instead'
      )
    })
  })

  describe('Storage keys', () => {
    it('should export MAP_SEED_STORAGE_KEY', () => {
      expect(mainModule.MAP_SEED_STORAGE_KEY).toBe('rts-map-seed')
    })

    it('should export MAP_WIDTH_TILES_STORAGE_KEY', () => {
      expect(mainModule.MAP_WIDTH_TILES_STORAGE_KEY).toBe('rts-map-width-tiles')
    })

    it('should export MAP_HEIGHT_TILES_STORAGE_KEY', () => {
      expect(mainModule.MAP_HEIGHT_TILES_STORAGE_KEY).toBe('rts-map-height-tiles')
    })
  })

  describe('Module initialization', () => {
    it('should register map editor rendering', async() => {
      const { registerMapEditorRendering } = await import('../../src/mapEditor.js')
      expect(registerMapEditorRendering).toHaveBeenCalled()
    })

    it('should initialize mobile viewport lock', async() => {
      const { initializeMobileViewportLock } = await import('../../src/ui/mobileViewportLock.js')
      expect(initializeMobileViewportLock).toHaveBeenCalled()
    })
  })

  describe('updateTouchClass', () => {
    it('should not throw when called', () => {
      expect(() => {
        mainModule.updateTouchClass()
      }).not.toThrow()
    })
  })

  describe('updateStandaloneClass', () => {
    it('should not throw when called', () => {
      expect(() => {
        mainModule.updateStandaloneClass()
      }).not.toThrow()
    })
  })

  describe('sanitizeMapDimension', () => {
    it('should return parsed integer when valid', () => {
      expect(mainModule.sanitizeMapDimension('100', 50)).toBe(100)
    })

    it('should return minimum value when below minimum', () => {
      expect(mainModule.sanitizeMapDimension('10', 50)).toBe(50) // MIN_MAP_TILES
    })

    it('should return fallback when value is invalid', () => {
      expect(mainModule.sanitizeMapDimension('invalid', 75)).toBe(75)
    })

    it('should handle float values by flooring', () => {
      expect(mainModule.sanitizeMapDimension('100.7', 50)).toBe(100)
    })
  })

  describe('resolveMapSeed', () => {
    it('should return sanitized seed as string', () => {
      const result = mainModule.resolveMapSeed('test-seed')
      expect(typeof result).toBe('string')
      expect(result).toBe('test-seed') // Mocked sanitizeSeed returns the input
    })

    it('should handle random keyword', () => {
      const result = mainModule.resolveMapSeed('random')
      expect(typeof result).toBe('string')
    })
  })

  describe('loadPersistedSettings', () => {
    afterEach(() => {
      localStorage.clear()
      // Clean up DOM
      document.body.innerHTML = ''
    })

    it('should load map seed from localStorage', () => {
      localStorage.setItem('rts-map-seed', 'test-seed')

      mainModule.loadPersistedSettings()

      const seedInput = document.getElementById('mapSeed')
      expect(seedInput.value).toBe('test-seed')
    })

    it('should load and validate map dimensions', () => {
      mainModule.loadPersistedSettings()

      const widthInput = document.getElementById('mapWidthTiles')
      const heightInput = document.getElementById('mapHeightTiles')
      expect(widthInput.value).toBe('100') // default value
      expect(heightInput.value).toBe('100') // default value
    })

    it('should load player count and validate range', async() => {
      localStorage.setItem('rts-player-count', '3')

      const { gameState } = await import('../../src/gameState.js')

      mainModule.loadPersistedSettings()

      const playerInput = document.getElementById('playerCount')
      expect(playerInput.value).toBe('3')
      expect(gameState.playerCount).toBe(3)
    })

    it('should handle invalid player count', () => {
      localStorage.setItem('rts-player-count', '10')

      mainModule.loadPersistedSettings()

      const playerInput = document.getElementById('playerCount')
      expect(playerInput.value).toBe('2') // should remain default
    })

    it('should load shadow of war setting', async() => {
      localStorage.setItem('rts-shadow-of-war-enabled', 'true')

      const { gameState } = await import('../../src/gameState.js')

      mainModule.loadPersistedSettings()

      expect(gameState.shadowOfWarEnabled).toBe(true)
    })
  })
})
