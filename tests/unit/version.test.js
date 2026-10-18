import { describe, it, expect } from 'vitest'
import { APP_VERSION } from '../../src/version.js'

describe('version', () => {
  describe('APP_VERSION', () => {
    it('[U05078] is a string', () => {
      expect(typeof APP_VERSION).toBe('string')
    })

    it('[U05079] follows semantic versioning format', () => {
      // Semantic versioning: MAJOR.MINOR.PATCH (optionally with prerelease)
      const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/
      expect(APP_VERSION).toMatch(semverRegex)
    })

    it('[U05080] is not empty', () => {
      expect(APP_VERSION.length).toBeGreaterThan(0)
    })

    it('[U05081] can be parsed into version components', () => {
      const parts = APP_VERSION.split('.')
      expect(parts.length).toBeGreaterThanOrEqual(3)

      const major = parseInt(parts[0], 10)
      const minor = parseInt(parts[1], 10)
      const patch = parseInt(parts[2].split('-')[0], 10)

      expect(Number.isInteger(major)).toBe(true)
      expect(Number.isInteger(minor)).toBe(true)
      expect(Number.isInteger(patch)).toBe(true)
    })
  })
})
