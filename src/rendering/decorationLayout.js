import { getCityBuildingDensity, getCityMaximumDensity, getCityDensityLimit } from './cityDensity.js'
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
// 1 in N land tiles directly next to a road tries a roadside prop.
export const ROADSIDE_INTERVAL = 14

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
  if (placementRules || DECORATION_BIOMES.some(biome => [...(pools?.[biome]?.multi || []), ...(pools?.[biome]?.single || []), ...(pools?.[biome]?.groundDetail || [])].some(group => ['trees', 'rocks', 'farm', 'landmark', 'roadside', 'rare', 'stones', 'shore', 'ground_detail', 'city'].some(tag => group.tagSet.has(tag))))) {
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

// Preparation only: orient a full native rectangle along a coastal normal.
function coastAnchorCoordinate(coordinate, normal, span, crossing, offshore) {
  if (offshore) return coordinate + normal - (normal < 0 ? span - 1 : 0)
  if (!normal) return coordinate - Math.floor(span / 2)
  const endsAtAnchor = crossing ? normal < 0 : normal > 0
  return endsAtAnchor ? coordinate - span + 1 : coordinate
}

// The native crossing's western column rests on land; remaining columns
// project over water. Inverse rotation keeps this contract for every coast.
function shoreWaterAt(placement, x, y) {
  const { group, anchorX, anchorY, rotation = 0 } = placement
  if (group.tagSet.has('offshore')) return true
  if (!group.tagSet.has('shore_trans')) return false
  const dx = x - anchorX, dy = y - anchorY
  const column = rotation === 90 ? dy : rotation === 180 ? group.width - 1 - dx : rotation === 270 ? group.width - 1 - dy : dx
  return column > 0
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
      const water = shoreWaterAt(cell, anchorX + gx, anchorY + gy)
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

const isForestTree = group => group.tagSet.has('trees') &&
  !['farm', 'city', 'ruins', 'shore', 'roadside', 'stones', 'ground_detail'].some(tag => group.tagSet.has(tag))

const OTHER_VEGETATION_TAGS = new Set(['shrubs', 'shrub', 'bushes', 'bush', 'vegetation', 'plants', 'flowers', 'reeds'])

/** One tree sprite, including 1×1 and 2×2 crowns. Larger tree groups are woods. */
export function isWoodSprite(group) {
  return isForestTree(group) && Math.max(group.width || 0, group.height || 0) >= 3
}

export function isSingleTreeSprite(group) {
  return isForestTree(group) && !isWoodSprite(group)
}

export function isLakeSprite(group) {
  const tags = group?.tagSet
  return tags instanceof Set && tags.has('lake') && !tags.has('shore')
}

export function isOtherVegetationSprite(group) {
  const tags = group?.tagSet
  if (!(tags instanceof Set) || isForestTree(group)) return false
  if (['lake', 'shore', 'ground_detail', 'stones', 'city', 'ruins', 'farm', 'roadside', 'rocks'].some(tag => tags.has(tag))) return false
  for (const tag of tags) if (OTHER_VEGETATION_TAGS.has(tag)) return true
  return false
}

function shoreProximityWeight(distance) {
  if (distance <= 2) return 8
  if (distance <= 5) return 5
  if (distance <= 10) return 3
  if (distance <= 16) return 2
  return 1
}

/** Preparation-only forest field: overlapping elliptical lobes, ragged edges
 * and coherent clearings. One bounded field is shared by all tree candidates. */
export function buildForestClusters(mapGrid, { salt = 0, defaultBiome = 'grass', count: requestedCount, radius: requestedRadius, waterDistance = null } = {}) {
  salt = decorationSeed(salt)
  const height = mapGrid.length, width = mapGrid[0]?.length || 0
  const radius = Number.isFinite(requestedRadius) ? Math.max(1, Math.floor(requestedRadius)) : 11
  const density = new Float32Array(width * height)
  const biomes = new Uint8Array(width * height).fill(255)
  const candidates = DECORATION_BIOMES.map(() => [])
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!isLayoutLand(mapGrid[y][x])) continue
    const biome = resolveBiome(mapGrid[y][x], defaultBiome)
    const index = DECORATION_BIOMES.indexOf(biome)
    if (index < 0) continue
    biomes[y * width + x] = index
    candidates[index].push({ x, y, biome, hash: decorationHash(x, y, salt + 1877) })
  }
  const centers = []
  const waterBand = point => (waterDistance ? Math.min(8, (waterDistance[point.y * width + point.x] / 3) | 0) : 0)
  candidates.forEach(points => {
    points.sort((a, b) => waterBand(a) - waterBand(b) || a.hash - b.hash || a.y - b.y || a.x - b.x)
    const selected = []
    const count = requestedCount == null ? Math.min(12, Math.ceil(points.length / 1800)) : Math.max(0, Math.floor(requestedCount))
    for (const point of points) {
      if (selected.length >= count) break
      if (selected.every(center => Math.hypot(center.x - point.x, center.y - point.y) >= radius * 1.8)) selected.push(point)
    }
    centers.push(...selected)
  })
  for (const center of centers) {
    const random = createSeededRandom(decorationHash(center.x, center.y, salt + 4921))
    const angle = random() * Math.PI * 2
    const lobes = [{ x: center.x, y: center.y, rx: radius, ry: radius * (0.65 + random() * 0.4), angle }]
    for (let branch = 0; branch < 3; branch++) {
      const direction = angle + (random() - 0.5) * 4
      const reach = radius * (0.45 + random() * 0.65)
      lobes.push({ x: center.x + Math.cos(direction) * reach, y: center.y + Math.sin(direction) * reach,
        rx: radius * (0.5 + random() * 0.45), ry: radius * (0.4 + random() * 0.3), angle: direction })
    }
    for (const lobe of lobes) {
      const bound = Math.ceil(Math.max(lobe.rx, lobe.ry) * 1.2)
      const cos = Math.cos(lobe.angle), sin = Math.sin(lobe.angle)
      for (let y = Math.max(0, Math.floor(lobe.y) - bound); y <= Math.min(height - 1, Math.ceil(lobe.y) + bound); y++) {
        for (let x = Math.max(0, Math.floor(lobe.x) - bound); x <= Math.min(width - 1, Math.ceil(lobe.x) + bound); x++) {
          const offset = y * width + x
          if (biomes[offset] !== DECORATION_BIOMES.indexOf(center.biome)) continue
          const dx = x - lobe.x, dy = y - lobe.y
          const distance = Math.hypot((dx * cos + dy * sin) / lobe.rx, (dy * cos - dx * sin) / lobe.ry)
          const edge = decorationDensity(x, y, salt + 743, 6)
          const clearing = decorationDensity(x, y, salt + 1163, 8)
          const shape = 1 - distance + (edge - 0.5) * 0.45
          if (shape <= 0 || clearing < 0.13) continue
          density[offset] = Math.max(density[offset], Math.min(0.62, shape * 1.2) * (0.35 + clearing * 0.65))
        }
      }
    }
    density[center.y * width + center.x] = Math.max(0.3, density[center.y * width + center.x])
  }
  return { centers, radius, width, height, density, biomes, salt }
}

function forestAllows(forest, x, y, biome) {
  if (x < 0 || y < 0 || x >= forest.width || y >= forest.height) return false
  const offset = y * forest.width + x
  if (forest.biomes[offset] !== DECORATION_BIOMES.indexOf(biome)) return false
  return forest.density[offset] > 0 || decorationHash(x, y, forest.salt + 16927) % 400 === 0
}

export function buildCategoryClusters(mapGrid, { salt = 0, defaultBiome = 'grass', woodClusterCount, woodClusterRadius, waterDistance } = {}) {
  return {
    trees: buildForestClusters(mapGrid, { salt, defaultBiome, count: woodClusterCount, radius: woodClusterRadius, waterDistance }),
    rocks: buildRuinClusters(mapGrid, { defaultBiome, salt: decorationSeed(salt) + 1013, radius: 8, minDistance: 1 }),
    farm: buildRuinClusters(mapGrid, { defaultBiome, salt: decorationSeed(salt) + 2026, radius: 6, minDistance: 1 })
  }
}

export function categoryClusterAllows(group, x, y, biome, clusters) {
  // A farm's orchard belongs to the farmstead, rather than requiring two
  // independently seeded clusters to intersect.
  const category = group.tagSet.has('farm') ? 'farm' : CLUSTER_CATEGORIES.find(tag => group.tagSet.has(tag))
  if (!category) return true
  const cluster = clusters[category]
  if (category === 'trees') return forestAllows(cluster, x, y, biome)
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
        landDistance[y * width + x] = 0
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
  // Chebyshev distance transform, prepared once in O(map area). Native-size
  // offshore props can reach farther than the old one-cell water strip.
  for (const direction of [1, -1]) {
    for (let y = direction === 1 ? 0 : height - 1; y >= 0 && y < height; y += direction) {
      for (let x = direction === 1 ? 0 : width - 1; x >= 0 && x < width; x += direction) {
        const index = y * width + x
        const previousY = y - direction
        if (previousY >= 0 && previousY < height) for (let dx = -1; dx <= 1; dx++) {
          if (x + dx >= 0 && x + dx < width) landDistance[index] = Math.min(landDistance[index], landDistance[previousY * width + x + dx] + 1)
        }
        if (x - direction >= 0 && x - direction < width) landDistance[index] = Math.min(landDistance[index], landDistance[index - direction] + 1)
      }
    }
  }
  return { width, height, keepClear, roadDistance, shoreDistance, landDistance }
}

export function decorationEnvironmentAllows(group, x, y, constraints, footprint = false) {
  const index = y * constraints.width + x
  if (constraints.keepClear[index]) return false
  // Roadside props sit directly next to a road (anchor on the first ring;
  // other footprint cells extend inland at their native size). Everything else keeps
  // a one-tile buffer from roads.
  if (group.tagSet.has('roadside')) {
    const distance = constraints.roadDistance[index]
    if (footprint ? distance < 1 : distance !== 1) return false
  } else if (constraints.roadDistance[index] <= 1) return false
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
    // Houses along a street may form gapless rows.
    if (placement.group.tagSet.has('city') && other.group.tagSet.has('city')) return distance >= 1
    // Natural woods may have touching crowns, with no overlapping footprints.
    // Identical tree art still keeps a small variety buffer; orchards retain
    // ordinary farm spacing.
    if (isForestTree(placement.group) && isForestTree(other.group)) return distance >= (identity === decorationIdentity(other.group) ? 3 : 1)
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


function isCityStreetCandidate(tile) {
  return Boolean(tile) && (tile.type === 'land' || isCityStreetTile(tile)) &&
    !tile.building && !tile.airstripStreet && !tile.ore && !tile.seedCrystal
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

const sign = value => (value > 0 ? 1 : value < 0 ? -1 : 0)

/**
 * Organic city streets (preparation only). Each city centre gets one gently
 * curved main street through it along the axis with the most usable land,
 * plus 1-4 perpendicular side streets (by city radius) that may branch once.
 * Streets bend around water, rock and other obstacles, stop at the map's
 * roads (joined) or when they touch another street (reconnected); everything
 * else is a dead end. Deterministic from the salt and the map.
 * Returns { mask, cities: [{ index, center, streets: [{ kind, tiles, joined }], ends }] },
 * where mask holds the city index + 1 for every planned street tile.
 */
export function planOrganicCityStreets(mapGrid, cities, { salt = 0, constraints = null } = {}) {
  const height = mapGrid.length
  const width = mapGrid[0]?.length || 0
  const mask = new Uint8Array(width * height)
  const result = []
  const isNetworkRoad = tile => isRoad(tile) && !tile.airstripStreet
  const usable = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false
    if (constraints?.keepClear[y * width + x]) return false
    return isCityStreetCandidate(mapGrid[y][x])
  }
  const neighbours4 = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
  const touchesStreet = (x, y, ignore) => neighbours4(x, y).some(([nx, ny]) => {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height || (ignore && ignore.has(ny * width + nx))) return false
    return mask[ny * width + nx] || isNetworkRoad(mapGrid[ny][nx])
  })
  // Walk a one-tile street from `start` (already a street tile) along `dir`.
  const walk = (owner, start, dir, length, { slope = 0, amplitude = 0, period = 12, phase = 0, graceSteps = 1 } = {}) => {
    const [dx, dy] = dir
    const horizontal = dx !== 0
    const toXY = (t, lateral) => horizontal ? [start.x + dx * t, lateral] : [lateral, start.y + dy * t]
    const tiles = []
    let lateral = horizontal ? start.y : start.x
    let base = lateral
    let prev = start.y * width + start.x
    let joined = false
    let stopped = false
    // Grace: the first steps of a branch may touch its parent street.
    const parentNear = new Set([prev])
    for (const [nx, ny] of neighbours4(start.x, start.y)) if (nx >= 0 && ny >= 0 && nx < width && ny < height) parentNear.add(ny * width + nx)
    const tryTile = (x, y, t) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return 'blocked'
      const offset = y * width + x
      if (isNetworkRoad(mapGrid[y][x])) return 'join'
      if (mask[offset]) return 'join'
      if (!usable(x, y)) return 'blocked'
      const ignore = new Set([prev])
      if (t <= graceSteps) for (const near of parentNear) ignore.add(near)
      const touches = touchesStreet(x, y, ignore)
      mask[offset] = owner + 1
      tiles.push(offset)
      prev = offset
      return touches ? 'join' : 'ok'
    }
    for (let t = 1; t <= length && !stopped; t++) {
      const desired = Math.round(base + slope * t + amplitude * (Math.sin(phase + (2 * Math.PI * t) / period) - Math.sin(phase)))
      if (desired !== lateral) {
        const next = lateral + sign(desired - lateral)
        const [x, y] = toXY(t - 1, next)
        if (usable(x, y) && !mask[y * width + x]) {
          const status = tryTile(x, y, t)
          lateral = next
          if (status === 'join') { joined = true; break }
        }
      }
      let [x, y] = toXY(t, lateral)
      let status = tryTile(x, y, t)
      if (status === 'blocked') {
        // Follow the terrain: sidestep one tile around the obstacle.
        let detoured = false
        for (const nudge of [1, -1]) {
          const [sx, sy] = toXY(t - 1, lateral + nudge)
          ;[x, y] = toXY(t, lateral + nudge)
          if (!usable(sx, sy) || !usable(x, y) || mask[sy * width + sx] || mask[y * width + x]) continue
          const first = tryTile(sx, sy, t)
          lateral += nudge
          base += nudge
          if (first === 'join') { joined = true; stopped = true; detoured = true; break }
          status = tryTile(x, y, t)
          detoured = true
          break
        }
        if (!detoured) break
        if (stopped) break
      }
      if (status === 'join') { joined = true; break }
      if (status === 'blocked') break
    }
    return { tiles, joined }
  }
  const releaseShort = (street, minimum) => {
    if (street.tiles.length >= minimum) return street
    street.tiles.forEach(offset => { mask[offset] = 0 })
    return { ...street, tiles: [] }
  }

  // A centre right beside a big road would only grow a stub; move it up to
  // three tiles away from roads (nearest such tile, deterministic order).
  const relocate = center => {
    let best = null
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = center.x + dx
      const y = center.y + dy
      if (!usable(x, y) || mask[y * width + x]) continue
      if (constraints && constraints.roadDistance[y * width + x] <= 2) continue
      const distance = dx * dx + dy * dy
      if (!best || distance < best.distance) best = { x, y, distance }
    }
    return best ? { ...center, x: best.x, y: best.y } : center
  }
  cities.centers.forEach((originalCenter, index) => {
    const center = relocate(originalCenter)
    if (!usable(center.x, center.y) || mask[center.y * width + center.x]) return
    const random = createSeededRandom(decorationHash(center.x, center.y, salt + 9013 + index))
    const radius = cities.radius
    const reach = Math.max(3, radius)
    // Main street along the axis with the most usable land through the centre.
    const landAlong = ([dx, dy]) => {
      let count = 0
      for (let t = -reach; t <= reach; t++) if (usable(center.x + dx * t, center.y + dy * t)) count++
      return count
    }
    const horizontalLand = landAlong([1, 0])
    const verticalLand = landAlong([0, 1])
    const axis = horizontalLand === verticalLand ? (random() < 0.5 ? [1, 0] : [0, 1]) : horizontalLand > verticalLand ? [1, 0] : [0, 1]
    const centerOffset = center.y * width + center.x
    mask[centerOffset] = index + 1
    const curve = () => ({ slope: (random() - 0.5) * 0.3, amplitude: 0.5 + random() * 0.9, period: reach * (2 + random() * 2), phase: random() * Math.PI * 2 })
    const shape = curve()
    const forward = walk(index, center, axis, reach, shape)
    // Same curve continued through the centre: mirror slope, amplitude and phase.
    const backward = walk(index, center, [-axis[0], -axis[1]], reach, { ...shape, slope: -shape.slope, amplitude: -shape.amplitude, phase: -shape.phase })
    const mainTiles = [...[...backward.tiles].reverse(), centerOffset, ...forward.tiles]
    const streets = [{ kind: 'main', tiles: mainTiles, joined: forward.joined || backward.joined }]
    const ends = [
      { offset: backward.tiles.at(-1) ?? centerOffset, joined: backward.joined },
      { offset: forward.tiles.at(-1) ?? centerOffset, joined: forward.joined }
    ]
    // Side streets: more for bigger cities, spread along the main street on
    // alternating sides; some branch once (dead end or reconnecting).
    const sideCount = Math.max(1, Math.min(4, Math.round(radius / 4) + Math.floor(random() * 3) - 1))
    let side = random() < 0.5 ? 1 : -1
    const used = []
    for (let j = 0; j < sideCount; j++) {
      const ideal = Math.round(((j + 1) * (mainTiles.length - 1)) / (sideCount + 1)) + Math.floor(random() * 3) - 1
      let at = Math.max(2, Math.min(mainTiles.length - 3, ideal))
      // Start from a straight piece of the main street (no jog beside it).
      const straight = index => {
        const offset = mainTiles[index]
        if (offset == null) return false
        const x = offset % width
        const y = Math.floor(offset / width)
        const across = axis[0] ? [[x, y - 1], [x, y + 1]] : [[x - 1, y], [x + 1, y]]
        return across.every(([cx, cy]) => !mask[cy * width + cx])
      }
      at = [0, 1, -1, 2, -2].map(delta => at + delta).find(index => index >= 2 && index <= mainTiles.length - 3 && straight(index)) ?? -1
      if (at < 2 || used.some(other => other.side === side && Math.abs(other.at - at) < 5)) { side = -side; continue }
      const origin = mainTiles[at]
      const start = { x: origin % width, y: Math.floor(origin / width) }
      const dir = axis[0] ? [0, side] : [side, 0]
      const length = Math.max(3, Math.round(reach * (0.45 + random() * 0.4)))
      const street = releaseShort({ kind: 'side', ...walk(index, start, dir, length, { slope: (random() - 0.5) * 0.2, amplitude: random() * 0.6, period: length * 2.5, phase: random() * Math.PI * 2 }) }, 3)
      used.push({ side, at })
      side = -side
      if (!street.tiles.length) continue
      streets.push(street)
      if (random() < 0.5 && street.tiles.length >= 4) {
        const from = street.tiles[Math.max(1, Math.round(street.tiles.length * 0.6) - 1)]
        const branchStart = { x: from % width, y: Math.floor(from / width) }
        const along = random() < 0.5 ? 1 : -1
        const branch = releaseShort({ kind: 'branch', ...walk(index, branchStart, [axis[0] * along, axis[1] * along], 3 + Math.floor(random() * 4), { graceSteps: 1 }) }, 2)
        if (branch.tiles.length) streets.push(branch)
      }
    }
    result.push({ index, center, streets, ends })
  })
  // Keep two tiles beyond every street tip free of houses, so dead ends stay
  // open and main-street ends can be linked to the road network.
  const reserved = new Set()
  const reserveBeyond = (from, tip) => {
    const fx = from % width
    const tx = tip % width
    const dx = tx - fx
    const dy = Math.floor(tip / width) - Math.floor(from / width)
    if (Math.abs(dx) + Math.abs(dy) !== 1) return
    for (let step = 1; step <= 2; step++) {
      const x = tx + dx * step
      const y = Math.floor(tip / width) + dy * step
      if (x >= 0 && y >= 0 && x < width && y < height) reserved.add(y * width + x)
    }
  }
  for (const city of result) {
    for (const street of city.streets) {
      const tiles = street.tiles
      if (tiles.length >= 2) {
        reserveBeyond(tiles.at(-2), tiles.at(-1))
        if (street.kind === 'main') reserveBeyond(tiles[1], tiles[0])
      }
    }
  }
  return { mask, cities: result, reserved }
}

/** Facing rows next to a street tile for a w x h house on each side. */
export function cityHouseAnchors(sx, sy, w, h) {
  const anchors = []
  for (let shift = 0; shift < w; shift++) {
    anchors.push({ x: sx - shift, y: sy - h, facing: [...Array(w)].map((_, i) => [sx - shift + i, sy]) })
    anchors.push({ x: sx - shift, y: sy + 1, facing: [...Array(w)].map((_, i) => [sx - shift + i, sy]) })
  }
  for (let shift = 0; shift < h; shift++) {
    anchors.push({ x: sx - w, y: sy - shift, facing: [...Array(h)].map((_, i) => [sx, sy - shift + i]) })
    anchors.push({ x: sx + 1, y: sy - shift, facing: [...Array(h)].map((_, i) => [sx, sy - shift + i]) })
  }
  return anchors
}

/**
 * Join each city's main street to the map's road network at both ends where
 * possible (cheapest path that never crosses a city building, water, rock or
 * structure, and avoids hugging its own streets). Falls back to a single
 * connection from any street tile. Returns the final city street offsets.
 */
export function connectCityStreets(mapGrid, { cells, groundDetails, plan }) {
  const height = mapGrid.length
  const width = mapGrid[0]?.length || 0
  const { mask } = plan
  const streets = new Uint8Array(mask)
  const isCityCell = offset => Boolean(cells[offset]?.group?.tagSet?.has('city'))
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
  const neighbours = offset => {
    const x = offset % width
    const list = []
    if (x > 0) list.push(offset - 1)
    if (x < width - 1) list.push(offset + 1)
    if (offset >= width) list.push(offset - width)
    if (offset + width < width * height) list.push(offset + width)
    return list
  }
  const removed = new Set()
  const route = (sources, cap) => {
    const cost = new Float64Array(width * height).fill(Infinity)
    const previous = new Int32Array(width * height).fill(-1)
    const heap = createMinHeap()
    const sourceSet = new Set(sources)
    sources.forEach(offset => { cost[offset] = 0; heap.push(0, offset) })
    let reached = -1
    while (heap.size) {
      const [current, offset] = heap.pop()
      if (current > cost[offset]) continue
      if (current > cap) break
      if (isNetworkRoad(offset)) { reached = offset; break }
      for (const next of neighbours(offset)) {
        if (sourceSet.has(next) || (streets[next] && !isNetworkRoad(next))) continue
        if (!passable(next) && !isNetworkRoad(next)) continue
        const hugging = neighbours(next).some(n => streets[n] && !sourceSet.has(n) && !isNetworkRoad(n))
        const step = (cells[next] ? 4 : 1) + (hugging ? 3 : 0)
        if (current + step < cost[next]) {
          cost[next] = current + step
          previous[next] = offset
          heap.push(current + step, next)
        }
      }
    }
    if (reached < 0) return null
    const path = []
    for (let offset = previous[reached]; offset >= 0 && !sourceSet.has(offset); offset = previous[offset]) path.push(offset)
    return { cost: cost[reached], path }
  }
  const commit = found => {
    for (const offset of found.path) {
      streets[offset] = 1
      if (cells[offset]) removed.add(cells[offset])
    }
  }
  for (const city of plan.cities) {
    const all = city.streets.flatMap(street => street.tiles)
    if (!all.length) continue
    const radius = Math.max(4, ...all.map(offset => Math.hypot(offset % width - city.center.x, Math.floor(offset / width) - city.center.y)))
    // Join both main-street ends: the cheaper link always (within reach),
    // the other only when it stays short, so cities do not sprout long
    // parallel feeder roads.
    // (A street that merely touched another city street is not connected.)
    const atRoad = offset => neighbours(offset).some(isNetworkRoad)
    const links = city.ends.filter(end => !atRoad(end.offset)).map(end => route([end.offset], radius * 3 + 30)).filter(Boolean).sort((a, b) => a.cost - b.cost)
    let connected = all.some(atRoad)
    links.forEach((link, order) => {
      if (order === 0 && !connected) { commit(link); connected = true } else if (link.path.length <= Math.max(8, radius * 1.5)) commit(link)
    })
    if (!connected) {
      const fallback = route(all, Infinity)
      if (fallback) commit(fallback)
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
    if (!streets[offset] || isNetworkRoad(offset)) continue
    groundDetails[offset] = null
    if (cells[offset] && !cells[offset].group.tagSet.has('city')) cells[offset] = null
    result.push(offset)
  }
  return result
}

/** Natural placement is used only with opted-in category/detail catalogs. */
// Stones: a seeded, loosely clustered scatter of 'stones' props. Cluster
// centres prefer coasts and the surroundings of rock terrain; each stone lands
// a few tiles from a centre (or, sometimes, anywhere weighted), mixing small
// 1x1 stones with larger multi-tile ones.
export function stoneSiteWeight(mapGrid, x, y) {
  // Nearest water / rock within three tiles (Chebyshev distance).
  let water = 4
  let rock = 4
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const type = mapGrid[y + dy]?.[x + dx]?.type
      const distance = Math.max(Math.abs(dx), Math.abs(dy))
      if (type === 'water' && distance < water) water = distance
      else if (type === 'rock' && distance < rock) rock = distance
    }
  }
  return 1 + (water <= 3 ? 20 - water * 5 : 0) + (rock <= 3 ? 20 - rock * 5 : 0)
}

function createSeededRandom(seed) {
  let state = (seed >>> 0) || 0x9e3779b9
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}

/** Chebyshev distance to terrain water and already placed lake sprites. Preparation only. */
function buildDecorationWaterDistance(mapGrid, cells) {
  const height = mapGrid.length
  const width = mapGrid[0]?.length || 0
  const distance = new Uint16Array(width * height)
  distance.fill(65535)
  const queue = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * width + x
      if (mapGrid[y][x]?.type !== 'water' && !cells?.[offset]?.group?.tagSet?.has('lake')) continue
      distance[offset] = 0
      queue.push(offset)
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    const x = index % width
    const y = (index - x) / width
    const next = distance[index] + 1
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy
      if (ny < 0 || ny >= height) continue
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx
        if (nx < 0 || nx >= width) continue
        const neighbor = ny * width + nx
        if (distance[neighbor] <= next) continue
        distance[neighbor] = next
        queue.push(neighbor)
      }
    }
  }
  return distance
}

/** Place up to `target` sprites, highest weight first. Preparation only.
 * Each catalog variant is offered once, smallest first, before any variant
 * repeats. A pure first-fit walk spends the whole budget on the small sprites
 * that fit on the best shore cells and never reaches a large lake or wood. */
function placeBudgetedDecorations({
  mapGrid, pools, predicate, kinds = ['multi', 'single'], target, salt, defaultBiome, fits, cells, occupied, placements,
  groundDetails, landmarks, rarePlaced, width, height, weightAt, detail = false, onceEach = false, largestFirst = false
}) {
  const count = Math.max(0, target | 0)
  if (!count || !pools) return 0
  const groupsByBiome = {}
  let any = false
  for (const biome of DECORATION_BIOMES) {
    const groups = kinds.flatMap(kind => pools[biome]?.[kind] || []).filter(predicate)
    groupsByBiome[biome] = groups
      .map((group, index) => ({ group, hash: decorationHash(index, groups.length, salt) }))
      .sort((a, b) => {
        const area = (a.group.width * a.group.height) - (b.group.width * b.group.height)
        return (largestFirst ? -area : area) || a.hash - b.hash
      })
      .map(entry => entry.group)
    if (groups.length) any = true
  }
  if (!any) return 0
  const ranked = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isLayoutLand(mapGrid[y][x])) continue
      const weight = weightAt(x, y)
      if (!(weight > 0)) continue
      ranked.push({ x, y, weight, hash: decorationHash(x, y, salt) })
    }
  }
  if (!ranked.length) return 0
  ranked.sort((a, b) => b.weight - a.weight || a.hash - b.hash || a.y - b.y || a.x - b.x)
  const sitesByBiome = Object.fromEntries(DECORATION_BIOMES.map(biome => [biome, []]))
  for (const site of ranked) sitesByBiome[resolveBiome(mapGrid[site.y][site.x], defaultBiome)].push(site)
  const stamp = (group, site, biome) => {
    const placement = { group, anchorX: site.x, anchorY: site.y, biome }
    if (!detail) {
      if (group.width * group.height > 1) placements.push(placement)
      if (group.tagSet.has('landmark')) landmarks.push(placement)
      if (group.tagSet.has('rare')) rarePlaced.add(decorationIdentity(group))
    }
    for (let dy = 0; dy < group.height; dy++) {
      for (let dx = 0; dx < group.width; dx++) {
        const offset = (site.y + dy) * width + site.x + dx
        const cell = { ...placement, offsetX: dx, offsetY: dy }
        if (detail) groundDetails[offset] = cell
        else {
          cells[offset] = cell
          occupied[offset] = placement
        }
      }
    }
  }
  const entries = []
  for (const biome of DECORATION_BIOMES) {
    for (const group of groupsByBiome[biome]) entries.push({ biome, group, cursor: 0, alive: true })
  }
  const take = entry => {
    const sites = sitesByBiome[entry.biome]
    while (entry.cursor < sites.length) {
      const site = sites[entry.cursor++]
      if (!detail && occupied[site.y * width + site.x]) continue
      if (!fits({ group: entry.group, anchorX: site.x, anchorY: site.y, biome: entry.biome }, detail)) continue
      stamp(entry.group, site, entry.biome)
      return true
    }
    entry.alive = false
    return false
  }
  let placed = 0
  for (const entry of entries) {
    if (placed >= count) return placed
    if (take(entry)) placed++
  }
  if (onceEach) return placed
  let cursor = 0
  let spins = 0
  while (placed < count && spins < entries.length) {
    const entry = entries[cursor++ % entries.length]
    if (!entry.alive || !take(entry)) spins++
    else { placed++; spins = 0 }
  }
  return placed
}

function placeStones({ mapGrid, pools, options, salt, defaultBiome, fits, cells, occupied, placements, width, height }) {
  const target = options.stoneCount
  if (!target) return 0
  const small = {}
  const large = {}
  let any = false
  for (const biome of DECORATION_BIOMES) {
    const groups = [...(pools[biome]?.multi || []), ...(pools[biome]?.single || [])].filter(group => group.tagSet.has('stones'))
    small[biome] = createDecorationBag(groups.filter(group => group.width * group.height === 1), salt + 2)
    large[biome] = createDecorationBag(groups.filter(group => group.width * group.height > 1), salt + 3)
    if (groups.length) any = true
  }
  if (!any) return 0
  const sites = []
  let total = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!isLayoutLand(mapGrid[y][x]) || isRoad(mapGrid[y][x])) continue
    total += stoneSiteWeight(mapGrid, x, y)
    sites.push({ x, y, cumulative: total })
  }
  if (!sites.length) return 0
  const random = createSeededRandom(decorationHash(width, height, salt + 1543))
  const pickSite = () => {
    const value = random() * total
    let low = 0
    let high = sites.length - 1
    while (low < high) {
      const mid = (low + high) >> 1
      if (sites[mid].cumulative <= value) low = mid + 1
      else high = mid
    }
    return sites[low]
  }
  const centers = Array.from({ length: Math.max(1, Math.ceil(target / 5)) }, pickSite)
  let placed = 0
  // One of each stone, largest first, before the clustered fill. A wide
  // boulder never wins the random bag once pebbles occupy its only sites.
  const catalog = []
  for (const biome of DECORATION_BIOMES) {
    for (const group of [...(pools[biome]?.multi || []), ...(pools[biome]?.single || [])].filter(group => group.tagSet.has('stones'))) {
      catalog.push({ biome, group, hash: decorationHash(catalog.length + 1, group.width * group.height, salt) })
    }
  }
  catalog.sort((a, b) => (b.group.width * b.group.height) - (a.group.width * a.group.height) || a.hash - b.hash)
  const orderedSites = sites.slice().sort((a, b) => stoneSiteWeight(mapGrid, b.x, b.y) - stoneSiteWeight(mapGrid, a.x, a.y) || decorationHash(a.x, a.y, salt + 17) - decorationHash(b.x, b.y, salt + 17) || a.y - b.y || a.x - b.x)
  for (const entry of catalog) {
    if (placed >= target) break
    for (const site of orderedSites) {
      if (resolveBiome(mapGrid[site.y][site.x], defaultBiome) !== entry.biome) continue
      if (!fits({ group: entry.group, anchorX: site.x, anchorY: site.y, biome: entry.biome })) continue
      if (entry.group.width * entry.group.height > 1) placements.push({ group: entry.group, anchorX: site.x, anchorY: site.y, biome: entry.biome })
      for (let dy = 0; dy < entry.group.height; dy++) for (let dx = 0; dx < entry.group.width; dx++) {
        const offset = (site.y + dy) * width + site.x + dx
        const placement = { group: entry.group, anchorX: site.x, anchorY: site.y, biome: entry.biome, offsetX: dx, offsetY: dy }
        cells[offset] = placement
        occupied[offset] = placement
      }
      placed++
      break
    }
  }
  for (let attempt = 0; attempt < target * 25 && placed < target; attempt++) {
    let x
    let y
    if (random() < 0.2) ({ x, y } = pickSite())
    else {
      const center = centers[Math.floor(random() * centers.length)]
      const angle = random() * Math.PI * 2
      const distance = 1 + random() * 4.5
      x = Math.round(center.x + Math.cos(angle) * distance)
      y = Math.round(center.y + Math.sin(angle) * distance)
    }
    const tile = mapGrid[y]?.[x]
    if (!tile || !isLayoutLand(tile)) continue
    const biome = resolveBiome(tile, defaultBiome)
    const preferLarge = random() < 0.3
    const bags = preferLarge ? [large[biome], small[biome]] : [small[biome], large[biome]]
    let done = false
    for (const bag of bags) {
      for (let pick = 0; pick < Math.min(bag.size, 4) && !done; pick++) {
        const group = bag.next()
        const placement = { group, anchorX: x, anchorY: y, biome }
        if (!fits(placement)) continue
        if (group.width * group.height > 1) placements.push(placement)
        for (let dy = 0; dy < group.height; dy++) for (let dx = 0; dx < group.width; dx++) {
          const offset = (y + dy) * width + x + dx
          cells[offset] = { ...placement, offsetX: dx, offsetY: dy }
          occupied[offset] = placement
        }
        done = true
      }
      if (done) break
    }
    if (done) placed++
  }
  return placed
}

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
  // City streets are planned before any decoration so houses can line them.
  const cityPlan = hasCityGroups ? planOrganicCityStreets(mapGrid, cities, { salt, constraints }) : null
  const cityLattice = cityPlan?.mask || null
  const landmarks = []
  const rarePlaced = new Set()
  // Index covered tiles once. Spacing probes visit at most a six-tile halo,
  // rather than scanning all earlier placements per candidate.
  const occupied = new Array(width * height).fill(null)
  // Vary priority by map seed: reserving every large footprint first on every
  // map would starve the smaller farm/rock catalog in those same clusters.
  const largeFirst = decorationHash(width, height, salt + 9389) % 4 === 0
  const bags = {}
  for (const biome of DECORATION_BIOMES) {
    bags[biome] = {}
    for (const kind of ['large', 'multi', 'single', 'groundDetail']) {
      const categories = new Map()
      for (const group of pools[biome]?.[kind === 'large' ? 'multi' : kind] || []) {
        if (kind === 'large' || kind === 'multi') {
          const span = Math.max(group.width, group.height)
          const large = span >= 5 || (group.tagSet.has('rocks') && span >= 3)
          if (kind === 'large' ? !largeFirst || !large : largeFirst && large) continue
        }
        // Shore, roadside, stones and city props have their own passes.
        if (isForestTree(group) || isLakeSprite(group) || isOtherVegetationSprite(group) || group.tagSet.has('shore') || group.tagSet.has('roadside') || group.tagSet.has('stones') || group.tagSet.has('city') || group.tagSet.has('ruins')) continue
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
    const visual = group.cityVisual
    if (visual && (x + visual.tileOffsetX < 0 || y + visual.tileOffsetY < 0 ||
      x + visual.tileOffsetX + visual.columns > width || y + visual.tileOffsetY + visual.rows > height)) return false
    let touchesWater = false
    for (let dy = 0; dy < fh; dy++) {
      for (let dx = 0; dx < fw; dx++) {
        const cx = x + dx
        const cy = y + dy
        const tile = mapGrid[cy][cx]
        const water = shoreWaterAt(placement, cx, cy)
        if (cityLattice?.[cy * width + cx]) return false
        if ((water ? tile?.type !== 'water' || tile.building || tile.ore || tile.seedCrystal || constraints.landDistance[cy * width + cx] > Math.max(group.width, group.height) : !isLayoutLand(tile) || resolveBiome(tile, defaultBiome) !== biome) || isRoad(tile) ||
          !decorationEnvironmentAllows(group, cx, cy, constraints, true) || (detail ? groundDetails[cy * width + cx] : occupied[cy * width + cx])) return false
        if (constraints.shoreDistance[cy * width + cx] === 1) touchesWater = true
      }
    }
    if (group.tagSet.has('shore') && !group.tagSet.has('offshore') && !group.tagSet.has('shore_trans') && !touchesWater) return false
    if (detail) return true
    if (!group.tagSet.has('shore') && !categoryClusterAllows(group, x, y, biome, clusters)) return false
    // City houses are placed only by the street-facing city pass.
    if (group.tagSet.has('city') && !placement.cityHouse) return false
    if (group.tagSet.has('ruins') && !ruins.anchorKeys.has(`${x},${y}`)) return false
    if (group.tagSet.has('landmark') && !landmarkAllows(x, y, landmarks)) return false
    // 'rare' props appear at most once per map.
    if (group.tagSet.has('rare') && rarePlaced.has(decorationIdentity(group))) return false
    const nearby = new Set()
    for (let cy = Math.max(0, y - 6); cy < Math.min(height, y + group.height + 6); cy++) {
      for (let cx = Math.max(0, x - 6); cx < Math.min(width, x + group.width + 6); cx++) {
        const other = occupied[cy * width + cx]
        if (other) nearby.add(other)
      }
    }
    return decorationSpacingAllows(placement, [...nearby])
  }
  // City pass: houses only directly beside a planned street, with one full
  // side facing it (rows without gaps are fine; no interior blocks).
  if (cityPlan) {
    // Preparation only: keep varied bags per architectural density. The
    // fourth settlement may grow a skyline; every settlement tapers outward.
    const cityBags = Object.fromEntries(DECORATION_BIOMES.map(biome => {
      const groups = [...(pools[biome]?.multi || []), ...(pools[biome]?.single || [])].filter(group => group.tagSet.has('city'))
      return [biome, Array.from({ length: 10 }, (_, index) => createDecorationBag(
        groups.filter(group => getCityBuildingDensity(group) === index + 1), salt + 5))]
    }))
    function* cityCandidates(bags, preferredDensity, variation) {
      // Share central lots between architectural variants within the same
      // tier; always taking score 10 first can starve every score-8/9 tower.
      const minimum = preferredDensity >= 8 ? 8 : preferredDensity >= 4 ? Math.max(4, preferredDensity - 1) : preferredDensity
      const band = bags.slice(minimum - 1, preferredDensity).filter(bag => bag.size)
      const start = band.length ? variation % band.length : 0
      for (let index = 0; index < band.length; index++) {
        const bag = band[(start + index) % band.length]
        for (let attempt = 0; attempt < bag.size; attempt++) yield bag.next()
      }
      for (let index = minimum - 2; index >= 0; index--) {
        const bag = bags[index]
        for (let attempt = 0; attempt < bag.size; attempt++) yield bag.next()
      }
    }
    const coversReserved = (x, y, group) => {
      for (let dy = 0; dy < group.height; dy++) for (let dx = 0; dx < group.width; dx++) if (cityPlan.reserved.has((y + dy) * width + x + dx)) return true
      return false
    }
    for (const [cityIndex, city] of cityPlan.cities.entries()) {
      const cityMaxDensity = getCityMaximumDensity(cityIndex)
      const distance = offset => Math.hypot(offset % width - city.center.x, Math.floor(offset / width) - city.center.y)
      const lots = [...new Set(city.streets.flatMap(street => street.tiles))].sort((a, b) => distance(a) - distance(b) || a - b)
      for (const offset of lots) {
        const sx = offset % width
        const sy = (offset - sx) / width
        const biome = resolveBiome(mapGrid[sy][sx], defaultBiome)
        const radius = distance(offset) / cities.radius
        const catalogMaximum = cityBags[biome].findLastIndex(bag => bag.size) + 1
        const unscaledDensity = getCityDensityLimit(Math.min(cityMaxDensity, catalogMaximum), radius)
        const preferredDensity = Math.max(1, Math.min(10, Math.round(unscaledDensity * options.cityDensityFactor / 100)))
        for (let side = 0; side < 4; side++) {
          for (const group of cityCandidates(cityBags[biome], preferredDensity, decorationHash(sx, sy, salt + side + cityIndex))) {
            const anchors = cityHouseAnchors(sx, sy, group.width, group.height)
              .filter((_, index) => index % 2 === side % 2 && (side < 2 ? index < group.width * 2 : index >= group.width * 2))
            const hit = anchors.find(({ x, y, facing }) => !coversReserved(x, y, group) && facing.every(([fx, fy]) => fx >= 0 && fy >= 0 && fx < width && fy < height && cityLattice[fy * width + fx]) &&
                fits({ group, anchorX: x, anchorY: y, biome: resolveBiome(mapGrid[y]?.[x], defaultBiome), cityHouse: true }))
            if (!hit) continue
            const placement = { group, anchorX: hit.x, anchorY: hit.y, biome: resolveBiome(mapGrid[hit.y][hit.x], defaultBiome),
              cityIndex, cityMaxDensity, cityDensity: getCityBuildingDensity(group), cityRadius: radius }
            if (group.width * group.height > 1) placements.push(placement)
            for (let dy = 0; dy < group.height; dy++) for (let dx = 0; dx < group.width; dx++) {
              const cell = (hit.y + dy) * width + hit.x + dx
              cells[cell] = { ...placement, offsetX: dx, offsetY: dy }
              occupied[cell] = placement
            }
            break
          }
        }
      }
    }
  }
  // Ruin anchors are scarce. Give their catalog a dedicated pass so adding
  // ordinary vegetation cannot crowd a ruin out of every valid site.
  const ruinBags = Object.fromEntries(DECORATION_BIOMES.map(biome => [biome,
    createDecorationBag([...(pools[biome]?.multi || []), ...(pools[biome]?.single || [])]
      .filter(group => group.tagSet.has('ruins') && !group.tagSet.has('city') && !group.tagSet.has('roadside') && !group.tagSet.has('shore') && !group.tagSet.has('stones')), salt + 8)
  ]))
  for (const { x, y, biome } of ruins.anchors) {
    const bag = ruinBags[biome]
    for (let attempt = 0; attempt < bag.size; attempt++) {
      const group = bag.next()
      const placement = { group, anchorX: x, anchorY: y, biome }
      if (!fits(placement)) continue
      if (group.width * group.height > 1) placements.push(placement)
      if (group.tagSet.has('landmark')) landmarks.push(placement)
      if (group.tagSet.has('rare')) rarePlaced.add(decorationIdentity(group))
      for (let dy = 0; dy < group.height; dy++) for (let dx = 0; dx < group.width; dx++) {
        const offset = (y + dy) * width + x + dx
        cells[offset] = { ...placement, offsetX: dx, offsetY: dy }
        occupied[offset] = placement
      }
      break
    }
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
        : [[1, 0, 0], [0, 1, 90], [-1, 0, 180], [0, -1, 270]]
      for (const [nx, ny, angle] of directions) {
        const offshore = group.tagSet.has('offshore')
        const crossing = group.tagSet.has('shore_trans')
        if (mapGrid[y + ny]?.[x + nx]?.type !== 'water') continue
        if (crossing && group.width < 2) continue
        const rotation = crossing ? angle : 0
        const fw = rotation % 180 ? group.height : group.width
        const fh = rotation % 180 ? group.width : group.height
        const ax = coastAnchorCoordinate(x, nx, fw, crossing, offshore)
        const ay = coastAnchorCoordinate(y, ny, fh, crossing, offshore)
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
  // Preparation-only roadside pass: sparse, seeded attempts on land tiles
  // directly next to a road (one per ROADSIDE_INTERVAL road-adjacent tiles).
  const roadsideBags = Object.fromEntries(DECORATION_BIOMES.map(biome => [biome,
    createDecorationBag([...(pools[biome]?.multi || []), ...(pools[biome]?.single || [])]
      .filter(group => group.tagSet.has('roadside') && !group.tagSet.has('shore')), salt + 1)
  ]))
  const roadAnchors = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (constraints.roadDistance[y * width + x] === 1 && isLayoutLand(mapGrid[y][x]) && !isRoad(mapGrid[y][x])) roadAnchors.push({ x, y })
  }
  for (const { x, y } of roadAnchors) {
    if (decorationHash(x, y, salt + 6151) % ROADSIDE_INTERVAL !== 0) continue
    const biome = resolveBiome(mapGrid[y][x], defaultBiome)
    const bag = roadsideBags[biome]
    for (let attempt = 0; attempt < bag.size; attempt++) {
      const group = bag.next()
      const placement = { group, anchorX: x, anchorY: y, biome }
      if (!fits(placement)) continue
      if (group.width * group.height > 1) placements.push(placement)
      for (let dy = 0; dy < group.height; dy++) for (let dx = 0; dx < group.width; dx++) {
        const offset = (y + dy) * width + x + dx
        cells[offset] = { ...placement, offsetX: dx, offsetY: dy }
        occupied[offset] = placement
      }
      break
    }
  }
  // One of each rock and farm variant, largest first, while the cluster disks
  // are still empty. The later interval pass only repeats whichever sprite
  // fits the current cell, so a 2×2 boulder can miss every seed.
  const budgetBase = { mapGrid, pools, salt, defaultBiome, fits, cells, occupied, placements, groundDetails, landmarks, rarePlaced, width, height }
  placeStones({ mapGrid, pools, options, salt, defaultBiome, fits, cells, occupied, placements, width, height })
  const clusterWeight = probe => (x, y) => categoryClusterAllows(probe, x, y, resolveBiome(mapGrid[y][x], defaultBiome), clusters) ? 1 : 0
  placeBudgetedDecorations({
    ...budgetBase, predicate: group => group.tagSet.has('rocks') && !group.tagSet.has('stones') && !group.tagSet.has('shore'),
    target: 100000, salt: salt + 53, onceEach: true, largestFirst: true, weightAt: clusterWeight({ tagSet: new Set(['rocks']) })
  })
  placeBudgetedDecorations({
    ...budgetBase, predicate: group => group.tagSet.has('farm'),
    target: 100000, salt: salt + 59, onceEach: true, largestFirst: true, weightAt: clusterWeight({ tagSet: new Set(['farm']) })
  })
  // Lakes take their own budget before other land props, so the count is not
  // whatever fraction of the multi-tile pass happens to pick a lake.
  placeBudgetedDecorations({
    ...budgetBase, predicate: isLakeSprite, target: options.lakeCount, salt: salt + 41,
    weightAt: () => 1
  })
  // Ground detail has its own cells, no impassability and no spacing ownership.
  placeBudgetedDecorations({
    ...budgetBase, predicate: () => true, kinds: ['groundDetail'], target: options.groundDetailCount,
    salt: salt + 3209, detail: true, weightAt: () => 1
  })
  for (const kind of ['large', 'multi', 'single']) {
    // Large native props reserve their room before smaller ordinary props;
    // boulders precede small stones in those same clusters.
    const detail = false
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const biome = resolveBiome(mapGrid[y][x], defaultBiome)
        const categoryBags = bags[biome]?.[kind]
        if (!categoryBags?.length || !isLayoutLand(mapGrid[y][x])) continue
        const hash = decorationHash(x, y, salt + (detail ? 3209 : kind === 'single' ? 7919 : 0))
        const interval = detail ? 40 : kind === 'single' ? SINGLE_DECORATION_INTERVAL : MULTI_TILE_ANCHOR_INTERVAL
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
              if (kind !== 'single') placements.push(placement)
              if (group.tagSet.has('landmark')) landmarks.push(placement)
              if (group.tagSet.has('rare')) rarePlaced.add(decorationIdentity(group))
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
  // Rebuild the forest after lakes exist so woods and single trees prefer
  // terrain water and decorative lakes. The legacy density gate still decides
  // which cells are eligible; the budget keeps the strongest water-side sites.
  const waterDistance = buildDecorationWaterDistance(mapGrid, cells)
  const forest = buildForestClusters(mapGrid, {
    salt, defaultBiome, count: options.woodClusterCount, radius: options.woodClusterRadius, waterDistance
  })
  clusters.trees = forest
  const treeWeight = (x, y) => {
    const biome = resolveBiome(mapGrid[y][x], defaultBiome)
    if (!forestAllows(forest, x, y, biome)) return 0
    const density = forest.density[y * width + x]
    return shoreProximityWeight(waterDistance[y * width + x]) * (density > 0 ? 2 + density * 4 : 0.2)
  }
  placeBudgetedDecorations({
    ...budgetBase, predicate: isWoodSprite, target: options.woodsCount, salt: salt + 29, weightAt: treeWeight
  })
  // A few single trees stay outside the density field. They are placed before
  // the woods fill in, otherwise the dense pass crowds every isolated site.
  const outsideWeight = (x, y) => {
    if (forest.density[y * width + x] > 0) return 0
    return treeWeight(x, y)
  }
  const outsideBudget = Math.min(options.singleTreeCount, Math.floor(options.singleTreeCount * 0.08))
  const outsideTrees = outsideBudget
    ? placeBudgetedDecorations({
      ...budgetBase, predicate: isSingleTreeSprite, target: outsideBudget, salt: salt + 33, weightAt: outsideWeight
    })
    : 0
  placeBudgetedDecorations({
    ...budgetBase, predicate: isSingleTreeSprite, target: options.singleTreeCount - outsideTrees, salt: salt + 31, weightAt: treeWeight
  })
  placeBudgetedDecorations({
    ...budgetBase, predicate: isOtherVegetationSprite, target: options.otherVegetationCount, salt: salt + 37,
    weightAt: (x, y) => shoreProximityWeight(waterDistance[y * width + x]) * (0.35 + decorationDensity(x, y, salt + 17))
  })
  const cityStreets = cityPlan ? connectCityStreets(mapGrid, { cells, groundDetails, plan: cityPlan }) : []
  return { width, height, cells, placements, groundDetails, cityStreets }
}
