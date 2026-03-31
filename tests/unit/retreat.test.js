import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isRetreating,
  cancelRetreat,
  cancelRetreatForUnits,
  shouldExitRetreat,
  initiateRetreat,
  updateRetreatBehavior
} from '../../src/behaviours/retreat.js'

// Mock dependencies
vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  TANK_FIRE_RANGE: 8
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1'
  }
}))

vi.mock('../../src/logic.js', () => ({
  angleDiff: vi.fn((a, b) => Math.abs(a - b))
}))

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn()
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

const TILE_SIZE = 32

describe('retreat behavior', () => {
  describe('isRetreating', () => {
    it('returns true when unit isRetreating is true', () => {
      const unit = { isRetreating: true }
      expect(isRetreating(unit)).toBe(true)
    })

    it('returns false when unit isRetreating is false', () => {
      const unit = { isRetreating: false }
      expect(isRetreating(unit)).toBe(false)
    })

    it('returns false when unit isRetreating is undefined', () => {
      const unit = {}
      expect(isRetreating(unit)).toBe(false)
    })

    it('returns false when unit isRetreating is null', () => {
      const unit = { isRetreating: null }
      expect(isRetreating(unit)).toBe(false)
    })
  })

  describe('cancelRetreat', () => {
    it('clears retreat state from unit', () => {
      const unit = {
        isRetreating: true,
        retreatTarget: { x: 5, y: 5 },
        retreatMovementDirection: 'backward',
        retreatOriginalTarget: { id: 1 },
        isMovingBackwards: true,
        canFire: false,
        canAccelerate: false,
        retreatStuckDetection: { stuckTime: 1000 },
        path: [{ x: 5, y: 5 }],
        moveTarget: { x: 160, y: 160 },
        movement: {
          isMoving: true,
          targetVelocity: { x: 1, y: 1 }
        }
      }

      cancelRetreat(unit)

      expect(unit.isRetreating).toBe(false)
      expect(unit.retreatTarget).toBe(null)
      expect(unit.retreatMovementDirection).toBe(null)
      expect(unit.retreatOriginalTarget).toBe(null)
      expect(unit.isMovingBackwards).toBe(false)
      expect(unit.canFire).toBe(true)
      expect(unit.canAccelerate).toBe(true)
      expect(unit.retreatStuckDetection).toBe(null)
      expect(unit.path).toEqual([])
      expect(unit.moveTarget).toBe(null)
      expect(unit.movement.isMoving).toBe(false)
      expect(unit.movement.targetVelocity).toEqual({ x: 0, y: 0 })
    })

    it('does nothing if unit is not retreating', () => {
      const unit = {
        isRetreating: false,
        canFire: false
      }

      cancelRetreat(unit)

      // Should not modify other properties
      expect(unit.canFire).toBe(false)
    })

    it('handles unit without movement property', () => {
      const unit = {
        isRetreating: true,
        retreatTarget: { x: 5, y: 5 }
      }

      expect(() => cancelRetreat(unit)).not.toThrow()
      expect(unit.isRetreating).toBe(false)
    })
  })

  describe('cancelRetreatForUnits', () => {
    it('cancels retreat for all retreating units', () => {
      const units = [
        { isRetreating: true, retreatTarget: { x: 1, y: 1 }, path: [] },
        { isRetreating: true, retreatTarget: { x: 2, y: 2 }, path: [] },
        { isRetreating: false }
      ]

      cancelRetreatForUnits(units)

      expect(units[0].isRetreating).toBe(false)
      expect(units[1].isRetreating).toBe(false)
      expect(units[2].isRetreating).toBe(false)
    })

    it('handles empty array', () => {
      expect(() => cancelRetreatForUnits([])).not.toThrow()
    })

    it('handles units without retreat state', () => {
      const units = [{ type: 'tank' }]
      expect(() => cancelRetreatForUnits(units)).not.toThrow()
    })
  })

  describe('shouldExitRetreat', () => {
    it('returns false if unit is not retreating', () => {
      const unit = { isRetreating: false }
      expect(shouldExitRetreat(unit, performance.now())).toBe(false)
    })

    it('returns true if retreat original target is destroyed', () => {
      const unit = {
        isRetreating: true,
        retreatOriginalTarget: { health: 0 },
        retreatStartTime: performance.now()
      }
      expect(shouldExitRetreat(unit, performance.now())).toBe(true)
    })

    it('returns true if retreat original target has negative health', () => {
      const unit = {
        isRetreating: true,
        retreatOriginalTarget: { health: -10 },
        retreatStartTime: performance.now()
      }
      expect(shouldExitRetreat(unit, performance.now())).toBe(true)
    })

    it('returns false if retreat original target is alive', () => {
      const unit = {
        isRetreating: true,
        retreatOriginalTarget: { health: 100 },
        retreatStartTime: performance.now()
      }
      expect(shouldExitRetreat(unit, performance.now())).toBe(false)
    })

    it('returns true if retreat duration exceeds 30 seconds', () => {
      const now = performance.now()
      const unit = {
        isRetreating: true,
        retreatOriginalTarget: { health: 100 },
        retreatStartTime: now - 31000 // 31 seconds ago
      }
      expect(shouldExitRetreat(unit, now)).toBe(true)
    })

    it('returns false if retreat duration is under 30 seconds', () => {
      const now = performance.now()
      const unit = {
        isRetreating: true,
        retreatOriginalTarget: { health: 100 },
        retreatStartTime: now - 20000 // 20 seconds ago
      }
      expect(shouldExitRetreat(unit, now)).toBe(false)
    })

    it('handles missing retreatOriginalTarget', () => {
      const now = performance.now()
      const unit = {
        isRetreating: true,
        retreatStartTime: now
      }
      expect(shouldExitRetreat(unit, now)).toBe(false)
    })

    it('handles missing retreatStartTime by using current time', () => {
      const now = performance.now()
      const unit = {
        isRetreating: true,
        retreatOriginalTarget: { health: 100 }
      }
      // Without retreatStartTime, duration would be 0
      expect(shouldExitRetreat(unit, now)).toBe(false)
    })
  })

  describe('initiateRetreat', () => {
    let mapGrid

    beforeEach(() => {
      // Create 10x10 map of passable terrain
      mapGrid = Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => ({
          type: 'grass',
          building: false,
          seedCrystal: false
        }))
      )
    })

    it('sets retreat state on valid tank units', () => {
      const units = [
        { id: 1, type: 'tank', owner: 'player1', target: null, attackQueue: [] }
      ]

      initiateRetreat(units, 160, 160, mapGrid)

      expect(units[0].isRetreating).toBe(true)
      expect(units[0].retreatTarget).toBeDefined()
    })

    it('ignores non-tank units', () => {
      const units = [
        { id: 1, type: 'harvester', owner: 'player1' }
      ]

      initiateRetreat(units, 160, 160, mapGrid)

      expect(units[0].isRetreating).toBeUndefined()
    })

    it('ignores enemy units', () => {
      const units = [
        { id: 1, type: 'tank', owner: 'enemy' }
      ]

      initiateRetreat(units, 160, 160, mapGrid)

      expect(units[0].isRetreating).toBeUndefined()
    })

    it('rejects water terrain as retreat position', () => {
      mapGrid[5][5].type = 'water'

      const units = [
        { id: 1, type: 'tank', owner: 'player1' }
      ]

      initiateRetreat(units, 5 * TILE_SIZE, 5 * TILE_SIZE, mapGrid)

      // Unit should NOT have retreat initiated because target is water
      expect(units[0].isRetreating).toBeUndefined()
    })

    it('rejects building tiles as retreat position', () => {
      mapGrid[5][5].building = true

      const units = [
        { id: 1, type: 'tank', owner: 'player1' }
      ]

      initiateRetreat(units, 5 * TILE_SIZE, 5 * TILE_SIZE, mapGrid)

      expect(units[0].isRetreating).toBeUndefined()
    })

    it('supports tank variants', () => {
      const units = [
        { id: 1, type: 'tank_v1', owner: 'player1', attackQueue: [] },
        { id: 2, type: 'tank-v2', owner: 'player1', attackQueue: [] },
        { id: 3, type: 'tank-v3', owner: 'player1', attackQueue: [] },
        { id: 4, type: 'rocketTank', owner: 'player1', attackQueue: [] },
        { id: 5, type: 'howitzer', owner: 'player1', attackQueue: [] }
      ]

      initiateRetreat(units, 160, 160, mapGrid)

      units.forEach(unit => {
        expect(unit.isRetreating).toBe(true)
      })
    })

    it('clears attack state when retreating', () => {
      const units = [
        {
          id: 1,
          type: 'tank',
          owner: 'player1',
          attackQueue: [{ target: 'enemy1' }],
          isAttacking: true,
          alertMode: true
        }
      ]

      initiateRetreat(units, 160, 160, mapGrid)

      expect(units[0].attackQueue).toEqual([])
      expect(units[0].isAttacking).toBe(false)
      expect(units[0].alertMode).toBe(false)
    })

    it('preserves current target for continued firing', () => {
      const target = { id: 'enemy1', health: 100 }
      const units = [
        {
          id: 1,
          type: 'tank',
          owner: 'player1',
          target: target,
          attackQueue: []
        }
      ]

      initiateRetreat(units, 160, 160, mapGrid)

      expect(units[0].target).toBe(target)
      expect(units[0].retreatOriginalTarget).toBe(target)
    })

    it('does not preserve dead target', () => {
      const target = { id: 'enemy1', health: 0 }
      const units = [
        {
          id: 1,
          type: 'tank',
          owner: 'player1',
          target: target,
          attackQueue: []
        }
      ]

      initiateRetreat(units, 160, 160, mapGrid)

      expect(units[0].retreatOriginalTarget).toBeUndefined()
    })

    it('rejects out-of-bounds retreat position', () => {
      const units = [
        { id: 1, type: 'tank', owner: 'player1' }
      ]

      initiateRetreat(units, -100, 160, mapGrid)

      expect(units[0].isRetreating).toBeUndefined()
    })
  })

  describe('updateRetreatBehavior', () => {
    let mapGrid

    beforeEach(() => {
      mapGrid = Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => ({
          type: 'grass',
          building: false,
          seedCrystal: false
        }))
      )
    })

    it('returns false if unit is not retreating', () => {
      const unit = { isRetreating: false }
      expect(updateRetreatBehavior(unit, performance.now(), mapGrid, [])).toBe(false)
    })

    it('returns false for non-player-issued retreats (AI retreats)', () => {
      const unit = {
        isRetreating: true,
        retreatIssuedByPlayer: false,
        x: 0,
        y: 0,
        retreatTarget: { x: 5, y: 5 },
        direction: 0
      }
      expect(updateRetreatBehavior(unit, performance.now(), mapGrid, [])).toBe(false)
    })

    it('returns true if unit is retreating (player-issued)', () => {
      const unit = {
        isRetreating: true,
        retreatIssuedByPlayer: true,
        x: 0,
        y: 0,
        retreatTarget: { x: 5, y: 5 },
        direction: 0
      }
      expect(updateRetreatBehavior(unit, performance.now(), mapGrid, [])).toBe(true)
    })

    it('clears retreat state when reaching destination', () => {
      const unit = {
        isRetreating: true,
        retreatIssuedByPlayer: true,
        x: 5 * TILE_SIZE,
        y: 5 * TILE_SIZE,
        retreatTarget: { x: 5, y: 5 },
        direction: 0,
        retreatMovementDirection: 'backward',
        path: [{ x: 5, y: 5 }],
        moveTarget: { x: 160, y: 160 },
        isMovingBackwards: true,
        canAccelerate: false
      }

      updateRetreatBehavior(unit, performance.now(), mapGrid, [])

      expect(unit.isRetreating).toBe(false)
      expect(unit.retreatTarget).toBe(null)
      expect(unit.path).toEqual([])
    })

    it('stops retreat when path is blocked by building', () => {
      // Place building in path
      mapGrid[3][3].building = true

      const unit = {
        isRetreating: true,
        retreatIssuedByPlayer: true,
        x: 0,
        y: 0,
        retreatTarget: { x: 5, y: 5 },
        direction: 0,
        retreatMovementDirection: 'forward',
        path: [{ x: 5, y: 5 }]
      }

      updateRetreatBehavior(unit, performance.now(), mapGrid, [])

      expect(unit.isRetreating).toBe(false)
    })

    it('stops retreat when path is blocked by water', () => {
      mapGrid[2][2].type = 'water'

      const unit = {
        isRetreating: true,
        retreatIssuedByPlayer: true,
        x: 0,
        y: 0,
        retreatTarget: { x: 5, y: 5 },
        direction: 0,
        retreatMovementDirection: 'forward',
        path: [{ x: 5, y: 5 }]
      }

      updateRetreatBehavior(unit, performance.now(), mapGrid, [])

      expect(unit.isRetreating).toBe(false)
    })

    it('disables firing when retreat target is out of range', () => {
      const unit = {
        isRetreating: true,
        retreatIssuedByPlayer: true,
        x: 0,
        y: 0,
        retreatTarget: { x: 5, y: 5 },
        direction: 0,
        canFire: true,
        target: { x: 20 * TILE_SIZE, y: 20 * TILE_SIZE, health: 100, tileX: 20, tileY: 20 }
      }

      updateRetreatBehavior(unit, performance.now(), mapGrid, [])

      expect(unit.canFire).toBe(false)
    })

    it('clears retreat state when stuck for too long', () => {
      const now = 5000
      const unit = {
        id: 'tank-1',
        isRetreating: true,
        retreatIssuedByPlayer: true,
        x: 0,
        y: 0,
        retreatTarget: { x: 5, y: 5 },
        direction: 0,
        canAccelerate: true,
        retreatStuckDetection: {
          lastPosition: { x: 0, y: 0 },
          stuckTime: 1500,
          lastCheck: now - 2000
        },
        movement: {
          isMoving: true,
          targetVelocity: { x: 1, y: 1 }
        }
      }

      updateRetreatBehavior(unit, now, mapGrid, [])

      expect(unit.isRetreating).toBe(false)
      expect(unit.retreatTarget).toBe(null)
      expect(unit.retreatStuckDetection).toBe(null)
    })
  })
})
