import { afterEach, describe, expect, it } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import { handleStuckUnit } from '../../src/game/movementStuck.js'
import {
  findPlayerStuckCluster,
  MOVE_PATIENCE_MIN_DISTANCE,
  MOVE_PATIENCE_SECONDS,
  registerStuckClusterNotifier,
  reportPlayerStuckCluster,
  STUCK_CLUSTER_MEMORY_MS,
  STUCK_CLUSTER_RADIUS_TILES
} from '../../src/game/movementPatience.js'

afterEach(() => {
  registerStuckClusterNotifier(() => {})
})

function grassMap(size = 24) {
  return Array.from({ length: size }, () => (
    Array.from({ length: size }, () => ({ type: 'grass', building: null, seedCrystal: false }))
  ))
}

function waterMap(size = 24) {
  return Array.from({ length: size }, () => (
    Array.from({ length: size }, () => ({ type: 'water', building: null, seedCrystal: false }))
  ))
}

function makeUnit(overrides = {}) {
  const x = 10 * TILE_SIZE
  const y = 10 * TILE_SIZE
  const now = 10000
  return {
    id: 'mover',
    type: 'harvester',
    owner: 'player1',
    health: 100,
    x,
    y,
    tileX: 10,
    tileY: 10,
    direction: 0,
    path: [{ x: 11, y: 10 }, { x: 18, y: 10 }],
    moveTarget: { x: 18, y: 10 },
    lastPathCalcTime: now,
    movement: {
      velocity: { x: 0, y: 0 },
      targetVelocity: { x: 0, y: 0 },
      rotation: 0,
      targetRotation: 0,
      isMoving: true,
      currentSpeed: 0,
      stuckDetection: {
        lastPosition: { x, y },
        stuckTime: 0,
        lastMovementCheck: now,
        rotationAttempts: 0,
        isRotating: false,
        dodgeAttempts: 0,
        lastDodgeTime: 0,
        lastStuckHandling: now,
        checkInterval: 500
      }
    },
    movePatience: {
      remaining: MOVE_PATIENCE_SECONDS,
      lastX: x,
      lastY: y,
      targetX: 18,
      targetY: 10,
      immobile: false,
      expiredAt: 0,
      phase: 0,
      nextCheckTime: now + 1000
    },
    ...overrides
  }
}

function tick(unit, now = 10000, units = [unit], map = grassMap()) {
  handleStuckUnit(unit, map, null, units, {
    humanPlayer: 'player1',
    simulationTime: now,
    units
  })
}

function stuckMember(id, x, y, owner = 'player1', expiredAt = 5000) {
  return {
    id,
    owner,
    type: 'harvester',
    health: 100,
    x,
    y,
    moveTarget: { x: 40, y: 40 },
    movePatience: {
      remaining: MOVE_PATIENCE_SECONDS,
      immobile: true,
      expiredAt,
      targetX: 40,
      targetY: 40,
      lastX: x,
      lastY: y,
      nextCheckTime: 999999,
      phase: 0
    }
  }
}

describe('movement patience', () => {
  it('[U06526] does not spend patience before a second has passed', () => {
    const unit = makeUnit()
    unit.movePatience.remaining = 6
    tick(unit, 10000)

    expect(unit.movePatience.remaining).toBe(6)
    expect(unit.isDodging).not.toBe(true)
  })

  it('[U06527] spends one second of patience when jitter is below one meter', () => {
    const unit = makeUnit()
    unit.movePatience.remaining = 6
    unit.movePatience.nextCheckTime = 10000
    unit.movePatience.lastX = unit.x - (MOVE_PATIENCE_MIN_DISTANCE / 2)
    tick(unit, 10000)

    expect(unit.movePatience.remaining).toBe(5)
    expect(unit.movePatience.immobile).toBe(true)
    expect(unit.isDodging).not.toBe(true)
  })

  it('[U06528] keeps patience when the unit travels at least one meter', () => {
    const unit = makeUnit()
    unit.movePatience.remaining = 4
    unit.movePatience.nextCheckTime = 10000
    unit.movePatience.immobile = true
    unit.movePatience.expiredAt = 1000
    unit.movePatience.lastX = unit.x - MOVE_PATIENCE_MIN_DISTANCE
    tick(unit, 10000)

    expect(unit.movePatience.remaining).toBe(4)
    expect(unit.movePatience.immobile).toBe(false)
    expect(unit.movePatience.expiredAt).toBe(0)
    expect(unit.isDodging).not.toBe(true)
  })

  it('[U06529] spends one point per missed second when several seconds elapse at once', () => {
    const unit = makeUnit()
    unit.movePatience.remaining = 7
    unit.movePatience.nextCheckTime = 1000
    tick(unit, 2000)

    expect(unit.movePatience.remaining).toBe(5)
    expect(unit.isDodging).not.toBe(true)
  })

  it('[U06530] enters the existing local dodge and refills patience after ten unmoving seconds', () => {
    const unit = makeUnit()
    unit.movePatience.remaining = MOVE_PATIENCE_SECONDS
    unit.movePatience.nextCheckTime = 1000
    tick(unit, 10000)

    expect(unit.isDodging).toBe(true)
    expect(unit.path.length).toBeGreaterThan(0)
    expect(unit.movePatience.remaining).toBe(MOVE_PATIENCE_SECONDS)
    expect(unit.movePatience.expiredAt).toBe(10000)
    expect(unit.movePatience.immobile).toBe(true)
  })

  it('[U06531] uses the same dodge for an enemy unit', () => {
    const unit = makeUnit({ owner: 'enemy', id: 'enemy-mover' })
    unit.movePatience.remaining = 1
    unit.movePatience.nextCheckTime = 10000
    tick(unit, 10000)

    expect(unit.isDodging).toBe(true)
    expect(unit.movePatience.remaining).toBe(MOVE_PATIENCE_SECONDS)
  })

  it('[U06532] restarts patience when the destination changes', () => {
    const unit = makeUnit()
    unit.moveTarget = { x: 4, y: 4 }
    unit.movePatience.remaining = 1
    unit.movePatience.nextCheckTime = 1000
    tick(unit, 10000)

    expect(unit.movePatience.remaining).toBe(MOVE_PATIENCE_SECONDS)
    expect(unit.movePatience.targetX).toBe(4)
    expect(unit.movePatience.targetY).toBe(4)
    expect(unit.movePatience.expiredAt).toBe(0)
    expect(unit.isDodging).not.toBe(true)
  })

  it('[U06533] restarts patience when the same destination is ordered again', () => {
    const unit = makeUnit()
    unit.movePatience.remaining = 2
    unit.movePatience.nextCheckTime = 1000
    unit.movePatienceResetRequested = true
    tick(unit, 10000)

    expect(unit.movePatienceResetRequested).toBe(false)
    expect(unit.movePatience.remaining).toBe(MOVE_PATIENCE_SECONDS)
    expect(unit.isDodging).not.toBe(true)
  })

  it('[U06534] does not spend patience while a harvester is harvesting', () => {
    const unit = makeUnit({ harvesting: true })
    unit.movePatience.remaining = 1
    unit.movePatience.nextCheckTime = 1000
    unit.movePatience.immobile = true
    tick(unit, 10000)

    expect(unit.movePatience.remaining).toBe(1)
    expect(unit.movePatience.immobile).toBe(false)
    expect(unit.isDodging).not.toBe(true)
  })

  it('[U06535] does not spend patience after the unit has reached its destination', () => {
    const unit = makeUnit()
    unit.path = []
    unit.moveTarget = { x: 10, y: 10 }
    unit.movePatience.targetX = 10
    unit.movePatience.targetY = 10
    unit.movePatience.remaining = 1
    unit.movePatience.nextCheckTime = 1000
    tick(unit, 10000)

    expect(unit.movePatience.remaining).toBe(1)
    expect(unit.isDodging).not.toBe(true)
  })

  it('[U06536] does not dodge aircraft with the ground patience timer', () => {
    const unit = makeUnit({ type: 'apache', isAirUnit: true })
    unit.movePatience.remaining = 1
    unit.movePatience.nextCheckTime = 1000
    tick(unit, 10000)

    expect(unit.movePatience.remaining).toBe(1)
    expect(unit.isDodging).not.toBe(true)
  })

  it('[U06537] does not spend patience while a ship is only turning onto its heading', () => {
    const unit = makeUnit({ type: 'destroyer', isNaval: true, direction: 0 })
    unit.movement.targetRotation = Math.PI
    unit.movement.currentSpeed = 0
    unit.movePatience.remaining = 4
    unit.movePatience.nextCheckTime = 1000
    tick(unit, 10000, [unit], waterMap())

    expect(unit.movePatience.remaining).toBe(4)
    expect(unit.isDodging).not.toBe(true)
  })

  it('[U06538] refills patience when the older stuck handler starts a local dodge', () => {
    const now = 10000
    const unit = makeUnit({
      type: 'battleship',
      isNaval: true,
      direction: Math.PI,
      lastPathCalcTime: 1
    })
    unit.path = [{ x: 11, y: 10 }, { x: 20, y: 10 }]
    unit.moveTarget = { x: 20, y: 10 }
    unit.movePatience.remaining = 3
    unit.movePatience.targetX = 20
    unit.movePatience.targetY = 10
    unit.movePatience.nextCheckTime = now + 60000
    unit.movement.isMoving = true
    unit.movement.targetRotation = 0
    unit.movement.stuckDetection.lastMovementCheck = 0
    unit.movement.stuckDetection.lastStuckHandling = 0
    unit.movement.stuckDetection.checkInterval = 1
    const map = waterMap()
    map[10][11].type = 'land'

    tick(unit, now, [unit], map)

    expect(unit.isDodging).toBe(true)
    expect(unit.movePatience.remaining).toBe(MOVE_PATIENCE_SECONDS)
  })
})

describe('player stuck clusters', () => {
  const now = 5000

  it('[U06539] groups more than five player units inside a circle of five tiles', () => {
    const units = Array.from({ length: 6 }, (_, index) => (
      stuckMember(`p${index}`, 8 * TILE_SIZE + index, 8 * TILE_SIZE)
    ))
    units[5].owner = 'player'

    const cluster = findPlayerStuckCluster(units, units[0], now, 'player1')

    expect(cluster).not.toBeNull()
    expect(cluster.members).toHaveLength(6)
  })

  it('[U06540] finds units spread around a circle instead of only around one unit', () => {
    const cx = 20 * TILE_SIZE
    const cy = 20 * TILE_SIZE
    const place = 3 * TILE_SIZE
    const units = Array.from({ length: 6 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 6
      return stuckMember(
        `ring${index}`,
        cx + Math.cos(angle) * place - TILE_SIZE / 2,
        cy + Math.sin(angle) * place - TILE_SIZE / 2
      )
    })

    const cluster = findPlayerStuckCluster(units, units[0], now, 'player1')

    expect(cluster).not.toBeNull()
    expect(cluster.members).toHaveLength(6)
  })

  it('[U06541] ignores a pile of five and a line that does not fit in the circle', () => {
    const five = Array.from({ length: 5 }, (_, index) => stuckMember(`f${index}`, 4 * TILE_SIZE, 4 * TILE_SIZE))
    expect(findPlayerStuckCluster(five, five[0], now, 'player1')).toBeNull()

    const line = Array.from({ length: 6 }, (_, index) => (
      stuckMember(`l${index}`, index * (STUCK_CLUSTER_RADIUS_TILES + 1) * TILE_SIZE, 0)
    ))
    expect(findPlayerStuckCluster(line, line[0], now, 'player1')).toBeNull()
  })

  it('[U06542] does not notify for an enemy-only crowd', () => {
    const enemies = Array.from({ length: 6 }, (_, index) => (
      stuckMember(`e${index}`, 3 * TILE_SIZE, 3 * TILE_SIZE, 'enemy')
    ))
    const notices = []
    registerStuckClusterNotifier(cluster => notices.push(cluster))

    expect(findPlayerStuckCluster(enemies, enemies[0], now, 'player1')).toBeNull()
    expect(reportPlayerStuckCluster(enemies[0], enemies, { humanPlayer: 'player1' }, now)).toBeNull()
    expect(notices).toHaveLength(0)
  })

  it('[U06543] drops members whose patience expiry is older than the memory window', () => {
    const units = Array.from({ length: 6 }, (_, index) => (
      stuckMember(`old${index}`, 2 * TILE_SIZE, 2 * TILE_SIZE, 'player1', 1000)
    ))

    expect(findPlayerStuckCluster(units, units[0], 1000 + STUCK_CLUSTER_MEMORY_MS + 1, 'player1')).toBeNull()
  })

  it('[U06544] reports a player pile to the registered notifier', () => {
    const units = Array.from({ length: 6 }, (_, index) => (
      stuckMember(`n${index}`, 6 * TILE_SIZE, 6 * TILE_SIZE)
    ))
    const notices = []
    registerStuckClusterNotifier(cluster => notices.push(cluster.members.length))

    const cluster = reportPlayerStuckCluster(units[0], units, { humanPlayer: 'player1' }, now)

    expect(cluster.members).toHaveLength(6)
    expect(notices).toEqual([6])
  })
})
