import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'
import {
  FlowFieldManager,
  getFlowFieldManager,
  clearFlowFields
} from '../../src/game/flowField.js'

// Mock config
vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  DIRECTIONS: [
    { x: 0, y: -1 },  // N
    { x: 1, y: -1 },  // NE
    { x: 1, y: 0 },   // E
    { x: 1, y: 1 },   // SE
    { x: 0, y: 1 },   // S
    { x: -1, y: 1 },  // SW
    { x: -1, y: 0 },  // W
    { x: -1, y: -1 }  // NW
  ]
}))

describe('flowField.js', () => {
  let manager
  let mapGrid

  beforeEach(() => {
    vi.clearAllMocks()
    clearFlowFields()
    manager = new FlowFieldManager()

    // Create a 20x20 map grid
    mapGrid = Array(20).fill(null).map(() =>
      Array(20).fill(null).map(() => ({ type: 'grass' }))
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('FlowFieldManager', () => {
    describe('constructor', () => {
      it('[U01555] should initialize with empty flow fields map', () => {
        expect(manager.flowFields).toBeInstanceOf(Map)
        expect(manager.flowFields.size).toBe(0)
      })

      it('[U01556] should initialize with empty chokepoints map', () => {
        expect(manager.chokepoints).toBeInstanceOf(Map)
        expect(manager.chokepoints.size).toBe(0)
      })
    })

    describe('clear', () => {
      it('[U01557] should clear all flow fields', () => {
        manager.generateFlowField(5, 5, 10, 10, mapGrid)
        expect(manager.flowFields.size).toBeGreaterThan(0)
        manager.clear()
        expect(manager.flowFields.size).toBe(0)
      })

      it('[U01558] should clear all chokepoints', () => {
        manager.chokepoints.set('test', { x: 5, y: 5 })
        manager.clear()
        expect(manager.chokepoints.size).toBe(0)
      })
    })

    describe('cleanup', () => {
      it('[U01559] should remove expired flow fields', () => {
        const field = manager.generateFlowField(5, 5, 10, 10, mapGrid)
        // Manually set creation time to past
        field.createdAt = performance.now() - 10000 // 10 seconds ago
        manager.cleanup()
        expect(manager.flowFields.size).toBe(0)
      })

      it('[U01560] should keep valid flow fields', () => {
        manager.generateFlowField(5, 5, 10, 10, mapGrid)
        manager.cleanup()
        expect(manager.flowFields.size).toBe(1)
      })

      it('[U01561] should limit cache size', () => {
        // Generate many flow fields
        for (let i = 0; i < 15; i++) {
          manager.generateFlowField(i, i, 15, 15, mapGrid)
        }
        manager.cleanup()
        expect(manager.flowFields.size).toBeLessThanOrEqual(10)
      })
    })

    describe('isTilePassable', () => {
      it('[U01562] should return true for grass tiles', () => {
        expect(manager.isTilePassable(mapGrid, 5, 5)).toBe(true)
      })

      it('[U01563] should return false for water tiles', () => {
        mapGrid[5][5].type = 'water'
        expect(manager.isTilePassable(mapGrid, 5, 5)).toBe(false)
      })

      it('[U01564] should return false for rock tiles', () => {
        mapGrid[5][5].type = 'rock'
        expect(manager.isTilePassable(mapGrid, 5, 5)).toBe(false)
      })

      it('[U01565] should return false for tiles with buildings', () => {
        mapGrid[5][5].building = { type: 'factory' }
        expect(manager.isTilePassable(mapGrid, 5, 5)).toBe(false)
      })

      it('[U01566] should return false for tiles with seed crystals', () => {
        mapGrid[5][5].seedCrystal = true
        expect(manager.isTilePassable(mapGrid, 5, 5)).toBe(false)
      })

      it('[U01567] should return false for out of bounds tiles', () => {
        expect(manager.isTilePassable(mapGrid, -1, 5)).toBe(false)
        expect(manager.isTilePassable(mapGrid, 5, -1)).toBe(false)
        expect(manager.isTilePassable(mapGrid, 100, 5)).toBe(false)
        expect(manager.isTilePassable(mapGrid, 5, 100)).toBe(false)
      })

      it('[U01568] should handle object tile types with different properties', () => {
        // Test a tile with a building (should be impassable)
        mapGrid[5][5] = { type: 'grass', building: true }
        expect(manager.isTilePassable(mapGrid, 5, 5)).toBe(false)

        // Test a tile with a seedCrystal (should be impassable)
        mapGrid[6][6] = { type: 'grass', seedCrystal: true }
        expect(manager.isTilePassable(mapGrid, 6, 6)).toBe(false)

        // Test a normal grass tile (should be passable)
        mapGrid[7][7] = { type: 'grass' }
        expect(manager.isTilePassable(mapGrid, 7, 7)).toBe(true)
      })
    })

    describe('detectChokepoint', () => {
      it('[U01569] should detect horizontal corridor', () => {
        // Create a narrow horizontal corridor (width <= 3 tiles)
        // Block all tiles except a narrow passage at y=5, x=9-11
        for (let y = 0; y < 20; y++) {
          for (let x = 0; x < 20; x++) {
            if (y !== 5) {
              mapGrid[y][x].type = 'rock' // Block everything except row 5
            }
          }
        }
        // Block sides of the corridor to make it narrow (only x=9,10,11 passable)
        for (let x = 0; x < 9; x++) {
          mapGrid[5][x].type = 'rock'
        }
        for (let x = 12; x < 20; x++) {
          mapGrid[5][x].type = 'rock'
        }

        const chokepoint = manager.detectChokepoint(10, 5, mapGrid)
        expect(chokepoint).not.toBeNull()
        expect(chokepoint.type).toBe('horizontal')
      })

      it('[U01570] should detect vertical corridor', () => {
        // Create a narrow vertical corridor (width <= 3 tiles)
        // Block all tiles except a narrow passage at x=5, y=9-11
        for (let y = 0; y < 20; y++) {
          for (let x = 0; x < 20; x++) {
            if (x !== 5) {
              mapGrid[y][x].type = 'rock' // Block everything except column 5
            }
          }
        }
        // Block top and bottom of the corridor to make it narrow (only y=9,10,11 passable)
        for (let y = 0; y < 9; y++) {
          mapGrid[y][5].type = 'rock'
        }
        for (let y = 12; y < 20; y++) {
          mapGrid[y][5].type = 'rock'
        }

        const chokepoint = manager.detectChokepoint(5, 10, mapGrid)
        expect(chokepoint).not.toBeNull()
        expect(chokepoint.type).toBe('vertical')
      })

      it('[U01571] should return null for impassable tiles', () => {
        mapGrid[5][5].type = 'water'
        expect(manager.detectChokepoint(5, 5, mapGrid)).toBeNull()
      })

      it('[U01572] should return null for open areas', () => {
        expect(manager.detectChokepoint(10, 10, mapGrid)).toBeNull()
      })

      it('[U01573] should return null for wide corridors', () => {
        // Create a wide corridor (wider than threshold)
        for (let x = 0; x < 20; x++) {
          mapGrid[2][x].type = 'rock'
          mapGrid[8][x].type = 'rock'
        }
        expect(manager.detectChokepoint(10, 5, mapGrid)).toBeNull()
      })
    })

    describe('generateFlowField', () => {
      it('[U01574] should create a flow field from center to destination', () => {
        const flowField = manager.generateFlowField(5, 5, 10, 10, mapGrid)
        expect(flowField).toBeDefined()
        expect(flowField.centerX).toBe(5)
        expect(flowField.centerY).toBe(5)
        expect(flowField.destX).toBe(10)
        expect(flowField.destY).toBe(10)
      })

      it('[U01575] should cache generated flow fields', () => {
        manager.generateFlowField(5, 5, 10, 10, mapGrid)
        expect(manager.flowFields.size).toBe(1)
      })

      it('[U01576] should return cached flow field if valid', () => {
        const field1 = manager.generateFlowField(5, 5, 10, 10, mapGrid)
        const field2 = manager.generateFlowField(5, 5, 10, 10, mapGrid)
        expect(field1).toBe(field2)
      })

      it('[U01577] should create entries for passable tiles', () => {
        const flowField = manager.generateFlowField(5, 5, 10, 10, mapGrid)
        const entry = flowField.getEntry(10, 10) // Destination
        expect(entry).toBeDefined()
        expect(entry.distance).toBe(0) // Destination has distance 0
      })

      it('[U01578] should set direction vectors pointing toward destination', () => {
        const flowField = manager.generateFlowField(5, 5, 10, 10, mapGrid)
        const entry = flowField.getEntry(9, 10) // One tile west of destination
        expect(entry).toBeDefined()
        expect(entry.dirX).toBeGreaterThan(0) // Should point east
      })

      it('[U01579] should handle occupancy map penalties', () => {
        const occupancyMap = Array(20).fill(null).map(() => Array(20).fill(0))
        occupancyMap[7][7] = 1 // Occupied tile

        const flowField = manager.generateFlowField(5, 5, 10, 10, mapGrid, occupancyMap)
        expect(flowField).toBeDefined()
      })
    })

    describe('getFlowDirectionForUnit', () => {
      it('[U01580] should return null when not in chokepoint', () => {
        const unit = {
          x: 10 * 32 + 16,
          y: 10 * 32 + 16
        }
        const direction = manager.getFlowDirectionForUnit(unit, 15, 15, mapGrid)
        expect(direction).toBeNull()
      })

      it('[U01581] should return direction when in chokepoint', () => {
        // Create a narrow horizontal corridor (width <= 3 tiles)
        for (let y = 0; y < 20; y++) {
          for (let x = 0; x < 20; x++) {
            if (y !== 5) {
              mapGrid[y][x].type = 'rock'
            }
          }
        }
        // Block sides to make narrow (only x=9,10,11 passable at y=5)
        for (let x = 0; x < 9; x++) {
          mapGrid[5][x].type = 'rock'
        }
        for (let x = 12; x < 20; x++) {
          mapGrid[5][x].type = 'rock'
        }

        // unit.x/y are top-left corner, so tile (10,5) = pixels (320, 160)
        const unit = {
          x: 10 * 32,
          y: 5 * 32
        }
        // Destination must be within the passable corridor
        const direction = manager.getFlowDirectionForUnit(unit, 11, 5, mapGrid)
        expect(direction).not.toBeNull()
        expect(direction.dirX).toBeDefined()
        expect(direction.dirY).toBeDefined()
      })

      it('[U01582] should use cached flow field', () => {
        // Create a narrow corridor
        for (let x = 0; x < 20; x++) {
          mapGrid[4][x].type = 'rock'
          mapGrid[6][x].type = 'rock'
        }

        const unit = { x: 10 * 32 + 16, y: 5 * 32 + 16 }

        manager.getFlowDirectionForUnit(unit, 15, 5, mapGrid)
        const cacheSize = manager.flowFields.size

        manager.getFlowDirectionForUnit(unit, 15, 5, mapGrid)
        expect(manager.flowFields.size).toBe(cacheSize) // Should use cached
      })
    })

    describe('isChokepointCrowded', () => {
      it('[U01583] should return false for empty area', () => {
        const result = manager.isChokepointCrowded(10, 10, [])
        expect(result).toBe(false)
      })

      it('[U01584] should return false for few units', () => {
        const units = [
          { x: 10 * 32 + 16, y: 10 * 32 + 16 },
          { x: 11 * 32 + 16, y: 10 * 32 + 16 }
        ]
        const result = manager.isChokepointCrowded(10, 10, units)
        expect(result).toBe(false)
      })

      it('[U01585] should return true for many units nearby', () => {
        const units = [
          { x: 10 * 32 + 16, y: 10 * 32 + 16 },
          { x: 11 * 32 + 16, y: 10 * 32 + 16 },
          { x: 10 * 32 + 16, y: 11 * 32 + 16 },
          { x: 9 * 32 + 16, y: 10 * 32 + 16 }
        ]
        const result = manager.isChokepointCrowded(10, 10, units)
        expect(result).toBe(true)
      })

      it('[U01586] should respect custom threshold', () => {
        const units = [
          { x: 10 * 32 + 16, y: 10 * 32 + 16 },
          { x: 11 * 32 + 16, y: 10 * 32 + 16 }
        ]
        const result = manager.isChokepointCrowded(10, 10, units, 2)
        expect(result).toBe(true)
      })

      it('[U01587] should only count units within range', () => {
        const units = [
          { x: 10 * 32 + 16, y: 10 * 32 + 16 },
          { x: 50 * 32 + 16, y: 50 * 32 + 16 }, // Far away
          { x: 51 * 32 + 16, y: 51 * 32 + 16 }  // Far away
        ]
        const result = manager.isChokepointCrowded(10, 10, units, 2)
        expect(result).toBe(false)
      })
    })
  })

  describe('FlowField class', () => {
    it('[U01588] should track creation time', () => {
      const before = performance.now()
      const flowField = manager.generateFlowField(5, 5, 10, 10, mapGrid)
      const after = performance.now()
      expect(flowField.createdAt).toBeGreaterThanOrEqual(before)
      expect(flowField.createdAt).toBeLessThanOrEqual(after)
    })

    it('[U01589] should track last used time', () => {
      const flowField = manager.generateFlowField(5, 5, 10, 10, mapGrid)
      const initialUsed = flowField.lastUsed
      flowField.touch()
      expect(flowField.lastUsed).toBeGreaterThanOrEqual(initialUsed)
    })

    it('[U01590] should check if flow field is valid', () => {
      const flowField = manager.generateFlowField(5, 5, 10, 10, mapGrid)
      expect(flowField.isValid()).toBe(true)

      flowField.createdAt = performance.now() - 10000
      expect(flowField.isValid()).toBe(false)
    })

    it('[U01591] should check if tile is contained', () => {
      const flowField = manager.generateFlowField(5, 5, 10, 10, mapGrid)
      expect(flowField.containsTile(5, 5)).toBe(true)
      expect(flowField.containsTile(10, 10)).toBe(true)
      expect(flowField.containsTile(0, 0)).toBe(true) // Within radius
      expect(flowField.containsTile(50, 50)).toBe(false) // Outside radius
    })

    it('[U01592] should get direction at pixel position', () => {
      const flowField = manager.generateFlowField(5, 5, 10, 10, mapGrid)
      const direction = flowField.getDirectionAt(10 * 32 + 16, 10 * 32 + 16)
      expect(direction).toBeDefined()
      expect(direction.dirX).toBeDefined()
      expect(direction.dirY).toBeDefined()
      expect(direction.distance).toBeDefined()
    })

    it('[U01593] should return null for positions outside flow field', () => {
      const flowField = manager.generateFlowField(5, 5, 10, 10, mapGrid)
      const direction = flowField.getDirectionAt(100 * 32, 100 * 32)
      expect(direction).toBeNull()
    })
  })

  describe('getFlowFieldManager', () => {
    it('[U01594] should return singleton instance', () => {
      const manager1 = getFlowFieldManager()
      const manager2 = getFlowFieldManager()
      expect(manager1).toBe(manager2)
    })

    it('[U01595] should be a FlowFieldManager instance', () => {
      const instance = getFlowFieldManager()
      expect(instance).toBeInstanceOf(FlowFieldManager)
    })
  })

  describe('clearFlowFields', () => {
    it('[U01596] should clear the singleton instance', () => {
      const instance = getFlowFieldManager()
      instance.generateFlowField(5, 5, 10, 10, mapGrid)
      expect(instance.flowFields.size).toBeGreaterThan(0)

      clearFlowFields()
      expect(instance.flowFields.size).toBe(0)
    })

    it('[U01597] should handle case where manager not initialized', () => {
      expect(() => clearFlowFields()).not.toThrow()
    })
  })
})
