
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  initializeHowitzerGun,
  updateHowitzerGunState,
  isHowitzerGunReadyToFire,
  getHowitzerLaunchAngle
} from '../../src/game/howitzerGunController.js'

// Mock dependencies
vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  HOWITZER_FIRE_RANGE: 15,
  HOWITZER_MIN_RANGE: 2
}))

vi.mock('../../src/logic.js', () => ({
  normalizeAngle: (angle) => {
    const twoPi = 2 * Math.PI
    let res = ((angle % twoPi) + twoPi) % twoPi
    if (res > Math.PI) {
      res -= twoPi
    }
    return res
  }
}))

describe('howitzerGunController', () => {
  let unit
  const NOW = 1000

  beforeEach(() => {
    unit = {
      type: 'howitzer',
      x: 100,
      y: 100,
      direction: Math.PI / 2, // Facing South (down)
      target: null
    }
    // Setup performance.now mock if needed, or pass 'now' explicitly to update
  })

  describe('initializeHowitzerGun', () => {
    it('[U02019] sets initial properties correctly', () => {
      initializeHowitzerGun(unit)

      expect(unit.barrelElevation).toBe(0)
      expect(unit.targetBarrelElevation).toBe(0)
      expect(unit.barrelWorldAngle).toBe(unit.direction)
      expect(unit.targetBarrelWorldAngle).toBe(unit.direction)
      expect(unit.lastBarrelUpdateTime).toBeDefined()
      expect(unit.howitzerGunReady).toBe(true)
      expect(unit.howitzerMovementLock).toBe(false)
      expect(unit.barrelDistanceFactor).toBe(1)
    })
  })

  describe('updateHowitzerGunState', () => {
    beforeEach(() => {
      initializeHowitzerGun(unit)
      unit.lastBarrelUpdateTime = NOW // Override to use test time
    })

    it('[U02020] resets gun when there is no target', () => {
      // Set gun to some elevated state
      unit.barrelElevation = 0.5
      unit.targetBarrelElevation = 0.5

      // Update with no target
      updateHowitzerGunState(unit, NOW + 16)

      expect(unit.targetBarrelElevation).toBe(0) // Should aim for 0 elevation
      // It won't be 0 immediately due to smooth movement
      expect(unit.barrelElevation).toBeLessThan(0.5)
    })

    it('[U02021] calculates desired world angle and elevation when target is present', () => {
      // Target at some distance
      // Unit is at 100, 100. TILE_SIZE is 32. Center is 116, 116.
      // Target at 200, 100. Center is 216, 116.
      // Angle should be 0 (East).
      unit.target = {
        x: 200,
        y: 100,
        width: 1,
        height: 1,
        health: 100,
        tileX: 200 / 32 // flag for tile-based coord check
      }

      // We need to make sure the unit direction is taken into account.
      // If unit faces South (PI/2), and target is East (0).
      // barrelWorldAngle should become 0.

      // Update
      updateHowitzerGunState(unit, NOW)

      expect(unit.targetBarrelWorldAngle).toBeCloseTo(0, 0)
      // Elevation calculation logic:
      // rawElevation = normalizeAngle(unit.direction - desiredWorldAngle)
      // rawElevation = normalizeAngle(PI/2 - 0) = PI/2 = 1.57...
      // MAX_ELEVATION_RAD is 65 deg ~= 1.13 rad.
      // So targetElevation should be clamped to MAX.
      const MAX_ELEVATION_RAD = (65 * Math.PI) / 180
      expect(unit.targetBarrelElevation).toBeCloseTo(MAX_ELEVATION_RAD)
    })

    it('[U02022] updates barrel elevation smoothly over time', () => {
      unit.target = {
        x: 100 + 400, // +400 pixels East
        y: 100,
        width: 1, height: 1, health: 100, tileX: 1
      }
      // Direction PI/2. Target direction 0. Desired elevation ~MAX (1.13 rad).
      // Current elevation 0.

      const prevElevation = unit.barrelElevation

      // Simulate small time step
      updateHowitzerGunState(unit, NOW + 16)

      expect(unit.barrelElevation).toBeGreaterThan(prevElevation) // Should increase
      expect(unit.barrelElevation).toBeTopLessThan(unit.targetBarrelElevation) // But not jump instantly
    })

    it('[U02023] updates howitzerGunReady correctly based on elevation error', () => {
      unit.direction = 0
      unit.target = { x: 300, y: 100, width: 1, height: 1, health: 100, tileX: 1 } // Target East
      // Desired Angle 0. Unit Direction 0.
      // Desired Elevation = Dir - TargetAngle = 0.

      updateHowitzerGunState(unit, NOW)

      // Error is 0. Should be ready.
      expect(unit.howitzerGunReady).toBe(true)

      // Now force a large error manually
      unit.barrelElevation = 1.0 // Large error
      // Re-run update to refresh flags
      updateHowitzerGunState(unit, NOW + 16)

      expect(unit.howitzerGunReady).toBe(false)
    })

    it('[U02024] sets howitzerMovementLock correctly', () => {
      // Force moving state
      unit.barrelElevation = 0
      unit.targetBarrelElevation = 1.0 // Big diff

      // We need to trick definitions inside update.
      // The update function recalculates targetElevation based on target.
      // So let's provide a target that requires raising.
      unit.direction = Math.PI / 2
      unit.target = { x: 500, y: 100, width: 1, height: 1, health: 100, tileX: 1 } // East
      // Target Angle 0. Unit Dir PI/2. Desired Elevation PI/2 (clamped).

      updateHowitzerGunState(unit, NOW)

      // difference is large
      expect(unit.barrelIsMoving).toBe(true)
      expect(unit.howitzerMovementLock).toBe(true)
    })
  })

  describe('isHowitzerGunReadyToFire', () => {
    it('[U02025] returns true if not howitzer', () => {
      expect(isHowitzerGunReadyToFire({ type: 'tank' })).toBe(true)
      expect(isHowitzerGunReadyToFire(null)).toBe(true)
    })

    it('[U02026] returns the ready state for howitzer', () => {
      unit.howitzerGunReady = false
      expect(isHowitzerGunReadyToFire(unit)).toBe(false)

      unit.howitzerGunReady = true
      expect(isHowitzerGunReadyToFire(unit)).toBe(true)
    })
  })

  describe('getHowitzerLaunchAngle', () => {
    it('[U02027] returns unit direction for non-howitzer', () => {
      expect(getHowitzerLaunchAngle({ type: 'tank', direction: 1.2 })).toBe(1.2)
    })

    it('[U02028] returns barrelWorldAngle for howitzer', () => {
      unit.barrelWorldAngle = 0.5
      expect(getHowitzerLaunchAngle(unit)).toBe(0.5)
    })
  })
})

// Helper extension for inequalities if needed, or use toBeGreaterThan
expect.extend({
  toBeTopLessThan(received, max) {
    const pass = received < max
    if (pass) {
      return {
        message: () => `expected ${received} to be >= ${max}`,
        pass: true
      }
    } else {
      return {
        message: () => `expected ${received} to be < ${max}`,
        pass: false
      }
    }
  }
})
