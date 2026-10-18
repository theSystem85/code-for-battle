/**
 * Unit tests for helipadUtils.js
 *
 * Tests utility functions for calculating helipad landing positions.
 */

import { describe, it, expect } from 'vitest'
import {
  HELIPAD_LANDING_CENTER_OFFSET,
  getHelipadLandingCenter,
  getHelipadLandingTile,
  getHelipadLandingTopLeft
} from '../../src/utils/helipadUtils.js'
import { TILE_SIZE } from '../../src/config.js'

describe('helipadUtils', () => {
  describe('HELIPAD_LANDING_CENTER_OFFSET', () => {
    it('[U01916] should be a frozen object', () => {
      expect(Object.isFrozen(HELIPAD_LANDING_CENTER_OFFSET)).toBe(true)
    })

    it('[U01917] should have x and y properties', () => {
      expect(HELIPAD_LANDING_CENTER_OFFSET).toHaveProperty('x')
      expect(HELIPAD_LANDING_CENTER_OFFSET).toHaveProperty('y')
    })

    it('[U01918] should have expected offset values', () => {
      expect(HELIPAD_LANDING_CENTER_OFFSET.x).toBe(25)
      expect(HELIPAD_LANDING_CENTER_OFFSET.y).toBe(44)
    })

    it('[U01919] should not be modifiable', () => {
      expect(() => {
        HELIPAD_LANDING_CENTER_OFFSET.x = 100
      }).toThrow()
    })
  })

  describe('getHelipadLandingCenter', () => {
    it('[U01920] should return null for null helipad', () => {
      expect(getHelipadLandingCenter(null)).toBeNull()
    })

    it('[U01921] should return null for undefined helipad', () => {
      expect(getHelipadLandingCenter(undefined)).toBeNull()
    })

    it('[U01922] should return null for helipad without x coordinate', () => {
      expect(getHelipadLandingCenter({ y: 5 })).toBeNull()
    })

    it('[U01923] should return null for helipad without y coordinate', () => {
      expect(getHelipadLandingCenter({ x: 5 })).toBeNull()
    })

    it('[U01924] should return null for helipad with non-numeric x', () => {
      expect(getHelipadLandingCenter({ x: 'five', y: 5 })).toBeNull()
    })

    it('[U01925] should return null for helipad with non-numeric y', () => {
      expect(getHelipadLandingCenter({ x: 5, y: 'five' })).toBeNull()
    })

    it('[U01926] should calculate center position at origin', () => {
      const helipad = { x: 0, y: 0 }
      const center = getHelipadLandingCenter(helipad)

      expect(center).toEqual({
        x: HELIPAD_LANDING_CENTER_OFFSET.x,
        y: HELIPAD_LANDING_CENTER_OFFSET.y
      })
    })

    it('[U01927] should calculate center position at non-origin', () => {
      const helipad = { x: 5, y: 10 }
      const center = getHelipadLandingCenter(helipad)

      expect(center).toEqual({
        x: 5 * TILE_SIZE + HELIPAD_LANDING_CENTER_OFFSET.x,
        y: 10 * TILE_SIZE + HELIPAD_LANDING_CENTER_OFFSET.y
      })
    })

    it('[U01928] should handle zero coordinates', () => {
      const helipad = { x: 0, y: 0 }
      const center = getHelipadLandingCenter(helipad)

      expect(center).not.toBeNull()
      expect(center.x).toBe(25)
      expect(center.y).toBe(44)
    })

    it('[U01929] should ignore extra properties on helipad', () => {
      const helipad = { x: 1, y: 1, type: 'helipad', health: 100 }
      const center = getHelipadLandingCenter(helipad)

      expect(center).toEqual({
        x: TILE_SIZE + HELIPAD_LANDING_CENTER_OFFSET.x,
        y: TILE_SIZE + HELIPAD_LANDING_CENTER_OFFSET.y
      })
    })
  })

  describe('getHelipadLandingTile', () => {
    it('[U01930] should return null for invalid helipad', () => {
      expect(getHelipadLandingTile(null)).toBeNull()
      expect(getHelipadLandingTile(undefined)).toBeNull()
      expect(getHelipadLandingTile({})).toBeNull()
    })

    it('[U01931] should return tile coordinates at origin', () => {
      const helipad = { x: 0, y: 0 }
      const tile = getHelipadLandingTile(helipad)

      // With offset (25, 44) and TILE_SIZE 32:
      // tile.x = floor(25 / 32) = 0
      // tile.y = floor(44 / 32) = 1
      expect(tile.x).toBe(Math.floor(HELIPAD_LANDING_CENTER_OFFSET.x / TILE_SIZE))
      expect(tile.y).toBe(Math.floor(HELIPAD_LANDING_CENTER_OFFSET.y / TILE_SIZE))
    })

    it('[U01932] should return correct tile for offset helipad', () => {
      const helipad = { x: 5, y: 5 }
      const tile = getHelipadLandingTile(helipad)

      const expectedX = Math.floor((5 * TILE_SIZE + HELIPAD_LANDING_CENTER_OFFSET.x) / TILE_SIZE)
      const expectedY = Math.floor((5 * TILE_SIZE + HELIPAD_LANDING_CENTER_OFFSET.y) / TILE_SIZE)

      expect(tile).toEqual({ x: expectedX, y: expectedY })
    })

    it('[U01933] should return integer tile coordinates', () => {
      const helipad = { x: 3, y: 7 }
      const tile = getHelipadLandingTile(helipad)

      expect(Number.isInteger(tile.x)).toBe(true)
      expect(Number.isInteger(tile.y)).toBe(true)
    })
  })

  describe('getHelipadLandingTopLeft', () => {
    it('[U01934] should return null for invalid helipad', () => {
      expect(getHelipadLandingTopLeft(null)).toBeNull()
      expect(getHelipadLandingTopLeft(undefined)).toBeNull()
      expect(getHelipadLandingTopLeft({})).toBeNull()
    })

    it('[U01935] should calculate top-left from center at origin', () => {
      const helipad = { x: 0, y: 0 }
      const topLeft = getHelipadLandingTopLeft(helipad)

      // Center is at (25, 44), top-left is offset by -TILE_SIZE/2
      expect(topLeft).toEqual({
        x: HELIPAD_LANDING_CENTER_OFFSET.x - TILE_SIZE / 2,
        y: HELIPAD_LANDING_CENTER_OFFSET.y - TILE_SIZE / 2
      })
    })

    it('[U01936] should calculate top-left for offset helipad', () => {
      const helipad = { x: 10, y: 10 }
      const topLeft = getHelipadLandingTopLeft(helipad)

      const centerX = 10 * TILE_SIZE + HELIPAD_LANDING_CENTER_OFFSET.x
      const centerY = 10 * TILE_SIZE + HELIPAD_LANDING_CENTER_OFFSET.y

      expect(topLeft).toEqual({
        x: centerX - TILE_SIZE / 2,
        y: centerY - TILE_SIZE / 2
      })
    })

    it('[U01937] should be exactly TILE_SIZE/2 to the left and up from center', () => {
      const helipad = { x: 5, y: 5 }
      const center = getHelipadLandingCenter(helipad)
      const topLeft = getHelipadLandingTopLeft(helipad)

      expect(center.x - topLeft.x).toBe(TILE_SIZE / 2)
      expect(center.y - topLeft.y).toBe(TILE_SIZE / 2)
    })
  })

  describe('integration', () => {
    it('[U01938] should provide consistent coordinates across all functions', () => {
      const helipad = { x: 7, y: 3 }

      const center = getHelipadLandingCenter(helipad)
      const tile = getHelipadLandingTile(helipad)
      const topLeft = getHelipadLandingTopLeft(helipad)

      // All should return valid values
      expect(center).not.toBeNull()
      expect(tile).not.toBeNull()
      expect(topLeft).not.toBeNull()

      // Tile should contain the center point
      expect(tile.x).toBe(Math.floor(center.x / TILE_SIZE))
      expect(tile.y).toBe(Math.floor(center.y / TILE_SIZE))

      // TopLeft should be half a tile offset from center
      expect(topLeft.x).toBe(center.x - TILE_SIZE / 2)
      expect(topLeft.y).toBe(center.y - TILE_SIZE / 2)
    })
  })
})
