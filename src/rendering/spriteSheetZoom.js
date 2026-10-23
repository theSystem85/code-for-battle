import { TILE_SIZE } from '../config.js'

import { normalizeSpriteSheetZoomFactor } from '../utils/spriteSheetMetadata.js'
export { normalizeSpriteSheetZoomFactor } from '../utils/spriteSheetMetadata.js'

// Configuration/preparation only. Virtual cells sample the original image;
// no resized image variants or per-frame geometry are created.
export function zoomDecorationGroup(group, zoomFactor = 1, budget = { remaining: 65536 }) {
  const zoom = normalizeSpriteSheetZoomFactor(zoomFactor)
  if (zoom === 1) return group
  const width = Math.ceil(group.width * zoom), height = Math.ceil(group.height * zoom)
  if (width * height > budget.remaining) throw new RangeError('Sprite sheet zoom exceeds the prepared decoration cell budget.')
  budget.remaining -= width * height
  const first = group.tilesByOffset['0,0']
  const cellWidth = first.rect.width, cellHeight = first.rect.height
  let image = first.image, left = first.rect.x, top = first.rect.y
  const contiguous = Object.entries(group.tilesByOffset).every(([key, tile]) => {
    const [x, y] = key.split(',').map(Number)
    return tile.image === image && tile.rect.width === cellWidth && tile.rect.height === cellHeight &&
      tile.rect.x === left + x * cellWidth && tile.rect.y === top + y * cellHeight
  })
  if (!contiguous) {
    const bytes = group.width * cellWidth * group.height * cellHeight * 4
    const remaining = budget.rasterBytesRemaining ?? 64 * 1024 * 1024
    if (bytes > remaining) throw new RangeError('Sprite sheet zoom exceeds the prepared raster byte budget.')
    budget.rasterBytesRemaining = remaining - bytes
    const canvas = document.createElement('canvas')
    canvas.width = group.width * cellWidth
    canvas.height = group.height * cellHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Cannot prepare sprite sheet zoom.')
    for (const [key, tile] of Object.entries(group.tilesByOffset)) {
      const [x, y] = key.split(',').map(Number)
      ctx.drawImage(tile.image, tile.rect.x, tile.rect.y, tile.rect.width, tile.rect.height, x * cellWidth, y * cellHeight, cellWidth, cellHeight)
    }
    image = canvas
    left = top = 0
  }
  const scaledWidth = group.width * zoom, scaledHeight = group.height * zoom
  const insetX = (width - scaledWidth) / 2, insetY = (height - scaledHeight) / 2
  const tilesByOffset = {}
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = Math.max(x, insetX), y0 = Math.max(y, insetY)
    const x1 = Math.min(x + 1, insetX + scaledWidth), y1 = Math.min(y + 1, insetY + scaledHeight)
    tilesByOffset[`${x},${y}`] = { ...first, image,
      rect: { x: left + (x0 - insetX) / zoom * cellWidth, y: top + (y0 - insetY) / zoom * cellHeight,
        width: (x1 - x0) / zoom * cellWidth, height: (y1 - y0) / zoom * cellHeight },
      destinationRect: { x: (x0 - x) * TILE_SIZE, y: (y0 - y) * TILE_SIZE,
        width: (x1 - x0) * TILE_SIZE, height: (y1 - y0) * TILE_SIZE } }
  }
  return { ...group, width, height, area: width * height, zoomFactor: zoom,
    sourceWidth: group.width, sourceHeight: group.height, sourceTilesByOffset: group.tilesByOffset, tilesByOffset }
}
