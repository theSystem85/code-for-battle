/**
 * Unit tests for guard.js
 *
 * Tests the guard behavior system that allows units
 * to follow and protect other units.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { updateGuardBehavior } from '../../src/behaviours/guard.js'
import { TILE_SIZE } from '../../src/config.js'
import { findPath } from '../../src/units.js'

// Mock the findPath function from units.js
vi.mock('../../src/units.js', () => ({
  findPath: vi.fn((start, end) => {
    // Return a simple path from start to end
    return [start, end]
  })
}))

// Mock combatHelpers to prevent deep transitive import chain
// (combatHelpers → logic → buildings → rendering → inputHandler → benchmarkScenario)
vi.mock('../../src/game/unitCombat/combatHelpers.js', () => ({
  getEffectiveFireRange: vi.fn(() => 0)
}))

describe('guard behavior', () => {
  let mockUnit
  let mockMapGrid
  let mockOccupancyMap
  let now

  beforeEach(() => {
    now = performance.now()
    vi.clearAllMocks()

    mockUnit = {
      x: 0,
      y: 0,
      tileX: 0,
      tileY: 0,
      guardTarget: null,
      guardMode: false,
      path: [],
      moveTarget: null,
      lastGuardPathCalcTime: 0
    }

    // Create a simple 10x10 map grid
    mockMapGrid = Array(10).fill(null).map(() =>
      Array(10).fill(null).map(() => ({ type: 'grass' }))
    )

    // Create a simple occupancy map
    mockOccupancyMap = {
      get: () => null
    }
  })

  describe('updateGuardBehavior', () => {
    it('should not set guard mode when no guard target exists', () => {
      mockUnit.guardTarget = null

      updateGuardBehavior(mockUnit, mockMapGrid, mockOccupancyMap, now)

      expect(mockUnit.guardMode).toBe(false)
    })

    it('should clear guard target and mode when target has no health', () => {
      mockUnit.guardTarget = { health: 0, x: 100, y: 100, tileX: 3, tileY: 3 }
      mockUnit.guardMode = true

      updateGuardBehavior(mockUnit, mockMapGrid, mockOccupancyMap, now)

      expect(mockUnit.guardTarget).toBeNull()
      expect(mockUnit.guardMode).toBe(false)
    })

    it('should set guard mode when target is valid and alive', () => {
      mockUnit.guardTarget = {
        health: 100,
        x: 0,
        y: 0,
        tileX: 0,
        tileY: 0
      }

      updateGuardBehavior(mockUnit, mockMapGrid, mockOccupancyMap, now)

      expect(mockUnit.guardMode).toBe(true)
    })

    it('should not recalculate path within PATH_INTERVAL', () => {
      const targetX = 5 * TILE_SIZE
      const targetY = 5 * TILE_SIZE

      mockUnit.guardTarget = {
        health: 100,
        x: targetX,
        y: targetY,
        tileX: 5,
        tileY: 5
      }
      mockUnit.lastGuardPathCalcTime = now - 100 // 100ms ago (within 500ms interval)

      updateGuardBehavior(mockUnit, mockMapGrid, mockOccupancyMap, now)

      // Path should not be updated because we're within the interval
      expect(mockUnit.path).toEqual([])
    })

    it('should calculate path when target is far and interval has passed', () => {
      const targetX = 5 * TILE_SIZE
      const targetY = 5 * TILE_SIZE

      mockUnit.guardTarget = {
        health: 100,
        x: targetX,
        y: targetY,
        tileX: 5,
        tileY: 5
      }
      mockUnit.lastGuardPathCalcTime = now - 2100 // 2100ms ago (beyond 2000ms PATH_INTERVAL)

      updateGuardBehavior(mockUnit, mockMapGrid, mockOccupancyMap, now)

      expect(findPath).toHaveBeenCalled()
      expect(mockUnit.lastGuardPathCalcTime).toBe(now)
    })

    it('should not calculate path when target is within follow distance', () => {
      // Place unit very close to target (within 1.5 * TILE_SIZE)
      mockUnit.x = TILE_SIZE
      mockUnit.y = TILE_SIZE
      mockUnit.tileX = 1
      mockUnit.tileY = 1

      mockUnit.guardTarget = {
        health: 100,
        x: TILE_SIZE + 10, // Very close
        y: TILE_SIZE + 10,
        tileX: 1,
        tileY: 1
      }
      mockUnit.lastGuardPathCalcTime = 0 // Long time ago

      updateGuardBehavior(mockUnit, mockMapGrid, mockOccupancyMap, now)

      // Should not calculate path because unit is already close enough
      expect(findPath).not.toHaveBeenCalled()
    })

    it('should set moveTarget when path is found', () => {
      findPath.mockReturnValue([
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: 5, y: 5 }
      ])

      const targetX = 5 * TILE_SIZE
      const targetY = 5 * TILE_SIZE

      mockUnit.guardTarget = {
        health: 100,
        x: targetX,
        y: targetY,
        tileX: 5,
        tileY: 5
      }
      mockUnit.lastGuardPathCalcTime = 0

      updateGuardBehavior(mockUnit, mockMapGrid, mockOccupancyMap, now)

      expect(mockUnit.moveTarget).toEqual({ x: 5, y: 5 })
    })

    it('should slice off first path element (current position)', () => {
      findPath.mockReturnValue([
        { x: 0, y: 0 }, // Current position
        { x: 2, y: 2 },
        { x: 5, y: 5 }
      ])

      mockUnit.guardTarget = {
        health: 100,
        x: 5 * TILE_SIZE,
        y: 5 * TILE_SIZE,
        tileX: 5,
        tileY: 5
      }
      mockUnit.lastGuardPathCalcTime = 0

      updateGuardBehavior(mockUnit, mockMapGrid, mockOccupancyMap, now)

      // Path should not include the first element
      expect(mockUnit.path).toEqual([
        { x: 2, y: 2 },
        { x: 5, y: 5 }
      ])
    })

    it('should not set path when findPath returns null', () => {
      findPath.mockReturnValue(null)

      mockUnit.guardTarget = {
        health: 100,
        x: 5 * TILE_SIZE,
        y: 5 * TILE_SIZE,
        tileX: 5,
        tileY: 5
      }
      mockUnit.lastGuardPathCalcTime = 0
      mockUnit.path = ['original']

      updateGuardBehavior(mockUnit, mockMapGrid, mockOccupancyMap, now)

      expect(mockUnit.path).toEqual(['original'])
    })

    it('should not set path when findPath returns single-element path', () => {
      findPath.mockReturnValue([{ x: 0, y: 0 }])

      mockUnit.guardTarget = {
        health: 100,
        x: 5 * TILE_SIZE,
        y: 5 * TILE_SIZE,
        tileX: 5,
        tileY: 5
      }
      mockUnit.lastGuardPathCalcTime = 0
      mockUnit.path = ['original']

      updateGuardBehavior(mockUnit, mockMapGrid, mockOccupancyMap, now)

      expect(mockUnit.path).toEqual(['original'])
    })

    it('should handle target with negative health', () => {
      mockUnit.guardTarget = {
        health: -10,
        x: 100,
        y: 100,
        tileX: 3,
        tileY: 3
      }
      mockUnit.guardMode = true

      updateGuardBehavior(mockUnit, mockMapGrid, mockOccupancyMap, now)

      expect(mockUnit.guardTarget).toBeNull()
      expect(mockUnit.guardMode).toBe(false)
    })

    it('should update lastGuardPathCalcTime when path is calculated', () => {
      findPath.mockReturnValue([
        { x: 0, y: 0 },
        { x: 5, y: 5 }
      ])

      mockUnit.guardTarget = {
        health: 100,
        x: 5 * TILE_SIZE,
        y: 5 * TILE_SIZE,
        tileX: 5,
        tileY: 5
      }
      mockUnit.lastGuardPathCalcTime = 0

      updateGuardBehavior(mockUnit, mockMapGrid, mockOccupancyMap, now)

      expect(mockUnit.lastGuardPathCalcTime).toBe(now)
    })
  })
})
