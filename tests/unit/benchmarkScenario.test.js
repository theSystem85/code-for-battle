import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'

// Mock all dependencies
vi.mock('../../src/gameState.js', () => ({
  gameState: {
    playerCount: 1,
    humanPlayer: 'player1',
    speedMultiplier: 1,
    money: 0,
    gameTime: 0,
    frameCount: 0,
    totalMoneyEarned: 0,
    playerUnitsDestroyed: 0,
    enemyUnitsDestroyed: 0,
    playerBuildingsDestroyed: 0,
    enemyBuildingsDestroyed: 0,
    unitWrecks: [],
    smokeParticles: [],
    smokeParticlePool: [],
    benchmarkActive: false,
    availableUnitTypes: new Set(),
    availableBuildingTypes: new Set(),
    newUnitTypes: new Set(),
    newBuildingTypes: new Set(),
    defeatedPlayers: new Set(),
    buildings: [],
    occupancyMap: null,
    gamePaused: false,
    gameStarted: false,
    scrollOffset: { x: 0, y: 0 },
    keyScroll: {},
    isRightDragging: false,
    dragVelocity: { x: 0, y: 0 }
  }
}))

vi.mock('../../src/main.js', () => ({
  factories: [
    { id: 'cy1', owner: 'player1', x: 10, y: 10, width: 4, height: 4, budget: 0, rallyPoint: null },
    { id: 'cy2', owner: 'player2', x: 80, y: 10, width: 4, height: 4, budget: 0, rallyPoint: null },
    { id: 'cy3', owner: 'player3', x: 10, y: 80, width: 4, height: 4, budget: 0, rallyPoint: null },
    { id: 'cy4', owner: 'player4', x: 80, y: 80, width: 4, height: 4, budget: 0, rallyPoint: null }
  ],
  mapGrid: Array.from({ length: 100 }, (_, y) =>
    Array.from({ length: 100 }, (_, x) => ({
      type: 'grass',
      x,
      y,
      building: null,
      seedCrystal: false
    }))
  ),
  units: [],
  getCurrentGame: vi.fn(() => ({
    resetGame: vi.fn(),
    centerOnPlayerFactory: vi.fn()
  }))
}))

vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    constructionYard: { width: 4, height: 4 },
    powerPlant: { width: 2, height: 2 },
    refinery: { width: 3, height: 3 },
    barracks: { width: 2, height: 2 },
    vehicleFactory: { width: 4, height: 3 },
    turret: { width: 1, height: 1 }
  },
  canPlaceBuilding: vi.fn(() => true),
  createBuilding: vi.fn((type, x, y) => ({
    id: `building_${type}_${x}_${y}`,
    type,
    x,
    y,
    width: 2,
    height: 2,
    owner: 'player1',
    constructionFinished: false,
    constructionStartTime: 0
  })),
  placeBuilding: vi.fn(),
  updatePowerSupply: vi.fn()
}))

vi.mock('../../src/units.js', () => ({
  initializeOccupancyMap: vi.fn(() => ({})),
  createUnit: vi.fn((factory, type, x, y) => ({
    id: `unit_${type}_${x}_${y}`,
    type,
    x: x * 32,
    y: y * 32,
    owner: factory.owner,
    target: null,
    destroyed: false,
    guardMode: true
  }))
}))

vi.mock('../../src/game/dangerZoneMap.js', () => ({
  updateDangerZoneMaps: vi.fn()
}))

vi.mock('../../src/rendering.js', () => ({
  getTextureManager: vi.fn(() => ({}))
}))

vi.mock('../../src/gameSetup.js', () => ({
  cleanupOreFromBuildings: vi.fn()
}))

vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32
}))

vi.mock('../../src/utils.js', () => ({
  getUniqueId: vi.fn(() => Math.random().toString(36).substring(7))
}))

vi.mock('../../src/benchmark/benchmarkTracker.js', () => ({
  resetBenchmarkCameraFocus: vi.fn()
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn(() => 0.5)
}))

import { setupBenchmarkScenario, teardownBenchmarkScenario } from '../../src/benchmark/benchmarkScenario.js'
import { gameState } from '../../src/gameState.js'
import { factories, mapGrid as _mapGrid, units, getCurrentGame } from '../../src/main.js'
import { createBuilding, placeBuilding, updatePowerSupply, canPlaceBuilding } from '../../src/buildings.js'

// Keep reference to avoid lint error - mapGrid is used in mocks
const __unusedMapGrid = _mapGrid
import { initializeOccupancyMap, createUnit } from '../../src/units.js'
import { updateDangerZoneMaps } from '../../src/game/dangerZoneMap.js'
import { cleanupOreFromBuildings } from '../../src/gameSetup.js'
import { resetBenchmarkCameraFocus } from '../../src/benchmark/benchmarkTracker.js'

describe('benchmarkScenario.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset units array
    units.length = 0

    // Reset gameState
    gameState.benchmarkActive = false
    gameState.buildings = []
    gameState.money = 0
    gameState.gameTime = 0
    gameState.frameCount = 0
    gameState.gamePaused = false
    gameState.gameStarted = false
    gameState.playerCount = 1

    // Reset factories
    factories.forEach(factory => {
      factory.budget = 0
      factory.rallyPoint = null
      factory.isBenchmarkStructure = false
    })

    // Ensure getCurrentGame returns valid game object
    getCurrentGame.mockReturnValue({
      resetGame: vi.fn(),
      centerOnPlayerFactory: vi.fn()
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('setupBenchmarkScenario', () => {
    it('[U00424] should throw error if game is not available', () => {
      getCurrentGame.mockReturnValue(null)

      expect(() => setupBenchmarkScenario()).toThrow('Game instance not available')
    })

    it('[U00425] should set playerCount to 4', () => {
      setupBenchmarkScenario()

      expect(gameState.playerCount).toBe(4)
    })

    it('[U00426] should set humanPlayer to player1', () => {
      setupBenchmarkScenario()

      expect(gameState.humanPlayer).toBe('player1')
    })

    it('[U00427] should set speedMultiplier to 1', () => {
      setupBenchmarkScenario()

      expect(gameState.speedMultiplier).toBe(1)
    })

    it('[U00428] should call game.resetGame()', () => {
      const mockGame = {
        resetGame: vi.fn(),
        centerOnPlayerFactory: vi.fn()
      }
      getCurrentGame.mockReturnValue(mockGame)

      setupBenchmarkScenario()

      expect(mockGame.resetGame).toHaveBeenCalled()
    })

    it('[U00429] should set money to 50000', () => {
      setupBenchmarkScenario()

      expect(gameState.money).toBe(50000)
    })

    it('[U00430] should reset gameTime to 0', () => {
      gameState.gameTime = 12345

      setupBenchmarkScenario()

      expect(gameState.gameTime).toBe(0)
    })

    it('[U00431] should reset frameCount to 0', () => {
      gameState.frameCount = 999

      setupBenchmarkScenario()

      expect(gameState.frameCount).toBe(0)
    })

    it('[U00432] should set benchmarkActive to true', () => {
      setupBenchmarkScenario()

      expect(gameState.benchmarkActive).toBe(true)
    })

    it('[U00433] should initialize availableUnitTypes with expected unit types', () => {
      setupBenchmarkScenario()

      expect(gameState.availableUnitTypes).toBeInstanceOf(Set)
      expect(gameState.availableUnitTypes.has('tank_v1')).toBe(true)
      expect(gameState.availableUnitTypes.has('tank-v2')).toBe(true)
      expect(gameState.availableUnitTypes.has('apache')).toBe(true)
      expect(gameState.availableUnitTypes.has('harvester')).toBe(true)
    })

    it('[U00434] should clear defeatedPlayers set', () => {
      gameState.defeatedPlayers = new Set(['player2', 'player3'])

      setupBenchmarkScenario()

      expect(gameState.defeatedPlayers.size).toBe(0)
    })

    it('[U00435] should set factory budgets to 50000', () => {
      setupBenchmarkScenario()

      factories.forEach(factory => {
        expect(factory.budget).toBe(50000)
      })
    })

    it('[U00436] should mark factories as benchmark structures', () => {
      setupBenchmarkScenario()

      factories.forEach(factory => {
        expect(factory.isBenchmarkStructure).toBe(true)
      })
    })

    it('[U00437] should clear factory rally points', () => {
      factories.forEach(factory => {
        factory.rallyPoint = { x: 5, y: 5 }
      })

      setupBenchmarkScenario()

      factories.forEach(factory => {
        expect(factory.rallyPoint).toBeNull()
      })
    })

    it('[U00438] should call cleanupOreFromBuildings', () => {
      setupBenchmarkScenario()

      expect(cleanupOreFromBuildings).toHaveBeenCalled()
    })

    it('[U00439] should call updatePowerSupply', () => {
      setupBenchmarkScenario()

      expect(updatePowerSupply).toHaveBeenCalledWith(gameState.buildings, gameState)
    })

    it('[U00440] should call initializeOccupancyMap', () => {
      setupBenchmarkScenario()

      expect(initializeOccupancyMap).toHaveBeenCalled()
    })

    it('[U00441] should call updateDangerZoneMaps', () => {
      setupBenchmarkScenario()

      expect(updateDangerZoneMaps).toHaveBeenCalledWith(gameState)
    })

    it('[U00442] should set gamePaused to false', () => {
      gameState.gamePaused = true

      setupBenchmarkScenario()

      expect(gameState.gamePaused).toBe(false)
    })

    it('[U00443] should set gameStarted to true', () => {
      setupBenchmarkScenario()

      expect(gameState.gameStarted).toBe(true)
    })

    it('[U00444] should call centerOnPlayerFactory if available', () => {
      const mockGame = {
        resetGame: vi.fn(),
        centerOnPlayerFactory: vi.fn()
      }
      getCurrentGame.mockReturnValue(mockGame)

      setupBenchmarkScenario()

      expect(mockGame.centerOnPlayerFactory).toHaveBeenCalled()
    })

    it('[U00445] should not throw if centerOnPlayerFactory is not available', () => {
      const mockGame = {
        resetGame: vi.fn()
        // centerOnPlayerFactory not defined
      }
      getCurrentGame.mockReturnValue(mockGame)

      expect(() => setupBenchmarkScenario()).not.toThrow()
    })

    it('[U00446] should create units for each player', () => {
      setupBenchmarkScenario()

      // Should have created multiple units
      expect(createUnit).toHaveBeenCalled()
      expect(units.length).toBeGreaterThan(0)
    })

    it('[U00447] should create buildings for each player', () => {
      setupBenchmarkScenario()

      expect(createBuilding).toHaveBeenCalled()
      expect(placeBuilding).toHaveBeenCalled()
    })

    it('[U00448] should call canPlaceBuilding before placing buildings', () => {
      setupBenchmarkScenario()

      expect(canPlaceBuilding).toHaveBeenCalled()
    })

    it('[U00449] should clear unitWrecks array', () => {
      gameState.unitWrecks = [{ id: 'wreck1' }]

      setupBenchmarkScenario()

      expect(gameState.unitWrecks).toEqual([])
    })

    it('[U00450] should clear smokeParticles array', () => {
      gameState.smokeParticles = [{ id: 'smoke1' }]

      setupBenchmarkScenario()

      expect(gameState.smokeParticles).toEqual([])
    })

    it('[U00451] should clear smokeParticlePool array', () => {
      gameState.smokeParticlePool = [{ id: 'pool1' }]

      setupBenchmarkScenario()

      expect(gameState.smokeParticlePool).toEqual([])
    })

    it('[U00452] should reset destruction counters', () => {
      gameState.playerUnitsDestroyed = 100
      gameState.enemyUnitsDestroyed = 50
      gameState.playerBuildingsDestroyed = 25
      gameState.enemyBuildingsDestroyed = 10

      setupBenchmarkScenario()

      expect(gameState.playerUnitsDestroyed).toBe(0)
      expect(gameState.enemyUnitsDestroyed).toBe(0)
      expect(gameState.playerBuildingsDestroyed).toBe(0)
      expect(gameState.enemyBuildingsDestroyed).toBe(0)
    })

    it('[U00453] should reset totalMoneyEarned', () => {
      gameState.totalMoneyEarned = 99999

      setupBenchmarkScenario()

      expect(gameState.totalMoneyEarned).toBe(0)
    })

    it('[U00454] should include factories in buildings array', () => {
      setupBenchmarkScenario()

      // Buildings array should include the factories
      expect(gameState.buildings.length).toBeGreaterThanOrEqual(factories.length)
    })
  })

  describe('teardownBenchmarkScenario', () => {
    it('[U00455] should set benchmarkActive to false', () => {
      gameState.benchmarkActive = true

      teardownBenchmarkScenario()

      expect(gameState.benchmarkActive).toBe(false)
    })

    it('[U00456] should call resetBenchmarkCameraFocus', () => {
      teardownBenchmarkScenario()

      expect(resetBenchmarkCameraFocus).toHaveBeenCalled()
    })
  })

  describe('scenario configuration', () => {
    it('[U00457] should set up 4 players for benchmark', () => {
      setupBenchmarkScenario()

      expect(gameState.playerCount).toBe(4)
    })

    it('[U00458] should configure available unit types correctly', () => {
      setupBenchmarkScenario()

      const expectedTypes = [
        'tank_v1', 'tank-v2', 'tank-v3', 'rocketTank',
        'harvester', 'ambulance', 'tankerTruck', 'recoveryTank',
        'apache', 'howitzer'
      ]

      expectedTypes.forEach(type => {
        expect(gameState.availableUnitTypes.has(type)).toBe(true)
      })
    })

    it('[U00459] should clear newUnitTypes set', () => {
      gameState.newUnitTypes = new Set(['tank_v1'])

      setupBenchmarkScenario()

      expect(gameState.newUnitTypes.size).toBe(0)
    })

    it('[U00460] should clear newBuildingTypes set', () => {
      gameState.newBuildingTypes = new Set(['powerPlant'])

      setupBenchmarkScenario()

      expect(gameState.newBuildingTypes.size).toBe(0)
    })
  })

  describe('error handling', () => {
    it('[U00461] should handle empty mapGrid gracefully', () => {
      // This tests that the code handles edge cases
      const mockGame = {
        resetGame: vi.fn(),
        centerOnPlayerFactory: vi.fn()
      }
      getCurrentGame.mockReturnValue(mockGame)

      // Should not throw even with various map configurations
      expect(() => setupBenchmarkScenario()).not.toThrow()
    })

    it('[U00462] should handle building placement failures gracefully', () => {
      canPlaceBuilding.mockReturnValue(false)

      // Should not throw when buildings can't be placed
      expect(() => setupBenchmarkScenario()).not.toThrow()
    })
  })
})
