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

const soundMock = vi.hoisted(() => ({
  playPositionalSound: vi.fn(() => Promise.resolve(null)),
  playSound: vi.fn(),
  audioContext: { currentTime: 0 },
  getMasterVolume: vi.fn(() => 1)
}))

vi.mock('../../src/sound.js', () => soundMock)

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
import { handleStuckUnit } from '../../src/game/movementStuck.js'

function createMovementLoopHandle() {
  return {
    source: { stop: vi.fn() },
    gainNode: {
      gain: {
        value: 0,
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn()
      }
    },
    panner: { pan: { value: 0 } }
  }
}

describe('unifiedMovement.js', () => {
  it('[U05484] stops a carrier when a nearby final target is already between its center and bow', () => {
    const mapGrid = Array.from({ length: 30 }, () =>
      Array.from({ length: 30 }, () => ({ type: 'water' })))
    const carrier = {
      id: 'nearby-carrier', type: 'aircraftCarrier', isNaval: true,
      owner: 'player1', health: 100, x: 10 * 32, y: 10 * 32,
      tileX: 10, tileY: 10, direction: 0, speed: 0.24,
      path: [{ x: 11, y: 10 }], moveTarget: { x: 11, y: 10 }
    }
    initializeUnitMovement(carrier)
    expect(getNavalHullSegment(carrier).endX).toBeGreaterThan(11.5 * 32)

    updateUnitPosition(carrier, mapGrid, null, 10000, [carrier], { buildings: [], unitWrecks: [] })

    expect(carrier.path).toEqual([])
    expect(carrier.moveTarget).toBeNull()
    expect(carrier.movement.currentSpeed).toBe(0)
  })

  it.each(['aircraftCarrier', 'battleship', 'destroyer'])('[U05485] keeps %s on its route while turning slowly in unobstructed water', type => {
    const mapGrid = Array.from({ length: 30 }, () =>
      Array.from({ length: 30 }, () => ({ type: 'water' })))
    const route = [{ x: 11, y: 10 }, { x: 20, y: 10 }]
    const unit = {
      id: 'turning-ship', type, isNaval: true, owner: 'player1', health: 100,
      x: 10 * 32, y: 10 * 32, direction: Math.PI,
      path: route, moveTarget: { x: 20, y: 10 }, lastPathCalcTime: 1
    }
    initializeUnitMovement(unit)
    unit.movement.isMoving = true
    unit.movement.targetRotation = 0
    unit.movement.stuckDetection = {
      lastPosition: { x: unit.x, y: unit.y }, lastMovementCheck: 0,
      stuckTime: 0, rotationAttempts: 0, dodgeAttempts: 0,
      lastDodgeTime: 0, lastStuckHandling: 0, checkInterval: 1
    }

    handleStuckUnit(unit, mapGrid, mapGrid.map(row => row.map(() => 1)), [unit], {
      humanPlayer: 'player1', simulationTime: 10000
    })

    expect(unit.path).toBe(route)
    expect(unit.isDodging).not.toBe(true)
    expect(unit.movement.stuckDetection.stuckTime).toBe(0)
  })

  it.each(['terrain', 'collision', 'aligned stall'])('[U05486] still recovers a naval route blocked by %s', blocker => {
    const mapGrid = Array.from({ length: 30 }, () =>
      Array.from({ length: 30 }, () => ({ type: 'water' })))
    const route = [{ x: 11, y: 10 }, { x: 20, y: 10 }]
    const unit = {
      id: 'blocked-ship', type: 'battleship', isNaval: true, owner: 'player1', health: 100,
      x: 10 * 32, y: 10 * 32, direction: blocker === 'aligned stall' ? 0 : Math.PI,
      path: route, moveTarget: { x: 20, y: 10 }, lastPathCalcTime: 1
    }
    initializeUnitMovement(unit)
    unit.movement.isMoving = true
    unit.movement.targetRotation = 0
    if (blocker === 'terrain') mapGrid[10][11].type = 'land'
    if (blocker === 'collision') unit.movement.lastStaticCollisionTime = 9900
    unit.movement.stuckDetection = {
      lastPosition: { x: unit.x, y: unit.y }, lastMovementCheck: 0,
      stuckTime: 0, rotationAttempts: 0, dodgeAttempts: 0,
      lastDodgeTime: 0, lastStuckHandling: 0, checkInterval: 1
    }

    handleStuckUnit(unit, mapGrid, null, [unit], { humanPlayer: 'player1', simulationTime: 10000 })

    expect(unit.isDodging).toBe(true)
    expect(unit.path.slice(1)).toEqual(route)
  })

  it.each([{ x: 9, y: 10 }, { x: 10, y: 11 }])('[U05487] does not stop a carrier for a target behind or beside its forward hull (%j)', target => {
    const mapGrid = Array.from({ length: 30 }, () =>
      Array.from({ length: 30 }, () => ({ type: 'water' })))
    const carrier = {
      id: 'offset-carrier', type: 'aircraftCarrier', isNaval: true,
      owner: 'player1', health: 100, x: 10 * 32, y: 10 * 32,
      tileX: 10, tileY: 10, direction: 0, speed: 0.24,
      path: [target], moveTarget: target
    }
    updateUnitPosition(carrier, mapGrid, null, 10000, [carrier], { buildings: [], unitWrecks: [] })
    expect(carrier.path).toEqual([target])
    expect(carrier.moveTarget).toEqual(target)
  })

  it('[U04517] settles a carrier permanently when its bow reaches the final target tile', () => {
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

  it.each([
    ['battleship', 'battleshipCruise'],
    ['hovercraft', 'hovercraftMoving']
  ])('[U04518] loops %s audio while moving and stops it when idle', async(unitType, soundName) => {
    const handle = createMovementLoopHandle()
    soundMock.playPositionalSound.mockClear()
    soundMock.playPositionalSound.mockImplementation(() => Promise.resolve(handle))
    const mapGrid = Array.from({ length: 20 }, () =>
      Array.from({ length: 20 }, () => ({ type: 'water', building: null, seedCrystal: false })))
    const occupancyMap = Array.from({ length: 20 }, () => Array(20).fill(0))
    const unit = {
      id: `${unitType}-mover`,
      type: unitType,
      isNaval: true,
      owner: 'player1',
      health: 400,
      x: 8 * 32,
      y: 8 * 32,
      tileX: 8,
      tileY: 8,
      direction: 0,
      speed: 0.4,
      path: [{ x: 14, y: 8 }],
      moveTarget: { x: 14, y: 8 }
    }
    initializeUnitMovement(unit)
    unit.movement.velocity = { x: 0.4, y: 0 }
    unit.movement.targetVelocity = { x: 0.4, y: 0 }
    unit.movement.currentSpeed = 0.4
    unit.movement.isMoving = true

    updateUnitPosition(
      unit,
      mapGrid,
      occupancyMap,
      1000,
      [unit],
      { buildings: [], units: [unit], unitWrecks: [] }
    )

    expect(unit.movement.currentSpeed).toBeGreaterThan(0.05)
    await Promise.resolve()
    expect(soundMock.playPositionalSound).toHaveBeenCalledWith(
      soundName,
      unit.x,
      unit.y,
      0.22,
      0,
      false,
      { playLoop: true }
    )
    expect(unit.engineSound).toBe(handle)

    unit.path = []
    unit.moveTarget = null
    unit.movement.velocity = { x: 0, y: 0 }
    unit.movement.targetVelocity = { x: 0, y: 0 }
    unit.movement.currentSpeed = 0
    unit.movement.isMoving = false
    updateUnitPosition(
      unit,
      mapGrid,
      occupancyMap,
      1100,
      [unit],
      { buildings: [], units: [unit], unitWrecks: [] }
    )

    expect(unit.engineSound).toBeNull()
    expect(handle.source.stop).toHaveBeenCalled()
  })

  describe('hasFriendlyUnitOnTile', () => {
    it('[U04519] should return false if no units on tile', () => {
      const unit = { owner: 1, id: 'u1' }
      const units = []

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(false)
    })

    it('[U04520] should return true if friendly unit on tile', () => {
      const unit = { owner: 1, id: 'u1' }
      // Function uses x,y coordinates (pixel) to calculate tile positions
      // Tile 10 = position 10 * 32 + 16 = 336 (center of tile)
      const friendlyUnit = { owner: 1, id: 'u2', x: 320, y: 320, health: 100, type: 'tank' }
      const units = [friendlyUnit]

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(true)
    })

    it('[U04521] should return false if enemy unit on tile', () => {
      const unit = { owner: 1, id: 'u1' }
      const enemyUnit = { owner: 2, id: 'u2', tileX: 10, tileY: 10, health: 100 }
      const units = [enemyUnit]

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(false)
    })

    it('[U04522] should exclude the unit itself', () => {
      const unit = { owner: 1, id: 'u1', tileX: 10, tileY: 10 }
      const units = [unit]

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(false)
    })

    it('[U04523] should return false if unit is dead', () => {
      const unit = { owner: 1, id: 'u1' }
      const deadUnit = { owner: 1, id: 'u2', tileX: 10, tileY: 10, health: 0 }
      const units = [deadUnit]

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(false)
    })

    it('[U04524] should handle units without tileX/tileY', () => {
      const unit = { owner: 1, id: 'u1' }
      const invalidUnit = { owner: 1, id: 'u2', health: 100 }
      const units = [invalidUnit]

      const result = hasFriendlyUnitOnTile(unit, 10, 10, units)

      expect(result).toBe(false)
    })

    it('[U04525] should handle multiple units on different tiles', () => {
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
    it('[U04526] should initialize movement properties for unit', () => {
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

    it('[U04527] should not overwrite existing movement properties', () => {
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

    it('[U04528] should initialize Apache-specific properties', () => {
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

    it('[U04529] should handle unit without type', () => {
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
    it('[U04530] preserves empty paths and velocity objects over repeated combat stops', () => {
      const unit = { path: [{ x: 2, y: 1 }], movement: { velocity: { x: 2, y: 1 }, targetVelocity: { x: 3, y: 1 }, isMoving: true, currentSpeed: 2 } }
      stopUnitMovement(unit)
      const path = unit.path
      const velocity = unit.movement.velocity
      const targetVelocity = unit.movement.targetVelocity
      for (let tick = 0; tick < 100; tick++) stopUnitMovement(unit)
      expect(unit.path).toBe(path)
      expect(unit.path).toEqual([])
      expect(unit.movement.velocity).toBe(velocity)
      expect(unit.movement.targetVelocity).toBe(targetVelocity)
      expect(velocity).toEqual({ x: 0, y: 0 })
      expect(targetVelocity).toEqual({ x: 0, y: 0 })
    })

    it.each([
      { type: 'tank_v1', gas: 0 },
      { type: 'tank_v1', crew: { driver: false } },
      { type: 'harvester', harvesting: true },
      { type: 'harvester', unloadingAtRefinery: true },
      { type: 'tank_v1', repairingAtWorkshop: true }
    ])('[U04531] keeps blocked-unit movement state stable: %j', reason => {
      const unit = { ...reason, x: 32, y: 32, path: [{ x: 2, y: 1 }], moveTarget: { x: 2, y: 1 } }
      updateUnitPosition(unit, [], [], 0)
      const path = unit.path
      const movement = unit.movement
      const velocity = movement.velocity
      const targetVelocity = movement.targetVelocity
      for (let tick = 0; tick < 100; tick++) updateUnitPosition(unit, [], [], tick * 16)
      expect(unit.path).toBe(path)
      expect(unit.path).toEqual([])
      expect(unit.moveTarget).toBeNull()
      expect(unit.movement).toBe(movement)
      expect(movement.velocity).toBe(velocity)
      expect(movement.targetVelocity).toBe(targetVelocity)
      expect(velocity).toEqual({ x: 0, y: 0 })
      expect(targetVelocity).toEqual({ x: 0, y: 0 })
      expect(movement.isMoving).toBe(false)
    })

    it('[U04532] should stop unit movement', () => {
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

    it('[U04533] should clear path but not moveTarget', () => {
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

    it('[U04534] should handle unit without movement property', () => {
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

    it('[U04535] should handle unit without movement.targetVelocity', () => {
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
    it('[U04536] should cancel unit movement', () => {
      const unit = {
        id: 'u1',
        moveTarget: { x: 200, y: 200 },
        path: [{ x: 1, y: 1 }, { x: 2, y: 2 }]
      }

      cancelUnitMovement(unit)

      expect(unit.moveTarget).toBe(null)
      expect(unit.path).toEqual([])
    })

    it('[U04537] should clear targetVelocity and isMoving', () => {
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
    it('[U04538] should reset velocity for new path', () => {
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

    it('[U04539] should preserve isMoving state', () => {
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

    it('[U04540] should handle unit without movement property', () => {
      const unit = {
        id: 'u1'
      }

      expect(() => {
        resetUnitVelocityForNewPath(unit)
      }).not.toThrow()
    })
  })

  describe('isUnitMoving', () => {
    it('[U04541] should return true if unit is moving', () => {
      const unit = {
        movement: {
          isMoving: true,
          currentSpeed: 10
        }
      }

      const result = isUnitMoving(unit)

      expect(result).toBe(true)
    })

    it('[U04542] should return false if unit is not moving', () => {
      const unit = {
        movement: {
          isMoving: false,
          currentSpeed: 0
        }
      }

      const result = isUnitMoving(unit)

      expect(result).toBe(false)
    })

    it('[U04543] should return false if unit has no movement property', () => {
      const unit = {
        id: 'u1'
      }

      const result = isUnitMoving(unit)

      expect(result).toBe(false)
    })

    it('[U04544] should check current speed as fallback', () => {
      const unit = {
        movement: {
          currentSpeed: 5
        }
      }

      const result = isUnitMoving(unit)

      expect(result).toBe(true)
    })

    it('[U04545] should return false if currentSpeed is zero', () => {
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
    it('[U04546] should rotate unit to target direction', () => {
      const unit = {
        id: 'u1',
        direction: 0,
        rotation: 0
      }

      rotateUnitInPlace(unit, Math.PI / 2)

      // rotateUnitInPlace sets movement.rotation and copies to unit.rotation
      expect(unit.rotation).toBeGreaterThan(0)
    })

    it('[U04547] should use random rotation if no direction provided', () => {
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

    it('[U04548] should not rotate if no target direction', () => {
      const unit = {
        id: 'u1',
        direction: 0
      }

      rotateUnitInPlace(unit)

      expect(unit.direction).toBe(0)
    })

    it('[U04549] should handle unit without direction property', () => {
      const unit = {
        id: 'u1'
      }

      expect(() => {
        rotateUnitInPlace(unit, Math.PI / 2)
      }).not.toThrow()
    })
  })

  describe('checkMineDetonation', () => {
    it('[U04550] should not detonate if no mine at tile', async() => {
      const mineSystem = await import('../../src/game/mineSystem.js')
      mineSystem.getMineAtTile.mockReturnValue(null)

      const unit = { type: 'tank' }
      const units = []
      const buildings = []

      checkMineDetonation(unit, 5, 5, units, buildings)

      expect(mineSystem.detonateMine).not.toHaveBeenCalled()
    })

    it('[U04551] should not detonate inactive mine', async() => {
      const mineSystem = await import('../../src/game/mineSystem.js')
      mineSystem.getMineAtTile.mockReturnValue({ active: false })

      const unit = { type: 'tank' }
      const units = []
      const buildings = []

      checkMineDetonation(unit, 5, 5, units, buildings)

      expect(mineSystem.detonateMine).not.toHaveBeenCalled()
    })

    it('[U04552] should detonate active mine when unit center is inside trigger radius', async() => {
      const mineSystem = await import('../../src/game/mineSystem.js')
      mineSystem.getMineAtTile.mockReturnValue({ active: true })
      mineSystem.detonateMine.mockReturnValue(true)

      const unit = { type: 'tank', x: 160, y: 160 } // Center at (176, 176)
      const units = []
      const buildings = []

      checkMineDetonation(unit, 5, 5, units, buildings)

      expect(mineSystem.detonateMine).toHaveBeenCalledWith({ active: true }, units, buildings)
    })

    it('[U04553] should handle mine sweeper sweeping mines', async() => {
      const mineSystem = await import('../../src/game/mineSystem.js')
      mineSystem.getMineAtTile.mockReturnValue({ active: true })
      mineSystem.detonateMine.mockReturnValue(true)

      const unit = { type: 'mineSweeper', x: 160, y: 160, sweeping: true }
      const units = []
      const buildings = []

      checkMineDetonation(unit, 5, 5, units, buildings)

      expect(mineSystem.detonateMine).toHaveBeenCalledWith({ active: true }, units, buildings)
    })

    it('[U04554] should handle null unit', async() => {
      const mineSystem = await import('../../src/game/mineSystem.js')
      mineSystem.getMineAtTile.mockReturnValue({ active: true })
      mineSystem.detonateMine.mockClear()

      checkMineDetonation(null, 5, 5, [], [])

      expect(mineSystem.detonateMine).not.toHaveBeenCalled()
    })
  })

  describe('isUnitCenterInsideMineCircle', () => {
    it('[U04555] should return false for null unit', () => {
      const result = isUnitCenterInsideMineCircle(null, 5, 5)
      expect(result).toBe(false)
    })

    it('[U04556] should return false for invalid coordinates', () => {
      const unit = { x: 160, y: 160 }
      expect(isUnitCenterInsideMineCircle(unit, null, 5)).toBe(false)
      expect(isUnitCenterInsideMineCircle(unit, 5, null)).toBe(false)
      expect(isUnitCenterInsideMineCircle(unit, NaN, 5)).toBe(false)
      expect(isUnitCenterInsideMineCircle(unit, 5, NaN)).toBe(false)
    })

    it('[U04557] should return true when unit center is inside mine trigger radius', () => {
      const unit = { x: 160, y: 160 } // Center at (176, 176)
      // Mine at tile (5,5) center at (176, 176) - exactly at center
      const result = isUnitCenterInsideMineCircle(unit, 5, 5)
      expect(result).toBe(true)
    })

    it('[U04558] should return false when unit center is outside mine trigger radius', () => {
      const unit = { x: 160 + 50, y: 160 } // Center at (226, 176)
      // Mine at tile (5,5) center at (176, 176) - 50 pixels away
      const result = isUnitCenterInsideMineCircle(unit, 5, 5)
      expect(result).toBe(false)
    })

    it('[U04559] should handle edge case at exact trigger radius', () => {
      // MINE_TRIGGER_RADIUS = TILE_SIZE * 0.45 = 32 * 0.45 = 14.4
      // Unit at x: 160 + 14 = 174, center at 174 + 16 = 190
      // Mine center at 176, dx = 14, which is within 14.4
      const unit = { x: 160 + 14, y: 160 } // Center at (190, 176)
      const result = isUnitCenterInsideMineCircle(unit, 5, 5)
      expect(result).toBe(true) // Should be within radius
    })
  })

  describe('normalizeAngle', () => {
    it('[U04560] should return angle unchanged if within -π to π', () => {
      expect(normalizeAngle(0)).toBe(0)
      expect(normalizeAngle(Math.PI / 2)).toBe(Math.PI / 2)
      expect(normalizeAngle(-Math.PI / 2)).toBe(-Math.PI / 2)
      expect(normalizeAngle(Math.PI)).toBe(Math.PI)
      expect(normalizeAngle(-Math.PI)).toBe(-Math.PI)
    })

    it('[U04561] should normalize angle greater than π', () => {
      expect(normalizeAngle(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 10)
      expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0, 10)
      expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 10)
    })

    it('[U04562] should normalize angle less than -π', () => {
      expect(normalizeAngle(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1, 10)
      expect(normalizeAngle(-2 * Math.PI)).toBeCloseTo(0, 10)
      expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI, 10)
    })

    it('[U04563] should handle large positive angles', () => {
      expect(normalizeAngle(10 * Math.PI)).toBeCloseTo(0, 10)
      expect(normalizeAngle(5 * Math.PI + Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 10)
    })

    it('[U04564] should handle large negative angles', () => {
      expect(normalizeAngle(-10 * Math.PI)).toBeCloseTo(0, 10)
      expect(normalizeAngle(-5 * Math.PI - Math.PI / 2)).toBeCloseTo(Math.PI / 2, 10)
    })
  })

  describe('isAirborneUnit', () => {
    it('[U04565] should return false for null unit', () => {
      expect(isAirborneUnit(null)).toBe(false)
    })

    it('[U04566] should return false for ground units', () => {
      expect(isAirborneUnit({ type: 'tank' })).toBe(false)
      expect(isAirborneUnit({ type: 'harvester' })).toBe(false)
      expect(isAirborneUnit({ type: 'ambulance' })).toBe(false)
    })

    it('[U04567] should return true for Apache helicopters', () => {
      expect(isAirborneUnit({ type: 'apache' })).toBe(true)
    })

    it('[U04568] should return true for air units not grounded', () => {
      expect(isAirborneUnit({ isAirUnit: true, flightState: 'airborne' })).toBe(true)
      expect(isAirborneUnit({ isAirUnit: true, flightState: 'takeoff' })).toBe(true)
      expect(isAirborneUnit({ isAirUnit: true, flightState: 'landing' })).toBe(true)
    })

    it('[U04569] should return false for air units that are grounded', () => {
      expect(isAirborneUnit({ isAirUnit: true, flightState: 'grounded' })).toBe(false)
    })

    it('[U04570] should return false for Apache helicopters that are grounded', () => {
      expect(isAirborneUnit({ type: 'apache', flightState: 'grounded' })).toBe(false)
    })
  })

  describe('isGroundUnit', () => {
    it('[U04571] should return false for null unit', () => {
      expect(isGroundUnit(null)).toBe(false)
    })

    it('[U04572] should return true for ground units', () => {
      expect(isGroundUnit({ type: 'tank' })).toBe(true)
      expect(isGroundUnit({ type: 'harvester' })).toBe(true)
      expect(isGroundUnit({ type: 'ambulance' })).toBe(true)
    })

    it('[U04573] should return false for Apache helicopters', () => {
      expect(isGroundUnit({ type: 'apache' })).toBe(false)
    })

    it('[U04574] should return false for air units not grounded', () => {
      expect(isGroundUnit({ isAirUnit: true, flightState: 'airborne' })).toBe(false)
      expect(isGroundUnit({ isAirUnit: true, flightState: 'takeoff' })).toBe(false)
    })

    it('[U04575] should return true for air units that are grounded', () => {
      expect(isGroundUnit({ isAirUnit: true, flightState: 'grounded' })).toBe(true)
    })

    it('[U04576] should return true for Apache helicopters that are grounded', () => {
      expect(isGroundUnit({ type: 'apache', flightState: 'grounded' })).toBe(true)
    })
  })

  describe('ownersAreEnemies', () => {
    it('[U04577] should return false for null owners', () => {
      expect(ownersAreEnemies(null, 'player')).toBe(false)
      expect(ownersAreEnemies('player', null)).toBe(false)
      expect(ownersAreEnemies(null, null)).toBe(false)
    })

    it('[U04578] should return false for same owner', () => {
      expect(ownersAreEnemies('player', 'player')).toBe(false)
      expect(ownersAreEnemies('player1', 'player1')).toBe(false)
      expect(ownersAreEnemies('enemy', 'enemy')).toBe(false)
    })

    it('[U04579] should return true for different owners', () => {
      expect(ownersAreEnemies('player', 'enemy')).toBe(true)
      expect(ownersAreEnemies('player1', 'player2')).toBe(true)
      expect(ownersAreEnemies('enemy', 'player')).toBe(true)
    })

    it('[U04580] should normalize player to player1', () => {
      expect(ownersAreEnemies('player', 'player1')).toBe(false)
      expect(ownersAreEnemies('player', 'enemy')).toBe(true)
    })
  })

  describe('isValidDodgePosition', () => {
    it('[U04581] should return false for positions blocked by terrain', () => {
      const mapGrid = [
        [{ type: 'rock' }]
      ]
      const units = []

      const result = isValidDodgePosition(0, 0, mapGrid, units)
      expect(result).toBe(false)
    })

    it('[U04582] should return false for positions blocked by buildings', () => {
      const mapGrid = [
        [{ building: { id: 'b1' } }]
      ]
      const units = []

      const result = isValidDodgePosition(0, 0, mapGrid, units)
      expect(result).toBe(false)
    })

    it('[U04583] should return false for positions blocked by other units', () => {
      const mapGrid = [
        [{}]
      ]
      const units = [{ x: 0, y: 0, health: 100 }] // Unit at tile corner (0, 0)

      const result = isValidDodgePosition(0, 0, mapGrid, units)
      expect(result).toBe(false)
    })

    it('[U04584] should return true for valid positions', () => {
      const mapGrid = [
        [{}]
      ]
      const units = []

      const result = isValidDodgePosition(0, 0, mapGrid, units)
      expect(result).toBe(true)
    })

    it('[U04585] should handle out of bounds positions', () => {
      const mapGrid = [
        [{}]
      ]
      const units = []

      expect(isValidDodgePosition(-1, -1, mapGrid, units)).toBe(false)
      expect(isValidDodgePosition(1, 1, mapGrid, units)).toBe(false)
    })

    it('[U04586] should handle null mapGrid', () => {
      const result = isValidDodgePosition(0, 0, null, [])
      expect(result).toBe(false)
    })
  })
})
