/**
 * Unit tests for gameRandom.js
 *
 * Tests the random number generation utilities used throughout the game.
 * These functions wrap the deterministic RNG system but are also used
 * in single-player mode.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  gameRandom,
  gameRandomInt,
  gameRandomFloat,
  gameRandomElement,
  gameShuffle,
  gameRandomBool,
  isDeterministicModeEnabled,
  getRNGState,
  deterministicRNG
} from '../../src/utils/gameRandom.js'

describe('gameRandom', () => {
  // Store original state to restore after tests
  let originalEnabled
  let originalSeed

  beforeEach(() => {
    // Save original RNG state
    const state = getRNGState()
    originalEnabled = state.enabled
    originalSeed = state.seed
  })

  afterEach(() => {
    // Restore original RNG state
    if (originalEnabled) {
      deterministicRNG.enable()
    } else {
      deterministicRNG.disable()
    }
    deterministicRNG.setSeed(originalSeed)
  })

  describe('gameRandom()', () => {
    it('[U01658] should return a number between 0 and 1', () => {
      for (let i = 0; i < 100; i++) {
        const result = gameRandom()
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThan(1)
      }
    })

    it('[U01659] should return different values on consecutive calls (non-deterministic)', () => {
      deterministicRNG.disable()
      const values = new Set()
      for (let i = 0; i < 100; i++) {
        values.add(gameRandom())
      }
      // Expect at least 90 unique values out of 100
      expect(values.size).toBeGreaterThan(90)
    })

    it('[U01660] should return same sequence when seeded in deterministic mode', () => {
      deterministicRNG.setSeed(12345)
      deterministicRNG.enable()

      const firstSequence = []
      for (let i = 0; i < 10; i++) {
        firstSequence.push(gameRandom())
      }

      // Reset and generate again
      deterministicRNG.setSeed(12345)
      const secondSequence = []
      for (let i = 0; i < 10; i++) {
        secondSequence.push(gameRandom())
      }

      expect(firstSequence).toEqual(secondSequence)
    })
  })

  describe('gameRandomInt()', () => {
    it('[U01661] should return an integer within the specified range (inclusive)', () => {
      for (let i = 0; i < 100; i++) {
        const result = gameRandomInt(5, 10)
        expect(result).toBeGreaterThanOrEqual(5)
        expect(result).toBeLessThanOrEqual(10)
        expect(Number.isInteger(result)).toBe(true)
      }
    })

    it('[U01662] should return min when min equals max', () => {
      const result = gameRandomInt(7, 7)
      expect(result).toBe(7)
    })

    it('[U01663] should handle negative ranges', () => {
      for (let i = 0; i < 50; i++) {
        const result = gameRandomInt(-10, -5)
        expect(result).toBeGreaterThanOrEqual(-10)
        expect(result).toBeLessThanOrEqual(-5)
        expect(Number.isInteger(result)).toBe(true)
      }
    })

    it('[U01664] should handle mixed negative and positive ranges', () => {
      for (let i = 0; i < 50; i++) {
        const result = gameRandomInt(-5, 5)
        expect(result).toBeGreaterThanOrEqual(-5)
        expect(result).toBeLessThanOrEqual(5)
        expect(Number.isInteger(result)).toBe(true)
      }
    })

    it('[U01665] should be deterministic with same seed', () => {
      deterministicRNG.setSeed(99999)
      deterministicRNG.enable()

      const firstSequence = []
      for (let i = 0; i < 10; i++) {
        firstSequence.push(gameRandomInt(0, 100))
      }

      deterministicRNG.setSeed(99999)
      const secondSequence = []
      for (let i = 0; i < 10; i++) {
        secondSequence.push(gameRandomInt(0, 100))
      }

      expect(firstSequence).toEqual(secondSequence)
    })

    it('[U01666] should cover the full range over many iterations', () => {
      const values = new Set()
      for (let i = 0; i < 1000; i++) {
        values.add(gameRandomInt(1, 10))
      }
      // Should hit all values 1-10
      expect(values.size).toBe(10)
      for (let v = 1; v <= 10; v++) {
        expect(values.has(v)).toBe(true)
      }
    })
  })

  describe('gameRandomFloat()', () => {
    it('[U01667] should return a float within the specified range', () => {
      for (let i = 0; i < 100; i++) {
        const result = gameRandomFloat(2.5, 7.5)
        expect(result).toBeGreaterThanOrEqual(2.5)
        expect(result).toBeLessThan(7.5)
      }
    })

    it('[U01668] should handle negative ranges', () => {
      for (let i = 0; i < 50; i++) {
        const result = gameRandomFloat(-10.5, -5.5)
        expect(result).toBeGreaterThanOrEqual(-10.5)
        expect(result).toBeLessThan(-5.5)
      }
    })

    it('[U01669] should return different values (not just integers)', () => {
      let hasFloat = false
      for (let i = 0; i < 100; i++) {
        const result = gameRandomFloat(0, 10)
        if (!Number.isInteger(result)) {
          hasFloat = true
          break
        }
      }
      expect(hasFloat).toBe(true)
    })

    it('[U01670] should be deterministic with same seed', () => {
      deterministicRNG.setSeed(54321)
      deterministicRNG.enable()

      const firstSequence = []
      for (let i = 0; i < 10; i++) {
        firstSequence.push(gameRandomFloat(0, 100))
      }

      deterministicRNG.setSeed(54321)
      const secondSequence = []
      for (let i = 0; i < 10; i++) {
        secondSequence.push(gameRandomFloat(0, 100))
      }

      expect(firstSequence).toEqual(secondSequence)
    })
  })

  describe('gameRandomElement()', () => {
    it('[U01671] should return an element from the array', () => {
      const array = ['a', 'b', 'c', 'd', 'e']
      for (let i = 0; i < 50; i++) {
        const result = gameRandomElement(array)
        expect(array).toContain(result)
      }
    })

    it('[U01672] should return undefined for empty array', () => {
      const result = gameRandomElement([])
      expect(result).toBeUndefined()
    })

    it('[U01673] should return undefined for null/undefined array', () => {
      expect(gameRandomElement(null)).toBeUndefined()
      expect(gameRandomElement(undefined)).toBeUndefined()
    })

    it('[U01674] should return the only element for single-element array', () => {
      const result = gameRandomElement(['only'])
      expect(result).toBe('only')
    })

    it('[U01675] should select all elements over many iterations', () => {
      const array = [1, 2, 3, 4, 5]
      const selected = new Set()
      for (let i = 0; i < 500; i++) {
        selected.add(gameRandomElement(array))
      }
      expect(selected.size).toBe(5)
    })

    it('[U01676] should work with arrays of objects', () => {
      const array = [{ id: 1 }, { id: 2 }, { id: 3 }]
      for (let i = 0; i < 20; i++) {
        const result = gameRandomElement(array)
        expect(result).toHaveProperty('id')
        expect([1, 2, 3]).toContain(result.id)
      }
    })

    it('[U01677] should be deterministic with same seed', () => {
      const array = ['apple', 'banana', 'cherry', 'date', 'elderberry']

      deterministicRNG.setSeed(11111)
      deterministicRNG.enable()
      const firstSequence = []
      for (let i = 0; i < 10; i++) {
        firstSequence.push(gameRandomElement(array))
      }

      deterministicRNG.setSeed(11111)
      const secondSequence = []
      for (let i = 0; i < 10; i++) {
        secondSequence.push(gameRandomElement(array))
      }

      expect(firstSequence).toEqual(secondSequence)
    })
  })

  describe('gameShuffle()', () => {
    it('[U01678] should return the same array reference', () => {
      const array = [1, 2, 3, 4, 5]
      const result = gameShuffle(array)
      expect(result).toBe(array)
    })

    it('[U01679] should contain all original elements', () => {
      const array = [1, 2, 3, 4, 5]
      const original = [...array]
      gameShuffle(array)
      expect(array.sort()).toEqual(original.sort())
    })

    it('[U01680] should not always return the same order', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      let differentOrderCount = 0

      for (let i = 0; i < 20; i++) {
        const array = [...original]
        gameShuffle(array)
        if (JSON.stringify(array) !== JSON.stringify(original)) {
          differentOrderCount++
        }
      }
      // Should be different most of the time
      expect(differentOrderCount).toBeGreaterThan(15)
    })

    it('[U01681] should handle empty array', () => {
      const array = []
      const result = gameShuffle(array)
      expect(result).toEqual([])
    })

    it('[U01682] should handle single-element array', () => {
      const array = [42]
      const result = gameShuffle(array)
      expect(result).toEqual([42])
    })

    it('[U01683] should be deterministic with same seed', () => {
      deterministicRNG.setSeed(22222)
      deterministicRNG.enable()
      const array1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      gameShuffle(array1)
      const firstOrder = [...array1]

      deterministicRNG.setSeed(22222)
      const array2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      gameShuffle(array2)
      const secondOrder = [...array2]

      expect(firstOrder).toEqual(secondOrder)
    })
  })

  describe('gameRandomBool()', () => {
    it('[U01684] should return a boolean', () => {
      for (let i = 0; i < 50; i++) {
        const result = gameRandomBool()
        expect(typeof result).toBe('boolean')
      }
    })

    it('[U01685] should return roughly 50/50 with default probability', () => {
      let trueCount = 0
      const iterations = 1000
      for (let i = 0; i < iterations; i++) {
        if (gameRandomBool()) trueCount++
      }
      // Expect between 40% and 60% true
      expect(trueCount).toBeGreaterThan(iterations * 0.4)
      expect(trueCount).toBeLessThan(iterations * 0.6)
    })

    it('[U01686] should return mostly true with high probability', () => {
      let trueCount = 0
      const iterations = 100
      for (let i = 0; i < iterations; i++) {
        if (gameRandomBool(0.9)) trueCount++
      }
      // With 0.9 probability, expect at least 75% true (more forgiving threshold to avoid flakiness)
      // This is still ~5 standard deviations below the mean (90), so failure indicates a real bug
      expect(trueCount).toBeGreaterThan(iterations * 0.75)
    })

    it('[U01687] should return mostly false with low probability', () => {
      let trueCount = 0
      const iterations = 100
      for (let i = 0; i < iterations; i++) {
        if (gameRandomBool(0.1)) trueCount++
      }
      // With 0.1 probability, expect at most 25% true (more forgiving threshold to avoid flakiness)
      // This is still ~5 standard deviations above the mean (10), so failure indicates a real bug
      expect(trueCount).toBeLessThan(iterations * 0.25)
    })

    it('[U01688] should always return false with probability 0', () => {
      for (let i = 0; i < 50; i++) {
        expect(gameRandomBool(0)).toBe(false)
      }
    })

    it('[U01689] should always return true with probability 1', () => {
      for (let i = 0; i < 50; i++) {
        expect(gameRandomBool(1)).toBe(true)
      }
    })
  })

  describe('isDeterministicModeEnabled()', () => {
    it('[U01690] should return false when disabled', () => {
      deterministicRNG.disable()
      expect(isDeterministicModeEnabled()).toBe(false)
    })

    it('[U01691] should return true when enabled', () => {
      deterministicRNG.enable()
      expect(isDeterministicModeEnabled()).toBe(true)
    })
  })

  describe('getRNGState()', () => {
    it('[U01692] should return state object with required properties', () => {
      const state = getRNGState()
      expect(state).toHaveProperty('seed')
      expect(state).toHaveProperty('callCount')
      expect(state).toHaveProperty('enabled')
    })

    it('[U01693] should reflect current seed', () => {
      deterministicRNG.setSeed(77777)
      const state = getRNGState()
      expect(state.seed).toBe(77777)
    })

    it('[U01694] should track call count in deterministic mode', () => {
      deterministicRNG.setSeed(88888)
      deterministicRNG.enable()

      const initialState = getRNGState()
      const initialCount = initialState.callCount

      // Make some calls
      gameRandom()
      gameRandom()
      gameRandom()

      const afterState = getRNGState()
      expect(afterState.callCount).toBe(initialCount + 3)
    })
  })

  describe('deterministicRNG integration', () => {
    it('[U01695] should produce identical sequences across sessions', () => {
      const seed = 42

      // Session 1
      deterministicRNG.setSeed(seed)
      deterministicRNG.enable()
      const session1 = []
      for (let i = 0; i < 20; i++) {
        session1.push({
          random: gameRandom(),
          int: gameRandomInt(0, 100),
          float: gameRandomFloat(0, 1000),
          bool: gameRandomBool(0.5)
        })
      }

      // Simulate new session
      deterministicRNG.setSeed(seed)
      deterministicRNG.reset?.()

      const session2 = []
      for (let i = 0; i < 20; i++) {
        session2.push({
          random: gameRandom(),
          int: gameRandomInt(0, 100),
          float: gameRandomFloat(0, 1000),
          bool: gameRandomBool(0.5)
        })
      }

      expect(session1).toEqual(session2)
    })

    it('[U01696] should handle string seeds', () => {
      deterministicRNG.setSeed('test-seed')
      deterministicRNG.enable()
      const value1 = gameRandom()

      deterministicRNG.setSeed('test-seed')
      const value2 = gameRandom()

      expect(value1).toBe(value2)
    })

    it('[U01697] should produce different sequences for different seeds', () => {
      deterministicRNG.setSeed(111)
      deterministicRNG.enable()
      const seq1 = []
      for (let i = 0; i < 10; i++) {
        seq1.push(gameRandom())
      }

      deterministicRNG.setSeed(222)
      const seq2 = []
      for (let i = 0; i < 10; i++) {
        seq2.push(gameRandom())
      }

      expect(seq1).not.toEqual(seq2)
    })
  })
})
