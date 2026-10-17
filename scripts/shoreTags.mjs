// The shore sheet uses reviewed coordinates; preserve movement/group tags.
export function shoreSpriteTags(tags, col, row) {
  if (!tags.includes('shore')) return tags
  const kind = row === 3 ? 'offshore' : row === 2 && col >= 2 ? 'shore_trans' : 'onshore'
  const biomeBound = row === 0 || (row === 1 && (col === 0 || col >= 4)) || (row === 3 && col === 0)
  const result = tags.filter(tag => !['onshore', 'offshore', 'shore_trans'].includes(tag) &&
    !(biomeBound && ['universal', 'snow'].includes(tag)))
  result.push(kind)
  if (biomeBound) for (const biome of row === 1 && col >= 4 ? ['grass', 'soil'] : ['grass', 'soil', 'sand']) {
    if (!result.includes(biome)) result.push(biome)
  }
  return result
}

export function tagShoreSheet(sheet) {
  for (const [key, tile] of Object.entries(sheet.tiles)) {
    const [col, row] = key.split(',').map(Number)
    tile.tags = shoreSpriteTags(tile.tags, col, row)
  }
  for (const prop of sheet.propLayout || []) prop.tags = shoreSpriteTags(prop.tags, prop.col, prop.row)
  sheet.tags = [...new Set(Object.values(sheet.tiles).flatMap(tile => tile.tags))].filter(tag => !tag.startsWith('group_')).sort()
  return sheet
}
