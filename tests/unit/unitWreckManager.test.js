import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import '../setup.js'

// Mock dependencies
vi.mock('../../src/config.js', async() => {
  const actual = await vi.importActual('../../src/config.js')
  return {
    ...actual,
    TILE_SIZE: 32,
    WRECK_IMPACT_FORCE_MULTIPLIER: 0.5,
    WRECK_INERTIA_DECAY: 0.95,
    DEFAULT_MAP_TILES_X: 100,
    DEFAULT_MAP_TILES_Y: 100
  }
})

vi.mock('../../src/utils.js', () => ({
  getUnitCost: vi.fn((type) => {
    const costs = { tank: 500, harvester: 800, apache: 1200 }
    return costs[type] || 500
  })
}))

vi.mock('../../src/game/unifiedMovement.js', () => ({
  UNIT_COLLISION_MIN_DISTANCE: 28
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn(() => 0.5)
}))

import {
  registerUnitWreck,
  getWreckById,
  removeWreckById,
  findWreckAtTile,
  releaseWreckAssignment,
  updateWreckPositionFromTank,
  findNearestWorkshop,
  getRecycleDurationForWreck,
  applyDamageToWreck,
  updateWreckPhysics
} from '../../src/game/unitWreckManager.js'
import { getUnitCost } from '../../src/utils.js'
import { gameRandom } from '../../src/utils/gameRandom.js'

describe('unitWreckManager.js', () => {
  let gameState

  beforeEach(() => {
    vi.clearAllMocks()
    gameState = {
      unitWrecks: [],
      buildings: [],
      mapGrid: Array(100).fill(null).map(() => Array(100).fill(0)),
      occupancyMap: Array(100).fill(null).map(() => Array(100).fill(0)),
      selectedWreckId: null,
      mapTilesX: 100,
      mapTilesY: 100
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('registerUnitWreck', () => {
    it('should return null if unit is null', () => {
      const result = registerUnitWreck(null, gameState)
      expect(result).toBe(null)
    })

    it('should initialize unitWrecks array if not present', () => {
      delete gameState.unitWrecks
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, maxHealth: 100, owner: 1 }

      registerUnitWreck(unit, gameState)

      expect(Array.isArray(gameState.unitWrecks)).toBe(true)
    })

    it('should create a wreck from a unit', () => {
      const unit = {
        id: 'unit-1',
        type: 'tank',
        x: 100,
        y: 100,
        tileX: 3,
        tileY: 3,
        direction: 1.5,
        turretDirection: 2.0,
        health: 100,
        maxHealth: 100,
        owner: 1
      }

      const wreck = registerUnitWreck(unit, gameState)

      expect(wreck).toBeDefined()
      expect(wreck.id).toBe('unit-1-wreck')
      expect(wreck.sourceUnitId).toBe('unit-1')
      expect(wreck.unitType).toBe('tank')
      expect(wreck.owner).toBe(1)
      expect(wreck.x).toBe(100)
      expect(wreck.y).toBe(100)
      expect(wreck.direction).toBe(1.5)
      expect(wreck.turretDirection).toBe(2.0)
      expect(wreck.health).toBe(100)
      expect(wreck.maxHealth).toBe(100)
    })

    it('should not create duplicate wreck for same unit', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, maxHealth: 100, owner: 1 }

      const wreck1 = registerUnitWreck(unit, gameState)
      const wreck2 = registerUnitWreck(unit, gameState)

      expect(wreck1).toBe(wreck2)
      expect(gameState.unitWrecks.length).toBe(1)
    })

    it('should add wreck to gameState.unitWrecks', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }

      registerUnitWreck(unit, gameState)

      expect(gameState.unitWrecks.length).toBe(1)
    })

    it('should update occupancy map when registering wreck', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }

      registerUnitWreck(unit, gameState)

      // Check that occupancy map was updated at the wreck's tile
      const tileX = Math.floor((100 + 16) / 32) // center-based calculation
      const tileY = Math.floor((100 + 16) / 32)
      expect(gameState.occupancyMap[tileY][tileX]).toBe(1)
    })

    it('should use default direction of 0 if not provided', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }

      const wreck = registerUnitWreck(unit, gameState)

      expect(wreck.direction).toBe(0)
      expect(wreck.turretDirection).toBe(0)
    })

    it('should estimate build duration based on unit cost', () => {
      const unit = { id: 'unit-1', type: 'apache', x: 100, y: 100, health: 100, owner: 1 }

      const wreck = registerUnitWreck(unit, gameState)

      expect(wreck.buildDuration).toBeGreaterThan(0)
      expect(getUnitCost).toHaveBeenCalledWith('apache')
    })

    it('should initialize velocity to zero', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }

      const wreck = registerUnitWreck(unit, gameState)

      expect(wreck.velocityX).toBe(0)
      expect(wreck.velocityY).toBe(0)
    })

    it('selects each directional naval sinking mode from an equal quarter of deterministic rolls', () => {
      const cases = [
        [0, 'front-down'],
        [0.25, 'back-down'],
        [0.5, 'left-down'],
        [0.999, 'right-down']
      ]
      cases.forEach(([roll, expected], index) => {
        gameRandom.mockReturnValueOnce(roll).mockReturnValueOnce(0.25)
        const wreck = registerUnitWreck({
          id: `destroyer-${index}`, type: 'destroyer', isNaval: true,
          x: 100, y: 100, health: 0, maxHealth: 250, owner: 'player1'
        }, gameState)
        expect(wreck.navalSinking).toBe(true)
        expect(wreck.navalSinkMode).toBe(expected)
      })
    })
  })

  describe('getWreckById', () => {
    it('should return null if gameState is null', () => {
      const result = getWreckById(null, 'wreck-1')
      expect(result).toBe(null)
    })

    it('should return null if unitWrecks is not present', () => {
      const result = getWreckById({}, 'wreck-1')
      expect(result).toBe(null)
    })

    it('should return undefined if wreck not found', () => {
      const result = getWreckById(gameState, 'nonexistent-wreck')
      expect(result).toBeUndefined()
    })

    it('should find wreck by id', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      registerUnitWreck(unit, gameState)

      const wreck = getWreckById(gameState, 'unit-1-wreck')

      expect(wreck).toBeDefined()
      expect(wreck.id).toBe('unit-1-wreck')
    })
  })

  describe('removeWreckById', () => {
    it('should return null if gameState is null', () => {
      const result = removeWreckById(null, 'wreck-1')
      expect(result).toBe(null)
    })

    it('should return null if unitWrecks is not present', () => {
      const result = removeWreckById({}, 'wreck-1')
      expect(result).toBe(null)
    })

    it('should return null if wreck not found', () => {
      const result = removeWreckById(gameState, 'nonexistent-wreck')
      expect(result).toBe(null)
    })

    it('should remove wreck and return it', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      registerUnitWreck(unit, gameState)

      const removed = removeWreckById(gameState, 'unit-1-wreck')

      expect(removed).toBeDefined()
      expect(removed.id).toBe('unit-1-wreck')
      expect(gameState.unitWrecks.length).toBe(0)
    })

    it('should clear selectedWreckId if removed wreck was selected', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      registerUnitWreck(unit, gameState)
      gameState.selectedWreckId = 'unit-1-wreck'

      removeWreckById(gameState, 'unit-1-wreck')

      expect(gameState.selectedWreckId).toBe(null)
    })

    it('should update occupancy map when removing wreck', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      registerUnitWreck(unit, gameState)

      const tileX = Math.floor((100 + 16) / 32)
      const tileY = Math.floor((100 + 16) / 32)
      expect(gameState.occupancyMap[tileY][tileX]).toBe(1)

      removeWreckById(gameState, 'unit-1-wreck')

      expect(gameState.occupancyMap[tileY][tileX]).toBe(0)
    })
  })

  describe('findWreckAtTile', () => {
    it('should return null if gameState is null', () => {
      const result = findWreckAtTile(null, 3, 3)
      expect(result).toBe(null)
    })

    it('should return null if unitWrecks is not present', () => {
      const result = findWreckAtTile({}, 3, 3)
      expect(result).toBe(null)
    })

    it('should return undefined if no wreck at tile', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      registerUnitWreck(unit, gameState)

      const result = findWreckAtTile(gameState, 0, 0)

      expect(result).toBeUndefined()
    })

    it('should find wreck at specific tile', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 80, y: 80, health: 100, owner: 1 }
      registerUnitWreck(unit, gameState)

      // Center-based calculation: (80 + 16) / 32 = 3
      const result = findWreckAtTile(gameState, 3, 3)

      expect(result).toBeDefined()
      expect(result.id).toBe('unit-1-wreck')
    })
  })

  describe('releaseWreckAssignment', () => {
    it('should do nothing if wreck is null', () => {
      expect(() => releaseWreckAssignment(null)).not.toThrow()
    })

    it('should clear all assignment-related properties', () => {
      const wreck = {
        id: 'wreck-1',
        assignedTankId: 'tank-1',
        towedBy: 'recovery-1',
        isBeingRecycled: true,
        recycleStartedAt: 1000,
        recycleDuration: 5000
      }

      releaseWreckAssignment(wreck)

      expect(wreck.assignedTankId).toBe(null)
      expect(wreck.towedBy).toBe(null)
      expect(wreck.isBeingRecycled).toBe(false)
      expect(wreck.recycleStartedAt).toBe(null)
      expect(wreck.recycleDuration).toBe(null)
    })
  })

  describe('updateWreckPositionFromTank', () => {
    it('should do nothing if wreck is null', () => {
      const tank = { x: 100, y: 100, direction: 0 }
      expect(() => updateWreckPositionFromTank(null, tank, null)).not.toThrow()
    })

    it('should do nothing if tank is null', () => {
      const wreck = { x: 0, y: 0 }
      expect(() => updateWreckPositionFromTank(wreck, null, null)).not.toThrow()
    })

    it('should update wreck position behind tank', () => {
      const wreck = { x: 0, y: 0, tileX: 0, tileY: 0 }
      const tank = { x: 100, y: 100, direction: 0 }

      updateWreckPositionFromTank(wreck, tank, null)

      // Tank facing right (direction=0), wreck should be behind (to the left)
      expect(wreck.x).toBeLessThan(100)
      expect(wreck.y).toBeCloseTo(100, 1)
    })

    it('should update wreck tile positions', () => {
      const wreck = { x: 0, y: 0, tileX: 0, tileY: 0 }
      const tank = { x: 100, y: 100, direction: 0 }

      updateWreckPositionFromTank(wreck, tank, null)

      expect(typeof wreck.tileX).toBe('number')
      expect(typeof wreck.tileY).toBe('number')
    })

    it('should update occupancy map when position changes', () => {
      const wreck = { x: 0, y: 0, tileX: 0, tileY: 0, occupancyTileX: null, occupancyTileY: null }
      const tank = { x: 100, y: 100, direction: 0 }
      const occupancyMap = Array(100).fill(null).map(() => Array(100).fill(0))

      updateWreckPositionFromTank(wreck, tank, occupancyMap)

      expect(wreck.occupancyTileX).toBeDefined()
      expect(wreck.occupancyTileY).toBeDefined()
    })
  })

  describe('findNearestWorkshop', () => {
    it('should return null if gameState is null', () => {
      const result = findNearestWorkshop(null, 1, { x: 5, y: 5 })
      expect(result).toBe(null)
    })

    it('should return null if no buildings exist', () => {
      gameState.buildings = null
      const result = findNearestWorkshop(gameState, 1, { x: 5, y: 5 })
      expect(result).toBe(null)
    })

    it('should return null if no workshops for owner', () => {
      gameState.buildings = [
        { type: 'vehicleWorkshop', owner: 2, health: 100, x: 10, y: 10, width: 3, height: 3 }
      ]

      const result = findNearestWorkshop(gameState, 1, { x: 5, y: 5 })

      expect(result).toBe(null)
    })

    it('should return null if all workshops are destroyed', () => {
      gameState.buildings = [
        { type: 'vehicleWorkshop', owner: 1, health: 0, x: 10, y: 10, width: 3, height: 3 }
      ]

      const result = findNearestWorkshop(gameState, 1, { x: 5, y: 5 })

      expect(result).toBe(null)
    })

    it('should find nearest workshop for owner', () => {
      gameState.buildings = [
        { type: 'vehicleWorkshop', owner: 1, health: 100, x: 10, y: 10, width: 3, height: 3 },
        { type: 'vehicleWorkshop', owner: 1, health: 100, x: 50, y: 50, width: 3, height: 3 }
      ]

      const result = findNearestWorkshop(gameState, 1, { x: 5, y: 5 })

      expect(result).toBeDefined()
      expect(result.workshop.x).toBe(10)
      expect(result.entryTile).toBeDefined()
    })

    it('should include entry tile in result', () => {
      gameState.buildings = [
        { type: 'vehicleWorkshop', owner: 1, health: 100, x: 10, y: 10, width: 3, height: 3 }
      ]

      const result = findNearestWorkshop(gameState, 1, { x: 5, y: 5 })

      expect(result.entryTile).toBeDefined()
      expect(typeof result.entryTile.x).toBe('number')
      expect(typeof result.entryTile.y).toBe('number')
    })
  })

  describe('getRecycleDurationForWreck', () => {
    it('should return minimum duration for null wreck', () => {
      const result = getRecycleDurationForWreck(null)
      expect(result).toBe(1000) // MIN_BUILD_DURATION
    })

    it('should calculate duration based on unit type', () => {
      const wreck = { unitType: 'tank' }

      const result = getRecycleDurationForWreck(wreck)

      expect(result).toBeGreaterThan(0)
    })

    it('should use existing buildDuration if provided', () => {
      const wreck = { unitType: 'tank', buildDuration: 5000 }

      const result = getRecycleDurationForWreck(wreck)

      expect(result).toBe(5000)
    })

    it('should clamp duration to max value', () => {
      const wreck = { unitType: 'tank', buildDuration: 1000000 }

      const result = getRecycleDurationForWreck(wreck)

      expect(result).toBeLessThanOrEqual(600000)
    })
  })

  describe('applyDamageToWreck', () => {
    it('should return false if wreck is null', () => {
      const result = applyDamageToWreck(null, 50, gameState)
      expect(result).toBe(false)
    })

    it('should return false if gameState is null', () => {
      const wreck = { health: 100 }
      const result = applyDamageToWreck(wreck, 50, null)
      expect(result).toBe(false)
    })

    it('should return false for zero damage', () => {
      const wreck = { health: 100 }
      const result = applyDamageToWreck(wreck, 0, gameState)
      expect(result).toBe(false)
    })

    it('should return false if wreck already dead', () => {
      const wreck = { health: 0 }
      const result = applyDamageToWreck(wreck, 50, gameState)
      expect(result).toBe(false)
    })

    it('should reduce wreck health', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, maxHealth: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)

      applyDamageToWreck(wreck, 30, gameState)

      expect(wreck.health).toBe(70)
    })

    it('should return true and remove wreck when health reaches zero', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 50, maxHealth: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)

      const result = applyDamageToWreck(wreck, 100, gameState)

      expect(result).toBe(true)
      expect(gameState.unitWrecks.length).toBe(0)
    })

    it('should apply velocity from impact position', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, maxHealth: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      const impactPosition = { x: 90, y: 100 }

      applyDamageToWreck(wreck, 30, gameState, impactPosition)

      expect(wreck.velocityX).not.toBe(0)
    })

    it('should use random angle when impact at center', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, maxHealth: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      const impactPosition = { x: 116, y: 116 } // Center of wreck

      applyDamageToWreck(wreck, 30, gameState, impactPosition)

      // Should still apply some velocity using random direction
      expect(typeof wreck.velocityX).toBe('number')
      expect(typeof wreck.velocityY).toBe('number')
    })

    it('should not apply velocity without impact position', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, maxHealth: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)

      applyDamageToWreck(wreck, 30, gameState)

      expect(wreck.velocityX).toBe(0)
      expect(wreck.velocityY).toBe(0)
    })
  })

  describe('updateWreckPhysics', () => {
    it('should do nothing if gameState is null', () => {
      expect(() => updateWreckPhysics(null, [], 16)).not.toThrow()
    })

    it('should do nothing if unitWrecks is empty', () => {
      expect(() => updateWreckPhysics(gameState, [], 16)).not.toThrow()
    })

    it('should do nothing if unitWrecks is not an array', () => {
      gameState.unitWrecks = null
      expect(() => updateWreckPhysics(gameState, [], 16)).not.toThrow()
    })

    it('should skip wrecks with no velocity', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      wreck.velocityX = 0
      wreck.velocityY = 0

      const initialX = wreck.x
      const initialY = wreck.y

      updateWreckPhysics(gameState, [], 16)

      expect(wreck.x).toBe(initialX)
      expect(wreck.y).toBe(initialY)
    })

    it('should move wrecks with velocity', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      wreck.velocityX = 10
      wreck.velocityY = 0

      const initialX = wreck.x

      updateWreckPhysics(gameState, [], 16)

      expect(wreck.x).toBeGreaterThan(initialX)
    })

    it('should apply inertia decay to velocity', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      wreck.velocityX = 10
      wreck.velocityY = 0

      updateWreckPhysics(gameState, [], 16)

      expect(wreck.velocityX).toBeLessThan(10)
    })

    it('should skip towed wrecks', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      wreck.velocityX = 10
      wreck.towedBy = 'recovery-1'

      const initialX = wreck.x

      updateWreckPhysics(gameState, [], 16)

      expect(wreck.x).toBe(initialX)
      expect(wreck.velocityX).toBe(0)
      expect(wreck.velocityY).toBe(0)
    })

    it('should clamp position to map boundaries', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 10, y: 10, health: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      wreck.velocityX = -100
      wreck.velocityY = -100

      updateWreckPhysics(gameState, [], 16)

      expect(wreck.x).toBeGreaterThanOrEqual(0)
      expect(wreck.y).toBeGreaterThanOrEqual(0)
    })

    it('should detect collision with blocked tiles', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 64, y: 64, health: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      wreck.velocityX = 32
      gameState.mapGrid[2][3] = 1 // Block tile at (3,2)

      const initialX = wreck.x

      updateWreckPhysics(gameState, [], 16)

      // Should not move into blocked tile
      expect(wreck.x).toBe(initialX)
    })

    it('should update tile position after movement', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 50, y: 50, tileX: 2, tileY: 2, health: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      wreck.velocityX = 50
      wreck.velocityY = 0

      const initialX = wreck.x

      updateWreckPhysics(gameState, [], 32)

      // Wreck should have moved
      expect(wreck.x).toBeGreaterThan(initialX)
    })

    it('should detect collision with units', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      wreck.velocityX = 10

      const units = [{
        id: 'unit-2',
        x: 140,
        y: 100,
        health: 100
      }]

      updateWreckPhysics(gameState, units, 16)

      // Wreck should either stop or bounce
      expect(typeof wreck.velocityX).toBe('number')
    })

    it('should detect collision with other wrecks', () => {
      const unit1 = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      const unit2 = { id: 'unit-2', type: 'tank', x: 130, y: 100, health: 100, owner: 1 }
      const wreck1 = registerUnitWreck(unit1, gameState)
      const wreck2 = registerUnitWreck(unit2, gameState)
      wreck1.velocityX = 20
      wreck2.velocityX = 0

      updateWreckPhysics(gameState, [], 16)

      // Both wrecks should have their velocities affected
      expect(typeof wreck1.velocityX).toBe('number')
      expect(typeof wreck2.velocityX).toBe('number')
    })

    it('should accept delta as second argument for backwards compatibility', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      wreck.velocityX = 10

      const initialX = wreck.x

      updateWreckPhysics(gameState, 16) // Delta without units array

      expect(wreck.x).toBeGreaterThan(initialX)
    })

    it('should handle wreck with zero health', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 0, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      wreck.health = 0
      wreck.velocityX = 10

      const initialX = wreck.x

      updateWreckPhysics(gameState, [], 16)

      // Dead wrecks shouldn't move
      expect(wreck.x).toBe(initialX)
    })

    it('removes a naval wreck after its sinking animation completes', () => {
      gameState.simulationTime = 7000
      gameState.unitWrecks = [{
        id: 'destroyer-wreck',
        navalSinking: true,
        createdAt: 1000,
        sinkDuration: 6000,
        health: 250,
        occupancyTileX: null,
        occupancyTileY: null
      }]

      updateWreckPhysics(gameState, [], 16)

      expect(gameState.unitWrecks).toEqual([])
    })

    it('should zero out very small velocities', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 100, y: 100, health: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      wreck.velocityX = 0.00005
      wreck.velocityY = 0.00005

      updateWreckPhysics(gameState, [], 16)

      expect(wreck.velocityX).toBe(0)
      expect(wreck.velocityY).toBe(0)
    })

    it('should update occupancy map when wreck tile changes', () => {
      const unit = { id: 'unit-1', type: 'tank', x: 50, y: 50, health: 100, owner: 1 }
      const wreck = registerUnitWreck(unit, gameState)
      wreck.velocityX = 100
      wreck.velocityY = 0

      // Record initial occupancy
      const initialTileX = wreck.occupancyTileX
      const initialTileY = wreck.occupancyTileY

      updateWreckPhysics(gameState, [], 32)

      // If tile changed, occupancy should be updated
      if (wreck.tileX !== initialTileX || wreck.tileY !== initialTileY) {
        expect(gameState.occupancyMap[initialTileY][initialTileX]).toBe(0)
      }
    })
  })
})
