// Elevation is visual only. Never write to gameplay tiles or occupancy.
export const CLIFF_LEVELS = [1, 3, 5]
export const CLIFF_CELL = 160
export const CLIFF_PADDING = 48
export const CLIFF_TILE = 64
export const CLIFF_VARIANTS = 8
export const CLIFF_MACRO_BASE_Y = CLIFF_CELL * CLIFF_VARIANTS
export const CLIFF_MACRO_VARIANT_WIDTH = 2048
export const CLIFF_MACRO_VARIANT_HEIGHT = 576
export const CLIFF_TALL_CELL = 224
export const CLIFF_TALL_PADDING = 80
export const CLIFF_TALL_BASE_Y = 3584

export function cliffMacroRect(mask, length, variant) {
  if (![3, 6, 9, 12].includes(mask) || length < 1 || length > 4 || variant < 0 || variant >= CLIFF_VARIANTS) return null
  const originX = (variant % 2) * CLIFF_MACRO_VARIANT_WIDTH
  const originY = CLIFF_MACRO_BASE_Y + Math.floor(variant / 2) * CLIFF_MACRO_VARIANT_HEIGHT
  if (mask === 3 || mask === 12) {
    let x = originX + (mask === 12 ? 1024 : 0)
    for (let currentLength = 1; currentLength < length; currentLength++) x += currentLength * CLIFF_TILE + CLIFF_PADDING * 2
    return { x, y: originY, width: length * CLIFF_TILE + CLIFF_PADDING * 2, height: CLIFF_TILE * 2 + CLIFF_PADDING * 2 }
  }
  const item = (mask === 9 ? 4 : 0) + length - 1
  return { x: originX + item * (CLIFF_TILE * 2 + CLIFF_PADDING * 2), y: originY + CLIFF_TILE * 2 + CLIFF_PADDING * 2, width: CLIFF_TILE * 2 + CLIFF_PADDING * 2, height: length * CLIFF_TILE + CLIFF_PADDING * 2 }
}

export function cliffTallRect(mask, variant) {
  if (mask < 0 || mask > 15 || variant < 0 || variant >= CLIFF_VARIANTS) return null
  return { x: mask * CLIFF_TALL_CELL, y: CLIFF_TALL_BASE_Y + variant * CLIFF_TALL_CELL, width: CLIFF_TALL_CELL, height: CLIFF_TALL_CELL }
}

function distanceTransform(values, width, height) {
  for (let y = 1; y < height; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x
    if (values[i]) values[i] = Math.min(values[i], 1 + Math.min(values[i - 1], values[i - width - 1], values[i - width], values[i - width + 1]))
  }
  for (let y = height - 2; y >= 0; y--) for (let x = width - 2; x > 0; x--) {
    const i = y * width + x
    if (values[i]) values[i] = Math.min(values[i], 1 + Math.min(values[i + 1], values[i + width - 1], values[i + width], values[i + width + 1]))
  }
}

export function buildCliffDepth(grid, startX, startY, endX, endY) {
  // Two distance-transform sweeps over a bounded patch, only during chunk bake.
  // Five-cell padding gives exact distances through the deepest visible tier.
  const left = startX - 5, top = startY - 5
  const width = endX - startX + 10, height = endY - startY + 10
  const rockDepth = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (grid[top + y]?.[left + x]?.type === 'rock') rockDepth[y * width + x] = 5
  }
  distanceTransform(rockDepth, width, height)

  // A plateau begins only where a solid 3x3 rock footprint exists. Expand its
  // core by one rock tile so the complete 3x3 formation owns its perimeter.
  const plateau = new Uint8Array(width * height)
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x
    if (!rockDepth[i]) continue
    for (let oy = -1; oy <= 1 && !plateau[i]; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (rockDepth[i + oy * width + ox] >= 2) {
          plateau[i] = 5
          break
        }
      }
    }
  }
  const values = plateau.slice()
  distanceTransform(values, width, height)

  // Every qualifying plateau uses the tall pool around its complete outer
  // contour. Short sprites are reserved for separate inner terrace contours,
  // so the two height classes never meet along one connected cliff line.
  const heightClass = plateau.slice()
  for (let i = 0; i < heightClass.length; i++) if (heightClass[i]) heightClass[i] = 2
  return { values, plateau, heightClass, rockDepth, width, left, top }
}

export function isPlateauTile(depth, x, y) {
  const localX = x - depth.left, localY = y - depth.top
  if (localX < 0 || localY < 0 || localX >= depth.width) return false
  const i = localY * depth.width + localX
  return localY < Math.floor(depth.plateau.length / depth.width) && depth.plateau[i] > 0
}

export function cliffContourMask(depth, x, y, level) {
  const i = (y - depth.top) * depth.width + x - depth.left
  return (depth.values[i] >= level ? 1 : 0) |
    (depth.values[i + 1] >= level ? 2 : 0) |
    (depth.values[i + depth.width + 1] >= level ? 4 : 0) |
    (depth.values[i + depth.width] >= level ? 8 : 0)
}

export function cliffHeightClass(depth, x, y, level) {
  // Nested contours are separate terrace steps. Only the component-wide outer
  // contour uses the two-tile artwork.
  if (level !== CLIFF_LEVELS[0]) return 1
  const i = (y - depth.top) * depth.width + x - depth.left
  let result = 1
  for (const offset of [0, 1, depth.width + 1, depth.width]) {
    if (depth.values[i + offset] >= level) result = Math.max(result, depth.heightClass[i + offset] || 1)
  }
  return result
}
