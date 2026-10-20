// Distances are in tiles (10 m). Shared lattice vertices keep adjoining water
// instances continuous. No terrain scans or allocations on animation frames.
export const SHORE_DEPTH_TILES = 5
export const SHORE_DEPTH_MAX_TILES = 10

export class ShoreDepthField {
  constructor(maxTiles = SHORE_DEPTH_TILES) {
    this.maxTiles = maxTiles
    this.map = null
    this.revision = null
    this.width = 0
    this.values = new Float32Array(0)
    this.builds = 0
  }

  prepare(map, revision = 0) {
    const width = (map?.[0]?.length || 0) + 1
    const length = width * ((map?.length || 0) + 1)
    if (this.map === map && this.revision === revision && this.values.length === length) return false
    if (this.values.length !== length) this.values = new Float32Array(length)
    this.values.fill(-1)
    this.map = map
    this.revision = revision
    this.width = width
    this.builds++
    return true
  }

  at(x, y) {
    if (!this.map) return this.maxTiles
    const index = y * this.width + x
    if (this.values[index] >= 0) return this.values[index]
    let squaredDistance = this.maxTiles ** 2
    // Distance to solid tile rectangles, including diagonal shores. Missing
    // cells beyond the map are open ocean, never artificial coastlines.
    const searchRadius = Math.ceil(this.maxTiles)
    for (let ty = Math.max(0, y - searchRadius - 1); ty < Math.min(this.map.length, y + searchRadius); ty++) {
      const row = this.map[ty]
      for (let tx = Math.max(0, x - searchRadius - 1); tx < Math.min(row.length, x + searchRadius); tx++) {
        const tile = row[tx]
        // Paved coasts must not seed a sandy seabed, including airstrip streets.
        if (!tile || tile.type === 'water' || tile.type === 'street' || tile.airstripStreet) continue
        const dx = Math.max(tx - x, x - tx - 1, 0)
        const dy = Math.max(ty - y, y - ty - 1, 0)
        squaredDistance = Math.min(squaredDistance, dx * dx + dy * dy)
      }
    }
    const distance = Math.sqrt(squaredDistance)
    this.values[index] = distance
    return distance
  }

  corners(x, y) {
    const tile = this.map?.[y]?.[x]
    // Water underlays and SOT cutouts on pavement stay opaque on every backend.
    if (tile?.type === 'street' || tile?.airstripStreet) {
      return [this.maxTiles, this.maxTiles, this.maxTiles, this.maxTiles]
    }
    return [this.at(x, y), this.at(x + 1, y), this.at(x + 1, y + 1), this.at(x, y + 1)]
  }
}

export function shoreOpacity(corners, u, v, maxDepth = SHORE_DEPTH_TILES) {
  const top = corners[0] + (corners[1] - corners[0]) * u
  const bottom = corners[3] + (corners[2] - corners[3]) * u
  return Math.max(0, Math.min(1, (top + (bottom - top) * v) / maxDepth))
}
