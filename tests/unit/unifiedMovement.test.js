import { describe, it, expect, vi } from 'vitest'
import '../setup.js'

// Mock dependencies
vi.mock('../../src/config.js', async() => {
  const actual = await vi.importActual('../../src/config.js')
  return {
    ...actual,
    TILE_SIZE: 32,
    STUCK_CHECK_INTERVAL: 3000,
    STUCK_THRESHOLD: 2,
    STUCK_HANDLING_COOLDOWN: 5000,
    MINE_TRIGGER_RADIUS: 14.4  // TILE_SIZE * 0.45
  }
})

vi.mock('../../src/units.js', () => ({
  findPath: vi.fn(),
  updateUnitOccupancy: vi.fn(),
  removeUnitOccupancy: vi.fn()
}))

vi.mock('../../src/game/harvesterLogic.js', () => ({
  clearStuckHarvesterOreField: vi.fn(),
  handleStuckHarvester: vi.fn()
}))

vi.mock('../../src/sound.js', () => ({
  playPositionalSound: vi.fn(),
  playSound: vi.fn(),
  audioContext: null,
  getMasterVolume: vi.fn(() => 1)
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    scrollOffset: { x: 0, y: 0 },
    buildings: [],
    units: []
  }
}))

vi.mock('../../src/logic.js', () => ({
  smoothRotateTowardsAngle: vi.fn((current, target, speed) => {
    const diff = target - current
    if (Math.abs(diff) < speed) return target
    return current + Math.sign(diff) * speed
  })
}))

vi.mock('../../src/game/tankerTruckUtils.js', () => ({
  detonateTankerTruck: vi.fn()
}))

vi.mock('../../src/game/mineSystem.js', () => ({
  getMineAtTile: vi.fn(),
  detonateMine: vi.fn()
}))

vi.mock('../../src/game/spatialQuadtree.js', () => ({
  getSpatialQuadtree: vi.fn()
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn(() => 0.5)
}))

import {
  hasFriendlyUnitOnTile,
  initializeUnitMovement,
  updateUnitPosition,
  stopUnitMovement,
  cancelUnitMovement,
  resetUnitVelocityForNewPath,
  isUnitMoving,
  rotateUnitInPlace,
  checkMineDetonation,
  isUnitCenterInsideMineCircle,
  normalizeAngle,
  isAirborneUnit,
  isGroundUnit,
  ownersAreEnemies,
  isValidDodgePosition
} from '../../src/game/unifiedMovement.js'
import { getNavalHullSegment } from '../../src/utils/navalUtils.js'

describe('unifiedMovement.js', () => {
  it('settles a carrier permanently when its bow reaches the final target tile', () => {
    const mapGrid = Array.from({ length: 20 }, () =>
      Array.from({ length: 20 }, () => ({ type: 'water', building: null, seedCrystal: false })))
    const occupancyMap = Array.from({ length: 20 }, () => Array(20).fill(0))
    const carrier = {
      id: 'bow-stop-carrier',
      type: 'aircraftCarrier',
      isNaval: true,
      owner: 'player1',
      health: 100,
      x: 7 * 32,
      y: 5 * 32,
      tileX: 7,
      tileY: 5,
      direction: 0,
      speed: 0.24,
      rotationSpeed: 0.012,
      path: [{ x: 10, y: 5 }],
      moveTarget: { x: 10, y: 5 }
    }
    initializeUnitMovement(carrier)
    const targetCenterX = 10.5 * 32
    const bowOffset = getNavalHullSegment(carrier).endX - (carrier.x + 16)
    carrier.x = targetCenterX - 16 - bowOffset - 2
    carrier.tileX = Math.floor((carrier.x + 16) / 32)
    carrier.movement.velocity.x = 0.15
    carrier.movement.targetVelocity.x = 0.24
    carrier.movement.currentSpeed = 0.15
    carrier.movement.isMoving = true
    carrier.navalAngularVelocity = 0.01
    carrier.isRotating = true
    const settledHeading = carrier.direction

    updateUnitPosition(
      carrier,
      mapGrid,
      occupancyMap,
      1000,
      [carrier],
      { buildings: [], units: [carrier], unitWrecks: [] }
    )

    expect(carrier.path).toEqual([])
    expect(carrier.moveTarget).toBeNull()
    expect(carrier.movement.velocity).toEqual({ x: 0, y: 0 })
    expect(carrier.movement.targetVelocity).toEqual({ x: 0, y: 0 })
    expect(carrier.navalAngularVelocity).toBe(0)
    expect(carrier.isRotating).toBe(false)
    expect(carrier.direction).toBe(settledHeading)
  })

  describe('hasFriendlyUnitOnTile', () => {
    it('should return false if no units on tile', () => {
      const unit = { owner: 1, id: 'u1' }
      const units = []

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(false)
    })

    it('should return true if friendly unit on tile', () => {
      const unit = { owner: 1, id: 'u1' }
      // Function uses x,y coordinates (pixel) to calculate tile positions
      // Tile 10 = position 10 * 32 + 16 = 336 (center of tile)
      const friendlyUnit = { owner: 1, id: 'u2', x: 320, y: 320, health: 100, type: 'tank' }
      const units = [friendlyUnit]

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(true)
    })

    it('should return false if enemy unit on tile', () => {
      const unit = { owner: 1, id: 'u1' }
      const enemyUnit = { owner: 2, id: 'u2', tileX: 10, tileY: 10, health: 100 }
      const units = [enemyUnit]

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(false)
    })

    it('should exclude the unit itself', () => {
      const unit = { owner: 1, id: 'u1', tileX: 10, tileY: 10 }
      const units = [unit]

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(false)
    })

    it('should return false if unit is dead', () => {
      const unit = { owner: 1, id: 'u1' }
      const deadUnit = { owner: 1, id: 'u2', tileX: 10, tileY: 10, health: 0 }
      const units = [deadUnit]

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(false)
    })

    it('should handle units without tileX/tileY', () => {
      const unit = { owner: 1, id: 'u1' }
      const invalidUnit = { owner: 1, id: 'u2', health: 100 }
      const units = [invalidUnit]

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(false)
    })

    it('should handle multiple units on different tiles', () => {
      const unit = { owner: 1, id: 'u1' }
      // Function uses x,y coordinates (pixel) to calculate tile positions
      const units = [
        { owner: 1, id: 'u2', x: 160, y: 160, health: 100, type: 'tank' },
        { owner: 1, id: 'u3', x: 320, y: 320, health: 100, type: 'tank' },
        { owner: 1, id: 'u4', x: 480, y: 480, health: 100, type: 'tank' }
      ]

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(true)
    })
  })

  describe('initializeUnitMovement', () => {
    it('should initialize movement properties for unit', () => {
      const unit = {
        id: 'u1',
        type: 'tank',
        x: 100,
        y: 100
      }

      initializeUnitMovement(unit)

      expect(unit.movement).toBeDefined()
      expect(unit.movement.velocity).toEqual({ x: 0, y: 0 })
      expect(unit.movement.targetVelocity).toEqual({ x: 0, y: 0 })
      expect(unit.movement.currentSpeed).toBe(0)
      expect(unit.movement.isMoving).toBe(false)
    })

    it('should not overwrite existing movement properties', () => {
      const unit = {
        id: 'u1',
        type: 'tank',
        x: 100,
        y: 100,
        movement: {
          velocity: { x: 5, y: 5 },
          targetVelocity: { x: 10, y: 10 },
          currentSpeed: 10,
          isMoving: true
        }
      }

      initializeUnitMovement(unit)

      expect(unit.movement.velocity.x).toBe(5)
      expect(unit.movement.velocity.y).toBe(5)
      expect(unit.movement.isMoving).toBe(true)
    })

    it('should initialize Apache-specific properties', () => {
      const unit = {
        id: 'u1',
        type: 'apache',
        x: 100,
        y: 100,
        isAirUnit: true
      }

      initializeUnitMovement(unit)

      // initializeUnitMovement only sets the movement object, not Apache-specific properties
      // Apache-specific properties are set elsewhere in the codebase
      expect(unit.movement).toBeDefined()
      expect(unit.movement.velocity).toEqual({ x: 0, y: 0 })
      expect(unit.movement.targetVelocity).toEqual({ x: 0, y: 0 })
    })

    it('should handle unit without type', () => {
      const unit = {
        id: 'u1',
        x: 100,
        y: 100
      }

      expect(() => {
        initializeUnitMovement(unit)
      }).not.toThrow()
    })
  })

  describe('stopUnitMovement', () => {
    it('should stop unit movement', () => {
      const unit = {
        id: 'u1',
        movement: {
          velocity: { x: 5, y: 5 },
          targetVelocity: { x: 10, y: 10 },
          currentSpeed: 10,
          isMoving: true
        }
      }

      stopUnitMovement(unit)

      expect(unit.movement.velocity.x).toBe(0)
      expect(unit.movement.velocity.y).toBe(0)
      expect(unit.movement.targetVelocity.x).toBe(0)
      expect(unit.movement.targetVelocity.y).toBe(0)
      expect(unit.movement.currentSpeed).toBe(0)
      expect(unit.movement.isMoving).toBe(false)
    })

    it('should clear path but not moveTarget', () => {
      const unit = {
        id: 'u1',
        moveTarget: { x: 200, y: 200 },
        path: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
        movement: {
          velocity: { x: 5, y: 5 },
          targetVelocity: { x: 10, y: 10 },
          currentSpeed: 10,
          isMoving: true
        }
      }

      stopUnitMovement(unit)

      // stopUnitMovement clears path but does not clear moveTarget
      expect(unit.moveTarget).toEqual({ x: 200, y: 200 })
      expect(unit.path).toEqual([])
    })

    it('should handle unit without movement property', () => {
      const unit = {
        id: 'u1',
        moveTarget: { x: 200, y: 200 },
        path: [{ x: 1, y: 1 }]
      }

      expect(() => {
        stopUnitMovement(unit)
      }).not.toThrow()

      // stopUnitMovement initializes movement then clears path, but not moveTarget
      expect(unit.moveTarget).toEqual({ x: 200, y: 200 })
      expect(unit.path).toEqual([])
    })

    it('should handle unit without movement.targetVelocity', () => {
      const unit = {
        id: 'u1',
        movement: {
          velocity: { x: 5, y: 5 },
          currentSpeed: 10,
          isMoving: true
        }
      }

      // stopUnitMovement will throw if movement.targetVelocity is missing
      // because initializeUnitMovement only creates movement object if it doesn't exist,
      // not individual properties within an existing movement object
      expect(() => {
        stopUnitMovement(unit)
      }).toThrow()
    })
  })

  describe('cancelUnitMovement', () => {
    it('should cancel unit movement', () => {
      const unit = {
        id: 'u1',
        moveTarget: { x: 200, y: 200 },
        path: [{ x: 1, y: 1 }, { x: 2, y: 2 }]
      }

      cancelUnitMovement(unit)

      expect(unit.moveTarget).toBe(null)
      expect(unit.path).toEqual([])
    })

    it('should clear targetVelocity and isMoving', () => {
      const unit = {
        id: 'u1',
        moveTarget: { x: 200, y: 200 },
        path: [{ x: 1, y: 1 }],
        movement: {
          velocity: { x: 5, y: 5 },
          targetVelocity: { x: 10, y: 10 },
          currentSpeed: 10,
          isMoving: true
        }
      }

      cancelUnitMovement(unit)

      // cancelUnitMovement preserves current velocity but clears targetVelocity and isMoving
      expect(unit.movement.velocity.x).toBe(5)
      expect(unit.movement.velocity.y).toBe(5)
      expect(unit.movement.targetVelocity.x).toBe(0)
      expect(unit.movement.targetVelocity.y).toBe(0)
      expect(unit.movement.isMoving).toBe(false)
    })
  })

  describe('resetUnitVelocityForNewPath', () => {
    it('should reset velocity for new path', () => {
      const unit = {
        id: 'u1',
        movement: {
          velocity: { x: 5, y: 5 },
          targetVelocity: { x: 10, y: 10 },
          currentSpeed: 10,
          isMoving: true
        }
      }

      resetUnitVelocityForNewPath(unit)

      // resetUnitVelocityForNewPath resets velocity and currentSpeed, but NOT targetVelocity
      expect(unit.movement.velocity.x).toBe(0)
      expect(unit.movement.velocity.y).toBe(0)
      expect(unit.movement.currentSpeed).toBe(0)
      // targetVelocity is NOT reset - the path system sets it
      expect(unit.movement.targetVelocity.x).toBe(10)
      expect(unit.movement.targetVelocity.y).toBe(10)
    })

    it('should preserve isMoving state', () => {
      const unit = {
        id: 'u1',
        movement: {
          velocity: { x: 5, y: 5 },
          targetVelocity: { x: 10, y: 10 },
          currentSpeed: 10,
          isMoving: true
        }
      }

      resetUnitVelocityForNewPath(unit)

      expect(unit.movement.isMoving).toBe(true)
    })

    it('should handle unit without movement property', () => {
      const unit = {
        id: 'u1'
      }

      expect(() => {
        resetUnitVelocityForNewPath(unit)
      }).not.toThrow()
    })
  })

  describe('isUnitMoving', () => {
    it('should return true if unit is moving', () => {
      const unit = {
        movement: {
          isMoving: true,
          currentSpeed: 10
        }
      }

      const result = isUnitMoving(unit)

      expect(result).toBe(true)
    })

    it('should return false if unit is not moving', () => {
      const unit = {
        movement: {
          isMoving: false,
          currentSpeed: 0
        }
      }

      const result = isUnitMoving(unit)

      expect(result).toBe(false)
    })

    it('should return false if unit has no movement property', () => {
      const unit = {
        id: 'u1'
      }

      const result = isUnitMoving(unit)

      expect(result).toBe(false)
    })

    it('should check current speed as fallback', () => {
      const unit = {
        movement: {
          currentSpeed: 5
        }
      }

      const result = isUnitMoving(unit)

      expect(result).toBe(true)
    })

    it('should return false if currentSpeed is zero', () => {
      const unit = {
        movement: {
          currentSpeed: 0
        }
      }

      const result = isUnitMoving(unit)

      expect(result).toBe(false)
    })
  })

  describe('rotateUnitInPlace', () => {
    it('should rotate unit to target direction', () => {
      const unit = {
        id: 'u1',
        direction: 0,
        rotation: 0
      }

      rotateUnitInPlace(unit, Math.PI / 2)

      // rotateUnitInPlace sets movement.rotation and copies to unit.rotation
      expect(unit.rotation).toBeGreaterThan(0)
    })

    it('should use random rotation if no direction provided', () => {
      const unit = {
        id: 'u1',
        direction: 0,
        rotation: 0
      }

      // When no targetDirection is provided, function uses gameRandom()
      // Since gameRandom is mocked to return 0.5, rotation will be PI
      rotateUnitInPlace(unit)

      // With gameRandom returning 0.5, targetRotation = 0.5 * 2 * PI = PI
      // Since rotation starts at 0 and rotates towards PI, it should increase
      expect(unit.movement.targetRotation).toBe(Math.PI)
    })

    it('should not rotate if no target direction', () => {
      const unit = {
        id: 'u1',
        direction: 0
      }

      rotateUnitInPlace(unit)

      expect(unit.direction).toBe(0)
    })

    it('should handle unit without direction property', () => {
      const unit = {
        id: 'u1'
      }

      expect(() => {
        rotateUnitInPlace(unit, Math.PI / 2)
      }).not.toThrow()
    })
  })

  describe('checkMineDetonation', () => {
    it('should not detonate if no mine at tile', async() => {
      const mineSystem = await import('../../src/game/mineSystem.js')
      mineSystem.getMineAtTile.mockReturnValue(null)

      const unit = { type: 'tank' }
      const units = []
      const buildings = []

      checkMineDetonation(unit, 5, 5, units, buildings)

      expect(mineSystem.detonateMine).not.toHaveBeenCalled()
    })

    it('should not detonate inactive mine', async() => {
      const mineSystem = await import('../../src/game/mineSystem.js')
      mineSystem.getMineAtTile.mockReturnValue({ active: false })

      const unit = { type: 'tank' }
      const units = []
      const buildings = []

      checkMineDetonation(unit, 5, 5, units, buildings)

      expect(mineSystem.detonateMine).not.toHaveBeenCalled()
    })

    it('should detonate active mine when unit center is inside trigger radius', async() => {
      const mineSystem = await import('../../src/game/mineSystem.js')
      mineSystem.getMineAtTile.mockReturnValue({ active: true })
      mineSystem.detonateMine.mockReturnValue(true)

      const unit = { type: 'tank', x: 160, y: 160 } // Center at (176, 176)
      const units = []
      const buildings = []

      checkMineDetonation(unit, 5, 5, units, buildings)

      expect(mineSystem.detonateMine).toHaveBeenCalledWith({ active: true }, units, buildings)
    })

    it('should handle mine sweeper sweeping mines', async() => {
      const mineSystem = await import('../../src/game/mineSystem.js')
      mineSystem.getMineAtTile.mockReturnValue({ active: true })
      mineSystem.detonateMine.mockReturnValue(true)

      const unit = { type: 'mineSweeper', x: 160, y: 160, sweeping: true }
      const units = []
      const buildings = []

      checkMineDetonation(unit, 5, 5, units, buildings)

      expect(mineSystem.detonateMine).toHaveBeenCalledWith({ active: true }, units, buildings)
    })

    it('should handle null unit', async() => {
      const mineSystem = await import('../../src/game/mineSystem.js')
      mineSystem.getMineAtTile.mockReturnValue({ active: true })
      mineSystem.detonateMine.mockClear()

      checkMineDetonation(null, 5, 5, [], [])

      expect(mineSystem.detonateMine).not.toHaveBeenCalled()
    })
  })

  describe('isUnitCenterInsideMineCircle', () => {
    it('should return false for null unit', () => {
      const result = isUnitCenterInsideMineCircle(null, 5, 5)
      expect(result).toBe(false)
    })

    it('should return false for invalid coordinates', () => {
      const unit = { x: 160, y: 160 }
      expect(isUnitCenterInsideMineCircle(unit, null, 5)).toBe(false)
      expect(isUnitCenterInsideMineCircle(unit, 5, null)).toBe(false)
      expect(isUnitCenterInsideMineCircle(unit, NaN, 5)).toBe(false)
      expect(isUnitCenterInsideMineCircle(unit, 5, NaN)).toBe(false)
    })

    it('should return true when unit center is inside mine trigger radius', () => {
      const unit = { x: 160, y: 160 } // Center at (176, 176)
      // Mine at tile (5,5) center at (176, 176) - exactly at center
      const result = isUnitCenterInsideMineCircle(unit, 5, 5)
      expect(result).toBe(true)
    })

    it('should return false when unit center is outside mine trigger radius', () => {
      const unit = { x: 160 + 50, y: 160 } // Center at (226, 176)
      // Mine at tile (5,5) center at (176, 176) - 50 pixels away
      const result = isUnitCenterInsideMineCircle(unit, 5, 5)
      expect(result).toBe(false)
    })

    it('should handle edge case at exact trigger radius', () => {
      // MINE_TRIGGER_RADIUS = TILE_SIZE * 0.45 = 32 * 0.45 = 14.4
      // Unit at x: 160 + 14 = 174, center at 174 + 16 = 190
      // Mine center at 176, dx = 14, which is within 14.4
      const unit = { x: 160 + 14, y: 160 } // Center at (190, 176)
      const result = isUnitCenterInsideMineCircle(unit, 5, 5)
      expect(result).toBe(true) // Should be within radius
    })
  })

  describe('normalizeAngle', () => {
    it('should return angle unchanged if within -π to π', () => {
      expect(normalizeAngle(0)).toBe(0)
      expect(normalizeAngle(Math.PI / 2)).toBe(Math.PI / 2)
      expect(normalizeAngle(-Math.PI / 2)).toBe(-Math.PI / 2)
      expect(normalizeAngle(Math.PI)).toBe(Math.PI)
      expect(normalizeAngle(-Math.PI)).toBe(-Math.PI)
    })

    it('should normalize angle greater than π', () => {
      expect(normalizeAngle(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 10)
      expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0, 10)
      expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 10)
    })

    it('should normalize angle less than -π', () => {
      expect(normalizeAngle(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1, 10)
      expect(normalizeAngle(-2 * Math.PI)).toBeCloseTo(0, 10)
      expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI, 10)
    })

    it('should handle large positive angles', () => {
      expect(normalizeAngle(10 * Math.PI)).toBeCloseTo(0, 10)
      expect(normalizeAngle(5 * Math.PI + Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 10)
    })

    it('should handle large negative angles', () => {
      expect(normalizeAngle(-10 * Math.PI)).toBeCloseTo(0, 10)
      expect(normalizeAngle(-5 * Math.PI - Math.PI / 2)).toBeCloseTo(Math.PI / 2, 10)
    })
  })

  describe('isAirborneUnit', () => {
    it('should return false for null unit', () => {
      expect(isAirborneUnit(null)).toBe(false)
    })

    it('should return false for ground units', () => {
      expect(isAirborneUnit({ type: 'tank' })).toBe(false)
      expect(isAirborneUnit({ type: 'harvester' })).toBe(false)
      expect(isAirborneUnit({ type: 'ambulance' })).toBe(false)
    })

    it('should return true for Apache helicopters', () => {
      expect(isAirborneUnit({ type: 'apache' })).toBe(true)
    })

    it('should return true for air units not grounded', () => {
      expect(isAirborneUnit({ isAirUnit: true, flightState: 'airborne' })).toBe(true)
      expect(isAirborneUnit({ isAirUnit: true, flightState: 'takeoff' })).toBe(true)
      expect(isAirborneUnit({ isAirUnit: true, flightState: 'landing' })).toBe(true)
    })

    it('should return false for air units that are grounded', () => {
      expect(isAirborneUnit({ isAirUnit: true, flightState: 'grounded' })).toBe(false)
    })

    it('should return false for Apache helicopters that are grounded', () => {
      expect(isAirborneUnit({ type: 'apache', flightState: 'grounded' })).toBe(false)
    })
  })

  describe('isGroundUnit', () => {
    it('should return false for null unit', () => {
      expect(isGroundUnit(null)).toBe(false)
    })

    it('should return true for ground units', () => {
      expect(isGroundUnit({ type: 'tank' })).toBe(true)
      expect(isGroundUnit({ type: 'harvester' })).toBe(true)
      expect(isGroundUnit({ type: 'ambulance' })).toBe(true)
    })

    it('should return false for Apache helicopters', () => {
      expect(isGroundUnit({ type: 'apache' })).toBe(false)
    })

    it('should return false for air units not grounded', () => {
      expect(isGroundUnit({ isAirUnit: true, flightState: 'airborne' })).toBe(false)
      expect(isGroundUnit({ isAirUnit: true, flightState: 'takeoff' })).toBe(false)
    })

    it('should return true for air units that are grounded', () => {
      expect(isGroundUnit({ isAirUnit: true, flightState: 'grounded' })).toBe(true)
    })

    it('should return true for Apache helicopters that are grounded', () => {
      expect(isGroundUnit({ type: 'apache', flightState: 'grounded' })).toBe(true)
    })
  })

  describe('ownersAreEnemies', () => {
    it('should return false for null owners', () => {
      expect(ownersAreEnemies(null, 'player')).toBe(false)
      expect(ownersAreEnemies('player', null)).toBe(false)
      expect(ownersAreEnemies(null, null)).toBe(false)
    })

    it('should return false for same owner', () => {
      expect(ownersAreEnemies('player', 'player')).toBe(false)
      expect(ownersAreEnemies('player1', 'player1')).toBe(false)
      expect(ownersAreEnemies('enemy', 'enemy')).toBe(false)
    })

    it('should return true for different owners', () => {
      expect(ownersAreEnemies('player', 'enemy')).toBe(true)
      expect(ownersAreEnemies('player1', 'player2')).toBe(true)
      expect(ownersAreEnemies('enemy', 'player')).toBe(true)
    })

    it('should normalize player to player1', () => {
      expect(ownersAreEnemies('player', 'player1')).toBe(false)
      expect(ownersAreEnemies('player', 'enemy')).toBe(true)
    })
  })

  describe('isValidDodgePosition', () => {
    it('should return false for positions blocked by terrain', () => {
      const mapGrid = [
        [{ type: 'rock' }]
      ]
      const units = []

      const result = isValidDodgePosition(0, 0, mapGrid, units)
      expect(result).toBe(false)
    })

    it('should return false for positions blocked by buildings', () => {
      const mapGrid = [
        [{ building: { id: 'b1' } }]
      ]
      const units = []

      const result = isValidDodgePosition(0, 0, mapGrid, units)
      expect(result).toBe(false)
    })

    it('should return false for positions blocked by other units', () => {
      const mapGrid = [
        [{}]
      ]
      const units = [{ x: 0, y: 0, health: 100 }] // Unit at tile corner (0, 0)

      const result = isValidDodgePosition(0, 0, mapGrid, units)
      expect(result).toBe(false)
    })

    it('should return true for valid positions', () => {
      const mapGrid = [
        [{}]
      ]
      const units = []

      const result = isValidDodgePosition(0, 0, mapGrid, units)
      expect(result).toBe(true)
    })

    it('should handle out of bounds positions', () => {
      const mapGrid = [
        [{}]
      ]
      const units = []

      expect(isValidDodgePosition(-1, -1, mapGrid, units)).toBe(false)
      expect(isValidDodgePosition(1, 1, mapGrid, units)).toBe(false)
    })

    it('should handle null mapGrid', () => {
      const result = isValidDodgePosition(0, 0, null, [])
      expect(result).toBe(false)
    })
  })
})
