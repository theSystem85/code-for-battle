export const MAX_SSE_PIXELS = 16 * 1024 * 1024

export function validateGrid({ columns, rows, tileSize, rowHeight = tileSize, borderWidth = 0 }) {
  if (![columns, rows, tileSize, rowHeight, borderWidth].every(Number.isInteger)
    || columns < 1 || rows < 1 || tileSize < 8 || rowHeight < 8 || borderWidth < 0
    || borderWidth * 2 >= Math.min(tileSize, rowHeight)
    || columns * tileSize > 16383 || rows * rowHeight > 16383
    || columns * tileSize * rows * rowHeight > MAX_SSE_PIXELS) {
    throw new Error('Invalid grid or sheet exceeds the 16 megapixel limit.')
  }
}

// Occupied entries are "column,row". Border is inside the existing SSE cell pitch.
export function findPackingRegion({ columns, rows, occupied, width, height, tileSize, rowHeight = tileSize, borderWidth = 0 }) {
  validateGrid({ columns, rows, tileSize, rowHeight, borderWidth })
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('Invalid sprite dimensions.')
  const spanX = Math.ceil((width + borderWidth * 2) / tileSize)
  const spanY = Math.ceil((height + borderWidth * 2) / rowHeight)
  if (spanX > columns) throw new Error('Sprite is wider than the target. Create a target with more columns.')
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= columns - spanX; x++) {
      let free = true
      for (let dy = 0; dy < spanY && free; dy++) {
        for (let dx = 0; dx < spanX; dx++) {
          if (occupied.has(`${x + dx},${y + dy}`)) { free = false; break }
        }
      }
      if (free) {
        const nextRows = Math.max(rows, y + spanY)
        validateGrid({ columns, rows: nextRows, tileSize, rowHeight, borderWidth })
        return { x, y, spanX, spanY, rows: nextRows }
      }
    }
  }
  throw new Error('Unable to pack sprite.')
}

// Existing, non-imported content is supplied as fixed occupied cells.
export function compactSprites(sprites, grid) {
  const occupied = new Set(grid.occupied || [])
  let rows = grid.rows
  const placements = [...sprites].sort((a, b) => a.placedAt.row - b.placedAt.row || a.placedAt.column - b.placedAt.column).map(sprite => {
    const region = findPackingRegion({ ...grid, rows, occupied,
      width: sprite.tileSpan.columns * grid.tileSize - 2 * (grid.borderWidth || 0),
      height: sprite.tileSpan.rows * (grid.rowHeight || grid.tileSize) - 2 * (grid.borderWidth || 0) })
    rows = region.rows
    for (let y = 0; y < region.spanY; y++) {
      for (let x = 0; x < region.spanX; x++) occupied.add(`${region.x + x},${region.y + y}`)
    }
    return { ...sprite, placedAt: { column: region.x, row: region.y } }
  })
  return { placements, occupied, rows }
}
