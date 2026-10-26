import { applyEdgeConnectedBlackKey, buildBlackKeySeedMask } from '../../../src/rendering/blackKeyPixels.js'

export const PIXEL_RULES_VERSION = 1
export const BLACK_KEY = Object.freeze({ cutoff: 24, soften: 48 })
export const DECORATION_CUTOUT = Object.freeze({
  keyInner: 18,
  keyOuter: 48,
  uniformBorderMaxSpread: 22,
  featherPixels: 10,
  filledFeatherRatio: 0.55
})

const median = values => values.length ? values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)] : 0
const smoothstep = (from, to, value) => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - (2 * t))
}
const edgeNoise = (x, y) => 0.5 + (0.25 * Math.sin((x * 0.11) + (y * 0.07))) + (0.25 * Math.sin((x * 0.05) - (y * 0.13) + 1.7))

function borderFlood(data, width, height, background) {
  const reached = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  const visit = index => {
    if (!reached[index] && background(index)) {
      reached[index] = 1
      queue[tail++] = index
    }
  }
  for (let x = 0; x < width; x++) { visit(x); visit(((height - 1) * width) + x) }
  for (let y = 0; y < height; y++) { visit(y * width); visit((y * width) + width - 1) }
  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    if (x) visit(index - 1)
    if (x + 1 < width) visit(index + 1)
    if (index >= width) visit(index - width)
    if (index + width < width * height) visit(index + width)
  }
  return reached
}

// Byte-for-byte port of decorationCutout's pure mask rules. Keeping the build
// implementation DOM-free lets fixtures exercise it in Node.
export function applyDecorationCutout(data, width, height, { cellSize = 64, innerCuts = false } = {}) {
  const rs = []; const gs = []; const bs = []
  const sample = (x, y) => {
    const index = ((y * width) + x) * 4
    if (data[index + 3] < 200) return
    rs.push(data[index]); gs.push(data[index + 1]); bs.push(data[index + 2])
  }
  for (let x = 0; x < width; x += 2) for (let distance = 1; distance <= 3; distance++) {
    sample(x, Math.min(distance, height - 1)); sample(x, Math.max(0, height - 1 - distance))
  }
  for (let y = 0; y < height; y += 2) for (let distance = 1; distance <= 3; distance++) {
    sample(Math.min(distance, width - 1), y); sample(Math.max(0, width - 1 - distance), y)
  }
  const ground = [median(rs), median(gs), median(bs)]
  const spread = median(rs.map((red, index) => Math.abs(red - ground[0]) + Math.abs(gs[index] - ground[1]) + Math.abs(bs[index] - ground[2])))
  const keyGround = spread <= DECORATION_CUTOUT.uniformBorderMaxSpread
  const distance = index => {
    const offset = index * 4
    return Math.hypot(data[offset] - ground[0], data[offset + 1] - ground[1], data[offset + 2] - ground[2])
  }
  const background = keyGround && !innerCuts
    ? borderFlood(data, width, height, index => !data[index * 4 + 3] || distance(index) < DECORATION_CUTOUT.keyOuter)
    : null
  let alphaSum = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = (y * width) + x
    const offset = pixel * 4
    if (!data[offset + 3]) continue
    const keep = (innerCuts && keyGround) || background?.[pixel]
      ? smoothstep(DECORATION_CUTOUT.keyInner, DECORATION_CUTOUT.keyOuter, distance(pixel))
      : 1
    const edge = Math.min(y, height - 1 - y, x, width - 1 - x)
    const featherWidth = keyGround ? DECORATION_CUTOUT.featherPixels : cellSize * DECORATION_CUTOUT.filledFeatherRatio * (0.55 + (0.45 * edgeNoise(x, y)))
    data[offset + 3] = Math.round(data[offset + 3] * keep * smoothstep(0, featherWidth, edge))
    alphaSum += data[offset + 3]
  }
  return { coverage: alphaSum / (width * height * 255), keyGround }
}

export function applySheetPixelRules(data, width, height, metadata) {
  if (metadata.blendMode !== 'black') return 0
  const seeds = buildBlackKeySeedMask(width, height, metadata)
  return applyEdgeConnectedBlackKey(data, width, height, BLACK_KEY.cutoff, BLACK_KEY.soften, seeds)
}
