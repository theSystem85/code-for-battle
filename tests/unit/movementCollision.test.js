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
  calculateCollisionAvoidance,
  checkUnitCollision,
  resolveNavalShoreOverlap
} from '../../src/game/movementCollision.js'
import { initSpatialQuadtree, rebuildSpatialQuadtree } from '../../src/game/spatialQuadtree.js'

function createMapGrid(width = 6, height = 6) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: 'grass', building: null }))
  )
}

function createOccupancyMap(width = 6, height = 6) {
  return Array.from({ length: height }, () => Array(width).fill(0))
}

describe('movementCollision environment response', () => {
  it('detects coincident rotated naval hulls instead of allowing stacked ship images', () => {
    const mapGrid = Array.from({ length: 20 }, () =>
      Array.from({ length: 20 }, () => ({ type: 'water', building: null })))
    const movement = () => ({
      velocity: { x: 0, y: 0 },
      targetVelocity: { x: 0, y: 0 },
      currentSpeed: 0
    })
    const first = {
      id: 'destroyer-a', type: 'destroyer', isNaval: true, health: 100,
      x: 160, y: 160, direction: 0, movement: movement()
    }
    const second = {
      id: 'destroyer-b', type: 'destroyer', isNaval: true, health: 100,
      x: 160, y: 160, direction: Math.PI / 2, movement: movement()
    }

    initSpatialQuadtree(640, 640)
    rebuildSpatialQuadtree([first, second])

    const collision = checkUnitCollision(first, mapGrid, createOccupancyMap(20, 20), [first, second])
    expect(collision.collided).toBe(true)
    expect(collision.type).toBe('unit')
    expect(collision.other).toBe(second)
    expect(collision.data.overlap).toBeGreaterThan(0)
  })

  it('pushes a broadside ship during rotating contact and applies greater side damage', () => {
    const mapGrid = Array.from({ length: 30 }, () => Array.from({ length: 30 }, () => ({ type: 'water' })))
    const occupancyMap = createOccupancyMap(30, 30)
    const moving = {
      id: 'turning', type: 'destroyer', isNaval: true, owner: 'player1', health: 100,
      x: 320, y: 320, direction: Math.PI / 2, navalAngularVelocity: 0.04,
      movement: { velocity: { x: 0, y: 0 }, targetVelocity: { x: 0, y: 0 }, currentSpeed: 0 }
    }
    const struck = {
      id: 'broadside', type: 'destroyer', isNaval: true, owner: 'player1', health: 100,
      x: 320, y: 350, direction: 0,
      movement: { velocity: { x: 0, y: 0 }, targetVelocity: { x: 0, y: 0 }, currentSpeed: 0 }
    }
    initSpatialQuadtree(960, 960)
    rebuildSpatialQuadtree([moving, struck])
    const collision = checkUnitCollision(moving, mapGrid, occupancyMap, [moving, struck])
    const beforeY = struck.y

    applyUnitCollisionResponse(moving, moving.movement, collision, [moving, struck], [], { simulationTime: 1000 }, mapGrid, occupancyMap)

    expect(struck.y).not.toBe(beforeY)
    expect(struck.health).toBeLessThan(moving.health)
  })

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
    expect(Math.hypot(unit.movement.staticCollisionForce.x, unit.movement.staticCollisionForce.y)).toBeLessThanOrEqual(unit.movement.currentSpeed + 0.01)
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
    expect(Math.abs(staticUnit.movement.staticCollisionForce.x)).toBeLessThanOrEqual(staticUnit.movement.currentSpeed)
    expect(staticDisplacement).toBeLessThanOrEqual(staticUnit.movement.currentSpeed)
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

  it('queues a one-tile yield move for an idle friendly unit when it gets pushed', () => {
    const mapGrid = createMapGrid()
    const occupancyMap = createOccupancyMap()

    const pusher = {
      id: 'tank-pusher',
      type: 'tank_v1',
      owner: 'player1',
      x: 32,
      y: 32,
      movement: {
        velocity: { x: 1.5, y: 0 },
        targetVelocity: { x: 1.5, y: 0 },
        currentSpeed: 1.5
      }
    }

    const pushed = {
      id: 'tank-pushed',
      type: 'tank_v1',
      owner: 'player1',
      x: 64,
      y: 32,
      health: 100,
      path: [],
      moveTarget: null,
      movement: {
        velocity: { x: 0, y: 0 },
        targetVelocity: { x: 0, y: 0 },
        currentSpeed: 0
      }
    }

    applyUnitCollisionResponse(
      pusher,
      pusher.movement,
      {
        collided: true,
        type: 'unit',
        other: pushed,
        data: {
          normalX: 1,
          normalY: 0,
          overlap: 8,
          unitSpeed: 1.5,
          otherSpeed: 0
        }
      },
      [pusher, pushed],
      [],
      null,
      mapGrid,
      occupancyMap,
      []
    )

    expect(pushed.moveTarget).toEqual({ x: 3, y: 1 })
    expect(pushed.path).toEqual([{ x: 3, y: 1 }])
  })

  it('does not queue a yield move when the pushed unit already has a move target', () => {
    const mapGrid = createMapGrid()
    const occupancyMap = createOccupancyMap()

    const pusher = {
      id: 'tank-pusher-2',
      type: 'tank_v1',
      owner: 'player1',
      x: 32,
      y: 32,
      movement: {
        velocity: { x: 1.5, y: 0 },
        targetVelocity: { x: 1.5, y: 0 },
        currentSpeed: 1.5
      }
    }

    const pushed = {
      id: 'tank-pushed-2',
      type: 'tank_v1',
      owner: 'player1',
      x: 64,
      y: 32,
      health: 100,
      path: [{ x: 4, y: 1 }],
      moveTarget: { x: 4, y: 1 },
      movement: {
        velocity: { x: 0, y: 0 },
        targetVelocity: { x: 0, y: 0 },
        currentSpeed: 0
      }
    }

    applyUnitCollisionResponse(
      pusher,
      pusher.movement,
      {
        collided: true,
        type: 'unit',
        other: pushed,
        data: {
          normalX: 1,
          normalY: 0,
          overlap: 8,
          unitSpeed: 1.5,
          otherSpeed: 0
        }
      },
      [pusher, pushed],
      [],
      null,
      mapGrid,
      occupancyMap,
      []
    )

    expect(pushed.moveTarget).toEqual({ x: 4, y: 1 })
    expect(pushed.path).toEqual([{ x: 4, y: 1 }])
  })

  it('queues yield move when the pusher is remote-controlled even if slower', () => {
    const mapGrid = createMapGrid()
    const occupancyMap = createOccupancyMap()

    const pusher = {
      id: 'tank-pusher-rc',
      type: 'tank_v1',
      owner: 'player1',
      remoteControlActive: true,
      x: 32,
      y: 32,
      movement: {
        velocity: { x: 0.3, y: 0 },
        targetVelocity: { x: 0.3, y: 0 },
        currentSpeed: 0.3
      }
    }

    const pushed = {
      id: 'tank-pushed-rc',
      type: 'tank_v1',
      owner: 'player1',
      x: 64,
      y: 32,
      health: 100,
      path: [],
      moveTarget: null,
      movement: {
        velocity: { x: 1.2, y: 0 },
        targetVelocity: { x: 1.2, y: 0 },
        currentSpeed: 1.2
      }
    }

    applyUnitCollisionResponse(
      pusher,
      pusher.movement,
      {
        collided: true,
        type: 'unit',
        other: pushed,
        data: {
          normalX: 1,
          normalY: 0,
          overlap: 8,
          unitSpeed: 0.3,
          otherSpeed: 1.2
        }
      },
      [pusher, pushed],
      [],
      null,
      mapGrid,
      occupancyMap,
      []
    )

    expect(pushed.moveTarget).toEqual({ x: 3, y: 1 })
    expect(pushed.path).toEqual([{ x: 3, y: 1 }])
  })
})

describe('naval image-footprint collision', () => {
  function createWaterGrid(width = 30, height = 20) {
    return Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ type: 'water', building: null, seedCrystal: false })))
  }

  function createShip(id, type, x, y, direction = 0) {
    return {
      id, type, isNaval: true, owner: 'player1', health: 100,
      x, y, direction,
      movement: { velocity: { x: 0, y: 0 }, targetVelocity: { x: 0, y: 0 }, currentSpeed: 0 }
    }
  }

  it('uses quadtree candidates and oriented hull width to reject overlapping parallel ships', () => {
    const mapGrid = createWaterGrid()
    const first = createShip('first', 'destroyer', 10 * 32, 8 * 32)
    const second = createShip('second', 'destroyer', 10 * 32, 8 * 32 + 25)
    initSpatialQuadtree(30 * 32, 20 * 32)
    rebuildSpatialQuadtree([first, second])

    const collision = checkUnitCollision(first, mapGrid, [], [first, second])

    expect(collision.type).toBe('unit')
    expect(collision.other).toBe(second)
  })

  it('rejects a carrier position when its bow footprint crosses the shoreline', () => {
    const mapGrid = createWaterGrid()
    for (let y = 0; y < mapGrid.length; y++) mapGrid[y][3].type = 'land'
    const carrier = createShip('carrier', 'aircraftCarrier', 6 * 32, 8 * 32, Math.PI)
    initSpatialQuadtree(30 * 32, 20 * 32)
    rebuildSpatialQuadtree([carrier])

    expect(checkUnitCollision(carrier, mapGrid, [], [carrier]).type).toBe('terrain')
  })

  it('allows a ferry hull to overlap the coast only during an active transport approach', () => {
    const mapGrid = createWaterGrid()
    for (let y = 0; y < mapGrid.length; y++) mapGrid[y][3].type = 'land'
    const ferry = {
      ...createShip('ferry', 'vehicleFerry', 4 * 32, 8 * 32, Math.PI),
      pendingLoadRendezvous: { desiredCenterX: 4.5 * 32, desiredCenterY: 8.5 * 32 },
      pendingLoadUnitIds: ['tank']
    }
    initSpatialQuadtree(30 * 32, 20 * 32)
    rebuildSpatialQuadtree([ferry])

    expect(checkUnitCollision(ferry, mapGrid, [], [ferry]).collided).toBe(false)
    expect(resolveNavalShoreOverlap(ferry, mapGrid)).toBe(false)

    ferry.pendingLoadRendezvous = null
    expect(checkUnitCollision(ferry, mapGrid, [], [ferry]).type).toBe('terrain')
  })

  it('pushes a rotated capital ship to the nearest clear-water hull position', () => {
    const mapGrid = createWaterGrid()
    for (let y = 0; y < mapGrid.length; y++) {
      for (let x = 0; x <= 3; x++) mapGrid[y][x].type = 'land'
    }
    const carrier = createShip('carrier', 'aircraftCarrier', 6 * 32, 8 * 32, Math.PI)
    const originalX = carrier.x
    initSpatialQuadtree(30 * 32, 20 * 32)
    rebuildSpatialQuadtree([carrier])

    expect(checkUnitCollision(carrier, mapGrid, [], [carrier]).type).toBe('terrain')
    expect(resolveNavalShoreOverlap(carrier, mapGrid)).toBe(true)
    expect(carrier.x).toBeGreaterThan(originalX)
    expect(carrier.tileX).toBe(Math.floor((carrier.x + 16) / 32))
    expect(checkUnitCollision(carrier, mapGrid, [], [carrier]).collided).toBe(false)
  })

  it('does not collide or steer a carrier away from aircraft on its deck', () => {
    const mapGrid = createWaterGrid()
    const carrier = createShip('carrier', 'aircraftCarrier', 10 * 32, 8 * 32)
    const f35 = {
      id: 'deck-f35',
      type: 'f35',
      isAirUnit: true,
      owner: 'player1',
      health: 100,
      x: carrier.x + 6,
      y: carrier.y + 4,
      flightState: 'grounded',
      carrierId: carrier.id,
      carrierOperation: { state: 'parked', carrierId: carrier.id },
      movement: { velocity: { x: 0, y: 0 }, targetVelocity: { x: 0, y: 0 }, currentSpeed: 0 }
    }
    initSpatialQuadtree(30 * 32, 20 * 32)
    rebuildSpatialQuadtree([carrier, f35])

    expect(checkUnitCollision(carrier, mapGrid, [], [carrier, f35]).collided).toBe(false)
    expect(calculateCollisionAvoidance(carrier, [carrier, f35], mapGrid, [])).toEqual({ x: 0, y: 0 })
  })
})
