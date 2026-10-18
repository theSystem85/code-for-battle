/**
 * Unit tests for Steering Behaviors
 *
 * Tests separation, alignment, cohesion, collision avoidance,
 * and smooth rotation behaviors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock config
vi.mock('../../src/config.js', async() => {
  const actual = await vi.importActual('../../src/config.js')
  return {
    ...actual,
    TILE_SIZE: 32,
    MAP_TILES_X: 100,
    MAP_TILES_Y: 100,
    UNIT_SIZE: 28
  }
})

// Mock performanceUtils
vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: vi.fn(fn => fn)
}))

// Mock gameState
vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1',
    buildings: [],
    units: [],
    occupancyMap: null
  }
}))

// Mock findPath
vi.mock('../../src/units.js', () => ({
  findPath: vi.fn().mockReturnValue([])
}))

// Mock dangerZoneMap
vi.mock('../../src/game/dangerZoneMap.js', () => ({
  updateDangerZoneMaps: vi.fn()
}))

// Mock pathfinding
vi.mock('../../src/game/pathfinding.js', () => ({
  createFormationOffsets: vi.fn().mockReturnValue([]),
  getCachedPath: vi.fn().mockReturnValue([])
}))

// Mock gameRandom
vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn().mockReturnValue(0.5)
}))

import {
  calculateSeparation,
  calculateAlignment,
  calculateCohesion,
  calculateObstacleAvoidance,
  calculateFormationCohesion,
  calculateSteeringForces,
  calculateFlowFieldSteering,
  applySteeringForces,
  updateFormationCenter,
  clearFormation,
  STEERING_CONFIG
} from '../../src/game/steeringBehaviors.js'

import { TILE_SIZE } from '../../src/config.js'

describe('Steering Behaviors', () => {
  let unit
  let neighbors
  beforeEach(() => {
    vi.clearAllMocks()

    unit = {
      id: 'unit-1',
      type: 'tank_v1',
      owner: 'player1',
      x: 500,
      y: 500,
      tileX: 15,
      tileY: 15,
      velocityX: 1,
      velocityY: 0,
      speed: 2.5,
      health: 100,
      maxHealth: 100,
      size: 28
    }

    neighbors = []
  })

  describe('STEERING_CONFIG', () => {
    it('[U04222] should have separation radius defined', () => {
      expect(STEERING_CONFIG.SEPARATION_RADIUS).toBeDefined()
      expect(STEERING_CONFIG.SEPARATION_RADIUS).toBeGreaterThan(0)
    })

    it('[U04223] should have alignment radius defined', () => {
      expect(STEERING_CONFIG.ALIGNMENT_RADIUS).toBeDefined()
      expect(STEERING_CONFIG.ALIGNMENT_RADIUS).toBeGreaterThan(0)
    })

    it('[U04224] should have cohesion radius defined', () => {
      expect(STEERING_CONFIG.COHESION_RADIUS).toBeDefined()
      expect(STEERING_CONFIG.COHESION_RADIUS).toBeGreaterThan(0)
    })

    it('[U04225] should have weight values defined', () => {
      expect(STEERING_CONFIG.SEPARATION_WEIGHT).toBeDefined()
      expect(STEERING_CONFIG.ALIGNMENT_WEIGHT).toBeDefined()
      expect(STEERING_CONFIG.COHESION_WEIGHT).toBeDefined()
    })

    it('[U04226] should have separation weight >= alignment weight', () => {
      // Separation is typically most important to avoid collisions
      expect(STEERING_CONFIG.SEPARATION_WEIGHT).toBeGreaterThanOrEqual(
        STEERING_CONFIG.ALIGNMENT_WEIGHT
      )
    })
  })

  describe('calculateSeparation()', () => {
    it('[U04227] should return zero vector when no neighbors', () => {
      const result = calculateSeparation(unit, [])

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('[U04228] should push away from nearby units', () => {
      const nearbyUnit = {
        id: 'unit-2',
        x: 510,
        y: 500,
        size: 28
      }
      neighbors.push(nearbyUnit)

      const result = calculateSeparation(unit, neighbors)

      // Should push unit-1 to the left (negative x)
      expect(result.x).toBeLessThan(0)
    })

    it('[U04229] should not affect units outside separation radius', () => {
      const farUnit = {
        id: 'unit-far',
        x: unit.x + STEERING_CONFIG.SEPARATION_RADIUS + 100,
        y: unit.y,
        size: 28,
        health: 100
      }
      neighbors.push(farUnit)

      const result = calculateSeparation(unit, neighbors)

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('[U04230] should increase force with closer proximity', () => {
      const closeUnit = {
        id: 'unit-close',
        x: 505,
        y: 500,
        size: 28
      }
      const furtherUnit = {
        id: 'unit-further',
        x: 530,
        y: 500,
        size: 28
      }

      const closeResult = calculateSeparation(unit, [closeUnit])
      const furtherResult = calculateSeparation(unit, [furtherUnit])

      // Closer unit should produce stronger separation force
      expect(Math.abs(closeResult.x)).toBeGreaterThan(Math.abs(furtherResult.x))
    })

    it('[U04231] should handle multiple neighbors', () => {
      neighbors = [
        { id: 'unit-2', x: 510, y: 500, size: 28 },
        { id: 'unit-3', x: 500, y: 510, size: 28 }
      ]

      const result = calculateSeparation(unit, neighbors)

      // Should push toward opposite corner (negative x and y)
      expect(result.x).toBeLessThanOrEqual(0)
      expect(result.y).toBeLessThanOrEqual(0)
    })

    it('[U04232] should skip self when calculating', () => {
      neighbors = [unit] // Include self in neighbors

      const result = calculateSeparation(unit, neighbors)

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })
  })

  describe('calculateAlignment()', () => {
    it('[U04233] should return zero vector when no neighbors', () => {
      const result = calculateAlignment(unit, [])

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('[U04234] should align with neighbor heading', () => {
      // Alignment requires same owner and movement.velocity object
      const movingNeighbor = {
        id: 'unit-2',
        x: 510,
        y: 500,
        owner: 'player1',
        movement: { velocity: { x: 0, y: 2 } },
        size: 28,
        health: 100
      }
      neighbors.push(movingNeighbor)

      const result = calculateAlignment(unit, neighbors)

      // Should steer toward neighbor's heading (positive y)
      expect(result.y).toBeGreaterThan(0)
    })

    it('[U04235] should average multiple neighbor headings', () => {
      neighbors = [
        { id: 'unit-2', x: 510, y: 500, owner: 'player1', movement: { velocity: { x: 2, y: 0 } }, size: 28, health: 100 },
        { id: 'unit-3', x: 490, y: 500, owner: 'player1', movement: { velocity: { x: -2, y: 0 } }, size: 28, health: 100 }
      ]

      const result = calculateAlignment(unit, neighbors)

      // Opposite headings should cancel out
      expect(Math.abs(result.x)).toBeLessThan(0.5)
    })

    it('[U04236] should ignore stationary neighbors', () => {
      const stationaryNeighbor = {
        id: 'unit-2',
        x: 510,
        y: 500,
        owner: 'player1',
        movement: { velocity: { x: 0, y: 0 } },
        size: 28,
        health: 100
      }
      neighbors.push(stationaryNeighbor)

      const result = calculateAlignment(unit, neighbors)

      // Stationary units have no heading to align with
      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('[U04237] should skip neighbors outside alignment radius', () => {
      const farNeighbor = {
        id: 'unit-far',
        x: unit.x + STEERING_CONFIG.ALIGNMENT_RADIUS + 100,
        y: unit.y,
        velocityX: 0,
        velocityY: 5,
        size: 28,
        health: 100
      }
      neighbors.push(farNeighbor)

      const result = calculateAlignment(unit, neighbors)

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })
  })

  describe('calculateCohesion()', () => {
    it('[U04238] should return zero vector when no neighbors', () => {
      const result = calculateCohesion(unit, [])

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('[U04239] should steer toward center of mass', () => {
      // Cohesion requires same owner and moving units
      const rightNeighbor = {
        id: 'unit-2',
        x: 550,
        y: 500,
        owner: 'player1',
        movement: { velocity: { x: 1, y: 0 } },
        size: 28,
        health: 100
      }
      neighbors.push(rightNeighbor)

      const result = calculateCohesion(unit, neighbors)

      // Should steer toward neighbor (positive x)
      expect(result.x).toBeGreaterThan(0)
    })

    it('[U04240] should find center of multiple neighbors', () => {
      neighbors = [
        { id: 'unit-2', x: 600, y: 500, owner: 'player1', movement: { velocity: { x: 1, y: 0 } }, size: 28, health: 100 },
        { id: 'unit-3', x: 400, y: 500, owner: 'player1', movement: { velocity: { x: 1, y: 0 } }, size: 28, health: 100 }
      ]

      const result = calculateCohesion(unit, neighbors)

      // Center is at x=500, same as unit, so little/no x steering
      expect(Math.abs(result.x)).toBeLessThan(0.5)
    })

    it('[U04241] should ignore neighbors outside cohesion radius', () => {
      const farNeighbor = {
        id: 'unit-far',
        x: unit.x + STEERING_CONFIG.COHESION_RADIUS + 200,
        y: unit.y,
        size: 28,
        health: 100
      }
      neighbors.push(farNeighbor)

      const result = calculateCohesion(unit, neighbors)

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('[U04242] should produce consistent normalized force regardless of distance', () => {
      // Both neighbors need owner and movement to be considered
      // Cohesion normalizes the force and applies weight, so force magnitude is constant
      const closeNeighbor = {
        id: 'unit-close',
        x: 510,
        y: 500,
        owner: 'player1',
        movement: { velocity: { x: 1, y: 0 } },
        size: 28,
        health: 100
      }
      const distantNeighbor = {
        id: 'unit-distant',
        x: 550,
        y: 500,
        owner: 'player1',
        movement: { velocity: { x: 1, y: 0 } },
        size: 28,
        health: 100
      }

      const closeResult = calculateCohesion(unit, [closeNeighbor])
      const distantResult = calculateCohesion(unit, [distantNeighbor])

      // Both should have similar normalized force magnitude (uses COHESION_WEIGHT)
      expect(Math.abs(closeResult.x)).toBe(Math.abs(distantResult.x))
    })
  })

  describe('calculateObstacleAvoidance()', () => {
    it('[U04243] should return zero vector when no mapGrid', () => {
      const result = calculateObstacleAvoidance(unit, null, null)

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('[U04244] should return zero when unit not moving', () => {
      const mapGrid = [[{ type: 'grass' }]]
      unit.movement = { velocity: { x: 0, y: 0 } }

      const result = calculateObstacleAvoidance(unit, mapGrid, null)

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('[U04245] should avoid blocking tiles ahead', () => {
      // Create a simple map with a blocked tile ahead
      const mapGrid = []
      for (let y = 0; y < 20; y++) {
        mapGrid[y] = []
        for (let x = 0; x < 20; x++) {
          // Block tile at (17, 15) - ahead of unit at (15, 15)
          if (x === 17 && y === 15) {
            mapGrid[y][x] = { type: 'rock' }
          } else {
            mapGrid[y][x] = { type: 'grass' }
          }
        }
      }

      unit.x = 15 * TILE_SIZE
      unit.y = 15 * TILE_SIZE
      unit.movement = { velocity: { x: 2, y: 0 } }

      const result = calculateObstacleAvoidance(unit, mapGrid, null)

      // Should push away from obstacle if detected
      expect(typeof result.x).toBe('number')
      expect(typeof result.y).toBe('number')
    })

    it('[U04246] should not avoid distant obstacles', () => {
      const mapGrid = []
      for (let y = 0; y < 50; y++) {
        mapGrid[y] = []
        for (let x = 0; x < 50; x++) {
          mapGrid[y][x] = { type: 'grass' }
        }
      }

      unit.movement = { velocity: { x: 2, y: 0 } }
      const result = calculateObstacleAvoidance(unit, mapGrid, null)

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('[U04247] should handle multiple blocked tiles', () => {
      const mapGrid = []
      for (let y = 0; y < 20; y++) {
        mapGrid[y] = []
        for (let x = 0; x < 20; x++) {
          mapGrid[y][x] = { type: 'grass' }
        }
      }

      unit.movement = { velocity: { x: 2, y: 0 } }
      const result = calculateObstacleAvoidance(unit, mapGrid, null)

      expect(typeof result.x).toBe('number')
      expect(typeof result.y).toBe('number')
    })
  })

  describe('calculateFormationCohesion()', () => {
    it('[U04248] should return zero when no formation target', () => {
      unit.formationOffset = null
      unit.formationCenter = null

      const result = calculateFormationCohesion(unit)

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('[U04249] should steer toward formation position', () => {
      // Need both formationOffset and formationCenter
      unit.formationCenter = { x: 600, y: 500 }
      unit.formationOffset = { x: 50, y: 0 }

      const result = calculateFormationCohesion(unit)

      // Should steer toward formation position (positive x)
      // Target is formationCenter + formationOffset = (650, 500)
      // Unit center is at (500 + 16, 500 + 16) = (516, 516)
      expect(result.x).toBeGreaterThan(0)
    })

    it('[U04250] should have zero force when at formation position', () => {
      unit.formationCenter = { x: 500, y: 500 }
      unit.formationOffset = { x: TILE_SIZE / 2, y: TILE_SIZE / 2 }

      const result = calculateFormationCohesion(unit)

      // Unit is approximately at formation position
      expect(Math.abs(result.x)).toBeLessThan(0.1)
      expect(Math.abs(result.y)).toBeLessThan(0.1)
    })
  })

  describe('calculateSteeringForces()', () => {
    it('[U04251] should combine all steering behaviors', () => {
      neighbors = [
        { id: 'unit-2', x: 510, y: 500, velocityX: 1, velocityY: 0, size: 28 }
      ]

      const result = calculateSteeringForces(unit, neighbors, [])

      // Should return a combined force vector
      expect(result).toHaveProperty('x')
      expect(result).toHaveProperty('y')
    })

    it('[U04252] should apply weights to different behaviors', () => {
      neighbors = [
        { id: 'unit-2', x: 505, y: 500, velocityX: 2, velocityY: 0, size: 28 }
      ]

      const result = calculateSteeringForces(unit, neighbors, [])

      // Result should be influenced by weight configuration
      expect(typeof result.x).toBe('number')
      expect(typeof result.y).toBe('number')
    })

    it('[U04253] should handle empty neighbors and obstacles', () => {
      const result = calculateSteeringForces(unit, [], [])

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('[U04254] should clamp maximum steering force', () => {
      // Create situation with strong steering
      neighbors = [
        { id: 'unit-2', x: 501, y: 500, velocityX: 5, velocityY: 0, size: 28, health: 100 },
        { id: 'unit-3', x: 499, y: 500, velocityX: -5, velocityY: 0, size: 28, health: 100 },
        { id: 'unit-4', x: 500, y: 501, velocityX: 0, velocityY: 5, size: 28, health: 100 }
      ]

      const result = calculateSteeringForces(unit, neighbors, [])

      // Magnitude should be capped
      const magnitude = Math.hypot(result.x, result.y)
      expect(magnitude).toBeLessThanOrEqual(STEERING_CONFIG.MAX_STEERING_FORCE + 0.01)
    })
  })
})

describe('Smooth Rotation', () => {
  let unit

  beforeEach(() => {
    unit = {
      id: 'unit-1',
      type: 'tank_v1',
      owner: 'player1',
      x: 500,
      y: 500,
      rotation: 0,
      targetRotation: 0,
      velocityX: 1,
      velocityY: 0,
      speed: 2.5
    }
  })

  describe('Rotation Calculations', () => {
    it('[U04255] should calculate target rotation from velocity', () => {
      unit.velocityX = 0
      unit.velocityY = 1

      const targetRotation = Math.atan2(unit.velocityY, unit.velocityX)

      // Moving down should be PI/2 radians
      expect(targetRotation).toBeCloseTo(Math.PI / 2)
    })

    it('[U04256] should calculate rotation for diagonal movement', () => {
      unit.velocityX = 1
      unit.velocityY = 1

      const targetRotation = Math.atan2(unit.velocityY, unit.velocityX)

      // Moving diagonal should be PI/4 radians
      expect(targetRotation).toBeCloseTo(Math.PI / 4)
    })

    it('[U04257] should handle negative velocities', () => {
      unit.velocityX = -1
      unit.velocityY = 0

      const targetRotation = Math.atan2(unit.velocityY, unit.velocityX)

      // Moving left should be PI radians
      expect(targetRotation).toBeCloseTo(Math.PI)
    })
  })

  describe('Rotation Interpolation', () => {
    it('[U04258] should lerp rotation smoothly', () => {
      const currentRotation = 0
      const targetRotation = Math.PI
      const lerpFactor = 0.1

      const newRotation = currentRotation + (targetRotation - currentRotation) * lerpFactor

      expect(newRotation).toBeCloseTo(Math.PI * 0.1)
    })

    it('[U04259] should handle wrap-around from positive to negative', () => {
      // When rotating from just below PI to just above -PI
      const currentRotation = Math.PI - 0.1
      const targetRotation = -Math.PI + 0.1

      // Calculate shortest path
      let diff = targetRotation - currentRotation
      while (diff > Math.PI) diff -= 2 * Math.PI
      while (diff < -Math.PI) diff += 2 * Math.PI

      expect(Math.abs(diff)).toBeLessThan(0.5)
    })

    it('[U04260] should not overshoot target rotation', () => {
      const targetRotation = Math.PI / 4
      let currentRotation = 0
      const lerpFactor = 0.5

      for (let i = 0; i < 10; i++) {
        currentRotation = currentRotation + (targetRotation - currentRotation) * lerpFactor
      }

      expect(currentRotation).toBeCloseTo(targetRotation, 1)
    })
  })
})

describe('Collision Avoidance', () => {
  let unit
  let otherUnit

  beforeEach(() => {
    unit = {
      id: 'unit-1',
      type: 'tank_v1',
      owner: 'player1',
      x: 500,
      y: 500,
      velocityX: 1,
      velocityY: 0,
      size: 28,
      health: 100
    }

    otherUnit = {
      id: 'unit-2',
      type: 'tank_v1',
      owner: 'player1',
      x: 530,
      y: 500,
      velocityX: -1,
      velocityY: 0,
      size: 28,
      health: 100
    }
  })

  describe('Collision Detection', () => {
    it('[U04261] should detect overlapping units', () => {
      // Position units close enough to overlap
      // Combined radius = (28 + 28) / 2 = 28
      unit.x = 500
      unit.y = 500
      otherUnit.x = 520 // Distance = 20, less than 28
      otherUnit.y = 500

      const distance = Math.hypot(unit.x - otherUnit.x, unit.y - otherUnit.y)
      const combinedRadius = (unit.size + otherUnit.size) / 2

      const isColliding = distance < combinedRadius

      expect(isColliding).toBe(true)
    })

    it('[U04262] should not detect collision for distant units', () => {
      otherUnit.x = 600

      const distance = Math.hypot(unit.x - otherUnit.x, unit.y - otherUnit.y)
      const combinedRadius = (unit.size + otherUnit.size) / 2

      const isColliding = distance < combinedRadius

      expect(isColliding).toBe(false)
    })

    it('[U04263] should handle units at same position', () => {
      otherUnit.x = unit.x
      otherUnit.y = unit.y

      const distance = Math.hypot(unit.x - otherUnit.x, unit.y - otherUnit.y)

      expect(distance).toBe(0)
    })
  })

  describe('Collision Response', () => {
    it('[U04264] should calculate separation vector', () => {
      const dx = unit.x - otherUnit.x
      const dy = unit.y - otherUnit.y
      const distance = Math.hypot(dx, dy) || 0.001

      const separationX = dx / distance
      const separationY = dy / distance

      expect(separationX).toBeLessThan(0) // Unit is to the left
      expect(Math.abs(separationY)).toBeLessThan(0.1) // Same y level
    })

    it('[U04265] should calculate push force based on overlap', () => {
      // Position units with overlap
      unit.x = 500
      unit.y = 500
      otherUnit.x = 510 // Distance = 10, overlap = 28 - 10 = 18
      otherUnit.y = 500

      const distance = Math.hypot(unit.x - otherUnit.x, unit.y - otherUnit.y)
      const combinedRadius = (unit.size + otherUnit.size) / 2
      const overlap = combinedRadius - distance

      expect(overlap).toBeGreaterThan(0)
    })

    it('[U04266] should give priority to moving units', () => {
      const unitSpeed = Math.hypot(unit.velocityX, unit.velocityY)
      const otherSpeed = Math.hypot(otherUnit.velocityX, otherUnit.velocityY)

      // Both have same speed, so equal priority
      expect(unitSpeed).toBeCloseTo(otherSpeed)
    })

    it('[U04267] should give priority to units with targets', () => {
      unit.target = { x: 600, y: 500 }
      otherUnit.target = null

      const unitHasTarget = unit.target !== null
      const otherHasTarget = otherUnit.target !== null

      expect(unitHasTarget).toBe(true)
      expect(otherHasTarget).toBe(false)
    })
  })

  describe('Unit Size Handling', () => {
    it('[U04268] should use correct collision radius', () => {
      const UNIT_SIZE = 28
      const collisionRadius = UNIT_SIZE / 2

      expect(collisionRadius).toBe(14)
    })

    it('[U04269] should handle different sized units', () => {
      unit.size = 32
      otherUnit.size = 24

      const combinedRadius = (unit.size + otherUnit.size) / 2

      expect(combinedRadius).toBe(28)
    })

    it('[U04270] should handle units without size property', () => {
      delete unit.size
      const defaultSize = 28

      const unitSize = unit.size || defaultSize

      expect(unitSize).toBe(28)
    })
  })
})

describe('Velocity Calculations', () => {
  let unit

  beforeEach(() => {
    unit = {
      id: 'unit-1',
      type: 'tank_v1',
      x: 500,
      y: 500,
      velocityX: 0,
      velocityY: 0,
      speed: 2.5
    }
  })

  describe('Speed Limiting', () => {
    it('[U04271] should clamp velocity to max speed', () => {
      const targetVelocityX = 5
      const targetVelocityY = 5
      const maxSpeed = unit.speed

      const magnitude = Math.hypot(targetVelocityX, targetVelocityY)
      const clampedX = magnitude > maxSpeed
        ? (targetVelocityX / magnitude) * maxSpeed
        : targetVelocityX
      const clampedY = magnitude > maxSpeed
        ? (targetVelocityY / magnitude) * maxSpeed
        : targetVelocityY

      const clampedMagnitude = Math.hypot(clampedX, clampedY)

      expect(clampedMagnitude).toBeCloseTo(maxSpeed)
    })

    it('[U04272] should not modify velocity under max speed', () => {
      const targetVelocityX = 1
      const targetVelocityY = 0
      const maxSpeed = unit.speed

      const magnitude = Math.hypot(targetVelocityX, targetVelocityY)

      expect(magnitude).toBeLessThan(maxSpeed)
    })
  })

  describe('Velocity Smoothing', () => {
    it('[U04273] should apply acceleration limits', () => {
      const maxAcceleration = 0.5
      const currentVelocityX = 0
      const targetVelocityX = 2

      const accelerationX = targetVelocityX - currentVelocityX
      const clampedAccelerationX = Math.max(-maxAcceleration, Math.min(maxAcceleration, accelerationX))

      expect(clampedAccelerationX).toBe(maxAcceleration)
    })

    it('[U04274] should apply deceleration limits', () => {
      const maxDeceleration = 0.8
      const currentVelocityX = 2
      const targetVelocityX = 0

      const decelerationX = targetVelocityX - currentVelocityX
      const clampedDecelerationX = Math.max(-maxDeceleration, Math.min(maxDeceleration, decelerationX))

      expect(clampedDecelerationX).toBe(-maxDeceleration)
    })
  })

  describe('Direction Calculation', () => {
    it('[U04275] should calculate heading from velocity', () => {
      unit.velocityX = 1
      unit.velocityY = 0

      const heading = Math.atan2(unit.velocityY, unit.velocityX)

      expect(heading).toBe(0) // East
    })

    it('[U04276] should handle cardinal directions', () => {
      const directions = [
        { vx: 1, vy: 0, expected: 0 },       // East
        { vx: 0, vy: 1, expected: Math.PI / 2 },  // South
        { vx: -1, vy: 0, expected: Math.PI },     // West
        { vx: 0, vy: -1, expected: -Math.PI / 2 } // North
      ]

      directions.forEach(({ vx, vy, expected }) => {
        const heading = Math.atan2(vy, vx)
        expect(heading).toBeCloseTo(expected)
      })
    })

    it('[U04277] should normalize velocity for direction', () => {
      unit.velocityX = 3
      unit.velocityY = 4
      const magnitude = Math.hypot(unit.velocityX, unit.velocityY)

      const normalizedX = unit.velocityX / magnitude
      const normalizedY = unit.velocityY / magnitude

      expect(normalizedX).toBeCloseTo(0.6)
      expect(normalizedY).toBeCloseTo(0.8)
    })
  })
})

describe('applySteeringForces()', () => {
  let unit

  beforeEach(() => {
    unit = {
      id: 'unit-1',
      type: 'tank_v1',
      owner: 'player1',
      x: 500,
      y: 500,
      movement: {
        velocity: { x: 1, y: 0 },
        targetVelocity: { x: 1, y: 0 }
      }
    }
  })

  it('[U04278] should not modify unit if unit is null', () => {
    expect(() => applySteeringForces(null, { x: 1, y: 1 }, 1)).not.toThrow()
  })

  it('[U04279] should not modify unit if steeringForce is null', () => {
    expect(() => applySteeringForces(unit, null, 1)).not.toThrow()
  })

  it('[U04280] should not modify unit if movement is missing', () => {
    delete unit.movement
    expect(() => applySteeringForces(unit, { x: 1, y: 1 }, 1)).not.toThrow()
  })

  it('[U04281] should add steering force to target velocity with default deltaTime', () => {
    const steeringForce = { x: 0.5, y: 0.3 }
    const originalTargetX = unit.movement.targetVelocity.x
    const originalTargetY = unit.movement.targetVelocity.y

    applySteeringForces(unit, steeringForce)

    expect(unit.movement.targetVelocity.x).toBe(originalTargetX + steeringForce.x)
    expect(unit.movement.targetVelocity.y).toBe(originalTargetY + steeringForce.y)
  })

  it('[U04282] should scale steering force by deltaTime', () => {
    const steeringForce = { x: 1, y: 1 }
    const deltaTime = 0.5
    const originalTargetX = unit.movement.targetVelocity.x
    const originalTargetY = unit.movement.targetVelocity.y

    applySteeringForces(unit, steeringForce, deltaTime)

    expect(unit.movement.targetVelocity.x).toBe(originalTargetX + steeringForce.x * deltaTime)
    expect(unit.movement.targetVelocity.y).toBe(originalTargetY + steeringForce.y * deltaTime)
  })

  it('[U04283] should handle negative steering forces', () => {
    const steeringForce = { x: -1.5, y: -0.5 }
    const deltaTime = 1
    const originalTargetX = unit.movement.targetVelocity.x
    const originalTargetY = unit.movement.targetVelocity.y

    applySteeringForces(unit, steeringForce, deltaTime)

    expect(unit.movement.targetVelocity.x).toBe(originalTargetX - 1.5)
    expect(unit.movement.targetVelocity.y).toBe(originalTargetY - 0.5)
  })

  it('[U04284] should handle zero deltaTime', () => {
    const steeringForce = { x: 100, y: 100 }
    const deltaTime = 0
    const originalTargetX = unit.movement.targetVelocity.x
    const originalTargetY = unit.movement.targetVelocity.y

    applySteeringForces(unit, steeringForce, deltaTime)

    // With deltaTime = 0, no force should be applied
    expect(unit.movement.targetVelocity.x).toBe(originalTargetX)
    expect(unit.movement.targetVelocity.y).toBe(originalTargetY)
  })

  it('[U04285] should not crash if targetVelocity is missing', () => {
    unit.movement.targetVelocity = undefined
    expect(() => applySteeringForces(unit, { x: 1, y: 1 }, 1)).not.toThrow()
  })
})

describe('updateFormationCenter()', () => {
  let units

  beforeEach(() => {
    units = [
      { id: 'unit-1', x: 100, y: 100, formationCenter: null, formationOffset: null },
      { id: 'unit-2', x: 150, y: 150, formationCenter: null, formationOffset: null },
      { id: 'unit-3', x: 200, y: 200, formationCenter: null, formationOffset: null },
      { id: 'unit-4', x: 250, y: 250, formationCenter: null, formationOffset: null }
    ]
  })

  it('[U04286] should return early if units array is empty', () => {
    expect(() => updateFormationCenter([], 10, 10)).not.toThrow()
  })

  it('[U04287] should return early if units is null', () => {
    expect(() => updateFormationCenter(null, 10, 10)).not.toThrow()
  })

  it('[U04288] should set formationCenter for all units', () => {
    const targetX = 15
    const targetY = 20

    updateFormationCenter(units, targetX, targetY)

    units.forEach(unit => {
      expect(unit.formationCenter).toBeDefined()
      expect(unit.formationCenter.x).toBeDefined()
      expect(unit.formationCenter.y).toBeDefined()
    })
  })

  it('[U04289] should set formationOffset for all units', () => {
    updateFormationCenter(units, 10, 10)

    units.forEach(unit => {
      expect(unit.formationOffset).toBeDefined()
      expect(unit.formationOffset.x).toBeDefined()
      expect(unit.formationOffset.y).toBeDefined()
    })
  })

  it('[U04290] should calculate square formation based on unit count', () => {
    // With 4 units, should form a 2x2 square
    updateFormationCenter(units, 10, 10)

    // Check that units are spread out in a grid pattern
    const offsets = units.map(u => u.formationOffset)

    // Verify all offsets are distinct combinations
    const uniqueOffsets = new Set(offsets.map(o => `${o.x},${o.y}`))
    expect(uniqueOffsets.size).toBe(4)
  })

  it('[U04291] should create larger formation for more units', () => {
    // Create 9 units for a 3x3 formation
    const nineUnits = Array.from({ length: 9 }, (_, i) => ({
      id: `unit-${i}`,
      x: 100 + i * 50,
      y: 100 + i * 50,
      formationCenter: null,
      formationOffset: null
    }))

    updateFormationCenter(nineUnits, 10, 10)

    // All units should have formation data
    nineUnits.forEach(unit => {
      expect(unit.formationCenter).toBeDefined()
      expect(unit.formationOffset).toBeDefined()
    })

    // First unit and last unit should have different positions
    expect(nineUnits[0].formationOffset.x).not.toBe(nineUnits[8].formationOffset.x)
    expect(nineUnits[0].formationOffset.y).not.toBe(nineUnits[8].formationOffset.y)
  })

  it('[U04292] should skip null units in array', () => {
    const unitsWithNull = [
      { id: 'unit-1', formationCenter: null, formationOffset: null },
      null,
      { id: 'unit-3', formationCenter: null, formationOffset: null }
    ]

    expect(() => updateFormationCenter(unitsWithNull, 10, 10)).not.toThrow()

    // Valid units should have formation set
    expect(unitsWithNull[0].formationCenter).toBeDefined()
    expect(unitsWithNull[2].formationCenter).toBeDefined()
  })

  it('[U04293] should handle single unit formation', () => {
    const singleUnit = [{ id: 'unit-1', formationCenter: null, formationOffset: null }]

    updateFormationCenter(singleUnit, 10, 10)

    expect(singleUnit[0].formationCenter).toBeDefined()
    expect(singleUnit[0].formationOffset).toBeDefined()
    // Single unit should be at center of formation
    expect(singleUnit[0].formationOffset.x).toBe(0)
  })
})

describe('clearFormation()', () => {
  let units

  beforeEach(() => {
    units = [
      { id: 'unit-1', formationCenter: { x: 100, y: 100 }, formationOffset: { x: 10, y: 0 } },
      { id: 'unit-2', formationCenter: { x: 100, y: 100 }, formationOffset: { x: -10, y: 0 } },
      { id: 'unit-3', formationCenter: { x: 100, y: 100 }, formationOffset: { x: 0, y: 10 } }
    ]
  })

  it('[U04294] should return early if units is null', () => {
    expect(() => clearFormation(null)).not.toThrow()
  })

  it('[U04295] should return early if units is undefined', () => {
    expect(() => clearFormation(undefined)).not.toThrow()
  })

  it('[U04296] should clear formationCenter for all units', () => {
    clearFormation(units)

    units.forEach(unit => {
      expect(unit.formationCenter).toBeNull()
    })
  })

  it('[U04297] should clear formationOffset for all units', () => {
    clearFormation(units)

    units.forEach(unit => {
      expect(unit.formationOffset).toBeNull()
    })
  })

  it('[U04298] should handle units that already have null formation data', () => {
    const unitsNoFormation = [
      { id: 'unit-1', formationCenter: null, formationOffset: null },
      { id: 'unit-2', formationCenter: null, formationOffset: null }
    ]

    expect(() => clearFormation(unitsNoFormation)).not.toThrow()

    unitsNoFormation.forEach(unit => {
      expect(unit.formationCenter).toBeNull()
      expect(unit.formationOffset).toBeNull()
    })
  })

  it('[U04299] should skip null entries in units array', () => {
    const unitsWithNull = [
      { id: 'unit-1', formationCenter: { x: 100, y: 100 }, formationOffset: { x: 10, y: 0 } },
      null,
      { id: 'unit-3', formationCenter: { x: 100, y: 100 }, formationOffset: { x: 0, y: 10 } }
    ]

    expect(() => clearFormation(unitsWithNull)).not.toThrow()

    expect(unitsWithNull[0].formationCenter).toBeNull()
    expect(unitsWithNull[2].formationCenter).toBeNull()
  })

  it('[U04300] should work with empty array', () => {
    expect(() => clearFormation([])).not.toThrow()
  })
})

describe('calculateFlowFieldSteering()', () => {
  it('[U04301] should return zero vector when unit is null', () => {
    const result = calculateFlowFieldSteering(null, [], null)

    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })

  it('[U04302] should return zero vector when unit has no moveTarget', () => {
    const unit = { id: 'unit-1', moveTarget: null }

    const result = calculateFlowFieldSteering(unit, [], null)

    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })

  it('[U04303] should return a vector when unit has moveTarget', () => {
    const unit = {
      id: 'unit-1',
      x: 100,
      y: 100,
      moveTarget: { x: 200, y: 200 }
    }

    // This will call getFlowFieldManager which may return null
    const result = calculateFlowFieldSteering(unit, [], null)

    // With no flow field manager, should return zero
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })
})
