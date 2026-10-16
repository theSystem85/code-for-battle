import { normalizeDecorationSettings } from '../game/decorationSettings.js'

// Decorative sprite placement for custom sprite-sheet mode.
//
// Multi-tile sprites (forests, lakes, frozen lakes, rock clusters) are placed
// FIRST from the sheet JSON group definitions: an anchor cell is chosen, and the
// sprite is placed only if every covered cell is free land of the anchor's
// biome. Covered cells are marked occupied. Then the remaining free land cells
// get 1x1 decorations at random. Every other cell shows the default organic
// ground. The layout is a pure function of the map grid and the catalog, so it
// is deterministic per map seed.

export const DECORATION_BIOMES = Object.freeze(['grass', 'soil', 'sand', 'snow'])

// Season tags that may appear on each biome. Sprites without a season tag
// (rocks, universal props) are always allowed. Seasons are not switched in game
// yet, so each biome uses a fixed, coherent set.
export const BIOME_SEASONS = Object.freeze({
  grass: Object.freeze(['summer', 'autumn']),
  soil: Object.freeze(['spring', 'summer', 'autumn']),
  sand: Object.freeze(['summer']),
  snow: Object.freeze(['winter'])
})

const SEASON_TAGS = new Set(['spring', 'summer', 'autumn', 'winter'])

// Universal sprites have their own painted ground. When most of the footprint
// is still opaque after the ground cut-out (clearings, paths, rubble fields),
// they would show as foreign ground patches on other biomes, so skip them.
export const UNIVERSAL_MAX_COVERAGE = 0.45

// 1 in N land cells tries to anchor a multi-tile sprite / receives a 1x1 sprite.
export const MULTI_TILE_ANCHOR_INTERVAL = 23
export const SINGLE_DECORATION_INTERVAL = 29

export function decorationHash(x, y, salt = 0) {
  let hash = ((x * 73856093) ^ (y * 19349663) ^ ((x + y + salt) * 83492791)) >>> 0
  hash = Math.imul((hash >>> 16) ^ hash, 0x45d9f3b) >>> 0
  hash = Math.imul((hash >>> 16) ^ hash, 0x45d9f3b) >>> 0
  return ((hash >>> 16) ^ hash) >>> 0
}

function resolveBiome(tile, defaultBiome) {
  return DECORATION_BIOMES.includes(tile?.biome) ? tile.biome : defaultBiome
}

function isDecoratableLand(tile) {
  return Boolean(tile) &&
    tile.type === 'land' &&
    !tile.airstripStreet &&
    !tile.ore &&
    !tile.seedCrystal &&
    !tile.building
}

function groupSeasonAllowed(tagSet, biome) {
  const allowed = BIOME_SEASONS[biome] || []
  let hasSeason = false
  for (const tag of tagSet) {
    if (!SEASON_TAGS.has(tag)) continue
    hasSeason = true
    if (allowed.includes(tag)) return true
  }
  return !hasSeason
}

/**
 * Split decorative group definitions into per-biome multi-tile and 1x1 pools.
 * @param {Array<{width:number,height:number,tagSet:Set<string>,tilesByOffset:Object}>} groups
 */
export function buildDecorationPools(groups) {
  const pools = {}
  DECORATION_BIOMES.forEach((biome) => { pools[biome] = { multi: [], single: [], groundDetail: [] } })
  if (!Array.isArray(groups)) return pools
  groups.forEach((group) => {
    if (!group?.tilesByOffset || !(group.tagSet instanceof Set)) return
    if (!group.tagSet.has('decorative') && !group.tagSet.has('ground_detail')) return
    const isUniversal = group.tagSet.has('universal')
    if (isUniversal && !group.tagSet.has('city') && Number.isFinite(group.coverage) && group.coverage > UNIVERSAL_MAX_COVERAGE) return
    DECORATION_BIOMES.forEach((biome) => {
      if (!group.tagSet.has(biome) && !group.tagSet.has('universal')) return
      if (!groupSeasonAllowed(group.tagSet, biome)) return
      const target = group.tagSet.has('ground_detail') ? pools[biome].groundDetail : (group.width * group.height) > 1 ? pools[biome].multi : pools[biome].single
      target.push(group)
    })
  })
  DECORATION_BIOMES.forEach((biome) => {
    // Larger sprites first so big lakes/forests get a chance before small ones.
    pools[biome].multi.sort((a, b) => (b.width * b.height) - (a.width * a.height))
  })
  return pools
}

/** Seeded land centers and minimum-distance anchors, prepared once per layout. */
export function buildRuinClusters(mapGrid, { defaultBiome = 'grass', salt = 0, radius = 8, minDistance = 4, biomes = DECORATION_BIOMES, count: requestedCount } = {}) {
  const height = mapGrid.length
  const width = mapGrid[0]?.length || 0
  const candidates = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isDecoratableLand(mapGrid[y][x]) && biomes.includes(resolveBiome(mapGrid[y][x], defaultBiome))) candidates.push({ x, y, biome: resolveBiome(mapGrid[y][x], defaultBiome), hash: decorationHash(x, y, salt + 1877) })
    }
  }
  candidates.sort((a, b) => a.hash - b.hash || a.y - b.y || a.x - b.x)
  const centers = []
  const count = requestedCount ?? Math.max(2, Math.min(4, Math.ceil(width * height / 4096)))
  for (const point of candidates) {
    if (centers.length >= count) break
    if (centers.every(center => (center.x - point.x) ** 2 + (center.y - point.y) ** 2 >= (radius * 2) ** 2)) centers.push(point)
    if (centers.length >= count) break
  }
  const anchors = []
  const anchorKeys = new Set()
  for (const point of candidates) {
    if (!centers.some(center => center.biome === point.biome && (center.x - point.x) ** 2 + (center.y - point.y) ** 2 <= radius ** 2)) continue
    if (!anchors.every(anchor => (anchor.x - point.x) ** 2 + (anchor.y - point.y) ** 2 >= minDistance ** 2)) continue
    anchors.push(point)
    anchorKeys.add(`${point.x},${point.y}`)
  }
  return { centers, anchors, anchorKeys, radius, minDistance }
}

/**
 * @returns {{ width:number, height:number, cells:Array<null|{group:Object,offsetX:number,offsetY:number,anchorX:number,anchorY:number,biome:string}>, placements:Array }}
 */
export function buildDecorationLayout(mapGrid, pools, { defaultBiome = 'grass', salt = 0, ruinSeed = salt, startPositions = [], placementRules = false, ...settings } = {}) {
  if (placementRules || DECORATION_BIOMES.some(biome => [...(pools?.[biome]?.multi || []), ...(pools?.[biome]?.single || []), ...(pools?.[biome]?.groundDetail || [])].some(group => ['trees', 'rocks', 'farm', 'landmark', 'roadside', 'shore', 'ground_detail', 'city'].some(tag => group.tagSet.has(tag))))) {
    return buildNaturalDecorationLayout(mapGrid, pools, { defaultBiome, salt, startPositions, ...settings })
  }
  const height = Array.isArray(mapGrid) ? mapGrid.length : 0
  const width = height ? (mapGrid[0]?.length || 0) : 0
  const cells = new Array(width * height).fill(null)
  const placements = []
  if (!width || !height || !pools) return { width, height, cells, placements }
  const fallbackBiome = DECORATION_BIOMES.includes(defaultBiome) ? defaultBiome : 'grass'

  const hasRuins = DECORATION_BIOMES.some(biome => [...(pools[biome]?.multi || []), ...(pools[biome]?.single || [])].some(group => group.tagSet.has('ruins')))
  let ruinSalt = 0
  for (const character of String(ruinSeed)) ruinSalt = (Math.imul(ruinSalt, 31) + character.charCodeAt(0)) | 0
  const ruinBiomes = DECORATION_BIOMES.filter(biome => [...(pools[biome]?.multi || []), ...(pools[biome]?.single || [])].some(group => group.tagSet.has('ruins')))
  const ruins = hasRuins ? buildRuinClusters(mapGrid, { defaultBiome: fallbackBiome, salt: ruinSeed === salt ? salt : ruinSalt, biomes: ruinBiomes, count: normalizeDecorationSettings(settings).ruinSeeds, radius: normalizeDecorationSettings(settings).ruinClusterSize }) : null
  const ruinAllowed = (group, x, y) => !group.tagSet.has('ruins') || ruins.anchorKeys.has(`${x},${y}`)

  const fits = (group, anchorX, anchorY, biome) => {
    if (anchorX + group.width > width || anchorY + group.height > height) return false
    for (let gy = 0; gy < group.height; gy++) {
      const row = mapGrid[anchorY + gy]
      for (let gx = 0; gx < group.width; gx++) {
        const cx = anchorX + gx
        if (cells[((anchorY + gy) * width) + cx]) return false
        const tile = row[cx]
        if (!isDecoratableLand(tile) || resolveBiome(tile, fallbackBiome) !== biome) return false
      }
    }
    return true
  }

  // Pass 1: multi-tile sprites from anchor cells.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[(y * width) + x]) continue
      const tile = mapGrid[y][x]
      if (!isDecoratableLand(tile)) continue
      const hash = decorationHash(x, y, salt)
      if (hash % MULTI_TILE_ANCHOR_INTERVAL !== 0 && !ruins?.anchorKeys.has(`${x},${y}`)) continue
      const biome = resolveBiome(tile, fallbackBiome)
      const candidates = pools[biome]?.multi
      if (!candidates?.length) continue
      const start = (hash >>> 8) % candidates.length
      for (let i = 0; i < candidates.length; i++) {
        const group = candidates[(start + i) % candidates.length]
        if (!group.tagSet.has('ruins') && hash % MULTI_TILE_ANCHOR_INTERVAL !== 0) continue
        if (!ruinAllowed(group, x, y) || !fits(group, x, y, biome)) continue
        const placement = { group, anchorX: x, anchorY: y, biome }
        placements.push(placement)
        for (let gy = 0; gy < group.height; gy++) {
          for (let gx = 0; gx < group.width; gx++) {
            cells[((y + gy) * width) + x + gx] = { ...placement, offsetX: gx, offsetY: gy }
          }
        }
        break
      }
    }
  }

  // Pass 2: 1x1 sprites on the remaining free land cells.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[(y * width) + x]) continue
      const tile = mapGrid[y][x]
      if (!isDecoratableLand(tile)) continue
      const hash = decorationHash(x, y, salt + 7919)
      if (hash % SINGLE_DECORATION_INTERVAL !== 0 && !ruins?.anchorKeys.has(`${x},${y}`)) continue
      const biome = resolveBiome(tile, fallbackBiome)
      const candidates = pools[biome]?.single
      if (!candidates?.length) continue
      const eligible = ruins?.anchorKeys.has(`${x},${y}`) ? candidates.filter(group => group.tagSet.has('ruins')) : candidates
      if (!eligible.length) continue
      const group = eligible[(hash >>> 8) % eligible.length]
      if (!group.tagSet.has('ruins') && hash % SINGLE_DECORATION_INTERVAL !== 0) continue
      if (!ruinAllowed(group, x, y)) continue
      cells[(y * width) + x] = { group, anchorX: x, anchorY: y, biome, offsetX: 0, offsetY: 0 }
    }
  }

  return { width, height, cells, placements }
}

/** Count placed sprites by footprint and kind, for diagnostics and tests. */
export function summarizeDecorationLayout(layout) {
  const summary = { multiTile: 0, singles: 0, impassableMultiTile: 0, bySize: {} }
  if (!layout) return summary
  layout.placements.forEach(({ group }) => {
    summary.multiTile++
    const key = `${group.width}x${group.height}`
    summary.bySize[key] = (summary.bySize[key] || 0) + 1
    if (group.tagSet.has('impassable')) summary.impassableMultiTile++
  })
  layout.cells.forEach((cell) => {
    if (cell && cell.group.width * cell.group.height === 1) summary.singles++
  })
  return summary
}

/**
 * Return the placement for a cell if it is still valid on the (possibly
 * edited) map: every covered cell must still be decoratable land of the
 * placement biome. Otherwise null, so the cell shows plain ground.
 */
export function getValidDecorationCell(layout, mapGrid, x, y, defaultBiome = 'grass', groundDetail = false) {
  if (!layout || x < 0 || y < 0 || x >= layout.width || y >= layout.height) return null
  const cell = (groundDetail ? layout.groundDetails : layout.cells)?.[(y * layout.width) + x]
  if (!cell || cell.cityBuilding?.health <= 0) return null
  const { group, anchorX, anchorY, biome } = cell
  for (let gy = 0; gy < group.height; gy++) {
    for (let gx = 0; gx < group.width; gx++) {
      const tile = mapGrid?.[anchorY + gy]?.[anchorX + gx]
      if (!isDecoratableLand(tile) || resolveBiome(tile, defaultBiome) !== biome) return null
    }
  }
  return cell
}

/** Convert numeric or textual map seeds into a stable 32-bit salt. */
export function decorationSeed(seed) {
  if (Number.isFinite(seed)) return seed | 0
  let salt = 0
  for (const character of String(seed ?? '')) salt = (Math.imul(salt, 31) + character.charCodeAt(0)) | 0
  return salt
}

/** Smooth, low-frequency value noise. No mutable PRNG or traversal dependence. */
export function decorationDensity(x, y, seed = 0, scale = 16) {
  const salt = decorationSeed(seed)
  const ix = Math.floor(x / scale)
  const iy = Math.floor(y / scale)
  const smooth = value => value * value * (3 - 2 * value)
  const tx = smooth(x / scale - ix)
  const ty = smooth(y / scale - iy)
  const value = (dx, dy) => decorationHash(ix + dx, iy + dy, salt) / 0xffffffff
  const top = value(0, 0) * (1 - tx) + value(1, 0) * tx
  const bottom = value(0, 1) * (1 - tx) + value(1, 1) * tx
  return Math.max(0, Math.min(1, (top * (1 - ty) + bottom * ty - 0.2) / 0.6))
}

const CLUSTER_CATEGORIES = ['trees', 'rocks', 'farm']

export function buildCategoryClusters(mapGrid, { salt = 0, defaultBiome = 'grass' } = {}) {
  return Object.fromEntries(CLUSTER_CATEGORIES.map((category, index) => [category,
    buildRuinClusters(mapGrid, { defaultBiome, salt: decorationSeed(salt) + index * 1013, radius: [11, 8, 6][index], minDistance: 1 })
  ]))
}

export function categoryClusterAllows(group, x, y, biome, clusters) {
  // A farm's orchard belongs to the farmstead, rather than requiring two
  // independently seeded clusters to intersect.
  const category = group.tagSet.has('farm') ? 'farm' : CLUSTER_CATEGORIES.find(tag => group.tagSet.has(tag))
  if (!category) return true
  const cluster = clusters[category]
  return cluster.centers.some(center => center.biome === biome && (center.x - x) ** 2 + (center.y - y) ** 2 <= cluster.radius ** 2)
}

const isRoad = tile => tile?.type === 'street' || tile?.type === 'road' || tile?.airstripStreet
const isBarrier = tile => Boolean(tile && (tile.type === 'water' || tile.type === 'rock' || tile.impassable || tile.building))

/** Preparation-only masks; all footprint queries below are constant per cell. */
export function buildDecorationConstraints(mapGrid, startPositions = []) {
  const height = mapGrid.length
  const width = mapGrid[0]?.length || 0
  const keepClear = new Uint8Array(width * height)
  const roadDistance = new Uint8Array(width * height).fill(255)
  const shoreDistance = new Uint8Array(width * height).fill(255)
  const markRadius = (x, y, radius) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue
        const cx = x + dx
        const cy = y + dy
        if (cx >= 0 && cy >= 0 && cx < width && cy < height) keepClear[cy * width + cx] = 1
      }
    }
  }
  for (const point of startPositions) markRadius(Math.floor(point.x), Math.floor(point.y), 8)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = mapGrid[y][x]
      if (tile.ore || tile.seedCrystal) markRadius(x, y, 2)
      if (tile.startPosition || tile.basePosition) markRadius(x, y, 8)
      if (isDecoratableLand(tile)) {
        const blocked = (dx, dy) => isBarrier(mapGrid[y + dy]?.[x + dx])
        if (([1, 2].some(d => blocked(-d, 0)) && [1, 2].some(d => blocked(d, 0))) ||
          ([1, 2].some(d => blocked(0, -d)) && [1, 2].some(d => blocked(0, d)))) keepClear[y * width + x] = 1
      }
      if (!isRoad(tile) && tile.type !== 'water') continue
      const distances = isRoad(tile) ? roadDistance : shoreDistance
      const radius = isRoad(tile) ? 2 : 1
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const cx = x + dx
          const cy = y + dy
          if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue
          const index = cy * width + cx
          distances[index] = Math.min(distances[index], Math.max(Math.abs(dx), Math.abs(dy)))
        }
      }
    }
  }
  return { width, height, keepClear, roadDistance, shoreDistance }
}

export function decorationEnvironmentAllows(group, x, y, constraints) {
  const index = y * constraints.width + x
  if (constraints.keepClear[index] || constraints.roadDistance[index] <= 1) return false
  if (group.tagSet.has('roadside') && constraints.roadDistance[index] !== 2) return false
  if (group.tagSet.has('shore') && constraints.shoreDistance[index] > 1) return false
  return true
}

export function decorationSpacing(group) {
  const span = Math.max(group.width, group.height)
  return span >= 3 ? 4 : span >= 2 ? 2 : 1
}

/** Distance between closest covered tile centers, accounting for full spans. */
export function decorationFootprintDistance(a, b) {
  const dx = Math.max(0, a.anchorX - (b.anchorX + b.group.width - 1), b.anchorX - (a.anchorX + a.group.width - 1))
  const dy = Math.max(0, a.anchorY - (b.anchorY + b.group.height - 1), b.anchorY - (a.anchorY + a.group.height - 1))
  return Math.hypot(dx, dy)
}

export function decorationIdentity(group) {
  const first = group.tilesByOffset['0,0']
  return `${first?.sheetPath || group.sheetPath || ''}:${group.groupLabel || JSON.stringify(first?.rect)}`
}

export function decorationSpacingAllows(placement, nearby) {
  const identity = decorationIdentity(placement.group)
  return nearby.every(other => {
    const distance = decorationFootprintDistance(placement, other)
    if (placement.group.tagSet.has('city') && other.group.tagSet.has('city')) return distance >= 2
    return distance >= Math.max(decorationSpacing(placement.group), decorationSpacing(other.group)) &&
      (identity !== decorationIdentity(other.group) || distance >= 6)
  })
}

export function landmarkAllows(x, y, landmarks) {
  return landmarks.length < 3 && !landmarks.some(point => Math.floor(point.anchorX / 64) === Math.floor(x / 64) && Math.floor(point.anchorY / 64) === Math.floor(y / 64))
}

/** Seeded round robin: each candidate is offered once before the bag repeats. */
export function createDecorationBag(candidates, salt = 0) {
  const ordered = candidates.map((group, index) => ({ group, hash: decorationHash(index, candidates.length, decorationSeed(salt)) }))
    .sort((a, b) => a.hash - b.hash).map(entry => entry.group)
  let cursor = 0
  return { next: () => ordered.length ? ordered[cursor++ % ordered.length] : null, size: ordered.length }
}

/** Natural placement is used only with opted-in category/detail catalogs. */
export function buildNaturalDecorationLayout(mapGrid, pools, { defaultBiome = 'grass', salt = 0, startPositions = [], ...settings } = {}) {
  const options = normalizeDecorationSettings(settings)
  const height = mapGrid?.length || 0
  const width = mapGrid?.[0]?.length || 0
  const cells = new Array(width * height).fill(null)
  const groundDetails = new Array(width * height).fill(null)
  const placements = []
  if (!width || !height || !pools) return { width, height, cells, placements, groundDetails }
  salt = decorationSeed(salt)
  const constraints = buildDecorationConstraints(mapGrid, startPositions)
  const clusters = buildCategoryClusters(mapGrid, { salt, defaultBiome })
  const ruins = buildRuinClusters(mapGrid, { salt, defaultBiome, count: options.ruinSeeds, radius: options.ruinClusterSize })
  const cities = buildRuinClusters(mapGrid, { salt: salt + 7919, defaultBiome, count: options.citySeeds, radius: options.cityClusterSize, minDistance: 1 })
  const clusterSeeds = new Set(Object.values(clusters).flatMap(cluster => cluster.centers.map(center => `${center.x},${center.y}`)))
  const landmarks = []
  // Index covered tiles once. Spacing probes visit at most a six-tile halo,
  // rather than scanning all earlier placements per candidate.
  const occupied = new Array(width * height).fill(null)
  const bags = {}
  for (const biome of DECORATION_BIOMES) {
    bags[biome] = {}
    for (const kind of ['multi', 'single', 'groundDetail']) {
      const categories = new Map()
      for (const group of pools[biome]?.[kind] || []) {
        const category = group.tagSet.has('farm') ? 'farm' : CLUSTER_CATEGORIES.find(tag => group.tagSet.has(tag)) || 'other'
        if (!categories.has(category)) categories.set(category, [])
        categories.get(category).push(group)
      }
      bags[biome][kind] = [...categories.values()].map(groups => createDecorationBag(groups, salt))
    }
  }
  const fits = (placement, detail = false) => {
    const { group, anchorX: x, anchorY: y, biome } = placement
    if (x + group.width > width || y + group.height > height) return false
    for (let dy = 0; dy < group.height; dy++) {
      for (let dx = 0; dx < group.width; dx++) {
        const cx = x + dx
        const cy = y + dy
        const tile = mapGrid[cy][cx]
        if (!isDecoratableLand(tile) || isRoad(tile) || resolveBiome(tile, defaultBiome) !== biome ||
          !decorationEnvironmentAllows(group, cx, cy, constraints) || (detail ? groundDetails[cy * width + cx] : occupied[cy * width + cx])) return false
      }
    }
    if (detail) return true
    if (!categoryClusterAllows(group, x, y, biome, clusters)) return false
    if (group.tagSet.has('city') && !cities.centers.some(center => {
      const farX = Math.max(Math.abs(center.x - x), Math.abs(center.x - (x + group.width - 1)))
      const farY = Math.max(Math.abs(center.y - y), Math.abs(center.y - (y + group.height - 1)))
      return center.biome === biome && farX ** 2 + farY ** 2 <= cities.radius ** 2 && (x - center.x) % 3 === 0 && (y - center.y) % 3 === 0
    })) return false
    if (group.tagSet.has('ruins') && !ruins.anchorKeys.has(`${x},${y}`)) return false
    if (group.tagSet.has('landmark') && !landmarkAllows(x, y, landmarks)) return false
    const nearby = new Set()
    for (let cy = Math.max(0, y - 6); cy < Math.min(height, y + group.height + 6); cy++) {
      for (let cx = Math.max(0, x - 6); cx < Math.min(width, x + group.width + 6); cx++) {
        const other = occupied[cy * width + cx]
        if (other) nearby.add(other)
      }
    }
    return decorationSpacingAllows(placement, [...nearby])
  }
  // Ground detail has its own cells, no impassability and no spacing ownership.
  for (const kind of ['groundDetail', 'multi', 'single']) {
    const detail = kind === 'groundDetail'
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const biome = resolveBiome(mapGrid[y][x], defaultBiome)
        const categoryBags = bags[biome]?.[kind]
        if (!categoryBags?.length || !isDecoratableLand(mapGrid[y][x])) continue
        const hash = decorationHash(x, y, salt + (detail ? 3209 : kind === 'single' ? 7919 : 0))
        const interval = detail ? 40 : kind === 'multi' ? MULTI_TILE_ANCHOR_INTERVAL : SINGLE_DECORATION_INTERVAL
        const density = decorationDensity(x, y, salt)
        if (hash / 0x100000000 >= density / interval && !(kind !== 'groundDetail' && (ruins.anchorKeys.has(`${x},${y}`) || cities.anchorKeys.has(`${x},${y}`) || clusterSeeds.has(`${x},${y}`)))) continue
        const start = (hash >>> 8) % categoryBags.length
        let placed = false
        for (let index = 0; index < categoryBags.length && !placed; index++) {
          const bag = categoryBags[(start + index) % categoryBags.length]
          for (let attempt = 0; attempt < bag.size; attempt++) {
            const group = bag.next()
            const placement = { group, anchorX: x, anchorY: y, biome }
            if (!fits(placement, detail)) continue
            if (!detail) {
              if (kind === 'multi') placements.push(placement)
              if (group.tagSet.has('landmark')) landmarks.push(placement)
            }
            for (let dy = 0; dy < group.height; dy++) {
              for (let dx = 0; dx < group.width; dx++) {
                const offset = (y + dy) * width + x + dx
                const cell = { ...placement, offsetX: dx, offsetY: dy }
                if (detail) groundDetails[offset] = cell
                else { cells[offset] = cell; occupied[offset] = placement }
              }
            }
            placed = true
            break
          }
        }
      }
    }
  }
  return { width, height, cells, placements, groundDetails }
}
