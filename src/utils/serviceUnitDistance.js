import { TILE_SIZE } from '../config.js'

// Equal-sized unit centers have the same displacement as their world origins.
// Fall back to tiles for older callers that do not have world coordinates.
export function serviceUnitDistanceTiles(source, target) {
  const dx = (source.x ?? source.tileX * TILE_SIZE) - (target.x ?? target.tileX * TILE_SIZE)
  const dy = (source.y ?? source.tileY * TILE_SIZE) - (target.y ?? target.tileY * TILE_SIZE)
  return Math.hypot(dx, dy) / TILE_SIZE
}
