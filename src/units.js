// units.js
import {
  TILE_SIZE,
  UNIT_COSTS,
  UNIT_PROPERTIES,
  PATHFINDING_LIMIT,
  DIRECTIONS,
  MAX_SPAWN_SEARCH_DISTANCE,
  STREET_PATH_COST,
  UNIT_GAS_PROPERTIES,
  TANKER_SUPPLY_CAPACITY,
  UNIT_AMMO_CAPACITY,
  AMMO_TRUCK_CARGO
} from './config.js'
import { logPerformance } from './performanceUtils.js'
import { getUniqueId, updateUnitSpeedModifier, getUnitCost, getBuildingIdentifier } from './utils.js'
import { initializeUnitMovement } from './game/unifiedMovement.js'
import { initializeHowitzerGun } from './game/howitzerGunController.js'
import { gameState } from './gameState.js'
import { getHelipadLandingCenter, getHelipadLandingTile, getHelipadLandingTopLeft } from './utils/helipadUtils.js'
import { isFriendlyMineBlocking } from './game/mineSystem.js'
import { getSpatialQuadtree } from './game/spatialQuadtree.js'
import { recordUnitCreated } from './ai-api/transitionCollector.js'
import { hasBlockingBuilding } from './utils/buildingPassability.js'
import {
  ensureAirstripOperations,
  claimAirstripParkingSlot,
  setAirstripSlotOccupant,
  getAirstripRunwayPoints
} from './utils/airstripUtils.js'

// Add a global variable to track if we've already shown the pathfinding warning
let pathfindingWarningShown = false

export const unitCosts = UNIT_COSTS

// Build an occupancy map indicating which tiles are occupied by a unit.
export function buildOccupancyMap(units, mapGrid, textureManager = null) {
  const safeUnits = Array.isArray(units) ? units : []

  if (!Array.isArray(mapGrid) || mapGrid.length === 0 || !Array.isArray(mapGrid[0])) {
    if (window?.logger?.warn) {
      window.logger.warn('buildOccupancyMap: mapGrid not ready or malformed, skipping rebuild', {
        hasMapGrid: Boolean(mapGrid),
        rows: Array.isArray(mapGrid) ? mapGrid.length : 0
      })
    } else if (window?.logger) {
      window.logger('buildOccupancyMap: mapGrid not ready or malformed, skipping rebuild')
    }
    return null
  }

  const height = mapGrid.length
  const width = mapGrid[0].length
  const occupancy = Array.from({ length: height }, () => Array(width).fill(0))
  let impassableGrassCount = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = mapGrid[y][x]

      // Check if this is an impassable grass tile
      let isImpassableGrass = false
      if (tile.type === 'land' && textureManager && textureManager.isLandTileImpassable) {
        isImpassableGrass = textureManager.isLandTileImpassable(x, y)
        if (isImpassableGrass) {
          impassableGrassCount++
        }
      }

      occupancy[y][x] =
        tile.type === 'water' ||
        tile.type === 'rock' ||
        tile.seedCrystal ||
        hasBlockingBuilding(tile) ||
        isImpassableGrass ? 1 : 0
    }
  }

  if (impassableGrassCount > 0) {
    window.logger(`Occupancy map built: ${impassableGrassCount} impassable grass tiles found`)
  }

  safeUnits.forEach(unit => {
    if (unit.isAirUnit && unit.flightState !== 'grounded') {
      return
    }
    const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
    if (
      tileY >= 0 &&
      tileY < height &&
      tileX >= 0 &&
      tileX < width
    ) {
      occupancy[tileY][tileX] += 1
    }
  })

  if (gameState && Array.isArray(gameState.unitWrecks)) {
    gameState.unitWrecks.forEach(wreck => {
      const tileX = Math.floor((wreck.x + TILE_SIZE / 2) / TILE_SIZE)
      const tileY = Math.floor((wreck.y + TILE_SIZE / 2) / TILE_SIZE)
      if (
        tileY >= 0 &&
        tileY < height &&
        tileX >= 0 &&
        tileX < width
      ) {
        occupancy[tileY][tileX] = (occupancy[tileY][tileX] || 0) + 1
      }
    })
  }

  return occupancy
}

export function initializeOccupancyMap(units, mapGrid, textureManager = null) {
  return buildOccupancyMap(units, mapGrid, textureManager)
}

// Function to rebuild occupancy map after textures are loaded
export function rebuildOccupancyMapWithTextures(units, mapGrid, textureManager) {
  if (textureManager && textureManager.allTexturesLoaded) {
    window.logger('Rebuilding occupancy map with loaded textures...')
    return buildOccupancyMap(units, mapGrid, textureManager)
  }
  return null
}

export const updateUnitOccupancy = logPerformance(function updateUnitOccupancy(unit, prevTileX, prevTileY, occupancyMap) {
  if (!occupancyMap) return

  // Skip occupancy updates for air units that are:
  // 1. Not grounded (airborne), OR
  // 2. Grounded but don't have ground occupancy applied (helipad Apaches)
  if (unit.isAirUnit && (unit.flightState !== 'grounded' || unit.groundedOccupancyApplied === false)) {
    return
  }

  // Remove occupancy from previous position (using center coordinates)
  if (
    prevTileY >= 0 &&
    prevTileY < occupancyMap.length &&
    prevTileX >= 0 &&
    prevTileX < occupancyMap[0].length
  ) {
    occupancyMap[prevTileY][prevTileX] = Math.max(
      0,
      (occupancyMap[prevTileY][prevTileX] || 0) - 1
    )
  }

  // Add occupancy to current position (using center coordinates)
  const currentTileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const currentTileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

  if (
    currentTileY >= 0 &&
    currentTileY < occupancyMap.length &&
    currentTileX >= 0 &&
    currentTileX < occupancyMap[0].length
  ) {
    occupancyMap[currentTileY][currentTileX] =
      (occupancyMap[currentTileY][currentTileX] || 0) + 1
  }
}, false)

export function removeUnitOccupancy(unit, occupancyMap, options = {}) {
  if (!occupancyMap) return
  const { ignoreFlightState = false } = options
  if (!ignoreFlightState && unit.isAirUnit && unit.flightState !== 'grounded') {
    return
  }
  const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
  if (
    tileY >= 0 &&
    tileY < occupancyMap.length &&
    tileX >= 0 &&
    tileX < occupancyMap[0].length
  ) {
    occupancyMap[tileY][tileX] = Math.max(0, (occupancyMap[tileY][tileX] || 0) - 1)
  }
}

// A simple binary heap (min-heap) for nodes based on f value.
class MinHeap {
  constructor() {
    this.content = []
  }
  push(element) {
    this.content.push(element)
    this.bubbleUp(this.content.length - 1)
  }
  pop() {
    const result = this.content[0]
    const end = this.content.pop()
    if (this.content.length > 0) {
      this.content[0] = end
      this.sinkDown(0)
    }
    return result
  }
  bubbleUp(n) {
    const element = this.content[n]
    while (n > 0) {
      const parentN = Math.floor((n - 1) / 2)
      const parent = this.content[parentN]
      if (element.f >= parent.f) break
      this.content[parentN] = element
      this.content[n] = parent
      n = parentN
    }
  }
  sinkDown(n) {
    const length = this.content.length
    const element = this.content[n]
    while (true) {
      const child2N = (n + 1) * 2
      const child1N = child2N - 1
      let swap = null
      if (child1N < length) {
        const child1 = this.content[child1N]
        if (child1.f < element.f) {
          swap = child1N
        }
      }
      if (child2N < length) {
        const child2 = this.content[child2N]
        if ((swap === null ? element.f : this.content[child1N].f) > child2.f) {
          swap = child2N
        }
      }
      if (swap === null) break
      this.content[n] = this.content[swap]
      this.content[swap] = element
      n = swap
    }
  }
  size() {
    return this.content.length
  }
}

// Locate the nearest passable and unoccupied tile to the given coordinates.
// Searches in expanding squares up to a limited radius.
function findNearestFreeTile(x, y, mapGrid, occupancyMap, maxDistance = 5, options = {}) {
  for (let distance = 0; distance <= maxDistance; distance++) {
    for (let dx = -distance; dx <= distance; dx++) {
      for (let dy = -distance; dy <= distance; dy++) {
        // Only check perimeter of the square for this distance
        if (Math.abs(dx) !== distance && Math.abs(dy) !== distance) continue

        const checkX = x + dx
        const checkY = y + dy

        if (
          checkX >= 0 &&
          checkY >= 0 &&
          checkX < mapGrid[0].length &&
          checkY < mapGrid.length
        ) {
          const passable = isTilePassableForMode(mapGrid, checkX, checkY, options)
          const occupied = isTileBlockedForUnit(occupancyMap, checkX, checkY, options)
          if (passable && !occupied) {
            return { x: checkX, y: checkY }
          }
        }
      }
    }
  }
  return null
}

// A* pathfinding with diagonal movement and cost advantage for street tiles.
// Early exits if destination is out of bounds or impassable.
export const findPath = logPerformance(function findPath(start, end, mapGrid, occupancyMap = null, pathFindingLimit = PATHFINDING_LIMIT, options = null) {
  // Validate input coordinates
  if (!start || !end ||
      typeof start.x !== 'number' || typeof start.y !== 'number' ||
      typeof end.x !== 'number' || typeof end.y !== 'number' ||
      !isFinite(start.x) || !isFinite(start.y) ||
      !isFinite(end.x) || !isFinite(end.y)) {
    window.logger.warn('findPath: invalid coordinates provided', { start, end })
    return []
  }

  // Validate mapGrid
  if (!mapGrid || !Array.isArray(mapGrid) || mapGrid.length === 0 || !mapGrid[0] || !Array.isArray(mapGrid[0])) {
    window.logger.warn('findPath: invalid mapGrid provided', { mapGrid })
    return []
  }

  if (
    start.x < 0 || start.y < 0 ||
    start.x >= mapGrid[0].length || start.y >= mapGrid.length ||
    end.x < 0 || end.y < 0 ||
    end.x >= mapGrid[0].length || end.y >= mapGrid.length
  ) {
    if (!pathfindingWarningShown) {
      window.logger.warn('findPath: start or destination tile out of bounds', { start, end })
      pathfindingWarningShown = true
    }
    return []
  }
  const contextOptions = options || {}
  const unitOwner = contextOptions.unitOwner ?? start.owner ?? start.ownerId ?? start.playerId ?? start.unitOwner ?? null
  const ignoreFriendlyMines = Boolean(contextOptions.ignoreFriendlyMines)
  const strictDestination = Boolean(contextOptions.strictDestination)
  const streetOnly = Boolean(contextOptions.streetOnly)
  const pathContext = { unitOwner, ignoreFriendlyMines, streetOnly }

  // Begin destination adjustment if blocked or occupied
  let adjustedEnd = { ...end }
  const destTile = mapGrid[adjustedEnd.y][adjustedEnd.x]
  const destType = destTile.type
  const destHasBuilding = hasBlockingBuilding(destTile)
  const destSeedCrystal = destTile.seedCrystal
  const destinationIsStart = adjustedEnd.x === start.x && adjustedEnd.y === start.y
  const destOccupied = !destinationIsStart && isTileBlockedForUnit(occupancyMap, adjustedEnd.x, adjustedEnd.y, pathContext)
  const destModeBlocked = !isTilePassableForMode(mapGrid, adjustedEnd.x, adjustedEnd.y, pathContext)
  if (
    destType === 'water' ||
    destType === 'rock' ||
    destHasBuilding ||
    destSeedCrystal ||
    destOccupied ||
    destModeBlocked
  ) {
    if (strictDestination) {
      return []
    }

    const alt = findNearestFreeTile(adjustedEnd.x, adjustedEnd.y, mapGrid, occupancyMap, 5, pathContext)
    if (alt) {
      adjustedEnd = alt
    } else {
      // Only show the warning once and include detailed information to help diagnose
      if (!pathfindingWarningShown) {
        window.logger.warn('findPath: destination tile not passable and no adjacent free tile found', {
          start,
          end,
          destinationType: destType,
          occupied: destOccupied,
          surroundingTiles: DIRECTIONS.map(dir => {
            const x = adjustedEnd.x + dir.x
            const y = adjustedEnd.y + dir.y
            if (x >= 0 && y >= 0 && x < mapGrid[0].length && y < mapGrid.length) {
              return {
                x,
                y,
                type: mapGrid[y][x].type,
                building: mapGrid[y][x].building
                  ? {
                    type: mapGrid[y][x].building.type,
                    owner: mapGrid[y][x].building.owner
                  }
                  : null,
                occupied: occupancyMap && occupancyMap[y][x]
              }
            }
            return { x, y, outOfBounds: true }
          })
        })
        pathfindingWarningShown = true
      }
      return []
    }
  }

  // Initialize A* search.
  const openHeap = new MinHeap()
  const closedSet = new Set()
  const startNode = {
    x: start.x,
    y: start.y,
    g: 0,
    h: Math.hypot(adjustedEnd.x - start.x, adjustedEnd.y - start.y),
    f: 0,
    parent: null
  }
  startNode.f = startNode.g + startNode.h
  openHeap.push(startNode)

  let finalPath = []

  // Removed any maximum iteration check to ensure players' units can always move.
  let nodesExplored = 0
  while (openHeap.size() > 0) {
    const currentNode = openHeap.pop()
    const currentKey = `${currentNode.x},${currentNode.y}`

    if (currentNode.x === adjustedEnd.x && currentNode.y === adjustedEnd.y) {
      // Reconstruct path.
      const path = []
      let curr = currentNode
      while (curr) {
        path.push({ x: curr.x, y: curr.y })
        curr = curr.parent
      }
      finalPath = path.reverse()
      break
    }

    closedSet.add(currentKey)
    const neighbors = getNeighbors(currentNode, mapGrid)
    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.x},${neighbor.y}`
      if (closedSet.has(neighborKey)) continue
      if (hasDiagonalCornerBlocker(currentNode, neighbor, mapGrid, occupancyMap, start, pathContext)) {
        continue
      }
      if (!isTilePassableForMode(mapGrid, neighbor.x, neighbor.y, pathContext)) {
        continue
      }
      // Skip if occupancyMap is provided and the tile is occupied,
      // except when the tile is the starting tile for this path.
      if (
        !(neighbor.x === start.x && neighbor.y === start.y) &&
        isTileOccupied(occupancyMap, neighbor.x, neighbor.y, pathContext)
      ) {
        continue
      }

      const baseCost = Math.hypot(neighbor.x - currentNode.x, neighbor.y - currentNode.y)
      const tileType = mapGrid[neighbor.y][neighbor.x].type
      const terrainCost = tileType === 'street' ? STREET_PATH_COST : 1
      const gScore = currentNode.g + baseCost * terrainCost
      let foundInHeap = false
      for (const node of openHeap.content) {
        if (node.x === neighbor.x && node.y === neighbor.y) {
          foundInHeap = true
          if (gScore < node.g) {
            node.g = gScore
            node.f = gScore + node.h
            node.parent = currentNode
            openHeap.bubbleUp(openHeap.content.indexOf(node))
          }
          break
        }
      }
      if (!foundInHeap) {
        const hScore = Math.hypot(adjustedEnd.x - neighbor.x, adjustedEnd.y - neighbor.y)
        const neighborNode = {
          x: neighbor.x,
          y: neighbor.y,
          g: gScore,
          h: hScore,
          f: gScore + hScore,
          parent: currentNode
        }
        openHeap.push(neighborNode)
      }
    }
    nodesExplored++
    if (!strictDestination && nodesExplored > pathFindingLimit) {
      const bestNode = openHeap.content.reduce((best, node) => {
        const fScore = node.g + node.h
        const bestFScore = best.g + best.h
        return fScore < bestFScore ? node : best
      }, openHeap.content[0])
      const path = []
      let curr = bestNode
      while (curr) {
        path.push({ x: curr.x, y: curr.y })
        curr = curr.parent
      }
      finalPath = path.reverse()
      break
    }
  }
  // In strict destination mode, only accept paths that actually reach the destination.
  if (strictDestination) {
    const reachedDestination =
      finalPath.length > 0 &&
      finalPath[finalPath.length - 1].x === adjustedEnd.x &&
      finalPath[finalPath.length - 1].y === adjustedEnd.y

    if (!reachedDestination) {
      return []
    }
  }

  // If no path was found, finalPath will be empty

  // If direct line is available, compare costs
  let directPath = null
  let directCost = Infinity
  if (!streetOnly && isDirectPathClear(start, adjustedEnd, mapGrid, occupancyMap, pathContext)) {
    directPath = getLineTiles(start, adjustedEnd)
    directCost = calculatePathCost(directPath, mapGrid)
  }

  const aStarCost = calculatePathCost(finalPath, mapGrid)

  let chosenPath = finalPath

  if (directPath && (finalPath.length === 0 || directCost <= aStarCost)) {
    chosenPath = directPath
  }

  if (streetOnly) {
    return chosenPath
  }

  return smoothPath(chosenPath, mapGrid, occupancyMap, pathContext)
})

export function findPathForOwner(start, end, mapGrid, occupancyMap = null, owner = null, options = null) {
  const startNode = (owner && start)
    ? { ...start, owner }
    : start
  const baseOptions = owner ? { unitOwner: owner } : {}
  const mergedOptions = options ? { ...baseOptions, ...options } : baseOptions
  return findPath(startNode, end, mapGrid, occupancyMap, undefined, mergedOptions)
}

function isTileWithinBounds(mapGrid, x, y) {
  return y >= 0 && y < mapGrid.length && x >= 0 && x < mapGrid[0].length
}

function isTerrainBlocked(tile) {
  return tile.type === 'water' || tile.type === 'rock' || hasBlockingBuilding(tile) || tile.seedCrystal
}

function isTilePassable(mapGrid, x, y) {
  if (!isTileWithinBounds(mapGrid, x, y)) {
    return false
  }
  const tile = mapGrid[y][x]
  return !isTerrainBlocked(tile)
}

function isTilePassableForMode(mapGrid, x, y, options = {}) {
  if (!isTilePassable(mapGrid, x, y)) {
    return false
  }
  if (!options.streetOnly) {
    return true
  }
  const tile = mapGrid[y][x]
  return tile.type === 'street' || Boolean(tile.airstripStreet)
}

function isTileBlockedForUnit(occupancyMap, x, y, options = {}) {
  if (occupancyMap && occupancyMap[y] && occupancyMap[y][x]) {
    return true
  }

  const owner = options.unitOwner || null
  if (!options.ignoreFriendlyMines && owner && isFriendlyMineBlocking(x, y, owner)) {
    return true
  }

  return false
}

function isTileOccupied(occupancyMap, x, y, options = {}) {
  return isTileBlockedForUnit(occupancyMap, x, y, options)
}

function hasDiagonalCornerBlocker(current, candidate, mapGrid, occupancyMap, start, options = {}) {
  const dx = candidate.x - current.x
  const dy = candidate.y - current.y
  if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) {
    return false
  }

  const checks = [
    { x: current.x + dx, y: current.y },
    { x: current.x, y: current.y + dy }
  ]

  for (const check of checks) {
    if (!isTilePassable(mapGrid, check.x, check.y)) {
      return true
    }
    if (
      occupancyMap &&
      !(start && check.x === start.x && check.y === start.y) &&
      isTileOccupied(occupancyMap, check.x, check.y, options)
    ) {
      return true
    }
  }

  return false
}

function getNeighbors(node, mapGrid) {
  const neighbors = []

  for (const dir of DIRECTIONS) {
    const x = node.x + dir.x
    const y = node.y + dir.y
    if (isTilePassable(mapGrid, x, y)) {
      neighbors.push({ x, y })
    }
  }
  return neighbors
}

// --- Path Utilities ---------------------------------------------------------

// Bresenham-like line algorithm to get all tiles on a line
function getLineTiles(start, end) {
  // Validate input coordinates
  if (!start || !end ||
      typeof start.x !== 'number' || typeof start.y !== 'number' ||
      typeof end.x !== 'number' || typeof end.y !== 'number' ||
      !isFinite(start.x) || !isFinite(start.y) ||
      !isFinite(end.x) || !isFinite(end.y)) {
    window.logger.warn('Invalid coordinates passed to getLineTiles:', { start, end })
    return []
  }

  const tiles = [{ x: start.x, y: start.y }]
  let x = start.x
  let y = start.y
  const dx = Math.abs(end.x - start.x)
  const dy = Math.abs(end.y - start.y)
  const sx = start.x < end.x ? 1 : -1
  const sy = start.y < end.y ? 1 : -1
  let err = dx - dy

  // Prevent infinite loops for very large distances
  let iterations = 0
  const maxIterations = Math.max(dx, dy) + 1

  while (!(x === end.x && y === end.y) && iterations < maxIterations) {
    iterations++
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }

    // Validate coordinates before pushing
    if (isFinite(x) && isFinite(y)) {
      tiles.push({ x, y })
    } else {
      window.logger.warn('Invalid coordinates generated in getLineTiles:', { x, y, start, end })
      break
    }
  }
  return tiles
}

// Check if direct line between tiles is clear of obstacles/units
function isDirectPathClear(start, end, mapGrid, occupancyMap, options = {}) {
  const tiles = getLineTiles(start, end)
  for (let i = 1; i < tiles.length; i++) {
    const { x, y } = tiles[i]
    if (!isTileWithinBounds(mapGrid, x, y)) {
      return false
    }
    const tile = mapGrid[y][x]
    if (isTerrainBlocked(tile)) {
      return false
    }
    if (isTileOccupied(occupancyMap, x, y, options)) {
      return false
    }
    const prev = tiles[i - 1]
    if (hasDiagonalCornerBlocker(prev, { x, y }, mapGrid, occupancyMap, start, options)) {
      return false
    }
  }
  return true
}

// Calculate travel cost for a path array using same costs as A*
function calculatePathCost(path, mapGrid) {
  if (!path || path.length < 2) return 0
  let cost = 0
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1]
    const curr = path[i]
    const base = Math.hypot(curr.x - prev.x, curr.y - prev.y)
    const tileType = mapGrid[curr.y][curr.x].type
    const terrain = tileType === 'street' ? STREET_PATH_COST : 1
    cost += base * terrain
  }
  return cost
}

// Reduce a tile path into straight-line segments for smoother movement
function smoothPath(path, mapGrid, occupancyMap, options = {}) {
  if (!path || path.length <= 2) return path

  const smoothed = [path[0]]
  let currentIndex = 0

  while (currentIndex < path.length - 1) {
    let nextIndex = path.length - 1
    for (let i = path.length - 1; i > currentIndex; i--) {
      if (isDirectPathClear(path[currentIndex], path[i], mapGrid, occupancyMap, options)) {
        const directSegment = getLineTiles(path[currentIndex], path[i])
        const directCost = calculatePathCost(directSegment, mapGrid)
        const originalCost = calculatePathCost(path.slice(currentIndex, i + 1), mapGrid)
        if (directCost <= originalCost) {
          nextIndex = i
          break
        }
      }
    }
    smoothed.push(path[nextIndex])
    currentIndex = nextIndex
  }

  return smoothed
}

// Spawns a unit near the specified factory.
// Accepts an optional rallyPointTarget from the specific spawning factory.
export function spawnUnit(factory, type, units, mapGrid, rallyPointTarget = null, occupancyMap = gameState.occupancyMap, options = {}) {
  // Default spawn position is the center below the factory
  const spawnX = factory.x + Math.floor(factory.width / 2)
  const spawnY = factory.y + factory.height

  let spawnPosition = null
  let worldPositionOverride = null
  const isHelipadApache = factory.type === 'helipad' && type === 'apache'
  const isAirstripF22 = factory.type === 'airstrip' && type === 'f22Raptor'

  if (isHelipadApache) {
    const landingTopLeft = getHelipadLandingTopLeft(factory)
    const landingTile = getHelipadLandingTile(factory)
    if (landingTopLeft && landingTile) {
      worldPositionOverride = { ...landingTopLeft }
      spawnPosition = { ...landingTile }
    } else {
      const helipadCenter = getHelipadLandingCenter(factory)
      if (helipadCenter) {
        worldPositionOverride = {
          x: helipadCenter.x - TILE_SIZE / 2,
          y: helipadCenter.y - TILE_SIZE / 2
        }
        spawnPosition = {
          x: Math.floor(helipadCenter.x / TILE_SIZE),
          y: Math.floor(helipadCenter.y / TILE_SIZE)
        }
      }
    }
  } else if (isAirstripF22) {
    ensureAirstripOperations(factory)
    gameState.nextAirstripSpawnPointIndex = gameState.nextAirstripSpawnPointIndex ?? 0
    const preferredSlot = gameState.nextAirstripSpawnPointIndex % factory.f22ParkingSpots.length
    let slotIndex = claimAirstripParkingSlot(factory, preferredSlot)
    if (slotIndex < 0) {
      slotIndex = preferredSlot
    }
    gameState.nextAirstripSpawnPointIndex = (slotIndex + 1) % factory.f22ParkingSpots.length
    const slot = factory.f22ParkingSpots[slotIndex]
    spawnPosition = { x: slot.x, y: slot.y }
    worldPositionOverride = { x: slot.worldX, y: slot.worldY }
    options.airstripParkingSlotIndex = slotIndex
    options.airstripId = getBuildingIdentifier(factory)
  } else if (factory.type === 'vehicleFactory') {
    // Attempt to free the designated spawn tile using algorithm A1
    moveBlockingUnits(spawnX, spawnY, units, mapGrid)

    // If the spot is valid after moving blockers, use it
    if (isPositionValid(spawnX, spawnY, mapGrid, units)) {
      spawnPosition = { x: spawnX, y: spawnY }
    } else {
      // Fallback: search near the designated spot
      spawnPosition = findAvailableSpawnPosition(spawnX, spawnY, mapGrid, units)
    }
  } else {
    // Determine the center of the factory/building for spawn proximity check
    const factoryCenterX = factory.x + Math.floor(factory.width / 2)
    const factoryCenterY = factory.y + Math.floor(factory.height / 2)

    // Find an available spawn position near the factory's center
    spawnPosition = findAvailableSpawnPosition(factoryCenterX, factoryCenterY, mapGrid, units)
  }

  if (!spawnPosition) {
    window.logger.warn(`No available spawn position near factory/building at (${factory.x}, ${factory.y}) for unit type ${type}`)
    return null // Return null if no position is available
  }

  const unitOptions = worldPositionOverride
    ? { ...options, worldPosition: worldPositionOverride }
    : options

  const newUnit = createUnit(factory, type, spawnPosition.x, spawnPosition.y, unitOptions)
  if (occupancyMap && !isHelipadApache && !isAirstripF22) {
    // Use center coordinates for occupancy map consistency
    const centerTileX = Math.floor((newUnit.x + TILE_SIZE / 2) / TILE_SIZE)
    const centerTileY = Math.floor((newUnit.y + TILE_SIZE / 2) / TILE_SIZE)
    if (centerTileY >= 0 && centerTileY < occupancyMap.length &&
        centerTileX >= 0 && centerTileX < occupancyMap[0].length) {
      occupancyMap[centerTileY][centerTileX] = (occupancyMap[centerTileY][centerTileX] || 0) + 1
    }
    if (newUnit.type === 'apache') {
      newUnit.groundedOccupancyApplied = true
    }
  }

  if (isHelipadApache) {
    const helipadId = getBuildingIdentifier(factory)
    newUnit.flightPlan = null
    newUnit.autoHoldAltitude = false
    newUnit.manualFlightState = 'auto'
    newUnit.altitude = 0
    newUnit.targetAltitude = 0
    newUnit.hovering = false
    newUnit.helipadLandingRequested = false
    newUnit.helipadTargetId = helipadId
    newUnit.landedHelipadId = helipadId
    newUnit.remoteControlActive = false
    newUnit.groundedOccupancyApplied = false
    // Clear any path or moveTarget to prevent immediate takeoff
    // This is a defensive measure - even though rally point logic is skipped,
    // we explicitly clear these to ensure the helicopter stays grounded
    newUnit.path = []
    newUnit.moveTarget = null
    if (newUnit.movement) {
      newUnit.movement.velocity = { x: 0, y: 0 }
      newUnit.movement.targetVelocity = { x: 0, y: 0 }
      newUnit.movement.isMoving = false
      newUnit.movement.currentSpeed = 0
    }
    newUnit.flightState = 'grounded'
    newUnit.altitude = 0
    newUnit.targetAltitude = 0
    if (newUnit.rotor) {
      newUnit.rotor.speed = 0
      newUnit.rotor.targetSpeed = 0
    }
    if (newUnit.shadow) {
      newUnit.shadow.offset = 0
      newUnit.shadow.scale = 1
    }
    newUnit.hovering = false
    newUnit.refuelingAtHelipad = false
    if (typeof newUnit.maxRocketAmmo === 'number') {
      newUnit.rocketAmmo = newUnit.maxRocketAmmo
      newUnit.apacheAmmoEmpty = false
      newUnit.canFire = true
    }
    if (typeof newUnit.maxGas === 'number') {
      newUnit.gas = newUnit.maxGas
      newUnit.outOfGasPlayed = false
    }
    factory.landedUnitId = newUnit.id
    if (Array.isArray(gameState.buildings)) {
      const matchingHelipad = gameState.buildings.find(
        b => getBuildingIdentifier(b) === helipadId
      )
      if (matchingHelipad) {
        matchingHelipad.landedUnitId = newUnit.id
      }
    }
  }

  if (isAirstripF22) {
    const airstripId = getBuildingIdentifier(factory)
    ensureAirstripOperations(factory)
    const parkingSlotIndex = Number.isInteger(options.airstripParkingSlotIndex) ? options.airstripParkingSlotIndex : 0
    setAirstripSlotOccupant(factory, parkingSlotIndex, newUnit.id)
    const runwayPoints = getAirstripRunwayPoints(factory)

    newUnit.flightPlan = null
    newUnit.autoHoldAltitude = false
    newUnit.manualFlightState = 'auto'
    newUnit.altitude = 0
    newUnit.targetAltitude = 0
    newUnit.hovering = false
    newUnit.helipadLandingRequested = false
    newUnit.helipadTargetId = airstripId
    newUnit.landedHelipadId = airstripId
    newUnit.airstripId = airstripId
    newUnit.airstripParkingSlotIndex = parkingSlotIndex
    newUnit.f22State = 'parked'
    newUnit.f22AssignedDestination = null
    newUnit.f22PendingTakeoff = false
    newUnit.runwayPoints = runwayPoints
    newUnit.direction = factory.f22ParkingSpots?.[parkingSlotIndex]?.facing ?? Math.PI / 2
    newUnit.rotation = newUnit.direction
    newUnit.path = []
    newUnit.moveTarget = null
    if (newUnit.movement) {
      newUnit.movement.velocity = { x: 0, y: 0 }
      newUnit.movement.targetVelocity = { x: 0, y: 0 }
      newUnit.movement.isMoving = false
      newUnit.movement.currentSpeed = 0
    }
    newUnit.flightState = 'grounded'
    newUnit.groundedOccupancyApplied = true
    if (newUnit.shadow) {
      newUnit.shadow.offset = 0
      newUnit.shadow.scale = 1
    }
    newUnit.refuelingAtHelipad = false
    if (typeof newUnit.maxRocketAmmo === 'number') {
      newUnit.rocketAmmo = newUnit.maxRocketAmmo
      newUnit.apacheAmmoEmpty = false
      newUnit.canFire = true
    }
    if (typeof newUnit.maxGas === 'number') {
      newUnit.gas = newUnit.maxGas
      newUnit.outOfGasPlayed = false
    }
    factory.landedUnitId = newUnit.id
    if (Array.isArray(gameState.buildings)) {
      const matchingAirstrip = gameState.buildings.find(
        b => getBuildingIdentifier(b) === airstripId
      )
      if (matchingAirstrip) {
        matchingAirstrip.landedUnitId = newUnit.id
      }
    }
  }

  // If a rally point target was provided (from the specific spawning factory), set the unit's path to it.
  // This allows each factory to have its own individual assembly point.
  // Harvesters handle their own initial path logic in productionQueue.js
  // Apache helicopters spawned on helipads and F22 Raptors spawned on airstrips should not immediately move to rally points - they should stay landed
  if (rallyPointTarget && type !== 'harvester' && !isHelipadApache && !isAirstripF22) {
    const path = findPath(
      { x: spawnPosition.x, y: spawnPosition.y },
      { x: rallyPointTarget.x, y: rallyPointTarget.y },
      mapGrid,
      null // Pass null for occupancyMap initially, pathfinding handles collisions
    )
    if (path && path.length > 1) {
      newUnit.path = path.slice(1)
      newUnit.moveTarget = { x: rallyPointTarget.x, y: rallyPointTarget.y } // Store final destination
    } else if (path && path.length === 1) {
      // If the rally point is the spawn point itself (unlikely but possible)
      newUnit.path = []
      newUnit.moveTarget = { x: rallyPointTarget.x, y: rallyPointTarget.y }
    } else {
      window.logger.warn(`Could not find path from spawn (${spawnPosition.x}, ${spawnPosition.y}) to rally point (${rallyPointTarget.x}, ${rallyPointTarget.y}) for ${type}`)
    }
  }

  // Play unit ready sound (moved here from productionQueue for consistency)
  // Note: Harvester initial path logic is in productionQueue, so sound plays there.
  // Consider moving harvester sound here too if spawnUnit handles initial harvester path.
  // if (type !== 'harvester') { // Only play if not a harvester (handled in productionQueue)
  //   const readySounds = ['unitReady01', 'unitReady02', 'unitReady03'];
  //   const randomSound = readySounds[Math.floor(gameRandom() * readySounds.length)];
  //   playSound(randomSound, 1.0);
  // }

  if (gameState.gameStarted && !gameState.mapEditMode) {
    recordUnitCreated({
      unit: newUnit,
      tick: gameState.frameCount,
      timeSeconds: gameState.gameTime
    })
  }

  return newUnit
}

function determineBuildDuration(unitType, providedDuration) {
  if (providedDuration && providedDuration > 0) {
    return providedDuration
  }
  const cost = getUnitCost(unitType) || 500
  return Math.max(1000, 3000 * (cost / 500))
}

// Helper to create the actual unit object
export function createUnit(factory, unitType, x, y, options = {}) {
  // Get base unit properties
  const baseProps = UNIT_PROPERTIES.base

  // Get unit-specific properties or use base properties if type not found
  const typeProps = UNIT_PROPERTIES[unitType] || baseProps

  // Special handling for 'tank' and 'tank_v1' to use the same properties
  const actualType = (unitType === 'tank') ? 'tank_v1' : unitType
  const unitProps = UNIT_PROPERTIES[actualType] || typeProps

  const worldPosition = options.worldPosition || null
  const initialX = typeof worldPosition?.x === 'number' ? worldPosition.x : x * TILE_SIZE
  const initialY = typeof worldPosition?.y === 'number' ? worldPosition.y : y * TILE_SIZE
  const tileCenterX = initialX + TILE_SIZE / 2
  const tileCenterY = initialY + TILE_SIZE / 2
  const tileX = Math.floor(tileCenterX / TILE_SIZE)
  const tileY = Math.floor(tileCenterY / TILE_SIZE)

  const unit = {
    id: getUniqueId(),
    type: actualType,
    // Determine owner based on factory's 'owner' property (for buildings) or 'id' (for initial factories)
    owner: factory.owner || factory.id,
    tileX,
    tileY,
    x: initialX,
    y: initialY,
    speed: unitProps.speed,
    health: unitProps.health,
    maxHealth: unitProps.maxHealth,
    path: [],
    target: null,
    selected: false,
    remoteControlActive: false,
    hasUsedRemoteControl: false,
    oreCarried: 0,
    harvesting: false,
    // Add rotation properties
    direction: 0, // Angle in radians (0 = east, PI/2 = south)
    targetDirection: 0,
    turretDirection: 0,
    rotationSpeed: unitProps.rotationSpeed,
    turretRotationSpeed: unitProps.turretRotationSpeed || unitProps.rotationSpeed,
    isRotating: false,
    loggingEnabled: false,
    lastLoggedStatus: null,
    guardMode: false,
    guardTarget: null,
    damageValue: 0,
    totalRepairPaid: 0,
    isRestoredFromWreck: false,
    // Command queue for path planning feature
    commandQueue: [],
    currentCommand: null,
    buildDuration: determineBuildDuration(actualType, options.buildDuration || null)
  }

  const utilityUnitTypes = ['ambulance', 'tankerTruck', 'ammunitionTruck', 'recoveryTank']
  unit.isUtilityUnit = utilityUnitTypes.includes(actualType)

  if (unit.isUtilityUnit) {
    unit.alertMode = false
  }

  // Gas system
  const gasProps = UNIT_GAS_PROPERTIES[actualType]
  if (gasProps) {
    unit.maxGas = gasProps.tankSize
    unit.gas = gasProps.tankSize
    unit.gasConsumption = gasProps.consumption
    unit.harvestGasConsumption = gasProps.harvestConsumption || 0
    unit.outOfGasPlayed = false
  }

  // Ammunition system
  const ammoCapacity = UNIT_AMMO_CAPACITY[actualType]
  if (ammoCapacity) {
    unit.maxAmmunition = ammoCapacity
    unit.ammunition = ammoCapacity
    // Determine ammo per shot based on unit type
    if (actualType === 'rocketTank') {
      unit.ammoPerShot = 3 // Fires 3 rockets per burst
    } else if (actualType === 'tank-v3') {
      unit.ammoPerShot = 2 // Fires 2 rounds per burst
    } else {
      unit.ammoPerShot = 1 // Single shot
    }
  }

  // Add unit-specific properties
  const fullCrewTanks = ['tank_v1', 'tank-v2', 'tank-v3', 'howitzer']
  const loaderUnits = ['tankerTruck', 'ammunitionTruck', 'ambulance', 'recoveryTank', 'harvester', 'rocketTank']

  // Apache helicopters and F22 Raptors don't have the crew system
  if (actualType !== 'apache' && actualType !== 'f22Raptor') {
    unit.crew = { driver: true, commander: true }

    if (fullCrewTanks.includes(actualType)) {
      unit.crew.gunner = true
      unit.crew.loader = true
    } else if (loaderUnits.includes(actualType)) {
      unit.crew.loader = true
    }
  }

  if (unitProps.accelerationMultiplier) {
    unit.accelerationMultiplier = unitProps.accelerationMultiplier
  }

  if (unitProps.armor) {
    unit.armor = unitProps.armor
  }

  if (actualType === 'howitzer') {
    unit.isHowitzer = true
    initializeHowitzerGun(unit)
  }

  if (actualType === 'apache') {
    unit.isAirUnit = true
    unit.flightState = 'grounded'
    unit.altitude = 0
    unit.targetAltitude = 0
    unit.maxAltitude = TILE_SIZE * 4.5
    unit.airCruiseSpeed = unitProps.speed
    unit.hoverFuelMultiplier = 0.2
    unit.autoHoldAltitude = false
    unit.flightPlan = null
    unit.rotor = {
      angle: 0,
      speed: 0,
      targetSpeed: 0
    }
    unit.shadow = {
      offset: 0,
      scale: 1
    }
    unit.hovering = false
    unit.groundedOccupancyApplied = false
    unit.lastGroundedOnHelipad = false
    unit.airborneSince = null
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    unit.landedSince = now
    unit.attackCooldown = 0
    unit.volleyState = null
    unit.dodgeCooldown = 0
    unit.dodgeChance = 0.6
    unit.fuelSource = null
    unit.requiresHelipad = true
    unit.manualFlightState = 'auto'
    unit.manualFlightHoverRequested = false
    unit.helipadLandingRequested = false
    unit.helipadTargetId = null
    unit.landedHelipadId = null
    unit.maxRocketAmmo = 38
    unit.rocketAmmo = unit.maxRocketAmmo
  }

  if (actualType === 'f22Raptor') {
    unit.isAirUnit = true
    unit.flightState = 'grounded'
    unit.altitude = 0
    unit.targetAltitude = 0
    unit.maxAltitude = TILE_SIZE * 4.5
    unit.airCruiseSpeed = unitProps.speed
    unit.autoHoldAltitude = false
    unit.flightPlan = null
    unit.shadow = { offset: 0, scale: 1 }
    unit.hovering = false
    unit.groundedOccupancyApplied = false
    unit.airborneSince = null
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    unit.landedSince = now
    unit.attackCooldown = 0
    unit.dodgeCooldown = 0
    unit.dodgeChance = 0.6
    unit.fuelSource = null
    unit.requiresAirstrip = true
    unit.radarInvisible = true
    unit.manualFlightState = 'auto'
    unit.manualFlightHoverRequested = false
    unit.helipadLandingRequested = false
    unit.helipadTargetId = null
    unit.landedHelipadId = null
    unit.maxRocketAmmo = 8
    unit.rocketAmmo = unit.maxRocketAmmo
    unit.apacheAmmoEmpty = false
    unit.canFire = true
    unit.volleyState = null
    unit.f22State = 'parked'
    unit.f22AssignedDestination = null
    unit.f22PendingTakeoff = false
  }

  if (actualType === 'ambulance') {
    unit.medics = unitProps.medics || 10
    unit.maxMedics = unitProps.maxMedics || 10
    unit.ambulanceProps = {
      streetSpeedMultiplier: unitProps.streetSpeedMultiplier || 6.0
    }
  }
  if (actualType === 'tankerTruck') {
    unit.maxSupplyGas = TANKER_SUPPLY_CAPACITY
    unit.supplyGas = TANKER_SUPPLY_CAPACITY
  }
  if (actualType === 'ammunitionTruck') {
    unit.maxAmmoCargo = AMMO_TRUCK_CARGO
    unit.ammoCargo = AMMO_TRUCK_CARGO
  }
  if (actualType === 'mineLayer') {
    const mineCapacity = unitProps.mineCapacity || 20
    unit.mineCapacity = mineCapacity
    unit.remainingMines = mineCapacity
    unit.deployingMine = false
    unit.deployStartTime = null
    unit.deploymentCompleted = false
  }
  if (actualType === 'mineSweeper') {
    unit.sweeping = false // Track if currently in sweeping mode
    unit.normalSpeed = unitProps.speed
    unit.sweepingSpeed = unitProps.sweepingSpeed || unitProps.speed * 0.3
  }
  if (actualType === 'recoveryTank') {
    unit.repairTarget = null
    unit.towedUnit = null
    unit.armor = unitProps.armor
    unit.currentSpeed = unitProps.speed // Track current speed for loaded/unloaded state
  }
  if (unitType === 'tank-v2' || unitType === 'tank-v3') {
    unit.alertMode = unitProps.alertMode
  } else if (unitType === 'harvester') {
    unit.oreCarried = 0
    unit.harvesting = false
    unit.armor = unitProps.armor
    unit.totalMoneyEarned = 0
    unit.lastHarvestCycleComplete = null
    unit.harvestCycleSeconds = null
  }

  // Initialize unified movement system for the new unit
  initializeUnitMovement(unit)

  // Initialize leveling system for combat units (not harvesters)
  if (unit.type !== 'harvester') {
    unit.level = 0
    unit.experience = 0
    unit.baseCost = unitCosts[unit.type] || unitCosts[unitType] || 1000
  }

  // Initialize speed modifier based on current health
  updateUnitSpeedModifier(unit)

  // Apply god mode if it's active for this unit's owner
  if (window.cheatSystem && window.cheatSystem.isGodModeActive()) {
    window.cheatSystem.addUnitToGodMode(unit)
  }

  return unit
}

// Find an available position near the factory center for unit spawn
function findAvailableSpawnPosition(startX, startY, mapGrid, units) {
  if (typeof startX !== 'number' || typeof startY !== 'number') {
    return null
  }

  const rows = mapGrid.length
  const cols = mapGrid[0]?.length || 0
  const visited = new Set()
  const queue = []

  const enqueue = (x, y, distance) => {
    if (x < 0 || y < 0 || y >= rows || x >= cols) {
      return
    }
    const key = `${x},${y}`
    if (visited.has(key) || distance > MAX_SPAWN_SEARCH_DISTANCE) {
      return
    }
    visited.add(key)
    queue.push({ x, y, distance })
  }

  enqueue(startX, startY, 0)

  while (queue.length > 0) {
    const current = queue.shift()
    if (isPositionValid(current.x, current.y, mapGrid, units)) {
      return { x: current.x, y: current.y }
    }

    const nextDistance = current.distance + 1
    for (const dir of DIRECTIONS) {
      enqueue(current.x + dir.x, current.y + dir.y, nextDistance)
    }
  }

  // No valid position found
  return null
}

// Helper function to check if a position is valid for unit spawn
function isPositionValid(x, y, mapGrid, units) {
  // Check if position is within bounds
  if (x < 0 || y < 0 || y >= mapGrid.length || x >= mapGrid[0].length) {
    return false
  }

  // Check if tile is passable (not a building, rock, etc.)
  // Note: Tiles with ore overlay (mapGrid[y][x].ore = true) are still passable based on their underlying type
  if (
    mapGrid[y][x].type !== 'land' &&
    mapGrid[y][x].type !== 'street'
  ) {
    return false
  }

  if (hasBlockingBuilding(mapGrid[y][x])) {
    return false
  }

  if (mapGrid[y][x].seedCrystal) {
    return false
  }

  // Check if tile is occupied by another unit
  const isOccupied = units.some(unit =>
    Math.floor(unit.x / TILE_SIZE) === x &&
    Math.floor(unit.y / TILE_SIZE) === y
  )

  return !isOccupied
}

// Implementation of algorithm A1: move blocking units to make room
export function moveBlockingUnits(targetX, targetY, units, mapGrid) {
  // Find any unit blocking the target position
  const blockingUnit = units.find(unit =>
    Math.floor(unit.x / TILE_SIZE) === targetX &&
    Math.floor(unit.y / TILE_SIZE) === targetY
  )

  if (!blockingUnit) return true // No blocking unit

  // Find the closest free tile to move the blocking unit
  for (let distance = 1; distance <= 3; distance++) {
    for (const dir of DIRECTIONS) {
      const newX = targetX + dir.x * distance
      const newY = targetY + dir.y * distance

      if (isPositionValid(newX, newY, mapGrid, units)) {
        // Store previous tile position (using center coordinates)
        const prevTileX = Math.floor((blockingUnit.x + TILE_SIZE / 2) / TILE_SIZE)
        const prevTileY = Math.floor((blockingUnit.y + TILE_SIZE / 2) / TILE_SIZE)

        // Move the blocking unit
        blockingUnit.tileX = newX
        blockingUnit.tileY = newY
        blockingUnit.x = newX * TILE_SIZE
        blockingUnit.y = newY * TILE_SIZE

        // Update occupancy map
        if (gameState.occupancyMap) {
          updateUnitOccupancy(blockingUnit, prevTileX, prevTileY, gameState.occupancyMap)
        }

        return true
      }
    }
  }

  return false // Could not move the blocking unit
}

// --- Collision Resolution for Idle Units ---
// When multiple units share the same tile, naturally guide them to separate positions
// Uses spatial quadtree for efficient O(n × k) neighbor queries instead of O(n²)
export function resolveUnitCollisions(units, mapGrid) {
  const COLLISION_RADIUS = TILE_SIZE * 0.4 // Collision detection radius
  const SEPARATION_FORCE = 0.5 // Force to separate overlapping units

  // Use quadtree for efficient neighbor queries
  const spatialTree = getSpatialQuadtree()
  if (!spatialTree) return // No quadtree available yet

  const mapWidth = mapGrid[0]?.length || 100
  const mapHeight = mapGrid.length || 100
  const maxX = (mapWidth - 1) * TILE_SIZE
  const maxY = (mapHeight - 1) * TILE_SIZE

  // Find overlapping units and apply gentle separation forces
  // Using a Set to track processed pairs by combining IDs
  const processed = new Set()

  for (let i = 0, len = units.length; i < len; i++) {
    const unit1 = units[i]
    if (!unit1 || unit1.health <= 0) continue
    if (unit1.path && unit1.path.length > 0) continue // Skip moving units

    // Update tile coordinates
    unit1.tileX = (unit1.x / TILE_SIZE) | 0
    unit1.tileY = (unit1.y / TILE_SIZE) | 0

    // Use pre-computed centers from quadtree rebuild
    const unit1CenterX = unit1._cx ?? (unit1.x + TILE_SIZE * 0.5)
    const unit1CenterY = unit1._cy ?? (unit1.y + TILE_SIZE * 0.5)

    // Query nearby units using quadtree - much faster than nested loop
    const nearbyUnits = spatialTree.queryNearbyGround(unit1CenterX, unit1CenterY, COLLISION_RADIUS * 2, unit1.id)

    for (let j = 0, jlen = nearbyUnits.length; j < jlen; j++) {
      const unit2 = nearbyUnits[j]
      if (unit2.path && unit2.path.length > 0) continue // Skip moving units

      // Create a consistent pair key to avoid processing the same pair twice
      // Use numeric comparison for speed
      const id1 = unit1.id
      const id2 = unit2.id
      const pairKey = id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`
      if (processed.has(pairKey)) continue
      processed.add(pairKey)

      const dx = unit2.x - unit1.x
      const dy = unit2.y - unit1.y
      const distSq = dx * dx + dy * dy
      const collisionRadiusSq = COLLISION_RADIUS * COLLISION_RADIUS

      // If units are overlapping, apply gentle separation
      if (distSq < collisionRadiusSq && distSq > 0.01) {
        const distance = Math.sqrt(distSq)
        const overlap = COLLISION_RADIUS - distance
        const invDist = 1 / distance
        const separationX = dx * invDist * overlap * SEPARATION_FORCE
        const separationY = dy * invDist * overlap * SEPARATION_FORCE

        // Apply separation force (split the movement between both units)
        unit1.x -= separationX * 0.5
        unit1.y -= separationY * 0.5
        unit2.x += separationX * 0.5
        unit2.y += separationY * 0.5

        // Clamp to map bounds
        if (unit1.x < 0) unit1.x = 0
        else if (unit1.x > maxX) unit1.x = maxX
        if (unit1.y < 0) unit1.y = 0
        else if (unit1.y > maxY) unit1.y = maxY

        if (unit2.x < 0) unit2.x = 0
        else if (unit2.x > maxX) unit2.x = maxX
        if (unit2.y < 0) unit2.y = 0
        else if (unit2.y > maxY) unit2.y = maxY

        // Update tile positions
        unit1.tileX = (unit1.x / TILE_SIZE) | 0
        unit1.tileY = (unit1.y / TILE_SIZE) | 0
        unit2.tileX = (unit2.x / TILE_SIZE) | 0
        unit2.tileY = (unit2.y / TILE_SIZE) | 0
      }
    }
  }
}

// --- Helper: Deselect All Units ---
// Call this function on a right-click event if it is not part of a map drag.
export function deselectUnits(units) {
  units.forEach(u => {
    u.selected = false
  })
}
