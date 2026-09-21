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

export function getOreDensityForDistance(distanceFromSeed, clusterRadius, seedDensity) {
  const maxDistance = Math.max(1, Math.floor(clusterRadius) - 1)
  const normalizedDistance = clamp(Math.floor(distanceFromSeed), 0, maxDistance)
  const normalizedSeedDensity = clamp(Math.floor(seedDensity), 1, 5)
  const density = 1 + Math.floor(((maxDistance - normalizedDistance) * (normalizedSeedDensity - 1)) / maxDistance)
  return clamp(density, 1, normalizedSeedDensity)
}

export function allocateOreFieldCandidateDensities(candidates, unitsToAllocate) {
  const remainingCandidates = Array.isArray(candidates)
    ? candidates.map(candidate => ({
      maxDensity: clamp(Math.floor(candidate?.maxDensity || 0), 0, 5),
      assignedDensity: 0
    }))
    : []
  let remainingUnits = Math.max(0, Math.floor(unitsToAllocate || 0))

  // First spread density-1 ore across the nearest reachable tiles so even small
  // starting fields expose low-tier ore before inner tiles get richer.
  for (const candidate of remainingCandidates) {
    if (remainingUnits <= 0) {
      break
    }

    if (candidate.maxDensity <= 0) {
      continue
    }

    candidate.assignedDensity = 1
    remainingUnits -= 1
  }

  while (remainingUnits > 0) {
    let assignedThisPass = false

    for (const candidate of remainingCandidates) {
      if (remainingUnits <= 0) {
        break
      }

      if (candidate.assignedDensity <= 0 || candidate.assignedDensity >= candidate.maxDensity) {
        continue
      }

      candidate.assignedDensity += 1
      remainingUnits -= 1
      assignedThisPass = true
    }

    if (!assignedThisPass) {
      break
    }
  }

  return remainingCandidates.map(candidate => candidate.assignedDensity)
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

function sanitizeOreFieldCount(value) {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return 8
  }
  return clamp(parsed, 0, 24)
}

function sanitizeOreTotalValue(value) {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return 64000
  }
  const step = 1000
  const clamped = clamp(parsed, 0, 5000000)
  return Math.floor(clamped / step) * step
}

function sanitizePercent(value, fallback = 0) {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return clamp(fallback, 0, 50)
  }
  return clamp(parsed, 0, 50)
}

function setTileToType(mapGrid, x, y, type) {
  if (!mapGrid[y] || !mapGrid[y][x]) return
  mapGrid[y][x].type = type
}

// Coast shaping uses its own hash so sampling the shoreline does not advance
// the map RNG stream that places rivers and ore.
const SHORE_CORNER_SMOOTH_K = 1.15
const SHORE_CORNER_REACH_SCALE = 1.28

function mixSeed(seed, salt) {
  return (Math.imul(seed | 0, 747796405) + Math.imul(salt | 0, 2891336453)) | 0
}

function hashUnitFloat(seed, x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function smoothstep01(t) {
  const x = clamp(t, 0, 1)
  return x * x * (3 - (2 * x))
}

function valueNoise1D(seed, x, period) {
  const spacing = Math.max(2, period)
  const cell = Math.floor(x / spacing)
  const blend = smoothstep01((x / spacing) - cell)
  const left = hashUnitFloat(seed, cell, spacing)
  const right = hashUnitFloat(seed, cell + 1, spacing)
  return left + ((right - left) * blend)
}

function periodicValueNoise(seed, angle, lobes) {
  const count = Math.max(2, lobes | 0)
  const cycle = Math.PI * 2
  const wrapped = ((angle % cycle) + cycle) % cycle
  const t = (wrapped / cycle) * count
  const cell = Math.floor(t)
  const blend = smoothstep01(t - cell)
  const left = hashUnitFloat(seed, cell % count, count)
  const right = hashUnitFloat(seed, (cell + 1) % count, count)
  return left + ((right - left) * blend)
}

function smoothMin(a, b, k) {
  if (!(k > 0)) return Math.min(a, b)
  const h = clamp(0.5 + ((0.5 * (b - a)) / k), 0, 1)
  return ((b * (1 - h)) + (a * h)) - (k * h * (1 - h))
}

function buildShoreDepthProfile(length, baseDepth, seed, salt, depthCap) {
  const profile = new Array(length)
  const noiseSeed = mixSeed(seed, salt)
  const safeBase = clamp(baseDepth, 1, depthCap)
  const amplitude = Math.max(2, safeBase * 0.62)
  const periods = [
    Math.max(8, Math.round(length / 4.2)),
    Math.max(6, Math.round(length / 9)),
    Math.max(4, Math.round(length / 16)),
    Math.max(3, Math.round(length / 27))
  ]
  const weights = [0.4, 0.28, 0.2, 0.12]

  for (let i = 0; i < length; i++) {
    let wave = 0
    for (let octave = 0; octave < periods.length; octave++) {
      const sample = (valueNoise1D(noiseSeed + (octave * 104729), i, periods[octave]) * 2) - 1
      wave += weights[octave] * sample
    }
    profile[i] = clamp(safeBase + (wave * amplitude), 1, depthCap)
  }

  return profile
}

function shoreCornerClaimsTile(distanceA, depthA, distanceB, depthB) {
  if (!(depthA > 0) || !(depthB > 0)) return false
  const reach = Math.max(depthA, depthB) * SHORE_CORNER_REACH_SCALE
  if (distanceA > reach || distanceB > reach) return false
  const blended = smoothMin(distanceA / depthA, distanceB / depthB, SHORE_CORNER_SMOOTH_K)
  return blended < 1
}

function isOrganicShoreTile(x, y, width, height, profiles) {
  const northDepth = profiles.north ? profiles.north[x] : 0
  const southDepth = profiles.south ? profiles.south[x] : 0
  const westDepth = profiles.west ? profiles.west[y] : 0
  const eastDepth = profiles.east ? profiles.east[y] : 0
  const northDist = y + 0.5
  const southDist = height - y - 0.5
  const westDist = x + 0.5
  const eastDist = width - x - 0.5

  if (northDepth > 0 && northDist < northDepth) return true
  if (southDepth > 0 && southDist < southDepth) return true
  if (westDepth > 0 && westDist < westDepth) return true
  if (eastDepth > 0 && eastDist < eastDepth) return true

  if (shoreCornerClaimsTile(northDist, northDepth, westDist, westDepth)) return true
  if (shoreCornerClaimsTile(northDist, northDepth, eastDist, eastDepth)) return true
  if (shoreCornerClaimsTile(southDist, southDepth, westDist, westDepth)) return true
  if (shoreCornerClaimsTile(southDist, southDepth, eastDist, eastDepth)) return true
  return false
}

function applyOrganicShoreWater(mapGrid, sides, baseDepth, seed) {
  if (!sides || sides.length === 0) return
  const height = mapGrid.length
  const width = mapGrid[0]?.length || 0
  if (width === 0 || height === 0) return

  const enabled = new Set(sides)
  const depthCap = Math.max(1, Math.floor(Math.min(width, height) * 0.45))
  const profiles = {
    north: enabled.has('north') ? buildShoreDepthProfile(width, baseDepth, seed, 11, depthCap) : null,
    south: enabled.has('south') ? buildShoreDepthProfile(width, baseDepth, seed, 29, depthCap) : null,
    west: enabled.has('west') ? buildShoreDepthProfile(height, baseDepth, seed, 47, depthCap) : null,
    east: enabled.has('east') ? buildShoreDepthProfile(height, baseDepth, seed, 71, depthCap) : null
  }

  let maxDepth = 1
  Object.values(profiles).forEach(profile => {
    if (!profile) return
    for (let i = 0; i < profile.length; i++) {
      if (profile[i] > maxDepth) maxDepth = profile[i]
    }
  })
  const reach = Math.ceil(maxDepth * SHORE_CORNER_REACH_SCALE) + 1

  for (let y = 0; y < height; y++) {
    const nearVerticalEdge = y < reach || y >= height - reach
    for (let x = 0; x < width; x++) {
      if (!nearVerticalEdge && x >= reach && x < width - reach) continue
      if (isOrganicShoreTile(x, y, width, height, profiles)) {
        setTileToType(mapGrid, x, y, 'water')
      }
    }
  }
}

function organicLakeRadius(angle, baseRadius, seed) {
  const safeRadius = Math.max(3, baseRadius)
  const phaseA = hashUnitFloat(seed, 2, 11) * Math.PI * 2
  const phaseB = hashUnitFloat(seed, 3, 13) * Math.PI * 2
  const phaseC = hashUnitFloat(seed, 5, 17) * Math.PI * 2
  const phaseD = hashUnitFloat(seed, 7, 19) * Math.PI * 2
  const harmonic = (0.2 * Math.sin((angle * 2) + phaseA))
    + (0.34 * Math.sin((angle * 3) + phaseB))
    + (0.24 * Math.sin((angle * 5) + phaseC))
    + (0.16 * Math.sin((angle * 7) + phaseD))
  const detail = ((periodicValueNoise(mixSeed(seed, 23), angle, 6) * 2) - 1) * 0.16
    + ((periodicValueNoise(mixSeed(seed, 41), angle, 11) * 2) - 1) * 0.1
  const wave = harmonic + detail
  const amplitude = Math.max(2.6, safeRadius * 0.38)
  return clamp(safeRadius + (wave * amplitude), Math.max(3, safeRadius * 0.55), safeRadius * 1.38)
}

function stampOrganicLake(mapGrid, centerX, centerY, baseRadius, seed) {
  const height = mapGrid.length
  const width = mapGrid[0]?.length || 0
  const radiusLimit = (Math.max(3, baseRadius) * 1.38) + 1
  const minY = Math.max(0, Math.floor(centerY - radiusLimit))
  const maxY = Math.min(height - 1, Math.ceil(centerY + radiusLimit))
  const minX = Math.max(0, Math.floor(centerX - radiusLimit))
  const maxX = Math.min(width - 1, Math.ceil(centerX + radiusLimit))

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - centerX
      const dy = y - centerY
      const distance = Math.hypot(dx, dy)
      if (distance === 0 || distance <= organicLakeRadius(Math.atan2(dy, dx), baseRadius, seed)) {
        setTileToType(mapGrid, x, y, 'water')
      }
    }
  }
}

function buildProtectedTileSet(playerPositions, mapWidth, mapHeight) {
  const protectedTiles = new Set()
  const mark = (x, y) => {
    if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return
    protectedTiles.add(`${x},${y}`)
  }

  playerPositions.forEach(position => {
    for (let y = position.y - 4; y <= position.y + 4; y++) {
      for (let x = position.x - 4; x <= position.x + 4; x++) {
        mark(x, y)
      }
    }
  })

  return protectedTiles
}

function countTilesByType(mapGrid, type) {
  let count = 0
  for (let y = 0; y < mapGrid.length; y++) {
    for (let x = 0; x < mapGrid[0].length; x++) {
      if (mapGrid[y][x].type === type) count++
    }
  }
  return count
}

function drawTerrainLine(mapGrid, start, end, type, thickness = 1, protectedTiles = null) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const steps = Math.max(Math.abs(dx), Math.abs(dy))
  if (steps <= 0) {
    const key = `${start.x},${start.y}`
    if (!protectedTiles || !protectedTiles.has(key)) {
      setTileToType(mapGrid, start.x, start.y, type)
    }
    return
  }

  const radius = Math.max(0, Math.floor(thickness / 2))
  for (let j = 0; j <= steps; j++) {
    const x = Math.floor(start.x + (dx * j) / steps)
    const y = Math.floor(start.y + (dy * j) / steps)
    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        const nx = x + ox
        const ny = y + oy
        if (ny < 0 || nx < 0 || ny >= mapGrid.length || nx >= mapGrid[0].length) continue
        if (Math.hypot(ox, oy) > radius + 0.25) continue
        const key = `${nx},${ny}`
        if (protectedTiles && protectedTiles.has(key)) continue
        mapGrid[ny][nx].type = type
      }
    }
  }
}

function enforceLandAroundBases(mapGrid, playerPositions) {
  playerPositions.forEach(position => {
    for (let y = position.y - 3; y <= position.y + 3; y++) {
      for (let x = position.x - 3; x <= position.x + 3; x++) {
        if (y < 0 || x < 0 || y >= mapGrid.length || x >= mapGrid[0].length) continue
        if (Math.hypot(x - position.x, y - position.y) <= 3.2) {
          mapGrid[y][x].type = 'land'
        }
      }
    }
  })
}

function growLineTerrainToTarget(rand, mapGrid, targetType, targetCount, protectedTiles, options = {}) {
  const width = mapGrid[0].length
  const height = mapGrid.length
  const minThickness = options.minThickness ?? 1
  const maxThickness = options.maxThickness ?? 4
  const maxPasses = options.maxPasses ?? 80
  let passes = 0

  const getRandomEdgePoint = () => {
    const edge = Math.floor(rand() * 4)
    if (edge === 0) return { x: Math.floor(rand() * width), y: 0 }
    if (edge === 1) return { x: width - 1, y: Math.floor(rand() * height) }
    if (edge === 2) return { x: Math.floor(rand() * width), y: height - 1 }
    return { x: 0, y: Math.floor(rand() * height) }
  }

  while (countTilesByType(mapGrid, targetType) < targetCount && passes < maxPasses) {
    passes += 1
    const thickness = clamp(minThickness + Math.floor(rand() * (maxThickness - minThickness + 1)), minThickness, maxThickness)
    const useEdgePoints = targetType === 'water'
    const start = useEdgePoints
      ? getRandomEdgePoint()
      : { x: Math.floor(rand() * width), y: Math.floor(rand() * height) }
    const end = useEdgePoints
      ? getRandomEdgePoint()
      : { x: Math.floor(rand() * width), y: Math.floor(rand() * height) }
    drawTerrainLine(mapGrid, start, end, targetType, thickness, protectedTiles)
  }
}

function createBalancedOreClusterCenters(playerPositions, mapWidth, mapHeight, targetDistance) {
  const inwardTargetX = Math.floor(mapWidth / 2)
  const inwardTargetY = Math.floor(mapHeight / 2)
  const desiredStreetDistance = clamp(targetDistance, 20, 36)

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
      category: 'near',
      radius: 4,
      oreChance: 0.92
    }
  })
}

function createMiddleOreClusterCenters(rand, mapWidth, mapHeight, count, existingPoints) {
  const centerX = Math.floor(mapWidth / 2)
  const centerY = Math.floor(mapHeight / 2)
  const radiusLimit = Math.floor(Math.min(mapWidth, mapHeight) * 0.25)
  const clusters = []
  let attempts = 0
  const maxAttempts = 800

  while (clusters.length < count && attempts < maxAttempts) {
    attempts += 1
    const angle = rand() * Math.PI * 2
    const radius = Math.floor(rand() * Math.max(8, radiusLimit - 8)) + 8
    const x = clamp(Math.floor(centerX + Math.cos(angle) * radius), 3, mapWidth - 4)
    const y = clamp(Math.floor(centerY + Math.sin(angle) * radius), 3, mapHeight - 4)

    const tooCloseToExisting = existingPoints.some(point => Math.hypot(point.x - x, point.y - y) < 10)
    if (tooCloseToExisting) continue

    const tooCloseToMiddle = clusters.some(cluster => Math.hypot(cluster.x - x, cluster.y - y) < 10)
    if (tooCloseToMiddle) continue

    clusters.push({
      id: `middle-${clusters.length + 1}`,
      x,
      y,
      category: 'middle',
      radius: Math.floor(rand() * 3) + 7,
      oreChance: 0.95
    })
  }

  return clusters
}

function createRandomSpreadOreClusters(rand, mapWidth, mapHeight, count, exclusionPoints, minDistance) {
  const clusters = []
  let attempts = 0
  const maxAttempts = 1200

  while (clusters.length < count && attempts < maxAttempts) {
    attempts += 1
    const x = Math.floor(rand() * (mapWidth - 6)) + 3
    const y = Math.floor(rand() * (mapHeight - 6)) + 3

    const nearExclusionPoint = exclusionPoints.some(point => Math.hypot(point.x - x, point.y - y) < minDistance)
    if (nearExclusionPoint) continue

    const nearExisting = clusters.some(cluster => Math.hypot(cluster.x - x, cluster.y - y) < 8)
    if (nearExisting) continue

    clusters.push({
      id: `spread-${clusters.length + 1}`,
      x,
      y,
      category: 'spread',
      radius: Math.floor(rand() * 3) + 4,
      oreChance: 0.88
    })
  }

  return clusters
}

function buildOreClusterPlan(rand, playerPositions, mapWidth, mapHeight, oreFieldCount) {
  const nearOreDistance = clamp(Math.floor(Math.min(mapWidth, mapHeight) * 0.3), 24, 32)
  const partyCount = playerPositions.length

  const nearOreClusters = oreFieldCount >= partyCount
    ? createBalancedOreClusterCenters(playerPositions, mapWidth, mapHeight, nearOreDistance)
    : []

  // Rules:
  // - OFC < partyCount: all fields are center fields
  // - OFC == partyCount: only near fields
  // - OFC > partyCount: next up to 4 fields are center fields
  // - remaining are random spread fields
  const centerFieldCount = oreFieldCount < partyCount
    ? oreFieldCount
    : Math.min(Math.max(oreFieldCount - partyCount, 0), 4)

  const spreadCount = oreFieldCount < partyCount
    ? 0
    : Math.max(0, oreFieldCount - partyCount - centerFieldCount)

  const middleOreClusters = createMiddleOreClusterCenters(
    rand,
    mapWidth,
    mapHeight,
    centerFieldCount,
    [...playerPositions, ...nearOreClusters]
  )

  const randomOreClusters = createRandomSpreadOreClusters(
    rand,
    mapWidth,
    mapHeight,
    spreadCount,
    [...playerPositions, ...nearOreClusters, ...middleOreClusters],
    nearOreDistance - 6
  )

  const allClusters = [...nearOreClusters, ...middleOreClusters, ...randomOreClusters]

  // Deterministic fallback: if constraints prevented full count, fill remaining slots.
  let fallbackIndex = 0
  const maxFallbackAttempts = 500
  while (allClusters.length < oreFieldCount && fallbackIndex < maxFallbackAttempts) {
    const fallbackX = clamp(5 + ((fallbackIndex * 11) % Math.max(10, mapWidth - 10)), 3, mapWidth - 4)
    const fallbackY = clamp(5 + ((fallbackIndex * 7) % Math.max(10, mapHeight - 10)), 3, mapHeight - 4)
    const tooClose = allClusters.some(cluster => Math.hypot(cluster.x - fallbackX, cluster.y - fallbackY) < 7)
    fallbackIndex += 1
    if (tooClose) continue

    allClusters.push({
      id: `fallback-${allClusters.length + 1}`,
      x: fallbackX,
      y: fallbackY,
      category: 'spread',
      radius: 4,
      oreChance: 0.86
    })
  }

  return {
    nearOreDistance,
    nearOreClusters,
    middleOreClusters,
    randomOreClusters,
    allClusters
  }
}

function isValidOreTile(mapGrid, x, y, factoryPositions) {
  const tileType = mapGrid[y]?.[x]?.type
  if (tileType !== 'land' && tileType !== 'street') return false

  const isInFactory = factoryPositions.some(factory =>
    x >= factory.x && x < factory.x + factory.width &&
    y >= factory.y && y < factory.y + factory.height
  )
  if (isInFactory) return false

  const isInBuilding = gameState.buildings && gameState.buildings.some(building => {
    const bx = building.x
    const by = building.y
    const bw = building.width || 1
    const bh = building.height || 1
    return x >= bx && x < bx + bw && y >= by && y < by + bh
  })
  if (isInBuilding) return false

  return true
}

function applySeedCrystal(cluster, mapGrid, mapWidth, mapHeight, rand, factoryPositions) {
  const centerX = clamp(cluster.x, 0, mapWidth - 1)
  const centerY = clamp(cluster.y, 0, mapHeight - 1)
  const seedDensity = Math.max(1, Math.min(5, Math.floor(rand() * 5) + 1))

  if (!isValidOreTile(mapGrid, centerX, centerY, factoryPositions)) {
    return null
  }

  mapGrid[centerY][centerX].ore = true
  mapGrid[centerY][centerX].oreDensity = Math.max(mapGrid[centerY][centerX].oreDensity || 0, seedDensity)
  mapGrid[centerY][centerX].seedCrystal = true
  mapGrid[centerY][centerX].seedCrystalDensity = seedDensity

  return { ...cluster, centerX, centerY, seedDensity }
}

function buildOreCandidatesForSeed(seedCluster, mapGrid, mapWidth, mapHeight, factoryPositions) {
  const radius = Math.max(2, seedCluster.radius || 4)
  const candidates = []

  for (let y = Math.max(0, seedCluster.centerY - radius); y <= Math.min(mapHeight - 1, seedCluster.centerY + radius); y++) {
    for (let x = Math.max(0, seedCluster.centerX - radius); x <= Math.min(mapWidth - 1, seedCluster.centerX + radius); x++) {
      if (x === seedCluster.centerX && y === seedCluster.centerY) continue
      if (!isValidOreTile(mapGrid, x, y, factoryPositions)) continue

      const distance = Math.hypot(x - seedCluster.centerX, y - seedCluster.centerY)
      if (distance > radius + 0.001) continue
      candidates.push({ x, y, distance })
    }
  }

  candidates.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance
    if (a.y !== b.y) return a.y - b.y
    return a.x - b.x
  })

  return candidates
}

function distributeOreAcrossSeeds(seedClusters, mapGrid, mapWidth, mapHeight, factoryPositions, totalOreValue) {
  const oreValueStep = 1000
  const totalUnits = Math.floor(Math.max(0, totalOreValue) / oreValueStep)
  if (totalUnits <= 0 || seedClusters.length === 0) {
    return
  }

  const baseUnitsPerSeed = Math.floor(totalUnits / seedClusters.length)
  let remainingUnits = totalUnits - (baseUnitsPerSeed * seedClusters.length)

  seedClusters.forEach(seedCluster => {
    let unitsForSeed = baseUnitsPerSeed
    if (remainingUnits > 0) {
      unitsForSeed += 1
      remainingUnits -= 1
    }

    const candidates = buildOreCandidatesForSeed(seedCluster, mapGrid, mapWidth, mapHeight, factoryPositions)
    const candidateStates = candidates.map(candidate => ({
      ...candidate,
      maxDensity: getOreDensityForDistance(candidate.distance, seedCluster.radius || 4, seedCluster.seedDensity)
    }))
    const assignedDensities = allocateOreFieldCandidateDensities(candidateStates, unitsForSeed)

    assignedDensities.forEach((assignDensity, candidateIndex) => {
      if (assignDensity <= 0) {
        return
      }

      const candidate = candidateStates[candidateIndex]
      const tile = mapGrid[candidate.y][candidate.x]
      tile.ore = true
      tile.oreDensity = Math.max(tile.oreDensity || 0, assignDensity)
      tile.seedCrystal = false
      tile.seedCrystalDensity = 0
    })
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
      mapGrid[y][x] = { type: 'land', ore: false, oreDensity: 0, seedCrystal: false, seedCrystalDensity: 0, noBuild: 0 }
    }
  }

  // -------- Step 1: Resolve player positions and map settings --------
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

  const protectedTiles = buildProtectedTileSet(playerPositions, MAP_TILES_X, MAP_TILES_Y)
  const requestedWaterPercent = sanitizePercent(gameState.mapWaterPercent, 10)
  const requestedRockPercent = sanitizePercent(gameState.mapRockPercent, 10)
  const totalTerrainPercent = requestedWaterPercent + requestedRockPercent
  const safeWaterPercent = totalTerrainPercent > 50
    ? clamp(50 - requestedRockPercent, 0, 50)
    : requestedWaterPercent
  const safeRockPercent = totalTerrainPercent > 50
    ? clamp(50 - safeWaterPercent, 0, 50)
    : requestedRockPercent
  gameState.mapWaterPercent = safeWaterPercent
  gameState.mapRockPercent = safeRockPercent

  const totalTiles = MAP_TILES_X * MAP_TILES_Y
  const targetWaterTiles = Math.floor((totalTiles * safeWaterPercent) / 100)
  const targetRockTiles = Math.floor((totalTiles * safeRockPercent) / 100)

  // -------- Step 2: Generate rock terrain lines first --------
  // Water is dominant and is drawn afterwards so rivers/lakes/coasts can break rock lines.
  growLineTerrainToTarget(rand, mapGrid, 'rock', targetRockTiles, protectedTiles, {
    minThickness: Math.max(1, Math.floor(1 + (safeRockPercent / 18))),
    maxThickness: Math.max(2, Math.floor(2 + (safeRockPercent / 8))),
    maxPasses: 70
  })

  // -------- Step 3: Generate water terrain over rock (water-dominant) --------
  const enabledShoreSides = [
    gameState.mapShoreNorth ? 'north' : null,
    gameState.mapShoreWest ? 'west' : null,
    gameState.mapShoreEast ? 'east' : null,
    gameState.mapShoreSouth ? 'south' : null
  ].filter(Boolean)

  const shoreDepthScale = safeWaterPercent / 50
  const shoreDepth = Math.max(
    1,
    Math.floor(Math.min(MAP_TILES_X, MAP_TILES_Y) * (0.03 + (0.22 * shoreDepthScale)))
  )
  if (enabledShoreSides.length > 0) {
    applyOrganicShoreWater(mapGrid, enabledShoreSides, shoreDepth, normalizedSeed)
  }

  if (gameState.mapCenterLake) {
    const centerX = Math.floor(MAP_TILES_X / 2)
    const centerY = Math.floor(MAP_TILES_Y / 2)
    const radius = Math.max(5, Math.floor(Math.min(MAP_TILES_X, MAP_TILES_Y) * (0.1 + (0.22 * shoreDepthScale))))
    stampOrganicLake(mapGrid, centerX, centerY, radius, normalizedSeed)
  }

  growLineTerrainToTarget(rand, mapGrid, 'water', targetWaterTiles, protectedTiles, {
    minThickness: Math.max(1, Math.floor(1 + (safeWaterPercent / 20))),
    maxThickness: Math.max(2, Math.floor(2 + (safeWaterPercent / 10))),
    maxPasses: 60
  })

  // -------- Step 4: Generate Streets --------
  const oreFieldCount = sanitizeOreFieldCount(gameState.mapOreFieldCount)
  const oreTotalValue = sanitizeOreTotalValue(gameState.mapOreTotalValue)
  gameState.mapOreFieldCount = oreFieldCount
  gameState.mapOreTotalValue = oreTotalValue
  const orePlan = buildOreClusterPlan(rand, playerPositions, MAP_TILES_X, MAP_TILES_Y, oreFieldCount)

  // Keep a connected global road graph and enforce direct base-to-near-ore street reachability.
  const allStreetPoints = [...playerPositions, ...orePlan.nearOreClusters, ...orePlan.middleOreClusters]
  createOptimizedStreetNetwork(mapGrid, allStreetPoints, 'street')
  if (orePlan.nearOreClusters.length === playerPositions.length) {
    playerPositions.forEach((basePosition, index) => {
      drawOrthogonalStreetPath(mapGrid, basePosition, orePlan.nearOreClusters[index], 'street')
    })
  }

  // Hard guarantee: every base anchor remains on land and every base is land-reachable.
  enforceLandAroundBases(mapGrid, playerPositions)
  if (playerPositions.length > 1) {
    const hubPosition = playerPositions[0]
    for (let i = 1; i < playerPositions.length; i++) {
      drawOrthogonalStreetPath(mapGrid, hubPosition, playerPositions[i], 'street')
    }
  }

  // -------- Step 5: Generate Ore Fields (AFTER terrain generation) --------
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

  const seededClusters = orePlan.allClusters
    .map(cluster => applySeedCrystal(cluster, mapGrid, MAP_TILES_X, MAP_TILES_Y, rand, factoryPositions))
    .filter(Boolean)

  distributeOreAcrossSeeds(seededClusters, mapGrid, MAP_TILES_X, MAP_TILES_Y, factoryPositions, oreTotalValue)
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
