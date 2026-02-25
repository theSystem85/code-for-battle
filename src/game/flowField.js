// Flow Field Module - On-demand flow fields for chokepoint navigation
// Generates local direction vectors to guide units through narrow passages

import { TILE_SIZE, DIRECTIONS } from '../config.js'
import { hasBlockingBuilding } from '../utils/buildingPassability.js'

// Flow field configuration
const FLOW_FIELD_TTL = 5000 // Time-to-live for cached flow fields (ms)
const CHOKEPOINT_THRESHOLD = 3 // Tiles narrower than this are considered chokepoints
const FLOW_FIELD_RADIUS = 8 // Radius around chokepoint to generate flow field
const MAX_CACHED_FLOW_FIELDS = 10 // Maximum number of cached flow fields

/**
 * Flow field entry for a single tile
 * Contains direction vector and distance to destination
 */
class FlowFieldEntry {
  constructor(dirX = 0, dirY = 0, distance = Infinity) {
    this.dirX = dirX
    this.dirY = dirY
    this.distance = distance
  }
}

/**
 * A flow field for navigating through a specific chokepoint
 */
class FlowField {
  constructor(centerX, centerY, destX, destY, radius) {
    this.centerX = centerX
    this.centerY = centerY
    this.destX = destX
    this.destY = destY
    this.radius = radius
    this.createdAt = performance.now()
    this.lastUsed = this.createdAt

    // 2D grid of flow entries, indexed relative to center
    this.entries = new Map()
  }

  /**
   * Get the flow entry for a tile position
   */
  getEntry(tileX, tileY) {
    const key = `${tileX},${tileY}`
    return this.entries.get(key) || null
  }

  /**
   * Set the flow entry for a tile position
   */
  setEntry(tileX, tileY, entry) {
    const key = `${tileX},${tileY}`
    this.entries.set(key, entry)
  }

  /**
   * Check if this flow field covers a tile position
   */
  containsTile(tileX, tileY) {
    const dx = Math.abs(tileX - this.centerX)
    const dy = Math.abs(tileY - this.centerY)
    return dx <= this.radius && dy <= this.radius
  }

  /**
   * Check if this flow field is still valid
   */
  isValid(now = performance.now()) {
    return now - this.createdAt < FLOW_FIELD_TTL
  }

  /**
   * Mark this flow field as recently used
   */
  touch() {
    this.lastUsed = performance.now()
  }

  /**
   * Get the flow direction at a pixel position
   * @returns {{dirX: number, dirY: number, distance: number} | null}
   */
  getDirectionAt(pixelX, pixelY) {
    const tileX = Math.floor(pixelX / TILE_SIZE)
    const tileY = Math.floor(pixelY / TILE_SIZE)

    const entry = this.getEntry(tileX, tileY)
    if (!entry) return null

    this.touch()
    return { dirX: entry.dirX, dirY: entry.dirY, distance: entry.distance }
  }
}

/**
 * Flow Field Manager - Creates and caches flow fields for chokepoints
 */
export class FlowFieldManager {
  constructor() {
    // Cache of flow fields by destination
    this.flowFields = new Map()
    // Detected chokepoints
    this.chokepoints = new Map()
  }

  /**
   * Clear all cached flow fields
   */
  clear() {
    this.flowFields.clear()
    this.chokepoints.clear()
  }

  /**
   * Clean up expired flow fields
   */
  cleanup() {
    const now = performance.now()
    const keysToDelete = []

    for (const [key, field] of this.flowFields) {
      if (!field.isValid(now)) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      this.flowFields.delete(key)
    }

    // Limit cache size
    if (this.flowFields.size > MAX_CACHED_FLOW_FIELDS) {
      // Remove least recently used
      const entries = Array.from(this.flowFields.entries())
      entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed)

      while (this.flowFields.size > MAX_CACHED_FLOW_FIELDS) {
        const [key] = entries.shift()
        this.flowFields.delete(key)
      }
    }
  }

  /**
   * Detect if a tile is part of a chokepoint
   * A chokepoint is a passable tile with impassable tiles on opposite sides
   */
  detectChokepoint(tileX, tileY, mapGrid) {
    if (!this.isTilePassable(mapGrid, tileX, tileY)) {
      return null
    }

    // Check for horizontal corridor (blocked above and below)
    const blockedNorth = !this.isTilePassable(mapGrid, tileX, tileY - 1)
    const blockedSouth = !this.isTilePassable(mapGrid, tileX, tileY + 1)
    const isHorizontalCorridor = blockedNorth && blockedSouth

    // Check for vertical corridor (blocked left and right)
    const blockedWest = !this.isTilePassable(mapGrid, tileX - 1, tileY)
    const blockedEast = !this.isTilePassable(mapGrid, tileX + 1, tileY)
    const isVerticalCorridor = blockedWest && blockedEast

    if (isHorizontalCorridor || isVerticalCorridor) {
      // Measure corridor width
      let width = 1

      if (isHorizontalCorridor) {
        // Count passable tiles horizontally
        for (let dx = 1; dx <= CHOKEPOINT_THRESHOLD; dx++) {
          if (this.isTilePassable(mapGrid, tileX + dx, tileY) &&
              !this.isTilePassable(mapGrid, tileX + dx, tileY - 1) &&
              !this.isTilePassable(mapGrid, tileX + dx, tileY + 1)) {
            width++
          } else break
        }
        for (let dx = -1; dx >= -CHOKEPOINT_THRESHOLD; dx--) {
          if (this.isTilePassable(mapGrid, tileX + dx, tileY) &&
              !this.isTilePassable(mapGrid, tileX + dx, tileY - 1) &&
              !this.isTilePassable(mapGrid, tileX + dx, tileY + 1)) {
            width++
          } else break
        }
      } else {
        // Count passable tiles vertically
        for (let dy = 1; dy <= CHOKEPOINT_THRESHOLD; dy++) {
          if (this.isTilePassable(mapGrid, tileX, tileY + dy) &&
              !this.isTilePassable(mapGrid, tileX - 1, tileY + dy) &&
              !this.isTilePassable(mapGrid, tileX + 1, tileY + dy)) {
            width++
          } else break
        }
        for (let dy = -1; dy >= -CHOKEPOINT_THRESHOLD; dy--) {
          if (this.isTilePassable(mapGrid, tileX, tileY + dy) &&
              !this.isTilePassable(mapGrid, tileX - 1, tileY + dy) &&
              !this.isTilePassable(mapGrid, tileX + 1, tileY + dy)) {
            width++
          } else break
        }
      }

      if (width <= CHOKEPOINT_THRESHOLD) {
        return {
          x: tileX,
          y: tileY,
          type: isHorizontalCorridor ? 'horizontal' : 'vertical',
          width
        }
      }
    }

    return null
  }

  /**
   * Check if a tile is passable
   */
  isTilePassable(mapGrid, tileX, tileY) {
    if (tileY < 0 || tileY >= mapGrid.length) return false
    if (tileX < 0 || tileX >= mapGrid[0].length) return false

    const tile = mapGrid[tileY][tileX]
    if (!tile) return false

    if (typeof tile === 'number') {
      return tile === 0
    }

    return tile.type !== 'water' &&
           tile.type !== 'rock' &&
           !hasBlockingBuilding(tile) &&
           !tile.seedCrystal
  }

  /**
   * Generate a flow field from a chokepoint area to a destination
   * Uses Dijkstra-like wavefront expansion from destination
   */
  generateFlowField(centerX, centerY, destX, destY, mapGrid, occupancyMap = null) {
    const key = `${centerX},${centerY}->${destX},${destY}`

    // Check cache
    const cached = this.flowFields.get(key)
    if (cached && cached.isValid()) {
      cached.touch()
      return cached
    }

    const flowField = new FlowField(centerX, centerY, destX, destY, FLOW_FIELD_RADIUS)

    // BFS from destination backwards to compute distances
    const queue = []
    const visited = new Set()

    // Initialize destination
    const destEntry = new FlowFieldEntry(0, 0, 0)
    flowField.setEntry(destX, destY, destEntry)
    queue.push({ x: destX, y: destY, dist: 0 })
    visited.add(`${destX},${destY}`)

    // Wavefront expansion
    while (queue.length > 0) {
      const current = queue.shift()

      // Check all 8 neighbors
      for (const dir of DIRECTIONS) {
        const nx = current.x + dir.x
        const ny = current.y + dir.y
        const nkey = `${nx},${ny}`

        if (visited.has(nkey)) continue

        // Only process tiles within flow field radius of center
        const dcx = Math.abs(nx - centerX)
        const dcy = Math.abs(ny - centerY)
        if (dcx > FLOW_FIELD_RADIUS || dcy > FLOW_FIELD_RADIUS) continue

        // Check if tile is passable
        if (!this.isTilePassable(mapGrid, nx, ny)) continue

        // Check occupancy (but don't block, just increase cost slightly)
        let moveCost = Math.hypot(dir.x, dir.y)
        if (occupancyMap && occupancyMap[ny] && occupancyMap[ny][nx] > 0) {
          moveCost += 0.5 // Slight penalty for occupied tiles
        }

        const newDist = current.dist + moveCost

        // Compute direction pointing back towards current (towards destination)
        const length = Math.hypot(dir.x, dir.y) || 1
        const entry = new FlowFieldEntry(-dir.x / length, -dir.y / length, newDist)

        flowField.setEntry(nx, ny, entry)
        visited.add(nkey)
        queue.push({ x: nx, y: ny, dist: newDist })
      }
    }

    // Cache the flow field
    this.flowFields.set(key, flowField)
    this.cleanup()

    return flowField
  }

  /**
   * Get flow direction for a unit at a given position
   * Returns null if no flow field covers this position
   */
  getFlowDirectionForUnit(unit, destX, destY, mapGrid, occupancyMap = null) {
    const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

    // Check if we're near a chokepoint
    const chokepoint = this.detectChokepoint(tileX, tileY, mapGrid)

    if (!chokepoint) {
      // Not in a chokepoint, use regular pathfinding
      return null
    }

    // Generate or get cached flow field
    const flowField = this.generateFlowField(
      chokepoint.x,
      chokepoint.y,
      destX,
      destY,
      mapGrid,
      occupancyMap
    )

    return flowField.getDirectionAt(unit.x + TILE_SIZE / 2, unit.y + TILE_SIZE / 2)
  }

  /**
   * Check if units are crowding at a chokepoint
   * @param {number} tileX - Tile X coordinate
   * @param {number} tileY - Tile Y coordinate
   * @param {Array} nearbyUnits - Units near this tile
   * @param {number} threshold - Number of units to consider crowded
   */
  isChokepointCrowded(tileX, tileY, nearbyUnits, threshold = 3) {
    let count = 0
    for (const unit of nearbyUnits) {
      const unitTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
      const unitTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

      const dist = Math.max(Math.abs(unitTileX - tileX), Math.abs(unitTileY - tileY))
      if (dist <= 2) {
        count++
        if (count >= threshold) return true
      }
    }
    return false
  }
}

// Singleton instance
let flowFieldManagerInstance = null

/**
 * Get the flow field manager singleton
 */
export function getFlowFieldManager() {
  if (!flowFieldManagerInstance) {
    flowFieldManagerInstance = new FlowFieldManager()
  }
  return flowFieldManagerInstance
}

/**
 * Clear all flow fields (call on map change)
 */
export function clearFlowFields() {
  if (flowFieldManagerInstance) {
    flowFieldManagerInstance.clear()
  }
}
