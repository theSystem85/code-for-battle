// Prepared map data only. This module deliberately has no game/render imports
// so a HUD lookup cannot initialize another renderer or rebuild a city index.
const indices = new WeakMap()

export function setCityOcclusionIndex(mapGrid, index) {
  if (index) indices.set(mapGrid, index)
  else indices.delete(mapGrid)
}

export function isCityOccludedAtTile(mapGrid, x, y) {
  const index = indices.get(mapGrid)
  if (!index || x < 0 || y < 0 || x >= index.width || y >= index.height) return false
  let entry = index.cells[y * index.width + x]
  while (entry) {
    if (entry.building.health > 0) return true
    entry = entry.next
  }
  return false
}
