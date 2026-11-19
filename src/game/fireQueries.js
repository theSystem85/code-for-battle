import { TILE_SIZE } from '../config.js'

export function hasBuildingFire(grid, building) {
  for (let y = building.y; y < building.y + (building.height || 1); y++) {
    for (let x = building.x; x < building.x + (building.width || 1); x++) {
      if (grid?.[y]?.[x]?.fire) return true
    }
  }
  return false
}

export function isUnitOnFire(grid, unit) {
  if (!grid || unit.embarkedOnId || (unit.isAirUnit && unit.altitude > 0)) return false
  const x = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
  const y = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
  return Boolean(grid[y]?.[x]?.fire)
}
