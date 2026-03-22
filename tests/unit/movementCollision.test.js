import { describe, it, expect, vi } from 'vitest'
import '../setup.js'

vi.mock('../../src/benchmark/benchmarkScenario.js', () => ({}))
vi.mock('../../src/benchmark/benchmarkRunner.js', () => ({}))
vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    rocketTurret: { fireRange: 10 },
    powerPlant: { width: 2, height: 2, health: 300 },
    concreteWall: { width: 1, height: 1, health: 100 }
  }
}))

import {
  applyStaticObstacleCollisionResponse,
  applyUnitCollisionResponse,
  calculateCollisionAvoidance
} from '../../src/game/movementCollision.js'

function createMapGrid(width = 6, height = 6) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: 'grass', building: null }))
  )
}

function createOccupancyMap(width = 6, height = 6) {
  return Array.from({ length: height }, () => Array(width).fill(0))
}

describe('movementCollision environment response', () => {
  it('stores a decaying repulsion force instead of abruptly rewriting the movement vector', () => {
    const mapGrid = createMapGrid()
    const occupancyMap = createOccupancyMap()
    const unit = {
      id: 'tank-1',
      type: 'tank_v1',
      owner: 'player1',
      x: 32,
      y: 32,
      movement: {
        velocity: { x: 1.6, y: 0.15 },
        targetVelocity: { x: 1.6, y: 0.15 },
        currentSpeed: 1.61
      }
    }

    mapGrid[1][2].building = { id: 'wall-1', type: 'concreteWall', owner: 'enemy' }

    applyStaticObstacleCollisionResponse(
      unit,
      unit.movement,
      { collided: true, type: 'building', tileX: 2, tileY: 1, building: mapGrid[1][2].building },
      46,
      32,
      mapGrid,
      occupancyMap,
      [unit],
      []
    )

    expect(unit.movement.velocity.x).toBeCloseTo(1.6, 5)
    expect(unit.movement.velocity.y).toBeCloseTo(0.15, 5)
    expect(unit.movement.staticCollisionForce).toBeTruthy()
    expect(unit.movement.staticCollisionForce.x).toBeLessThan(0)
    expect(unit.movement.staticCollisionForce.y).toBeCloseTo(0, 5)
    expect(unit.x).toBeLessThan(32)
    expect(unit.x).toBeGreaterThan(30)
  })

  it('keeps the same capped separation envelope while applying a softer immediate position correction', () => {
    const mapGrid = createMapGrid()
    const occupancyMap = createOccupancyMap()

    const staticUnit = {
      id: 'tank-static',
      type: 'tank_v1',
      owner: 'player1',
      x: 32,
      y: 32,
      movement: {
        velocity: { x: 1.2, y: 0 },
        targetVelocity: { x: 1.2, y: 0 },
        currentSpeed: 1.2
      }
    }

    const unitUnit = {
      id: 'tank-unit',
      type: 'tank_v1',
      owner: 'player1',
      x: 32,
      y: 32,
      movement: {
        velocity: { x: 1.2, y: 0 },
        targetVelocity: { x: 1.2, y: 0 },
        currentSpeed: 1.2
      }
    }

    const otherUnit = {
      id: 'tank-other',
      type: 'tank_v1',
      owner: 'player1',
      x: 54,
      y: 32,
      health: 100,
      movement: {
        velocity: { x: 0, y: 0 },
        targetVelocity: { x: 0, y: 0 },
        currentSpeed: 0
      }
    }

    mapGrid[1][2].building = { id: 'wall-2', type: 'concreteWall', owner: 'enemy' }

    applyStaticObstacleCollisionResponse(
      staticUnit,
      staticUnit.movement,
      { collided: true, type: 'building', tileX: 2, tileY: 1, building: mapGrid[1][2].building },
      46,
      32,
      mapGrid,
      occupancyMap,
      [staticUnit],
      []
    )

    applyUnitCollisionResponse(
      unitUnit,
      unitUnit.movement,
      {
        collided: true,
        type: 'unit',
        other: otherUnit,
        data: {
          normalX: 1,
          normalY: 0,
          overlap: 10,
          unitSpeed: 1.2,
          otherSpeed: 0
        }
      },
      [unitUnit, otherUnit],
      [],
      null,
      mapGrid,
      occupancyMap,
      []
    )

    const staticDisplacement = 32 - staticUnit.x
    const unitDisplacement = 32 - unitUnit.x

    expect(staticDisplacement).toBeGreaterThan(0)
    expect(unitDisplacement).toBeGreaterThan(0)
    expect(staticDisplacement).toBeLessThan(unitDisplacement)
    expect(Math.abs(staticUnit.movement.staticCollisionForce.x)).toBeGreaterThan(unitDisplacement)
  })

  it('feeds stored static repulsion back through collision avoidance as a decaying force field', () => {
    const mapGrid = createMapGrid()
    const occupancyMap = createOccupancyMap()
    const unit = {
      id: 'tank-force',
      type: 'tank_v1',
      owner: 'player1',
      x: 32,
      y: 32,
      movement: {
        velocity: { x: 1.2, y: 0 },
        targetVelocity: { x: 1.2, y: 0 },
        currentSpeed: 1.2
      }
    }

    mapGrid[1][2].building = { id: 'wall-3', type: 'concreteWall', owner: 'enemy' }

    applyStaticObstacleCollisionResponse(
      unit,
      unit.movement,
      { collided: true, type: 'building', tileX: 2, tileY: 1, building: mapGrid[1][2].building },
      46,
      32,
      mapGrid,
      occupancyMap,
      [unit],
      []
    )

    const firstAvoidance = calculateCollisionAvoidance(unit, [unit], mapGrid, occupancyMap)
    const secondAvoidance = calculateCollisionAvoidance(unit, [unit], mapGrid, occupancyMap)

    expect(firstAvoidance.x).toBeLessThan(0)
    expect(Math.abs(secondAvoidance.x)).toBeLessThan(Math.abs(firstAvoidance.x))
  })
})
