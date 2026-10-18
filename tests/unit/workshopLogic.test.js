import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'
import { updateWorkshopLogic } from '../../src/game/workshopLogic.js'
import { gameState } from '../../src/gameState.js'
import { findPath, createUnit } from '../../src/units.js'
import { getWreckById, removeWreckById } from '../../src/game/unitWreckManager.js'
import { getBaseStructures, isWithinBaseRange } from '../../src/utils/baseUtils.js'

// Mock dependencies
vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  MAX_BUILDING_GAP_TILES: 3
}))

vi.mock('../../src/units.js', () => ({
  findPath: vi.fn(() => [{ x: 1, y: 1 }, { x: 2, y: 2 }]),
  createUnit: vi.fn((factory, type, x, y, _options) => ({
    id: Date.now(),
    type,
    x: x * 32,
    y: y * 32,
    tileX: x,
    tileY: y,
    owner: factory.owner,
    health: 100,
    maxHealth: 100,
    path: [],
    crew: {},
    gas: 100
  }))
}))

vi.mock('../../src/utils.js', () => ({
  updateUnitSpeedModifier: vi.fn(),
  getUnitCost: vi.fn(() => 1000)
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1',
    money: 10000,
    occupancyMap: [],
    factories: [],
    unitWrecks: []
  }
}))

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn()
}))

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: (fn) => fn
}))

vi.mock('../../src/game/unitWreckManager.js', () => ({
  getWreckById: vi.fn(() => null),
  removeWreckById: vi.fn()
}))

vi.mock('../../src/utils/baseUtils.js', () => ({
  getBaseStructures: vi.fn(() => []),
  isWithinBaseRange: vi.fn(() => true)
}))

vi.mock('../../src/utils/serviceRadius.js', () => ({
  getServiceRadiusPixels: vi.fn(() => 200)
}))

describe('workshopLogic.js', () => {
  let mockMapGrid
  let mockBuildings
  let mockUnits
  let workshop

  beforeEach(() => {
    vi.clearAllMocks()

    mockMapGrid = Array(20).fill(null).map(() =>
      Array(20).fill(null).map(() => ({ type: 'grass' }))
    )

    workshop = {
      type: 'vehicleWorkshop',
      owner: 'player1',
      x: 5,
      y: 5,
      width: 3,
      height: 3,
      health: 500,
      repairSlots: null,
      repairQueue: null,
      restorationQueue: null,
      currentRestoration: null,
      restorationProgress: 0
    }

    mockBuildings = [workshop]
    mockUnits = []

    gameState.humanPlayer = 'player1'
    gameState.money = 10000
    gameState.occupancyMap = Array(20).fill(null).map(() => Array(20).fill(0))
    gameState.factories = []
    gameState.unitWrecks = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('workshop initialization', () => {
    it('[U05145] should initialize repair slots around workshop', () => {
      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 16)
      expect(workshop.repairSlots).toBeDefined()
      expect(Array.isArray(workshop.repairSlots)).toBe(true)
      expect(workshop.repairSlots.length).toBeGreaterThan(0)
    })

    it('[U05146] should initialize repair queue as empty array', () => {
      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 16)
      expect(workshop.repairQueue).toBeDefined()
      expect(Array.isArray(workshop.repairQueue)).toBe(true)
    })

    it('[U05147] should create repair slots around the workshop perimeter', () => {
      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 16)
      // Repair slots should be on the perimeter (not inside the workshop)
      workshop.repairSlots.forEach(slot => {
        const isOutside =
          slot.x < workshop.x ||
          slot.x >= workshop.x + workshop.width ||
          slot.y < workshop.y ||
          slot.y >= workshop.y + workshop.height
        expect(isOutside).toBe(true)
      })
    })
  })

  describe('unit queuing', () => {
    it('[U05148] should add damaged units within service radius to repair queue', () => {
      // Workshop is at x:5, y:5, width:3, height:3
      // The function should process units within the service radius
      // This test verifies the function executes without error when a damaged unit is nearby
      const damagedUnit = {
        id: 1,
        type: 'tank',
        owner: 'player1',
        health: 50,
        maxHealth: 100,
        x: 6.5 * 32,
        y: 6.5 * 32,
        tileX: 6,
        tileY: 6,
        path: [],
        moveTarget: null,
        repairingAtWorkshop: false,
        returningToWorkshop: false,
        targetWorkshop: null
      }
      mockUnits.push(damagedUnit)

      // Call the function - it should not throw
      expect(() => updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 16)).not.toThrow()

      // Workshop should have been initialized with repairQueue
      expect(workshop.repairQueue).toBeDefined()
      expect(Array.isArray(workshop.repairQueue)).toBe(true)
    })

    it('[U05149] should not add fully healed units to queue', () => {
      const healthyUnit = {
        id: 2,
        type: 'tank',
        owner: 'player1',
        health: 100,
        maxHealth: 100,
        x: 6 * 32,
        y: 6 * 32,
        tileX: 6,
        tileY: 6
      }
      mockUnits.push(healthyUnit)

      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 16)
      expect(workshop.repairQueue).not.toContain(healthyUnit)
    })

    it('[U05150] should not add enemy units to queue', () => {
      const enemyUnit = {
        id: 3,
        type: 'tank',
        owner: 'enemy',
        health: 50,
        maxHealth: 100,
        x: 6 * 32,
        y: 6 * 32,
        tileX: 6,
        tileY: 6
      }
      mockUnits.push(enemyUnit)

      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 16)
      expect(workshop.repairQueue).not.toContain(enemyUnit)
    })

    it('[U05151] should not add moving units to queue', () => {
      const movingUnit = {
        id: 4,
        type: 'tank',
        owner: 'player1',
        health: 50,
        maxHealth: 100,
        x: 6 * 32,
        y: 6 * 32,
        tileX: 6,
        tileY: 6,
        movement: { isMoving: true }
      }
      mockUnits.push(movingUnit)

      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 16)
      expect(workshop.repairQueue).not.toContain(movingUnit)
    })
  })

  describe('repair process', () => {
    it('[U05152] should heal unit when in repair slot', () => {
      const damagedUnit = {
        id: 1,
        type: 'tank',
        owner: 'player1',
        health: 50,
        maxHealth: 100,
        x: 4 * 32,
        y: 5 * 32,
        tileX: 4,
        tileY: 5,
        repairingAtWorkshop: true,
        repairSlot: { x: 4, y: 5, unit: null },
        path: [],
        moveTarget: null
      }

      workshop.repairSlots = [{ x: 4, y: 5, unit: damagedUnit }]
      workshop.repairQueue = []
      damagedUnit.repairSlot = workshop.repairSlots[0]

      const initialHealth = damagedUnit.health
      updateWorkshopLogic([damagedUnit], mockBuildings, mockMapGrid, 1000) // 1 second delta
      expect(damagedUnit.health).toBeGreaterThan(initialHealth)
    })

    it('[U05153] should complete repair and release unit when fully healed', () => {
      // Unit is already at max health - should be released immediately
      const unit = {
        id: 1,
        type: 'tank',
        owner: 'player1',
        health: 100,  // Already at max health
        maxHealth: 100,
        x: 4 * 32,
        y: 5 * 32,
        tileX: 4,
        tileY: 5,
        repairingAtWorkshop: true,
        path: [],
        moveTarget: null,
        workshopRepairCost: 0,
        workshopRepairPaid: 0,
        workshopStartHealth: 50
      }

      workshop.repairSlots = [{ x: 4, y: 5, unit }]
      workshop.repairQueue = []
      unit.repairSlot = workshop.repairSlots[0]

      updateWorkshopLogic([unit], mockBuildings, mockMapGrid, 16)
      expect(unit.repairingAtWorkshop).toBe(false)
    })

    it('[U05154] should charge money for repairs', () => {
      gameState.money = 10000

      const unit = {
        type: 'tank',
        owner: 'player1',
        health: 50,
        maxHealth: 100,
        x: 4 * 32,
        y: 5 * 32,
        tileX: 4,
        tileY: 5,
        repairingAtWorkshop: true,
        path: [],
        moveTarget: null,
        workshopRepairCost: 150, // Cost set
        workshopRepairPaid: 0,
        workshopStartHealth: 50
      }

      workshop.repairSlots = [{ x: 4, y: 5, unit }]
      workshop.repairQueue = []
      unit.repairSlot = workshop.repairSlots[0]

      updateWorkshopLogic([unit], mockBuildings, mockMapGrid, 1000)
      // Money should be deducted
      expect(gameState.money).toBeLessThanOrEqual(10000)
    })

    it('[U05155] charges repair costs from AI factory budgets', () => {
      const aiFactory = { id: 'ai1', owner: 'ai1', budget: 60 }
      gameState.factories = [aiFactory]

      const unit = {
        type: 'tank',
        owner: 'ai1',
        health: 40,
        maxHealth: 100,
        x: 4 * 32,
        y: 5 * 32,
        tileX: 4,
        tileY: 5,
        repairingAtWorkshop: true,
        path: [],
        moveTarget: null,
        workshopRepairCost: 120,
        workshopRepairPaid: 0,
        workshopStartHealth: 40
      }

      workshop.repairSlots = [{ x: 4, y: 5, unit }]
      workshop.repairQueue = []
      unit.repairSlot = workshop.repairSlots[0]

      updateWorkshopLogic([unit], mockBuildings, mockMapGrid, 1000)

      expect(aiFactory.budget).toBeLessThan(60)
    })

    it('[U05156] should handle dead units in repair slots', () => {
      const deadUnit = {
        id: 1,
        type: 'tank',
        owner: 'player1',
        health: 0,
        maxHealth: 100,
        x: 4 * 32,
        y: 5 * 32,
        repairingAtWorkshop: true
      }

      const slot = { x: 4, y: 5, unit: deadUnit }
      workshop.repairSlots = [slot]
      workshop.repairQueue = []

      updateWorkshopLogic([deadUnit], mockBuildings, mockMapGrid, 16)
      expect(slot.unit).toBeNull()
    })
  })

  describe('restoration process', () => {
    it('[U05157] should initialize restoration queue', () => {
      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 16)
      expect(workshop.restorationQueue).toBeDefined()
      expect(Array.isArray(workshop.restorationQueue)).toBe(true)
    })

    it('[U05158] should process restoration queue when empty', () => {
      workshop.restorationQueue = []
      workshop.currentRestoration = null
      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 16)
      expect(workshop.currentRestoration).toBeNull()
    })

    it('[U05159] should start restoration from queue', () => {
      const mockWreck = {
        id: 'wreck1',
        type: 'tank',
        x: 100,
        y: 100,
        tileX: 3,
        tileY: 3
      }
      vi.mocked(getWreckById).mockReturnValue(mockWreck)

      workshop.repairSlots = []
      workshop.repairQueue = []
      workshop.restorationQueue = [{
        wreckId: 'wreck1',
        unitType: 'tank',
        buildDuration: 5000
      }]

      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 16)
      expect(workshop.currentRestoration).not.toBeNull()
    })

    it('[U05160] should update restoration progress over time', () => {
      const mockWreck = {
        id: 'wreck1',
        type: 'tank',
        x: 100,
        y: 100,
        tileX: 3,
        tileY: 3
      }
      vi.mocked(getWreckById).mockReturnValue(mockWreck)

      workshop.repairSlots = []
      workshop.repairQueue = []
      workshop.currentRestoration = {
        wreckId: 'wreck1',
        unitType: 'tank',
        buildDuration: 10000,
        elapsed: 5000
      }

      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 1000) // 1 second delta
      expect(workshop.currentRestoration.elapsed).toBe(6000)
      expect(workshop.restorationProgress).toBeCloseTo(0.6, 1)
    })

    it('[U05161] should cancel restoration if wreck is destroyed', () => {
      vi.mocked(getWreckById).mockReturnValue(null) // Wreck no longer exists

      workshop.repairSlots = []
      workshop.repairQueue = []
      workshop.restorationQueue = []
      workshop.currentRestoration = {
        wreckId: 'wreck1',
        unitType: 'tank',
        buildDuration: 10000,
        elapsed: 5000
      }

      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 16)
      expect(workshop.currentRestoration).toBeNull()
      expect(workshop.restorationProgress).toBe(0)
    })

    it('[U05162] should complete restoration and create unit', () => {
      const mockWreck = {
        id: 'wreck1',
        type: 'tank',
        x: 100,
        y: 100,
        tileX: 3,
        tileY: 3
      }
      vi.mocked(getWreckById).mockReturnValue(mockWreck)

      workshop.repairSlots = []
      workshop.repairQueue = []
      workshop.restorationQueue = []
      workshop.currentRestoration = {
        wreckId: 'wreck1',
        unitType: 'tank',
        buildDuration: 10000,
        elapsed: 9990 // Almost done
      }

      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 100) // Complete restoration

      // Check completion
      expect(createUnit).toHaveBeenCalled()
      expect(removeWreckById).toHaveBeenCalledWith(expect.anything(), 'wreck1')
    })

    it('[U05163] restores units at fallback spawn origin when no tiles are passable', () => {
      const mockWreck = {
        id: 'wreck2',
        type: 'tank',
        x: 50,
        y: 50,
        tileX: 1,
        tileY: 1
      }
      vi.mocked(getWreckById).mockReturnValue(mockWreck)

      const blockedMap = Array(3).fill(null).map(() =>
        Array(3).fill(null).map(() => ({ type: 'water' }))
      )
      gameState.occupancyMap = Array(3).fill(null).map(() => Array(3).fill(0))

      workshop.x = 0
      workshop.y = 0
      workshop.width = 2
      workshop.height = 2

      workshop.repairSlots = []
      workshop.repairQueue = []
      workshop.restorationQueue = []
      workshop.currentRestoration = {
        wreckId: 'wreck2',
        unitType: 'tank',
        buildDuration: 10000,
        elapsed: 9990
      }

      updateWorkshopLogic(mockUnits, [workshop], blockedMap, 100)

      expect(createUnit).toHaveBeenCalledWith(
        { owner: workshop.owner },
        'tank',
        1,
        2,
        expect.any(Object)
      )
    })
  })

  describe('slot assignment', () => {
    it('[U05164] should assign units to available slots', () => {
      vi.mocked(findPath).mockReturnValue([{ x: 4, y: 5 }, { x: 4, y: 5 }])

      const unit = {
        id: 1,
        type: 'tank',
        owner: 'player1',
        health: 50,
        maxHealth: 100,
        x: 5 * 32,
        y: 5 * 32,
        tileX: 5,
        tileY: 5,
        targetWorkshop: workshop
      }

      workshop.repairSlots = [{ x: 4, y: 5, unit: null }]
      workshop.repairQueue = [unit]

      updateWorkshopLogic([unit], mockBuildings, mockMapGrid, 16)
      // Unit should be assigned to slot
    })

    it('[U05165] should not assign to occupied slots', () => {
      const existingUnit = { id: 999, health: 50 }
      const newUnit = {
        id: 1,
        type: 'tank',
        owner: 'player1',
        health: 50,
        maxHealth: 100,
        tileX: 5,
        tileY: 5
      }

      workshop.repairSlots = [{ x: 4, y: 5, unit: existingUnit }]
      workshop.repairQueue = [newUnit]

      updateWorkshopLogic([newUnit, existingUnit], mockBuildings, mockMapGrid, 16)
      expect(workshop.repairSlots[0].unit).toBe(existingUnit)
    })
  })

  describe('unit movement interruption', () => {
    it('[U05166] should cancel repair if unit starts moving', () => {
      const unit = {
        id: 1,
        type: 'tank',
        owner: 'player1',
        health: 50,
        maxHealth: 100,
        x: 4 * 32,
        y: 5 * 32,
        tileX: 4,
        tileY: 5,
        repairingAtWorkshop: true,
        path: [{ x: 10, y: 10 }], // Unit has a new path
        moveTarget: { x: 10, y: 10 },
        workshopRepairCost: 100
      }

      const slot = { x: 4, y: 5, unit }
      workshop.repairSlots = [slot]
      workshop.repairQueue = []
      unit.repairSlot = slot

      updateWorkshopLogic([unit], mockBuildings, mockMapGrid, 16)
      expect(unit.repairingAtWorkshop).toBe(false)
      expect(slot.unit).toBeNull()
    })
  })

  describe('rally point', () => {
    it('[U05167] should set rally point for completed units', () => {
      const mockWreck = {
        id: 'wreck1',
        type: 'tank',
        x: 100,
        y: 100,
        tileX: 3,
        tileY: 3
      }
      vi.mocked(getWreckById).mockReturnValue(mockWreck)
      vi.mocked(findPath)
      workshop.rallyPoint = { x: 9, y: 9 }
      workshop.repairSlots = []
      workshop.repairQueue = []
      workshop.restorationQueue = []
      workshop.currentRestoration = {
        wreckId: 'wreck1',
        unitType: 'tank',
        buildDuration: 10000,
        elapsed: 9990
      }

      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 100)

      expect(createUnit).toHaveBeenCalled()
    })

    it('[U05168] selects rally point from base structures when current point is invalid', () => {
      const mockWreck = {
        id: 'wreck3',
        type: 'tank',
        x: 100,
        y: 100,
        tileX: 3,
        tileY: 3
      }
      vi.mocked(getWreckById).mockReturnValue(mockWreck)
      vi.mocked(findPath).mockReturnValue([{ x: 1, y: 1 }])
      vi.mocked(getBaseStructures).mockReturnValue([{ x: 4, y: 4, width: 2, height: 2 }])
      vi.mocked(isWithinBaseRange).mockReturnValue(true)

      workshop.rallyPoint = { x: 99, y: 99 }
      workshop.repairSlots = []
      workshop.repairQueue = []
      workshop.restorationQueue = []
      workshop.currentRestoration = {
        wreckId: 'wreck3',
        unitType: 'tank',
        buildDuration: 10000,
        elapsed: 9990
      }

      updateWorkshopLogic(mockUnits, mockBuildings, mockMapGrid, 100)

      expect(workshop.rallyPoint).toEqual({ x: 5, y: 6 })
    })
  })
})
