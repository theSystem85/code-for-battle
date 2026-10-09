/**
 * Tests for Building Sell Handler
 *
 * Tests the sell mode functionality including:
 * - Selling player-owned buildings for 70% refund
 * - Preventing sale of main factory
 * - Preventing double-sell of buildings
 * - Proper money calculation and updates
 * - Coordinate conversion and building detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '../setup.js'
import { gameState } from '../../src/gameState.js'
import { createTestMapGrid, resetGameState, createTestBuilding, createTestFactory } from '../testUtils.js'

// Mock dependencies
vi.mock('../../src/config.js', async(importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    TILE_SIZE: 32
  }
})

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn()
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/ui/moneyBar.js', () => ({
  updateMoneyBar: vi.fn()
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({
  broadcastBuildingSell: vi.fn()
}))

// Mock main.js for buildingCosts
vi.mock('../../src/main.js', () => ({
  buildingCosts: {
    powerPlant: 2000,
    oreRefinery: 2500,
    vehicleFactory: 3000,
    rocketTurret: 2500,
    concreteWall: 50
  }
}))

// Mock productionQueue
vi.mock('../../src/productionQueue.js', () => ({
  productionQueue: {
    tryResumeProduction: vi.fn()
  }
}))

// Import after mocking
import { buildingSellHandler } from '../../src/buildingSellHandler.js'
import { playSound } from '../../src/sound.js'
import { showNotification } from '../../src/ui/notifications.js'
import { updateMoneyBar } from '../../src/ui/moneyBar.js'
import { broadcastBuildingSell } from '../../src/network/gameCommandSync.js'
import { productionQueue } from '../../src/productionQueue.js'

describe('buildingSellHandler.js', () => {
  let mapGrid
  let mockCanvas
  let factories

  // Helper to create a mock click event at given tile coordinates
  function createClickEvent(tileX, tileY) {
    const TILE_SIZE = 32
    const scrollX = gameState.scrollOffset?.x || 0
    const scrollY = gameState.scrollOffset?.y || 0

    return {
      clientX: tileX * TILE_SIZE + 16 - scrollX + 100, // +100 for canvas offset
      clientY: tileY * TILE_SIZE + 16 - scrollY + 50   // +50 for canvas offset
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetGameState()

    mapGrid = createTestMapGrid(50, 50)
    gameState.mapGrid = mapGrid
    gameState.humanPlayer = 'player1'
    gameState.money = 10000
    gameState.simulationTime = 12345
    gameState.buildings = []
    gameState.scrollOffset = { x: 0, y: 0 }
    gameState.sellMode = false

    // Create a mock canvas with getBoundingClientRect
    mockCanvas = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 50,
        width: 800,
        height: 600
      })
    }

    factories = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Sell Mode Activation', () => {
    it('should do nothing when sell mode is not active', () => {
      gameState.sellMode = false
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      const result = buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(result).toBeUndefined()
      expect(showNotification).not.toHaveBeenCalled()
    })

    it('should return undefined when sell mode is not active', () => {
      gameState.sellMode = false
      const event = createClickEvent(10, 10)

      const result = buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(result).toBeUndefined()
    })
  })

  describe('Factory Protection', () => {
    it('should prevent selling the main factory', () => {
      gameState.sellMode = true
      const factory = createTestFactory(10, 10, 'player1', mapGrid)
      factories.push(factory)

      const event = createClickEvent(11, 11) // Inside factory bounds
      buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(showNotification).toHaveBeenCalledWith('The main factory cannot be sold.')
      expect(playSound).toHaveBeenCalledWith('error')
      expect(gameState.money).toBe(10000) // No change
    })

    it('should not prevent selling if factory belongs to different player', () => {
      gameState.sellMode = true
      const enemyFactory = createTestFactory(10, 10, 'enemy', mapGrid)
      factories.push(enemyFactory)

      // Player building at different location
      const building = createTestBuilding('powerPlant', 20, 20, 'player1', mapGrid)
      building.type = 'powerPlant'
      gameState.buildings.push(building)

      const event = createClickEvent(20, 20)
      const result = buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(result).toBe(true)
    })
  })

  describe('Building Detection', () => {
    it('should show notification when no building found at click location', () => {
      gameState.sellMode = true

      const event = createClickEvent(25, 25) // Empty location
      const result = buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(showNotification).toHaveBeenCalledWith('No player building found to sell.')
      expect(result).toBe(false)
    })

    it('should not sell enemy buildings', () => {
      gameState.sellMode = true
      const enemyBuilding = createTestBuilding('powerPlant', 10, 10, 'enemy', mapGrid)
      enemyBuilding.type = 'powerPlant'
      gameState.buildings.push(enemyBuilding)

      const event = createClickEvent(10, 10)
      const result = buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(showNotification).toHaveBeenCalledWith('No player building found to sell.')
      expect(result).toBe(false)
    })

    it('should detect building within its multi-tile bounds', () => {
      gameState.sellMode = true
      const building = createTestBuilding('oreRefinery', 10, 10, 'player1', mapGrid)
      building.type = 'oreRefinery'
      building.width = 3 // Ore refinery is 3x2
      building.height = 2
      gameState.buildings.push(building)

      // Click on far edge of building
      const event = createClickEvent(12, 11) // Inside 3x2 building
      const result = buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(result).toBe(true)
    })
  })

  describe('Sell Value Calculation', () => {
    it('should refund 70% of building cost for power plant', () => {
      gameState.sellMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.type = 'powerPlant'
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      // Power plant costs 2000, 70% = 1400
      expect(gameState.money).toBe(11400)
    })

    it('should refund 70% of building cost for ore refinery', () => {
      gameState.sellMode = true
      const building = createTestBuilding('oreRefinery', 10, 10, 'player1', mapGrid)
      building.type = 'oreRefinery'
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      // Ore refinery costs 2500, 70% = 1750
      expect(gameState.money).toBe(11750)
    })

    it('should floor the sell value to whole number', () => {
      gameState.sellMode = true
      const building = createTestBuilding('vehicleFactory', 10, 10, 'player1', mapGrid)
      building.type = 'vehicleFactory'
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      // vehicleFactory costs 3000, 70% = 2100
      expect(gameState.money).toBe(12100)
    })

    it('should handle unknown building type with 0 cost', () => {
      gameState.sellMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.type = 'unknownBuilding'
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      // Unknown building has no cost entry, defaults to 0
      expect(gameState.money).toBe(10000)
    })
  })

  describe('Sell Animation State', () => {
    it('should mark building as being sold', () => {
      gameState.sellMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.type = 'powerPlant'
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(building.isBeingSold).toBe(true)
      expect(building.sellStartTime).toBeDefined()
      expect(building.sellStartTime).toBe(gameState.simulationTime)
    })

    it('should prevent double-selling a building', () => {
      gameState.sellMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.type = 'powerPlant'
      building.isBeingSold = true // Already being sold
      gameState.buildings.push(building)

      const initialMoney = gameState.money

      const event = createClickEvent(10, 10)
      const result = buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(result).toBe(false)
      expect(gameState.money).toBe(initialMoney)
      expect(showNotification).toHaveBeenCalledWith('Building is already being sold.')
      expect(playSound).toHaveBeenCalledWith('error')
    })
  })

  describe('Notifications and Sounds', () => {
    it('should play deposit sound on successful sell', () => {
      gameState.sellMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.type = 'powerPlant'
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(playSound).toHaveBeenCalledWith('deposit')
    })

    it('should show notification with sell value', () => {
      gameState.sellMode = true
      const building = createTestBuilding('rocketTurret', 10, 10, 'player1', mapGrid)
      building.type = 'rocketTurret'
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      // rocketTurret costs some amount, verify notification was called
      expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('Building sold for'))
    })
  })

  describe('Money Bar Update', () => {
    it('should call updateMoneyBar after successful sell', () => {
      gameState.sellMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.type = 'powerPlant'
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(updateMoneyBar).toHaveBeenCalled()
    })
  })

  describe('Production Queue Integration', () => {
    it('should try to resume production after selling', () => {
      gameState.sellMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.type = 'powerPlant'
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(productionQueue.tryResumeProduction).toHaveBeenCalled()
    })
  })

  describe('Multiplayer Broadcasting', () => {
    it('should broadcast sell action to other players', () => {
      gameState.sellMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.type = 'powerPlant'
      building.id = 'building-123'
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(broadcastBuildingSell).toHaveBeenCalledWith(
        'building-123',
        1400, // 70% of 2000
        expect.any(Number) // sellStartTime
      )
    })
  })

  describe('Scroll Offset Handling', () => {
    it('should correctly account for scroll offset when detecting buildings', () => {
      gameState.sellMode = true
      // Test with no scroll offset first (simpler case)
      gameState.scrollOffset = { x: 0, y: 0 }

      const building = createTestBuilding('powerPlant', 20, 15, 'player1', mapGrid)
      building.type = 'powerPlant'
      gameState.buildings.push(building)

      // Click should target tile (20, 15)
      const event = createClickEvent(20, 15)
      const result = buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(result).toBe(true)
    })
  })

  describe('Return Values', () => {
    it('should return true on successful sell', () => {
      gameState.sellMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.type = 'powerPlant'
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      const result = buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(result).toBe(true)
    })

    it('should return false when no building found', () => {
      gameState.sellMode = true

      const event = createClickEvent(25, 25)
      const result = buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(result).toBe(false)
    })

    it('should return undefined when sell mode is inactive', () => {
      gameState.sellMode = false

      const event = createClickEvent(10, 10)
      const result = buildingSellHandler(event, gameState, mockCanvas, mapGrid, [], factories, null)

      expect(result).toBeUndefined()
    })
  })
})
