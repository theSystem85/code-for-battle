// Shared by startup fallback and the worker: identical integer alpha rounding.
export function applyBlackKey(data, cutoffBrightness = 24, softenBrightness = 48) {
  for (let i = 0; i < data.length; i += 4) {
    const brightness = Math.max(data[i], data[i + 1], data[i + 2])
    if (brightness <= cutoffBrightness) data[i + 3] = 0
    else if (brightness < softenBrightness) {
      const t = (brightness - cutoffBrightness) / (softenBrightness - cutoffBrightness)
      data[i + 3] = Math.round(data[i + 3] * t)
    }
  }
}

const GROUP_TAG = /^group_\d+$/

/**
 * Pixels the edge-connected black key may start from: everything outside the
 * sheet's tile rects (gutters, unused cells), the image border, and each
 * tile's outer edges. Edges shared with another tile of the same multi-tile
 * group are interior seams of one sprite and are not seeded.
 */
export function buildBlackKeySeedMask(width, height, metadata = null) {
  const seeds = new Uint8Array(width * height)
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < width && y < height) seeds[y * width + x] = 1 }
  for (let x = 0; x < width; x++) { mark(x, 0); mark(x, height - 1) }
  for (let y = 0; y < height; y++) { mark(0, y); mark(width - 1, y) }
  const tiles = metadata?.tiles && typeof metadata.tiles === 'object' ? Object.entries(metadata.tiles) : []
  if (!tiles.length) return seeds
  const covered = new Uint8Array(width * height)
  const byCell = new Map()
  const cellOf = (key, tile) => {
    const [col, row] = key.split(',').map(Number)
    return { col: Number.isFinite(tile.col) ? tile.col : col, row: Number.isFinite(tile.row) ? tile.row : row }
  }
  for (const [key, tile] of tiles) {
    if (!tile?.rect) continue
    const { col, row } = cellOf(key, tile)
    byCell.set(`${col},${row}`, (tile.tags || []).find(tag => GROUP_TAG.test(tag)) || null)
    const { x, y, width: w, height: h } = tile.rect
    for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
      covered.fill(1, py * width + Math.max(0, x), py * width + Math.min(width, x + w))
    }
  }
  for (let i = 0; i < covered.length; i++) if (!covered[i]) seeds[i] = 1
  for (const [key, tile] of tiles) {
    if (!tile?.rect) continue
    const { col, row } = cellOf(key, tile)
    const group = byCell.get(`${col},${row}`)
    const sameGroup = (dc, dr) => Boolean(group) && byCell.get(`${col + dc},${row + dr}`) === group
    const { x, y, width: w, height: h } = tile.rect
    if (!sameGroup(0, -1)) for (let px = x; px < x + w; px++) mark(px, y)
    if (!sameGroup(0, 1)) for (let px = x; px < x + w; px++) mark(px, y + h - 1)
    if (!sameGroup(-1, 0)) for (let py = y; py < y + h; py++) mark(x, py)
    if (!sameGroup(1, 0)) for (let py = y; py < y + h; py++) mark(x + w - 1, py)
  }
  return seeds
}

/**
 * Black key that only removes dark background connected to a seed (the
 * sprite's outer edge). Dark or black pixels enclosed by a sprite's
 * silhouette keep their alpha. Same alpha curve as applyBlackKey.
 */
export function applyEdgeConnectedBlackKey(data, width, height, cutoffBrightness = 24, softenBrightness = 48, seeds = null) {
  const total = width * height
  const mask = seeds || buildBlackKeySeedMask(width, height)
  const dark = index => data[index * 4 + 3] === 0 || Math.max(data[index * 4], data[index * 4 + 1], data[index * 4 + 2]) < softenBrightness
  const reached = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0
  for (let index = 0; index < total; index++) {
    if (mask[index] && dark(index)) { reached[index] = 1; queue[tail++] = index }
  }
  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const visit = next => { if (!reached[next] && dark(next)) { reached[next] = 1; queue[tail++] = next } }
    if (x > 0) visit(index - 1)
    if (x + 1 < width) visit(index + 1)
    if (index >= width) visit(index - width)
    if (index + width < total) visit(index + width)
  }
  for (let index = 0; index < tail; index++) {
    const i = queue[index] * 4
    const brightness = Math.max(data[i], data[i + 1], data[i + 2])
    if (brightness <= cutoffBrightness) data[i + 3] = 0
    else if (brightness < softenBrightness) {
      const t = (brightness - cutoffBrightness) / (softenBrightness - cutoffBrightness)
      data[i + 3] = Math.round(data[i + 3] * t)
    }
  }
  return tail
}
