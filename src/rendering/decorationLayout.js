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
  DECORATION_BIOMES.forEach((biome) => { pools[biome] = { multi: [], single: [] } })
  if (!Array.isArray(groups)) return pools
  groups.forEach((group) => {
    if (!group?.tilesByOffset || !(group.tagSet instanceof Set)) return
    if (!group.tagSet.has('decorative')) return
    const isUniversal = group.tagSet.has('universal')
    if (isUniversal && Number.isFinite(group.coverage) && group.coverage > UNIVERSAL_MAX_COVERAGE) return
    DECORATION_BIOMES.forEach((biome) => {
      if (!group.tagSet.has(biome) && !group.tagSet.has('universal')) return
      if (!groupSeasonAllowed(group.tagSet, biome)) return
      const target = (group.width * group.height) > 1 ? pools[biome].multi : pools[biome].single
      target.push(group)
    })
  })
  DECORATION_BIOMES.forEach((biome) => {
    // Larger sprites first so big lakes/forests get a chance before small ones.
    pools[biome].multi.sort((a, b) => (b.width * b.height) - (a.width * a.height))
  })
  return pools
}

/**
 * @returns {{ width:number, height:number, cells:Array<null|{group:Object,offsetX:number,offsetY:number,anchorX:number,anchorY:number,biome:string}>, placements:Array }}
 */
export function buildDecorationLayout(mapGrid, pools, { defaultBiome = 'grass', salt = 0 } = {}) {
  const height = Array.isArray(mapGrid) ? mapGrid.length : 0
  const width = height ? (mapGrid[0]?.length || 0) : 0
  const cells = new Array(width * height).fill(null)
  const placements = []
  if (!width || !height || !pools) return { width, height, cells, placements }
  const fallbackBiome = DECORATION_BIOMES.includes(defaultBiome) ? defaultBiome : 'grass'

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
      if (hash % MULTI_TILE_ANCHOR_INTERVAL !== 0) continue
      const biome = resolveBiome(tile, fallbackBiome)
      const candidates = pools[biome]?.multi
      if (!candidates?.length) continue
      const start = (hash >>> 8) % candidates.length
      for (let i = 0; i < candidates.length; i++) {
        const group = candidates[(start + i) % candidates.length]
        if (!fits(group, x, y, biome)) continue
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
      if (hash % SINGLE_DECORATION_INTERVAL !== 0) continue
      const biome = resolveBiome(tile, fallbackBiome)
      const candidates = pools[biome]?.single
      if (!candidates?.length) continue
      const group = candidates[(hash >>> 8) % candidates.length]
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
export function getValidDecorationCell(layout, mapGrid, x, y, defaultBiome = 'grass') {
  if (!layout || x < 0 || y < 0 || x >= layout.width || y >= layout.height) return null
  const cell = layout.cells[(y * layout.width) + x]
  if (!cell) return null
  const { group, anchorX, anchorY, biome } = cell
  for (let gy = 0; gy < group.height; gy++) {
    for (let gx = 0; gx < group.width; gx++) {
      const tile = mapGrid?.[anchorY + gy]?.[anchorX + gx]
      if (!isDecoratableLand(tile) || resolveBiome(tile, defaultBiome) !== biome) return null
    }
  }
  return cell
}
