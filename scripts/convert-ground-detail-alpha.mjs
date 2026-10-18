// Converts the black-matte ground detail sheet into a real alpha sheet.
// Usage: node scripts/convert-ground-detail-alpha.mjs [source.webp] [target.webp]
// The source defaults to the black-matte original from git history if given,
// otherwise to the shipped sheet. Background is only the dark region connected
// to each tile border, so dark detail inside a sprite stays opaque.
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const TARGET = fileURLToPath(new URL('../public/images/map/sprite_sheets/dtv3_ground_detail.webp', import.meta.url))
const source = process.argv[2] || TARGET
const target = process.argv[3] || TARGET
const TILE = 64
const FLOOD_MAX = 56 // brightness below this can belong to the border-connected matte
const EDGE_LOW = 10 // at or below: fully transparent
const EDGE_HIGH = 56 // at or above: fully opaque

const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const { width, height } = info
const rgb = new Float32Array(width * height * 3)
for (let i = 0; i < width * height * 3; i++) rgb[i] = data[i]
const brightness = i => Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])
const smoothstep = v => { const t = Math.max(0, Math.min(1, (v - EDGE_LOW) / (EDGE_HIGH - EDGE_LOW))); return t * t * (3 - 2 * t) }
const alpha = new Float32Array(width * height).fill(1)

for (let ty = 0; ty < height; ty += TILE) for (let tx = 0; tx < width; tx += TILE) {
  const w = Math.min(TILE, width - tx)
  const h = Math.min(TILE, height - ty)
  const seen = new Uint8Array(w * h)
  const queue = []
  const add = (x, y) => {
    const local = y * w + x
    if (seen[local] || brightness((ty + y) * width + tx + x) >= FLOOD_MAX) return
    seen[local] = 1
    queue.push(local)
  }
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1) }
  for (let y = 0; y < h; y++) { add(0, y); add(w - 1, y) }
  for (let head = 0; head < queue.length; head++) {
    const local = queue[head]
    const x = local % w
    const y = (local - x) / w
    alpha[(ty + y) * width + tx + x] = smoothstep(brightness((ty + y) * width + tx + x))
    if (x > 0) add(x - 1, y)
    if (x + 1 < w) add(x + 1, y)
    if (y > 0) add(x, y - 1)
    if (y + 1 < h) add(x, y + 1)
  }
}

// Un-premultiply the black matte from the feathered edge colours.
for (let i = 0; i < width * height; i++) {
  const a = alpha[i]
  if (a > 0 && a < 1) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.min(255, rgb[i * 3 + c] / a)
}

// Bleed opaque colours into transparent pixels so filtering never pulls in black.
let frontier = []
const known = new Uint8Array(width * height)
for (let i = 0; i < width * height; i++) if (alpha[i] > 0) known[i] = 1
for (let pass = 0; pass < 8; pass++) {
  frontier = []
  for (let i = 0; i < width * height; i++) {
    if (known[i]) continue
    const x = i % width
    const y = (i - x) / width
    let r = 0; let g = 0; let b = 0; let n = 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      if (Math.floor(nx / TILE) !== Math.floor(x / TILE) || Math.floor(ny / TILE) !== Math.floor(y / TILE)) continue
      const j = ny * width + nx
      if (!known[j]) continue
      r += rgb[j * 3]; g += rgb[j * 3 + 1]; b += rgb[j * 3 + 2]; n++
    }
    if (n) frontier.push([i, r / n, g / n, b / n])
  }
  for (const [i, r, g, b] of frontier) { rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b; known[i] = 1 }
  if (!frontier.length) break
}

const out = Buffer.alloc(width * height * 4)
for (let i = 0; i < width * height; i++) {
  out[i * 4] = Math.round(rgb[i * 3])
  out[i * 4 + 1] = Math.round(rgb[i * 3 + 1])
  out[i * 4 + 2] = Math.round(rgb[i * 3 + 2])
  out[i * 4 + 3] = Math.round(alpha[i] * 255)
}
// Lossless keeps the alpha edge exact; the sheet is only 384x384.
await sharp(out, { raw: { width, height, channels: 4 } }).webp({ lossless: true, effort: 6 }).toFile(`${target}.tmp`)
const { rename } = await import('node:fs/promises')
await rename(`${target}.tmp`, target)
console.log(`Wrote ${target} (${width}x${height}) with border-connected alpha.`)
