import { buildCliffDepth, cliffContourMask, cliffHeightClass, cliffMacroRect, cliffTallRect, isPlateauTile, CLIFF_LEVELS, CLIFF_CELL, CLIFF_PADDING, CLIFF_TILE, CLIFF_TALL_CELL, CLIFF_TALL_PADDING, CLIFF_VARIANTS } from './cliffTerrain.js'

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
const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor

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
  constructor(onReady) {
    this.ready = false
    this.image = new Image()
    this.details = new Image()
    this.cliffs = new Image()
    const loaded = () => {
      if (!this.image.complete || !this.image.naturalWidth || !this.details.complete || !this.details.naturalWidth) return
      this.ready = true
      onReady()
    }
    this.cliffs.onload = () => onReady()
    this.cliffs.src = 'images/terrain/terraced-cliffs.webp'
    this.image.onload = loaded
    this.details.onload = loaded
    this.details.onerror = () => { this.ready = false }
    this.details.src = 'images/terrain/terrain-details.png'
    this.image.onerror = () => { this.ready = false }
    this.image.src = 'images/terrain/organic-atlas.png'
  }

  drawGrass(ctx, x, y, sx, sy, size) {
    // 8x8 continuous material includes baked macro variation; no extra draw.
    ctx.drawImage(this.image, (x & 7) * 64 + (terrainHash(x >> 3, y >> 3, 29) % 2) * 512, (y & 7) * 64, 64, 64, sx, sy, size, size)
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
    ctx.drawImage(this.details, (corner * 4 + variant) * 32, type === 'street' ? 32 : 0, 32, 32, sx, sy, size, size)
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
    // Top detail is ground material and remains strictly inside rock tiles.
    ctx.save()
    ctx.beginPath()
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      if (isPlateauTile(depth, x, y)) ctx.rect(x * size - offsetX, y * size - offsetY, size, size)
    }
    ctx.clip()
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      if (!isPlateauTile(depth, x, y)) continue
      ctx.drawImage(this.cliffs, 16 * CLIFF_CELL, cliffVariant(x, y) * CLIFF_CELL, CLIFF_CELL, CLIFF_CELL,
        x * size - offsetX - CLIFF_PADDING * scale, y * size - offsetY - CLIFF_PADDING * scale,
        CLIFF_CELL * scale, CLIFF_CELL * scale)
    }
    ctx.restore()

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
