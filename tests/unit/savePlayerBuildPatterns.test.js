/**
 * Unit tests for src/savePlayerBuildPatterns.js
 *
 * Tests player building pattern history tracking,
 * localStorage persistence, and session management.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock gameState
vi.mock('../../src/gameState.js', () => ({
  gameState: {
    playerBuildHistory: null,
    currentSessionId: null
  }
}))

import { gameState } from '../../src/gameState.js'
import {
  ensurePlayerBuildHistoryLoaded,
  savePlayerBuildPatterns
} from '../../src/savePlayerBuildPatterns.js'

describe('savePlayerBuildPatterns.js', () => {
  let mockLocalStorage

  beforeEach(() => {
    // Reset gameState
    gameState.playerBuildHistory = null
    gameState.currentSessionId = null

    // Mock localStorage
    mockLocalStorage = {
      data: {},
      getItem: vi.fn((key) => mockLocalStorage.data[key] || null),
      setItem: vi.fn((key, value) => {
        mockLocalStorage.data[key] = value
      }),
      removeItem: vi.fn((key) => {
        delete mockLocalStorage.data[key]
      }),
      clear: vi.fn(() => {
        mockLocalStorage.data = {}
      })
    }

    // Temporarily replace globalThis localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    })

    // Mock window.logger.warn
    if (!globalThis.window) {
      globalThis.window = {}
    }
    globalThis.window.logger = {
      warn: vi.fn()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('ensurePlayerBuildHistoryLoaded()', () => {
    it('[U03882] should initialize empty history when none exists', () => {
      const history = ensurePlayerBuildHistoryLoaded()

      expect(history).toBeInstanceOf(Array)
      expect(history.length).toBe(0)
    })

    it('[U03883] should load history from localStorage when available', () => {
      const savedHistory = [
        { id: 'session-1', buildings: ['powerPlant', 'barracks'] }
      ]
      mockLocalStorage.data.playerBuildHistory = JSON.stringify(savedHistory)

      const history = ensurePlayerBuildHistoryLoaded()

      expect(history).toEqual(savedHistory)
    })

    it('[U03884] should return existing history if already loaded', () => {
      gameState.playerBuildHistory = [
        { id: 'existing-session', buildings: ['turretGunV1'] }
      ]

      const history = ensurePlayerBuildHistoryLoaded()

      expect(history).toEqual([{ id: 'existing-session', buildings: ['turretGunV1'] }])
      expect(mockLocalStorage.getItem).not.toHaveBeenCalled()
    })

    it('[U03885] should handle corrupted localStorage data', () => {
      mockLocalStorage.data.playerBuildHistory = 'invalid json{'

      const history = ensurePlayerBuildHistoryLoaded()

      expect(history).toEqual([])
      expect(window.logger.warn).toHaveBeenCalled()
    })

    it('[U03886] should return empty array when localStorage returns non-array', () => {
      mockLocalStorage.data.playerBuildHistory = JSON.stringify('not an array')

      const history = ensurePlayerBuildHistoryLoaded()

      expect(history).toEqual([])
    })
  })

  describe('savePlayerBuildPatterns()', () => {
    beforeEach(() => {
      // Ensure clean state
      gameState.playerBuildHistory = []
      gameState.currentSessionId = null

      // Mock Date.now for consistent session IDs
      vi.spyOn(Date, 'now').mockReturnValue(1234567890)
    })

    it('[U03887] should save building type to current session', () => {
      savePlayerBuildPatterns('powerPlant')

      expect(gameState.playerBuildHistory.length).toBe(1)
      expect(gameState.playerBuildHistory[0].buildings).toContain('powerPlant')
    })

    it('[U03888] should create new session if none exists', () => {
      savePlayerBuildPatterns('barracks')

      expect(gameState.currentSessionId).toBe('1234567890')
      expect(gameState.playerBuildHistory[0].id).toBe('1234567890')
    })

    it('[U03889] should add multiple buildings to same session', () => {
      savePlayerBuildPatterns('powerPlant')
      savePlayerBuildPatterns('barracks')
      savePlayerBuildPatterns('vehicleFactory')

      expect(gameState.playerBuildHistory[0].buildings).toEqual([
        'powerPlant',
        'barracks',
        'vehicleFactory'
      ])
    })

    it('[U03890] should persist to localStorage', () => {
      savePlayerBuildPatterns('turretGunV1')

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'playerBuildHistory',
        expect.any(String)
      )

      const savedData = JSON.parse(mockLocalStorage.data.playerBuildHistory)
      expect(savedData[0].buildings).toContain('turretGunV1')
    })

    it('[U03891] should limit history to 20 sessions', () => {
      // Create 25 sessions
      for (let i = 0; i < 25; i++) {
        gameState.currentSessionId = `session-${i}`
        gameState.playerBuildHistory.push({
          id: `session-${i}`,
          buildings: [`building-${i}`]
        })
      }

      // Reset session to create a new one
      gameState.currentSessionId = null
      savePlayerBuildPatterns('newBuilding')

      expect(gameState.playerBuildHistory.length).toBeLessThanOrEqual(20)
    })

    it('[U03892] should handle localStorage errors gracefully', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded')
      })

      // Mock console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Should not throw
      expect(() => {
        savePlayerBuildPatterns('powerPlant')
      }).not.toThrow()

      consoleErrorSpy.mockRestore()
    })

    it('[U03893] should reuse existing session when currentSessionId is set', () => {
      gameState.currentSessionId = 'existing-session-id'
      gameState.playerBuildHistory = [
        { id: 'existing-session-id', buildings: [] }
      ]

      savePlayerBuildPatterns('powerPlant')
      savePlayerBuildPatterns('barracks')

      expect(gameState.playerBuildHistory.length).toBe(1)
      expect(gameState.playerBuildHistory[0].id).toBe('existing-session-id')
    })
  })

  describe('Edge cases', () => {
    it('[U03894] should handle undefined localStorage gracefully', () => {
      // Remove localStorage
      delete globalThis.localStorage

      // Force re-evaluation with undefined localStorage
      gameState.playerBuildHistory = null

      // This should not throw
      const result = ensurePlayerBuildHistoryLoaded()
      expect(result).toEqual([])
    })

    it('[U03895] should handle null returned from localStorage.getItem', () => {
      mockLocalStorage.getItem.mockReturnValue(null)

      const history = ensurePlayerBuildHistoryLoaded()

      expect(history).toEqual([])
    })

    it('[U03896] should handle empty string from localStorage', () => {
      mockLocalStorage.data.playerBuildHistory = ''

      const history = ensurePlayerBuildHistoryLoaded()

      // Empty string parses to empty result
      expect(history).toEqual([])
    })
  })
})
