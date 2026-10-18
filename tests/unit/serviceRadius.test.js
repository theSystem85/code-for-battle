import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isServiceBuilding,
  computeServiceRadiusTiles,
  ensureServiceRadius,
  getServiceRadiusPixels,
  getServiceBuildingTypes
} from '../../src/utils/serviceRadius.js'

// Mock config
vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32
}))

describe('serviceRadius', () => {
  describe('isServiceBuilding', () => {
    it('[U03954] returns true for vehicleWorkshop', () => {
      expect(isServiceBuilding({ type: 'vehicleWorkshop' })).toBe(true)
      expect(isServiceBuilding('vehicleWorkshop')).toBe(true)
    })

    it('[U03955] returns true for hospital', () => {
      expect(isServiceBuilding({ type: 'hospital' })).toBe(true)
      expect(isServiceBuilding('hospital')).toBe(true)
    })

    it('[U03956] returns true for gasStation', () => {
      expect(isServiceBuilding({ type: 'gasStation' })).toBe(true)
      expect(isServiceBuilding('gasStation')).toBe(true)
    })

    it('[U03957] returns true for ammunitionFactory', () => {
      expect(isServiceBuilding({ type: 'ammunitionFactory' })).toBe(true)
      expect(isServiceBuilding('ammunitionFactory')).toBe(true)
    })

    it('[U03958] returns false for regular buildings', () => {
      expect(isServiceBuilding({ type: 'factory' })).toBe(false)
      expect(isServiceBuilding({ type: 'refinery' })).toBe(false)
      expect(isServiceBuilding({ type: 'powerPlant' })).toBe(false)
      expect(isServiceBuilding({ type: 'turret' })).toBe(false)
    })

    it('[U03959] returns false for string non-service types', () => {
      expect(isServiceBuilding('factory')).toBe(false)
      expect(isServiceBuilding('refinery')).toBe(false)
    })

    it('[U03960] returns false for null', () => {
      expect(isServiceBuilding(null)).toBe(false)
    })

    it('[U03961] returns false for undefined', () => {
      expect(isServiceBuilding(undefined)).toBe(false)
    })

    it('[U03962] returns false for empty string', () => {
      expect(isServiceBuilding('')).toBe(false)
    })

    it('[U03963] returns false for object without type', () => {
      expect(isServiceBuilding({})).toBe(false)
    })
  })

  describe('computeServiceRadiusTiles', () => {
    it('[U03964] computes radius for 1x1 building', () => {
      const result = computeServiceRadiusTiles(1, 1)
      // halfWidth = 0.5, halfHeight = 0.5
      // radiusX = 1, radiusY = 1
      // hypot(1, 1) = sqrt(2) ≈ 1.414
      expect(result).toBeCloseTo(Math.SQRT2)
    })

    it('[U03965] computes radius for 2x2 building', () => {
      const result = computeServiceRadiusTiles(2, 2)
      // halfWidth = 1, halfHeight = 1
      // radiusX = 1.5, radiusY = 1.5
      // hypot(1.5, 1.5) ≈ 2.12
      expect(result).toBeCloseTo(Math.hypot(1.5, 1.5))
    })

    it('[U03966] computes radius for 3x2 building', () => {
      const result = computeServiceRadiusTiles(3, 2)
      // halfWidth = 1.5, halfHeight = 1
      // radiusX = 2, radiusY = 1.5
      // hypot(2, 1.5) ≈ 2.5
      expect(result).toBeCloseTo(Math.hypot(2, 1.5))
    })

    it('[U03967] defaults to 1x1 when given undefined', () => {
      const result = computeServiceRadiusTiles(undefined, undefined)
      expect(result).toBeCloseTo(Math.SQRT2)
    })

    it('[U03968] defaults to 1 for width when width is 0', () => {
      const result = computeServiceRadiusTiles(0, 2)
      // Width defaults to 1 when falsy
      expect(result).toBeCloseTo(Math.hypot(1, 1.5))
    })

    it('[U03969] defaults to 1 for height when height is 0', () => {
      const result = computeServiceRadiusTiles(2, 0)
      // Height defaults to 1 when falsy
      expect(result).toBeCloseTo(Math.hypot(1.5, 1))
    })
  })

  describe('ensureServiceRadius', () => {
    beforeEach(() => {
      // Clear any cached values
    })

    it('[U03970] returns 0 for non-service building', () => {
      const building = { type: 'factory', width: 2, height: 2 }
      expect(ensureServiceRadius(building)).toBe(0)
    })

    it('[U03971] returns 0 for null', () => {
      expect(ensureServiceRadius(null)).toBe(0)
    })

    it('[U03972] returns 0 for undefined', () => {
      expect(ensureServiceRadius(undefined)).toBe(0)
    })

    it('[U03973] sets and returns radius for hospital (2x multiplier)', () => {
      const building = { type: 'hospital', width: 2, height: 2 }
      const result = ensureServiceRadius(building)

      const baseRadius = computeServiceRadiusTiles(2, 2)
      expect(result).toBeCloseTo(baseRadius * 2)
      expect(building.serviceRadius).toBeCloseTo(baseRadius * 2)
    })

    it('[U03974] sets and returns radius for vehicleWorkshop (2x multiplier)', () => {
      const building = { type: 'vehicleWorkshop', width: 3, height: 2 }
      const result = ensureServiceRadius(building)

      const baseRadius = computeServiceRadiusTiles(3, 2)
      expect(result).toBeCloseTo(baseRadius * 2)
      expect(building.serviceRadius).toBeCloseTo(baseRadius * 2)
    })

    it('[U03975] sets and returns radius for gasStation (2x multiplier like hospital)', () => {
      const building = { type: 'gasStation', width: 2, height: 2 }
      const result = ensureServiceRadius(building)

      const baseRadius = computeServiceRadiusTiles(2, 2)
      expect(result).toBeCloseTo(baseRadius * 2)
      expect(building.serviceRadius).toBeCloseTo(baseRadius * 2)
    })

    it('[U03976] sets and returns radius for ammunitionFactory (2x multiplier like hospital)', () => {
      const building = { type: 'ammunitionFactory', width: 2, height: 2 }
      const result = ensureServiceRadius(building)

      const baseRadius = computeServiceRadiusTiles(2, 2)
      expect(result).toBeCloseTo(baseRadius * 2)
      expect(building.serviceRadius).toBeCloseTo(baseRadius * 2)
    })

    it('[U03977] returns existing serviceRadius if already set correctly', () => {
      const baseRadius = computeServiceRadiusTiles(2, 2)
      const expectedRadius = baseRadius * 2
      const building = {
        type: 'hospital',
        width: 2,
        height: 2,
        serviceRadius: expectedRadius
      }

      const result = ensureServiceRadius(building)

      expect(result).toBeCloseTo(expectedRadius)
    })

    it('[U03978] corrects serviceRadius if set incorrectly', () => {
      const building = {
        type: 'hospital',
        width: 2,
        height: 2,
        serviceRadius: 999 // Wrong value
      }

      const result = ensureServiceRadius(building)

      const baseRadius = computeServiceRadiusTiles(2, 2)
      expect(result).toBeCloseTo(baseRadius * 2)
      expect(building.serviceRadius).toBeCloseTo(baseRadius * 2)
    })
  })

  describe('getServiceRadiusPixels', () => {
    it('[U03979] returns radius in pixels', () => {
      const building = { type: 'hospital', width: 2, height: 2 }
      const radiusTiles = ensureServiceRadius(building)
      const result = getServiceRadiusPixels(building)

      expect(result).toBeCloseTo(radiusTiles * 32) // TILE_SIZE = 32
    })

    it('[U03980] returns 0 for non-service building', () => {
      const building = { type: 'factory', width: 2, height: 2 }
      expect(getServiceRadiusPixels(building)).toBe(0)
    })

    it('[U03981] returns 0 for null', () => {
      expect(getServiceRadiusPixels(null)).toBe(0)
    })
  })

  describe('getServiceBuildingTypes', () => {
    it('[U03982] returns array of service building types', () => {
      const types = getServiceBuildingTypes()

      expect(Array.isArray(types)).toBe(true)
      expect(types).toContain('vehicleWorkshop')
      expect(types).toContain('hospital')
      expect(types).toContain('gasStation')
      expect(types).toContain('ammunitionFactory')
    })

    it('[U03983] returns exactly 4 types', () => {
      const types = getServiceBuildingTypes()
      expect(types.length).toBe(4)
    })

    it('[U03984] returns new array each time (not the same reference)', () => {
      const types1 = getServiceBuildingTypes()
      const types2 = getServiceBuildingTypes()

      expect(types1).not.toBe(types2)
      expect(types1).toEqual(types2)
    })
  })
})
