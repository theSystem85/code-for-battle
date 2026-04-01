/**
 * Unit tests for enemyUtils.js
 *
 * Tests utility functions for enemy detection and factory finding.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  areEnemies,
  getEnemyPlayers,
  isEnemyTo,
  getClosestEnemyFactory,
  isPartOfFactory
} from '../../src/ai/enemyUtils.js'
import { gameState } from '../../src/gameState.js'
import { TILE_SIZE } from '../../src/config.js'

describe('enemyUtils', () => {
  let originalPlayerCount
  let originalLogger

  beforeEach(() => {
    originalPlayerCount = gameState.playerCount
    originalLogger = window.logger
    window.logger = { warn: vi.fn(), error: vi.fn(), log: vi.fn() }
  })

  afterEach(() => {
    gameState.playerCount = originalPlayerCount
    window.logger = originalLogger
  })

  describe('areEnemies', () => {
    it('should return true when players are different', () => {
      expect(areEnemies('player1', 'player2')).toBe(true)
    })

    it('should return false when players are the same', () => {
      expect(areEnemies('player1', 'player1')).toBe(false)
    })

    it('should treat null/undefined players as non-hostile', () => {
      expect(areEnemies(null, 'player1')).toBe(false)
      expect(areEnemies('player1', null)).toBe(false)
      expect(areEnemies(null, null)).toBe(false)
      expect(areEnemies(undefined, undefined)).toBe(false)
    })

    it('should treat empty strings as same player', () => {
      expect(areEnemies('', '')).toBe(false)
    })
  })

  describe('getEnemyPlayers', () => {
    it('should return all other players for player1 in 2-player game', () => {
      gameState.playerCount = 2
      const enemies = getEnemyPlayers('player1')
      expect(enemies).toEqual(['player2'])
    })

    it('should return all other players for player2 in 2-player game', () => {
      gameState.playerCount = 2
      const enemies = getEnemyPlayers('player2')
      expect(enemies).toEqual(['player1'])
    })

    it('should return multiple enemies in 4-player game', () => {
      gameState.playerCount = 4
      const enemies = getEnemyPlayers('player1')
      expect(enemies).toEqual(['player2', 'player3', 'player4'])
    })

    it('should handle 3-player game', () => {
      gameState.playerCount = 3
      const enemies = getEnemyPlayers('player2')
      expect(enemies).toEqual(['player1', 'player3'])
    })

    it('should default to 2 players when playerCount is undefined', () => {
      gameState.playerCount = undefined
      const enemies = getEnemyPlayers('player1')
      expect(enemies).toEqual(['player2'])
    })
  })

  describe('isEnemyTo', () => {
    it('should return true when unit belongs to different player', () => {
      const unit = { owner: 'player2' }
      expect(isEnemyTo(unit, 'player1')).toBe(true)
    })

    it('should return false when unit belongs to same player', () => {
      const unit = { owner: 'player1' }
      expect(isEnemyTo(unit, 'player1')).toBe(false)
    })

    it('should treat units without owner property as non-hostile', () => {
      const unit = {}
      expect(isEnemyTo(unit, 'player1')).toBe(false)
    })
  })

  describe('getClosestEnemyFactory', () => {
    const createUnit = (x, y) => ({
      x: x * TILE_SIZE,
      y: y * TILE_SIZE
    })

    const createFactory = (id, x, y, width = 3, height = 3) => ({
      id,
      x,
      y,
      width,
      height
    })

    it('should return null when factories is undefined', () => {
      const unit = createUnit(10, 10)
      const result = getClosestEnemyFactory(unit, undefined, 'player1')
      expect(result).toBeNull()
      expect(window.logger.warn).toHaveBeenCalled()
    })

    it('should return null when factories is not an array', () => {
      const unit = createUnit(10, 10)
      const result = getClosestEnemyFactory(unit, 'not-an-array', 'player1')
      expect(result).toBeNull()
    })

    it('should return null when no enemy factories exist', () => {
      const unit = createUnit(10, 10)
      const factories = [
        createFactory('player1', 5, 5)
      ]
      const result = getClosestEnemyFactory(unit, factories, 'player1')
      expect(result).toBeNull()
    })

    it('should return the closest enemy factory', () => {
      const unit = createUnit(10, 10)
      const factories = [
        createFactory('player2', 50, 50), // Far
        createFactory('player2', 12, 12), // Close
        createFactory('player2', 30, 30)  // Medium
      ]
      const result = getClosestEnemyFactory(unit, factories, 'player1')
      expect(result).toEqual(factories[1])
    })

    it('should ignore friendly factories', () => {
      const unit = createUnit(10, 10)
      const factories = [
        createFactory('player1', 11, 11), // Very close but friendly
        createFactory('player2', 50, 50)  // Far but enemy
      ]
      const result = getClosestEnemyFactory(unit, factories, 'player1')
      expect(result).toEqual(factories[1])
    })

    it('should handle empty factories array', () => {
      const unit = createUnit(10, 10)
      const result = getClosestEnemyFactory(unit, [], 'player1')
      expect(result).toBeNull()
    })

    it('should calculate distance from factory center', () => {
      const unit = createUnit(0, 0)
      const factories = [
        createFactory('player2', 10, 10, 2, 2), // Center at (11, 11)
        createFactory('player2', 8, 8, 4, 4)    // Center at (10, 10) - closer
      ]
      const result = getClosestEnemyFactory(unit, factories, 'player1')
      expect(result).toEqual(factories[1])
    })
  })

  describe('isPartOfFactory', () => {
    const createFactory = (x, y, width = 3, height = 3) => ({
      x,
      y,
      width,
      height
    })

    it('should return true when position is inside factory', () => {
      const factories = [createFactory(10, 10, 3, 3)]
      expect(isPartOfFactory(11, 11, factories)).toBe(true)
    })

    it('should return true at factory origin', () => {
      const factories = [createFactory(10, 10, 3, 3)]
      expect(isPartOfFactory(10, 10, factories)).toBe(true)
    })

    it('should return true at factory edge', () => {
      const factories = [createFactory(10, 10, 3, 3)]
      expect(isPartOfFactory(12, 12, factories)).toBe(true)
    })

    it('should return false outside factory bounds', () => {
      const factories = [createFactory(10, 10, 3, 3)]
      expect(isPartOfFactory(13, 13, factories)).toBe(false)
    })

    it('should return false just outside factory', () => {
      const factories = [createFactory(10, 10, 3, 3)]
      expect(isPartOfFactory(9, 10, factories)).toBe(false)
      expect(isPartOfFactory(10, 9, factories)).toBe(false)
    })

    it('should return false when factories is undefined', () => {
      expect(isPartOfFactory(10, 10, undefined)).toBe(false)
    })

    it('should return false when factories is null', () => {
      expect(isPartOfFactory(10, 10, null)).toBe(false)
    })

    it('should return false for empty factories array', () => {
      expect(isPartOfFactory(10, 10, [])).toBe(false)
    })

    it('should check against multiple factories', () => {
      const factories = [
        createFactory(0, 0, 3, 3),
        createFactory(50, 50, 3, 3)
      ]
      expect(isPartOfFactory(51, 51, factories)).toBe(true)
      expect(isPartOfFactory(25, 25, factories)).toBe(false)
    })

    it('should handle factories with different dimensions', () => {
      const factories = [createFactory(10, 10, 5, 2)]
      expect(isPartOfFactory(14, 10, factories)).toBe(true)
      expect(isPartOfFactory(14, 12, factories)).toBe(false)
    })
  })
})
