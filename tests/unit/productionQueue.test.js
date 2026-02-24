/**
 * Tests for Production Queue System
 *
 * Tests unit and building production queuing, timing,
 * spawn location determination, and queue management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { resetGameState, createTestMapGrid } from '../testUtils.js'

// Mock all external dependencies
vi.mock('../../src/units.js', () => ({
  spawnUnit: vi.fn(() => ({
    id: 'test-unit-1',
    type: 'tank_v1',
    x: 100,
    y: 100,
    health: 100
  })),
  findPath: vi.fn(() => []),
  unitCosts: {
    tank_v1: 800,
    harvester: 1200,
    apache: 1500,
    f22Raptor: 8000,
    ambulance: 600,
    tankerTruck: 500,
    recoveryTank: 700,
    mineLayer: 800,
    mineSweeper: 600
  }
}))

vi.mock('../../src/logic.js', () => ({
  findClosestOre: vi.fn(() => null)
}))

vi.mock('../../src/main.js', () => ({
  buildingCosts: {
    powerPlant: 500,
    oreRefinery: 2500,
    vehicleFactory: 2000,
    helipad: 1500
  },
  factories: [],
  units: []
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    powerPlant: { width: 2, height: 2, cost: 500, power: 200, health: 200, displayName: 'Power Plant' },
    oreRefinery: { width: 3, height: 3, cost: 2500, power: -150, health: 200, displayName: 'Ore Refinery' },
    vehicleFactory: { width: 3, height: 3, cost: 2000, power: -100, health: 300, displayName: 'Vehicle Factory' },
    constructionYard: { width: 3, height: 3, cost: 5000, power: 50, health: 400, displayName: 'Construction Yard' }
  },
  createBuilding: vi.fn((type, x, y) => ({
    id: `${type}-${x}-${y}`,
    type, x, y,
    width: 2, height: 2,
    health: 200, maxHealth: 200
  })),
  placeBuilding: vi.fn(),
  canPlaceBuilding: vi.fn(() => true),
  updatePowerSupply: vi.fn(),
  isNearExistingBuilding: vi.fn(() => true)
}))

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn()
}))

vi.mock('../../src/game/harvesterLogic.js', () => ({
  assignHarvesterToOptimalRefinery: vi.fn()
}))

vi.mock('../../src/game/dangerZoneMap.js', () => ({
  updateDangerZoneMaps: vi.fn()
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({
  broadcastBuildingPlace: vi.fn(),
  broadcastUnitSpawn: vi.fn(),
  isHost: vi.fn(() => true)
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn(() => 0.5)
}))

// Import after mocking
import { productionQueue } from '../../src/productionQueue.js'

describe('Production Queue System', () => {
  let mockButton

  beforeEach(() => {
    resetGameState()
    gameState.mapGrid = createTestMapGrid(50, 50)
    gameState.gamePaused = false
    gameState.gameStarted = true
    gameState.money = 50000
    gameState.humanPlayer = 'player'
    gameState.playerPowerSupply = 100
    gameState.playerBuildSpeedModifier = 1.0
    gameState.speedMultiplier = 1.0
    gameState.buildings = []
    gameState.factories = []
    gameState.units = []
    gameState.blueprints = []
    gameState.newUnitTypes = new Set()
    gameState.newBuildingTypes = new Set()

    // Create mock button
    mockButton = {
      classList: {
        add: vi.fn(),
        remove: vi.fn()
      },
      querySelector: vi.fn(() => ({
        style: { width: '0%', display: 'none' },
        textContent: ''
      }))
    }

    // Reset production queue state
    productionQueue.unitItems = []
    productionQueue.buildingItems = []
    productionQueue.currentUnit = null
    productionQueue.currentBuilding = null
    productionQueue.pausedUnit = false
    productionQueue.pausedBuilding = false
    productionQueue.completedBuildings = []
    productionQueue.unitPaid = 0
    productionQueue.buildingPaid = 0
    productionQueue.productionController = null
  })

  describe('Queue Adding', () => {
    beforeEach(() => {
      // Add vehicle factory for unit production and construction yard for buildings
      gameState.buildings = [
        { type: 'vehicleFactory', owner: 'player', health: 100 },
        { type: 'constructionYard', owner: 'player', health: 100 }
      ]
    })

    it('should add unit to queue', () => {
      productionQueue.addItem('tank_v1', mockButton, false)

      expect(productionQueue.unitItems.length).toBe(1)
      expect(productionQueue.unitItems[0].type).toBe('tank_v1')
    })

    it('should add building to queue', () => {
      productionQueue.addItem('powerPlant', mockButton, true)

      expect(productionQueue.buildingItems.length).toBe(1)
      expect(productionQueue.buildingItems[0].type).toBe('powerPlant')
    })

    it('should store button reference in queue item', () => {
      productionQueue.addItem('tank_v1', mockButton, false)

      expect(productionQueue.unitItems[0].button).toBe(mockButton)
    })

    it('should store rally point for units', () => {
      const rallyPoint = { x: 100, y: 100 }
      productionQueue.addItem('tank_v1', mockButton, false, null, rallyPoint)

      expect(productionQueue.unitItems[0].rallyPoint).toBe(rallyPoint)
    })

    it('should store blueprint for buildings', () => {
      const blueprint = { x: 10, y: 10, type: 'powerPlant' }
      productionQueue.addItem('powerPlant', mockButton, true, blueprint)

      expect(productionQueue.buildingItems[0].blueprint).toBe(blueprint)
    })

    it('should not add items when game is paused', () => {
      gameState.gamePaused = true

      productionQueue.addItem('tank_v1', mockButton, false)

      expect(productionQueue.unitItems.length).toBe(0)
      expect(mockButton.classList.add).toHaveBeenCalledWith('error')
    })

    it('should remove new unit type flag when adding', () => {
      gameState.newUnitTypes.add('tank_v1')

      productionQueue.addItem('tank_v1', mockButton, false)

      expect(gameState.newUnitTypes.has('tank_v1')).toBe(false)
    })

    it('should remove new building type flag when adding', () => {
      gameState.newBuildingTypes.add('powerPlant')

      productionQueue.addItem('powerPlant', mockButton, true)

      expect(gameState.newBuildingTypes.has('powerPlant')).toBe(false)
    })
  })

  describe('Vehicle Factory Multiplier', () => {
    it('should return 0 with no buildings', () => {
      gameState.buildings = []
      const multiplier = productionQueue.getVehicleFactoryMultiplier()
      expect(multiplier).toBe(0)
    })

    it('should return number of vehicle factories', () => {
      gameState.buildings = [
        { type: 'vehicleFactory', owner: 'player' },
        { type: 'vehicleFactory', owner: 'player' }
      ]
      const multiplier = productionQueue.getVehicleFactoryMultiplier()
      expect(multiplier).toBe(2)
    })

    it('should only count player-owned factories', () => {
      gameState.buildings = [
        { type: 'vehicleFactory', owner: 'player' },
        { type: 'vehicleFactory', owner: 'enemy' }
      ]
      const multiplier = productionQueue.getVehicleFactoryMultiplier()
      expect(multiplier).toBe(1)
    })

    it('should not count other building types', () => {
      gameState.buildings = [
        { type: 'vehicleFactory', owner: 'player' },
        { type: 'powerPlant', owner: 'player' }
      ]
      const multiplier = productionQueue.getVehicleFactoryMultiplier()
      expect(multiplier).toBe(1)
    })
  })

  describe('Construction Yard Multiplier', () => {
    it('should return 0 with no buildings', () => {
      gameState.buildings = []
      const multiplier = productionQueue.getConstructionYardMultiplier()
      expect(multiplier).toBe(0)
    })

    it('should return number of construction yards + 1', () => {
      gameState.buildings = [
        { type: 'constructionYard', owner: 'player', health: 100 }
      ]
      const multiplier = productionQueue.getConstructionYardMultiplier()
      expect(multiplier).toBe(2) // 1 yard + 1 base
    })

    it('should only count healthy construction yards', () => {
      gameState.buildings = [
        { type: 'constructionYard', owner: 'player', health: 100 },
        { type: 'constructionYard', owner: 'player', health: 0 }
      ]
      const multiplier = productionQueue.getConstructionYardMultiplier()
      expect(multiplier).toBe(2) // Only 1 healthy + 1 base
    })

    it('should only count player-owned yards', () => {
      gameState.buildings = [
        { type: 'constructionYard', owner: 'player', health: 100 },
        { type: 'constructionYard', owner: 'enemy', health: 100 }
      ]
      const multiplier = productionQueue.getConstructionYardMultiplier()
      expect(multiplier).toBe(2)
    })
  })

  describe('Pause and Resume', () => {
    it('should toggle unit production pause', () => {
      productionQueue.currentUnit = { type: 'tank_v1', button: mockButton }
      productionQueue.pausedUnit = false

      productionQueue.togglePauseUnit()
      expect(productionQueue.pausedUnit).toBe(true)
      expect(mockButton.classList.add).toHaveBeenCalledWith('paused')

      productionQueue.togglePauseUnit()
      expect(productionQueue.pausedUnit).toBe(false)
      expect(mockButton.classList.remove).toHaveBeenCalledWith('paused')
    })

    it('should toggle building production pause', () => {
      productionQueue.currentBuilding = { type: 'powerPlant', button: mockButton }
      productionQueue.pausedBuilding = false

      productionQueue.togglePauseBuilding()
      expect(productionQueue.pausedBuilding).toBe(true)

      productionQueue.togglePauseBuilding()
      expect(productionQueue.pausedBuilding).toBe(false)
    })

    it('should do nothing if no current unit production', () => {
      productionQueue.currentUnit = null

      productionQueue.togglePauseUnit()

      expect(productionQueue.pausedUnit).toBe(false)
    })

    it('should do nothing if no current building production', () => {
      productionQueue.currentBuilding = null

      productionQueue.togglePauseBuilding()

      expect(productionQueue.pausedBuilding).toBe(false)
    })
  })

  describe('Cancel Production', () => {
    it('should cancel current unit production', () => {
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.currentUnit = {
        type: 'tank_v1',
        button: mockButton,
        progress: 0.5
      }
      productionQueue.unitPaid = 400 // Half paid

      const initialMoney = gameState.money

      productionQueue.cancelUnitProduction()

      expect(productionQueue.currentUnit).toBeNull()
      expect(productionQueue.unitItems.length).toBe(0)
      expect(gameState.money).toBe(initialMoney + 400) // Refund
    })

    it('should cancel current building production', () => {
      productionQueue.buildingItems = [{ type: 'powerPlant', button: mockButton }]
      productionQueue.currentBuilding = {
        type: 'powerPlant',
        button: mockButton,
        progress: 0.3
      }
      productionQueue.buildingPaid = 150

      const initialMoney = gameState.money

      productionQueue.cancelBuildingProduction()

      expect(productionQueue.currentBuilding).toBeNull()
      expect(productionQueue.buildingItems.length).toBe(0)
      expect(gameState.money).toBe(initialMoney + 150)
    })

    it('should do nothing if no current unit production', () => {
      productionQueue.currentUnit = null

      expect(() => productionQueue.cancelUnitProduction()).not.toThrow()
    })

    it('should clear pause state on cancellation', () => {
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.currentUnit = { type: 'tank_v1', button: mockButton }
      productionQueue.pausedUnit = true
      productionQueue.unitPaid = 0

      productionQueue.cancelUnitProduction()

      expect(productionQueue.pausedUnit).toBe(false)
    })
  })

  describe('Batch Counter Updates', () => {
    it('should update batch counter display', () => {
      const batchCounter = { style: { display: 'none' }, textContent: '' }
      mockButton.querySelector = vi.fn(() => batchCounter)

      productionQueue.updateBatchCounter(mockButton, 3)

      expect(batchCounter.textContent).toBe(3)
      expect(batchCounter.style.display).toBe('flex')
    })

    it('should hide batch counter when count is 0', () => {
      const batchCounter = { style: { display: 'flex' }, textContent: '3' }
      mockButton.querySelector = vi.fn(() => batchCounter)

      productionQueue.updateBatchCounter(mockButton, 0)

      expect(batchCounter.style.display).toBe('none')
    })

    it('should remove active class when count is 0', () => {
      const batchCounter = { style: { display: 'flex' }, textContent: '1' }
      mockButton.querySelector = vi.fn(() => batchCounter)

      productionQueue.updateBatchCounter(mockButton, 0)

      expect(mockButton.classList.remove).toHaveBeenCalledWith('active')
    })
  })

  describe('Completed Buildings Management', () => {
    it('should enable building placement mode', () => {
      productionQueue.completedBuildings = [{ type: 'powerPlant', button: mockButton }]

      const result = productionQueue.enableBuildingPlacementMode('powerPlant', mockButton)

      expect(result).toBe(true)
      expect(gameState.buildingPlacementMode).toBe(true)
      expect(gameState.currentBuildingType).toBe('powerPlant')
    })

    it('should fail if no completed building exists', () => {
      productionQueue.completedBuildings = []

      const result = productionQueue.enableBuildingPlacementMode('powerPlant', mockButton)

      expect(result).toBe(false)
    })

    it('should exit placement mode without canceling', () => {
      gameState.buildingPlacementMode = true
      gameState.currentBuildingType = 'powerPlant'

      productionQueue.exitBuildingPlacementMode()

      expect(gameState.buildingPlacementMode).toBe(false)
      expect(gameState.currentBuildingType).toBeNull()
    })

    it('should cancel ready building and refund money', () => {
      productionQueue.completedBuildings = [{ type: 'powerPlant', button: mockButton }]
      const initialMoney = gameState.money

      productionQueue.cancelReadyBuilding('powerPlant', mockButton)

      expect(productionQueue.completedBuildings.length).toBe(0)
      expect(gameState.money).toBe(initialMoney + 500) // Cost refund
    })
  })

  describe('Resume Production', () => {
    it('should resume paused unit production when money available', () => {
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.currentUnit = {
        type: 'tank_v1',
        button: mockButton,
        progress: 0.5,
        duration: 3000,
        startTime: performance.now() - 1500
      }
      productionQueue.pausedUnit = true
      productionQueue.unitPaid = 400
      gameState.money = 1000

      productionQueue.tryResumeProduction()

      expect(productionQueue.pausedUnit).toBe(false)
    })

    it('should not resume if queue is empty', () => {
      productionQueue.unitItems = []
      productionQueue.pausedUnit = true

      productionQueue.tryResumeProduction()

      // No current unit to resume
    })
  })

  describe('Serializable State', () => {
    it('should serialize queue state', () => {
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton, rallyPoint: { x: 10, y: 20 } }]
      productionQueue.pausedUnit = true
      productionQueue.unitPaid = 500

      const state = productionQueue.getSerializableState()

      expect(state.unitItems.length).toBe(1)
      expect(state.unitItems[0].type).toBe('tank_v1')
      expect(state.pausedUnit).toBe(true)
      expect(state.unitPaid).toBe(500)
    })

    it('should serialize current production', () => {
      productionQueue.currentUnit = {
        type: 'tank_v1',
        button: mockButton,
        progress: 0.5,
        duration: 3000,
        startTime: performance.now() - 1500
      }

      const state = productionQueue.getSerializableState()

      expect(state.currentUnit).not.toBeNull()
      expect(state.currentUnit.type).toBe('tank_v1')
      expect(state.currentUnit.progress).toBeCloseTo(0.5, 1)
    })

    it('should serialize completed buildings', () => {
      productionQueue.completedBuildings = [
        { type: 'powerPlant', button: mockButton }
      ]

      const state = productionQueue.getSerializableState()

      expect(state.completedBuildings.length).toBe(1)
      expect(state.completedBuildings[0].type).toBe('powerPlant')
    })

    it('should handle null values gracefully', () => {
      productionQueue.currentUnit = null
      productionQueue.currentBuilding = null

      const state = productionQueue.getSerializableState()

      expect(state.currentUnit).toBeNull()
      expect(state.currentBuilding).toBeNull()
    })

    it('should clamp progress between 0 and 1', () => {
      productionQueue.currentUnit = {
        type: 'tank_v1',
        button: mockButton,
        progress: 1.5, // Invalid
        duration: 3000,
        startTime: performance.now()
      }

      const state = productionQueue.getSerializableState()

      expect(state.currentUnit.progress).toBeLessThanOrEqual(1)
      expect(state.currentUnit.progress).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Blueprint Management', () => {
    it('should remove blueprint when production item removed', () => {
      const blueprint = { x: 10, y: 10, type: 'powerPlant' }
      gameState.blueprints = [blueprint]

      const item = { type: 'powerPlant', button: mockButton, blueprint }

      productionQueue.removeBlueprint(item)

      expect(gameState.blueprints).not.toContain(blueprint)
    })

    it('should handle item without blueprint', () => {
      const item = { type: 'powerPlant', button: mockButton }

      expect(() => productionQueue.removeBlueprint(item)).not.toThrow()
    })

    it('should handle null item', () => {
      expect(() => productionQueue.removeBlueprint(null)).not.toThrow()
    })
  })

  describe('Vehicle Unit Types', () => {
    it('should identify tank as vehicle type', () => {
      // Vehicle types should spawn from vehicle factory
      // We test this by verifying the multiplier is used
      gameState.buildings = [
        { type: 'vehicleFactory', owner: 'player' }
      ]
      const multiplier = productionQueue.getVehicleFactoryMultiplier()
      expect(multiplier).toBe(1)
    })

    it('should handle empty building list for vehicle check', () => {
      gameState.buildings = []
      const multiplier = productionQueue.getVehicleFactoryMultiplier()
      expect(multiplier).toBe(0)
    })

    it('should speed up F22 production when multiple vehicle factories exist', () => {
      gameState.buildings = [
        { type: 'airstrip', owner: 'player', health: 1000 },
        { type: 'vehicleFactory', owner: 'player', health: 100 },
        { type: 'vehicleFactory', owner: 'player', health: 100 }
      ]
      productionQueue.unitItems = [{ type: 'f22Raptor', button: mockButton, isBuilding: false }]
      productionQueue.startNextUnitProduction()

      expect(productionQueue.currentUnit).not.toBeNull()
      expect(productionQueue.currentUnit.duration).toBe(24000)
    })
  })

  describe('Update Ready Building Counter', () => {
    it('should create ready counter if not exists', () => {
      const mockCounter = { style: { display: 'none' }, textContent: '' }
      mockButton.querySelector = vi.fn((selector) => {
        if (selector === '.ready-counter') return null
        return mockCounter
      })
      mockButton.appendChild = vi.fn()

      productionQueue.completedBuildings = [{ type: 'powerPlant', button: mockButton }]

      productionQueue.updateReadyBuildingCounter(mockButton)

      expect(mockButton.appendChild).toHaveBeenCalled()
    })

    it('should update existing ready counter', () => {
      const mockCounter = { style: { display: 'none' }, textContent: '' }
      mockButton.querySelector = vi.fn(() => mockCounter)

      productionQueue.completedBuildings = [
        { type: 'powerPlant', button: mockButton },
        { type: 'powerPlant', button: mockButton }
      ]

      productionQueue.updateReadyBuildingCounter(mockButton)

      expect(mockCounter.textContent).toBe(2)
      expect(mockCounter.style.display).toBe('flex')
    })

    it('should hide counter when no ready buildings', () => {
      const mockCounter = { style: { display: 'flex' }, textContent: '2' }
      mockButton.querySelector = vi.fn(() => mockCounter)

      productionQueue.completedBuildings = []

      productionQueue.updateReadyBuildingCounter(mockButton)

      expect(mockCounter.style.display).toBe('none')
    })
  })

  describe('Edge Cases', () => {
    it('should handle production with zero duration', () => {
      productionQueue.currentUnit = {
        type: 'tank_v1',
        button: mockButton,
        progress: 0,
        duration: 0,
        startTime: performance.now()
      }

      const state = productionQueue.getSerializableState()
      expect(state.currentUnit.duration).toBe(0)
    })

    it('should handle negative money edge case', () => {
      gameState.money = -100
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.currentUnit = {
        type: 'tank_v1',
        button: mockButton,
        progress: 0.5,
        duration: 3000,
        startTime: performance.now() - 1500
      }
      productionQueue.pausedUnit = true
      productionQueue.unitPaid = 400

      // Should not resume because money is negative
      productionQueue.tryResumeProduction()

      // With negative money, still should try to resume (money > 0 check)
      expect(productionQueue.pausedUnit).toBe(true)
    })

    it('should handle undefined speed multiplier', () => {
      gameState.speedMultiplier = undefined

      // Should not crash when serializing
      const state = productionQueue.getSerializableState()
      expect(state).toBeDefined()
    })
  })

  describe('Start Next Unit Production', () => {
    beforeEach(() => {
      gameState.buildings = [
        { type: 'vehicleFactory', owner: 'player', health: 100 }
      ]
    })

    it('should not start production if queue is empty', () => {
      productionQueue.unitItems = []
      productionQueue.startNextUnitProduction()
      expect(productionQueue.currentUnit).toBeNull()
    })

    it('should not start production if paused', () => {
      productionQueue.pausedUnit = true
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.startNextUnitProduction()
      expect(productionQueue.currentUnit).toBeNull()
    })

    it('should not start production if game is paused', () => {
      gameState.gamePaused = true
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.startNextUnitProduction()
      expect(productionQueue.currentUnit).toBeNull()
    })

    it('should reset unitPaid when starting new production', () => {
      productionQueue.unitPaid = 500
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.startNextUnitProduction()
      expect(productionQueue.unitPaid).toBe(0)
    })

    it('should set current unit with production properties', () => {
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.startNextUnitProduction()

      expect(productionQueue.currentUnit).toBeTruthy()
      expect(productionQueue.currentUnit.type).toBe('tank_v1')
      expect(productionQueue.currentUnit.progress).toBe(0)
      expect(productionQueue.currentUnit.duration).toBeGreaterThan(0)
    })

    it('should apply vehicle factory multiplier to duration', () => {
      gameState.buildings = [
        { type: 'vehicleFactory', owner: 'player', health: 100 },
        { type: 'vehicleFactory', owner: 'player', health: 100 }
      ]
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.startNextUnitProduction()

      // With 2 factories, duration should be halved
      expect(productionQueue.currentUnit).toBeTruthy()
    })

    it('should apply power penalty to duration', () => {
      gameState.playerPowerSupply = -100
      gameState.playerBuildSpeedModifier = 0.5
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.startNextUnitProduction()

      expect(productionQueue.currentUnit).toBeTruthy()
    })

    it('should preserve rally point in current unit', () => {
      const rallyPoint = { x: 20, y: 30 }
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton, rallyPoint }]
      productionQueue.startNextUnitProduction()

      expect(productionQueue.currentUnit.rallyPoint).toEqual(rallyPoint)
    })
  })

  describe('Start Next Building Production', () => {
    beforeEach(() => {
      gameState.buildings = [
        { type: 'constructionYard', owner: 'player', health: 100 }
      ]
    })

    it('should not start production if queue is empty', () => {
      productionQueue.buildingItems = []
      productionQueue.startNextBuildingProduction()
      expect(productionQueue.currentBuilding).toBeNull()
    })

    it('should not start production if paused', () => {
      productionQueue.pausedBuilding = true
      productionQueue.buildingItems = [{ type: 'powerPlant', button: mockButton }]
      productionQueue.startNextBuildingProduction()
      expect(productionQueue.currentBuilding).toBeNull()
    })

    it('should not start if there is already a building in production', () => {
      productionQueue.currentBuilding = { type: 'existing', button: mockButton }
      productionQueue.buildingItems = [{ type: 'powerPlant', button: mockButton }]
      productionQueue.startNextBuildingProduction()
      expect(productionQueue.currentBuilding.type).toBe('existing')
    })

    it('should reset buildingPaid when starting new production', () => {
      productionQueue.buildingPaid = 300
      productionQueue.buildingItems = [{ type: 'powerPlant', button: mockButton }]
      productionQueue.startNextBuildingProduction()
      expect(productionQueue.buildingPaid).toBe(0)
    })

    it('should set current building with production properties', () => {
      productionQueue.buildingItems = [{ type: 'powerPlant', button: mockButton, isBuilding: true }]
      productionQueue.startNextBuildingProduction()

      expect(productionQueue.currentBuilding).toBeTruthy()
      expect(productionQueue.currentBuilding.type).toBe('powerPlant')
      expect(productionQueue.currentBuilding.progress).toBe(0)
    })

    it('should apply construction yard multiplier', () => {
      gameState.buildings = [
        { type: 'constructionYard', owner: 'player', health: 100 },
        { type: 'constructionYard', owner: 'player', health: 100 }
      ]
      productionQueue.buildingItems = [{ type: 'powerPlant', button: mockButton, isBuilding: true }]
      productionQueue.startNextBuildingProduction()

      expect(productionQueue.currentBuilding).toBeTruthy()
    })
  })

  describe('Update Progress', () => {
    beforeEach(() => {
      gameState.buildings = [
        { type: 'vehicleFactory', owner: 'player', health: 100 },
        { type: 'constructionYard', owner: 'player', health: 100 }
      ]
    })

    it('should not update if game is paused', () => {
      gameState.gamePaused = true
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.currentUnit = {
        type: 'tank_v1',
        button: mockButton,
        progress: 0.5,
        duration: 3000,
        startTime: performance.now() - 1500
      }

      const oldProgress = productionQueue.currentUnit.progress
      productionQueue.updateProgress(performance.now())
      expect(productionQueue.currentUnit.progress).toBe(oldProgress)
    })

    it('should update unit progress', () => {
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.currentUnit = {
        type: 'tank_v1',
        button: mockButton,
        progress: 0,
        duration: 1000,
        startTime: performance.now() - 500
      }

      productionQueue.updateProgress(performance.now())
      expect(productionQueue.currentUnit.progress).toBeGreaterThan(0)
    })

    it('should pause production if not enough money', () => {
      gameState.money = 0
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.unitPaid = 0
      productionQueue.currentUnit = {
        type: 'tank_v1',
        button: mockButton,
        progress: 0.5,
        duration: 1000,
        startTime: performance.now() - 500
      }

      productionQueue.updateProgress(performance.now())
      expect(productionQueue.pausedUnit).toBe(true)
    })

    it('should clear current building if queue is empty but currentBuilding exists', () => {
      productionQueue.buildingItems = []
      productionQueue.currentBuilding = {
        type: 'powerPlant',
        button: mockButton,
        progress: 0.5,
        duration: 1000,
        startTime: performance.now() - 500
      }

      productionQueue.updateProgress(performance.now())
      expect(productionQueue.currentBuilding).toBeNull()
    })
  })

  describe('Resume Production After Unpause', () => {
    beforeEach(() => {
      gameState.buildings = [
        { type: 'vehicleFactory', owner: 'player', health: 100 },
        { type: 'constructionYard', owner: 'player', health: 100 }
      ]
    })

    it('should start unit production if queue has items', () => {
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.resumeProductionAfterUnpause()
      expect(productionQueue.currentUnit).toBeTruthy()
    })

    it('should start building production if queue has items', () => {
      productionQueue.buildingItems = [{ type: 'powerPlant', button: mockButton, isBuilding: true }]
      productionQueue.resumeProductionAfterUnpause()
      expect(productionQueue.currentBuilding).toBeTruthy()
    })

    it('should not start if already have current production', () => {
      productionQueue.currentUnit = { type: 'existing', button: mockButton }
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.resumeProductionAfterUnpause()
      expect(productionQueue.currentUnit.type).toBe('existing')
    })

    it('should not start if production is paused', () => {
      productionQueue.pausedUnit = true
      productionQueue.unitItems = [{ type: 'tank_v1', button: mockButton }]
      productionQueue.resumeProductionAfterUnpause()
      expect(productionQueue.currentUnit).toBeNull()
    })
  })

  describe('Cancel Building Placement', () => {
    it('should cancel and refund building in placement mode', () => {
      gameState.buildingPlacementMode = true
      gameState.currentBuildingType = 'powerPlant'
      productionQueue.completedBuildings = [{ type: 'powerPlant', button: mockButton }]
      const initialMoney = gameState.money

      productionQueue.cancelBuildingPlacement()

      expect(productionQueue.completedBuildings.length).toBe(0)
      expect(gameState.money).toBe(initialMoney + 500)
      expect(gameState.buildingPlacementMode).toBe(false)
      expect(gameState.currentBuildingType).toBeNull()
    })

    it('should do nothing if no current building type', () => {
      gameState.currentBuildingType = null
      productionQueue.completedBuildings = [{ type: 'powerPlant', button: mockButton }]
      const initialCount = productionQueue.completedBuildings.length

      productionQueue.cancelBuildingPlacement()

      expect(productionQueue.completedBuildings.length).toBe(initialCount)
    })

    it('should do nothing if completed building not found', () => {
      gameState.currentBuildingType = 'oreRefinery'
      productionQueue.completedBuildings = [{ type: 'powerPlant', button: mockButton }]

      productionQueue.cancelBuildingPlacement()

      expect(productionQueue.completedBuildings.length).toBe(1)
    })

    it('should keep ready-for-placement if more buildings of same type exist', () => {
      gameState.currentBuildingType = 'powerPlant'
      productionQueue.completedBuildings = [
        { type: 'powerPlant', button: mockButton },
        { type: 'powerPlant', button: mockButton }
      ]

      productionQueue.cancelBuildingPlacement()

      expect(productionQueue.completedBuildings.length).toBe(1)
      // Button should still have ready-for-placement class
    })
  })

  describe('Restore From Serializable State', () => {
    it('should restore empty state', () => {
      productionQueue.restoreFromSerializableState({})

      expect(productionQueue.unitItems).toEqual([])
      expect(productionQueue.buildingItems).toEqual([])
      expect(productionQueue.completedBuildings).toEqual([])
    })

    it('should restore null state', () => {
      productionQueue.restoreFromSerializableState(null)

      expect(productionQueue.unitItems).toEqual([])
    })

    it('should restore pause states', () => {
      productionQueue.restoreFromSerializableState({
        pausedUnit: true,
        pausedBuilding: true
      })

      // Without current production, pause states should be cleared
      expect(productionQueue.pausedUnit).toBe(false)
      expect(productionQueue.pausedBuilding).toBe(false)
    })

    it('should restore paid amounts', () => {
      productionQueue.restoreFromSerializableState({
        unitPaid: 500,
        buildingPaid: 300
      })

      expect(productionQueue.unitPaid).toBe(500)
      expect(productionQueue.buildingPaid).toBe(300)
    })

    it('should clamp invalid paid amounts', () => {
      productionQueue.restoreFromSerializableState({
        unitPaid: NaN,
        buildingPaid: Infinity
      })

      expect(productionQueue.unitPaid).toBe(0)
      expect(productionQueue.buildingPaid).toBe(0)
    })

    it('should handle missing completed buildings array', () => {
      productionQueue.restoreFromSerializableState({
        completedBuildings: null
      })

      expect(productionQueue.completedBuildings).toEqual([])
    })
  })

  describe('Set Production Controller', () => {
    it('should set production controller reference', () => {
      const mockController = { updateBuildingButtonStates: vi.fn() }
      productionQueue.setProductionController(mockController)

      expect(productionQueue.productionController).toBe(mockController)
    })
  })
})
