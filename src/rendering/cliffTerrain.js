// Elevation is visual only. Never write to gameplay tiles or occupancy.
export const CLIFF_LEVELS = [1, 3, 5]
export const CLIFF_CELL = 160
export const CLIFF_PADDING = 48
export const CLIFF_TILE = 64
export const CLIFF_VARIANTS = 8
export const CLIFF_MACRO_BASE_Y = CLIFF_CELL * CLIFF_VARIANTS
export const CLIFF_MACRO_VARIANT_WIDTH = 1800
export const CLIFF_MACRO_VARIANT_HEIGHT = 576

export function cliffMacroRect(mask, length, variant) {
  if (![3, 6, 9, 12].includes(mask) || length < 2 || length > 4 || variant < 0 || variant >= CLIFF_VARIANTS) return null
  const originX = (variant % 2) * CLIFF_MACRO_VARIANT_WIDTH
  const originY = CLIFF_MACRO_BASE_Y + Math.floor(variant / 2) * CLIFF_MACRO_VARIANT_HEIGHT
  if (mask === 3 || mask === 12) {
    let x = originX + (mask === 12 ? 864 : 0)
    for (let currentLength = 2; currentLength < length; currentLength++) x += currentLength * CLIFF_TILE + CLIFF_PADDING * 2
    return { x, y: originY, width: length * CLIFF_TILE + CLIFF_PADDING * 2, height: CLIFF_TILE * 2 + CLIFF_PADDING * 2 }
  }
  const item = (mask === 9 ? 3 : 0) + length - 2
  return { x: originX + item * (CLIFF_TILE * 2 + CLIFF_PADDING * 2), y: originY + CLIFF_TILE * 2 + CLIFF_PADDING * 2, width: CLIFF_TILE * 2 + CLIFF_PADDING * 2, height: length * CLIFF_TILE + CLIFF_PADDING * 2 }
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

  // Cardinal chains of at least three rocks can carry a one-sided escarpment
  // even when they are too narrow for a closed plateau.
  const escarpment = new Uint8Array(width * height)
  const visited = new Uint8Array(width * height)
  const stack = new Int32Array(width * height)
  const component = new Int32Array(width * height)
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x
    if (!rockDepth[i] || plateau[i] || visited[i]) continue

    let stackLength = 1, componentLength = 0
    stack[0] = i
    visited[i] = 1
    while (stackLength) {
      const current = stack[--stackLength]
      component[componentLength++] = current
      const currentX = current % width, currentY = Math.floor(current / width)
      for (let direction = 0; direction < 4; direction++) {
        if ((direction === 0 && currentY === 0) ||
          (direction === 1 && currentX === width - 1) ||
          (direction === 2 && currentY === height - 1) ||
          (direction === 3 && currentX === 0)) continue
        const neighbor = direction === 0 ? current - width : direction === 1 ? current + 1
          : direction === 2 ? current + width : current - 1
        if (!visited[neighbor] && rockDepth[neighbor] && !plateau[neighbor]) {
          visited[neighbor] = 1
          stack[stackLength++] = neighbor
        }
      }
    }
    if (componentLength >= 3) for (let j = 0; j < componentLength; j++) escarpment[component[j]] = 1
  }
  return { values, plateau, escarpment, rockDepth, width, left, top }
}

export function isPlateauTile(depth, x, y) {
  const localX = x - depth.left, localY = y - depth.top
  if (localX < 0 || localY < 0 || localX >= depth.width) return false
  const i = localY * depth.width + localX
  return localY < Math.floor(depth.plateau.length / depth.width) && depth.plateau[i] > 0
}

export function isEscarpmentTile(depth, x, y) {
  const localX = x - depth.left, localY = y - depth.top
  if (localX < 0 || localY < 0 || localX >= depth.width) return false
  const i = localY * depth.width + localX
  return localY < Math.floor(depth.escarpment.length / depth.width) && depth.escarpment[i] > 0
}

export function escarpmentContourMask(depth, x, y) {
  const i = (y - depth.top) * depth.width + x - depth.left
  return (depth.escarpment[i] ? 1 : 0) |
    (depth.escarpment[i + 1] ? 2 : 0) |
    (depth.escarpment[i + depth.width + 1] ? 4 : 0) |
    (depth.escarpment[i + depth.width] ? 8 : 0)
}

export function cliffContourMask(depth, x, y, level) {
  const i = (y - depth.top) * depth.width + x - depth.left
  return (depth.values[i] >= level ? 1 : 0) |
    (depth.values[i + 1] >= level ? 2 : 0) |
    (depth.values[i + depth.width + 1] >= level ? 4 : 0) |
    (depth.values[i + depth.width] >= level ? 8 : 0)
}
