/**
 * Tests for src/index.js
 * Global state management module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '../setup.js'

describe('index.js', () => {
  let indexModule

  beforeEach(async() => {
    vi.resetModules()
    // Reset the global window.gameState before each test
    window.gameState = {
      money: 10000,
      gameTime: 0,
      gameStarted: false,
      targetedOreTiles: {}
    }

    // Import the module fresh
    indexModule = await import('../../src/index.js')
  })

  afterEach(() => {
    // Clean up
    delete window.gameState
  })

  describe('getGameState', () => {
    it('[U02059] should export getGameState function', () => {
      expect(typeof indexModule.getGameState).toBe('function')
    })

    it('[U02060] should return the global gameState object', () => {
      const gameState = indexModule.getGameState()
      expect(gameState).toBe(window.gameState)
    })

    it('[U02061] should return object with money property', () => {
      const gameState = indexModule.getGameState()
      expect(gameState.money).toBe(10000)
    })

    it('[U02062] should return object with gameTime property', () => {
      const gameState = indexModule.getGameState()
      expect(gameState.gameTime).toBe(0)
    })

    it('[U02063] should return object with gameStarted property', () => {
      const gameState = indexModule.getGameState()
      expect(gameState.gameStarted).toBe(false)
    })

    it('[U02064] should return modifiable state', () => {
      const gameState = indexModule.getGameState()
      gameState.money = 5000
      expect(window.gameState.money).toBe(5000)
    })

    it('[U02065] should return the same reference on multiple calls', () => {
      const gameState1 = indexModule.getGameState()
      const gameState2 = indexModule.getGameState()
      expect(gameState1).toBe(gameState2)
    })
  })

  describe('Global state initialization', () => {
    it('[U02066] should keep window.gameState if already present', async() => {
      // gameState was set in beforeEach
      expect(window.gameState).toBeDefined()
      expect(typeof window.gameState).toBe('object')
    })

    it('[U02067] should have targetedOreTiles registry', () => {
      expect(window.gameState.targetedOreTiles).toBeDefined()
      expect(typeof window.gameState.targetedOreTiles).toBe('object')
    })

    it('[U02068] should not overwrite existing gameState properties', () => {
      window.gameState.customProperty = 'test'

      const gameState = indexModule.getGameState()
      expect(gameState.customProperty).toBe('test')
    })
  })

  describe('State mutations through getGameState', () => {
    it('[U02069] should allow adding new properties', () => {
      const gameState = indexModule.getGameState()
      gameState.newProperty = 'test value'
      expect(window.gameState.newProperty).toBe('test value')
    })

    it('[U02070] should allow updating nested properties', () => {
      const gameState = indexModule.getGameState()
      gameState.scrollOffset = { x: 100, y: 200 }
      expect(window.gameState.scrollOffset.x).toBe(100)
      expect(window.gameState.scrollOffset.y).toBe(200)
    })

    it('[U02071] should allow adding array properties', () => {
      const gameState = indexModule.getGameState()
      gameState.units = [{ id: 'unit1', type: 'tank' }]

      expect(window.gameState.units).toBeInstanceOf(Array)
      expect(window.gameState.units.length).toBe(1)
      expect(window.gameState.units[0].type).toBe('tank')
    })

    it('[U02072] should allow deleting properties', () => {
      const gameState = indexModule.getGameState()
      gameState.toDelete = 'value'
      expect(window.gameState.toDelete).toBe('value')

      delete gameState.toDelete
      expect(window.gameState.toDelete).toBeUndefined()
    })
  })

  describe('targetedOreTiles registry', () => {
    it('[U02073] should have targetedOreTiles as empty object initially', () => {
      const gameState = indexModule.getGameState()
      expect(gameState.targetedOreTiles).toBeDefined()
      expect(Object.keys(gameState.targetedOreTiles).length).toBe(0)
    })

    it('[U02074] should allow tracking ore tile targets', () => {
      const gameState = indexModule.getGameState()

      // Simulate targeting ore at tile (5, 10)
      gameState.targetedOreTiles['5,10'] = 'harvester-1'

      expect(gameState.targetedOreTiles['5,10']).toBe('harvester-1')
    })

    it('[U02075] should allow removing ore tile targets', () => {
      const gameState = indexModule.getGameState()
      gameState.targetedOreTiles['5,10'] = 'harvester-1'

      delete gameState.targetedOreTiles['5,10']

      expect(gameState.targetedOreTiles['5,10']).toBeUndefined()
    })

    it('[U02076] should support multiple ore tile targets', () => {
      const gameState = indexModule.getGameState()

      gameState.targetedOreTiles['5,10'] = 'harvester-1'
      gameState.targetedOreTiles['6,11'] = 'harvester-2'
      gameState.targetedOreTiles['7,12'] = 'harvester-3'

      expect(Object.keys(gameState.targetedOreTiles).length).toBe(3)
    })
  })
})
