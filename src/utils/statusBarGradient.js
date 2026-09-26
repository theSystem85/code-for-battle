// Shared fill for in-world status bars.
//
// The portrait condensed energy bar (and the desktop energy bar) already
// lightens along a linear gradient: full base color at 0%, a lighter color
// at 100% (`linear-gradient(90deg, start 0%, end 100%)` in energyBar.js).
// In-world bars keep whatever base color they already use and apply that
// same 0% → 100% ramp across the FILLED portion only, mixing the base
// toward white by STATUS_BAR_LEADING_WHITE_MIX at the growing edge.
//
// Rectangular fills are one drawImage of a sprite cached per base color and
// direction. Nothing in this path allocates after the first use of a color.
// WebGL and WebGPU draw terrain only; unit and building bars stay on the
// 2D overlay, so this single path is what every backend shows.

export const STATUS_BAR_LEADING_WHITE_MIX = 0.25
export const STATUS_BAR_ARC_SEGMENTS = 8
const SPRITE_LENGTH = 64

const sprites = {
  horizontal: new Map(),
  vertical: new Map()
}
const arcColors = new Map()

function clampByte(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(255, Math.round(value)))
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(1, value))
}

export function parseCssColor(color) {
  if (typeof color !== 'string') return null
  const value = color.trim()
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)
  if (hex) {
    let digits = hex[1]
    if (digits.length <= 4) {
      digits = digits.split('').map(channel => channel + channel).join('')
    }
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1
    }
  }

  const rgb = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i.exec(value)
  if (!rgb) return null
  return {
    r: clampByte(Number(rgb[1])),
    g: clampByte(Number(rgb[2])),
    b: clampByte(Number(rgb[3])),
    a: rgb[4] === undefined ? 1 : clamp01(Number(rgb[4]))
  }
}

export function mixTowardWhite(color, amount) {
  const mix = clamp01(amount)
  return {
    r: clampByte(color.r + (255 - color.r) * mix),
    g: clampByte(color.g + (255 - color.g) * mix),
    b: clampByte(color.b + (255 - color.b) * mix),
    a: color.a
  }
}

export function colorToCss(color) {
  if (color.a >= 0.999) return `rgb(${color.r}, ${color.g}, ${color.b})`
  const alpha = Math.round(color.a * 1000) / 1000
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
}

/** Color at t along the fill: 0 is the base, 1 is the growing edge. */
export function sampleStatusBarFill(color, t, mix = STATUS_BAR_LEADING_WHITE_MIX) {
  const parsed = parseCssColor(color)
  if (!parsed) return null
  return mixTowardWhite(parsed, mix * clamp01(t))
}

export function linearFillGradientCss(startColor, endColor, angleDeg = 90) {
  return `linear-gradient(${angleDeg}deg, ${startColor} 0%, ${endColor} 100%)`
}

function createFillSprite(color, direction) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null
  const vertical = direction === 'vertical'
  const canvas = document.createElement('canvas')
  canvas.width = vertical ? 1 : SPRITE_LENGTH
  canvas.height = vertical ? SPRITE_LENGTH : 1
  const ctx = canvas.getContext('2d')
  if (!ctx || typeof ctx.createLinearGradient !== 'function') return null

  const parsed = parseCssColor(color)
  const start = parsed ? colorToCss(parsed) : color
  const end = parsed ? colorToCss(mixTowardWhite(parsed, STATUS_BAR_LEADING_WHITE_MIX)) : color
  // Gradient vector points at the growing edge: right for horizontal,
  // top for vertical (bottom-to-top fills).
  const gradient = vertical
    ? ctx.createLinearGradient(0, SPRITE_LENGTH, 0, 0)
    : ctx.createLinearGradient(0, 0, SPRITE_LENGTH, 0)
  gradient.addColorStop(0, start)
  gradient.addColorStop(1, end)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas
}

export function getStatusBarFillSprite(color, direction = 'horizontal') {
  const bucket = direction === 'vertical' ? sprites.vertical : sprites.horizontal
  if (bucket.has(color)) return bucket.get(color)
  const sprite = createFillSprite(color, direction)
  bucket.set(color, sprite)
  return sprite
}

/**
 * Fill one status-bar segment. The rect is the filled portion, not the track.
 * Horizontal grows left → right. Vertical grows bottom → top, so the rect's
 * top edge is the lightened leading edge.
 */
export function fillStatusBar(ctx, x, y, width, height, color, direction = 'horizontal') {
  if (!ctx || !(width > 0) || !(height > 0)) return
  const sprite = getStatusBarFillSprite(color, direction)
  if (sprite && typeof ctx.drawImage === 'function') {
    ctx.drawImage(sprite, x, y, width, height)
    return
  }
  ctx.fillStyle = color
  if (typeof ctx.fillRect === 'function') ctx.fillRect(x, y, width, height)
}

function arcSegmentColors(color) {
  const cached = arcColors.get(color)
  if (cached) return cached
  const parsed = parseCssColor(color)
  const list = new Array(STATUS_BAR_ARC_SEGMENTS)
  if (!parsed) {
    list.fill(color)
  } else {
    for (let index = 0; index < STATUS_BAR_ARC_SEGMENTS; index++) {
      const t = ((index + 0.5) / STATUS_BAR_ARC_SEGMENTS) * STATUS_BAR_LEADING_WHITE_MIX
      list[index] = colorToCss(mixTowardWhite(parsed, t))
    }
  }
  arcColors.set(color, list)
  return list
}

/**
 * Stroke a donut HUD arc so the sweep lightens toward its end.
 * Selected-unit arcs are the only caller; unselected bars stay on fillStatusBar.
 */
export function strokeStatusArc(ctx, cx, cy, radius, startAngle, endAngle, color) {
  const sweep = endAngle - startAngle
  if (!ctx || !(sweep > 0) || !(radius > 0)) return
  const colors = arcSegmentColors(color)
  const segments = colors.length
  const overlap = (Math.max(1, ctx.lineWidth || 1) * 0.55) / radius
  const previousCap = ctx.lineCap
  ctx.lineCap = 'butt'
  for (let index = 0; index < segments; index++) {
    const t0 = index / segments
    const t1 = (index + 1) / segments
    const a0 = startAngle + sweep * t0 - (index === 0 ? 0 : overlap)
    const a1 = startAngle + sweep * t1 + (index === segments - 1 ? 0 : overlap)
    ctx.strokeStyle = colors[index]
    ctx.beginPath()
    ctx.arc(cx, cy, radius, a0, a1)
    ctx.stroke()
  }
  ctx.lineCap = previousCap
}

export function resetStatusBarGradientCacheForTests() {
  sprites.horizontal.clear()
  sprites.vertical.clear()
  arcColors.clear()
}
