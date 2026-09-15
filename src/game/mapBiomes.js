const BIOMES = ['grass', 'soil', 'sand', 'snow']
const BIOME_MODES = [...BIOMES, 'mixed']
const DISTRIBUTIONS = new Set(['vertical', 'horizontal', 'corners', 'random'])

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function seededRandom(seed) {
  let state = (Number(seed) || 1) >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function noise(x, y, seed) {
  let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff
}

export function sanitizeBiomeSettings(state = {}) {
  const weights = {}
  for (const biome of BIOMES) {
    const parsed = Number(state.mapBiomeWeights?.[biome])
    weights[biome] = Number.isFinite(parsed) ? clamp(Math.round(parsed), 0, 100) : 25
  }
  if (!Object.values(weights).some(weight => weight > 0)) weights.grass = 100

  return {
    mode: BIOME_MODES.includes(state.activeSpriteSheetBiomeTag) ? state.activeSpriteSheetBiomeTag : 'grass',
    regionCount: clamp(Math.round(Number(state.mapBiomeRegionCount) || 12), 1, 64),
    distribution: DISTRIBUTIONS.has(state.mapBiomeDistribution) ? state.mapBiomeDistribution : 'random',
    weights,
    shorelineWidth: clamp(Math.round(Number.isFinite(Number(state.mapShorelineWidth)) ? Number(state.mapShorelineWidth) : 2), 0, 12),
    transitionPixels: clamp(Math.round(Number.isFinite(Number(state.mapBiomeTransitionPixels)) ? Number(state.mapBiomeTransitionPixels) : 8), 1, 64),
    snowOnPlateaus: state.mapSnowOnPlateaus !== false
  }
}

function createRegionSeeds(rand, count, width, height, distribution) {
  const seeds = []
  const marginX = Math.max(1, width * 0.04)
  const marginY = Math.max(1, height * 0.04)
  const randomX = () => marginX + rand() * Math.max(1, width - marginX * 2)
  const randomY = () => marginY + rand() * Math.max(1, height - marginY * 2)

  for (let index = 0; index < count; index++) {
    const progress = (index + 0.5) / count
    let x = randomX()
    let y = randomY()
    if (distribution === 'vertical') x = progress * width + (rand() - 0.5) * width / count
    if (distribution === 'horizontal') y = progress * height + (rand() - 0.5) * height / count
    if (distribution === 'corners') {
      const corners = [[0.08, 0.08], [0.92, 0.08], [0.92, 0.92], [0.08, 0.92]]
      const [cornerX, cornerY] = corners[index % corners.length]
      const radius = 0.07 + 0.34 * ((Math.floor(index / 4) + 1) / (Math.ceil(count / 4) + 1))
      x = clamp((cornerX + (rand() - 0.5) * radius) * width, marginX, width - marginX)
      y = clamp((cornerY + (rand() - 0.5) * radius) * height, marginY, height - marginY)
    }
    seeds.push({ x, y, stretchX: 0.72 + rand() * 0.8, stretchY: 0.72 + rand() * 0.8 })
  }
  return seeds
}

function findOceanWater(grid) {
  const height = grid.length
  const width = grid[0]?.length || 0
  const ocean = Array.from({ length: height }, () => new Uint8Array(width))
  const queue = []
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height || ocean[y][x] || grid[y][x].type !== 'water') return
    ocean[y][x] = 1
    queue.push([x, y])
  }
  for (let x = 0; x < width; x++) {
    enqueue(x, 0)
    enqueue(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y)
    enqueue(width - 1, y)
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [x, y] = queue[cursor]
    enqueue(x + 1, y)
    enqueue(x - 1, y)
    enqueue(x, y + 1)
    enqueue(x, y - 1)
  }
  return ocean
}

function regionDistances(seeds, x, y, seed, distribution) {
  const warpScale = 11
  const warpX = (noise(Math.floor(x / warpScale), Math.floor(y / warpScale), seed ^ 0x51f15e) - 0.5) * 12
  const warpY = (noise(Math.floor(x / warpScale), Math.floor(y / warpScale), seed ^ 0xa31c7d) - 0.5) * 12
  const axisX = distribution === 'vertical' ? 1.8 : 1
  const axisY = distribution === 'horizontal' ? 1.8 : 1
  return seeds.map((region, index) => {
    const dx = (x + warpX - region.x) / (region.stretchX * axisX)
    const dy = (y + warpY - region.y) / (region.stretchY * axisY)
    return { index, distance: dx * dx + dy * dy }
  }).sort((a, b) => a.distance - b.distance)
}

function buildRegionMap(width, height, seeds, seed, distribution) {
  const regions = Array.from({ length: height }, () => new Uint8Array(width))
  const adjacency = Array.from({ length: seeds.length }, () => new Set())
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const nearest = regionDistances(seeds, x, y, seed, distribution)
    regions[y][x] = nearest[0].index
    if (x > 0 && regions[y][x - 1] !== regions[y][x]) {
      adjacency[regions[y][x]].add(regions[y][x - 1])
      adjacency[regions[y][x - 1]].add(regions[y][x])
    }
    if (y > 0 && regions[y - 1][x] !== regions[y][x]) {
      adjacency[regions[y][x]].add(regions[y - 1][x])
      adjacency[regions[y - 1][x]].add(regions[y][x])
    }
  }
  return { regions, adjacency }
}

function colorRegions(adjacency, weights) {
  const enabled = BIOMES.filter(biome => weights[biome] > 0)
  const totalWeight = enabled.reduce((sum, biome) => sum + weights[biome], 0)
  const assignedCounts = Object.fromEntries(enabled.map(biome => [biome, 0]))
  const colors = new Array(adjacency.length)
  const orderedCandidates = candidates => [...candidates].sort((first, second) => {
    const firstDeficit = (weights[first] / totalWeight) * adjacency.length - assignedCounts[first]
    const secondDeficit = (weights[second] / totalWeight) * adjacency.length - assignedCounts[second]
    return secondDeficit - firstDeficit || enabled.indexOf(first) - enabled.indexOf(second)
  })
  const colorGreedily = index => {
    const neighborColors = new Set([...adjacency[index]].map(neighbor => colors[neighbor]).filter(Boolean))
    const available = enabled.filter(biome => !neighborColors.has(biome))
    const candidates = available.length ? available : enabled
    colors[index] = orderedCandidates(candidates)[0]
    assignedCounts[colors[index]]++
  }

  // With all four terrain colors available, a small DSATUR backtracking pass
  // finds a proper coloring for the planar region graph. Weight deficit only
  // chooses between otherwise valid colors, so coverage controls stay useful.
  if (enabled.length === 4) {
    let attempts = 0
    const solve = coloredCount => {
      if (coloredCount === adjacency.length) return true
      if (++attempts > 200000) return false
      let selected = -1
      let bestSaturation = -1
      let bestDegree = -1
      for (let index = 0; index < adjacency.length; index++) {
        if (colors[index]) continue
        const saturation = new Set([...adjacency[index]].map(neighbor => colors[neighbor]).filter(Boolean)).size
        if (saturation > bestSaturation || (saturation === bestSaturation && adjacency[index].size > bestDegree)) {
          selected = index
          bestSaturation = saturation
          bestDegree = adjacency[index].size
        }
      }
      const used = new Set([...adjacency[selected]].map(neighbor => colors[neighbor]).filter(Boolean))
      for (const biome of orderedCandidates(enabled.filter(candidate => !used.has(candidate)))) {
        colors[selected] = biome
        assignedCounts[biome]++
        if (solve(coloredCount + 1)) return true
        assignedCounts[biome]--
        colors[selected] = undefined
      }
      return false
    }
    if (solve(0)) return colors
    colors.fill(undefined)
    for (const biome of enabled) assignedCounts[biome] = 0
  }

  const order = adjacency.map((neighbors, index) => ({ index, degree: neighbors.size }))
    .sort((a, b) => b.degree - a.degree || a.index - b.index)
  for (const { index } of order) colorGreedily(index)
  return colors
}

function isPlateauSurfaceTile(grid, x, y) {
  if (grid[y]?.[x]?.type !== 'rock') return false

  // Match buildCliffDepth: every rock tile covered by a solid 3x3 footprint
  // belongs to the visible plateau surface, not only the footprint's centre.
  for (let startY = y - 2; startY <= y; startY++) for (let startX = x - 2; startX <= x; startX++) {
    let solid = true
    for (let offsetY = 0; offsetY < 3 && solid; offsetY++) for (let offsetX = 0; offsetX < 3; offsetX++) {
      if (grid[startY + offsetY]?.[startX + offsetX]?.type !== 'rock') {
        solid = false
        break
      }
    }
    if (solid) return true
  }
  return false
}

export function assignMapBiomes(grid, seed, rawSettings = {}) {
  const height = grid.length
  const width = grid[0]?.length || 0
  if (!width || !height) return
  const settings = sanitizeBiomeSettings(rawSettings)

  if (settings.mode !== 'mixed') {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const tile = grid[y][x]
      delete tile.shorelineBiome
      tile.biome = settings.snowOnPlateaus && isPlateauSurfaceTile(grid, x, y) ? 'snow' : settings.mode
      delete tile.biomeBlend
      delete tile.biomeRegion
    }
    return
  }

  const numericSeed = (Number(seed) || 1) ^ 0x6d2b79f5
  const seeds = createRegionSeeds(seededRandom(numericSeed), settings.regionCount, width, height, settings.distribution)
  const { regions, adjacency } = buildRegionMap(width, height, seeds, numericSeed, settings.distribution)
  const colors = colorRegions(adjacency, settings.weights)
  const ocean = settings.weights.sand > 0 ? findOceanWater(grid) : null

  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const tile = grid[y][x]
    delete tile.shorelineBiome
    const region = regions[y][x]
    tile.biomeRegion = region
    tile.biome = colors[region]
    // Only the higher-numbered side of a region edge gets a transition tile.
    // This guarantees a one-tile intersection line instead of a distance band
    // that chains perpendicular to the boundary.
    let edgeNeighbor = null
    for (const [offsetX, offsetY] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const neighborX = x + offsetX
      const neighborY = y + offsetY
      const neighborRegion = regions[neighborY]?.[neighborX]
      if (!Number.isFinite(neighborRegion) || neighborRegion >= region || colors[neighborRegion] === tile.biome) continue
      edgeNeighbor = { region: neighborRegion, x: neighborX, y: neighborY }
      break
    }
    if (edgeNeighbor) {
      const edgeBiome = tile.biome
      tile.biome = colors[edgeNeighbor.region]
      tile.biomeBlend = {
        biome: edgeBiome,
        alpha: 0.5,
        featherPixels: settings.transitionPixels,
        angle: Math.atan2(y - edgeNeighbor.y, x - edgeNeighbor.x)
      }
    } else delete tile.biomeBlend

    let oceanDistance = Infinity
    let nearestOceanOffset = null
    const shorelineRadius = settings.shorelineWidth + 1
    if (ocean && shorelineRadius > 0) for (let offsetY = -shorelineRadius; offsetY <= shorelineRadius; offsetY++) for (let offsetX = -shorelineRadius; offsetX <= shorelineRadius; offsetX++) {
      if (!ocean[y + offsetY]?.[x + offsetX]) continue
      const distance = Math.hypot(offsetX, offsetY)
      if (distance < oceanDistance) {
        oceanDistance = distance
        nearestOceanOffset = { x: offsetX, y: offsetY }
      }
    }
    if (tile.type !== 'water' && settings.shorelineWidth > 0 && oceanDistance <= settings.shorelineWidth) {
      // Keep the shoreline transition exactly one tile wide. A broad alpha
      // distance band creates the same chained checkerboard artifact as biome
      // borders, especially where the coast turns a corner.
      const sandAlpha = oceanDistance < settings.shorelineWidth ? 1 : 0.5
      // Snow changes the visible plateau top, but the coast beside a rock
      // face still needs to source its transition from the sand beneath it.
      tile.shorelineBiome = 'sand'
      if (sandAlpha >= 1) {
        tile.biome = 'sand'
        delete tile.biomeBlend
      } else if (tile.biome !== 'sand') {
        // The feather normal must point toward the nearest ocean tile. This
        // keeps north/south coasts vertical and east/west coasts horizontal,
        // instead of applying one fixed mask direction to every shoreline.
        tile.biomeBlend = {
          biome: 'sand',
          alpha: Math.round(sandAlpha * 100) / 100,
          angle: nearestOceanOffset ? Math.atan2(nearestOceanOffset.y, nearestOceanOffset.x) : 0,
          featherPixels: settings.transitionPixels
        }
      }
    }
    if (settings.snowOnPlateaus && isPlateauSurfaceTile(grid, x, y)) {
      tile.biome = 'snow'
      delete tile.biomeBlend
    }
  }
}

export { BIOMES }
