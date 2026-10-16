// Toggle imported sprites as one logical selection, including partially tagged imports.
export function toggleSpriteTag(data, col, row, tag) {
  const sprite = data.extension?.imports?.find(item => col >= item.placedAt.column && row >= item.placedAt.row
    && col < item.placedAt.column + item.tileSpan.columns && row < item.placedAt.row + item.tileSpan.rows)
  const cells = []
  if (sprite) {
    for (let y = 0; y < sprite.tileSpan.rows; y++) {
      for (let x = 0; x < sprite.tileSpan.columns; x++) cells.push(`${sprite.placedAt.column + x},${sprite.placedAt.row + y}`)
    }
  } else cells.push(`${col},${row}`)
  const remove = cells.every(key => data.tiles[key]?.tags?.includes(tag))
  for (const key of cells) {
    const entry = data.tiles[key] || { tags: [] }
    entry.tags = entry.tags.filter(value => value !== tag)
    if (!remove) entry.tags.push(tag)
    if (entry.tags.length) data.tiles[key] = entry
    else delete data.tiles[key]
  }
  if (sprite) sprite.tags = [...new Set(cells.flatMap(key => data.tiles[key]?.tags || []))]
  return cells
}
