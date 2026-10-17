// Cuts decorative sprites out of their painted ground so they sit on the
// default organic terrain without visible square patches.
//
// Each multi-tile group is composed into one canvas. The ground colour is
// estimated from the group's outer border; pixels close to it that are
// connected to that border become transparent (soft threshold), so ground-
// coloured or dark detail inside the sprite is kept. The outer border is feathered so any
// remaining ground blends in. Interior seams between cells are untouched.

const KEY_INNER = 18 // colour distance below which a pixel is fully ground
const KEY_OUTER = 48 // colour distance above which a pixel is fully kept
// When the border is not a uniform ground colour (a forest that fills the
// whole footprint), keying would eat the sprite, so only feather it.
const UNIFORM_BORDER_MAX_SPREAD = 22
const FEATHER_PX = 10
// Sprites that fill their footprint (forests) get a wide, irregular fade so
// the outline reads as an organic patch instead of a square.
const FILLED_FEATHER_RATIO = 0.55

function edgeNoise(x, y) {
  return 0.5 + (0.25 * Math.sin((x * 0.11) + (y * 0.07))) + (0.25 * Math.sin((x * 0.05) - (y * 0.13) + 1.7))
}

function createCanvas(width, height) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext?.('2d', { willReadFrequently: true })
  return ctx ? { canvas, ctx } : null
}

function median(values) {
  if (!values.length) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Pixels connected to the image border through `isBackground` pixels (4-neighbour). */
export function floodBorderBackground(data, width, height, isBackground) {
  const total = width * height
  const reached = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0
  const visit = index => { if (!reached[index] && isBackground(index)) { reached[index] = 1; queue[tail++] = index } }
  for (let x = 0; x < width; x++) { visit(x); visit(((height - 1) * width) + x) }
  for (let y = 0; y < height; y++) { visit(y * width); visit((y * width) + width - 1) }
  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    if (x > 0) visit(index - 1)
    if (x + 1 < width) visit(index + 1)
    if (index >= width) visit(index - width)
    if (index + width < total) visit(index + width)
  }
  return reached
}

export function cutoutDecorationGroup(group, cellSize = 64) {
  if (!group?.tilesByOffset || !group.width || !group.height) return group
  const width = group.width * cellSize
  const height = group.height * cellSize
  const target = createCanvas(width, height)
  if (!target) return group
  const { canvas, ctx } = target
  let drawn = 0
  for (let gy = 0; gy < group.height; gy++) {
    for (let gx = 0; gx < group.width; gx++) {
      const tile = group.tilesByOffset[`${gx},${gy}`]
      if (!tile?.image || !tile.rect) continue
      try {
        ctx.drawImage(tile.image, tile.rect.x, tile.rect.y, tile.rect.width, tile.rect.height, gx * cellSize, gy * cellSize, cellSize, cellSize)
        drawn++
      } catch {
        return group
      }
    }
  }
  if (!drawn) return group

  let imageData
  try {
    imageData = ctx.getImageData(0, 0, width, height)
  } catch {
    return group
  }
  const data = imageData.data

  // Ground colour from a 3 px band along the outer border.
  const rs = []; const gs = []; const bs = []
  const sample = (x, y) => {
    const i = ((y * width) + x) * 4
    if (data[i + 3] < 200) return
    rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2])
  }
  for (let x = 0; x < width; x += 2) {
    for (let d = 1; d <= 3; d++) { sample(x, d); sample(x, height - 1 - d) }
  }
  for (let y = 0; y < height; y += 2) {
    for (let d = 1; d <= 3; d++) { sample(d, y); sample(width - 1 - d, y) }
  }
  const ground = [median(rs), median(gs), median(bs)]
  const spread = median(rs.map((r, i) => Math.abs(r - ground[0]) + Math.abs(gs[i] - ground[1]) + Math.abs(bs[i] - ground[2])))
  const keyGround = spread <= UNIFORM_BORDER_MAX_SPREAD

  const groundDistance = index => {
    const i = index * 4
    const dr = data[i] - ground[0]
    const dg = data[i + 1] - ground[1]
    const db = data[i + 2] - ground[2]
    return Math.sqrt((dr * dr) + (dg * dg) + (db * db))
  }
  // Key only ground connected to the group's outer border; ground-coloured
  // or dark pixels enclosed by the sprite are part of it and stay opaque.
  // Sprites tagged inner_cuts (crowns, fences, arches) also key enclosed ground.
  const innerCuts = group.tagSet instanceof Set
    ? group.tagSet.has('inner_cuts')
    : Object.values(group.tilesByOffset).some(tile => tile?.tags?.includes('inner_cuts'))
  const background = keyGround && !innerCuts ? floodBorderBackground(data, width, height, index => !data[index * 4 + 3] || groundDistance(index) < KEY_OUTER) : null

  let alphaSum = 0
  for (let y = 0; y < height; y++) {
    const edgeY = Math.min(y, height - 1 - y)
    for (let x = 0; x < width; x++) {
      const i = ((y * width) + x) * 4
      if (!data[i + 3]) continue
      const keep = (innerCuts && keyGround) || background?.[(y * width) + x] ? smoothstep(KEY_INNER, KEY_OUTER, groundDistance((y * width) + x)) : 1
      const edge = Math.min(edgeY, x, width - 1 - x)
      const featherWidth = keyGround
        ? FEATHER_PX
        : cellSize * FILLED_FEATHER_RATIO * (0.55 + (0.45 * edgeNoise(x, y)))
      const feather = smoothstep(0, featherWidth, edge)
      data[i + 3] = Math.round(data[i + 3] * keep * feather)
      alphaSum += data[i + 3]
    }
  }
  ctx.putImageData(imageData, 0, 0)

  const tilesByOffset = {}
  Object.entries(group.tilesByOffset).forEach(([key, tile]) => {
    const [gx, gy] = key.split(',').map(Number)
    tilesByOffset[key] = {
      ...tile,
      image: canvas,
      rect: { x: gx * cellSize, y: gy * cellSize, width: cellSize, height: cellSize }
    }
  })
  // Share of the footprint that stays opaque: high values mean the sprite is
  // mostly painted ground (a clearing or path) rather than a prop.
  const coverage = alphaSum / (width * height * 255)
  return { ...group, tilesByOffset, cutout: true, coverage }
}
