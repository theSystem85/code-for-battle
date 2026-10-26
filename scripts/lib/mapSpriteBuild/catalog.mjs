import { createHash } from 'node:crypto'

export const CATALOG_VERSION = 1
export const ATLAS_VERSION = 1

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export const sha256 = value => createHash('sha256').update(value).digest('hex')

export function metadataSignature(metadata) {
  return sha256(canonicalJson(metadata))
}

export function collectGroups(metadata) {
  const groups = new Map()
  for (const [key, tile] of Object.entries(metadata.tiles || {}).sort()) {
    if (!tile?.rect) continue
    const groupTag = (tile.tags || []).find(tag => /^group_\d+$/.test(tag))
    const id = groupTag || `tile_${key}`
    const current = groups.get(id) || { id, tiles: [], tags: new Set() }
    current.tiles.push({ key, ...tile })
    for (const tag of tile.tags || []) current.tags.add(tag)
    groups.set(id, current)
  }
  return [...groups.values()].map(group => {
    const left = Math.min(...group.tiles.map(tile => tile.rect.x))
    const top = Math.min(...group.tiles.map(tile => tile.rect.y))
    const right = Math.max(...group.tiles.map(tile => tile.rect.x + tile.rect.width))
    const bottom = Math.max(...group.tiles.map(tile => tile.rect.y + tile.rect.height))
    const numericGroupId = /^group_(\d+)$/.exec(group.id)?.[1]
    const savedIdentifiers = (metadata.propLayout || [])
      .filter(item => numericGroupId && String(item.groupId) === numericGroupId)
      .map(item => item.id).filter(Boolean).sort()
    return { id: group.id, savedIdentifiers, tiles: group.tiles, tags: [...group.tags].sort(), rect: { x: left, y: top, width: right - left, height: bottom - top } }
  }).sort((left, right) => left.id.localeCompare(right.id, 'en', { numeric: true }))
}

export function packShelf(items, padding, maxWidth = 2048) {
  let x = 0; let y = 0; let rowHeight = 0; let usedWidth = 0
  const placements = []
  for (const item of items) {
    const packedWidth = item.width + (padding * 2)
    const packedHeight = item.height + (padding * 2)
    if (x > 0 && x + packedWidth > maxWidth) { x = 0; y += rowHeight; rowHeight = 0 }
    placements.push({ ...item, x: x + padding, y: y + padding })
    x += packedWidth
    rowHeight = Math.max(rowHeight, packedHeight)
    usedWidth = Math.max(usedWidth, x)
  }
  return { width: Math.max(1, usedWidth), height: Math.max(1, y + rowHeight), placements }
}
