/**
 * Unit tests for pathfinding system
 *
 * Tests the A* pathfinding algorithm, path caching, occupancy map integration,
 * and related pathfinding utilities.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock main.js which imports the benchmark modules that cause issues
vi.mock('../../src/main.js', () => ({
  units: [],
  bullets: [],
  factories: [],
  regenerateMapForClient: vi.fn()
}))

// Mock the network module that imports from main.js
vi.mock('../../src/network/gameCommandSync.js', () => ({
  broadcastBuildingDamage: vi.fn(),
  broadcastUnitSpawn: vi.fn(),
  broadcastUnitDeath: vi.fn(),
  broadcastUnitMove: vi.fn(),
  isHost: vi.fn(() => true),
  isLockstepEnabled: vi.fn(() => false)
}))

// Mock mineSystem to avoid the gameCommandSync import chain
vi.mock('../../src/game/mineSystem.js', () => ({
  isFriendlyMineBlocking: vi.fn(() => false),
  getMineLookup: vi.fn(() => new Map()),
  getMineAtTile: vi.fn(() => null)
}))

import {
  findPath,
  buildOccupancyMap,
  initializeOccupancyMap
} from '../../src/units.js'
import { movableOccupancyCount } from '../../src/game/occupancyTags.js'
import {
  updateGlobalPathfinding,
  createFormationOffsets,
  clearFormation,
  getCachedPath
} from '../../src/game/pathfinding.js'
import { TILE_SIZE, PATHFINDING_LIMIT, STREET_PATH_COST, DIRECTIONS, PATH_CALC_INTERVAL, PATH_CACHE_TTL } from '../../src/config.js'

// Mock performance.now for consistent timing
vi.stubGlobal('performance', {
  now: vi.fn(() => Date.now())
})

/**
 * Creates a clean test map grid
 * @param {number} width - Map width in tiles
 * @param {number} height - Map height in tiles
 * @returns {Array<Array<Object>>} - 2D map grid array
 */
function createTestMapGrid(width = 20, height = 20) {
  const mapGrid = []
  for (let y = 0; y < height; y++) {
    mapGrid[y] = []
    for (let x = 0; x < width; x++) {
      mapGrid[y][x] = {
        type: 'land',
        x: x,
        y: y,
        building: null,
        seedCrystal: false
      }
    }
  }
  return mapGrid
}

/**
 * Creates a map with obstacles
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @param {Array<Object>} obstacles - Array of {x, y, type} obstacles
 * @returns {Array<Array<Object>>} - 2D map grid with obstacles
 */
function createMapWithObstacles(width, height, obstacles) {
  const mapGrid = createTestMapGrid(width, height)
  for (const obstacle of obstacles) {
    if (mapGrid[obstacle.y] && mapGrid[obstacle.y][obstacle.x]) {
      mapGrid[obstacle.y][obstacle.x].type = obstacle.type || 'rock'
      if (obstacle.building) {
        mapGrid[obstacle.y][obstacle.x].building = obstacle.building
      }
    }
  }
  return mapGrid
}

/**
 * Creates a mock unit
 * @param {number} tileX - X position in tiles
 * @param {number} tileY - Y position in tiles
 * @param {string} owner - Owner identifier
 * @returns {Object} - Mock unit
 */
function createMockUnit(tileX, tileY, owner = 'player') {
  return {
    id: `unit-${tileX}-${tileY}-${Date.now()}`,
    owner,
    tileX,
    tileY,
    x: tileX * TILE_SIZE,
    y: tileY * TILE_SIZE,
    health: 100,
    type: 'tank_v1',
    isAirUnit: false,
    flightState: null
  }
}

describe('Pathfinding Core', () => {
  describe('findPath() - A* Algorithm', () => {
    it('[U03217] should find a direct path with no obstacles', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start = { x: 0, y: 0 }
      const end = { x: 5, y: 5 }

      const path = findPath(start, end, mapGrid)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
      expect(path[0].x).toBe(start.x)
      expect(path[0].y).toBe(start.y)
      expect(path[path.length - 1].x).toBe(end.x)
      expect(path[path.length - 1].y).toBe(end.y)
    })

    it('[U03218] should find path around water obstacle', () => {
      const obstacles = [
        { x: 2, y: 0, type: 'water' },
        { x: 2, y: 1, type: 'water' },
        { x: 2, y: 2, type: 'water' }
      ]
      const mapGrid = createMapWithObstacles(10, 10, obstacles)
      const start = { x: 0, y: 1 }
      const end = { x: 5, y: 1 }

      const path = findPath(start, end, mapGrid)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
      // Path should not contain any water tiles
      path.forEach(node => {
        expect(mapGrid[node.y][node.x].type).not.toBe('water')
      })
    })

    it('[U03219] should find path around rock obstacle', () => {
      const obstacles = [
        { x: 3, y: 2, type: 'rock' },
        { x: 3, y: 3, type: 'rock' },
        { x: 3, y: 4, type: 'rock' }
      ]
      const mapGrid = createMapWithObstacles(10, 10, obstacles)
      const start = { x: 1, y: 3 }
      const end = { x: 5, y: 3 }

      const path = findPath(start, end, mapGrid)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
      // Verify path reaches destination
      expect(path[path.length - 1].x).toBe(end.x)
      expect(path[path.length - 1].y).toBe(end.y)
    })

    it('[U03220] should find path around buildings', () => {
      const building = { type: 'powerPlant', x: 3, y: 3, width: 2, height: 2 }
      const obstacles = []
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          obstacles.push({ x: 3 + dx, y: 3 + dy, type: 'land', building })
        }
      }
      const mapGrid = createMapWithObstacles(10, 10, obstacles)
      const start = { x: 1, y: 4 }
      const end = { x: 6, y: 4 }

      const path = findPath(start, end, mapGrid)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
      // Path should not go through building tiles
      path.forEach(node => {
        expect(mapGrid[node.y][node.x].building).toBeFalsy()
      })
    })

    it('[U03221] should allow diagonal movement', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start = { x: 0, y: 0 }
      const end = { x: 5, y: 5 }

      const path = findPath(start, end, mapGrid)

      // A diagonal path should be shorter than a manhattan path
      // Length should be roughly sqrt(2) * 5 ≈ 7 instead of 10
      expect(path.length).toBeLessThan(12)
    })

    it('[U03222] should return empty array for invalid start coordinates', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start = { x: -1, y: 0 }
      const end = { x: 5, y: 5 }

      const path = findPath(start, end, mapGrid)

      expect(path).toEqual([])
    })

    it('[U03223] should return empty array for invalid end coordinates', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start = { x: 0, y: 0 }
      const end = { x: 100, y: 100 }

      const path = findPath(start, end, mapGrid)

      expect(path).toEqual([])
    })

    it('[U03224] should return empty array for null start', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const end = { x: 5, y: 5 }

      const path = findPath(null, end, mapGrid)

      expect(path).toEqual([])
    })

    it('[U03225] should return empty array for null end', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start = { x: 0, y: 0 }

      const path = findPath(start, null, mapGrid)

      expect(path).toEqual([])
    })

    it('[U03226] should return empty array for null mapGrid', () => {
      const start = { x: 0, y: 0 }
      const end = { x: 5, y: 5 }

      const path = findPath(start, end, null)

      expect(path).toEqual([])
    })

    it('[U03227] should return path when start equals end', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start = { x: 5, y: 5 }
      const end = { x: 5, y: 5 }

      const path = findPath(start, end, mapGrid)

      // Should return at least the start position
      expect(path.length).toBeGreaterThanOrEqual(1)
    })

    it('[U03228] should prefer street tiles with lower cost', () => {
      const mapGrid = createTestMapGrid(10, 10)
      // Create a street path
      for (let x = 0; x < 10; x++) {
        mapGrid[5][x].type = 'street'
      }
      const start = { x: 0, y: 5 }
      const end = { x: 9, y: 5 }

      const path = findPath(start, end, mapGrid)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
      // Path should follow the street
      path.forEach(node => {
        expect(node.y).toBe(5)
      })
    })

    it('[U03229] should handle pathfinding around seed crystals', () => {
      const mapGrid = createTestMapGrid(10, 10)
      mapGrid[2][3].seedCrystal = true

      const start = { x: 1, y: 2 }
      const end = { x: 5, y: 2 }

      const path = findPath(start, end, mapGrid)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
      // Path should not contain seed crystal tile
      path.forEach(node => {
        if (node.x === 3 && node.y === 2) {
          expect(mapGrid[node.y][node.x].seedCrystal).toBeFalsy()
        }
      })
    })
  })

  describe('findPath() - With Occupancy Map', () => {
    it('[U03230] should avoid occupied tiles', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const occupancyMap = initializeOccupancyMap([], mapGrid)

      // Mark a tile as occupied
      occupancyMap[5][5] = 1

      const start = { x: 3, y: 5 }
      const end = { x: 7, y: 5 }

      const path = findPath(start, end, mapGrid, occupancyMap)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
      // Path should avoid the occupied tile at (5,5)
      const pathContainsOccupied = path.some(node => node.x === 5 && node.y === 5)
      expect(pathContainsOccupied).toBe(false)
    })

    it('[U03231] should find alternative route when direct path is blocked', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const occupancyMap = initializeOccupancyMap([], mapGrid)

      // Block a horizontal line
      for (let x = 2; x < 8; x++) {
        occupancyMap[5][x] = 1
      }

      const start = { x: 5, y: 3 }
      const end = { x: 5, y: 7 }

      const path = findPath(start, end, mapGrid, occupancyMap)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
      // Path should go around the blocked line
      expect(path[path.length - 1].x).toBe(end.x)
      expect(path[path.length - 1].y).toBe(end.y)
    })

    it('[U03232] should allow starting from own occupied tile', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const occupancyMap = initializeOccupancyMap([], mapGrid)

      // Mark start tile as occupied (by the unit itself)
      const startX = 2
      const startY = 2
      occupancyMap[startY][startX] = 1

      const start = { x: startX, y: startY }
      const end = { x: 7, y: 7 }

      const path = findPath(start, end, mapGrid, occupancyMap)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
      // Should still be able to start from the occupied tile
      expect(path[0].x).toBe(startX)
      expect(path[0].y).toBe(startY)
    })
  })

  describe('findPath() - Edge Cases', () => {
    it('[U03233] should handle completely blocked destination', () => {
      const mapGrid = createTestMapGrid(10, 10)
      // Surround destination with obstacles
      const destX = 5
      const destY = 5
      for (const dir of DIRECTIONS) {
        const nx = destX + dir.x
        const ny = destY + dir.y
        if (nx >= 0 && nx < 10 && ny >= 0 && ny < 10) {
          mapGrid[ny][nx].type = 'rock'
        }
      }
      // Also block the destination itself
      mapGrid[destY][destX].type = 'rock'

      const start = { x: 0, y: 0 }
      const end = { x: destX, y: destY }

      const path = findPath(start, end, mapGrid)

      // Should return empty or find nearest available tile
      // Implementation may vary - check that it doesn't crash
      expect(Array.isArray(path)).toBe(true)
    })

    it('[U03234] should handle large distance paths within limit', () => {
      const mapGrid = createTestMapGrid(50, 50)
      const start = { x: 0, y: 0 }
      const end = { x: 49, y: 49 }

      const path = findPath(start, end, mapGrid)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
    })

    it('[U03235] should respect pathfinding limit for complex mazes', () => {
      const mapGrid = createTestMapGrid(20, 20)
      // Create a maze-like structure
      for (let y = 2; y < 18; y += 4) {
        for (let x = 0; x < 15; x++) {
          mapGrid[y][x].type = 'rock'
        }
      }
      for (let y = 4; y < 18; y += 4) {
        for (let x = 5; x < 20; x++) {
          mapGrid[y][x].type = 'rock'
        }
      }

      const start = { x: 0, y: 0 }
      const end = { x: 19, y: 19 }

      // Should complete without infinite loop
      const startTime = Date.now()
      const path = findPath(start, end, mapGrid, null, PATHFINDING_LIMIT)
      const duration = Date.now() - startTime

      expect(Array.isArray(path)).toBe(true)
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
    })

    it('[U03236] should handle diagonal corner blocking', () => {
      const mapGrid = createTestMapGrid(10, 10)
      // Create a corner that blocks diagonal movement
      mapGrid[3][4].type = 'rock'
      mapGrid[4][3].type = 'rock'

      const start = { x: 3, y: 3 }
      const end = { x: 4, y: 4 }

      const path = findPath(start, end, mapGrid)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
      // Should not cut through the corner diagonally
    })
  })

  describe('Occupancy Map', () => {
    describe('buildOccupancyMap()', () => {
      it('[U03237] should create occupancy map with correct dimensions', () => {
        const mapGrid = createTestMapGrid(20, 15)
        const units = []

        const occupancyMap = buildOccupancyMap(units, mapGrid)

        expect(occupancyMap.length).toBe(15)
        expect(occupancyMap[0].length).toBe(20)
      })

      it('[U03238] should mark water tiles as occupied', () => {
        const mapGrid = createTestMapGrid(10, 10)
        mapGrid[5][5].type = 'water'

        const occupancyMap = buildOccupancyMap([], mapGrid)

        expect(occupancyMap[5][5]).toBe(1)
      })

      it('[U03239] should mark rock tiles as occupied', () => {
        const mapGrid = createTestMapGrid(10, 10)
        mapGrid[3][3].type = 'rock'

        const occupancyMap = buildOccupancyMap([], mapGrid)

        expect(occupancyMap[3][3]).toBe(1)
      })

      it('[U03240] should mark building tiles as occupied', () => {
        const mapGrid = createTestMapGrid(10, 10)
        const building = { type: 'powerPlant', x: 4, y: 4 }
        mapGrid[4][4].building = building

        const occupancyMap = buildOccupancyMap([], mapGrid)

        expect(occupancyMap[4][4]).toBe(1)
      })

      it('[U03241] should mark unit positions as occupied', () => {
        const mapGrid = createTestMapGrid(10, 10)
        const unit = createMockUnit(3, 3)

        const occupancyMap = buildOccupancyMap([unit], mapGrid)

        expect(movableOccupancyCount(occupancyMap[3][3])).toBe(1)
        expect(occupancyMap[3][3] > 1).toBe(true)
      })

      it('[U03242] should increment for multiple units on same tile', () => {
        const mapGrid = createTestMapGrid(10, 10)
        const unit1 = createMockUnit(5, 5)
        const unit2 = createMockUnit(5, 5)

        const occupancyMap = buildOccupancyMap([unit1, unit2], mapGrid)

        expect(movableOccupancyCount(occupancyMap[5][5])).toBe(2)
      })

      it('[U03243] should skip air units not grounded', () => {
        const mapGrid = createTestMapGrid(10, 10)
        const airUnit = createMockUnit(4, 4)
        airUnit.isAirUnit = true
        airUnit.flightState = 'flying'

        const occupancyMap = buildOccupancyMap([airUnit], mapGrid)

        // Airborne units should not occupy ground tiles
        expect(occupancyMap[4][4]).toBe(0)
      })

      it('[U03244] should include grounded air units', () => {
        const mapGrid = createTestMapGrid(10, 10)
        const groundedAirUnit = createMockUnit(6, 6)
        groundedAirUnit.isAirUnit = true
        groundedAirUnit.flightState = 'grounded'

        const occupancyMap = buildOccupancyMap([groundedAirUnit], mapGrid)

        expect(movableOccupancyCount(occupancyMap[6][6])).toBe(1)
      })

      it('[U03245] should handle empty units array', () => {
        const mapGrid = createTestMapGrid(10, 10)

        const occupancyMap = buildOccupancyMap([], mapGrid)

        expect(occupancyMap).toBeDefined()
        expect(occupancyMap.length).toBe(10)
      })

      it('[U03246] should handle null units gracefully', () => {
        const mapGrid = createTestMapGrid(10, 10)

        const occupancyMap = buildOccupancyMap(null, mapGrid)

        expect(occupancyMap).toBeDefined()
      })

      it('[U03247] should return null for invalid mapGrid', () => {
        const occupancyMap = buildOccupancyMap([], null)

        expect(occupancyMap).toBeNull()
      })
    })

    describe('initializeOccupancyMap()', () => {
      it('[U03248] should be an alias for buildOccupancyMap', () => {
        const mapGrid = createTestMapGrid(10, 10)
        const units = [createMockUnit(2, 2)]

        const initResult = initializeOccupancyMap(units, mapGrid)
        const buildResult = buildOccupancyMap(units, mapGrid)

        expect(initResult.length).toBe(buildResult.length)
        expect(initResult[2][2]).toBe(buildResult[2][2])
      })
    })
  })

  describe('Formation Movement', () => {
    describe('createFormationOffsets()', () => {
      /**
       * Creates formation offsets for a group of units
       * (Local implementation to test formation logic without importing from pathfinding.js)
       */
      function createFormationOffsets(units, groupNumber) {
        const unitsPerRow = Math.ceil(Math.sqrt(units.length))
        const spacing = 48 // 1.5 tiles spacing between units

        units.forEach((unit, index) => {
          const row = Math.floor(index / unitsPerRow)
          const col = index % unitsPerRow

          // Center the formation
          const offsetX = (col - (unitsPerRow - 1) / 2) * spacing
          const offsetY = row * spacing

          unit.formationOffset = { x: offsetX, y: offsetY }
          unit.formationActive = true
          unit.groupNumber = groupNumber
        })
      }

      /**
       * Clears formation data from units
       */
      function clearFormation(units) {
        units.forEach(unit => {
          unit.formationOffset = null
          unit.formationActive = false
          unit.groupNumber = null
        })
      }

      it('[U03249] should create offsets for array of units', () => {
        const units = [
          createMockUnit(5, 5),
          createMockUnit(6, 5),
          createMockUnit(5, 6),
          createMockUnit(6, 6)
        ]

        createFormationOffsets(units, 1)

        units.forEach(unit => {
          expect(unit.formationOffset).toBeDefined()
          expect(unit.formationActive).toBe(true)
          expect(unit.groupNumber).toBe(1)
        })
      })

      it('[U03250] should assign different offsets to different units', () => {
        const units = [
          createMockUnit(0, 0),
          createMockUnit(1, 0),
          createMockUnit(0, 1),
          createMockUnit(1, 1)
        ]

        createFormationOffsets(units, 2)

        // At least some units should have different offsets
        const offsets = new Set()
        units.forEach(unit => {
          offsets.add(`${unit.formationOffset.x},${unit.formationOffset.y}`)
        })
        expect(offsets.size).toBeGreaterThan(1)
      })

      it('[U03251] should handle single unit', () => {
        const units = [createMockUnit(5, 5)]

        createFormationOffsets(units, 1)

        expect(units[0].formationOffset).toBeDefined()
        expect(units[0].formationActive).toBe(true)
      })

      it('[U03252] should handle empty array', () => {
        const units = []

        // Should not throw
        expect(() => createFormationOffsets(units, 1)).not.toThrow()
      })

      it('[U03253] should set proper group number', () => {
        const units = [createMockUnit(3, 3), createMockUnit(4, 4)]

        createFormationOffsets(units, 5)

        units.forEach(unit => {
          expect(unit.groupNumber).toBe(5)
        })
      })

      it('[U03254] should clear formation data from units', () => {
        const units = [
          createMockUnit(5, 5),
          createMockUnit(6, 5)
        ]
        createFormationOffsets(units, 1)

        clearFormation(units)

        units.forEach(unit => {
          expect(unit.formationOffset).toBeNull()
          expect(unit.formationActive).toBe(false)
          expect(unit.groupNumber).toBeNull()
        })
      })

      it('[U03255] should handle already cleared units', () => {
        const units = [createMockUnit(5, 5)]
        units[0].formationOffset = null
        units[0].formationActive = false
        units[0].groupNumber = null

        // Should not throw
        expect(() => clearFormation(units)).not.toThrow()
      })

      it('[U03256] should handle empty array for clearFormation', () => {
        const units = []

        expect(() => clearFormation(units)).not.toThrow()
      })
    })
  })

  describe('Path Caching (via findPath)', () => {
    beforeEach(() => {
      // Reset performance.now mock
      vi.mocked(performance.now).mockReturnValue(0)
    })

    it('[U03257] should return a path for valid request', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start = { x: 0, y: 0 }
      const end = { x: 5, y: 5 }

      const path = findPath(start, end, mapGrid)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
    })

    it('[U03258] should work with occupancy avoidance', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      occupancyMap[3][3] = 1

      const start = { x: 0, y: 0 }
      const end = { x: 5, y: 5 }

      // findPath accepts occupancyMap as 4th parameter
      const path = findPath(start, end, mapGrid, occupancyMap)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
    })

    it('[U03259] should handle paths with obstacles', () => {
      const mapGrid = createTestMapGrid(10, 10)
      // Block the direct path with obstacles
      for (let x = 0; x <= 8; x++) {
        mapGrid[4][x] = 2 // Obstacle at row 4
      }

      const start = { x: 0, y: 0 }
      const end = { x: 5, y: 8 }

      const path = findPath(start, end, mapGrid)

      expect(path).toBeDefined()
      // Path should go around the obstacle
    })
  })
})

describe('Street Path Cost', () => {
  it('[U03260] should have STREET_PATH_COST less than 1', () => {
    // Streets should be preferred, so cost should be less than 1
    expect(STREET_PATH_COST).toBeLessThan(1)
  })
})

describe('DIRECTIONS constant', () => {
  it('[U03261] should include all 8 directions', () => {
    expect(DIRECTIONS.length).toBe(8)
  })

  it('[U03262] should include cardinal directions', () => {
    const hasNorth = DIRECTIONS.some(d => d.x === 0 && d.y === -1)
    const hasSouth = DIRECTIONS.some(d => d.x === 0 && d.y === 1)
    const hasEast = DIRECTIONS.some(d => d.x === 1 && d.y === 0)
    const hasWest = DIRECTIONS.some(d => d.x === -1 && d.y === 0)

    expect(hasNorth).toBe(true)
    expect(hasSouth).toBe(true)
    expect(hasEast).toBe(true)
    expect(hasWest).toBe(true)
  })

  it('[U03263] should include diagonal directions', () => {
    const hasNE = DIRECTIONS.some(d => d.x === 1 && d.y === -1)
    const hasNW = DIRECTIONS.some(d => d.x === -1 && d.y === -1)
    const hasSE = DIRECTIONS.some(d => d.x === 1 && d.y === 1)
    const hasSW = DIRECTIONS.some(d => d.x === -1 && d.y === 1)

    expect(hasNE).toBe(true)
    expect(hasNW).toBe(true)
    expect(hasSE).toBe(true)
    expect(hasSW).toBe(true)
  })
})

describe('pathfinding.js - Exported Functions', () => {
  let mockPerformanceNow

  beforeEach(() => {
    mockPerformanceNow = 0
    vi.mocked(performance.now).mockImplementation(() => mockPerformanceNow)
  })

  describe('getCachedPath()', () => {
    it('[U03264] should calculate and cache a new path', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start = { x: 0, y: 0 }
      const end = { x: 5, y: 5 }

      const path = getCachedPath(start, end, mapGrid, null)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
      expect(path[0].x).toBe(start.x)
      expect(path[0].y).toBe(start.y)
    })

    it('[U03265] should return cached path when available', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start1 = { x: 0, y: 0 }
      const start2 = { x: 1, y: 1 }
      const end = { x: 5, y: 5 }

      // First call caches the path
      const path1 = getCachedPath(start1, end, mapGrid, null)

      // Second call should reuse cached path from a point on the path
      const path2 = getCachedPath(start2, end, mapGrid, null)

      expect(path1).toBeDefined()
      expect(path2).toBeDefined()
    })

    it('[U03266] should handle occupancy map parameter', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      occupancyMap[3][3] = 1
      const start = { x: 0, y: 0 }
      const end = { x: 5, y: 5 }

      const path = getCachedPath(start, end, mapGrid, occupancyMap)

      expect(path).toBeDefined()
      // Path should avoid occupied tile
      const hasOccupied = path.some(p => p.x === 3 && p.y === 3)
      expect(hasOccupied).toBe(false)
    })

    it('[U03267] should respect owner options for cache key', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start = { x: 0, y: 0, owner: 'player1' }
      const end = { x: 5, y: 5 }
      const options = { unitOwner: 'player1' }

      const path = getCachedPath(start, end, mapGrid, null, options)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
    })

    it('[U03268] should derive owner from start node properties', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start = { x: 0, y: 0, ownerId: 'player2' }
      const end = { x: 5, y: 5 }

      const path = getCachedPath(start, end, mapGrid, null)

      expect(path).toBeDefined()
    })

    it('[U03269] should handle ignoreFriendlyMines option', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start = { x: 0, y: 0 }
      const end = { x: 5, y: 5 }
      const options = { ignoreFriendlyMines: true }

      const path = getCachedPath(start, end, mapGrid, null, options)

      expect(path).toBeDefined()
    })

    it('[U03270] should remove stale cache entries beyond TTL', () => {
      const mapGrid = createTestMapGrid(10, 10)
      const start = { x: 0, y: 0 }
      const end = { x: 5, y: 5 }

      // Cache a path at time 0
      mockPerformanceNow = 0
      getCachedPath(start, end, mapGrid, null)

      // Advance time beyond PATH_CACHE_TTL
      mockPerformanceNow = PATH_CACHE_TTL + 1000

      // Request path again - should calculate new path since cache is stale
      const path = getCachedPath(start, end, mapGrid, null)

      expect(path).toBeDefined()
      expect(path.length).toBeGreaterThan(0)
    })

    it('[U03271] should return empty array for impossible path', () => {
      const mapGrid = createTestMapGrid(10, 10)
      // Surround end with obstacles
      for (let y = 4; y <= 6; y++) {
        for (let x = 4; x <= 6; x++) {
          mapGrid[y][x].type = 'rock'
        }
      }
      const start = { x: 0, y: 0 }
      const end = { x: 5, y: 5 }

      const path = getCachedPath(start, end, mapGrid, null)

      expect(Array.isArray(path)).toBe(true)
    })
  })

  describe('createFormationOffsets()', () => {
    it('[U03272] should assign formation offsets to units', () => {
      const units = [
        createMockUnit(5, 5),
        createMockUnit(6, 5),
        createMockUnit(5, 6),
        createMockUnit(6, 6)
      ]

      createFormationOffsets(units, 1)

      units.forEach(unit => {
        expect(unit.formationOffset).toBeDefined()
        expect(typeof unit.formationOffset.x).toBe('number')
        expect(typeof unit.formationOffset.y).toBe('number')
        expect(unit.formationActive).toBe(true)
        expect(unit.groupNumber).toBe(1)
      })
    })

    it('[U03273] should create unique offsets for different units', () => {
      const units = [
        createMockUnit(0, 0),
        createMockUnit(1, 0),
        createMockUnit(0, 1)
      ]

      createFormationOffsets(units, 2)

      const offsets = units.map(u => `${u.formationOffset.x},${u.formationOffset.y}`)
      const uniqueOffsets = new Set(offsets)
      expect(uniqueOffsets.size).toBeGreaterThan(1)
    })

    it('[U03274] should handle single unit formation', () => {
      const units = [createMockUnit(5, 5)]

      createFormationOffsets(units, 3)

      expect(units[0].formationOffset).toBeDefined()
      expect(units[0].formationActive).toBe(true)
      expect(units[0].groupNumber).toBe(3)
    })

    it('[U03275] should handle large formation', () => {
      const units = Array.from({ length: 16 }, (_, i) => createMockUnit(i % 4, Math.floor(i / 4)))

      createFormationOffsets(units, 4)

      units.forEach(unit => {
        expect(unit.formationOffset).toBeDefined()
        expect(unit.formationActive).toBe(true)
        expect(unit.groupNumber).toBe(4)
      })
    })

    it('[U03276] should center formation correctly', () => {
      const units = [createMockUnit(5, 5), createMockUnit(6, 5)]

      createFormationOffsets(units, 1)

      // For 2 units, one should have negative and one positive offset
      const offsets = units.map(u => u.formationOffset.x)
      expect(offsets.some(x => x < 0)).toBe(true)
      expect(offsets.some(x => x > 0)).toBe(true)
    })

    it('[U03277] should handle empty units array gracefully', () => {
      const units = []

      expect(() => createFormationOffsets(units, 5)).not.toThrow()
    })
  })

  describe('clearFormation()', () => {
    it('[U03278] should clear formation data from units', () => {
      const units = [
        createMockUnit(5, 5),
        createMockUnit(6, 5)
      ]
      createFormationOffsets(units, 1)

      clearFormation(units)

      units.forEach(unit => {
        expect(unit.formationOffset).toBeNull()
        expect(unit.formationActive).toBe(false)
        expect(unit.groupNumber).toBeNull()
      })
    })

    it('[U03279] should handle already cleared units', () => {
      const units = [createMockUnit(5, 5)]
      units[0].formationOffset = null
      units[0].formationActive = false
      units[0].groupNumber = null

      expect(() => clearFormation(units)).not.toThrow()
    })

    it('[U03280] should handle empty array', () => {
      const units = []

      expect(() => clearFormation(units)).not.toThrow()
    })

    it('[U03281] should handle units without formation properties', () => {
      const units = [{ id: 'test', tileX: 5, tileY: 5 }]

      expect(() => clearFormation(units)).not.toThrow()
      expect(units[0].formationOffset).toBeNull()
    })
  })

  describe('updateGlobalPathfinding()', () => {
    it('[U03282] should calculate paths for units with moveTarget but no path', () => {
      const mapGrid = createTestMapGrid(20, 20)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      const gameState = { humanPlayer: 'player1', lastGlobalPathCalc: null }
      const units = [
        {
          ...createMockUnit(5, 5),
          moveTarget: { x: 10, y: 10 },
          path: [],
          owner: 'player1'
        }
      ]

      updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)

      expect(units[0].path).toBeDefined()
      expect(units[0].path.length).toBeGreaterThan(0)
      expect(units[0].lastPathCalcTime).toBeDefined()
    })

    it('[U03283] should calculate paths on PATH_CALC_INTERVAL', () => {
      const mapGrid = createTestMapGrid(20, 20)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      mockPerformanceNow = 0
      const gameState = { humanPlayer: 'player1', lastGlobalPathCalc: 0 }
      const units = [
        {
          ...createMockUnit(5, 5),
          moveTarget: { x: 10, y: 10 },
          path: [],
          owner: 'player1'
        }
      ]

      // First call at time 0
      updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)

      // Advance time beyond PATH_CALC_INTERVAL
      mockPerformanceNow = PATH_CALC_INTERVAL + 100

      // Reset path to trigger recalculation
      units[0].path = []

      // Second call should recalculate
      updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)

      expect(units[0].path.length).toBeGreaterThan(0)
    })

    it('[U03284] should skip recalculation when path already exists', () => {
      const mapGrid = createTestMapGrid(20, 20)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      const gameState = { humanPlayer: 'player1', lastGlobalPathCalc: 0 }
      const units = [
        {
          ...createMockUnit(5, 5),
          moveTarget: { x: 10, y: 10 },
          path: [{ x: 6, y: 6 }, { x: 7, y: 7 }, { x: 8, y: 8 }],
          owner: 'player1',
          lastPathCalcTime: 0
        }
      ]

      mockPerformanceNow = 100

      updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)

      // Path should remain unchanged since it has sufficient length
      expect(units[0].path.length).toBe(3)
    })

    it('[U03285] should skip units with combat targets (handled by updateUnitMovement instead)', () => {
      const mapGrid = createTestMapGrid(20, 20)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      const gameState = { humanPlayer: 'player1', lastGlobalPathCalc: 0 }
      const targetUnit = createMockUnit(15, 15)
      targetUnit.health = 100
      const units = [
        {
          ...createMockUnit(5, 5),
          target: targetUnit,
          path: [],
          owner: 'player1'
        }
      ]

      mockPerformanceNow = 0
      updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)

      // Units with attack targets should be skipped - they are handled by updateUnitMovement()
      expect(units[0].moveTarget).toBeUndefined()
      expect(units[0].path.length).toBe(0)
    })

    it('[U03286] should handle formation groups', () => {
      const mapGrid = createTestMapGrid(20, 20)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      const gameState = { humanPlayer: 'player1', lastGlobalPathCalc: 0 }
      const units = [
        {
          ...createMockUnit(5, 5),
          moveTarget: { x: 15, y: 15 },
          path: [],
          formationActive: true,
          groupNumber: 1,
          formationOffset: { x: 0, y: 0 },
          owner: 'player1'
        },
        {
          ...createMockUnit(6, 5),
          moveTarget: { x: 15, y: 15 },
          path: [],
          formationActive: true,
          groupNumber: 1,
          formationOffset: { x: 48, y: 0 },
          owner: 'player1'
        }
      ]

      mockPerformanceNow = 0
      updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)

      // Both units should have paths
      expect(units[0].path.length).toBeGreaterThan(0)
      expect(units[1].path.length).toBeGreaterThan(0)
    })

    it('[U03287] should prioritize closer units when limiting paths per cycle', () => {
      const mapGrid = createTestMapGrid(50, 50)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      mockPerformanceNow = PATH_CALC_INTERVAL + 100
      const gameState = { humanPlayer: 'player1', lastGlobalPathCalc: 0 }

      // Create many units needing paths
      const units = []
      for (let i = 0; i < 50; i++) {
        units.push({
          ...createMockUnit(i, i),
          moveTarget: { x: 25, y: 25 },
          path: [],
          owner: 'player1'
        })
      }

      updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)

      // Closer units should have paths calculated
      // Unit at (24, 24) should be very close and get a path
      const closeUnit = units.find(u => u.tileX === 24 && u.tileY === 24)
      if (closeUnit) {
        expect(closeUnit.path.length).toBeGreaterThan(0)
      }
    })

    it('[U03288] should respect AI target change throttling', () => {
      const mapGrid = createTestMapGrid(20, 20)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      mockPerformanceNow = 1000
      const gameState = { humanPlayer: 'player1', lastGlobalPathCalc: 0 }
      const units = [
        {
          ...createMockUnit(5, 5),
          moveTarget: { x: 10, y: 10 },
          path: [],
          owner: 'ai',
          lastTargetChangeTime: 500, // Changed recently
          lastPathCalcTime: 100 // Has had a path calculated before (skips immediate path calc)
        }
      ]

      updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)

      // Should skip recalculation for AI unit with recent target change
      expect(units[0].path.length).toBe(0)
    })

    it('[U03289] should use attack path throttling for attacking units', () => {
      const mapGrid = createTestMapGrid(20, 20)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      mockPerformanceNow = PATH_CALC_INTERVAL + 100
      const gameState = { humanPlayer: 'player1', lastGlobalPathCalc: 0 }
      const targetUnit = createMockUnit(15, 15)
      targetUnit.health = 100
      const units = [
        {
          ...createMockUnit(5, 5),
          target: targetUnit,
          path: [],
          lastAttackPathCalcTime: 100, // Recently calculated
          owner: 'player1'
        }
      ]

      updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)

      // Should skip because attack path was calculated recently
      // Unit should keep empty path
      expect(units[0].path.length).toBe(0)
    })

    it('[U03290] should clear moveTarget when destination reached', () => {
      const mapGrid = createTestMapGrid(20, 20)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      mockPerformanceNow = PATH_CALC_INTERVAL + 100
      const gameState = { humanPlayer: 'player1', lastGlobalPathCalc: 0 }
      const units = [
        {
          ...createMockUnit(10, 10),
          moveTarget: { x: 10, y: 10 }, // Already at target
          path: [],
          tileX: 10,
          tileY: 10,
          owner: 'player1'
        }
      ]

      updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)

      // moveTarget should be cleared when reached
      expect(units[0].moveTarget).toBeNull()
    })

    it('[U03291] should handle empty units array', () => {
      const mapGrid = createTestMapGrid(20, 20)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      const gameState = { humanPlayer: 'player1', lastGlobalPathCalc: null }
      const units = []

      expect(() => updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)).not.toThrow()
    })

    it('[U03292] should handle units with attackQueue', () => {
      const mapGrid = createTestMapGrid(20, 20)
      const occupancyMap = initializeOccupancyMap([], mapGrid)
      mockPerformanceNow = PATH_CALC_INTERVAL + 100
      const gameState = { humanPlayer: 'player1', lastGlobalPathCalc: 0 }
      const units = [
        {
          ...createMockUnit(5, 5),
          attackQueue: [{ x: 15, y: 15 }],
          path: [],
          owner: 'player1'
        }
      ]

      updateGlobalPathfinding(units, mapGrid, occupancyMap, gameState)

      // Should recognize unit is in attack mode due to attackQueue
      expect(Array.isArray(units[0].path)).toBe(true)
    })
  })
})

