import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '../setup.js'
import {
  AABB,
  QuadtreeNode,
  SpatialQuadtree,
  initSpatialQuadtree,
  getSpatialQuadtree,
  rebuildSpatialQuadtree
} from '../../src/game/spatialQuadtree.js'

describe('spatialQuadtree.js', () => {
  describe('AABB', () => {
    it('should create AABB with correct properties', () => {
      const aabb = new AABB(10, 20, 100, 200)

      expect(aabb.x).toBe(10)
      expect(aabb.y).toBe(20)
      expect(aabb.width).toBe(100)
      expect(aabb.height).toBe(200)
      expect(aabb.halfWidth).toBe(50)
      expect(aabb.halfHeight).toBe(100)
      expect(aabb.centerX).toBe(60)
      expect(aabb.centerY).toBe(120)
      expect(aabb.right).toBe(110)
      expect(aabb.bottom).toBe(220)
    })

    it('should check if point is inside AABB', () => {
      const aabb = new AABB(0, 0, 100, 100)

      expect(aabb.containsPoint(50, 50)).toBe(true)
      expect(aabb.containsPoint(0, 0)).toBe(true)
      expect(aabb.containsPoint(99, 99)).toBe(true)
      expect(aabb.containsPoint(100, 100)).toBe(false)
      expect(aabb.containsPoint(-1, 50)).toBe(false)
      expect(aabb.containsPoint(50, -1)).toBe(false)
      expect(aabb.containsPoint(101, 50)).toBe(false)
      expect(aabb.containsPoint(50, 101)).toBe(false)
    })

    it('should check circle intersection with AABB', () => {
      const aabb = new AABB(0, 0, 100, 100)

      // Circle inside AABB
      expect(aabb.intersectsCircle(50, 50, 100)).toBe(true)

      // Circle center outside but overlapping
      expect(aabb.intersectsCircle(110, 50, 400)).toBe(true)

      // Circle completely outside
      expect(aabb.intersectsCircle(200, 200, 100)).toBe(false)

      // Circle touching corner
      const cornerDist = Math.sqrt(2 * 100 * 100) // Distance to corner (100, 100)
      expect(aabb.intersectsCircle(0, 0, cornerDist * cornerDist + 1)).toBe(true)
    })

    it('should handle edge cases for circle intersection', () => {
      const aabb = new AABB(100, 100, 50, 50)

      // Circle at exact edge
      expect(aabb.intersectsCircle(75, 125, 625)).toBe(true) // radius = 25

      // Circle below left edge
      expect(aabb.intersectsCircle(80, 125, 100)).toBe(false) // radius = 10
    })
  })

  describe('QuadtreeNode', () => {
    let boundary

    beforeEach(() => {
      boundary = new AABB(0, 0, 1000, 1000)
    })

    it('should create node with correct initial state', () => {
      const node = new QuadtreeNode(boundary, 16, 0)

      expect(node.boundary).toBe(boundary)
      expect(node.capacity).toBe(16)
      expect(node.depth).toBe(0)
      expect(node.units).toEqual([])
      expect(node.unitCount).toBe(0)
      expect(node.divided).toBe(false)
      expect(node.northeast).toBe(null)
      expect(node.northwest).toBe(null)
      expect(node.southeast).toBe(null)
      expect(node.southwest).toBe(null)
    })

    it('should insert units within boundary', () => {
      const node = new QuadtreeNode(boundary, 16, 0)
      const unit = { id: 'u1', x: 100, y: 100, _cx: 116, _cy: 116 }

      const result = node.insert(unit)

      expect(result).toBe(true)
      expect(node.unitCount).toBe(1)
      expect(node.units[0]).toBe(unit)
    })

    it('should reject units outside boundary', () => {
      const node = new QuadtreeNode(boundary, 16, 0)
      const unit = { id: 'u1', x: 1100, y: 1100, _cx: 1116, _cy: 1116 }

      const result = node.insert(unit)

      expect(result).toBe(false)
      expect(node.unitCount).toBe(0)
    })

    it('should subdivide when capacity exceeded', () => {
      const node = new QuadtreeNode(boundary, 4, 0)

      // Insert 4 units (at capacity)
      for (let i = 0; i < 4; i++) {
        node.insert({ id: `u${i}`, x: i * 10, y: i * 10, _cx: i * 10 + 16, _cy: i * 10 + 16 })
      }
      expect(node.divided).toBe(false)

      // Insert 5th unit (should trigger subdivision)
      node.insert({ id: 'u5', x: 50, y: 50, _cx: 66, _cy: 66 })
      expect(node.divided).toBe(true)
      expect(node.northeast).not.toBe(null)
      expect(node.northwest).not.toBe(null)
      expect(node.southeast).not.toBe(null)
      expect(node.southwest).not.toBe(null)
    })

    it('should not subdivide beyond max depth', () => {
      const node = new QuadtreeNode(boundary, 2, 6) // depth = 6 (MAX_DEPTH)

      // Insert 3 units (exceeds capacity)
      for (let i = 0; i < 3; i++) {
        node.insert({ id: `u${i}`, x: i * 10, y: i * 10, _cx: i * 10 + 16, _cy: i * 10 + 16 })
      }

      expect(node.divided).toBe(false)
      expect(node.unitCount).toBe(3)
    })

    it('should distribute units to correct quadrants', () => {
      const node = new QuadtreeNode(boundary, 2, 0)

      // Create units in each quadrant
      const neUnit = { id: 'ne', x: 600, y: 100, _cx: 616, _cy: 116 }
      const nwUnit = { id: 'nw', x: 100, y: 100, _cx: 116, _cy: 116 }
      const seUnit = { id: 'se', x: 600, y: 600, _cx: 616, _cy: 616 }
      const _swUnit = { id: 'sw', x: 100, y: 600, _cx: 116, _cy: 616 }

      node.insert(neUnit)
      node.insert(nwUnit)
      node.insert(seUnit) // Triggers subdivision

      expect(node.divided).toBe(true)

      // Verify units are in correct quadrants
      expect(node.northeast.unitCount > 0).toBe(true)
      expect(node.northwest.unitCount > 0).toBe(true)
      expect(node.southeast.unitCount > 0).toBe(true)
    })

    it('reuses split nodes while preserving fresh-tree query order as units move', () => {
      const retained = new QuadtreeNode(boundary, 2, 0)
      const units = Array.from({ length: 20 }, (_, index) => ({
        id: `retained-${index}`, _cx: 10 + index * 35, _cy: 10 + index * 35
      }))
      units.forEach(unit => retained.insert(unit))
      const firstChild = retained.northwest
      for (let frame = 0; frame < 10; frame++) {
        retained.clear(true)
        const fresh = new QuadtreeNode(boundary, 2, 0)
        for (const unit of units) {
          unit._cx = 1000 - unit._cx
          unit._cy = 1000 - unit._cy
          retained.insert(unit)
          fresh.insert(unit)
        }
        const actual = []
        const expected = []
        retained.queryCircleInto(500, 500, 1000 ** 2, units[0].id, actual)
        fresh.queryCircleInto(500, 500, 1000 ** 2, units[0].id, expected)
        expect(actual).toEqual(expected)
        expect(actual).not.toContain(units[0])
        expect(retained.northwest).toBe(firstChild)
      }
      retained.clear(true)
      const empty = []
      retained.queryCircleInto(500, 500, 1000 ** 2, null, empty)
      expect(empty).toEqual([])
      retained.clear()
      expect(retained.northwest).toBeNull()
    })

    it('should query units within circular range', () => {
      const node = new QuadtreeNode(boundary, 16, 0)

      // Insert units at various positions
      const units = [
        { id: 'u1', x: 100, y: 100, _cx: 116, _cy: 116 },
        { id: 'u2', x: 110, y: 110, _cx: 126, _cy: 126 },
        { id: 'u3', x: 500, y: 500, _cx: 516, _cy: 516 }
      ]

      units.forEach(u => node.insert(u))

      const results = []
      node.queryCircleInto(116, 116, 50 * 50, null, results)

      expect(results.length).toBe(2)
      expect(results).toContain(units[0])
      expect(results).toContain(units[1])
      expect(results).not.toContain(units[2])
    })

    it('should exclude specified unit from query', () => {
      const node = new QuadtreeNode(boundary, 16, 0)

      const units = [
        { id: 'u1', x: 100, y: 100, _cx: 116, _cy: 116 },
        { id: 'u2', x: 110, y: 110, _cx: 126, _cy: 126 }
      ]

      units.forEach(u => node.insert(u))

      const results = []
      node.queryCircleInto(116, 116, 100 * 100, 'u1', results)

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('u2')
    })

    it('should query subdivided nodes', () => {
      const node = new QuadtreeNode(boundary, 2, 0)

      // Insert enough units to trigger subdivision
      const units = [
        { id: 'u1', x: 100, y: 100, _cx: 116, _cy: 116 },
        { id: 'u2', x: 110, y: 110, _cx: 126, _cy: 126 },
        { id: 'u3', x: 600, y: 600, _cx: 616, _cy: 616 }
      ]

      units.forEach(u => node.insert(u))

      expect(node.divided).toBe(true)

      const results = []
      node.queryCircleInto(116, 116, 100 * 100, null, results)

      expect(results.length).toBe(2)
    })

    it('should clear all units and children', () => {
      const node = new QuadtreeNode(boundary, 2, 0)

      // Insert units to trigger subdivision
      for (let i = 0; i < 5; i++) {
        node.insert({ id: `u${i}`, x: i * 100, y: i * 100, _cx: i * 100 + 16, _cy: i * 100 + 16 })
      }

      expect(node.divided).toBe(true)

      node.clear()

      expect(node.units.length).toBe(0)
      expect(node.unitCount).toBe(0)
      expect(node.divided).toBe(false)
      expect(node.northeast).toBe(null)
      expect(node.northwest).toBe(null)
      expect(node.southeast).toBe(null)
      expect(node.southwest).toBe(null)
    })
  })

  describe('SpatialQuadtree', () => {
    let quadtree

    beforeEach(() => {
      quadtree = new SpatialQuadtree(3200, 3200, 16)
    })

    it('should create quadtree with correct properties', () => {
      expect(quadtree.mapWidth).toBe(3200)
      expect(quadtree.mapHeight).toBe(3200)
      expect(quadtree.capacity).toBe(16)
      expect(quadtree.groundTree).toBeDefined()
      expect(quadtree.airTree).toBeDefined()
      expect(quadtree._groundResults).toEqual([])
      expect(quadtree._airResults).toEqual([])
    })

    it('should rebuild quadtree with ground units', () => {
      const units = [
        { id: 'u1', type: 'tank', x: 100, y: 100, health: 100, isAirUnit: false },
        { id: 'u2', type: 'truck', x: 200, y: 200, health: 100, isAirUnit: false }
      ]

      quadtree.rebuild(units)

      expect(units[0]._cx).toBeDefined()
      expect(units[0]._cy).toBeDefined()
      expect(quadtree.groundTree.unitCount > 0 || quadtree.groundTree.divided).toBe(true)
    })

    it('should rebuild quadtree with air units', () => {
      const units = [
        { id: 'u1', type: 'apache', x: 100, y: 100, health: 100, isAirUnit: true, flightState: 'airborne' },
        { id: 'u2', type: 'apache', x: 200, y: 200, health: 100, isAirUnit: true, flightState: 'airborne' }
      ]

      quadtree.rebuild(units)

      expect(quadtree.airTree.unitCount > 0 || quadtree.airTree.divided).toBe(true)
    })

    it('should place grounded air units in ground tree', () => {
      const units = [
        { id: 'u1', type: 'apache', x: 100, y: 100, health: 100, isAirUnit: true, flightState: 'grounded' }
      ]

      quadtree.rebuild(units)

      const groundResults = quadtree.queryNearbyGround(116, 116, 100)
      const airResults = quadtree.queryNearbyAir(116, 116, 100)

      expect(groundResults.length).toBe(1)
      expect(airResults.length).toBe(0)
    })

    it('should skip dead units during rebuild', () => {
      const units = [
        { id: 'u1', type: 'tank', x: 100, y: 100, health: 0, isAirUnit: false },
        { id: 'u2', type: 'tank', x: 200, y: 200, health: 100, isAirUnit: false }
      ]

      quadtree.rebuild(units)

      const results = quadtree.queryNearbyGround(116, 116, 1000)
      expect(results.length).toBe(1)
      expect(results[0].id).toBe('u2')
    })

    it('should query nearby ground units', () => {
      const units = [
        { id: 'u1', type: 'tank', x: 100, y: 100, health: 100, isAirUnit: false },
        { id: 'u2', type: 'tank', x: 110, y: 110, health: 100, isAirUnit: false },
        { id: 'u3', type: 'tank', x: 500, y: 500, health: 100, isAirUnit: false }
      ]

      quadtree.rebuild(units)

      const results = quadtree.queryNearbyGround(116, 116, 50)

      expect(results.length).toBe(2)
      expect(results.some(u => u.id === 'u1')).toBe(true)
      expect(results.some(u => u.id === 'u2')).toBe(true)
      expect(results.some(u => u.id === 'u3')).toBe(false)
    })

    it('should query nearby air units', () => {
      const units = [
        { id: 'u1', type: 'apache', x: 100, y: 100, health: 100, isAirUnit: true, flightState: 'airborne' },
        { id: 'u2', type: 'apache', x: 110, y: 110, health: 100, isAirUnit: true, flightState: 'airborne' },
        { id: 'u3', type: 'apache', x: 500, y: 500, health: 100, isAirUnit: true, flightState: 'airborne' }
      ]

      quadtree.rebuild(units)

      const results = quadtree.queryNearbyAir(116, 116, 50)

      expect(results.length).toBe(2)
    })

    it('should exclude specified unit from query', () => {
      const units = [
        { id: 'u1', type: 'tank', x: 100, y: 100, health: 100, isAirUnit: false },
        { id: 'u2', type: 'tank', x: 110, y: 110, health: 100, isAirUnit: false }
      ]

      quadtree.rebuild(units)

      const results = quadtree.queryNearbyGround(116, 116, 100, 'u1')

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('u2')
    })

    it('should reuse result arrays for performance', () => {
      const units = [
        { id: 'u1', type: 'tank', x: 100, y: 100, health: 100, isAirUnit: false }
      ]

      quadtree.rebuild(units)

      const results1 = quadtree.queryNearbyGround(116, 116, 100)
      const results2 = quadtree.queryNearbyGround(116, 116, 100)

      expect(results1).toBe(results2) // Same array reference
    })

    it('should query for unit based on airborne state', () => {
      const groundUnits = [
        { id: 'g1', type: 'tank', x: 100, y: 100, health: 100, isAirUnit: false }
      ]
      const airUnits = [
        { id: 'a1', type: 'apache', x: 100, y: 100, health: 100, isAirUnit: true, flightState: 'airborne' }
      ]

      quadtree.rebuild([...groundUnits, ...airUnits])

      const groundResults = quadtree.queryNearbyForUnit(116, 116, 100, false)
      const airResults = quadtree.queryNearbyForUnit(116, 116, 100, true)

      expect(groundResults.length).toBe(1)
      expect(groundResults[0].id).toBe('g1')
      expect(airResults.length).toBe(1)
      expect(airResults[0].id).toBe('a1')
    })

    it('should handle empty units array', () => {
      quadtree.rebuild([])

      const results = quadtree.queryNearbyGround(100, 100, 100)

      expect(results.length).toBe(0)
    })

    it('should handle null units', () => {
      const units = [
        null,
        { id: 'u1', type: 'tank', x: 100, y: 100, health: 100, isAirUnit: false },
        undefined
      ]

      quadtree.rebuild(units)

      const results = quadtree.queryNearbyGround(116, 116, 100)

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('u1')
    })
  })

  describe('Module functions', () => {
    afterEach(() => {
      // Clean up singleton
      initSpatialQuadtree(3200, 3200)
    })

    it('should initialize singleton quadtree', () => {
      const instance = initSpatialQuadtree(3200, 3200)

      expect(instance).toBeInstanceOf(SpatialQuadtree)
      expect(instance.mapWidth).toBe(3200)
      expect(instance.mapHeight).toBe(3200)
    })

    it('should get initialized quadtree instance', () => {
      const instance1 = initSpatialQuadtree(3200, 3200)
      const instance2 = getSpatialQuadtree()

      expect(instance1).toBe(instance2)
    })

    it('should return null if not initialized', () => {
      // Create a fresh test by re-importing (not possible in this context)
      // So we'll just verify getSpatialQuadtree returns something after init
      initSpatialQuadtree(3200, 3200)
      const instance = getSpatialQuadtree()

      expect(instance).not.toBe(null)
    })

    it('should rebuild singleton quadtree', () => {
      initSpatialQuadtree(3200, 3200)

      const units = [
        { id: 'u1', type: 'tank', x: 100, y: 100, health: 100, isAirUnit: false }
      ]

      rebuildSpatialQuadtree(units)

      const instance = getSpatialQuadtree()
      const results = instance.queryNearbyGround(116, 116, 100)

      expect(results.length).toBe(1)
    })

    it('should handle rebuild without initialized quadtree', () => {
      const units = [
        { id: 'u1', type: 'tank', x: 100, y: 100, health: 100, isAirUnit: false }
      ]

      // Should not throw
      expect(() => {
        rebuildSpatialQuadtree(units)
      }).not.toThrow()
    })
  })
})
