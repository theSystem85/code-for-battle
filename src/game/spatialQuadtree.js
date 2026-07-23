// Spatial Quadtree Module - Ultra-efficient spatial partitioning for collision detection
// Reduces collision checks from O(n²) to O(n × k) where k ≈ 4-8 neighbors
// Optimized for minimal allocations and fast queries

import { TILE_SIZE } from '../config.js'

// Default capacity before a node splits into children
const DEFAULT_CAPACITY = 16
// Maximum depth to prevent excessive subdivision
const MAX_DEPTH = 6

/**
 * Axis-Aligned Bounding Box for quadtree regions
 * Inlined calculations for performance
 */
export class AABB {
  constructor(x, y, width, height) {
    this.x = x
    this.y = y
    this.width = width
    this.height = height
    this.halfWidth = width * 0.5
    this.halfHeight = height * 0.5
    this.centerX = x + this.halfWidth
    this.centerY = y + this.halfHeight
    this.right = x + width
    this.bottom = y + height
  }

  /**
   * Check if a point is within this AABB (inlined for speed)
   */
  containsPoint(px, py) {
    return px >= this.x && px < this.right && py >= this.y && py < this.bottom
  }

  /**
   * Check if a circle intersects this AABB (optimized)
   */
  intersectsCircle(cx, cy, radiusSq) {
    // Find closest point on AABB to circle center
    let closestX = cx
    let closestY = cy

    if (cx < this.x) closestX = this.x
    else if (cx > this.right) closestX = this.right

    if (cy < this.y) closestY = this.y
    else if (cy > this.bottom) closestY = this.bottom

    const dx = cx - closestX
    const dy = cy - closestY
    return (dx * dx + dy * dy) <= radiusSq
  }
}

/**
 * Quadtree node for spatial partitioning
 * Optimized: no array spreading, direct result accumulation
 */
export class QuadtreeNode {
  constructor(boundary, capacity = DEFAULT_CAPACITY, depth = 0) {
    this.boundary = boundary
    this.capacity = capacity
    this.depth = depth
    this.units = []
    this.unitCount = 0
    this.divided = false

    // Child quadrants (lazily initialized)
    this.northeast = null
    this.northwest = null
    this.southeast = null
    this.southwest = null
  }

  /**
   * Subdivide this node into 4 children
   */
  subdivide() {
    const b = this.boundary
    const hw = b.halfWidth
    const hh = b.halfHeight
    const newDepth = this.depth + 1

    this.northeast = new QuadtreeNode(new AABB(b.x + hw, b.y, hw, hh), this.capacity, newDepth)
    this.northwest = new QuadtreeNode(new AABB(b.x, b.y, hw, hh), this.capacity, newDepth)
    this.southeast = new QuadtreeNode(new AABB(b.x + hw, b.y + hh, hw, hh), this.capacity, newDepth)
    this.southwest = new QuadtreeNode(new AABB(b.x, b.y + hh, hw, hh), this.capacity, newDepth)

    this.divided = true

    // Re-insert existing units into children
    for (let i = 0; i < this.unitCount; i++) {
      this._insertIntoChildren(this.units[i])
    }
    this.units.length = 0
    this.unitCount = 0
  }

  /**
   * Insert a unit into the appropriate child node (inlined for speed)
   */
  _insertIntoChildren(unit) {
    const cx = unit._cx
    const cy = unit._cy
    const b = this.boundary

    if (cx >= b.centerX) {
      if (cy < b.centerY) {
        this.northeast.insert(unit)
      } else {
        this.southeast.insert(unit)
      }
    } else {
      if (cy < b.centerY) {
        this.northwest.insert(unit)
      } else {
        this.southwest.insert(unit)
      }
    }
  }

  /**
   * Insert a unit into this quadtree
   */
  insert(unit) {
    const cx = unit._cx
    const cy = unit._cy
    const b = this.boundary

    // Ignore units outside boundary
    if (cx < b.x || cx >= b.right || cy < b.y || cy >= b.bottom) {
      return false
    }

    // If we have room and haven't divided, add here
    if (!this.divided) {
      if (this.unitCount < this.capacity || this.depth >= MAX_DEPTH) {
        this.units[this.unitCount++] = unit
        return true
      }
      this.subdivide()
    }

    // Insert into appropriate child
    this._insertIntoChildren(unit)
    return true
  }

  /**
   * Query all units within a circular range - NO ALLOCATIONS version
   * Results are pushed directly into the provided array
   * @param {number} cx - Center X of query circle
   * @param {number} cy - Center Y of query circle
   * @param {number} radiusSq - SQUARED radius of query circle
   * @param {string|null} excludeId - Unit ID to exclude
   * @param {Array} results - Array to push results into
   */
  queryCircleInto(cx, cy, radiusSq, excludeId, results) {
    // Early exit if circle doesn't intersect this boundary
    if (!this.boundary.intersectsCircle(cx, cy, radiusSq)) {
      return
    }

    // Check units in this node
    for (let i = 0; i < this.unitCount; i++) {
      const unit = this.units[i]
      if (excludeId && unit.id === excludeId) continue

      const dx = unit._cx - cx
      const dy = unit._cy - cy

      if (dx * dx + dy * dy <= radiusSq) {
        results.push(unit)
      }
    }

    // Query children if subdivided
    if (this.divided) {
      this.northeast.queryCircleInto(cx, cy, radiusSq, excludeId, results)
      this.northwest.queryCircleInto(cx, cy, radiusSq, excludeId, results)
      this.southeast.queryCircleInto(cx, cy, radiusSq, excludeId, results)
      this.southwest.queryCircleInto(cx, cy, radiusSq, excludeId, results)
    }
  }

  /**
   * Clear all units from this node and children
   */
  clear() {
    this.units.length = 0
    this.unitCount = 0

    if (this.divided) {
      this.northeast.clear()
      this.northwest.clear()
      this.southeast.clear()
      this.southwest.clear()

      this.northeast = null
      this.northwest = null
      this.southeast = null
      this.southwest = null
      this.divided = false
    }
  }
}

/**
 * Main Quadtree class for spatial unit queries
 * Optimized: pre-computes unit centers, reuses result arrays
 */
export class SpatialQuadtree {
  constructor(mapWidth, mapHeight, capacity = DEFAULT_CAPACITY) {
    this.mapWidth = mapWidth
    this.mapHeight = mapHeight
    this.capacity = capacity

    // Separate trees for ground and air units
    this.groundTree = new QuadtreeNode(new AABB(0, 0, mapWidth, mapHeight), capacity, 0)
    this.airTree = new QuadtreeNode(new AABB(0, 0, mapWidth, mapHeight), capacity, 0)

    // Reusable result arrays to avoid allocations
    this._groundResults = []
    this._airResults = []

    // Half tile size cached
    this._halfTile = TILE_SIZE * 0.5
  }

  /**
   * Rebuild the quadtree with new units
   * Called once per frame before collision detection
   * Pre-computes unit centers for faster queries
   * @param {Array} units - All units in the game
   */
  rebuild(units) {
    this.groundTree.clear()
    this.airTree.clear()

    const halfTile = this._halfTile

    for (let i = 0, len = units.length; i < len; i++) {
      const unit = units[i]
      if (!unit || unit.health <= 0 || unit.embarkedOnId || unit.transportTransfer) continue

      // Pre-compute and cache center coordinates on the unit
      unit._cx = unit.x + halfTile
      unit._cy = unit.y + halfTile

      // Categorize by flight state
      const isAirborne = unit.isAirUnit && unit.flightState !== 'grounded'

      if (isAirborne) {
        this.airTree.insert(unit)
      } else {
        this.groundTree.insert(unit)
      }
    }
  }

  /**
   * Query nearby ground units within a circular range
   * Returns a reused array - DO NOT STORE, copy if needed
   * @param {number} x - Center X (pixel coordinates)
   * @param {number} y - Center Y (pixel coordinates)
   * @param {number} radius - Search radius in pixels
   * @param {string|null} excludeId - Unit ID to exclude from results
   * @returns {Array} Nearby ground units (reused array!)
   */
  queryNearbyGround(x, y, radius, excludeId = null) {
    this._groundResults.length = 0
    const radiusSq = radius * radius
    this.groundTree.queryCircleInto(x, y, radiusSq, excludeId, this._groundResults)
    return this._groundResults
  }

  /**
   * Query nearby air units within a circular range
   * @param {number} x - Center X (pixel coordinates)
   * @param {number} y - Center Y (pixel coordinates)
   * @param {number} radius - Search radius in pixels
   * @param {string|null} excludeId - Unit ID to exclude from results
   * @returns {Array} Nearby air units (reused array!)
   */
  queryNearbyAir(x, y, radius, excludeId = null) {
    this._airResults.length = 0
    const radiusSq = radius * radius
    this.airTree.queryCircleInto(x, y, radiusSq, excludeId, this._airResults)
    return this._airResults
  }

  /**
   * Query nearby units for a specific unit (same domain - ground or air)
   * @param {number} x - Center X (pixel coordinates)
   * @param {number} y - Center Y (pixel coordinates)
   * @param {number} radius - Search radius in pixels
   * @param {boolean} isAirborne - Whether querying for airborne units
   * @param {string|null} excludeId - Unit ID to exclude
   * @returns {Array} Nearby units
   */
  queryNearbyForUnit(x, y, radius, isAirborne, excludeId = null) {
    if (isAirborne) {
      return this.queryNearbyAir(x, y, radius, excludeId)
    } else {
      return this.queryNearbyGround(x, y, radius, excludeId)
    }
  }
}

// Singleton instance for the game
let spatialQuadtreeInstance = null

/**
 * Initialize the spatial quadtree with map dimensions
 * @param {number} mapWidth - Map width in pixels
 * @param {number} mapHeight - Map height in pixels
 */
export function initSpatialQuadtree(mapWidth, mapHeight) {
  spatialQuadtreeInstance = new SpatialQuadtree(mapWidth, mapHeight)
  return spatialQuadtreeInstance
}

/**
 * Get the current spatial quadtree instance
 * @returns {SpatialQuadtree|null}
 */
export function getSpatialQuadtree() {
  return spatialQuadtreeInstance
}

/**
 * Rebuild the spatial quadtree with the current units
 * Should be called once per frame before collision detection
 * @param {Array} units - All units in the game
 */
export function rebuildSpatialQuadtree(units) {
  if (spatialQuadtreeInstance) {
    spatialQuadtreeInstance.rebuild(units)
  }
}
