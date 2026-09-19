import { buildCliffDepth, cliffContourMask, cliffHeightClass, cliffMacroRect, cliffTallRect, isPlateauTile, CLIFF_LEVELS, CLIFF_CELL, CLIFF_PADDING, CLIFF_TILE, CLIFF_TALL_CELL, CLIFF_TALL_PADDING, CLIFF_VARIANTS } from './cliffTerrain.js'
import { loadPreparedImage } from './prepared/imagePreparation.js'
import { TERRAIN_ASSET_MANIFEST } from './prepared/terrainAssetManifest.js'

// These functions run during chunk baking, never per entity or simulation tick.
export function terrainHash(x, y, seed = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

export function normalizeBlobMask(mask) {
  return (mask & 15) |
    ((mask & 3) === 3 ? mask & 16 : 0) |
    ((mask & 6) === 6 ? mask & 32 : 0) |
    ((mask & 12) === 12 ? mask & 64 : 0) |
    ((mask & 9) === 9 ? mask & 128 : 0)
}

export const BLOB_MASKS = [...new Set(Array.from({ length: 256 }, (_, i) => normalizeBlobMask(i)))].sort((a, b) => a - b)
const BLOB_INDEX = new Map(BLOB_MASKS.map((mask, index) => [mask, index]))
export function terrainMask(grid, x, y, type) {
  const matches = (dx, dy) => grid[y + dy]?.[x + dx]?.type === type && !grid[y + dy]?.[x + dx]?.airstripStreet
  return normalizeBlobMask((matches(0, -1) ? 1 : 0) | (matches(1, 0) ? 2 : 0) |
    (matches(0, 1) ? 4 : 0) | (matches(-1, 0) ? 8 : 0) |
    (matches(1, -1) ? 16 : 0) | (matches(1, 1) ? 32 : 0) |
    (matches(-1, 1) ? 64 : 0) | (matches(-1, -1) ? 128 : 0))
}

const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]
const CORNERS = [137, 19, 38, 76]
const ORIENTATIONS = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
const MACRO_MASKS = new Set([3, 6, 9, 12])
const TERRAIN_TRANSITION_CACHE_LIMIT = 512
const SOT_EDGE_OVERLAP = 1
const SOT_DRAW_OFFSETS = Object.freeze({
  'top-left': Object.freeze({ x: 0, y: 0 }),
  'top-right': Object.freeze({ x: -SOT_EDGE_OVERLAP, y: 0 }),
  'bottom-right': Object.freeze({ x: -SOT_EDGE_OVERLAP, y: -SOT_EDGE_OVERLAP }),
  'bottom-left': Object.freeze({ x: 0, y: -SOT_EDGE_OVERLAP })
})
const ZERO_SOT_DRAW_OFFSET = Object.freeze({ x: 0, y: 0 })
const SHORE_CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]]
const SHORELINE_PATTERN_VARIATIONS = Object.freeze([
  Object.freeze({ primaryU: 2, secondaryU: 5, primaryV: 2, secondaryV: 5 }),
  Object.freeze({ primaryU: 3, secondaryU: 7, primaryV: 2, secondaryV: 5 }),
  Object.freeze({ primaryU: 2, secondaryU: 5, primaryV: 3, secondaryV: 7 }),
  Object.freeze({ primaryU: 3, secondaryU: 5, primaryV: 3, secondaryV: 5 }),
  Object.freeze({ primaryU: 4, secondaryU: 7, primaryV: 2, secondaryV: 7 }),
  Object.freeze({ primaryU: 2, secondaryU: 7, primaryV: 4, secondaryV: 5 })
])

// Each junction belongs to four cells. Both sides of a shared edge therefore
// interpolate exactly the same endpoints, including diagonal-only shoulders.
export function shorelineCornerMask(grid, x, y) {
  let mask = 0
  for (let corner = 0; corner < 4; corner++) {
    const [cx, cy] = SHORE_CORNERS[corner]
    for (let dy = cy - 1; dy <= cy; dy++) for (let dx = cx - 1; dx <= cx; dx++) {
      const tile = grid[y + dy]?.[x + dx]
      if (tile && !tile.airstripStreet && (tile.type === 'land' || tile.type === 'rock')) mask |= 1 << corner
    }
  }
  return mask
}

export function biomeTransitionCoverage(cornerWeights, u, v) {
  if (!Array.isArray(cornerWeights) || cornerWeights.length !== 4) return 0
  const top = cornerWeights[0] * (1 - u) + cornerWeights[1] * u
  const bottom = cornerWeights[3] * (1 - u) + cornerWeights[2] * u
  const field = top * (1 - v) + bottom * v
  // Transition tiles are based on the neighboring biome. Their shared region
  // boundary (field 0.5) must therefore remain fully base-colored, while the
  // source material ramps smoothly toward the transition tile's interior.
  const alpha = Math.max(0, Math.min(1, (field - 0.5) * 2))
  return alpha * alpha * (3 - 2 * alpha)
}

export function shorelineCoverage(mask, u, v, featherWidth = 0.2, beachPattern = false) {
  const top = (mask & 1 ? 1 - u : 0) + (mask & 2 ? u : 0)
  const bottom = (mask & 8 ? 1 - u : 0) + (mask & 4 ? u : 0)
  // Sand/water uses the former beach-like biome contour. Both periodic terms
  // are zero at tile endpoints, so neighboring masks still meet without an
  // alpha seam while straight shores gain a clearly irregular silhouette.
  const patternVariant = Number.isInteger(beachPattern) ? beachPattern : beachPattern ? 0 : -1
  const wave = patternVariant >= 0
    ? (() => {
      const variation = SHORELINE_PATTERN_VARIATIONS[patternVariant % SHORELINE_PATTERN_VARIATIONS.length]
      // The envelope makes every variant exactly zero on all four tile
      // edges, allowing neighboring tiles to choose different variants.
      const edgeEnvelope = u * (1 - u) * v * (1 - v)
      return edgeEnvelope * (
        Math.sin(u * Math.PI * variation.primaryU) * 0.52 +
          Math.sin(u * Math.PI * variation.secondaryU) * 0.18 +
          Math.sin(v * Math.PI * variation.primaryV) * 0.52 +
          Math.sin(v * Math.PI * variation.secondaryV) * 0.18
      )
    })()
    : Math.sin(u * Math.PI * 4) * Math.sin(v * Math.PI * 4) *
      u * (1 - u) * v * (1 - v) * 0.6
  const alpha = Math.max(0, Math.min(1, 0.5 + (top * (1 - v) + bottom * v - 0.5 + wave) / featherWidth))
  return alpha * alpha * (3 - 2 * alpha)
}
const PLATEAU_DETAIL_SCALE = 2
const PLATEAU_DETAIL_FREQUENCY = 10
const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor

// Expand only across the exposed side of the corner. The two solid SOT legs
// stay on their owning tile, while the hypotenuse gets one shared pixel of
// overlap with its neighboring transition tile.
export function getSotDrawBounds(sx, sy, size, orientation) {
  const offset = getSotDrawOffset(orientation)
  return { x: sx + offset.x, y: sy + offset.y, size: size + (SOT_DRAW_OFFSETS[orientation] ? SOT_EDGE_OVERLAP : 0) }
}

// Returns shared immutable offsets so visible-tile rendering does not allocate
// a bounds object for every SOT.
export function getSotDrawOffset(orientation) {
  return SOT_DRAW_OFFSETS[orientation] || ZERO_SOT_DRAW_OFFSET
}

export function cliffVariant(x, y, level = 1) {
  // Irregular 256-tile Voronoi regions keep complete cliff systems in one
  // geology far longer than the former square 16x16 palette blocks.
  const regionSize = 256
  const regionX = Math.floor(x / regionSize), regionY = Math.floor(y / regionSize)
  let nearestDistance = Infinity, nearestHash = 0
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const candidateX = regionX + ox, candidateY = regionY + oy
    const hash = terrainHash(candidateX, candidateY, 211)
    const seedX = (candidateX + ((hash & 0xffff) / 0x10000)) * regionSize
    const seedY = (candidateY + (((hash >>> 16) & 0xffff) / 0x10000)) * regionSize
    const distance = (x - seedX) ** 2 + (y - seedY) ** 2
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestHash = hash
    }
  }
  // A complete geological region uses one exact palette. Terrace levels alter
  // fracture layout through their geometry, not their rock color family.
  return terrainHash(nearestHash, nearestHash >>> 16, level > 0 ? 223 : 227) % CLIFF_VARIANTS
}

function macroRunLength(depth, x, y, level, mask, heightClass) {
  const horizontal = mask === 3 || mask === 12
  if (!MACRO_MASKS.has(mask)) return 0
  // Partition every global contour into deterministic 4-cell slots. A run can
  // begin anywhere, but never crosses a slot boundary; this keeps direct and
  // neighboring chunk bakes byte-identical while avoiding one-cell fallback art.
  const maxLength = 4 - positiveModulo(horizontal ? x : y, 4)
  for (let length = maxLength; length >= 1; length--) {
    let matches = true
    for (let offset = 0; offset < length; offset++) {
      const sampleX = x + (horizontal ? offset : 0)
      const sampleY = y + (horizontal ? 0 : offset)
      const sampleMask = cliffContourMask(depth, sampleX, sampleY, level)
      if (sampleMask !== mask || cliffHeightClass(depth, sampleX, sampleY, level) !== heightClass) {
        matches = false
        break
      }
    }
    if (matches) {
      const rockAt = (sampleX, sampleY) => {
        const localX = sampleX - depth.left, localY = sampleY - depth.top
        return localX >= 0 && localY >= 0 && localX < depth.width && localY < depth.rockDepth.length / depth.width && depth.rockDepth[localY * depth.width + localX] > 0
      }
      for (let offset = 0; offset < length && matches; offset++) {
        const sampleX = x + (horizontal ? offset : 0)
        const sampleY = y + (horizontal ? 0 : offset)
        if (mask === 3) matches = rockAt(sampleX, sampleY) && rockAt(sampleX, sampleY - 1)
        else if (mask === 12) matches = rockAt(sampleX, sampleY + 1) && rockAt(sampleX, sampleY + 2)
        else if (mask === 6) matches = rockAt(sampleX + 1, sampleY) && rockAt(sampleX + 2, sampleY)
        else matches = rockAt(sampleX, sampleY) && rockAt(sampleX - 1, sampleY)
      }
    }
    if (matches) return length
  }
  return 0
}
export function roadFringeMask(grid, x, y) {
  const tile = grid[y]?.[x]
  if (!tile || tile.airstripStreet || !['land', 'water'].includes(tile.type)) return 0
  const mask = terrainMask(grid, x, y, 'street')
  let corners = 0
  for (let i = 0; i < 4; i++) if ((mask & CORNERS[i]) === CORNERS[i]) corners |= 1 << i
  return corners
}
export function roadVisualMask(grid, x, y) {
  let mask = terrainMask(grid, x, y, 'street')
  // An SOT's legs participate in connectivity just like full tile edges.
  const oppositeLegs = [12, 9, 3, 6]
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = DIRECTIONS[i]
    if (roadFringeMask(grid, x + dx, y + dy) & oppositeLegs[i]) mask |= 1 << i
  }
  const added = (mask & 15) & ~terrainMask(grid, x, y, 'street')
  for (const [diagonal, sides] of [[16, 3], [32, 6], [64, 12], [128, 9]]) {
    if ((mask & sides) === sides && (added & sides)) mask |= diagonal
  }
  // A fringe diagonal also supplies solid material at the shared corner.
  const diagonalCorners = [8, 1, 2, 4]
  for (let i = 4; i < 8; i++) {
    const [dx, dy] = DIRECTIONS[i]
    if (roadFringeMask(grid, x + dx, y + dy) & diagonalCorners[i - 4]) mask |= 1 << i
  }
  return normalizeBlobMask(mask)
}
export function cliffConnections(grid, x, y) {
  let mask = 0
  for (let i = 0; i < 8; i++) {
    const [dx, dy] = DIRECTIONS[i]
    if (grid[y + dy]?.[x + dx]?.type === 'rock') mask |= 1 << i
  }
  // Cardinal paths already cover these diagonal joins; avoid crossing ridges.
  for (const [diagonal, sides] of [[16, 3], [32, 6], [64, 12], [128, 9]]) if (mask & sides) mask &= ~diagonal
  return mask
}
export function isCliffChain(grid, x, y) {
  // Bounded two-cell neighborhood distinguishes pairs from chains of 3+.
  for (const [dx, dy] of DIRECTIONS) {
    const nx = x + dx, ny = y + dy
    if (grid[ny]?.[nx]?.type !== 'rock') continue
    for (const [ex, ey] of DIRECTIONS) {
      if (nx + ex === x && ny + ey === y) continue
      if (grid[ny + ey]?.[nx + ex]?.type === 'rock') return true
    }
  }
  return false
}

export class OrganicTerrain {
  constructor(onReady, textureManager = null, options = {}) {
    this.ready = false
    this.textureManager = textureManager
    this.biomeImages = {}
    this.biomeBlendMasks = new Map()
    this.biomeTransitionTileCache = new Map()
    this.biomeSotTileCache = new Map()
    this.image = null
    this.details = null
    this.cliffs = null
    this.assetGeneration = 0
    this.assetState = 'idle'
    this.assetError = null
    this.assetProgress = { completed: 0, total: 0 }
    this.assetController = null
    this.assetLoader = options.assetLoader || ((entry, { signal }) =>
      loadPreparedImage(entry.src, { signal, imageFactory: options.imageFactory }))
    this.onReady = typeof onReady === 'function' ? onReady : () => {}
    this.lastAssetOptions = null
    this.readiness = this.prepareAssets()
    // The renderer can consume readiness explicitly during I20. Until then,
    // preserve constructor compatibility without an unhandled rejection.
    this.readiness.catch(() => {})
  }

  getProgress() {
    return { state: this.assetState, ...this.assetProgress }
  }

  cancel(reason = 'Organic terrain preparation cancelled') {
    if (!this.assetController?.signal.aborted) {
      this.assetController?.abort(new globalThis.DOMException(reason, 'AbortError'))
    }
  }

  retry() {
    if (this.assetState !== 'failed') return this.readiness
    this.readiness = this.prepareAssets(this.lastAssetOptions || {})
    this.readiness.catch(() => {})
    return this.readiness
  }

  async prepareAssets({ signal, assets = TERRAIN_ASSET_MANIFEST } = {}) {
    this.cancel('Organic terrain assets superseded')
    const generation = ++this.assetGeneration
    const controller = new globalThis.AbortController()
    this.assetController = controller
    this.lastAssetOptions = { signal, assets }
    const abortFromCaller = () => controller.abort(signal.reason || new globalThis.DOMException('Organic terrain preparation aborted', 'AbortError'))
    signal?.addEventListener?.('abort', abortFromCaller, { once: true })
    if (signal?.aborted) abortFromCaller()
    this.ready = false
    this.assetState = 'preparing'
    this.assetError = null
    this.assetProgress.completed = 0
    this.assetProgress.total = assets.length
    try {
      const decoded = await Promise.all(assets.map(async(entry) => {
        const image = await this.assetLoader(entry, { signal: controller.signal })
        controller.signal.throwIfAborted()
        if (generation !== this.assetGeneration) throw new globalThis.DOMException('Organic terrain asset generation is stale', 'AbortError')
        this.assetProgress.completed++
        return [entry.key, image]
      }))
      controller.signal.throwIfAborted()
      if (generation !== this.assetGeneration) throw new globalThis.DOMException('Organic terrain asset generation is stale', 'AbortError')
      const byKey = new Map(decoded)
      const biomeImages = { grass: [], soil: [], snow: [], sand: [] }
      for (const [key, image] of decoded) {
        if (key.startsWith('biome:')) biomeImages[key.slice(6)]?.push(image)
      }
      this.image = byKey.get('atlas') || null
      this.details = byKey.get('details') || null
      this.cliffs = byKey.get('cliffs') || null
      this.biomeImages = biomeImages
      this.biomeBlendMasks.clear()
      this.biomeTransitionTileCache.clear()
      this.biomeSotTileCache.clear()
      this.ready = true
      this.assetState = 'ready'
      this.onReady()
      return this
    } catch (error) {
      this.ready = false
      this.assetError = error
      this.assetState = controller.signal.aborted || error?.name === 'AbortError' ? 'cancelled' : 'failed'
      throw error
    } finally {
      signal?.removeEventListener?.('abort', abortFromCaller)
    }
  }

  dispose() {
    this.cancel('Organic terrain disposed')
    this.assetGeneration++
    this.ready = false
    this.assetState = 'disposed'
    this.biomeBlendMasks.clear()
    this.biomeTransitionTileCache.clear()
    this.biomeSotTileCache.clear()
    this.biomeImages = {}
    this.image = null
    this.details = null
    this.cliffs = null
  }

  drawBiome(ctx, x, y, sx, sy, size, biome) {
    const sources = this.biomeImages[biome] || this.biomeImages.grass
    const source = sources?.[terrainHash(x, y, 29) % sources.length]
    if (source?.complete && source.naturalWidth) {
      const sourceSize = source.naturalWidth
      const sourceX = ((x * size) % sourceSize + sourceSize) % sourceSize
      const sourceY = ((y * size) % source.naturalHeight + source.naturalHeight) % source.naturalHeight
      ctx.drawImage(source, sourceX, sourceY, size, size, sx, sy, size, size)
      return
    }

    // The atlas remains a safe fallback while source material images load.
    ctx.drawImage(this.image, (x & 7) * 64 + (terrainHash(x >> 3, y >> 3, 29) % 2) * 512, (y & 7) * 64, 64, 64, sx, sy, size, size)
  }

  getBiomeBlendMask(size, x, y, blend) {
    const directionSteps = 8
    const direction = ((Math.round((((blend.angle || 0) + Math.PI) / (Math.PI * 2)) * directionSteps) % directionSteps) + directionSteps) % directionSteps
    const coverage = Math.max(1, Math.min(8, Math.round(blend.alpha * 8)))
    const angle = (direction / directionSteps) * Math.PI * 2 - Math.PI
    const normalX = Math.cos(angle), normalY = Math.sin(angle)
    const tangentX = -normalY, tangentY = normalX
    const worldTangent = (x * size) * tangentX + (y * size) * tangentY
    const phase = ((Math.round((worldTangent / size) * 2) % 8) + 8) % 8
    const key = `${size}|${direction}|${coverage}|${phase}`
    if (this.biomeBlendMasks.has(key)) return this.biomeBlendMasks.get(key)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')
    const pixels = context.createImageData(size, size)
    const featherPixels = Math.max(1, Math.min(size, Number(blend.featherPixels) || size * 0.2))
    const threshold = (coverage / 8 - 0.5) * size * 1.35
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const localX = px + 0.5 - size / 2
      const localY = py + 0.5 - size / 2
      const tangent = localX * tangentX + localY * tangentY
      const continuousTangent = tangent / size + phase / 2
      const wave = Math.sin(continuousTangent * Math.PI * 2) * size * 0.1 + Math.sin(continuousTangent * Math.PI * 5) * size * 0.035
      const distance = localX * normalX + localY * normalY + threshold + wave
      const alpha = Math.max(0, Math.min(1, 0.5 + distance / Math.max(3, featherPixels)))
      pixels.data[(py * size + px) * 4 + 3] = Math.round(alpha * 255)
    }
    context.putImageData(pixels, 0, 0)
    this.biomeBlendMasks.set(key, canvas)
    return canvas
  }

  getBiomeTransitionMask(size, cornerWeights) {
    const key = `biome|${size}|${cornerWeights.join(':')}`
    let alphaMask = this.biomeBlendMasks.get(key)
    if (alphaMask) return alphaMask
    alphaMask = document.createElement('canvas')
    alphaMask.width = alphaMask.height = size
    const context = alphaMask.getContext('2d')
    const pixels = context.createImageData(size, size)
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      pixels.data[(py * size + px) * 4 + 3] = Math.round(255 * biomeTransitionCoverage(
        cornerWeights,
        px / (size - 1),
        py / (size - 1)
      ))
    }
    context.putImageData(pixels, 0, 0)
    this.biomeBlendMasks.set(key, alphaMask)
    return alphaMask
  }

  drawBiomeTransition(ctx, x, y, sx, sy, size, blend) {
    const cornerWeights = Array.isArray(blend.cornerWeights) && blend.cornerWeights.length === 4 ? blend.cornerWeights : null
    const key = `${size}|${x}|${y}|${blend.biome}|${blend.alpha}|${blend.angle}|${blend.featherPixels || 0}|${cornerWeights?.join(':') || 'directional'}`
    let canvas = this.biomeTransitionTileCache.get(key)
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const blendContext = canvas.getContext('2d')
      this.drawBiome(blendContext, x, y, 0, 0, size, blend.biome)
      blendContext.globalCompositeOperation = 'destination-in'
      blendContext.drawImage(cornerWeights === null
        ? this.getBiomeBlendMask(size, x, y, blend)
        : this.getBiomeTransitionMask(size, cornerWeights), 0, 0)
      blendContext.globalCompositeOperation = 'source-over'
      if (this.biomeTransitionTileCache.size >= TERRAIN_TRANSITION_CACHE_LIMIT) {
        this.biomeTransitionTileCache.delete(this.biomeTransitionTileCache.keys().next().value)
      }
      this.biomeTransitionTileCache.set(key, canvas)
    }
    ctx.drawImage(canvas, sx, sy)
  }

  getShorelineMask(size, mask, featherWidth = 0.2, beachPattern = false) {
    const key = `shore|${size}|${mask}|${featherWidth}|${beachPattern ? 'beach' : 'smooth'}`
    let alphaMask = this.biomeBlendMasks.get(key)
    if (alphaMask) return alphaMask
    alphaMask = document.createElement('canvas')
    alphaMask.width = alphaMask.height = size
    const context = alphaMask.getContext('2d')
    const pixels = context.createImageData(size, size)
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      pixels.data[(py * size + px) * 4 + 3] = Math.round(255 * shorelineCoverage(
        mask,
        px / (size - 1),
        py / (size - 1),
        featherWidth,
        beachPattern
      ))
    }
    context.putImageData(pixels, 0, 0)
    this.biomeBlendMasks.set(key, alphaMask)
    return alphaMask
  }

  drawBiomeShore(ctx, x, y, sx, sy, size, mask, biome) {
    const key = `shore|${size}|${x}|${y}|${mask}|${biome}`
    let canvas = this.biomeTransitionTileCache.get(key)
    if (!canvas) {
      const patternVariant = biome === 'sand' ? terrainHash(x, y, 157) % SHORELINE_PATTERN_VARIATIONS.length : false
      const alphaMask = this.getShorelineMask(size, mask, 0.2, patternVariant)
      canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const context = canvas.getContext('2d')
      this.drawBiome(context, x, y, 0, 0, size, biome)
      context.globalCompositeOperation = 'destination-in'
      context.drawImage(alphaMask, 0, 0)
      if (this.biomeTransitionTileCache.size >= TERRAIN_TRANSITION_CACHE_LIMIT) {
        this.biomeTransitionTileCache.delete(this.biomeTransitionTileCache.keys().next().value)
      }
      this.biomeTransitionTileCache.set(key, canvas)
    }
    ctx.drawImage(canvas, sx, sy)
  }

  drawBiomeSot(ctx, x, y, sx, sy, size, orientation, biome) {
    const corner = ORIENTATIONS.indexOf(orientation)
    if (corner < 0) return
    const key = `${size}|${x}|${y}|${orientation}|${biome}`
    let canvas = this.biomeSotTileCache.get(key)
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const sotContext = canvas.getContext('2d')
      this.drawBiome(sotContext, x, y, 0, 0, size, biome)
      sotContext.globalCompositeOperation = 'destination-in'
      const variant = terrainHash(x, y) % 4
      sotContext.drawImage(this.details, (corner * 4 + variant) * 32, 0, 32, 32, 0, 0, size, size)
      sotContext.globalCompositeOperation = 'source-over'
      if (this.biomeSotTileCache.size >= TERRAIN_TRANSITION_CACHE_LIMIT) {
        this.biomeSotTileCache.delete(this.biomeSotTileCache.keys().next().value)
      }
      this.biomeSotTileCache.set(key, canvas)
    }
    const offset = getSotDrawOffset(orientation)
    const drawSize = size + SOT_EDGE_OVERLAP
    ctx.drawImage(canvas, 0, 0, size, size, sx + offset.x, sy + offset.y, drawSize, drawSize)
  }

  drawGrass(ctx, x, y, sx, sy, size, tile = null) {
    const configuredBiome = this.textureManager?.integratedBiomeTag || 'grass'
    const primaryBiome = tile?.biome || (configuredBiome === 'mixed' ? 'grass' : configuredBiome)
    this.drawBiome(ctx, x, y, sx, sy, size, primaryBiome)
    const blend = tile?.biomeBlend
    if (!blend?.biome || !(blend.alpha > 0)) return
    this.drawBiomeTransition(ctx, x, y, sx, sy, size, blend)
  }

  drawRoad(ctx, grid, x, y, sx, sy, size) {
    const index = BLOB_INDEX.get(roadVisualMask(grid, x, y)) * 4 + terrainHash(x, y) % 4
    ctx.drawImage(this.image, (index % 16) * 80, 512 + Math.floor(index / 16) * 80,
      80, 80, sx - size / 8, sy - size / 8, size * 1.25, size * 1.25)
  }

  drawRoadFringe(ctx, grid, x, y, sx, sy, size) {
    const corners = roadFringeMask(grid, x, y)
    for (let corner = 0; corner < 4; corner++) {
      if (!(corners & (1 << corner))) continue
      this.drawTriangle(ctx, x, y, sx, sy, size, ORIENTATIONS[corner], 'street')
    }
  }

  drawTriangle(ctx, x, y, sx, sy, size, orientation, type) {
    const corner = ORIENTATIONS.indexOf(orientation)
    if (corner < 0) return
    const variant = terrainHash(x, y) % 4
    const offset = getSotDrawOffset(orientation)
    ctx.drawImage(this.details, (corner * 4 + variant) * 32, type === 'street' ? 32 : 0, 32, 32,
      sx + offset.x, sy + offset.y, size + SOT_EDGE_OVERLAP, size + SOT_EDGE_OVERLAP)
  }

  drawCoast(ctx, grid, x, y, sx, sy, size, sotInfo, sotMask = null) {
    const tile = grid[y][x]
    if (tile.type === 'water') {
      let grass = 0, road = 0
      for (let i = 0; i < 4; i++) {
        const [dx, dy] = DIRECTIONS[i], neighbor = grid[y + dy]?.[x + dx]
        if (!neighbor || neighbor.type === 'water') continue
        const neighborSot = sotMask?.[y + dy]?.[x + dx]
        const corner = ORIENTATIONS.indexOf(neighborSot?.orientation)
        // A water SOT contributes two water edges, despite its land cell type.
        if (neighborSot?.type === 'water' && corner >= 0 && ([12, 9, 3, 6][i] & (1 << corner))) continue
        if (neighbor.type === 'street' && !neighbor.airstripStreet) road |= 1 << i
        else grass |= 1 << i
      }
      if (grass) ctx.drawImage(this.details, grass * 32, 64, 32, 32, sx, sy, size, size)
      if (road) ctx.drawImage(this.details, road * 32, 96, 32, 32, sx, sy, size, size)
      // Existing SOT topology is retained; only its material and edge change.
      if (sotInfo && sotInfo.type !== 'water') this.drawTriangle(ctx, x, y, sx, sy, size, sotInfo.orientation, sotInfo.type)
    } else if (sotInfo?.type === 'water') {
      const corner = ORIENTATIONS.indexOf(sotInfo.orientation)
      if (corner >= 0) ctx.drawImage(this.details, corner * 32, tile.type === 'street' ? 160 : 128, 32, 32, sx, sy, size, size)
    }
  }

  drawDecoration(ctx, grid, x, y, sx, sy, size, sotInfo) {
    const tile = grid[y][x], h = terrainHash(x, y, 91)
    if (tile.type !== 'land' || tile.airstripStreet || tile.ore || tile.seedCrystal || tile.building || sotInfo || h % 19 !== 0) return
    for (const [dx, dy] of DIRECTIONS) if (grid[y + dy]?.[x + dx]?.type !== 'land') return
    const variant = (h >>> 8) % 12
    ctx.drawImage(this.details, variant * 32, 192, 32, 32, sx, sy, size, size)
  }

  drawCliffs(ctx, grid, startX, startY, endX, endY, offsetX, offsetY, size) {
    if (!this.cliffs?.complete || !this.cliffs.naturalWidth) return false
    const left = Math.max(-1, startX - 4), top = Math.max(-1, startY - 4)
    const right = Math.min(grid[0].length, endX + 4), bottom = Math.min(grid.length, endY + 4)
    const depth = buildCliffDepth(grid, left, top, right + 1, bottom + 1)
    const scale = size / CLIFF_TILE
    // Sparse, deterministic details keep broad plateau tops readable. Draw
    // them before the faces so enlarged artwork belongs to the plateau ground
    // texture and cannot paint over cliff walls.
    ctx.save()
    ctx.beginPath()
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      if (isPlateauTile(depth, x, y)) ctx.rect(x * size - offsetX, y * size - offsetY, size, size)
    }
    ctx.clip()
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      if (!isPlateauTile(depth, x, y) || terrainHash(x, y, 313) % PLATEAU_DETAIL_FREQUENCY !== 0) continue
      ctx.drawImage(this.cliffs, 16 * CLIFF_CELL, cliffVariant(x, y) * CLIFF_CELL, CLIFF_CELL, CLIFF_CELL,
        x * size - offsetX - CLIFF_PADDING * scale - (size * (PLATEAU_DETAIL_SCALE - 1)) / 2,
        y * size - offsetY - CLIFF_PADDING * scale - (size * (PLATEAU_DETAIL_SCALE - 1)) / 2,
        CLIFF_CELL * scale * PLATEAU_DETAIL_SCALE, CLIFF_CELL * scale * PLATEAU_DETAIL_SCALE)
    }
    ctx.restore()

    // Faces originate only from plateau topology, while their transparent rim,
    // talus and shadow may cross the tile boundary without rectangular crops.
    // Lowest terrace first, then nested contours. Interiors have no rock sprite.
    for (const level of CLIFF_LEVELS) {
      const macroClaims = new Uint8Array(depth.values.length)
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const depthIndex = (y - depth.top) * depth.width + x - depth.left
        if (macroClaims?.[depthIndex]) continue
        const mask = cliffContourMask(depth, x, y, level)
        if (!mask || mask === 15) continue
        const variant = cliffVariant(x, y, level)
        const heightClass = cliffHeightClass(depth, x, y, level)
        const macroLength = macroRunLength(depth, x, y, level, mask, heightClass)
        if (macroLength) {
          const rect = cliffMacroRect(mask, macroLength, variant)
          const horizontal = mask === 3 || mask === 12
          const crossScale = heightClass === 2 ? scale : scale * 0.5
          for (let offset = 0; offset < macroLength; offset++) {
            macroClaims[depthIndex + (horizontal ? offset : offset * depth.width)] = 1
          }
          ctx.drawImage(this.cliffs, rect.x, rect.y, rect.width, rect.height,
            horizontal ? (x + .5) * size - offsetX - CLIFF_PADDING * scale : (x + 1) * size - offsetX - (CLIFF_PADDING + CLIFF_TILE) * crossScale,
            horizontal ? (y + 1) * size - offsetY - (CLIFF_PADDING + CLIFF_TILE) * crossScale : (y + .5) * size - offsetY - CLIFF_PADDING * scale,
            horizontal ? rect.width * scale : rect.width * crossScale,
            horizontal ? rect.height * crossScale : rect.height * scale)
          continue
        }
        const rect = heightClass === 2
          ? cliffTallRect(mask, variant)
          : { x: mask * CLIFF_CELL, y: variant * CLIFF_CELL, width: CLIFF_CELL, height: CLIFF_CELL }
        const padding = heightClass === 2 ? CLIFF_TALL_PADDING : CLIFF_PADDING
        ctx.drawImage(this.cliffs, rect.x, rect.y, rect.width, rect.height,
          (x + .5) * size - offsetX - padding * scale,
          (y + .5) * size - offsetY - padding * scale,
          (heightClass === 2 ? CLIFF_TALL_CELL : CLIFF_CELL) * scale,
          (heightClass === 2 ? CLIFF_TALL_CELL : CLIFF_CELL) * scale)
      }
    }
    // Every non-plateau rock remains an ordinary boulder, regardless of whether
    // it belongs to a short pair, a bend, or a thin cardinal chain.
    for (let y = Math.max(0, top); y < bottom; y++) for (let x = Math.max(0, left); x < right; x++) {
      if (grid[y][x].type === 'rock' && !isPlateauTile(depth, x, y)) {
        this.drawBoulder(ctx, x, y, x * size - offsetX, y * size - offsetY, size)
      }
    }
    return true
  }

  drawBoulder(ctx, x, y, sx, sy, size) {
    const variant = terrainHash(x, y, 37) % 6
    ctx.drawImage(this.details, variant * 48, 2304, 48, 48, sx - size / 4, sy - size / 4, size * 1.5, size * 1.5)
  }

  drawRock(ctx, grid, x, y, sx, sy, size) {
    if (isCliffChain(grid, x, y)) {
      let mask = cliffConnections(grid, x, y)
      // Thick barriers read as parallel ledges, not a lattice of cross-junctions.
      if ((mask & 5) === 5) mask = 5
      else if ((mask & 10) === 10) mask = 10
      const variant = terrainHash(x, y, 17) % 2
      ctx.drawImage(this.details, (mask % 16) * 64, 256 + (Math.floor(mask / 16) * 2 + variant) * 64,
        64, 64, sx - size / 2, sy - size / 2, size * 2, size * 2)
    } else {
      this.drawBoulder(ctx, x, y, sx, sy, size)
    }
  }
}
