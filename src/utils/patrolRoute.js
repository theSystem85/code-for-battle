import { TILE_SIZE } from '../config.js'

export function parsePatrolRoute(route) {
  if (typeof route !== 'string' || route.length > 16384) return null
  const points = route.split(';').map(pair => {
    const parts = pair.trim().split(',')
    return parts.length === 2 && parts.every(part => part.trim() && Number.isFinite(Number(part)) && Number(part) >= 0)
      ? { x: (Number(parts[0]) + 0.5) * TILE_SIZE, y: (Number(parts[1]) + 0.5) * TILE_SIZE } : null
  })
  return points.length > 0 && points.length <= 256 && points.every(Boolean) ? points : null
}
