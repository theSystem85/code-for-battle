import { preloadTileTextures } from './rendering.js'
import { preloadBuildingImages } from './buildingImageMap.js'
import { preloadTurretImages } from './rendering/turretImageRenderer.js'
import { PLAYER_POSITIONS } from './config.js'
import { gameState } from './gameState.js'
import { sanitizeSeed } from './utils/seedUtils.js'

let texturesLoaded = false
let buildingImagesLoaded = false
let turretImagesLoaded = false
let onAllAssetsLoadedCallback = null

function checkAllAssetsLoaded() {
  if (texturesLoaded && buildingImagesLoaded && turretImagesLoaded && onAllAssetsLoadedCallback) {
    onAllAssetsLoadedCallback()
  }
}

export function initializeGameAssets(callback) {
  onAllAssetsLoadedCallback = callback

  preloadTileTextures(() => {
    texturesLoaded = true
    checkAllAssetsLoaded()
  })

  preloadBuildingImages(() => {
    buildingImagesLoaded = true
    checkAllAssetsLoaded()
  })

  preloadTurretImages(() => {
    turretImagesLoaded = true
    checkAllAssetsLoaded()
  })
}

// Seeded random generator
function seededRandom(seed) {
  const m = 0x80000000, a = 1103515245, c = 12345
  let state = seed
  return function() {
    state = (a * state + c) % m
    return state / (m - 1)
  }
}

// Helper: Draw a street line with original thickness (2 tiles wide)
function drawStreetLine(grid, start, end, type) {
  const dx = end.x - start.x, dy = end.y - start.y
  const steps = Math.max(Math.abs(dx), Math.abs(dy))
  const thickness = 2 // Reduced street thickness

  for (let j = 0; j <= steps; j++) {
    const x = Math.floor(start.x + (dx * j) / steps)
    const y = Math.floor(start.y + (dy * j) / steps)
    for (let ty = -Math.floor(thickness / 2); ty <= Math.floor(thickness / 2); ty++) {
      for (let tx = -Math.floor(thickness / 2); tx <= Math.floor(thickness / 2); tx++) {
        const nx = x + tx, ny = y + ty
        if (nx >= 0 && ny >= 0 && nx < grid[0].length && ny < grid.length) {
          grid[ny][nx].type = type
        }
      }
    }
  }
}

// Helper: Draw a thick line (Bresenham-like) - for non-street features
function drawThickLine(grid, start, end, type, thickness) {
  const dx = end.x - start.x, dy = end.y - start.y
  const steps = Math.max(Math.abs(dx), Math.abs(dy))
  for (let j = 0; j <= steps; j++) {
    const x = Math.floor(start.x + (dx * j) / steps)
    const y = Math.floor(start.y + (dy * j) / steps)
    for (let ty = -Math.floor(thickness / 2); ty <= Math.floor(thickness / 2); ty++) {
      for (let tx = -Math.floor(thickness / 2); tx <= Math.floor(thickness / 2); tx++) {
        const nx = x + tx, ny = y + ty
        if (nx >= 0 && ny >= 0 && nx < grid[0].length && ny < grid.length) {
          grid[ny][nx].type = type
        }
      }
    }
  }
}

// Helper: Create optimized street network using minimum spanning tree approach
function createOptimizedStreetNetwork(mapGrid, points, type) {
  if (points.length < 2) return

  // For 2 points, simple direct connection
  if (points.length === 2) {
    drawStreetLine(mapGrid, points[0], points[1], type)
    return
  }

  // For multiple points, use a hub-and-spoke with minimal cross-connections
  // Find the most central point (closest to geometric center)
  const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length

  let hubPoint = points[0]
  let minDistanceToCenter = Math.hypot(points[0].x - centerX, points[0].y - centerY)

  points.forEach(point => {
    const distance = Math.hypot(point.x - centerX, point.y - centerY)
    if (distance < minDistanceToCenter) {
      minDistanceToCenter = distance
      hubPoint = point
    }
  })

  // Connect all other points to the hub
  points.forEach(point => {
    if (point !== hubPoint) {
      drawStreetLine(mapGrid, hubPoint, point, type)
    }
  })

  // For 4+ points, add one cross-connection for redundancy
  if (points.length >= 4) {
    // Find the two points farthest from the hub
    const nonHubPoints = points.filter(p => p !== hubPoint)
    nonHubPoints.sort((a, b) => {
      const distA = Math.hypot(a.x - hubPoint.x, a.y - hubPoint.y)
      const distB = Math.hypot(b.x - hubPoint.x, b.y - hubPoint.y)
      return distB - distA // Sort by distance from hub, descending
    })

    if (nonHubPoints.length >= 2) {
      // Connect the two farthest points for redundancy
      drawStreetLine(mapGrid, nonHubPoints[0], nonHubPoints[1], type)
    }
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function drawOrthogonalStreetPath(grid, start, end, type) {
  let x = start.x
  let y = start.y

  while (x !== end.x) {
    grid[y][x].type = type
    x += Math.sign(end.x - x)
  }

  while (y !== end.y) {
    grid[y][x].type = type
    y += Math.sign(end.y - y)
  }

  grid[y][x].type = type
}

function createBalancedOreClusterCenters(playerPositions, mapWidth, mapHeight) {
  const inwardTargetX = Math.floor(mapWidth / 2)
  const inwardTargetY = Math.floor(mapHeight / 2)
  const desiredStreetDistance = clamp(Math.floor(Math.min(mapWidth, mapHeight) * 0.2), 10, 16)

  return playerPositions.map(position => {
    const dirX = inwardTargetX >= position.x ? 1 : -1
    const dirY = inwardTargetY >= position.y ? 1 : -1
    const horizontalSteps = Math.floor(desiredStreetDistance / 2)
    const verticalSteps = desiredStreetDistance - horizontalSteps

    const x = clamp(position.x + horizontalSteps * dirX, 2, mapWidth - 3)
    const y = clamp(position.y + verticalSteps * dirY, 2, mapHeight - 3)

    return {
      id: position.id,
      x,
      y,
      requiredStreetDistance: desiredStreetDistance
    }
  })
}

// Generate a new map using the given seed and organic features
export function generateMap(seed, mapGrid, MAP_TILES_X, MAP_TILES_Y) {
  const { value: normalizedSeed } = sanitizeSeed(seed)
  const rand = seededRandom(normalizedSeed)
  // Clear any old content
  mapGrid.length = 0
  for (let y = 0; y < MAP_TILES_Y; y++) {
    mapGrid[y] = []
    for (let x = 0; x < MAP_TILES_X; x++) {
      // Initially all land with no ore overlay
      mapGrid[y][x] = { type: 'land', ore: false, seedCrystal: false, noBuild: 0 }
    }
  }

  // -------- Step 1: Generate Mountain Chains (Rock Clusters) --------
  const rockClusterCount = 9
  const rockClusters = []
  for (let i = 0; i < rockClusterCount; i++) {
    const clusterCenterX = Math.floor(rand() * MAP_TILES_X)
    const clusterCenterY = Math.floor(rand() * MAP_TILES_Y)
    rockClusters.push({ x: clusterCenterX, y: clusterCenterY })
    const clusterRadius = Math.floor(rand() * 3) + 2 // radius between 2 and 4
    for (let y = Math.max(0, clusterCenterY - clusterRadius); y < Math.min(MAP_TILES_Y, clusterCenterY + clusterRadius); y++) {
      for (let x = Math.max(0, clusterCenterX - clusterRadius); x < Math.min(MAP_TILES_X, clusterCenterX + clusterRadius); x++) {
        const dx = x - clusterCenterX, dy = y - clusterCenterY
        if (Math.hypot(dx, dy) < clusterRadius && rand() < 0.8) {
          mapGrid[y][x].type = 'rock'
        }
      }
    }
  }
  // Connect rock clusters in sequence (mountain chains)
  for (let i = 0; i < rockClusters.length - 1; i++) {
    drawThickLine(mapGrid, rockClusters[i], rockClusters[i + 1], 'rock', 2)
  }

  // -------- Step 2: Generate Lakes and Rivers --------
  const lakeCount = 2
  const lakeCenters = []
  for (let i = 0; i < lakeCount; i++) {
    const centerX = Math.floor(rand() * MAP_TILES_X)
    const centerY = Math.floor(rand() * MAP_TILES_Y)
    lakeCenters.push({ x: centerX, y: centerY })
    const radius = Math.floor(rand() * 4) + 4 // radius between 4 and 7
    for (let y = Math.max(0, centerY - radius); y < Math.min(MAP_TILES_Y, centerY + radius); y++) {
      for (let x = Math.max(0, centerX - radius); x < Math.min(MAP_TILES_X, centerX + radius); x++) {
        const dx = x - centerX, dy = y - centerY
        if (Math.hypot(dx, dy) < radius) {
          mapGrid[y][x].type = 'water'
        }
      }
    }
  }
  // Connect lakes with a river
  if (lakeCenters.length === 2) {
    const startLake = lakeCenters[0]
    const endLake = lakeCenters[1]
    const steps = Math.max(Math.abs(endLake.x - startLake.x), Math.abs(endLake.y - startLake.y))
    for (let j = 0; j <= steps; j++) {
      const x = Math.floor(startLake.x + ((endLake.x - startLake.x) * j) / steps)
      const y = Math.floor(startLake.y + ((endLake.y - startLake.y) * j) / steps)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < MAP_TILES_X && ny < MAP_TILES_Y) {
            if (rand() < 0.8) {
              mapGrid[ny][nx].type = 'water'
            }
          }
        }
      }
    }
    // Ensure at least one street crosses the river (midpoint) - will be handled by the unified street network
  }

  // -------- Step 3: Generate Streets --------
  // Get player count and positions from gameState
  const playerCount = gameState?.playerCount || 2
  const playerPositions = []

  // Calculate factory positions for current player count
  const playerIds = ['player1', 'player2', 'player3', 'player4'].slice(0, playerCount)
  playerIds.forEach(playerId => {
    const position = PLAYER_POSITIONS[playerId]
    playerPositions.push({
      id: playerId,
      x: Math.floor(MAP_TILES_X * position.x),
      y: Math.floor(MAP_TILES_Y * position.y)
    })
  })

  // Create one balanced ore seed target per player so nearest street distance stays fair.
  const oreClusterCenters = createBalancedOreClusterCenters(playerPositions, MAP_TILES_X, MAP_TILES_Y)

  // Keep a connected global road graph and also enforce direct base-to-ore street reachability.
  const allStreetPoints = [...playerPositions, ...oreClusterCenters]
  createOptimizedStreetNetwork(mapGrid, allStreetPoints, 'street')
  playerPositions.forEach((basePosition, index) => {
    drawOrthogonalStreetPath(mapGrid, basePosition, oreClusterCenters[index], 'street')
  })

  // Ensure river crossing exists (if there are lakes)
  if (lakeCenters.length === 2) {
    const riverMidX = Math.floor((lakeCenters[0].x + lakeCenters[1].x) / 2)
    const riverMidY = Math.floor((lakeCenters[0].y + lakeCenters[1].y) / 2)
    mapGrid[riverMidY][riverMidX].type = 'street'
  }

  // -------- Step 4: Generate Ore Fields (AFTER terrain generation) --------
  // Generate ore clusters around the predefined centers, but only on passable terrain
  // and avoid factory and building locations

  // Calculate factory positions to avoid placing ore there
  const factoryWidth = 3 // constructionYard width from buildings.js
  const factoryHeight = 3 // constructionYard height from buildings.js
  const factoryPositions = []

  playerIds.forEach(playerId => {
    const position = PLAYER_POSITIONS[playerId]
    const factoryX = Math.floor(MAP_TILES_X * position.x) - Math.floor(factoryWidth / 2)
    const factoryY = Math.floor(MAP_TILES_Y * position.y) - Math.floor(factoryHeight / 2)
    factoryPositions.push({
      x: factoryX,
      y: factoryY,
      width: factoryWidth,
      height: factoryHeight
    })
  })

  oreClusterCenters.forEach(cluster => {
    const clusterRadius = Math.floor(rand() * 3) + 5 // radius between 5 and 7
    for (let y = Math.max(0, cluster.y - clusterRadius); y < Math.min(MAP_TILES_Y, cluster.y + clusterRadius); y++) {
      for (let x = Math.max(0, cluster.x - clusterRadius); x < Math.min(MAP_TILES_X, cluster.x + clusterRadius); x++) {
        const dx = x - cluster.x, dy = y - cluster.y
        // Only place ore on passable terrain (land or street) and within cluster radius
        if (Math.hypot(dx, dy) < clusterRadius && rand() < 0.9) {
          const tileType = mapGrid[y][x].type

          // Check if this tile is part of any factory area
          const isInFactory = factoryPositions.some(factory =>
            x >= factory.x && x < factory.x + factory.width &&
            y >= factory.y && y < factory.y + factory.height
          )

          // Check if this tile is part of any existing building area
          const isInBuilding = gameState.buildings && gameState.buildings.some(building => {
            const bx = building.x, by = building.y
            const bw = building.width || 1, bh = building.height || 1
            return x >= bx && x < bx + bw && y >= by && y < by + bh
          })

          if ((tileType === 'land' || tileType === 'street') && !isInFactory && !isInBuilding) {
            // Set ore as an overlay property only on passable terrain away from factories and buildings
            mapGrid[y][x].ore = true
          }
        }
      }
    }

    // Keep one deterministic seed crystal per cluster for symmetric nearest-distance balancing.
    const seedPositions = [{ x: cluster.x, y: cluster.y }]
    seedPositions.forEach(pos => {
      if (pos.x >= 0 && pos.y >= 0 && pos.x < MAP_TILES_X && pos.y < MAP_TILES_Y) {
        mapGrid[pos.y][pos.x].ore = true
        mapGrid[pos.y][pos.x].seedCrystal = true
      }
    })
  })
}

/**
 * Remove ore from all tiles that have buildings or factories on them
 * This ensures no ore overlaps with any structures
 */
export function cleanupOreFromBuildings(mapGrid, buildings = [], factories = []) {
  // Clean ore from factory tiles
  factories.forEach(factory => {
    for (let y = factory.y; y < factory.y + factory.height; y++) {
      for (let x = factory.x; x < factory.x + factory.width; x++) {
        if (mapGrid[y] && mapGrid[y][x] && mapGrid[y][x].ore) {
          mapGrid[y][x].ore = false
          // Clear any cached texture variations for this tile to force re-render
          mapGrid[y][x].textureVariation = null
        }
      }
    }
  })

  // Clean ore from building tiles
  buildings.forEach(building => {
    for (let y = building.y; y < building.y + building.height; y++) {
      for (let x = building.x; x < building.x + building.width; x++) {
        if (mapGrid[y] && mapGrid[y][x] && mapGrid[y][x].ore) {
          mapGrid[y][x].ore = false
          // Clear any cached texture variations for this tile to force re-render
          mapGrid[y][x].textureVariation = null
        }
      }
    }
  })
}
