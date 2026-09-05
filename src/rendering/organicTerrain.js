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

export class OrganicTerrain {
  constructor(onReady) {
    this.ready = false
    this.image = new Image()
    this.image.onload = () => { this.ready = true; onReady() }
    this.image.onerror = () => { this.ready = false }
    this.image.src = 'images/terrain/organic-atlas.png'
  }

  drawGrass(ctx, x, y, sx, sy, size) {
    // 8x8 continuous material includes baked macro variation; no extra draw.
    ctx.drawImage(this.image, (x & 7) * 64 + (terrainHash(x >> 3, y >> 3, 29) % 2) * 512, (y & 7) * 64, 64, 64, sx, sy, size, size)
  }

  drawRoad(ctx, grid, x, y, sx, sy, size) {
    const index = BLOB_INDEX.get(terrainMask(grid, x, y, 'street')) * 4 + terrainHash(x, y) % 4
    ctx.drawImage(this.image, (index % 16) * 80, 512 + Math.floor(index / 16) * 80,
      80, 80, sx - size / 8, sy - size / 8, size * 1.25, size * 1.25)
  }

  drawRoadFringe(ctx, grid, x, y, sx, sy, size) {
    if (grid[y][x].type !== 'land' || grid[y][x].airstripStreet) return
    const mask = terrainMask(grid, x, y, 'street')
    const corners = [137, 19, 38, 76]
    for (let corner = 0; corner < 4; corner++) {
      if ((mask & corners[corner]) !== corners[corner]) continue
      const variant = terrainHash(x, y) % 4
      ctx.drawImage(this.image, (corner * 4 + variant) * 64, 1632, 64, 64, sx, sy, size, size)
    }
  }

  drawRock(ctx, grid, x, y, sx, sy, size) {
    const rock = (tx, ty) => grid[ty]?.[tx]?.type === 'rock' && !grid[ty]?.[tx]?.airstripStreet
    const ax = x & ~1, ay = y & ~1
    let spanX = 1, spanY = 1
    if (rock(ax, ay) && rock(ax + 1, ay) && rock(ax, ay + 1) && rock(ax + 1, ay + 1)) {
      if (x !== ax || y !== ay) return
      spanX = 2; spanY = 2
    } else if (rock(x, ay) && rock(x, ay + 1)) {
      if (y !== ay) return
      spanY = 2
    } else if (rock(ax, y) && rock(ax + 1, y)) {
      // Only pair horizontally when neither cell belongs to a vertical pair.
      if (!rock(ax, y ^ 1) && !rock(ax + 1, y ^ 1)) {
        if (x !== ax) return
        spanX = 2
      }
    }
    const mask = terrainMask(grid, x, y, 'rock') & 15
    const variant = terrainHash(x, y, 17)
    const template = spanX === 2 && spanY === 2 ? 5 : spanX === 2 ? 1 :
      spanY === 2 ? (variant % 2 ? 0 : 5) :
        [3, 6, 9, 12].includes(mask) ? 3 : variant % 3 === 0 ? 4 : 0
    const width = Math.round(size * (spanX + 0.35))
    const height = Math.round(size * (spanY + 0.35))
    const jitterX = ((variant % 5) - 2) * size / 32
    const jitterY = (((variant >>> 3) % 5) - 2) * size / 32
    const layout = (spanX === 2 ? 1 : 0) | (spanY === 2 ? 2 : 0)
    ctx.drawImage(this.image, template * 80, 1712 + layout * 80, width, height,
      Math.round(sx - size * 0.175 + jitterX), Math.round(sy - size * 0.175 + jitterY), width, height)
  }
}
