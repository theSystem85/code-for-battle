// Browser-independent VP8L literal encoder. Fixed Huffman codes deliberately
// trade compression ratio for bounded memory and exact RGBA preservation.
export function encodeLosslessWebP({ width, height, data }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16383 || height > 16383 || width * height > 16777216 || data.length !== width * height * 4) throw new Error('Invalid RGBA image.')
  const bytes = new Uint8Array(data.length + 256)
  let bit = 0
  const write = (value, count) => {
    for (let i = 0; i < count; i++, bit++) bytes[bit >> 3] |= ((value >>> i) & 1) << (bit & 7)
  }
  const reverse = value => {
    let result = 0
    for (let i = 0; i < 8; i++) result = (result << 1) | ((value >> i) & 1)
    return result
  }
  write(0x2f, 8)
  write(width - 1, 14)
  write(height - 1, 14)
  write(1, 1) // Alpha may be present.
  write(0, 3) // Version.
  write(0, 1) // No transforms.
  write(0, 1) // No colour cache.
  write(0, 1) // One Huffman group.
  for (let channel = 0; channel < 4; channel++) {
    write(0, 1) // Normal Huffman tree.
    write(8, 4) // Twelve code-length alphabet entries, through symbol 8.
    const order = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8]
    for (const symbol of order) write(symbol === 0 || symbol === 8 ? 1 : 0, 3)
    write(0, 1) // Describe the entire alphabet.
    const count = channel === 0 ? 280 : 256
    for (let i = 0; i < count; i++) write(i < 256 ? 1 : 0, 1)
  }
  write(1, 1) // Simple distance tree, single unused symbol zero.
  write(0, 1)
  write(0, 1)
  write(0, 1)
  for (let i = 0; i < data.length; i += 4) {
    write(reverse(data[i + 1]), 8)
    write(reverse(data[i]), 8)
    write(reverse(data[i + 2]), 8)
    write(reverse(data[i + 3]), 8)
  }
  const size = Math.ceil(bit / 8)
  const output = new Uint8Array(20 + size + (size & 1))
  const header = new DataView(output.buffer)
  output.set([82, 73, 70, 70], 0)
  header.setUint32(4, output.length - 8, true)
  output.set([87, 69, 66, 80, 86, 80, 56, 76], 8)
  header.setUint32(16, size, true)
  output.set(bytes.subarray(0, size), 20)
  return output
}

export function exportOptions({ lossless = true, quality = 85 } = {}) {
  if (typeof lossless !== 'boolean' || !Number.isFinite(quality) || quality < 0 || quality > 100) throw new Error('Quality must be between 0 and 100.')
  return lossless ? { lossless: true } : { lossless: false, quality }
}

export function compressionLabel(compression) {
  if (compression?.lossless === true) return 'lossless'
  if (compression?.lossless === false && Number.isFinite(compression.quality)) return `lossy ${compression.quality}%`
  return 'unknown'
}

export function detectWebPCompression(buffer) {
  const bytes = new Uint8Array(buffer)
  const text = offset => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (text(0) !== 'RIFF' || text(8) !== 'WEBP') return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = text(offset)
    if (kind === 'VP8L') return { lossless: true }
    if (kind === 'VP8 ') return { lossless: false } // Encoder quality is not stored in WebP.
    const size = view.getUint32(offset + 4, true)
    offset += 8 + size + (size & 1)
  }
  return undefined
}

export function exportMetadata(metadata, name, options = {}) {
  const { tileSize, rowHeight = tileSize, borderWidth = 0 } = metadata
  const sprites = Object.entries(metadata.tiles || {}).map(([key, entry]) => {
    const [col, row] = key.split(',').map(Number)
    return { tiles: { col, row, cols: 1, rows: 1 }, px: entry.rect || { x: col * tileSize + borderWidth, y: row * rowHeight + borderWidth, width: tileSize - 2 * borderWidth, height: rowHeight - 2 * borderWidth }, tags: entry.tags || [] }
  })
  for (const item of metadata.extension?.imports || []) {
    const tags = new Set(item.tags || [])
    for (let dy = 0; dy < item.tileSpan.rows; dy++) {
      for (let dx = 0; dx < item.tileSpan.columns; dx++) {
        for (const tag of metadata.tiles?.[`${item.placedAt.column + dx},${item.placedAt.row + dy}`]?.tags || []) tags.add(tag)
      }
    }
    const rect = item.renderRect || { x: borderWidth, y: borderWidth, width: item.bbox.width, height: item.bbox.height }
    sprites.push({ id: item.id, anchor: item.anchor || 'center', tiles: { col: item.placedAt.column, row: item.placedAt.row, cols: item.tileSpan.columns, rows: item.tileSpan.rows }, px: { ...rect, x: item.placedAt.column * tileSize + rect.x, y: item.placedAt.row * rowHeight + rect.y }, tags: [...tags] })
  }
  return { ...metadata, name, sheetPath: `${name}.webp`, compression: exportOptions(options), grid: { tileSize, rowHeight, borderWidth, cols: metadata.columns, rows: metadata.rows }, sprites }
}

// Mutates only the explicitly requested tiles. Intersecting imported sprite
// records are removed entirely because their original rectangle is no longer valid.
export function clearTargetTiles(target, cells, background = '#000') {
  const keys = new Set()
  for (const { col, row } of cells) {
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= target.columns || row >= target.rows) throw new Error('Tile outside target grid.')
    keys.add(`${col},${row}`)
  }
  const context = target.image.getContext('2d')
  context.save()
  context.globalAlpha = 1
  context.globalCompositeOperation = 'source-over'
  if (background !== null) context.fillStyle = background
  for (const key of keys) {
    const [col, row] = key.split(',').map(Number)
    if (background === null) context.clearRect(col * target.tileSize, row * target.rowHeight, target.tileSize, target.rowHeight)
    else context.fillRect(col * target.tileSize, row * target.rowHeight, target.tileSize, target.rowHeight)
    target.occupied.delete(key)
    delete target.data.tiles[key]
  }
  context.restore()
  target.imports = target.imports.filter(item => {
    for (let dy = 0; dy < item.tileSpan.rows; dy++) {
      for (let dx = 0; dx < item.tileSpan.columns; dx++) {
        if (keys.has(`${item.placedAt.column + dx},${item.placedAt.row + dy}`)) return false
      }
    }
    return true
  })
  return [...keys].map(key => { const [col, row] = key.split(',').map(Number); return { col, row } })
}
