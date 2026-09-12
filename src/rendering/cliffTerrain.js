// Elevation is visual only. Never write to gameplay tiles or occupancy.
export const CLIFF_LEVELS = [1, 3, 5]
export const CLIFF_CELL = 160
export const CLIFF_PADDING = 48
export const CLIFF_TILE = 64

export function buildCliffDepth(grid, startX, startY, endX, endY) {
  // Two distance-transform sweeps over a bounded patch, only during chunk bake.
  // Five-cell padding gives exact distances through the deepest visible tier.
  const left = startX - 5, top = startY - 5
  const width = endX - startX + 10, height = endY - startY + 10
  const values = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (grid[top + y]?.[left + x]?.type === 'rock') values[y * width + x] = 5
  }
  for (let y = 1; y < height; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x
    if (values[i]) values[i] = Math.min(values[i], 1 + Math.min(values[i - 1], values[i - width - 1], values[i - width], values[i - width + 1]))
  }
  for (let y = height - 2; y >= 0; y--) for (let x = width - 2; x > 0; x--) {
    const i = y * width + x
    if (values[i]) values[i] = Math.min(values[i], 1 + Math.min(values[i + 1], values[i + width - 1], values[i + width], values[i + width + 1]))
  }
  return { values, width, left, top }
}

export function cliffContourMask(depth, x, y, level) {
  const i = (y - depth.top) * depth.width + x - depth.left
  return (depth.values[i] >= level ? 1 : 0) |
    (depth.values[i + 1] >= level ? 2 : 0) |
    (depth.values[i + depth.width + 1] >= level ? 4 : 0) |
    (depth.values[i + depth.width] >= level ? 8 : 0)
}
