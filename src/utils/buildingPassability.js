export const AIRSTRIP_SOURCE_WIDTH = 768
export const AIRSTRIP_SOURCE_HEIGHT = 512
export const AIRSTRIP_DEFAULT_WIDTH = 12
export const AIRSTRIP_DEFAULT_HEIGHT = 6

export const AIRSTRIP_BLOCKED_RECT = Object.freeze({
  xMin: 0,
  xMax: 470,
  yMin: 0,
  yMax: 148
})

export function isBuildOnlyOccupiedTile(tile) {
  return Boolean(tile && tile.buildOnlyOccupied)
}

export function hasBlockingBuilding(tile) {
  return Boolean(tile?.building) && !isBuildOnlyOccupiedTile(tile)
}

export function isAirstripBlockedLocalTile(localX, localY, width = AIRSTRIP_DEFAULT_WIDTH, height = AIRSTRIP_DEFAULT_HEIGHT) {
  if (width <= 0 || height <= 0) return true

  const pixelX = ((localX + 0.5) / width) * AIRSTRIP_SOURCE_WIDTH
  const pixelY = ((localY + 0.5) / height) * AIRSTRIP_SOURCE_HEIGHT

  const inBlockedRect =
    pixelX >= AIRSTRIP_BLOCKED_RECT.xMin &&
    pixelX <= AIRSTRIP_BLOCKED_RECT.xMax &&
    pixelY >= AIRSTRIP_BLOCKED_RECT.yMin &&
    pixelY <= AIRSTRIP_BLOCKED_RECT.yMax

  return inBlockedRect
}

export function getAirstripSpawnOffsets() {
  return [
    { x: 8, y: 2 },
    { x: 9, y: 2 },
    { x: 8, y: 1 },
    { x: 9, y: 1 }
  ]
}
