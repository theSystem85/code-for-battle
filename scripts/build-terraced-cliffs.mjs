// Offline sprite compiler: generated stone material + shared contour geometry.
// All geometry, lighting and alpha shadows are baked; runtime only blits sprites.
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
const root = new URL('../public/images/terrain/', import.meta.url)
const source = await sharp(new URL('source/terraced-cliffs.png', root).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const canyon = await sharp(new URL('source/terraced-cliffs-canyon.png', root).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const cell = 160, tile = 64, padding = 48, variants = 8, tallCell = 224, tallPadding = 80
const macroBaseY = cell * variants, macroVariantWidth = 2048, macroVariantHeight = 576
const tallBaseY = macroBaseY + macroVariantHeight * Math.ceil(variants / 2)
const atlasWidth = macroVariantWidth * 2, atlasHeight = tallBaseY + tallCell * variants
// Bits run clockwise: NW NE SE SW. Directed lines keep high ground on left.
const points = [[32, 0], [64, 32], [32, 64], [0, 32]]
export const contours = [[], [[0, 3]], [[1, 0]], [[1, 3]], [[2, 1]], [[0, 1], [2, 3]], [[2, 0]], [[2, 3]], [[3, 2]], [[0, 2]], [[3, 0], [1, 2]], [[1, 2]], [[3, 1]], [[0, 1]], [[3, 0]], []]
// Sample solid face and rim only, excluding generated gutters/colored alpha noise.
// Row five contains five broad, front-facing stratified rock variations.
function stone(variant, u, v) {
  if (variant >= 4) {
    const paletteRows = [1, 2, 4, 5]
    const row = paletteRows[variant - 4]
    const px = Math.round((.035 + u * .22) * canyon.info.width)
    const py = Math.round(row * canyon.info.height / 8 + 30 + v * 58)
    const i = (py * canyon.info.width + px) * 4
    return [canyon.data[i], canyon.data[i + 1], canyon.data[i + 2]]
  }
  const w = source.info.width, h = source.info.height
  const px = Math.round((variant * .2 + .025 + u * .15) * w)
  const py = Math.round((.501 + v * .055) * h)
  const i = (py * w + px) * 4
  return [source.data[i], source.data[i + 1], source.data[i + 2]]
}
function sample(variant, u, v) {
  // Identical end strips on every variant avoid material seams as well as cracks.
  const edge = Math.min(u, 1 - u)
  const weight = Math.min(1, edge / .18)
  const a = stone(variant, u, v), b = stone(0, .45 + Math.sin(u * Math.PI * 2) * .025, v)
  return a.map((c, i) => c * weight + b[i] * (1 - weight))
}
async function makeContour(mask, variant, outputCell, outputPadding, heightClass) {
  const out = Buffer.alloc(outputCell * outputCell * 4)
  const paths = contours[mask].map(([a, b]) => {
    const [ax, ay] = points[a], [bx, by] = points[b]
    const curved = Math.abs(a - b) % 2 === 1
    const segments = [], steps = curved ? 12 : 1
    let px = ax, py = ay
    for (let step = 1; step <= steps; step++) {
      const t = step / steps
      const x = curved ? (1 - t) ** 2 * ax + 2 * (1 - t) * t * 32 + t * t * bx : bx
      const y = curved ? (1 - t) ** 2 * ay + 2 * (1 - t) * t * 32 + t * t * by : by
      const length = Math.hypot(x - px, y - py)
      const tx = (x - px) / length, ty = (y - py) / length
      segments.push({ ax: px, ay: py, length, tx, ty, nx: ty, ny: -tx, step: step - 1, steps })
      px = x; py = y
    }
    return segments
  })
  for (let y = 0; y < outputCell; y++) for (let x = 0; x < outputCell; x++) {
    const wx = x - outputPadding + .5, wy = y - outputPadding + .5
    let pixel = [0, 0, 0, 0]
    for (const path of paths) {
      let closest = Infinity, chosen, along
      for (const l of path) {
        const t = Math.max(0, Math.min(l.length, (wx - l.ax) * l.tx + (wy - l.ay) * l.ty))
        const distance = (wx - l.ax - t * l.tx) ** 2 + (wy - l.ay - t * l.ty) ** 2
        if (distance < closest) { closest = distance; chosen = l; along = t }
      }
      const l = chosen
      // Do not round-cap at tile boundaries: adjoining cells supply that half.
      const projected = (wx - l.ax) * l.tx + (wy - l.ay) * l.ty
      if ((l.step === 0 && projected < 0) || (l.step === l.steps - 1 && projected > l.length)) continue
      const u = (l.step + along / l.length) / l.steps
      const rough = Math.sin(Math.PI * u) ** 2 * (Math.sin(u * Math.PI * 6 + variant) * 5 + Math.sin(u * 39 + variant * 2) * 1.5)
      const signed = (wx - l.ax) * l.nx + (wy - l.ay) * l.ny
      const d = Math.sqrt(closest) * Math.sign(signed) - rough
      // Keep the material scale open while retaining the camera's slight tilt:
      // south faces are longest, north faces are shorter, and diagonal/side
      // faces interpolate between those projected depths.
      const southBias = Math.max(0, l.ny)
      const sideBias = Math.abs(l.nx)
      const depth = heightClass === 2
        ? 64 + 44 * southBias + 28 * sideBias
        : 30 + 20 * southBias + 14 * sideBias
      const shadeLength = 6 + Math.max(0, l.nx + l.ny) * 14
      // The contour keeps high ground on its left (negative signed distance).
      // Place the complete wall body inside that rock footprint; otherwise the
      // runtime ownership clip truncates upper and left perimeter faces.
      if (d > 3 && d < 3 + shadeLength) {
        const alpha = Math.round(150 * (1 - (d - 3) / shadeLength) ** 1.5)
        if (alpha > pixel[3]) pixel = [20, 18, 16, alpha]
      }
      if (d >= -depth && d <= 3) {
        const v = Math.max(0, Math.min(1, (3 - d) / (depth + 3)))
        // Keep diagonal strata aligned to screen space so corners do not turn
        // into radial fans, but double the repeat length to avoid the dense
        // vertical bands produced by the old one-tile strip.
        const textureU = l.steps > 1
          ? (((wx % (tile * 2)) + tile * 2) % (tile * 2)) / (tile * 2)
          : u
        const rgb = sample(variant, textureU, v)
        const light = 1.08 - .24 * Math.max(0, l.nx) - .28 * Math.max(0, l.ny) + .03 * Math.max(0, -l.ny)
        const rim = d < 1 ? 1.15 : 1
        pixel = [...rgb.map(c => Math.min(255, Math.round(c * light * rim))), 255]
      }
    }
    const i = (y * outputCell + x) * 4
    for (let c = 0; c < 4; c++) out[i + c] = pixel[c]
  }
  return sharp(out, { raw: { width: outputCell, height: outputCell, channels: 4 } }).png().toBuffer()
}

const layers = [], tiles = {}, macroTiles = {}, tallTiles = {}
for (let mask = 0; mask < 16; mask++) for (let variant = 0; variant < variants; variant++) {
  layers.push({ input: await makeContour(mask, variant, cell, padding, 1), left: mask * cell, top: variant * cell })
  tiles[`${mask},${variant}`] = { col: mask, row: variant, tags: ['rocks', 'impassable', 'cliff', `mask-${mask}`, `variant-${variant}`], rect: { x: mask * cell, y: variant * cell, width: cell, height: cell } }
}

// Long straight runs receive a single continuous wall silhouette. The wall is
// two logical tiles deep and spans one to four contour cells, avoiding
// the repeated vertical seams of one sprite per tile.
async function makeMacro(mask, length, variant) {
  const horizontal = mask === 3 || mask === 12
  const logicalLength = length * tile, logicalCross = tile * 2
  const width = (horizontal ? logicalLength : logicalCross) + padding * 2
  const height = (horizontal ? logicalCross : logicalLength) + padding * 2
  const out = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const wx = x - padding + .5, wy = y - padding + .5
    const along = horizontal ? wx : wy
    if (along < 0 || along > logicalLength) continue
    const u = along / logicalLength
    // Zero displacement at both endpoints guarantees exact joins. Broad waves
    // between them keep multi-tile silhouettes visibly organic.
    const envelope = Math.sin(Math.PI * u) ** 2
    const wave = envelope * (Math.sin(u * Math.PI * (2.4 + variant * .13) + variant) * 8 + Math.sin(u * 31 + variant * 2) * 3)
    const line = tile + wave
    const signed = mask === 3 ? wy - line : mask === 12 ? line - wy : mask === 6 ? line - wx : wx - line
    const rimRough = envelope * (Math.sin(u * 47 + variant * 1.7) * 3 + Math.sin(u * 19) * 2)
    const d = signed - rimRough
    // Use the south-facing macro as the density reference while preserving a
    // shorter north-facing projection and intermediate side projections.
    const directionalDepth = mask === 3 ? 108 : mask === 12 ? 64 : 92
    const wallDepth = Math.max(24, directionalDepth + Math.sin(u * 13 + variant) * 9 + Math.sin(u * 29 + variant * 3) * 6)
    const shadeLength = 22
    let pixel = [0, 0, 0, 0]
    if (d > 3 && d < 3 + shadeLength) {
      pixel = [24, 17, 13, Math.round(145 * (1 - (d - 3) / shadeLength) ** 1.5)]
    }
    if (d >= -wallDepth && d <= 3) {
      const v = Math.max(0, Math.min(1, (3 - d) / (wallDepth + 3)))
      const rgb = sample(variant, u, v)
      const strata = .9 + .1 * Math.sin(v * Math.PI * (10 + variant % 3) + u * 8)
      const light = mask === 12 ? 1.11 : mask === 6 ? 1.04 : mask === 9 ? .84 : .80
      const rim = d < 1 ? 1.14 : 1
      pixel = [...rgb.map(c => Math.min(255, Math.round(c * strata * light * rim))), 255]
    }
    const i = (y * width + x) * 4
    for (let channel = 0; channel < 4; channel++) out[i + channel] = pixel[channel]
  }
  return { data: await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer(), width, height }
}

for (let variant = 0; variant < variants; variant++) {
  const originX = (variant % 2) * macroVariantWidth
  const originY = macroBaseY + Math.floor(variant / 2) * macroVariantHeight
  let horizontalX = originX
  for (const mask of [3, 12]) for (const length of [1, 2, 3, 4]) {
    const macro = await makeMacro(mask, length, variant)
    layers.push({ input: macro.data, left: horizontalX, top: originY })
    macroTiles[`${mask},${length},${variant}`] = { mask, length, variant, rect: { x: horizontalX, y: originY, width: macro.width, height: macro.height } }
    horizontalX += macro.width
  }
  let verticalX = originX
  for (const mask of [6, 9]) for (const length of [1, 2, 3, 4]) {
    const macro = await makeMacro(mask, length, variant)
    layers.push({ input: macro.data, left: verticalX, top: originY + tile * 2 + padding * 2 })
    macroTiles[`${mask},${length},${variant}`] = { mask, length, variant, rect: { x: verticalX, y: originY + tile * 2 + padding * 2, width: macro.width, height: macro.height } }
    verticalX += macro.width
  }
}
// Tall contour cells complete macro runs through corners and short irregular
// sections. A plateau component never mixes these with the short contour pool.
for (let variant = 0; variant < variants; variant++) for (let mask = 0; mask < 16; mask++) {
  const rect = { x: mask * tallCell, y: tallBaseY + variant * tallCell, width: tallCell, height: tallCell }
  layers.push({ input: await makeContour(mask, variant, tallCell, tallPadding, 2), left: rect.x, top: rect.y })
  tallTiles[`${mask},${variant}`] = { mask, variant, heightClass: 2, rect }
}
// Five newly generated transparent crack/chip overlays share the final atlas.
const topPath = new URL('source/plateau-details.png', root).pathname
const topMeta = await sharp(topPath).metadata()
for (let variant = 0; variant < variants; variant++) {
  const detailVariant = variant % 5
  const left = Math.floor(detailVariant * topMeta.width / 5)
  const width = Math.floor((detailVariant + 1) * topMeta.width / 5) - left
  const crop = await sharp(topPath).extract({ left, top: 0, width, height: topMeta.height }).png().toBuffer()
  const detail = await sharp(crop).trim({ threshold: 16 }).resize(tile - 10, tile - 10, { fit: 'inside' }).modulate({ saturation: .2, brightness: .45 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // Remove the generator's near-transparent square haze, then retain a soft
  // but visible crack/stone alpha with a five-pixel logical gutter.
  for (let i = 3; i < detail.data.length; i += 4) {
    const alpha = detail.data[i]
    detail.data[i] = alpha < 48 ? 0 : Math.round(((alpha - 48) / 207) * 165)
  }
  layers.push({ input: await sharp(detail.data, { raw: detail.info }).png().toBuffer(), left: 16 * cell + padding + Math.floor((tile - detail.info.width) / 2), top: variant * cell + padding + Math.floor((tile - detail.info.height) / 2) })
  tiles[`16,${variant}`] = { col: 16, row: variant, tags: ['rocks', 'decorative', 'plateau', `variant-${variant}`], rect: { x: 16 * cell, y: variant * cell, width: cell, height: cell } }
}
const filename = 'terraced-cliffs.webp'
await sharp({ create: { width: atlasWidth, height: atlasHeight, channels: 4, background: '#00000000' } }).composite(layers).webp({ quality: 85, alphaQuality: 100, effort: 6 }).toFile(new URL(filename, root).pathname)
await writeFile(new URL('terraced-cliffs.json', root), JSON.stringify({ schemaVersion: 3, sheetPath: `images/terrain/${filename}`, sheetWidth: atlasWidth, sheetHeight: atlasHeight, tileSize: cell, rowHeight: cell, borderWidth: 0, blendMode: 'alpha', columns: 17, rows: variants, tags: ['rocks', 'impassable', 'cliff'], tiles, macroTiles, tallTiles, cliffLayout: { logicalTileSize: tile, padding, tallCell, tallPadding, tallBaseY, variants, cornerBits: ['NW', 'NE', 'SE', 'SW'], emptyMasks: [0, 15], macroLengths: [1, 2, 3, 4], macroMasks: [3, 6, 9, 12], quality: 85, alphaQuality: 100, contours } }, null, 2) + '\n')
console.log(`Built terraced-cliffs.webp: ${atlasWidth}x${atlasHeight}, short/tall contours and 1-4-cell macro cliffs × ${variants} variants, WebP quality 85 / lossless alpha`)
