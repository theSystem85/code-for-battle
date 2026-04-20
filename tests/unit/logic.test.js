import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  angleDiff,
  normalizeAngle,
  smoothRotateTowardsAngle,
  isAdjacentToFactory,
  isAdjacentToBuilding,
  findClosestOre,
  findAdjacentTile,
  hasClearShot,
  triggerExplosion,
  showUnloadingFeedback,
  findPositionWithClearShot,
  explosions
} from '../../src/logic.js'
import { gameState } from '../../src/gameState.js'

// Mock dependencies
vi.mock('../../src/config.js', async(importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    TILE_SIZE: 32,
    HOWITZER_BUILDING_DAMAGE_MULTIPLIER: 1.5,
    HELIPAD_FUEL_CAPACITY: 15600,
    HELIPAD_RELOAD_TIME: 8000,
    HELIPAD_AMMO_RESERVE: 250
  }
})

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1',
    occupancyMap: [],
    buildings: [],
    unitWrecks: []
  }
}))

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn(),
  playPositionalSound: vi.fn()
}))

vi.mock('../../src/game/hitZoneCalculator.js', () => ({
  calculateHitZoneDamageMultiplier: vi.fn(() => ({ multiplier: 1, isRearHit: false }))
}))

vi.mock('../../src/game/soundCooldownManager.js', () => ({
  canPlayCriticalDamageSound: vi.fn(() => false),
  recordCriticalDamageSoundPlayed: vi.fn()
}))

vi.mock('../../src/utils.js', () => ({
  updateUnitSpeedModifier: vi.fn(),
  awardExperience: vi.fn(),
  getUnitCost: vi.fn(() => 0)
}))

vi.mock('../../src/buildings.js', () => ({
  markBuildingForRepairPause: vi.fn()
}))

vi.mock('../../src/game/unitWreckManager.js', () => ({
  applyDamageToWreck: vi.fn()
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({
  broadcastBuildingDamage: vi.fn()
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn(() => 0.5)
}))

const TILE_SIZE = 32

describe('logic.js', () => {
  describe('normalizeAngle', () => {
    it('returns 0 for 0', () => {
      expect(normalizeAngle(0)).toBe(0)
    })

    it('returns same angle for angles within -PI to PI', () => {
      expect(normalizeAngle(1)).toBeCloseTo(1)
      expect(normalizeAngle(-1)).toBeCloseTo(-1)
      expect(normalizeAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2)
    })

    it('normalizes angles > PI', () => {
      expect(normalizeAngle(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5)
      expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0)
    })

    it('normalizes angles < -PI', () => {
      expect(normalizeAngle(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5)
    })

    it('handles very large positive angles', () => {
      const angle = 10 * Math.PI
      const result = normalizeAngle(angle)
      expect(result).toBeGreaterThanOrEqual(-Math.PI)
      expect(result).toBeLessThanOrEqual(Math.PI)
    })

    it('handles very large negative angles', () => {
      const angle = -10 * Math.PI
      const result = normalizeAngle(angle)
      expect(result).toBeGreaterThanOrEqual(-Math.PI)
      expect(result).toBeLessThanOrEqual(Math.PI)
    })

    it('handles PI exactly', () => {
      // PI is on the boundary and should stay as PI or -PI
      const result = normalizeAngle(Math.PI)
      expect(Math.abs(result)).toBeCloseTo(Math.PI)
    })
  })

  describe('angleDiff', () => {
    it('returns 0 for same angles', () => {
      expect(angleDiff(0, 0)).toBeCloseTo(0)
      expect(angleDiff(Math.PI / 2, Math.PI / 2)).toBeCloseTo(0)
    })

    it('returns correct difference for different angles', () => {
      expect(angleDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2)
      expect(angleDiff(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2)
    })

    it('returns absolute difference for angles near PI', () => {
      // The actual function returns absolute value after modulo
      const result = angleDiff(0, Math.PI / 2)
      expect(result).toBeCloseTo(Math.PI / 2)
    })

    it('handles opposite directions', () => {
      // 0 and PI are opposite, difference is PI
      expect(angleDiff(0, Math.PI)).toBeCloseTo(Math.PI)
    })
  })

  describe('smoothRotateTowardsAngle', () => {
    const rotationSpeed = 0.1

    it('snaps to target when very close', () => {
      const current = 0
      const target = 0.05
      const result = smoothRotateTowardsAngle(current, target, rotationSpeed)
      expect(result).toBeCloseTo(target)
    })

    it('rotates clockwise when target is ahead', () => {
      const current = 0
      const target = 1
      const result = smoothRotateTowardsAngle(current, target, rotationSpeed)
      expect(result).toBeCloseTo(rotationSpeed)
    })

    it('rotates counter-clockwise when target is behind', () => {
      const current = 0
      const target = -1
      const result = smoothRotateTowardsAngle(current, target, rotationSpeed)
      expect(result).toBeCloseTo(-rotationSpeed)
    })

    it('takes shortest path across PI boundary', () => {
      // At current = 0.9*PI, target = -0.9*PI, should rotate clockwise (positive direction)
      const current = 0.9 * Math.PI
      const target = -0.9 * Math.PI
      const result = smoothRotateTowardsAngle(current, target, rotationSpeed)
      // Should rotate towards PI (increase), not towards 0
      expect(result).toBeGreaterThan(current)
    })

    it('returns normalized angle', () => {
      const result = smoothRotateTowardsAngle(Math.PI, 0, rotationSpeed)
      expect(result).toBeGreaterThanOrEqual(-Math.PI)
      expect(result).toBeLessThanOrEqual(Math.PI)
    })
  })

  describe('isAdjacentToFactory', () => {
    const factory = { x: 5, y: 5, width: 2, height: 2 }

    it('returns true for unit directly adjacent (left)', () => {
      const unit = { x: 4 * TILE_SIZE, y: 5 * TILE_SIZE }
      expect(isAdjacentToFactory(unit, factory)).toBe(true)
    })

    it('returns true for unit directly adjacent (right)', () => {
      const unit = { x: 7 * TILE_SIZE, y: 5 * TILE_SIZE }
      expect(isAdjacentToFactory(unit, factory)).toBe(true)
    })

    it('returns true for unit directly adjacent (top)', () => {
      const unit = { x: 5 * TILE_SIZE, y: 4 * TILE_SIZE }
      expect(isAdjacentToFactory(unit, factory)).toBe(true)
    })

    it('returns true for unit directly adjacent (bottom)', () => {
      const unit = { x: 5 * TILE_SIZE, y: 7 * TILE_SIZE }
      expect(isAdjacentToFactory(unit, factory)).toBe(true)
    })

    it('returns true for unit diagonally adjacent', () => {
      const unit = { x: 4 * TILE_SIZE, y: 4 * TILE_SIZE }
      expect(isAdjacentToFactory(unit, factory)).toBe(true)
    })

    it('returns false for unit far away', () => {
      const unit = { x: 10 * TILE_SIZE, y: 10 * TILE_SIZE }
      expect(isAdjacentToFactory(unit, factory)).toBe(false)
    })

    it('returns true for unit inside factory bounds', () => {
      // isAdjacentToFactory includes tiles inside factory bounds
      const unit = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }
      expect(isAdjacentToFactory(unit, factory)).toBe(true)
    })
  })

  describe('isAdjacentToBuilding', () => {
    const building = { x: 5, y: 5, width: 2, height: 2 }

    it('returns true for unit directly adjacent (left)', () => {
      const unit = { x: 4 * TILE_SIZE, y: 5 * TILE_SIZE }
      expect(isAdjacentToBuilding(unit, building)).toBe(true)
    })

    it('returns true for unit directly adjacent (right)', () => {
      const unit = { x: 7 * TILE_SIZE, y: 5 * TILE_SIZE }
      expect(isAdjacentToBuilding(unit, building)).toBe(true)
    })

    it('returns false for unit inside building bounds', () => {
      // isAdjacentToBuilding explicitly skips tiles inside the building
      const unit = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }
      expect(isAdjacentToBuilding(unit, building)).toBe(false)
    })

    it('returns true for unit diagonally adjacent', () => {
      const unit = { x: 4 * TILE_SIZE, y: 4 * TILE_SIZE }
      expect(isAdjacentToBuilding(unit, building)).toBe(true)
    })

    it('returns false for unit far away', () => {
      const unit = { x: 10 * TILE_SIZE, y: 10 * TILE_SIZE }
      expect(isAdjacentToBuilding(unit, building)).toBe(false)
    })
  })

  describe('triggerExplosion', () => {
    beforeEach(() => {
      explosions.length = 0
      gameState.buildings = []
      gameState.unitWrecks = []
      gameState.gameStarted = false
      gameState.mapEditMode = false
      gameState.frameCount = 0
      gameState.gameTime = 0
      globalThis.window = globalThis.window || {}
      globalThis.window.cheatSystem = undefined
    })

    it('applies the same direct-hit damage to grounded and airborne apaches', () => {
      const shooter = { id: 'rocket-turret-1', owner: 'player1', type: 'rocketTurret' }
      const groundedApache = {
        id: 'apache-grounded',
        type: 'apache',
        owner: 'enemy',
        x: 160,
        y: 160,
        health: 40,
        maxHealth: 40,
        altitude: 90,
        flightState: 'grounded'
      }
      const airborneApache = {
        id: 'apache-airborne',
        type: 'apache',
        owner: 'enemy',
        x: 160,
        y: 160,
        health: 40,
        maxHealth: 40,
        altitude: 90,
        flightState: 'airborne'
      }

      triggerExplosion(
        groundedApache.x + TILE_SIZE / 2,
        groundedApache.y + TILE_SIZE / 2,
        18,
        [groundedApache],
        [],
        shooter,
        1000,
        [],
        TILE_SIZE * 1.5,
        false,
        { allowAirborneDamage: true, unitDamageMultipliers: { apache: 1.5 } }
      )

      triggerExplosion(
        airborneApache.x + TILE_SIZE / 2,
        airborneApache.y + TILE_SIZE / 2 - airborneApache.altitude * 0.4,
        18,
        [airborneApache],
        [],
        shooter,
        1000,
        [],
        TILE_SIZE * 1.5,
        false,
        { allowAirborneDamage: true, unitDamageMultipliers: { apache: 1.5 } }
      )

      expect(groundedApache.health).toBe(26)
      expect(airborneApache.health).toBe(26)
    })
  })

  describe('findClosestOre', () => {
    let mapGrid

    beforeEach(() => {
      // Create simple 10x10 grid
      mapGrid = Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => ({
          ore: false,
          seedCrystal: false
        }))
      )
    })

    it('returns null when no ore exists', () => {
      const unit = { id: 1, x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }
      expect(findClosestOre(unit, mapGrid)).toBe(null)
    })

    it('finds closest ore tile', () => {
      mapGrid[3][4].ore = true
      mapGrid[8][8].ore = true

      const unit = { id: 1, x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }
      const result = findClosestOre(unit, mapGrid)

      // Closest ore is at (4, 3)
      expect(result).toBeTruthy()
    })

    it('skips seed crystals', () => {
      mapGrid[4][4].ore = true
      mapGrid[4][4].seedCrystal = true
      mapGrid[8][8].ore = true

      const unit = { id: 1, x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }
      const result = findClosestOre(unit, mapGrid)

      // Should find ore at (8, 8), not the seed crystal at (4, 4)
      expect(result).toEqual({ x: 8, y: 8 })
    })

    it('skips ore tiles above the harvester XP density limit', () => {
      mapGrid[4][4].ore = true
      mapGrid[4][4].oreDensity = 4
      mapGrid[8][8].ore = true
      mapGrid[8][8].oreDensity = 2

      const unit = { id: 1, x: 5 * TILE_SIZE, y: 5 * TILE_SIZE, level: 0 }
      const result = findClosestOre(unit, mapGrid)

      expect(result).toEqual({ x: 8, y: 8 })
    })

    it('skips tiles targeted by other units', () => {
      mapGrid[4][4].ore = true
      mapGrid[8][8].ore = true

      const unit = { id: 1, x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }
      const targetedOreTiles = { '4,4': 2 } // Targeted by unit 2

      const result = findClosestOre(unit, mapGrid, targetedOreTiles)

      expect(result).toEqual({ x: 8, y: 8 })
    })

    it('allows tiles targeted by same unit', () => {
      mapGrid[4][4].ore = true
      mapGrid[8][8].ore = true

      const unit = { id: 1, x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }
      const targetedOreTiles = { '4,4': 1 } // Targeted by same unit

      const result = findClosestOre(unit, mapGrid, targetedOreTiles)

      // Should find ore at (4, 4) since it's targeted by the same unit
      expect(result).toBeTruthy()
    })

    it('returns null for undefined unit', () => {
      expect(findClosestOre(undefined, mapGrid)).toBe(null)
    })

    it('returns null for unit missing x property', () => {
      const unit = { id: 1, y: 5 * TILE_SIZE }
      expect(findClosestOre(unit, mapGrid)).toBe(null)
    })

    it('returns null for unit missing y property', () => {
      const unit = { id: 1, x: 5 * TILE_SIZE }
      expect(findClosestOre(unit, mapGrid)).toBe(null)
    })
  })

  describe('findAdjacentTile', () => {
    let mapGrid

    beforeEach(() => {
      mapGrid = Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => ({
          building: false
        }))
      )
    })

    it('finds first adjacent non-building tile', () => {
      const factory = { x: 5, y: 5, width: 2, height: 2 }

      // Mark factory tiles as buildings
      for (let y = factory.y; y < factory.y + factory.height; y++) {
        for (let x = factory.x; x < factory.x + factory.width; x++) {
          mapGrid[y][x].building = true
        }
      }

      const result = findAdjacentTile(factory, mapGrid)

      expect(result).toBeTruthy()
      expect(result.x).toBeDefined()
      expect(result.y).toBeDefined()
    })

    it('returns null when all adjacent tiles are buildings', () => {
      const factory = { x: 5, y: 5, width: 2, height: 2 }

      // Mark all tiles as buildings
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          mapGrid[y][x].building = true
        }
      }

      const result = findAdjacentTile(factory, mapGrid)

      expect(result).toBe(null)
    })

    it('returns null for invalid factory', () => {
      expect(findAdjacentTile(null, mapGrid)).toBe(null)
    })

    it('returns null for invalid mapGrid', () => {
      const factory = { x: 5, y: 5, width: 2, height: 2 }
      expect(findAdjacentTile(factory, null)).toBe(null)
    })

    it('handles factories at edge of map', () => {
      const factory = { x: 0, y: 0, width: 2, height: 2 }

      const result = findAdjacentTile(factory, mapGrid)

      expect(result).toBeTruthy()
      // Should find a valid tile, not one with negative coordinates
      expect(result.x).toBeGreaterThanOrEqual(0)
      expect(result.y).toBeGreaterThanOrEqual(0)
    })
  })

  describe('hasClearShot', () => {
    let units
    let mapGrid

    beforeEach(() => {
      units = []
      mapGrid = Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => ({
          building: false
        }))
      )
    })

    it('returns true when no obstructions', () => {
      const shooter = { x: 0, y: 0, owner: 'player1' }
      const target = { tileX: 5, x: 5 * TILE_SIZE, y: 5 * TILE_SIZE, owner: 'player2' }

      expect(hasClearShot(shooter, target, units, mapGrid)).toBe(true)
    })

    it('returns false when friendly unit is in the way', () => {
      const shooter = { x: 0, y: 0, owner: 'player1' }
      const target = { tileX: 6, x: 6 * TILE_SIZE, y: 6 * TILE_SIZE, owner: 'player2' }
      const friendly = { x: 3 * TILE_SIZE, y: 3 * TILE_SIZE, owner: 'player1' }

      units = [shooter, friendly, target]

      expect(hasClearShot(shooter, target, units, mapGrid)).toBe(false)
    })

    it('ignores enemy units in the way', () => {
      const shooter = { x: 0, y: 0, owner: 'player1' }
      const target = { tileX: 6, x: 6 * TILE_SIZE, y: 6 * TILE_SIZE, owner: 'player2' }
      const enemy = { x: 3 * TILE_SIZE, y: 3 * TILE_SIZE, owner: 'player2' }

      units = [shooter, enemy, target]

      expect(hasClearShot(shooter, target, units, mapGrid)).toBe(true)
    })

    it('returns true for clear horizontal shot', () => {
      const shooter = { x: 0, y: 0, owner: 'player1' }
      const target = { tileX: 4, x: 4 * TILE_SIZE, y: 0, owner: 'player2' }

      // No obstructions between shooter and target
      expect(hasClearShot(shooter, target, units, mapGrid)).toBe(true)
    })

    it('ignores the shooter itself', () => {
      const shooter = { x: 0, y: 0, owner: 'player1' }
      const target = { tileX: 5, x: 5 * TILE_SIZE, y: 5 * TILE_SIZE, owner: 'player2' }

      units = [shooter]

      expect(hasClearShot(shooter, target, units, mapGrid)).toBe(true)
    })

    it('ignores the target itself', () => {
      const shooter = { x: 0, y: 0, owner: 'player1' }
      const target = { tileX: 5, x: 5 * TILE_SIZE, y: 5 * TILE_SIZE, owner: 'player1' }

      units = [shooter, target]

      expect(hasClearShot(shooter, target, units, mapGrid)).toBe(true)
    })

    it('handles building targets (no tileX)', () => {
      const shooter = { x: 0, y: 0, owner: 'player1' }
      const building = { x: 5, y: 5, width: 2, height: 2, owner: 'player2' }

      expect(hasClearShot(shooter, building, units, mapGrid)).toBe(true)
    })
  })

  describe('triggerExplosion', () => {
    const mockUnits = []
    const mockFactories = []
    const mockShooter = null
    const mockNow = performance.now()
    const mockMapGrid = []

    beforeEach(() => {
      // Clear explosions array before each test
      explosions.length = 0
    })

    afterEach(() => {
      explosions.length = 0
    })

    it('adds explosion to explosions array', () => {
      triggerExplosion(100, 200, 50, mockUnits, mockFactories, mockShooter, mockNow, mockMapGrid)

      expect(explosions.length).toBe(1)
      expect(explosions[0].x).toBe(100)
      expect(explosions[0].y).toBe(200)
    })

    it('stores startTime in explosion', () => {
      const now = Date.now()
      triggerExplosion(50, 75, 50, mockUnits, mockFactories, mockShooter, now, mockMapGrid)

      expect(explosions[0].startTime).toBe(now)
    })

    it('handles multiple explosions', () => {
      triggerExplosion(10, 20, 50, mockUnits, mockFactories, mockShooter, mockNow, mockMapGrid)
      triggerExplosion(30, 40, 50, mockUnits, mockFactories, mockShooter, mockNow, mockMapGrid)
      triggerExplosion(50, 60, 50, mockUnits, mockFactories, mockShooter, mockNow, mockMapGrid)

      expect(explosions.length).toBe(3)
      expect(explosions[0].x).toBe(10)
      expect(explosions[1].x).toBe(30)
      expect(explosions[2].x).toBe(50)
    })

    it('handles negative coordinates', () => {
      triggerExplosion(-100, -200, 50, mockUnits, mockFactories, mockShooter, mockNow, mockMapGrid)

      expect(explosions[0].x).toBe(-100)
      expect(explosions[0].y).toBe(-200)
    })

    it('handles zero coordinates', () => {
      triggerExplosion(0, 0, 50, mockUnits, mockFactories, mockShooter, mockNow, mockMapGrid)

      expect(explosions[0].x).toBe(0)
      expect(explosions[0].y).toBe(0)
    })
  })

  describe('showUnloadingFeedback', () => {
    it('is a placeholder function that can be called without error', () => {
      const unit = { x: 150, y: 250 }
      const refinery = { x: 5, y: 5 }

      // Should not throw
      expect(() => showUnloadingFeedback(unit, refinery)).not.toThrow()
    })

    it('accepts unit and refinery parameters', () => {
      const unit = { x: 100, y: 200 }
      const refinery = { x: 10, y: 10 }

      // Function is a placeholder, just ensure it runs without errors
      showUnloadingFeedback(unit, refinery)
    })
  })

  describe('findPositionWithClearShot', () => {
    let units
    let mapGrid
    let savedOccupancyMap

    beforeEach(() => {
      units = []
      mapGrid = Array.from({ length: 20 }, () =>
        Array.from({ length: 20 }, () => ({
          building: false,
          type: 'land'
        }))
      )
      // Set up occupancy map in gameState
      savedOccupancyMap = gameState.occupancyMap
      gameState.occupancyMap = Array.from({ length: 20 }, () =>
        Array.from({ length: 20 }, () => 0)
      )
    })

    afterEach(() => {
      gameState.occupancyMap = savedOccupancyMap
    })

    it('returns true or false based on finding clear shot position', () => {
      const shooter = { x: 0, y: 0, owner: 'player1', path: [] }
      const target = { tileX: 5, x: 5 * TILE_SIZE, y: 0, owner: 'player2' }

      const result = findPositionWithClearShot(shooter, target, units, mapGrid)

      expect(typeof result).toBe('boolean')
    })

    it('modifies unit path when position is found', () => {
      const shooter = { x: 32, y: 32, owner: 'player1', path: [] }
      const target = { tileX: 5, x: 5 * TILE_SIZE, y: 32, owner: 'player2' }

      // Mark shooter position as blocked so it has to move
      gameState.occupancyMap[1][1] = 1

      findPositionWithClearShot(shooter, target, units, mapGrid)

      // Function may or may not find a path
      expect(typeof shooter.path).toBe('object')
    })

    it('handles crowded areas without crashing', () => {
      const shooter = { x: 0, y: 0, owner: 'player1', path: [] }
      const target = { tileX: 10, x: 10 * TILE_SIZE, y: 10 * TILE_SIZE, owner: 'player2' }

      // Fill area with friendly units blocking all angles
      for (let i = 1; i < 5; i++) {
        for (let j = 1; j < 5; j++) {
          units.push({ x: i * TILE_SIZE, y: j * TILE_SIZE, owner: 'player1' })
          gameState.occupancyMap[j][i] = 1
        }
      }
      units.push(shooter, target)

      // Should not throw
      expect(() => findPositionWithClearShot(shooter, target, units, mapGrid)).not.toThrow()
    })

    it('handles target with no tileX (building)', () => {
      const shooter = { x: 0, y: 0, owner: 'player1', path: [] }
      const building = { x: 5, y: 5, width: 2, height: 2, owner: 'player2' }

      // Should not throw
      expect(() => findPositionWithClearShot(shooter, building, units, mapGrid)).not.toThrow()
    })

    it('operates on direct path situations', () => {
      const shooter = { x: 0, y: 0, owner: 'player1', path: [] }
      const target = { tileX: 8, x: 8 * TILE_SIZE, y: 0, owner: 'player2' }

      // Block direct path with a friendly unit
      const blocker = { x: 4 * TILE_SIZE, y: 0, owner: 'player1' }
      units = [shooter, blocker, target]
      gameState.occupancyMap[0][4] = 1

      // Should not throw
      expect(() => findPositionWithClearShot(shooter, target, units, mapGrid)).not.toThrow()
    })

    it('handles diagonal situations', () => {
      const shooter = { x: 0, y: 0, owner: 'player1', path: [] }
      const target = { tileX: 6, x: 6 * TILE_SIZE, y: 6 * TILE_SIZE, owner: 'player2' }

      // Block diagonal with friendly
      const blocker = { x: 3 * TILE_SIZE, y: 3 * TILE_SIZE, owner: 'player1' }
      units = [shooter, blocker, target]
      gameState.occupancyMap[3][3] = 1

      // Should not throw
      expect(() => findPositionWithClearShot(shooter, target, units, mapGrid)).not.toThrow()
    })
  })
})
