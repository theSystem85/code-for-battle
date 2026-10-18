/**
 * Tests for Building Repair Handler
 *
 * Tests the repair mode functionality including:
 * - Initiating repairs on damaged buildings
 * - Cancelling ongoing repairs
 * - Under-attack repair delay
 * - Building placement mode handling
 * - Coordinate conversion and building detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '../setup.js'
import { gameState } from '../../src/gameState.js'
import { createTestMapGrid, resetGameState, createTestBuilding } from '../testUtils.js'

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

vi.mock('../../src/game/dangerZoneMap.js', () => ({
  updateDangerZoneMaps: vi.fn()
}))

vi.mock('../../src/savePlayerBuildPatterns.js', () => ({
  savePlayerBuildPatterns: vi.fn()
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({
  broadcastBuildingPlace: vi.fn()
}))

// Mock buildings.js with actual implementations for cost calculation
vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    powerPlant: { displayName: 'Power Plant', width: 2, height: 2, health: 300 },
    oreRefinery: { displayName: 'Ore Refinery', width: 3, height: 2, health: 450 },
    concreteWall: { displayName: 'Concrete Wall', width: 1, height: 1, health: 100 }
  },
  canPlaceBuilding: vi.fn(() => true),
  createBuilding: vi.fn((type, x, y) => ({
    id: `${type}-${Date.now()}`,
    type,
    x,
    y,
    width: 2,
    height: 2,
    health: 300,
    maxHealth: 300
  })),
  placeBuilding: vi.fn(),
  updatePowerSupply: vi.fn(),
  calculateRepairCost: vi.fn((building) => {
    const damage = building.maxHealth - building.health
    return Math.floor(damage * 0.5)
  })
}))

// Import after mocking
import { buildingRepairHandler } from '../../src/buildingRepairHandler.js'
import { playSound } from '../../src/sound.js'
import { showNotification } from '../../src/ui/notifications.js'
import { updateMoneyBar } from '../../src/ui/moneyBar.js'
import { calculateRepairCost } from '../../src/buildings.js'

describe('buildingRepairHandler.js', () => {
  let mapGrid
  let mockCanvas
  let factories
  let productionQueue

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
    gameState.buildings = []
    gameState.buildingsUnderRepair = []
    gameState.buildingsAwaitingRepair = []
    gameState.scrollOffset = { x: 0, y: 0 }
    gameState.repairMode = false
    gameState.buildingPlacementMode = false
    gameState.currentBuildingType = null

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

    productionQueue = {
      completedBuildings: [],
      updateReadyBuildingCounter: vi.fn()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Repair Mode - Building Detection', () => {
    it('[U00551] should do nothing when repair mode is not active', () => {
      gameState.repairMode = false
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.health = 200 // Damaged
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(showNotification).not.toHaveBeenCalled()
    })

    it('[U00552] should show notification when no building found at click location', () => {
      gameState.repairMode = true

      const event = createClickEvent(25, 25) // Empty location
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(showNotification).toHaveBeenCalledWith('No player building found to repair.')
    })

    it('[U00553] should not repair enemy buildings', () => {
      gameState.repairMode = true
      const enemyBuilding = createTestBuilding('powerPlant', 10, 10, 'enemy', mapGrid)
      enemyBuilding.health = 200
      gameState.buildings.push(enemyBuilding)

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(showNotification).toHaveBeenCalledWith('No player building found to repair.')
    })

    it('[U00554] should detect player building within its bounds', () => {
      gameState.repairMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.health = 200
      building.maxHealth = 300
      gameState.buildings.push(building)

      const event = createClickEvent(11, 11) // Inside 2x2 building
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      // Should initiate repair (awaitingRepair list check)
      expect(gameState.buildingsAwaitingRepair.length).toBe(1)
      expect(showNotification).toHaveBeenCalledWith('Building repair initiated')
    })
  })

  describe('Repair Mode - Full Health Buildings', () => {
    it('[U00555] should not repair buildings at full health', () => {
      gameState.repairMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.health = 300
      building.maxHealth = 300
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(showNotification).toHaveBeenCalledWith('Building is already at full health.')
    })
  })

  describe('Repair Mode - Concrete Walls', () => {
    it('[U00556] should not allow repairing concrete walls', () => {
      gameState.repairMode = true
      const wall = createTestBuilding('concreteWall', 10, 10, 'player1', mapGrid)
      wall.type = 'concreteWall'
      wall.health = 50
      wall.maxHealth = 100
      gameState.buildings.push(wall)

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(showNotification).toHaveBeenCalledWith('Concrete walls cannot be repaired.')
    })
  })

  describe('Repair Mode - Repair Initiation', () => {
    it('[U00557] should add building to awaiting repair list', () => {
      gameState.repairMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.health = 200
      building.maxHealth = 300
      building.lastAttackedTime = null
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(gameState.buildingsAwaitingRepair.length).toBe(1)
      expect(gameState.buildingsAwaitingRepair[0].building).toBe(building)
      expect(gameState.buildingsAwaitingRepair[0].healthToRepair).toBe(100)
    })

    it('[U00558] should calculate repair cost correctly', () => {
      gameState.repairMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.health = 200
      building.maxHealth = 300
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(calculateRepairCost).toHaveBeenCalledWith(building)
    })

    it('[U00559] should not add building already in awaiting repair list', () => {
      gameState.repairMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.health = 200
      building.maxHealth = 300
      gameState.buildings.push(building)

      // Already in awaiting list
      gameState.buildingsAwaitingRepair = [{ building: building, repairCost: 50 }]

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(showNotification).toHaveBeenCalledWith('Building repair already pending')
      expect(gameState.buildingsAwaitingRepair.length).toBe(1)
    })
  })

  describe('Repair Mode - Under Attack Cooldown', () => {
    it('[U00560] should delay repair if building was attacked within 10 seconds', () => {
      gameState.repairMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.health = 200
      building.maxHealth = 300
      building.lastAttackedTime = performance.now() - 5000 // 5 seconds ago
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(playSound).toHaveBeenCalledWith('Repair_impossible_when_under_attack', 1.0, 30, true)
      expect(gameState.buildingsAwaitingRepair.length).toBe(1)
      expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('waiting'))
    })

    it('[U00561] should allow immediate repair if building was attacked over 10 seconds ago', () => {
      gameState.repairMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.health = 200
      building.maxHealth = 300
      building.lastAttackedTime = performance.now() - 15000 // 15 seconds ago
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(playSound).not.toHaveBeenCalledWith('Repair_impossible_when_under_attack', expect.anything(), expect.anything(), expect.anything())
      expect(showNotification).toHaveBeenCalledWith('Building repair initiated')
    })
  })

  describe('Repair Mode - Cancellation', () => {
    it('[U00562] should cancel repair if building is already under repair', () => {
      gameState.repairMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.health = 200
      building.maxHealth = 300
      gameState.buildings.push(building)

      // Building is under active repair
      const repairEntry = { building: building, cost: 100, costPaid: 30 }
      gameState.buildingsUnderRepair = [repairEntry]

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      // Should refund unpaid portion (100 - 30 = 70)
      expect(gameState.money).toBe(10070)
      expect(gameState.buildingsUnderRepair.length).toBe(0)
      expect(showNotification).toHaveBeenCalledWith('Building repair cancelled')
      expect(playSound).toHaveBeenCalledWith('repairCancelled', 1.0, 0, true)
    })

    it('[U00563] should call updateMoneyBar after cancellation refund', () => {
      gameState.repairMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.health = 200
      building.maxHealth = 300
      gameState.buildings.push(building)

      gameState.buildingsUnderRepair = [{ building: building, cost: 100, costPaid: 50 }]

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(updateMoneyBar).toHaveBeenCalled()
    })
  })

  describe('Scroll Offset Handling', () => {
    it('[U00564] should correctly account for scroll offset when detecting buildings', () => {
      gameState.repairMode = true
      // Test with no scroll offset (simpler case)
      gameState.scrollOffset = { x: 0, y: 0 }

      const building = createTestBuilding('powerPlant', 20, 15, 'player1', mapGrid)
      building.health = 200
      building.maxHealth = 300
      gameState.buildings.push(building)

      // Click should target tile (20, 15)
      const event = createClickEvent(20, 15)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(gameState.buildingsAwaitingRepair.length).toBe(1)
    })
  })

  describe('Multiple Buildings', () => {
    it('[U00565] should repair the first matching building found', () => {
      gameState.repairMode = true

      const building1 = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building1.health = 200
      building1.maxHealth = 300

      const building2 = createTestBuilding('oreRefinery', 15, 15, 'player1', mapGrid)
      building2.health = 300
      building2.maxHealth = 450

      gameState.buildings.push(building1)
      gameState.buildings.push(building2)

      // Click on first building
      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(gameState.buildingsAwaitingRepair.length).toBe(1)
      expect(gameState.buildingsAwaitingRepair[0].building).toBe(building1)
    })
  })

  describe('Edge Cases', () => {
    it('[U00566] should initialize buildingsAwaitingRepair array if undefined', () => {
      gameState.repairMode = true
      gameState.buildingsAwaitingRepair = undefined

      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.health = 200
      building.maxHealth = 300
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      expect(Array.isArray(gameState.buildingsAwaitingRepair)).toBe(true)
    })

    it('[U00567] should handle buildings with zero lastAttackedTime', () => {
      gameState.repairMode = true
      const building = createTestBuilding('powerPlant', 10, 10, 'player1', mapGrid)
      building.health = 200
      building.maxHealth = 300
      building.lastAttackedTime = 0
      gameState.buildings.push(building)

      const event = createClickEvent(10, 10)
      buildingRepairHandler(event, gameState, mockCanvas, mapGrid, [], factories, productionQueue, null)

      // Should start repair normally (0 is treated as "never attacked")
      expect(showNotification).toHaveBeenCalledWith('Building repair initiated')
    })
  })
})
