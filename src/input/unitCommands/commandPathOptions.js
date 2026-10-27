import { TILE_SIZE } from '../../config.js'

// Ships do not participate in the land collision grid. Snapshot them once per
// user order, shared by every selected unit and discarded after path planning.
export function createCommandPathOptions(units, mapGrid) {
  const navalOccupancy = new Set()
  const width = mapGrid[0]?.length || 0
  for (const unit of units || []) {
    if (!unit.isNaval || unit.health <= 0 || unit.embarkedOnId) continue
    const x = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const y = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
    if (x >= 0 && x < width && y >= 0 && y < mapGrid.length) {
      navalOccupancy.add(y * width + x)
    }
  }
  return { includeMovableOccupancy: true, navalOccupancy }
}
