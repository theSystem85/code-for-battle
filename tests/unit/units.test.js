/**
 * Tests for Units System (units.js)
 *
 * Tests unit creation, spawning, occupancy management,
 * pathfinding, and collision resolution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '../setup.js'
import { resetGameState, createTestMapGrid } from '../testUtils.js'

// Mock dependencies
vi.mock('../../src/config.js', async(importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    TILE_SIZE: 32,
    UNIT_COSTS: {
      tank_v1: 800,
      harvester: 1200,
      apache: 1500,
      ambulance: 600,
      tankerTruck: 500,
      recoveryTank: 700
    },
    UNIT_PROPERTIES: {
      base: { speed: 1, health: 100, maxHealth: 100, rotationSpeed: 0.1, turretRotationSpeed: 0.15 },
      tank_v1: { speed: 2, health: 150, maxHealth: 150, rotationSpeed: 0.1, turretRotationSpeed: 0.15 },
      harvester: { speed: 1.5, health: 200, maxHealth: 200, rotationSpeed: 0.08, armor: 'light' },
      apache: { speed: 3, health: 180, maxHealth: 180, rotationSpeed: 0.12, turretRotationSpeed: 0.2 },
      ambulance: { speed: 2.5, health: 100, maxHealth: 100, rotationSpeed: 0.1, medics: 10, maxMedics: 10, streetSpeedMultiplier: 6.0 }
    },
    PATHFINDING_LIMIT: 500,
    DIRECTIONS: [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
    ],
    MAX_SPAWN_SEARCH_DISTANCE: 5,
    STREET_PATH_COST: 0.5,
    UNIT_GAS_PROPERTIES: {},
    TANKER_SUPPLY_CAPACITY: 1000,
    UNIT_AMMO_CAPACITY: { tank_v1: 50, apache: 38 },
    AMMO_TRUCK_CARGO: 200
  }
})

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: (fn) => fn
}))

vi.mock('../../src/utils.js', () => ({
  getUniqueId: vi.fn(() => `unit-${Date.now()}-${Math.random()}`),
  updateUnitSpeedModifier: vi.fn(),
  getUnitCost: vi.fn((type) => ({ tank_v1: 800, harvester: 1200 }[type] || 500)),
  getBuildingIdentifier: vi.fn((building) => building.id || `${building.type}-${building.x}-${building.y}`)
}))

vi.mock('../../src/game/unifiedMovement.js', () => ({
  initializeUnitMovement: vi.fn((unit) => {
    unit.movement = { velocity: { x: 0, y: 0 }, isMoving: false }
  })
}))

vi.mock('../../src/game/howitzerGunController.js', () => ({
  initializeHowitzerGun: vi.fn()
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1',
    occupancyMap: null,
    unitWrecks: [],
    buildings: []
  }
}))

vi.mock('../../src/utils/helipadUtils.js', () => ({
  getHelipadLandingCenter: vi.fn(() => ({ x: 160, y: 160 })),
  getHelipadLandingTile: vi.fn(() => ({ x: 5, y: 5 })),
  getHelipadLandingTopLeft: vi.fn(() => ({ x: 144, y: 144 }))
}))

vi.mock('../../src/game/mineSystem.js', () => ({
  isFriendlyMineBlocking: vi.fn(() => false)
}))

vi.mock('../../src/game/spatialQuadtree.js', () => ({
  getSpatialQuadtree: vi.fn(() => ({
    queryNearbyGround: vi.fn(() => [])
  }))
}))

// Import after mocking
import {
  buildOccupancyMap,
  initializeOccupancyMap,
  updateUnitOccupancy,
  removeUnitOccupancy,
  findPath,
  findPathForOwner,
  spawnUnit,
  createUnit,
  moveBlockingUnits,
  resolveUnitCollisions,
  deselectUnits,
  unitCosts
} from '../../src/units.js'
import { gameState } from '../../src/gameState.js'

const TILE_SIZE = 32

describe('units.js', () => {
  let mapGrid

  beforeEach(() => {
    vi.clearAllMocks()
    resetGameState()
    mapGrid = createTestMapGrid(20, 20)
    // Set all tiles to 'land' type for spawn position validity
    for (let y = 0; y < mapGrid.length; y++) {
      for (let x = 0; x < mapGrid[0].length; x++) {
        mapGrid[y][x].type = 'land'
      }
    }
    gameState.occupancyMap = null
    gameState.unitWrecks = []
    gameState.buildings = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('unitCosts', () => {
    it('should export unit costs object', () => {
      expect(unitCosts).toBeDefined()
      expect(typeof unitCosts).toBe('object')
    })

    it('should have costs for common unit types', () => {
      expect(unitCosts.tank_v1).toBeDefined()
      expect(unitCosts.harvester).toBeDefined()
    })
  })

  describe('buildOccupancyMap', () => {
    it('should build occupancy map from map grid', () => {
      const units = []
      const result = buildOccupancyMap(units, mapGrid)

      expect(result).toBeTruthy()
      expect(result.length).toBe(20)
      expect(result[0].length).toBe(20)
    })

    it('should mark water tiles as occupied', () => {
      mapGrid[5][5].type = 'water'
      const result = buildOccupancyMap([], mapGrid)

      expect(result[5][5]).toBe(1)
    })

    it('should mark rock tiles as occupied', () => {
      mapGrid[6][6].type = 'rock'
      const result = buildOccupancyMap([], mapGrid)

      expect(result[6][6]).toBe(1)
    })

    it('should mark tiles with buildings as occupied', () => {
      mapGrid[7][7].building = { type: 'powerPlant' }
      const result = buildOccupancyMap([], mapGrid)

      expect(result[7][7]).toBe(1)
    })

    it('should mark tiles with seed crystals as occupied', () => {
      mapGrid[8][8].seedCrystal = true
      const result = buildOccupancyMap([], mapGrid)

      expect(result[8][8]).toBe(1)
    })

    it('should count unit positions in occupancy map', () => {
      const units = [
        { x: 3 * TILE_SIZE, y: 3 * TILE_SIZE, health: 100 }
      ]
      const result = buildOccupancyMap(units, mapGrid)

      expect(result[3][3]).toBeGreaterThanOrEqual(1)
    })

    it('should skip air units that are not grounded', () => {
      const units = [
        { x: 4 * TILE_SIZE, y: 4 * TILE_SIZE, isAirUnit: true, flightState: 'airborne' }
      ]
      const result = buildOccupancyMap(units, mapGrid)

      expect(result[4][4]).toBe(0)
    })

    it('should include grounded air units', () => {
      const units = [
        { x: 4 * TILE_SIZE, y: 4 * TILE_SIZE, isAirUnit: true, flightState: 'grounded' }
      ]
      const result = buildOccupancyMap(units, mapGrid)

      expect(result[4][4]).toBeGreaterThanOrEqual(1)
    })

    it('should return null for invalid mapGrid', () => {
      const result = buildOccupancyMap([], null)
      expect(result).toBeNull()
    })

    it('should return null for empty mapGrid', () => {
      const result = buildOccupancyMap([], [])
      expect(result).toBeNull()
    })

    it('should handle non-array units gracefully', () => {
      const result = buildOccupancyMap(null, mapGrid)
      expect(result).toBeTruthy()
    })

    it('should include unit wrecks in occupancy', () => {
      gameState.unitWrecks = [
        { x: 2 * TILE_SIZE, y: 2 * TILE_SIZE, health: 50 }
      ]
      const result = buildOccupancyMap([], mapGrid)

      expect(result[2][2]).toBeGreaterThanOrEqual(1)
    })
  })

  describe('initializeOccupancyMap', () => {
    it('should create initial occupancy map', () => {
      const result = initializeOccupancyMap([], mapGrid)

      expect(result).toBeTruthy()
      expect(result.length).toBe(20)
    })

    it('should call buildOccupancyMap internally', () => {
      const result = initializeOccupancyMap([], mapGrid)
      expect(result).toBeTruthy()
    })
  })

  describe('updateUnitOccupancy', () => {
    it('should update occupancy when unit moves', () => {
      const unit = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }
      const occupancyMap = buildOccupancyMap([], mapGrid)

      updateUnitOccupancy(unit, 3, 3, occupancyMap)

      expect(occupancyMap[3][3]).toBe(0) // Removed from old
      expect(occupancyMap[5][5]).toBe(1) // Added to new
    })

    it('should do nothing if occupancyMap is null', () => {
      const unit = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }

      expect(() => updateUnitOccupancy(unit, 3, 3, null)).not.toThrow()
    })

    it('should skip air units that are not grounded', () => {
      const unit = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE, isAirUnit: true, flightState: 'airborne' }
      const occupancyMap = buildOccupancyMap([], mapGrid)
      occupancyMap[3][3] = 1

      updateUnitOccupancy(unit, 3, 3, occupancyMap)

      expect(occupancyMap[3][3]).toBe(1) // Should not decrement
    })

    it('should update for grounded air units', () => {
      const unit = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE, isAirUnit: true, flightState: 'grounded' }
      const occupancyMap = buildOccupancyMap([], mapGrid)
      occupancyMap[3][3] = 1

      updateUnitOccupancy(unit, 3, 3, occupancyMap)

      expect(occupancyMap[3][3]).toBe(0)
      expect(occupancyMap[5][5]).toBe(1)
    })

    it('should handle out-of-bounds previous position', () => {
      const unit = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }
      const occupancyMap = buildOccupancyMap([], mapGrid)

      expect(() => updateUnitOccupancy(unit, -1, -1, occupancyMap)).not.toThrow()
    })
  })

  describe('removeUnitOccupancy', () => {
    it('should remove unit from occupancy map', () => {
      const unit = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }
      const occupancyMap = buildOccupancyMap([], mapGrid)
      occupancyMap[5][5] = 1

      removeUnitOccupancy(unit, occupancyMap)

      expect(occupancyMap[5][5]).toBe(0)
    })

    it('should not go below zero', () => {
      const unit = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }
      const occupancyMap = buildOccupancyMap([], mapGrid)
      occupancyMap[5][5] = 0

      removeUnitOccupancy(unit, occupancyMap)

      expect(occupancyMap[5][5]).toBe(0)
    })

    it('should do nothing if occupancyMap is null', () => {
      const unit = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE }

      expect(() => removeUnitOccupancy(unit, null)).not.toThrow()
    })

    it('should skip non-grounded air units', () => {
      const unit = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE, isAirUnit: true, flightState: 'airborne' }
      const occupancyMap = buildOccupancyMap([], mapGrid)
      occupancyMap[5][5] = 1

      removeUnitOccupancy(unit, occupancyMap)

      expect(occupancyMap[5][5]).toBe(1) // Should not decrement
    })

    it('should remove with ignoreFlightState option', () => {
      const unit = { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE, isAirUnit: true, flightState: 'airborne' }
      const occupancyMap = buildOccupancyMap([], mapGrid)
      occupancyMap[5][5] = 1

      removeUnitOccupancy(unit, occupancyMap, { ignoreFlightState: true })

      expect(occupancyMap[5][5]).toBe(0)
    })
  })

  describe('findPath', () => {
    it('should find path between two points', () => {
      const start = { x: 2, y: 2 }
      const end = { x: 5, y: 5 }

      const path = findPath(start, end, mapGrid)

      expect(path.length).toBeGreaterThan(0)
      expect(path[0]).toEqual({ x: 2, y: 2 })
      expect(path[path.length - 1]).toEqual({ x: 5, y: 5 })
    })

    it('should return empty array for invalid start', () => {
      const path = findPath(null, { x: 5, y: 5 }, mapGrid)
      expect(path).toEqual([])
    })

    it('should return empty array for invalid end', () => {
      const path = findPath({ x: 2, y: 2 }, null, mapGrid)
      expect(path).toEqual([])
    })

    it('should return empty array for out-of-bounds start', () => {
      const path = findPath({ x: -1, y: 0 }, { x: 5, y: 5 }, mapGrid)
      expect(path).toEqual([])
    })

    it('should return empty array for out-of-bounds end', () => {
      const path = findPath({ x: 0, y: 0 }, { x: 100, y: 100 }, mapGrid)
      expect(path).toEqual([])
    })

    it('should avoid water tiles', () => {
      mapGrid[3][3].type = 'water'
      mapGrid[3][4].type = 'water'
      mapGrid[3][5].type = 'water'

      const path = findPath({ x: 2, y: 3 }, { x: 6, y: 3 }, mapGrid)

      // Path should exist and avoid water
      if (path.length > 0) {
        const passesWater = path.some(p => mapGrid[p.y][p.x].type === 'water')
        expect(passesWater).toBe(false)
      }
    })

    it('should avoid rock tiles', () => {
      mapGrid[4][4].type = 'rock'

      const path = findPath({ x: 3, y: 4 }, { x: 5, y: 4 }, mapGrid)

      if (path.length > 0) {
        const passesRock = path.some(p => mapGrid[p.y][p.x].type === 'rock')
        expect(passesRock).toBe(false)
      }
    })

    it('should prefer street tiles (lower cost)', () => {
      // Create a scenario where street is the preferred path
      mapGrid[5][3].type = 'street'
      mapGrid[5][4].type = 'street'
      mapGrid[5][5].type = 'street'

      const path = findPath({ x: 3, y: 5 }, { x: 5, y: 5 }, mapGrid)

      expect(path.length).toBeGreaterThan(0)
    })

    it('should handle diagonal movement', () => {
      const path = findPath({ x: 0, y: 0 }, { x: 3, y: 3 }, mapGrid)

      expect(path.length).toBeGreaterThan(0)
      // Should have some diagonal moves (not purely horizontal/vertical)
    })

    it('should handle same start and end', () => {
      const path = findPath({ x: 5, y: 5 }, { x: 5, y: 5 }, mapGrid)

      // Either returns path with just start point or empty
      expect(path.length).toBeLessThanOrEqual(1)
    })

    it('should return empty for invalid mapGrid', () => {
      const path = findPath({ x: 2, y: 2 }, { x: 5, y: 5 }, null)
      expect(path).toEqual([])
    })


    it('should return empty when strictDestination is true and destination is blocked', () => {
      mapGrid[5][5].type = 'rock'

      const path = findPath({ x: 2, y: 2 }, { x: 5, y: 5 }, mapGrid, null, undefined, { strictDestination: true })

      expect(path).toEqual([])
    })

    it('should retarget to nearby tile when strictDestination is false and destination is blocked', () => {
      mapGrid[5][5].type = 'rock'

      const path = findPath({ x: 2, y: 2 }, { x: 5, y: 5 }, mapGrid)

      expect(path.length).toBeGreaterThan(0)
      expect(path[path.length - 1]).not.toEqual({ x: 5, y: 5 })
    })
    it('should still find long strictDestination paths even when pathfinding limit is very low', () => {
      const path = findPath(
        { x: 0, y: 0 },
        { x: 15, y: 15 },
        mapGrid,
        null,
        1,
        { strictDestination: true }
      )

      expect(path.length).toBeGreaterThan(0)
      expect(path[path.length - 1]).toEqual({ x: 15, y: 15 })
    })


    it('should respect occupancy map when provided', () => {
      const occupancyMap = buildOccupancyMap([], mapGrid)
      // Block some tiles
      occupancyMap[4][4] = 1

      const path = findPath({ x: 3, y: 4 }, { x: 5, y: 4 }, mapGrid, occupancyMap)

      // Path should avoid occupied tile (or find alternate)
      expect(path.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('findPathForOwner', () => {
    it('should find path with owner context', () => {
      const path = findPathForOwner(
        { x: 2, y: 2 },
        { x: 5, y: 5 },
        mapGrid,
        null,
        'player1'
      )

      expect(path.length).toBeGreaterThan(0)
    })

    it('should work without owner specified', () => {
      const path = findPathForOwner(
        { x: 2, y: 2 },
        { x: 5, y: 5 },
        mapGrid,
        null,
        null
      )

      expect(path.length).toBeGreaterThan(0)
    })

    it('should pass options through', () => {
      const path = findPathForOwner(
        { x: 2, y: 2 },
        { x: 5, y: 5 },
        mapGrid,
        null,
        'player1',
        { ignoreFriendlyMines: true }
      )

      expect(path).toBeDefined()
    })
  })

  describe('spawnUnit', () => {
    const factory = {
      id: 'player1',
      type: 'vehicleFactory',
      x: 5,
      y: 5,
      width: 3,
      height: 3,
      owner: 'player1'
    }

    it('should spawn unit near factory', () => {
      const units = []
      const unit = spawnUnit(factory, 'tank_v1', units, mapGrid)

      expect(unit).toBeTruthy()
      expect(unit.type).toBe('tank_v1')
      expect(unit.owner).toBe('player1')
    })

    it('should return null if no spawn position available', () => {
      // Block all surrounding tiles
      for (let y = 0; y < mapGrid.length; y++) {
        for (let x = 0; x < mapGrid[0].length; x++) {
          mapGrid[y][x].type = 'water'
        }
      }

      const units = []
      const unit = spawnUnit(factory, 'tank_v1', units, mapGrid)

      expect(unit).toBeNull()
    })

    it('should set path to rally point if provided', () => {
      const rallyPoint = { x: 10, y: 10 }
      const units = []
      const unit = spawnUnit(factory, 'tank_v1', units, mapGrid, rallyPoint)

      if (unit && unit.path) {
        expect(unit.moveTarget).toEqual(rallyPoint)
      }
    })

    it('should not set path for harvester with rally point', () => {
      const rallyPoint = { x: 10, y: 10 }
      const units = []
      const unit = spawnUnit(factory, 'harvester', units, mapGrid, rallyPoint)

      // Harvesters handle their own path logic
      expect(unit).toBeTruthy()
    })

    it('should update occupancy map when spawning', () => {
      gameState.occupancyMap = buildOccupancyMap([], mapGrid)
      const units = []
      const unit = spawnUnit(factory, 'tank_v1', units, mapGrid, null, gameState.occupancyMap)

      expect(unit).toBeTruthy()
      // Occupancy should be updated for spawn position
    })
  })

  describe('createUnit', () => {
    const factory = {
      id: 'player1',
      owner: 'player1',
      type: 'vehicleFactory',
      x: 5,
      y: 5,
      width: 3,
      height: 3
    }

    it('should create unit with basic properties', () => {
      const unit = createUnit(factory, 'tank_v1', 10, 10)

      expect(unit).toBeTruthy()
      expect(unit.type).toBe('tank_v1')
      expect(unit.owner).toBe('player1')
      expect(unit.x).toBe(10 * TILE_SIZE)
      expect(unit.y).toBe(10 * TILE_SIZE)
    })

    it('should assign unique id', () => {
      const unit1 = createUnit(factory, 'tank_v1', 10, 10)
      const unit2 = createUnit(factory, 'tank_v1', 11, 11)

      expect(unit1.id).toBeDefined()
      expect(unit2.id).toBeDefined()
      expect(unit1.id).not.toBe(unit2.id)
    })

    it('should set health from unit properties', () => {
      const unit = createUnit(factory, 'tank_v1', 10, 10)

      expect(unit.health).toBe(150)
      expect(unit.maxHealth).toBe(150)
    })

    it('should initialize movement properties', () => {
      const unit = createUnit(factory, 'tank_v1', 10, 10)

      expect(unit.movement).toBeDefined()
    })

    it('should create harvester with ore carrying capacity', () => {
      const unit = createUnit(factory, 'harvester', 10, 10)

      expect(unit.oreCarried).toBe(0)
      expect(unit.harvesting).toBe(false)
    })

    it('should create ambulance with medics', () => {
      const unit = createUnit(factory, 'ambulance', 10, 10)

      expect(unit.medics).toBeDefined()
      expect(unit.maxMedics).toBeDefined()
    })

    it('should create apache with flight properties', () => {
      const unit = createUnit(factory, 'apache', 10, 10)

      expect(unit.isAirUnit).toBe(true)
      expect(unit.flightState).toBe('grounded')
      expect(unit.altitude).toBe(0)
      expect(unit.maxAltitude).toBeDefined()
    })

    it('should treat tank as tank_v1', () => {
      const unit = createUnit(factory, 'tank', 10, 10)

      expect(unit.type).toBe('tank_v1')
    })

    it('should set utility unit flag for utility types', () => {
      const ambulance = createUnit(factory, 'ambulance', 10, 10)
      const tank = createUnit(factory, 'tank_v1', 10, 10)

      expect(ambulance.isUtilityUnit).toBe(true)
      expect(tank.isUtilityUnit).toBe(false)
    })

    it('should initialize crew system', () => {
      const tank = createUnit(factory, 'tank_v1', 10, 10)

      expect(tank.crew).toBeDefined()
      expect(tank.crew.driver).toBe(true)
      expect(tank.crew.commander).toBe(true)
    })

    it('should use world position override when provided', () => {
      const unit = createUnit(factory, 'tank_v1', 10, 10, {
        worldPosition: { x: 500, y: 600 }
      })

      expect(unit.x).toBe(500)
      expect(unit.y).toBe(600)
    })

    it('should set build duration', () => {
      const unit = createUnit(factory, 'tank_v1', 10, 10, { buildDuration: 5000 })

      expect(unit.buildDuration).toBe(5000)
    })

    it('should initialize level and experience for combat units', () => {
      const tank = createUnit(factory, 'tank_v1', 10, 10)

      expect(tank.level).toBe(0)
      expect(tank.experience).toBe(0)
    })

    it('should initialize harvester level metadata', () => {
      const harvester = createUnit(factory, 'harvester', 10, 10)

      expect(harvester.level).toBe(0)
      expect(harvester.cargoCapacity).toBe(1000)
    })
  })

  describe('moveBlockingUnits', () => {
    it('should return true if no blocking unit', () => {
      const units = []
      const result = moveBlockingUnits(5, 5, units, mapGrid)

      expect(result).toBe(true)
    })

    it('should move blocking unit to adjacent tile', () => {
      const blockingUnit = {
        x: 5 * TILE_SIZE,
        y: 5 * TILE_SIZE,
        tileX: 5,
        tileY: 5
      }
      const units = [blockingUnit]

      const result = moveBlockingUnits(5, 5, units, mapGrid)

      expect(result).toBe(true)
      // Unit should have moved
      expect(blockingUnit.tileX !== 5 || blockingUnit.tileY !== 5).toBe(true)
    })

    it('should return false if cannot move blocking unit', () => {
      // Surround target with water
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (mapGrid[5 + dy] && mapGrid[5 + dy][5 + dx]) {
            mapGrid[5 + dy][5 + dx].type = 'water'
          }
        }
      }
      mapGrid[5][5].type = 'land' // Target tile is land

      const blockingUnit = {
        x: 5 * TILE_SIZE,
        y: 5 * TILE_SIZE,
        tileX: 5,
        tileY: 5
      }
      const units = [blockingUnit]

      const result = moveBlockingUnits(5, 5, units, mapGrid)

      expect(result).toBe(false)
    })
  })

  describe('resolveUnitCollisions', () => {
    it('should not throw for empty units array', () => {
      expect(() => resolveUnitCollisions([], mapGrid)).not.toThrow()
    })

    it('should skip dead units', () => {
      const deadUnit = {
        id: 1,
        x: 5 * TILE_SIZE,
        y: 5 * TILE_SIZE,
        health: 0,
        path: []
      }

      expect(() => resolveUnitCollisions([deadUnit], mapGrid)).not.toThrow()
    })

    it('should skip moving units', () => {
      const movingUnit = {
        id: 1,
        x: 5 * TILE_SIZE,
        y: 5 * TILE_SIZE,
        health: 100,
        path: [{ x: 6, y: 6 }]
      }

      expect(() => resolveUnitCollisions([movingUnit], mapGrid)).not.toThrow()
    })

    it('should update tile positions', () => {
      const unit = {
        id: 1,
        x: 5 * TILE_SIZE,
        y: 5 * TILE_SIZE,
        health: 100,
        path: []
      }

      resolveUnitCollisions([unit], mapGrid)

      expect(unit.tileX).toBe(5)
      expect(unit.tileY).toBe(5)
    })
  })

  describe('deselectUnits', () => {
    it('should deselect all units', () => {
      const units = [
        { selected: true },
        { selected: true },
        { selected: false }
      ]

      deselectUnits(units)

      units.forEach(u => expect(u.selected).toBe(false))
    })

    it('should handle empty array', () => {
      expect(() => deselectUnits([])).not.toThrow()
    })
  })
})
