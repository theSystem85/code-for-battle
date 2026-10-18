/**
 * Unit tests for baseUtils.js
 *
 * Tests the utility functions for managing base structures,
 * distance calculations, and structure normalization.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getBaseStructures, isWithinBaseRange } from '../../src/utils/baseUtils.js'
import { gameState } from '../../src/gameState.js'
import { MAX_BUILDING_GAP_TILES } from '../../src/config.js'

describe('baseUtils', () => {
  // Store original state to restore after tests
  let originalBuildings
  let originalFactories

  beforeEach(() => {
    // Save original state
    originalBuildings = gameState.buildings
    originalFactories = gameState.factories

    // Reset to empty arrays
    gameState.buildings = []
    gameState.factories = []
  })

  afterEach(() => {
    // Restore original state
    gameState.buildings = originalBuildings
    gameState.factories = originalFactories
  })

  describe('getBaseStructures', () => {
    it('[U00378] should return empty array when no structures exist', () => {
      const structures = getBaseStructures('player')
      expect(structures).toEqual([])
    })

    it('[U00379] should return factory structures for the specified owner', () => {
      gameState.factories = [
        { id: 'player', owner: 'player', x: 10, y: 10, width: 3, height: 3 }
      ]

      const structures = getBaseStructures('player')

      expect(structures).toHaveLength(1)
      expect(structures[0]).toEqual({ x: 10, y: 10, width: 3, height: 3 })
    })

    it('[U00380] should return building structures for the specified owner', () => {
      gameState.buildings = [
        { type: 'powerPlant', owner: 'player', x: 20, y: 20, width: 3, height: 3 }
      ]

      const structures = getBaseStructures('player')

      expect(structures).toHaveLength(1)
      expect(structures[0]).toEqual({ x: 20, y: 20, width: 3, height: 3 })
    })

    it('[U00381] should return both factories and buildings for the owner', () => {
      gameState.factories = [
        { id: 'player', owner: 'player', x: 10, y: 10, width: 3, height: 3 }
      ]
      gameState.buildings = [
        { type: 'powerPlant', owner: 'player', x: 20, y: 20, width: 3, height: 3 },
        { type: 'refinery', owner: 'player', x: 25, y: 25, width: 4, height: 3 }
      ]

      const structures = getBaseStructures('player')

      expect(structures).toHaveLength(3)
    })

    it('[U00382] should filter out structures belonging to other owners', () => {
      gameState.factories = [
        { id: 'player', owner: 'player', x: 10, y: 10, width: 3, height: 3 },
        { id: 'enemy', owner: 'enemy', x: 50, y: 50, width: 3, height: 3 }
      ]
      gameState.buildings = [
        { type: 'powerPlant', owner: 'player', x: 20, y: 20, width: 3, height: 3 },
        { type: 'powerPlant', owner: 'enemy', x: 60, y: 60, width: 3, height: 3 }
      ]

      const playerStructures = getBaseStructures('player')
      const enemyStructures = getBaseStructures('enemy')

      expect(playerStructures).toHaveLength(2)
      expect(enemyStructures).toHaveLength(2)
    })

    it('[U00383] should use factory id as owner fallback', () => {
      // Some factories use 'id' instead of 'owner'
      gameState.factories = [
        { id: 'player', x: 10, y: 10, width: 3, height: 3 }
      ]

      const structures = getBaseStructures('player')

      expect(structures).toHaveLength(1)
    })

    it('[U00384] should default missing width/height to 1', () => {
      gameState.buildings = [
        { type: 'turret', owner: 'player', x: 15, y: 15 }
      ]

      const structures = getBaseStructures('player')

      expect(structures).toHaveLength(1)
      expect(structures[0].width).toBe(1)
      expect(structures[0].height).toBe(1)
    })

    it('[U00385] should default missing x/y to 0', () => {
      gameState.buildings = [
        { type: 'turret', owner: 'player', width: 2, height: 2 }
      ]

      const structures = getBaseStructures('player')

      expect(structures).toHaveLength(1)
      expect(structures[0].x).toBe(0)
      expect(structures[0].y).toBe(0)
    })

    it('[U00386] should accept custom buildings/factories arrays', () => {
      const customBuildings = [
        { type: 'powerPlant', owner: 'player', x: 100, y: 100, width: 3, height: 3 }
      ]
      const customFactories = [
        { id: 'player', x: 200, y: 200, width: 3, height: 3 }
      ]

      const structures = getBaseStructures('player', {
        buildings: customBuildings,
        factories: customFactories
      })

      expect(structures).toHaveLength(2)
    })

    it('[U00387] should handle null/undefined entries gracefully', () => {
      gameState.buildings = [
        null,
        { type: 'powerPlant', owner: 'player', x: 20, y: 20, width: 3, height: 3 },
        undefined
      ]
      gameState.factories = [
        null,
        { id: 'player', x: 10, y: 10, width: 3, height: 3 }
      ]

      const structures = getBaseStructures('player')

      expect(structures).toHaveLength(2)
    })
  })

  describe('isWithinBaseRange', () => {
    it('[U00388] should return true when no structures exist (allow placement anywhere)', () => {
      const result = isWithinBaseRange(50, 50, 'player')
      expect(result).toBe(true)
    })

    it('[U00389] should return true for position directly on a structure', () => {
      gameState.factories = [
        { id: 'player', x: 10, y: 10, width: 3, height: 3 }
      ]

      const result = isWithinBaseRange(10, 10, 'player')
      expect(result).toBe(true)
    })

    it('[U00390] should return true for position adjacent to structure (distance 1)', () => {
      gameState.factories = [
        { id: 'player', x: 10, y: 10, width: 3, height: 3 }
      ]

      // Position just to the right of the factory (factory ends at x=12, so x=13 is adjacent)
      const result = isWithinBaseRange(13, 10, 'player')
      expect(result).toBe(true)
    })

    it('[U00391] should return true for position at MAX_BUILDING_GAP_TILES distance', () => {
      gameState.factories = [
        { id: 'player', x: 10, y: 10, width: 3, height: 3 }
      ]

      // Factory occupies tiles 10-12. Distance of MAX_BUILDING_GAP_TILES from tile 12
      const targetX = 12 + MAX_BUILDING_GAP_TILES
      const result = isWithinBaseRange(targetX, 10, 'player')
      expect(result).toBe(true)
    })

    it('[U00392] should return false for position beyond MAX_BUILDING_GAP_TILES', () => {
      gameState.factories = [
        { id: 'player', x: 10, y: 10, width: 3, height: 3 }
      ]

      // Factory occupies tiles 10-12. One beyond MAX_BUILDING_GAP_TILES from tile 12
      const targetX = 12 + MAX_BUILDING_GAP_TILES + 1
      const result = isWithinBaseRange(targetX, 10, 'player')
      expect(result).toBe(false)
    })

    it('[U00393] should use Chebyshev distance (diagonal counts same as cardinal)', () => {
      gameState.factories = [
        { id: 'player', x: 10, y: 10, width: 1, height: 1 }
      ]

      // Chebyshev distance of 2 diagonally
      const result = isWithinBaseRange(12, 12, 'player')
      expect(result).toBe(true)
    })

    it('[U00394] should check distance from all tiles of a multi-tile structure', () => {
      gameState.factories = [
        { id: 'player', x: 10, y: 10, width: 3, height: 3 }
      ]

      // Position that is far from (10,10) but within range of (12,12)
      const result = isWithinBaseRange(15, 12, 'player')
      expect(result).toBe(true)
    })

    it('[U00395] should check against multiple structures', () => {
      gameState.buildings = [
        { type: 'powerPlant', owner: 'player', x: 10, y: 10, width: 3, height: 3 },
        { type: 'refinery', owner: 'player', x: 50, y: 50, width: 4, height: 3 }
      ]

      // Position within range of second building but not first
      const result = isWithinBaseRange(55, 50, 'player')
      expect(result).toBe(true)
    })

    it('[U00396] should accept custom maxDistance parameter', () => {
      gameState.factories = [
        { id: 'player', x: 10, y: 10, width: 1, height: 1 }
      ]

      // Position at distance 5
      const resultWithDefault = isWithinBaseRange(15, 10, 'player')
      const resultWithCustom = isWithinBaseRange(15, 10, 'player', { maxDistance: 10 })

      // With MAX_BUILDING_GAP_TILES = 3, distance 5 should fail with default
      expect(resultWithDefault).toBe(false)
      // But should pass with maxDistance = 10
      expect(resultWithCustom).toBe(true)
    })

    it('[U00397] should only consider structures of the specified owner', () => {
      gameState.factories = [
        { id: 'enemy', x: 10, y: 10, width: 3, height: 3 }
      ]
      gameState.buildings = [
        { type: 'powerPlant', owner: 'player', x: 50, y: 50, width: 3, height: 3 }
      ]

      // Position near enemy factory but far from player buildings
      const result = isWithinBaseRange(13, 10, 'player')
      expect(result).toBe(false)
    })

    it('[U00398] should accept custom buildings/factories arrays', () => {
      const customBuildings = [
        { type: 'powerPlant', owner: 'player', x: 100, y: 100, width: 3, height: 3 }
      ]

      const result = isWithinBaseRange(103, 100, 'player', {
        buildings: customBuildings,
        factories: []
      })
      expect(result).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('[U00399] should handle structures at map origin (0,0)', () => {
      gameState.factories = [
        { id: 'player', x: 0, y: 0, width: 3, height: 3 }
      ]

      const result = isWithinBaseRange(3, 0, 'player')
      expect(result).toBe(true)
    })

    it('[U00400] should handle large structure dimensions', () => {
      gameState.buildings = [
        { type: 'large', owner: 'player', x: 10, y: 10, width: 10, height: 10 }
      ]

      const structures = getBaseStructures('player')
      expect(structures[0].width).toBe(10)
      expect(structures[0].height).toBe(10)
    })

    it('[U00401] should handle negative coordinates', () => {
      // While unusual, the functions should not crash
      gameState.buildings = [
        { type: 'test', owner: 'player', x: -5, y: -5, width: 3, height: 3 }
      ]

      const structures = getBaseStructures('player')
      expect(structures).toHaveLength(1)

      const result = isWithinBaseRange(-3, -5, 'player')
      expect(result).toBe(true)
    })
  })
})
