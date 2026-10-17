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

// Snow is strict: vegetation only lands on snow when the sprite is tagged
// 'snow' explicitly (snowy trees and shrubs from a winter sheet). Universal
// vegetation (green shrubs, trees, fields, reeds) is never borrowed for snow;
// universal rocks, ruins, landmarks and other non-vegetation props still are.
export const VEGETATION_TAGS = Object.freeze(['trees', 'tree', 'shrubs', 'shrub', 'bushes', 'bush', 'vegetation', 'plants', 'flowers', 'reeds', 'farm'])
const VEGETATION_TAG_SET = new Set(VEGETATION_TAGS)

export function isVegetationGroup(tagSet) {
  for (const tag of tagSet) if (VEGETATION_TAG_SET.has(tag)) return true
  return false
}

/** Whether a decorative group may be placed on the given biome by tags alone. */
export function groupAllowedOnBiome(tagSet, biome) {
  if (!(tagSet instanceof Set)) return false
  if (biome === 'snow' && !tagSet.has('snow') && isVegetationGroup(tagSet)) return false
  return true
}

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

/** Streets stamped by city layouts; layout preparation treats them as the land they replaced. */
export function isCityStreetTile(tile) {
  return Boolean(tile?.cityStreet) && tile.type === 'street'
}

// Layout preparation must give identical results before and after city
// streets are stamped, so every layout query sees a city street as land.
function isLayoutLand(tile) {
  return isDecoratableLand(tile) || (isCityStreetTile(tile) && !tile.airstripStreet && !tile.ore && !tile.seedCrystal && !tile.building)
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
    if (group.tagSet.has('offshore') || group.tagSet.has('shore_trans')) {
      group.waterTags ||= [...group.tagSet].filter(tag => tag !== 'impassable')
      if (!group.waterTags.includes('passable')) group.waterTags.push('passable')
    }
    const isUniversal = group.tagSet.has('universal')
    if (isUniversal && !group.tagSet.has('shore') && !group.tagSet.has('city') && Number.isFinite(group.coverage) && group.coverage > UNIVERSAL_MAX_COVERAGE) return
    DECORATION_BIOMES.forEach((biome) => {
      if (!group.tagSet.has(biome) && (group.tagSet.has('ground_detail') || !isUniversal)) return
      if (!groupSeasonAllowed(group.tagSet, biome)) return
      if (!groupAllowedOnBiome(group.tagSet, biome)) return
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
      if (isLayoutLand(mapGrid[y][x]) && biomes.includes(resolveBiome(mapGrid[y][x], defaultBiome))) candidates.push({ x, y, biome: resolveBiome(mapGrid[y][x], defaultBiome), hash: decorationHash(x, y, salt + 1877) })
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
        if (!isLayoutLand(tile) || resolveBiome(tile, fallbackBiome) !== biome) return false
      }
    }
    return true
  }

  // Pass 1: multi-tile sprites from anchor cells.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[(y * width) + x]) continue
      const tile = mapGrid[y][x]
      if (!isLayoutLand(tile)) continue
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
      if (!isLayoutLand(tile)) continue
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
  for (let gy = 0; gy < (cell.footprintHeight || group.height); gy++) {
    for (let gx = 0; gx < (cell.footprintWidth || group.width); gx++) {
      const tile = mapGrid?.[anchorY + gy]?.[anchorX + gx]
      const water = group.tagSet.has('offshore') || (group.tagSet.has('shore_trans') && (anchorX + gx !== cell.landX || anchorY + gy !== cell.landY))
      if (water) {
        if (tile?.type !== 'water' || tile.building || tile.ore || tile.seedCrystal) return null
        continue
      }
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

const isRoad = tile => !isCityStreetTile(tile) && (tile?.type === 'street' || tile?.type === 'road' || tile?.airstripStreet)
const isBarrier = tile => Boolean(tile && (tile.type === 'water' || tile.type === 'rock' || tile.impassable || tile.building))

/** Preparation-only masks; all footprint queries below are constant per cell. */
export function buildDecorationConstraints(mapGrid, startPositions = []) {
  const height = mapGrid.length
  const width = mapGrid[0]?.length || 0
  const keepClear = new Uint8Array(width * height)
  const roadDistance = new Uint8Array(width * height).fill(255)
  const shoreDistance = new Uint8Array(width * height).fill(255)
  const landDistance = new Uint8Array(width * height).fill(255)
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
      if (isLayoutLand(tile)) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const cx = x + dx, cy = y + dy
          if (cx >= 0 && cy >= 0 && cx < width && cy < height) {
            const index = cy * width + cx
            landDistance[index] = Math.min(landDistance[index], Math.max(Math.abs(dx), Math.abs(dy)))
          }
        }
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
  return { width, height, keepClear, roadDistance, shoreDistance, landDistance }
}

export function decorationEnvironmentAllows(group, x, y, constraints, footprint = false) {
  const index = y * constraints.width + x
  if (constraints.keepClear[index] || constraints.roadDistance[index] <= 1) return false
  if (group.tagSet.has('roadside') && constraints.roadDistance[index] !== 2) return false
  if (!footprint && group.tagSet.has('shore') && constraints.shoreDistance[index] !== 1) return false
  return true
}

export function decorationSpacing(group) {
  const span = Math.max(group.width, group.height)
  return span >= 3 ? 4 : span >= 2 ? 2 : 1
}

/** Distance between closest covered tile centers, accounting for full spans. */
export function decorationFootprintDistance(a, b) {
  const dx = Math.max(0, a.anchorX - (b.anchorX + (b.footprintWidth || b.group.width) - 1), b.anchorX - (a.anchorX + (a.footprintWidth || a.group.width) - 1))
  const dy = Math.max(0, a.anchorY - (b.anchorY + (b.footprintHeight || b.group.height) - 1), b.anchorY - (a.anchorY + (a.footprintHeight || a.group.height) - 1))
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

const mod3 = value => ((value % 3) + 3) % 3

function isCityStreetCandidate(tile) {
  return Boolean(tile) && (tile.type === 'land' || isCityStreetTile(tile)) &&
    !tile.building && !tile.airstripStreet && !tile.ore && !tile.seedCrystal
}

/**
 * Preparation-only street lattice for city clusters. City anchors sit on a
 * three-tile grid around each center, so rows and columns at offset 2 are the
 * one-tile streets between blocks. Returns center index + 1 per tile, else 0.
 */
export function buildCityStreetLattice(mapGrid, cities) {
  const height = mapGrid.length
  const width = mapGrid[0]?.length || 0
  const lattice = new Uint8Array(width * height)
  const reach = cities.radius + 1
  cities.centers.forEach((center, index) => {
    for (let y = Math.max(0, center.y - reach); y <= Math.min(height - 1, center.y + reach); y++) {
      for (let x = Math.max(0, center.x - reach); x <= Math.min(width - 1, center.x + reach); x++) {
        if ((x - center.x) ** 2 + (y - center.y) ** 2 > reach ** 2) continue
        if (mod3(x - center.x) !== 2 && mod3(y - center.y) !== 2) continue
        const offset = y * width + x
        if (!lattice[offset] && isCityStreetCandidate(mapGrid[y][x])) lattice[offset] = index + 1
      }
    }
  })
  return lattice
}

function createMinHeap() {
  const items = []
  return {
    get size() { return items.length },
    push(cost, offset) {
      items.push([cost, offset])
      let i = items.length - 1
      while (i > 0) {
        const parent = (i - 1) >> 1
        if (items[parent][0] < items[i][0] || (items[parent][0] === items[i][0] && items[parent][1] <= items[i][1])) break
        ;[items[parent], items[i]] = [items[i], items[parent]]
        i = parent
      }
    },
    pop() {
      const top = items[0]
      const last = items.pop()
      if (items.length) {
        items[0] = last
        let i = 0
        for (;;) {
          const l = i * 2 + 1
          const r = l + 1
          let m = i
          const less = (a, b) => items[a][0] < items[b][0] || (items[a][0] === items[b][0] && items[a][1] < items[b][1])
          if (l < items.length && less(l, m)) m = l
          if (r < items.length && less(r, m)) m = r
          if (m === i) break
          ;[items[m], items[i]] = [items[i], items[m]]
          i = m
        }
      }
      return top
    }
  }
}

/**
 * Keep the lattice only around placed city buildings, then join every street
 * component to the generated road network with a cheapest path that never
 * crosses a city building, water, rock or structure.
 */
export function planCityStreets(mapGrid, { cells, groundDetails, lattice, cities }) {
  const height = mapGrid.length
  const width = mapGrid[0]?.length || 0
  const boxes = cities.centers.map(() => null)
  const isCityCell = offset => Boolean(cells[offset]?.group?.tagSet?.has('city'))
  for (let offset = 0; offset < cells.length; offset++) {
    if (!isCityCell(offset)) continue
    const x = offset % width
    const y = (offset - x) / width
    let owner = -1
    let best = Infinity
    cities.centers.forEach((center, index) => {
      const distance = (center.x - x) ** 2 + (center.y - y) ** 2
      if (distance < best) { best = distance; owner = index }
    })
    if (owner < 0) continue
    const box = boxes[owner] ||= { left: x, top: y, right: x, bottom: y }
    box.left = Math.min(box.left, x)
    box.top = Math.min(box.top, y)
    box.right = Math.max(box.right, x)
    box.bottom = Math.max(box.bottom, y)
  }
  const streets = new Uint8Array(width * height)
  for (let offset = 0; offset < lattice.length; offset++) {
    const box = lattice[offset] ? boxes[lattice[offset] - 1] : null
    if (!box) continue
    const x = offset % width
    const y = (offset - x) / width
    if (x >= box.left - 1 && x <= box.right + 1 && y >= box.top - 1 && y <= box.bottom + 1) streets[offset] = 1
  }
  const neighbours = offset => {
    const x = offset % width
    const result = []
    if (x > 0) result.push(offset - 1)
    if (x < width - 1) result.push(offset + 1)
    if (offset >= width) result.push(offset - width)
    if (offset + width < width * height) result.push(offset + width)
    return result
  }
  const tileAt = offset => mapGrid[Math.floor(offset / width)][offset % width]
  const isNetworkRoad = offset => {
    const tile = tileAt(offset)
    return isRoad(tile) && !tile.airstripStreet
  }
  const passable = offset => {
    const tile = tileAt(offset)
    return Boolean(tile) && tile.type !== 'water' && tile.type !== 'rock' && !tile.building && !tile.seedCrystal &&
      !tile.impassable && !tile.airstripStreet && !isCityCell(offset)
  }
  const connected = new Uint8Array(width * height)
  const component = new Int32Array(width * height).fill(-1)
  const components = []
  for (let offset = 0; offset < streets.length; offset++) {
    if (!streets[offset] || component[offset] >= 0) continue
    const members = [offset]
    component[offset] = components.length
    for (let i = 0; i < members.length; i++) {
      for (const next of neighbours(members[i])) {
        if (streets[next] && component[next] < 0) { component[next] = components.length; members.push(next) }
      }
    }
    components.push(members)
  }
  const removed = new Set()
  for (const members of components) {
    if (members.some(offset => neighbours(offset).some(next => isNetworkRoad(next) || connected[next]))) {
      members.forEach(offset => { connected[offset] = 1 })
      continue
    }
    const cost = new Float64Array(width * height).fill(Infinity)
    const previous = new Int32Array(width * height).fill(-1)
    const heap = createMinHeap()
    members.forEach(offset => { cost[offset] = 0; heap.push(0, offset) })
    let reached = -1
    while (heap.size) {
      const [current, offset] = heap.pop()
      if (current > cost[offset]) continue
      if (isNetworkRoad(offset) || connected[offset]) { reached = offset; break }
      for (const next of neighbours(offset)) {
        if (!passable(next) && !isNetworkRoad(next)) continue
        const step = cells[next] ? 4 : 1
        if (current + step < cost[next]) {
          cost[next] = current + step
          previous[next] = offset
          heap.push(current + step, next)
        }
      }
    }
    members.forEach(offset => { connected[offset] = 1 })
    if (reached < 0) continue
    for (let offset = previous[reached]; offset >= 0 && !streets[offset]; offset = previous[offset]) {
      streets[offset] = 1
      connected[offset] = 1
      const cell = cells[offset]
      if (cell) removed.add(cell)
    }
  }
  // Decorations a connector crosses give way to the street.
  if (removed.size) {
    const anchors = new Set([...removed].map(cell => `${cell.anchorX},${cell.anchorY}`))
    for (let offset = 0; offset < cells.length; offset++) {
      const cell = cells[offset]
      if (cell && !cell.group.tagSet.has('city') && anchors.has(`${cell.anchorX},${cell.anchorY}`)) cells[offset] = null
    }
  }
  const result = []
  for (let offset = 0; offset < streets.length; offset++) {
    if (!streets[offset]) continue
    // Already-generated roads stay as they are; only land becomes city street.
    if (isNetworkRoad(offset)) continue
    groundDetails[offset] = null
    result.push(offset)
  }
  return result
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
  const hasCityGroups = options.citySeeds > 0 && DECORATION_BIOMES.some(biome => ['multi', 'single'].some(kind => (pools[biome]?.[kind] || []).some(group => group.tagSet.has('city'))))
  // City streets are reserved before any decoration so blocks keep their roads.
  const cityLattice = hasCityGroups ? buildCityStreetLattice(mapGrid, cities) : null
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
        if (group.tagSet.has('shore')) continue
        const category = group.tagSet.has('farm') ? 'farm' : CLUSTER_CATEGORIES.find(tag => group.tagSet.has(tag)) || 'other'
        if (!categories.has(category)) categories.set(category, [])
        categories.get(category).push(group)
      }
      bags[biome][kind] = [...categories.values()].map(groups => createDecorationBag(groups, salt))
    }
  }
  const fits = (placement, detail = false) => {
    const { group, anchorX: x, anchorY: y, biome } = placement
    const fw = placement.footprintWidth || group.width
    const fh = placement.footprintHeight || group.height
    if (x < 0 || y < 0 || x + fw > width || y + fh > height) return false
    let touchesWater = false
    for (let dy = 0; dy < fh; dy++) {
      for (let dx = 0; dx < fw; dx++) {
        const cx = x + dx
        const cy = y + dy
        const tile = mapGrid[cy][cx]
        const water = group.tagSet.has('offshore') || (group.tagSet.has('shore_trans') && (cx !== placement.landX || cy !== placement.landY))
        if (cityLattice?.[cy * width + cx]) return false
        if ((water ? tile?.type !== 'water' || tile.building || tile.ore || tile.seedCrystal || constraints.landDistance[cy * width + cx] !== 1 : !isLayoutLand(tile) || resolveBiome(tile, defaultBiome) !== biome) || isRoad(tile) ||
          !decorationEnvironmentAllows(group, cx, cy, constraints, true) || (detail ? groundDetails[cy * width + cx] : occupied[cy * width + cx])) return false
        if (constraints.shoreDistance[cy * width + cx] === 1) touchesWater = true
      }
    }
    if (group.tagSet.has('shore') && !group.tagSet.has('offshore') && !group.tagSet.has('shore_trans') && !touchesWater) return false
    if (detail) return true
    if (!group.tagSet.has('shore') && !categoryClusterAllows(group, x, y, biome, clusters)) return false
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
  // Preparation-only coast pass: one attempt per 14 coast tiles, with the
  // ordinary footprint and identical-sprite spacing rules.
  const shoreBags = Object.fromEntries(DECORATION_BIOMES.map(biome => [biome,
    createDecorationBag([...(pools[biome]?.multi || []), ...(pools[biome]?.single || [])]
      .filter(group => group.tagSet.has('shore')), salt)
  ]))
  const coastAnchors = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (constraints.shoreDistance[y * width + x] === 1 && isLayoutLand(mapGrid[y][x])) coastAnchors.push({ x, y })
  }
  const phase = decorationHash(width, height, salt + 4441) % 14
  for (let i = phase; i < coastAnchors.length; i += 14) {
    const { x, y } = coastAnchors[i]
    const biome = resolveBiome(mapGrid[y][x], defaultBiome)
    const bag = shoreBags[biome]
    let placed = false
    for (let attempt = 0; attempt < bag.size && !placed; attempt++) {
      const group = bag.next()
      const directions = group.tagSet.has('offshore')
        ? [[1, 0, 0], [0, 1, 90], [-1, 0, 180], [0, -1, 270], [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0]]
        : group.tagSet.has('shore_trans') ? [[1, 0, 0], [0, 1, 90], [-1, 0, 180], [0, -1, 270]] : [[0, 0, 0]]
      for (const [nx, ny, angle] of directions) {
        const offshore = group.tagSet.has('offshore')
        const crossing = group.tagSet.has('shore_trans')
        if ((offshore || crossing) && mapGrid[y + ny]?.[x + nx]?.type !== 'water') continue
        if (crossing && (group.width !== 2 || group.height !== 1)) continue
        const rotation = crossing ? angle : 0
        const fw = rotation % 180 ? group.height : group.width
        const fh = rotation % 180 ? group.width : group.height
        const ax = offshore ? x + nx : x + Math.min(0, nx)
        const ay = offshore ? y + ny : y + Math.min(0, ny)
        const placement = { group, anchorX: ax, anchorY: ay, biome, rotation, footprintWidth: fw, footprintHeight: fh, landX: x, landY: y }
        if (!fits(placement)) continue
        if (group.width * group.height > 1) placements.push(placement)
        for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) {
          const offsetX = rotation === 90 ? dy : rotation === 180 ? fw - 1 - dx : rotation === 270 ? fh - 1 - dy : dx
          const offsetY = rotation === 90 ? fw - 1 - dx : rotation === 180 ? fh - 1 - dy : rotation === 270 ? dx : dy
          const offset = (ay + dy) * width + ax + dx
          cells[offset] = { ...placement, offsetX, offsetY }
          occupied[offset] = placement
        }
        placed = true
        break
      }
    }
  }
  // Ground detail has its own cells, no impassability and no spacing ownership.
  for (const kind of ['groundDetail', 'multi', 'single']) {
    const detail = kind === 'groundDetail'
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const biome = resolveBiome(mapGrid[y][x], defaultBiome)
        const categoryBags = bags[biome]?.[kind]
        if (!categoryBags?.length || !isLayoutLand(mapGrid[y][x])) continue
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
  const cityStreets = cityLattice ? planCityStreets(mapGrid, { cells, groundDetails, lattice: cityLattice, cities }) : []
  return { width, height, cells, placements, groundDetails, cityStreets }
}
