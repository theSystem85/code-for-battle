/**
 * Unit tests for network/deterministicRandom.js
 *
 * Tests the deterministic PRNG used for lockstep networking
 * to ensure reproducible random sequences across all peers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  deterministicRNG,
  random,
  randomInt,
  randomFloat,
  randomElement,
  shuffle,
  randomBool,
  initializeSessionRNG,
  syncRNGForTick
} from '../../src/network/deterministicRandom.js'

describe('deterministicRandom', () => {
  // Store original state
  let originalEnabled
  let originalSeed

  beforeEach(() => {
    const state = deterministicRNG.getState()
    originalEnabled = state.enabled
    originalSeed = state.seed
  })

  afterEach(() => {
    if (originalEnabled) {
      deterministicRNG.enable()
    } else {
      deterministicRNG.disable()
    }
    deterministicRNG.setSeed(originalSeed)
  })

  describe('DeterministicRNG class', () => {
    describe('setSeed()', () => {
      it('[U01237] should accept numeric seed', () => {
        deterministicRNG.setSeed(12345)
        expect(deterministicRNG.getSeed()).toBe(12345)
      })

      it('[U01238] should accept string seed', () => {
        deterministicRNG.setSeed('test-game-session')
        expect(deterministicRNG.getSeed()).toBeGreaterThan(0)
      })

      it('[U01239] should hash string seed to consistent value', () => {
        deterministicRNG.setSeed('hello')
        const seed1 = deterministicRNG.getSeed()

        deterministicRNG.setSeed('hello')
        const seed2 = deterministicRNG.getSeed()

        expect(seed1).toBe(seed2)
      })

      it('[U01240] should handle empty string seed', () => {
        deterministicRNG.setSeed('')
        expect(deterministicRNG.getSeed()).toBeGreaterThan(0)
      })

      it('[U01241] should reset call count', () => {
        deterministicRNG.setSeed(111)
        deterministicRNG.enable()
        deterministicRNG.random()
        deterministicRNG.random()

        deterministicRNG.setSeed(222)

        expect(deterministicRNG.getCallCount()).toBe(0)
      })

      it('[U01242] should use absolute value for negative seeds', () => {
        deterministicRNG.setSeed(-12345)
        expect(deterministicRNG.getSeed()).toBe(12345)
      })

      it('[U01243] should default to 1 for zero or invalid seeds', () => {
        deterministicRNG.setSeed(0)
        expect(deterministicRNG.getSeed()).toBe(1)
      })
    })

    describe('enable() / disable() / isEnabled()', () => {
      it('[U01244] should start disabled', () => {
        deterministicRNG.disable()
        expect(deterministicRNG.isEnabled()).toBe(false)
      })

      it('[U01245] should enable when enable() called', () => {
        deterministicRNG.enable()
        expect(deterministicRNG.isEnabled()).toBe(true)
      })

      it('[U01246] should disable when disable() called', () => {
        deterministicRNG.enable()
        deterministicRNG.disable()
        expect(deterministicRNG.isEnabled()).toBe(false)
      })
    })

    describe('random()', () => {
      it('[U01247] should return value between 0 and 1', () => {
        deterministicRNG.enable()
        for (let i = 0; i < 100; i++) {
          const val = deterministicRNG.random()
          expect(val).toBeGreaterThanOrEqual(0)
          expect(val).toBeLessThan(1)
        }
      })

      it('[U01248] should be deterministic with same seed', () => {
        deterministicRNG.setSeed(42)
        deterministicRNG.enable()

        const seq1 = []
        for (let i = 0; i < 20; i++) {
          seq1.push(deterministicRNG.random())
        }

        deterministicRNG.setSeed(42)
        const seq2 = []
        for (let i = 0; i < 20; i++) {
          seq2.push(deterministicRNG.random())
        }

        expect(seq1).toEqual(seq2)
      })

      it('[U01249] should produce different sequences for different seeds', () => {
        deterministicRNG.enable()

        deterministicRNG.setSeed(111)
        const seq1 = []
        for (let i = 0; i < 10; i++) {
          seq1.push(deterministicRNG.random())
        }

        deterministicRNG.setSeed(222)
        const seq2 = []
        for (let i = 0; i < 10; i++) {
          seq2.push(deterministicRNG.random())
        }

        expect(seq1).not.toEqual(seq2)
      })

      it('[U01250] should increment call count when enabled', () => {
        deterministicRNG.setSeed(100)
        deterministicRNG.enable()

        const initial = deterministicRNG.getCallCount()
        deterministicRNG.random()
        deterministicRNG.random()
        deterministicRNG.random()

        expect(deterministicRNG.getCallCount()).toBe(initial + 3)
      })

      it('[U01251] should use Math.random when disabled', () => {
        deterministicRNG.disable()

        // Can't really test Math.random behavior, just ensure no crash
        const values = new Set()
        for (let i = 0; i < 100; i++) {
          values.add(deterministicRNG.random())
        }
        // Should have variety (not deterministic)
        expect(values.size).toBeGreaterThan(90)
      })
    })

    describe('randomInt()', () => {
      it('[U01252] should return integers in range', () => {
        deterministicRNG.enable()
        for (let i = 0; i < 100; i++) {
          const val = deterministicRNG.randomInt(5, 10)
          expect(val).toBeGreaterThanOrEqual(5)
          expect(val).toBeLessThanOrEqual(10)
          expect(Number.isInteger(val)).toBe(true)
        }
      })

      it('[U01253] should be deterministic', () => {
        deterministicRNG.setSeed(777)
        deterministicRNG.enable()

        const seq1 = []
        for (let i = 0; i < 20; i++) {
          seq1.push(deterministicRNG.randomInt(0, 100))
        }

        deterministicRNG.setSeed(777)
        const seq2 = []
        for (let i = 0; i < 20; i++) {
          seq2.push(deterministicRNG.randomInt(0, 100))
        }

        expect(seq1).toEqual(seq2)
      })
    })

    describe('randomFloat()', () => {
      it('[U01254] should return floats in range', () => {
        deterministicRNG.enable()
        for (let i = 0; i < 100; i++) {
          const val = deterministicRNG.randomFloat(2.5, 7.5)
          expect(val).toBeGreaterThanOrEqual(2.5)
          expect(val).toBeLessThan(7.5)
        }
      })
    })

    describe('randomElement()', () => {
      it('[U01255] should return element from array', () => {
        deterministicRNG.enable()
        const arr = [1, 2, 3, 4, 5]
        for (let i = 0; i < 50; i++) {
          expect(arr).toContain(deterministicRNG.randomElement(arr))
        }
      })

      it('[U01256] should return undefined for empty array', () => {
        expect(deterministicRNG.randomElement([])).toBeUndefined()
      })

      it('[U01257] should return undefined for null/undefined', () => {
        expect(deterministicRNG.randomElement(null)).toBeUndefined()
        expect(deterministicRNG.randomElement(undefined)).toBeUndefined()
      })
    })

    describe('shuffle()', () => {
      it('[U01258] should return same array reference', () => {
        const arr = [1, 2, 3, 4, 5]
        expect(deterministicRNG.shuffle(arr)).toBe(arr)
      })

      it('[U01259] should contain all original elements', () => {
        const arr = [1, 2, 3, 4, 5]
        const original = [...arr]
        deterministicRNG.shuffle(arr)
        expect(arr.sort()).toEqual(original.sort())
      })

      it('[U01260] should be deterministic', () => {
        deterministicRNG.setSeed(888)
        deterministicRNG.enable()

        const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        deterministicRNG.shuffle(arr1)

        deterministicRNG.setSeed(888)
        const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        deterministicRNG.shuffle(arr2)

        expect(arr1).toEqual(arr2)
      })
    })

    describe('randomBool()', () => {
      it('[U01261] should return boolean', () => {
        deterministicRNG.enable()
        for (let i = 0; i < 50; i++) {
          expect(typeof deterministicRNG.randomBool()).toBe('boolean')
        }
      })

      it('[U01262] should respect probability', () => {
        deterministicRNG.enable()

        let trueCount = 0
        for (let i = 0; i < 1000; i++) {
          if (deterministicRNG.randomBool(0.7)) trueCount++
        }

        // Expect ~70% true (with some tolerance)
        expect(trueCount).toBeGreaterThan(600)
        expect(trueCount).toBeLessThan(800)
      })
    })

    describe('reset()', () => {
      it('[U01263] should reset to initial seed state', () => {
        deterministicRNG.setSeed(999)
        deterministicRNG.enable()

        const initial = []
        for (let i = 0; i < 10; i++) {
          initial.push(deterministicRNG.random())
        }

        deterministicRNG.reset()

        const afterReset = []
        for (let i = 0; i < 10; i++) {
          afterReset.push(deterministicRNG.random())
        }

        expect(initial).toEqual(afterReset)
      })

      it('[U01264] should reset call count to 0', () => {
        deterministicRNG.setSeed(100)
        deterministicRNG.enable()
        deterministicRNG.random()
        deterministicRNG.random()

        deterministicRNG.reset()

        expect(deterministicRNG.getCallCount()).toBe(0)
      })
    })

    describe('getState() / setState()', () => {
      it('[U01265] should return state object with required properties', () => {
        const state = deterministicRNG.getState()
        expect(state).toHaveProperty('seed')
        expect(state).toHaveProperty('callCount')
        expect(state).toHaveProperty('enabled')
      })

      it('[U01266] should restore state correctly', () => {
        deterministicRNG.setSeed(12345)
        deterministicRNG.enable()

        // Make some calls
        deterministicRNG.random()
        deterministicRNG.random()

        const savedState = deterministicRNG.getState()

        // Get next values
        const val1 = deterministicRNG.random()
        const val2 = deterministicRNG.random()

        // Restore state
        deterministicRNG.setState(savedState)

        // Should get same values
        expect(deterministicRNG.random()).toBe(val1)
        expect(deterministicRNG.random()).toBe(val2)
      })

      it('[U01267] should handle partial state restoration', () => {
        deterministicRNG.setState({ seed: 55555 })
        expect(deterministicRNG.getSeed()).toBe(55555)
      })
    })
  })

  describe('exported utility functions', () => {
    describe('random()', () => {
      it('[U01268] should use global deterministicRNG instance', () => {
        deterministicRNG.setSeed(111)
        deterministicRNG.enable()

        const val1 = random()

        deterministicRNG.setSeed(111)
        const val2 = random()

        expect(val1).toBe(val2)
      })
    })

    describe('randomInt()', () => {
      it('[U01269] should use global deterministicRNG instance', () => {
        deterministicRNG.setSeed(222)
        deterministicRNG.enable()

        const val1 = randomInt(0, 100)

        deterministicRNG.setSeed(222)
        const val2 = randomInt(0, 100)

        expect(val1).toBe(val2)
      })
    })

    describe('randomFloat()', () => {
      it('[U01270] should use global deterministicRNG instance', () => {
        deterministicRNG.setSeed(333)
        deterministicRNG.enable()

        const val1 = randomFloat(0, 100)

        deterministicRNG.setSeed(333)
        const val2 = randomFloat(0, 100)

        expect(val1).toBe(val2)
      })
    })

    describe('randomElement()', () => {
      it('[U01271] should use global deterministicRNG instance', () => {
        const arr = [1, 2, 3, 4, 5]

        deterministicRNG.setSeed(444)
        deterministicRNG.enable()
        const val1 = randomElement(arr)

        deterministicRNG.setSeed(444)
        const val2 = randomElement(arr)

        expect(val1).toBe(val2)
      })
    })

    describe('shuffle()', () => {
      it('[U01272] should use global deterministicRNG instance', () => {
        deterministicRNG.setSeed(555)
        deterministicRNG.enable()

        const arr1 = [1, 2, 3, 4, 5]
        shuffle(arr1)

        deterministicRNG.setSeed(555)
        const arr2 = [1, 2, 3, 4, 5]
        shuffle(arr2)

        expect(arr1).toEqual(arr2)
      })
    })

    describe('randomBool()', () => {
      it('[U01273] should use global deterministicRNG instance', () => {
        deterministicRNG.setSeed(666)
        deterministicRNG.enable()
        const val1 = randomBool()

        deterministicRNG.setSeed(666)
        const val2 = randomBool()

        expect(val1).toBe(val2)
      })
    })
  })

  describe('initializeSessionRNG()', () => {
    it('[U01274] should set seed', () => {
      initializeSessionRNG(99999)
      expect(deterministicRNG.getSeed()).toBe(99999)
    })

    it('[U01275] should enable deterministic mode by default', () => {
      deterministicRNG.disable()
      initializeSessionRNG(99999)
      expect(deterministicRNG.isEnabled()).toBe(true)
    })

    it('[U01276] should not enable if explicitly disabled', () => {
      deterministicRNG.disable()
      initializeSessionRNG(99999, false)
      expect(deterministicRNG.isEnabled()).toBe(false)
    })

    it('[U01277] should return the RNG instance', () => {
      const result = initializeSessionRNG(12345)
      expect(result).toBe(deterministicRNG)
    })

    it('[U01278] should handle string session seed', () => {
      initializeSessionRNG('game-session-abc')
      expect(deterministicRNG.getSeed()).toBeGreaterThan(0)
    })
  })

  describe('syncRNGForTick()', () => {
    it('[U01279] should reset call count', () => {
      deterministicRNG.setSeed(100)
      deterministicRNG.enable()
      deterministicRNG.random()
      deterministicRNG.random()

      syncRNGForTick(1)

      expect(deterministicRNG.getCallCount()).toBe(0)
    })

    it('[U01280] should produce different values for different ticks', () => {
      deterministicRNG.setSeed(100)
      deterministicRNG.enable()

      syncRNGForTick(1)
      const tick1Val = deterministicRNG.random()

      syncRNGForTick(2)
      const tick2Val = deterministicRNG.random()

      expect(tick1Val).not.toBe(tick2Val)
    })

    it('[U01281] should produce same values for same tick', () => {
      deterministicRNG.setSeed(100)
      deterministicRNG.enable()

      syncRNGForTick(5)
      const val1 = deterministicRNG.random()

      syncRNGForTick(5)
      const val2 = deterministicRNG.random()

      expect(val1).toBe(val2)
    })
  })

  describe('cross-client determinism simulation', () => {
    it('[U01282] should produce identical sequences for simulated clients', () => {
      const sessionSeed = 'multiplayer-game-123'
      const numTicks = 10
      const callsPerTick = 5

      // Simulate Client A
      initializeSessionRNG(sessionSeed, true)
      const clientAResults = []
      for (let tick = 0; tick < numTicks; tick++) {
        syncRNGForTick(tick)
        const tickResults = []
        for (let i = 0; i < callsPerTick; i++) {
          tickResults.push({
            random: random(),
            int: randomInt(0, 1000),
            float: randomFloat(0, 100),
            bool: randomBool()
          })
        }
        clientAResults.push(tickResults)
      }

      // Simulate Client B (fresh start)
      initializeSessionRNG(sessionSeed, true)
      const clientBResults = []
      for (let tick = 0; tick < numTicks; tick++) {
        syncRNGForTick(tick)
        const tickResults = []
        for (let i = 0; i < callsPerTick; i++) {
          tickResults.push({
            random: random(),
            int: randomInt(0, 1000),
            float: randomFloat(0, 100),
            bool: randomBool()
          })
        }
        clientBResults.push(tickResults)
      }

      // Results should be identical
      expect(clientAResults).toEqual(clientBResults)
    })

    it('[U01283] should detect desync if call counts differ', () => {
      const sessionSeed = 12345

      // Client A makes 3 calls
      initializeSessionRNG(sessionSeed, true)
      random()
      random()
      random()
      const stateA = deterministicRNG.getState()

      // Client B makes 2 calls (desync!)
      initializeSessionRNG(sessionSeed, true)
      random()
      random()
      const stateB = deterministicRNG.getState()

      // Call counts should differ, indicating desync
      expect(stateA.callCount).not.toBe(stateB.callCount)
    })
  })

  describe('Mulberry32 quality', () => {
    it('[U01284] should have good distribution', () => {
      deterministicRNG.setSeed(42)
      deterministicRNG.enable()

      const buckets = new Array(10).fill(0)
      const samples = 10000

      for (let i = 0; i < samples; i++) {
        const val = random()
        const bucket = Math.floor(val * 10)
        buckets[Math.min(bucket, 9)]++
      }

      // Each bucket should have roughly 10% of samples (1000 ± 200)
      for (const count of buckets) {
        expect(count).toBeGreaterThan(800)
        expect(count).toBeLessThan(1200)
      }
    })

    it('[U01285] should not have obvious patterns', () => {
      deterministicRNG.setSeed(1)
      deterministicRNG.enable()

      const values = []
      for (let i = 0; i < 100; i++) {
        values.push(random())
      }

      // Check that consecutive values are not correlated
      let increasing = 0
      let decreasing = 0
      for (let i = 1; i < values.length; i++) {
        if (values[i] > values[i - 1]) increasing++
        else decreasing++
      }

      // Should be roughly 50/50
      expect(increasing).toBeGreaterThan(35)
      expect(decreasing).toBeGreaterThan(35)
    })
  })
})
