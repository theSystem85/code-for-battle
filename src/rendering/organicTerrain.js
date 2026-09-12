import { buildCliffDepth, cliffContourMask, CLIFF_LEVELS, CLIFF_CELL, CLIFF_PADDING, CLIFF_TILE } from './cliffTerrain.js'

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
    const left = Math.max(-1, startX - 2), top = Math.max(-1, startY - 2)
    const right = Math.min(grid[0].length, endX + 2), bottom = Math.min(grid.length, endY + 2)
    const depth = buildCliffDepth(grid, left, top, right + 1, bottom + 1)
    const scale = size / CLIFF_TILE
    // Lowest terrace first, then nested contours. Interiors have no rock sprite.
    for (const level of CLIFF_LEVELS) {
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const mask = cliffContourMask(depth, x, y, level)
        if (!mask || mask === 15) continue
        const variant = terrainHash(x, y, level * 17) % 5
        ctx.drawImage(this.cliffs, mask * CLIFF_CELL, variant * CLIFF_CELL, CLIFF_CELL, CLIFF_CELL,
          (x + .5) * size - offsetX - CLIFF_PADDING * scale,
          (y + .5) * size - offsetY - CLIFF_PADDING * scale,
          CLIFF_CELL * scale, CLIFF_CELL * scale)
      }
    }
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const d = depth.values[(y - depth.top) * depth.width + x - depth.left]
      const hash = terrainHash(x, y, 73)
      if (d < 2 || hash % 6 !== 0) continue
      ctx.drawImage(this.cliffs, 16 * CLIFF_CELL, ((hash >>> 8) % 5) * CLIFF_CELL, CLIFF_CELL, CLIFF_CELL,
        x * size - offsetX - CLIFF_PADDING * scale, y * size - offsetY - CLIFF_PADDING * scale,
        CLIFF_CELL * scale, CLIFF_CELL * scale)
    }
    return true
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
      const variant = terrainHash(x, y, 37) % 6
      ctx.drawImage(this.details, variant * 48, 2304, 48, 48, sx - size / 4, sy - size / 4, size * 1.5, size * 1.5)
    }
  }
}
