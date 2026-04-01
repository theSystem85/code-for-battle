/**
 * Unit tests for game/mineSystem.js
 *
 * Tests the land mine deployment, detonation, chain reaction mechanics,
 * and mine sweeper interactions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the network module to avoid circular imports
vi.mock('../../src/network/gameCommandSync.js', () => ({
  broadcastBuildingDamage: vi.fn()
}))

// Import after mocks
import { gameState } from '../../src/gameState.js'
import {
  createMine,
  deployMine,
  updateMines,
  getMineAtTile,
  hasActiveMine,
  detonateMine,
  removeMine,
  safeSweeperDetonation,
  distributeMineLayerPayload,
  isFriendlyMineBlocking,
  rebuildMineLookup
} from '../../src/game/mineSystem.js'
import { broadcastBuildingDamage } from '../../src/network/gameCommandSync.js'
import {
  MINE_HEALTH,
  MINE_EXPLOSION_RADIUS,
  MINE_ARM_DELAY,
  TILE_SIZE
} from '../../src/config.js'

describe('mineSystem', () => {
  // Store original state
  let originalMines
  let originalExplosions
  let originalMapGrid

  beforeEach(() => {
    // Save original state
    originalMines = gameState.mines
    originalExplosions = gameState.explosions
    originalMapGrid = gameState.mapGrid

    // Reset to clean state
    gameState.mines = []
    gameState.explosions = []
    gameState.mapGrid = []

    // Create a simple test map grid
    for (let y = 0; y < 20; y++) {
      gameState.mapGrid[y] = []
      for (let x = 0; x < 20; x++) {
        gameState.mapGrid[y][x] = { type: 'grass', x, y }
      }
    }

    // Rebuild the mine lookup after resetting
    rebuildMineLookup()
  })

  afterEach(() => {
    // Restore original state
    gameState.mines = originalMines
    gameState.explosions = originalExplosions
    gameState.mapGrid = originalMapGrid
  })

  describe('createMine()', () => {
    it('should create a mine with correct properties', () => {
      const mine = createMine(5, 10, 'player', 1000)

      expect(mine.tileX).toBe(5)
      expect(mine.tileY).toBe(10)
      expect(mine.owner).toBe('player')
      expect(mine.health).toBe(MINE_HEALTH)
      expect(mine.maxHealth).toBe(MINE_HEALTH)
      expect(mine.deployTime).toBe(1000)
      expect(mine.active).toBe(false)
    })

    it('should generate unique id', () => {
      const mine1 = createMine(5, 10, 'player')
      const mine2 = createMine(5, 10, 'player')

      expect(mine1.id).not.toBe(mine2.id)
    })

    it('should set armedAt to deployTime + ARM_DELAY', () => {
      const deployTime = 5000
      const mine = createMine(5, 10, 'player', deployTime)

      expect(mine.armedAt).toBe(deployTime + MINE_ARM_DELAY)
    })

    it('should default deployTime to simulation time when not provided', () => {
      gameState.simulationTime = 1337
      const mine = createMine(5, 10, 'player')
      expect(mine.deployTime).toBe(1337)
    })
  })

  describe('deployMine()', () => {
    it('should add mine to gameState.mines', () => {
      const mine = deployMine(5, 10, 'player')

      expect(gameState.mines).toContain(mine)
    })

    it('should return the deployed mine', () => {
      const mine = deployMine(5, 10, 'player')

      expect(mine).not.toBeNull()
      expect(mine.tileX).toBe(5)
      expect(mine.tileY).toBe(10)
    })

    it('should not deploy mine on existing mine', () => {
      deployMine(5, 10, 'player')
      const secondMine = deployMine(5, 10, 'enemy')

      expect(secondMine).toBeNull()
      expect(gameState.mines.length).toBe(1)
    })

    it('should deploy mines at different positions', () => {
      const mine1 = deployMine(5, 10, 'player')
      const mine2 = deployMine(6, 10, 'player')
      const mine3 = deployMine(5, 11, 'player')

      expect(gameState.mines.length).toBe(3)
      expect(mine1).not.toBeNull()
      expect(mine2).not.toBeNull()
      expect(mine3).not.toBeNull()
    })
  })

  describe('updateMines()', () => {
    it('should activate mine after arm delay', () => {
      const deployTime = 1000
      const mine = createMine(5, 10, 'player', deployTime)
      gameState.mines.push(mine)

      // Before arm delay
      updateMines(deployTime + MINE_ARM_DELAY - 1)
      expect(mine.active).toBe(false)

      // At arm delay
      updateMines(deployTime + MINE_ARM_DELAY)
      expect(mine.active).toBe(true)
    })

    it('should update multiple mines', () => {
      const deployTime = 1000
      const mine1 = createMine(5, 10, 'player', deployTime)
      const mine2 = createMine(6, 10, 'player', deployTime + 500)
      gameState.mines.push(mine1, mine2)

      updateMines(deployTime + MINE_ARM_DELAY)

      expect(mine1.active).toBe(true)
      expect(mine2.active).toBe(false)

      updateMines(deployTime + MINE_ARM_DELAY + 500)

      expect(mine1.active).toBe(true)
      expect(mine2.active).toBe(true)
    })

    it('should not deactivate already active mines', () => {
      const deployTime = 1000
      const mine = createMine(5, 10, 'player', deployTime)
      mine.active = true
      gameState.mines.push(mine)

      updateMines(deployTime) // Even at deploy time, should stay active

      expect(mine.active).toBe(true)
    })
  })

  describe('getMineAtTile()', () => {
    it('should return mine at specified tile', () => {
      const mine = deployMine(5, 10, 'player')

      const result = getMineAtTile(5, 10)

      expect(result).toBe(mine)
    })

    it('should return null for empty tile', () => {
      const result = getMineAtTile(5, 10)

      expect(result).toBeNull()
    })

    it('should return correct mine from multiple mines', () => {
      const mine1 = deployMine(5, 10, 'player')
      const mine2 = deployMine(6, 11, 'enemy')

      expect(getMineAtTile(5, 10)).toBe(mine1)
      expect(getMineAtTile(6, 11)).toBe(mine2)
    })
  })

  describe('hasActiveMine()', () => {
    it('should return false for empty tile', () => {
      expect(hasActiveMine(5, 10)).toBe(false)
    })

    it('should return false for inactive mine', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = false

      expect(hasActiveMine(5, 10)).toBe(false)
    })

    it('should return true for active mine', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      expect(hasActiveMine(5, 10)).toBe(true)
    })
  })

  describe('detonateMine()', () => {
    it('should remove mine from gameState.mines', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      detonateMine(mine, [], [])

      expect(gameState.mines).not.toContain(mine)
    })

    it('should create explosion effect', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      detonateMine(mine, [], [])

      expect(gameState.explosions.length).toBeGreaterThan(0)
    })

    it('should damage units on same tile', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      const unit = {
        x: 5 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        health: 100,
        maxHealth: 100
      }

      detonateMine(mine, [unit], [])

      expect(unit.health).toBeLessThan(100)
    })

    it('should damage buildings on same tile', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      const building = {
        x: 5,
        y: 10,
        width: 1,
        height: 1,
        health: 500,
        maxHealth: 500,
        id: 'building-1'
      }

      detonateMine(mine, [], [building])

      expect(building.health).toBeLessThan(500)
      expect(broadcastBuildingDamage).toHaveBeenCalledWith(
        'building-1',
        expect.any(Number),
        building.health
      )
    })

    it('should not throw for null mine', () => {
      expect(() => detonateMine(null, [], [])).not.toThrow()
    })

    it('should damage entities within explosion radius', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      // Unit one tile away
      const unit = {
        x: 6 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        health: 100,
        maxHealth: 100
      }

      detonateMine(mine, [unit], [])

      // Should take damage if within explosion radius
      if (MINE_EXPLOSION_RADIUS >= 1) {
        expect(unit.health).toBeLessThan(100)
      }
    })
  })

  describe('removeMine()', () => {
    it('should remove mine from gameState.mines', () => {
      const mine = deployMine(5, 10, 'player')

      removeMine(mine)

      expect(gameState.mines).not.toContain(mine)
    })

    it('should update mine lookup', () => {
      const mine = deployMine(5, 10, 'player')

      removeMine(mine)

      expect(getMineAtTile(5, 10)).toBeNull()
    })

    it('should not throw for mine not in array', () => {
      const mine = createMine(5, 10, 'player')

      expect(() => removeMine(mine)).not.toThrow()
    })
  })

  describe('safeSweeperDetonation()', () => {
    it('should remove mine', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      safeSweeperDetonation(mine, [], [])

      expect(gameState.mines).not.toContain(mine)
    })

    it('should create explosion effect', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      safeSweeperDetonation(mine, [], [])

      expect(gameState.explosions.length).toBeGreaterThan(0)
    })

    it('should grant immunity to sweeping Mine Sweepers', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      const sweeper = {
        type: 'mineSweeper',
        sweeping: true,
        x: 5 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        health: 100,
        maxHealth: 100
      }

      safeSweeperDetonation(mine, [sweeper], [])

      expect(sweeper.health).toBe(100) // Should not take damage
    })

    it('should damage non-sweeping units', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      const tank = {
        type: 'tank',
        x: 5 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        health: 100,
        maxHealth: 100
      }

      safeSweeperDetonation(mine, [tank], [])

      expect(tank.health).toBeLessThan(100)
    })

    it('should damage Mine Sweeper that is not sweeping', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      const sweeper = {
        type: 'mineSweeper',
        sweeping: false,
        x: 5 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        health: 100,
        maxHealth: 100
      }

      safeSweeperDetonation(mine, [sweeper], [])

      expect(sweeper.health).toBeLessThan(100)
    })
  })

  describe('distributeMineLayerPayload()', () => {
    it('should not throw for non-mineLayer unit', () => {
      const unit = { type: 'tank', remainingMines: 5 }
      expect(() => distributeMineLayerPayload(unit, [], [])).not.toThrow()
    })

    it('should not throw for mineLayer with no mines', () => {
      const unit = { type: 'mineLayer', remainingMines: 0 }
      expect(() => distributeMineLayerPayload(unit, [], [])).not.toThrow()
    })

    it('should create explosion effects', () => {
      const unit = {
        type: 'mineLayer',
        remainingMines: 3,
        x: 5 * TILE_SIZE,
        y: 10 * TILE_SIZE
      }

      distributeMineLayerPayload(unit, [], [])

      expect(gameState.explosions.length).toBeGreaterThan(0)
    })

    it('should damage surrounding units', () => {
      const unit = {
        type: 'mineLayer',
        remainingMines: 5,
        x: 5 * TILE_SIZE + TILE_SIZE / 2,
        y: 10 * TILE_SIZE + TILE_SIZE / 2
      }

      const nearbyUnit = {
        x: 6 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        health: 100,
        maxHealth: 100
      }

      distributeMineLayerPayload(unit, [nearbyUnit], [])

      expect(nearbyUnit.health).toBeLessThan(100)
    })
  })

  describe('isFriendlyMineBlocking()', () => {
    it('should return false for null owner', () => {
      expect(isFriendlyMineBlocking(5, 10, null)).toBe(false)
    })

    it('should return false for tile without mine', () => {
      expect(isFriendlyMineBlocking(5, 10, 'player')).toBe(false)
    })

    it('should return false for inactive mine', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = false

      expect(isFriendlyMineBlocking(5, 10, 'player')).toBe(false)
    })

    it('should return false for enemy mine', () => {
      const mine = deployMine(5, 10, 'enemy')
      mine.active = true

      expect(isFriendlyMineBlocking(5, 10, 'player')).toBe(false)
    })

    it('should return true for active friendly mine', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      expect(isFriendlyMineBlocking(5, 10, 'player')).toBe(true)
    })
  })

  describe('rebuildMineLookup()', () => {
    it('should rebuild lookup after clearing mines', () => {
      const mine = deployMine(5, 10, 'player')

      // Manual clear (simulating desync)
      gameState.mines = []
      gameState.mines.push(mine)

      rebuildMineLookup()

      expect(getMineAtTile(5, 10)).toBe(mine)
    })

    it('should handle empty mines array', () => {
      gameState.mines = []

      expect(() => rebuildMineLookup()).not.toThrow()
    })

    it('should handle non-array mines', () => {
      gameState.mines = null

      expect(() => rebuildMineLookup()).not.toThrow()
    })

    it('should skip mines with invalid coordinates', () => {
      gameState.mines = [
        { tileX: NaN, tileY: 5, owner: 'player' },
        { tileX: 5, tileY: Infinity, owner: 'player' },
        { tileX: 10, tileY: 10, owner: 'player' }
      ]

      rebuildMineLookup()

      expect(getMineAtTile(10, 10)).toBe(gameState.mines[2])
      expect(getMineAtTile(NaN, 5)).toBeNull()
    })
  })

  describe('chain reactions', () => {
    it('should trigger chain reaction with adjacent mines', () => {
      // Deploy two adjacent mines
      const mine1 = deployMine(5, 10, 'player')
      const mine2 = deployMine(6, 10, 'player')
      mine1.active = true
      mine2.active = true
      mine2.health = 0 // Simulate mine2 being destroyed by mine1's blast

      // Detonate mine1
      detonateMine(mine1, [], [])

      // Both mines should be removed
      expect(gameState.mines.length).toBe(0)
    })

    it('should not trigger chain reaction with non-adjacent mines', () => {
      const mine1 = deployMine(5, 10, 'player')
      const mine2 = deployMine(8, 10, 'player') // 3 tiles away
      mine1.active = true
      mine2.active = true

      detonateMine(mine1, [], [])

      // mine2 should still exist
      expect(gameState.mines).toContain(mine2)
    })
  })

  describe('damage falloff', () => {
    it('should apply full damage at center', () => {
      const mine = deployMine(5, 10, 'player')
      mine.active = true

      const unit = {
        x: 5 * TILE_SIZE + TILE_SIZE / 2,
        y: 10 * TILE_SIZE + TILE_SIZE / 2,
        health: 1000,
        maxHealth: 1000
      }

      detonateMine(mine, [unit], [])

      // Unit should take some damage (exact amount depends on config)
      expect(1000 - unit.health).toBeGreaterThan(0)
    })

    it('should apply reduced damage at edge of radius', () => {
      if (MINE_EXPLOSION_RADIUS <= 0) return // Skip if no radius

      const mine = deployMine(5, 10, 'player')
      mine.active = true

      // Unit at center
      const centerUnit = {
        x: 5 * TILE_SIZE + TILE_SIZE / 2,
        y: 10 * TILE_SIZE + TILE_SIZE / 2,
        health: 1000,
        maxHealth: 1000
      }

      // Unit at edge (if radius allows)
      const edgeUnit = {
        x: (5 + Math.floor(MINE_EXPLOSION_RADIUS)) * TILE_SIZE + TILE_SIZE / 2,
        y: 10 * TILE_SIZE + TILE_SIZE / 2,
        health: 1000,
        maxHealth: 1000
      }

      detonateMine(mine, [centerUnit, edgeUnit], [])

      // Center unit should take more damage than edge unit
      const centerDamage = 1000 - centerUnit.health
      const edgeDamage = 1000 - edgeUnit.health

      if (edgeDamage > 0) {
        expect(centerDamage).toBeGreaterThan(edgeDamage)
      }
    })
  })
})
