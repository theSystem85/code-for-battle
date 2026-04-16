import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'
import {
  updateUnitMovement,
  updateUnitPathfinding,
  updateSpawnExit
} from '../../src/game/unitMovement.js'
import { gameState } from '../../src/gameState.js'
import { selectedUnits as _selectedUnits, cleanupDestroyedSelectedUnits } from '../../src/inputHandler.js'
import { findPath, removeUnitOccupancy as _removeUnitOccupancy } from '../../src/units.js'
import { getCachedPath } from '../../src/game/pathfinding.js'
import { initializeUnitMovement, updateUnitPosition } from '../../src/game/unifiedMovement.js'
import { updateRetreatBehavior, shouldExitRetreat, cancelRetreat } from '../../src/behaviours/retreat.js'
import * as logic from '../../src/logic.js'

// Mock dependencies
vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1',
    occupancyMap: [],
    buildings: [],
    units: [],
    mapGrid: []
  }
}))

vi.mock('../../src/inputHandler.js', () => ({
  selectedUnits: [],
  cleanupDestroyedSelectedUnits: vi.fn()
}))

vi.mock('../../src/units.js', () => ({
  findPath: vi.fn(() => []),
  removeUnitOccupancy: vi.fn()
}))

vi.mock('../../src/game/pathfinding.js', () => ({
  getCachedPath: vi.fn(() => [])
}))

vi.mock('../../src/logic.js', () => ({
  angleDiff: vi.fn((a, b) => {
    let diff = b - a
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    return diff
  }),
  smoothRotateTowardsAngle: vi.fn((current, target, _speed) => {
    const diff = target - current
    if (Math.abs(diff) < _speed) return target
    return current + Math.sign(diff) * _speed
  }),
  findAdjacentTile: vi.fn(() => ({ x: 1, y: 1 }))
}))

vi.mock('../../src/game/unifiedMovement.js', () => ({
  updateUnitPosition: vi.fn(),
  initializeUnitMovement: vi.fn()
}))

vi.mock('../../src/game/howitzerGunController.js', () => ({
  updateHowitzerGunState: vi.fn()
}))

vi.mock('../../src/behaviours/retreat.js', () => ({
  updateRetreatBehavior: vi.fn(),
  shouldExitRetreat: vi.fn(() => false),
  cancelRetreat: vi.fn()
}))

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: (fn) => fn
}))

describe('unitMovement.js', () => {
  let mockMapGrid
  let mockOccupancyMap
  let mockGameState

  beforeEach(() => {
    vi.clearAllMocks()

    mockMapGrid = Array(10).fill(null).map(() =>
      Array(10).fill(null).map(() => ({ type: 'grass' }))
    )

    mockOccupancyMap = Array(10).fill(null).map(() =>
      Array(10).fill(0)
    )

    mockGameState = {
      humanPlayer: 'player1',
      occupancyMap: mockOccupancyMap,
      buildings: [],
      units: [],
      mapGrid: mockMapGrid
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('updateUnitMovement', () => {
    it('should clean up destroyed units', () => {
      const units = [{ health: 100, x: 32, y: 32, tileX: 1, tileY: 1 }]
      updateUnitMovement(units, mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      expect(cleanupDestroyedSelectedUnits).toHaveBeenCalled()
    })

    it('should keep units with health <= 0 for delayed destruction cleanup', () => {
      const units = [
        { id: 1, health: 0, x: 32, y: 32, tileX: 1, tileY: 1, occupancyRemoved: false },
        { id: 2, health: 50, x: 64, y: 64, tileX: 2, tileY: 2 }
      ]
      updateUnitMovement(units, mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      expect(units.length).toBe(2)
      expect(units[0].id).toBe(1)
      expect(units[1].id).toBe(2)
    })

    it('should initialize movement system for all units', () => {
      const units = [{ health: 100, x: 32, y: 32, tileX: 1, tileY: 1 }]
      updateUnitMovement(units, mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      expect(initializeUnitMovement).toHaveBeenCalledWith(units[0])
    })

    it('should clear destroyed targets from units', () => {
      const unit = {
        health: 100,
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        target: { health: 0 }
      }
      const units = [unit]
      updateUnitMovement(units, mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      expect(unit.target).toBeNull()
    })

    it('should update unit position through unified movement system', () => {
      const units = [{ health: 100, x: 32, y: 32, tileX: 1, tileY: 1 }]
      updateUnitMovement(units, mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      expect(updateUnitPosition).toHaveBeenCalled()
    })

    it('should clear local avoidance state after dodge completion', () => {
      const unit = {
        health: 100,
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        isDodging: true,
        path: [],
        localAvoidanceRemainingSteps: 0
      }
      updateUnitMovement([unit], mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      expect(unit.isDodging).toBe(false)
      expect(unit.path).toEqual([])
      expect(unit.localAvoidanceRemainingSteps).toBe(0)
    })

    it('should clamp tile indices to map bounds', () => {
      const unit = {
        health: 100,
        x: -100,
        y: -100,
        tileX: -5,
        tileY: -5
      }
      updateUnitMovement([unit], mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      expect(unit.tileX).toBe(0)
      expect(unit.tileY).toBe(0)
    })

    it('sets an attack move path when target is out of range', () => {
      const target = { id: 'enemy-1', x: 400, y: 400, tileX: 12, tileY: 12, health: 100 }
      const unit = {
        health: 100,
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        type: 'tank_v1',
        target
      }
      vi.mocked(getCachedPath).mockReturnValue([{ x: 1, y: 1 }, { x: 5, y: 5 }])

      updateUnitMovement([unit], mockMapGrid, mockOccupancyMap, mockGameState, performance.now())

      expect(getCachedPath).toHaveBeenCalled()
      expect(unit.path).toEqual([{ x: 5, y: 5 }])
      expect(unit.moveTarget).toBeTruthy()
    })

    it('recovers a missing attack path for AI-controlled units with a live target', () => {
      const target = { id: 'enemy-1', x: 400, y: 400, tileX: 12, tileY: 12, health: 100 }
      const unit = {
        health: 100,
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        type: 'tank_v1',
        owner: 'player2',
        target,
        path: [],
        moveTarget: null
      }
      vi.mocked(getCachedPath).mockReturnValue([{ x: 1, y: 1 }, { x: 5, y: 5 }])

      updateUnitMovement([unit], mockMapGrid, mockOccupancyMap, mockGameState, performance.now())

      expect(getCachedPath).toHaveBeenCalled()
      expect(unit.path).toEqual([{ x: 5, y: 5 }])
      expect(unit.moveTarget).toEqual({ x: 12, y: 12 })
    })

    it('clears moveTarget when close enough and no path remains', () => {
      const unit = {
        health: 100,
        x: 64,
        y: 64,
        tileX: 2,
        tileY: 2,
        moveTarget: { x: 2, y: 2 },
        path: []
      }

      updateUnitMovement([unit], mockMapGrid, mockOccupancyMap, mockGameState, performance.now())

      expect(unit.moveTarget).toBeNull()
    })

    it('should apply speed modifiers', () => {
      const unit = {
        health: 100,
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        speedModifier: 1.5
      }
      updateUnitMovement([unit], mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      expect(unit.speedModifier).toBe(1.5)
    })

    it('should set default speedModifier if not defined', () => {
      const unit = {
        health: 100,
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1
      }
      updateUnitMovement([unit], mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      expect(unit.speedModifier).toBe(1)
    })

    it('should handle retreat behavior', () => {
      vi.mocked(shouldExitRetreat).mockReturnValueOnce(true)
      const unit = {
        health: 100,
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        isRetreating: true
      }
      updateUnitMovement([unit], mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      expect(cancelRetreat).toHaveBeenCalled()
      expect(updateRetreatBehavior).toHaveBeenCalled()
    })

    it('should remove unit from cheatSystem tracking when destroyed', () => {
      const mockRemoveUnit = vi.fn()
      window.cheatSystem = { removeUnitFromTracking: mockRemoveUnit }
      const unit = { id: 'test-id', health: 0, x: 32, y: 32, tileX: 1, tileY: 1, occupancyRemoved: false }
      updateUnitMovement([unit], mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      expect(mockRemoveUnit).toHaveBeenCalledWith('test-id')
      delete window.cheatSystem
    })
  })

  describe('updateUnitPathfinding', () => {
    beforeEach(() => {
      vi.mocked(findPath).mockReturnValue([{ x: 1, y: 1 }, { x: 2, y: 2 }])
    })

    it('should calculate paths for units with moveTarget', () => {
      const unit = {
        tileX: 1,
        tileY: 1,
        moveTarget: { x: 5, y: 5 },
        lastPathCalcTime: 0,
        owner: 'player1'
      }
      const localGameState = { ...mockGameState, occupancyMap: mockOccupancyMap }
      updateUnitPathfinding([unit], mockMapGrid, localGameState)
      expect(findPath).toHaveBeenCalled()
    })

    it('should not recalculate path if cooldown not passed', () => {
      const unit = {
        tileX: 1,
        tileY: 1,
        moveTarget: { x: 5, y: 5 },
        lastPathCalcTime: performance.now(),
        owner: 'player1'
      }
      const localGameState = { ...mockGameState, occupancyMap: mockOccupancyMap }
      updateUnitPathfinding([unit], mockMapGrid, localGameState)
      expect(findPath).not.toHaveBeenCalled()
    })

    it('should skip units without moveTarget', () => {
      const unit = {
        tileX: 1,
        tileY: 1,
        moveTarget: null,
        owner: 'player1'
      }
      const localGameState = { ...mockGameState, occupancyMap: mockOccupancyMap }
      updateUnitPathfinding([unit], mockMapGrid, localGameState)
      expect(findPath).not.toHaveBeenCalled()
    })

    it('should handle formation offsets', () => {
      const unit = {
        tileX: 1,
        tileY: 1,
        moveTarget: { x: 10, y: 10 },
        formationOffset: { x: 32, y: 16 },
        lastPathCalcTime: 0,
        owner: 'player1'
      }
      const localGameState = { ...mockGameState, occupancyMap: mockOccupancyMap }
      updateUnitPathfinding([unit], mockMapGrid, localGameState)
      expect(findPath).toHaveBeenCalled()
    })

    it('should skip sweepingOverrideMovement units', () => {
      const unit = {
        tileX: 1,
        tileY: 1,
        moveTarget: { x: 5, y: 5 },
        sweepingOverrideMovement: true,
        lastPathCalcTime: 0,
        owner: 'player1'
      }
      const localGameState = { ...mockGameState, occupancyMap: mockOccupancyMap }
      updateUnitPathfinding([unit], mockMapGrid, localGameState)
      expect(findPath).not.toHaveBeenCalled()
    })

    it('should set path excluding start position', () => {
      vi.mocked(findPath).mockReturnValue([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }])
      const unit = {
        tileX: 1,
        tileY: 1,
        moveTarget: { x: 5, y: 5 },
        lastPathCalcTime: 0,
        owner: 'player1'
      }
      const localGameState = { ...mockGameState, occupancyMap: mockOccupancyMap }
      updateUnitPathfinding([unit], mockMapGrid, localGameState)
      expect(unit.path).toEqual([{ x: 2, y: 2 }, { x: 3, y: 3 }])
    })

    it('clears moveTarget when already at destination', () => {
      vi.mocked(findPath).mockReturnValue([{ x: 1, y: 1 }])
      const unit = {
        tileX: 1,
        tileY: 1,
        moveTarget: { x: 1, y: 1 },
        lastPathCalcTime: 0,
        owner: 'player1'
      }
      const localGameState = { ...mockGameState, occupancyMap: mockOccupancyMap }
      updateUnitPathfinding([unit], mockMapGrid, localGameState)
      expect(unit.moveTarget).toBeNull()
    })

    it('skips attack mode units (handled by updateUnitMovement main loop instead)', () => {
      const unit = {
        tileX: 1,
        tileY: 1,
        moveTarget: { x: 5, y: 5 },
        lastPathCalcTime: 0,
        owner: 'player1',
        target: { health: 100 }
      }
      const localGameState = { ...mockGameState, occupancyMap: mockOccupancyMap }
      updateUnitPathfinding([unit], mockMapGrid, localGameState)
      // Attack mode units are skipped - they are handled by updateUnitMovement main loop
      expect(findPath).not.toHaveBeenCalled()
    })
  })

  describe('updateSpawnExit', () => {
    it('should find exit path for units spawned in factory', () => {
      vi.mocked(logic.findAdjacentTile).mockReturnValue({ x: 3, y: 3 })
      vi.mocked(findPath).mockReturnValue([{ x: 2, y: 2 }, { x: 3, y: 3 }])

      const factory = {
        id: 'player1',
        owner: 'player1',
        x: 2,
        y: 2,
        width: 2,
        height: 2
      }
      const unit = {
        owner: 'player1',
        spawnedInFactory: true,
        tileX: 2,
        tileY: 2,
        x: 64,
        y: 64
      }
      gameState.humanPlayer = 'player1'

      updateSpawnExit([unit], [factory], mockMapGrid, mockOccupancyMap)
      expect(findPath).toHaveBeenCalled()
    })

    it('should clear spawnedInFactory flag when unit leaves factory', () => {
      const factory = {
        id: 'player1',
        owner: 'player1',
        x: 2,
        y: 2,
        width: 2,
        height: 2
      }
      const unit = {
        owner: 'player1',
        spawnedInFactory: true,
        tileX: 10, // Outside factory
        tileY: 10,
        x: 320,
        y: 320
      }
      gameState.humanPlayer = 'player1'

      updateSpawnExit([unit], [factory], mockMapGrid, mockOccupancyMap)
      expect(unit.spawnedInFactory).toBe(false)
    })

    it('should respect holdInFactory for AI units', () => {
      vi.mocked(findPath).mockReturnValue([{ x: 2, y: 2 }, { x: 3, y: 3 }])

      const factory = {
        id: 'ai',
        owner: 'ai',
        x: 2,
        y: 2,
        width: 2,
        height: 2
      }
      const unit = {
        owner: 'ai',
        spawnedInFactory: true,
        holdInFactory: true,
        factoryBuildEndTime: performance.now() + 10000, // Still building
        tileX: 2,
        tileY: 2,
        x: 64,
        y: 64
      }
      gameState.humanPlayer = 'player1'
      updateSpawnExit([unit], [factory], mockMapGrid, mockOccupancyMap)
      // Unit should not exit while holdInFactory is true
      expect(unit.spawnedInFactory).toBe(true)
    })
  })

  describe('rotation behavior', () => {
    it('should initialize rotation properties if missing', () => {
      const unit = {
        health: 100,
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1
      }
      updateUnitMovement([unit], mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      expect(unit.direction).toBeDefined()
      expect(unit.turretDirection).toBeDefined()
      expect(unit.rotationSpeed).toBeDefined()
    })

    it('should update unit rotation when path exists', () => {
      const unit = {
        health: 100,
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        direction: 0,
        path: [{ x: 5, y: 5 }],
        rotationSpeed: 0.1
      }
      updateUnitMovement([unit], mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      // Direction should be calculated based on path target
      expect(unit.direction).toBeDefined()
    })

    it('should handle howitzer rotation locked to body', () => {
      const unit = {
        health: 100,
        x: 32,
        y: 32,
        tileX: 1,
        tileY: 1,
        type: 'howitzer',
        direction: Math.PI / 4
      }
      updateUnitMovement([unit], mockMapGrid, mockOccupancyMap, mockGameState, performance.now())
      // Howitzer turret should follow body direction
      expect(unit.turretDirection).toBe(unit.direction)
    })
  })
})
