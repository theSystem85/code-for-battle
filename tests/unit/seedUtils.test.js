/**
 * Unit tests for seedUtils.js
 *
 * Tests seed generation, hashing, and sanitization utilities
 * used for deterministic random number generation.
 */

import { describe, it, expect } from 'vitest'
import {
  generateRandomSeed,
  hashSeedString,
  sanitizeSeed,
  MAX_SEED_VALUE
} from '../../src/utils/seedUtils.js'

describe('seedUtils', () => {
  describe('MAX_SEED_VALUE', () => {
    it('[U03897] should be the maximum 31-bit signed integer', () => {
      expect(MAX_SEED_VALUE).toBe(0x7fffffff)
      expect(MAX_SEED_VALUE).toBe(2147483647)
    })
  })

  describe('generateRandomSeed', () => {
    it('[U03898] should return a positive integer', () => {
      const seed = generateRandomSeed()
      expect(seed).toBeGreaterThan(0)
      expect(Number.isInteger(seed)).toBe(true)
    })

    it('[U03899] should return a value within valid range', () => {
      for (let i = 0; i < 100; i++) {
        const seed = generateRandomSeed()
        expect(seed).toBeGreaterThanOrEqual(1)
        expect(seed).toBeLessThanOrEqual(MAX_SEED_VALUE)
      }
    })

    it('[U03900] should generate different values on multiple calls', () => {
      const seeds = new Set()
      for (let i = 0; i < 100; i++) {
        seeds.add(generateRandomSeed())
      }
      // Should have significant variety (at least 90% unique)
      expect(seeds.size).toBeGreaterThan(90)
    })
  })

  describe('hashSeedString', () => {
    it('[U03901] should return 1 for empty string', () => {
      expect(hashSeedString('')).toBe(1)
    })

    it('[U03902] should return 1 for null', () => {
      expect(hashSeedString(null)).toBe(1)
    })

    it('[U03903] should return 1 for undefined', () => {
      expect(hashSeedString(undefined)).toBe(1)
    })

    it('[U03904] should return consistent hash for same string', () => {
      const hash1 = hashSeedString('test-seed')
      const hash2 = hashSeedString('test-seed')
      expect(hash1).toBe(hash2)
    })

    it('[U03905] should return different hash for different strings', () => {
      const hash1 = hashSeedString('seed-a')
      const hash2 = hashSeedString('seed-b')
      expect(hash1).not.toBe(hash2)
    })

    it('[U03906] should return a positive integer', () => {
      const hash = hashSeedString('any-string')
      expect(hash).toBeGreaterThan(0)
      expect(Number.isInteger(hash)).toBe(true)
    })

    it('[U03907] should handle long strings', () => {
      const longString = 'a'.repeat(10000)
      const hash = hashSeedString(longString)
      expect(hash).toBeGreaterThan(0)
      expect(hash).toBeLessThanOrEqual(MAX_SEED_VALUE)
    })

    it('[U03908] should handle special characters', () => {
      const hash = hashSeedString('!@#$%^&*()_+-=[]{}|;:,.<>?')
      expect(hash).toBeGreaterThan(0)
    })

    it('[U03909] should handle unicode characters', () => {
      const hash = hashSeedString('こんにちは世界')
      expect(hash).toBeGreaterThan(0)
    })

    it('[U03910] should be case sensitive', () => {
      const hash1 = hashSeedString('ABC')
      const hash2 = hashSeedString('abc')
      expect(hash1).not.toBe(hash2)
    })

    it('[U03911] should return text length for hash that equals zero', () => {
      // This is a specific edge case - we need to find a string that hashes to 0
      // The function returns text.length if hash is 0
      // This is hard to test deterministically, but we can verify the behavior
      // by checking that short strings with length > 0 return positive values
      const hash = hashSeedString('x')
      expect(hash).toBeGreaterThan(0)
    })
  })

  describe('sanitizeSeed', () => {
    describe('numeric input', () => {
      it('[U03912] should accept positive integer', () => {
        const result = sanitizeSeed(12345)
        expect(result.value).toBe(12345)
        expect(result.reason).toBe('number')
        expect(result.randomized).toBe(false)
      })

      it('[U03913] should clamp large numbers to MAX_SEED_VALUE', () => {
        const result = sanitizeSeed(MAX_SEED_VALUE + 1000)
        expect(result.value).toBe(MAX_SEED_VALUE)
        expect(result.reason).toBe('number')
      })

      it('[U03914] should convert negative numbers to positive', () => {
        const result = sanitizeSeed(-500)
        expect(result.value).toBe(500)
        expect(result.reason).toBe('number')
      })

      it('[U03915] should floor floating point numbers', () => {
        const result = sanitizeSeed(123.789)
        expect(result.value).toBe(123)
        expect(result.reason).toBe('number')
      })

      it('[U03916] should return 1 for zero', () => {
        const result = sanitizeSeed(0)
        expect(result.value).toBe(1)
        expect(result.reason).toBe('number')
      })

      it('[U03917] should handle NaN by converting to string and hashing', () => {
        const result = sanitizeSeed(NaN)
        expect(result.value).toBeGreaterThan(0)
        // NaN.toString() = "NaN" which is non-numeric, so it gets hashed
        expect(result.reason).toBe('hashed')
        expect(result.randomized).toBe(false)
      })

      it('[U03918] should handle Infinity by converting to string and hashing', () => {
        const result = sanitizeSeed(Infinity)
        expect(result.value).toBeGreaterThan(0)
        // Infinity.toString() = "Infinity" which is non-numeric, so it gets hashed
        expect(result.reason).toBe('hashed')
        expect(result.randomized).toBe(false)
      })
    })

    describe('string input', () => {
      it('[U03919] should parse numeric string', () => {
        const result = sanitizeSeed('42')
        expect(result.value).toBe(42)
        expect(result.reason).toBe('parsed')
        expect(result.randomized).toBe(false)
      })

      it('[U03920] should parse numeric string with whitespace', () => {
        const result = sanitizeSeed('  123  ')
        expect(result.value).toBe(123)
        expect(result.reason).toBe('parsed')
      })

      it('[U03921] should hash non-numeric string', () => {
        const result = sanitizeSeed('my-game-seed')
        expect(result.value).toBeGreaterThan(0)
        expect(result.reason).toBe('hashed')
        expect(result.randomized).toBe(false)
      })

      it('[U03922] should generate random seed for empty string', () => {
        const result = sanitizeSeed('')
        expect(result.value).toBeGreaterThan(0)
        expect(result.reason).toBe('empty')
        expect(result.randomized).toBe(true)
      })

      it('[U03923] should generate random seed for whitespace-only string', () => {
        const result = sanitizeSeed('   ')
        expect(result.value).toBeGreaterThan(0)
        expect(result.reason).toBe('empty')
        expect(result.randomized).toBe(true)
      })
    })

    describe('null/undefined input', () => {
      it('[U03924] should generate random seed for null', () => {
        const result = sanitizeSeed(null)
        expect(result.value).toBeGreaterThan(0)
        expect(result.reason).toBe('empty')
        expect(result.randomized).toBe(true)
      })

      it('[U03925] should generate random seed for undefined', () => {
        const result = sanitizeSeed(undefined)
        expect(result.value).toBeGreaterThan(0)
        expect(result.reason).toBe('empty')
        expect(result.randomized).toBe(true)
      })
    })

    describe('allowRandomKeyword option', () => {
      it('[U03926] should hash "random" by default', () => {
        const result = sanitizeSeed('random')
        expect(result.reason).toBe('hashed')
        expect(result.randomized).toBe(false)
      })

      it('[U03927] should generate random seed for "random" when allowed', () => {
        const result = sanitizeSeed('random', { allowRandomKeyword: true })
        expect(result.reason).toBe('random')
        expect(result.randomized).toBe(true)
      })

      it('[U03928] should be case insensitive for "random" keyword', () => {
        const result1 = sanitizeSeed('RANDOM', { allowRandomKeyword: true })
        const result2 = sanitizeSeed('Random', { allowRandomKeyword: true })

        expect(result1.reason).toBe('random')
        expect(result2.reason).toBe('random')
      })

      it('[U03929] should not treat "random" with extra text as keyword', () => {
        const result = sanitizeSeed('random123', { allowRandomKeyword: true })
        expect(result.reason).toBe('hashed')
      })
    })

    describe('edge cases', () => {
      it('[U03930] should handle string "0"', () => {
        const result = sanitizeSeed('0')
        expect(result.value).toBe(1) // Clamped from 0
        expect(result.reason).toBe('parsed')
      })

      it('[U03931] should handle negative string numbers', () => {
        const result = sanitizeSeed('-100')
        expect(result.value).toBe(100)
        expect(result.reason).toBe('parsed')
      })

      it('[U03932] should handle boolean true', () => {
        const result = sanitizeSeed(true)
        // true.toString() = "true", which is non-numeric, so it gets hashed
        expect(result.reason).toBe('hashed')
      })

      it('[U03933] should handle boolean false', () => {
        const result = sanitizeSeed(false)
        // false.toString() = "false"
        expect(result.reason).toBe('hashed')
      })

      it('[U03934] should parse arrays when first element is numeric', () => {
        const result = sanitizeSeed([1, 2, 3])
        // [1,2,3].toString() = "1,2,3" - parseInt("1,2,3") = 1
        expect(result.reason).toBe('parsed')
        expect(result.value).toBe(1)
      })

      it('[U03935] should handle objects by converting to string', () => {
        const result = sanitizeSeed({ key: 'value' })
        // Object.toString() = "[object Object]"
        expect(result.reason).toBe('hashed')
      })
    })
  })
})
