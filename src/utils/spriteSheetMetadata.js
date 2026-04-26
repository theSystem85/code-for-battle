export function expandCompactSpriteSheetMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return metadata
  if (metadata.tiles && typeof metadata.tiles === 'object') return metadata
  if (!Array.isArray(metadata.tileEntries)) return metadata

  const tileSize = Number.isFinite(metadata.tileSize) ? Math.max(1, Math.floor(metadata.tileSize)) : 64
  const rowHeight = Number.isFinite(metadata.rowHeight) ? Math.max(1, Math.floor(metadata.rowHeight)) : tileSize
  const borderWidth = Number.isFinite(metadata.borderWidth) ? Math.max(0, Math.floor(metadata.borderWidth)) : 0
  const sourceTileWidth = Math.max(1, tileSize - (borderWidth * 2))
  const sourceTileHeight = Math.max(1, rowHeight - (borderWidth * 2))
  const tags = Array.isArray(metadata.tags) ? metadata.tags : []
  const hashes = Array.isArray(metadata.hashes) ? metadata.hashes : []

  const tiles = {}
  metadata.tileEntries.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 3) return
    const col = Number.parseInt(entry[0], 10)
    const row = Number.parseInt(entry[1], 10)
    const tagIndexes = Array.isArray(entry[2]) ? entry[2] : []
    const hashIndex = Number.parseInt(entry[3], 10)
    const parsedSourceCol = Number.parseInt(entry[4], 10)
    const parsedSourceRow = Number.parseInt(entry[5], 10)
    const sourceCol = Number.isFinite(parsedSourceCol) ? parsedSourceCol : col
    const sourceRow = Number.isFinite(parsedSourceRow) ? parsedSourceRow : row
    if (!Number.isFinite(col) || !Number.isFinite(row)) return

    const resolvedTags = tagIndexes
      .map(index => tags[index])
      .filter(Boolean)

    if (!resolvedTags.length) return

    const key = `${col},${row}`
    tiles[key] = {
      tags: [...new Set(resolvedTags)],
      hash: Number.isFinite(hashIndex) ? hashes[hashIndex] : undefined,
      rect: {
        x: (sourceCol * tileSize) + borderWidth,
        y: (sourceRow * rowHeight) + borderWidth,
        width: sourceTileWidth,
        height: sourceTileHeight
      },
      col,
      row,
      sourceCol,
      sourceRow
    }
  })

  return {
    ...metadata,
    tiles
  }
}

export function hasTaggedSpriteSheetTiles(metadata) {
  if (!metadata || typeof metadata !== 'object') return false
  if (Array.isArray(metadata.tileEntries) && metadata.tileEntries.length > 0) return true
  if (!metadata.tiles || typeof metadata.tiles !== 'object') return false
  return Object.values(metadata.tiles).some(tile => Array.isArray(tile?.tags) && tile.tags.length > 0 && tile.rect)
}
