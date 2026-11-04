// Static ground has a different lifetime from the small, evictable decoration
// cache. A complete generation is admitted before allocation or not admitted at
// all. The shared preparation budget includes both old and new generations.
export const STATIC_TERRAIN_PAGE_LIMIT = 256 * 1024 * 1024

export function staticTerrainPageBytes(width, height, { tileSize = 32, chunkSize = 16, padding = 2, density = 1 } = {}) {
  let bytes = 0
  for (let y = 0; y < height; y += chunkSize) for (let x = 0; x < width; x += chunkSize) {
    bytes += Math.ceil((Math.min(chunkSize, width - x) * tileSize + padding * 2 + 1) * density) *
      Math.ceil((Math.min(chunkSize, height - y) * tileSize + padding * 2 + 1) * density) * 4
  }
  return bytes
}

export class StaticTerrainPages {
  constructor({ grid, density, bytes, budget, stagingBytes = 0, limit = STATIC_TERRAIN_PAGE_LIMIT }) {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limit) throw new RangeError('Static terrain exceeds its raster budget')
    this.reservation = budget.reserve('terrainResident', bytes)
    try { this.staging = budget.reserve('terrainStaging', stagingBytes) } catch (error) { this.reservation.release(); throw error }
    this.budget = budget
    this.preparing = true
    this.grid = grid
    this.density = density
    this.bytes = bytes
    this.pages = new Map()
    this.closed = false
  }

  finish() {
    this.staging?.release()
    this.staging = null
    this.preparing = false
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.finish()
    for (const chunk of this.pages.values()) {
      const image = chunk.preparedRaster?.image
      image?.close?.()
      if (image && 'getContext' in image) image.width = image.height = 1
      if (chunk.canvas && chunk.canvas !== image) chunk.canvas.width = chunk.canvas.height = 1
      chunk.preparedRaster = null
      chunk.everRendered = false
    }
    this.pages.clear()
    this.reservation.release()
  }
}
