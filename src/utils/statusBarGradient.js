// Shared fill and rail for in-world status bars.
//
// The sidebar energy bar is a linear ramp that starts on a darker color and
// lightens at the far end. In-world bars keep their existing base color and
// apply that same shape across the FILLED portion only: about 22% toward
// black at the start of the fill, 40% toward white at the growing edge.
//
// Rectangular fills and rails are cached sprites. Later frames do not call
// createLinearGradient and do not allocate a gradient or color string.
// WebGL and WebGPU draw terrain only; these bars stay on the 2D overlay.

export const STATUS_BAR_START_BLACK_MIX = 0.22
export const STATUS_BAR_LEADING_WHITE_MIX = 0.4
export const STATUS_BAR_GLOSS_EXTRA_WHITE = 0.16
export const STATUS_BAR_ARC_SEGMENTS = 8
export const STATUS_BAR_RAIL_EDGE = 'rgba(0, 0, 0, 0.95)'
export const STATUS_BAR_RAIL_INNER = 'rgba(28, 30, 34, 0.9)'

const SPRITE_LENGTH = 64
const RAIL_BODY = 'rgba(14, 16, 20, 0.78)'
const RAIL_SHADE = 'rgba(0, 0, 0, 0.5)'

const sprites = {
  horizontal: new Map(),
  vertical: new Map(),
  glossHorizontal: new Map(),
  glossVertical: new Map()
}
const arcColors = new Map()
const railByHeight = new Map()
let railBodySprite = null

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

export function mixTowardBlack(color, amount) {
  const keep = 1 - clamp01(amount)
  return {
    r: clampByte(color.r * keep),
    g: clampByte(color.g * keep),
    b: clampByte(color.b * keep),
    a: color.a
  }
}

export function colorToCss(color) {
  if (color.a >= 0.999) return `rgb(${color.r}, ${color.g}, ${color.b})`
  const alpha = Math.round(color.a * 1000) / 1000
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
}

function lerpColor(start, end, t) {
  return {
    r: clampByte(start.r + (end.r - start.r) * t),
    g: clampByte(start.g + (end.g - start.g) * t),
    b: clampByte(start.b + (end.b - start.b) * t),
    a: start.a
  }
}

/** Color at t along the fill: 0 is the darkened start, 1 is the growing edge. */
export function sampleStatusBarFill(
  color,
  t,
  whiteMix = STATUS_BAR_LEADING_WHITE_MIX,
  blackMix = STATUS_BAR_START_BLACK_MIX
) {
  const parsed = parseCssColor(color)
  if (!parsed) return null
  const start = mixTowardBlack(parsed, blackMix)
  const end = mixTowardWhite(parsed, whiteMix)
  return lerpColor(start, end, clamp01(t))
}

export function sampleStatusBarGloss(color, t) {
  const fill = sampleStatusBarFill(color, t)
  if (!fill) return null
  return mixTowardWhite(fill, STATUS_BAR_GLOSS_EXTRA_WHITE)
}

export function linearFillGradientCss(startColor, endColor, angleDeg = 90) {
  return `linear-gradient(${angleDeg}deg, ${startColor} 0%, ${endColor} 100%)`
}

function createCanvas(width, height) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx || typeof ctx.createLinearGradient !== 'function') return null
  return { canvas, ctx }
}

function paintRamp(ctx, direction, startCss, endCss) {
  const vertical = direction === 'vertical'
  const gradient = vertical
    ? ctx.createLinearGradient(0, SPRITE_LENGTH, 0, 0)
    : ctx.createLinearGradient(0, 0, SPRITE_LENGTH, 0)
  gradient.addColorStop(0, startCss)
  gradient.addColorStop(1, endCss)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, vertical ? 1 : SPRITE_LENGTH, vertical ? SPRITE_LENGTH : 1)
}

function createFillSprite(color, direction) {
  const vertical = direction === 'vertical'
  const surface = createCanvas(vertical ? 1 : SPRITE_LENGTH, vertical ? SPRITE_LENGTH : 1)
  if (!surface) return null
  const parsed = parseCssColor(color)
  const start = parsed ? colorToCss(mixTowardBlack(parsed, STATUS_BAR_START_BLACK_MIX)) : color
  const end = parsed ? colorToCss(mixTowardWhite(parsed, STATUS_BAR_LEADING_WHITE_MIX)) : color
  paintRamp(surface.ctx, direction, start, end)
  return surface.canvas
}

function createGlossSprite(color, direction) {
  const parsed = parseCssColor(color)
  if (!parsed) return null
  if (direction === 'vertical') {
    const surface = createCanvas(1, 1)
    if (!surface) return null
    surface.ctx.fillStyle = colorToCss(sampleStatusBarGloss(color, 1))
    surface.ctx.fillRect(0, 0, 1, 1)
    return surface.canvas
  }
  const surface = createCanvas(SPRITE_LENGTH, 1)
  if (!surface) return null
  paintRamp(
    surface.ctx,
    'horizontal',
    colorToCss(sampleStatusBarGloss(color, 0)),
    colorToCss(sampleStatusBarGloss(color, 1))
  )
  return surface.canvas
}

function cachedSprite(bucket, color, create) {
  if (bucket.has(color)) return bucket.get(color)
  const sprite = create()
  bucket.set(color, sprite)
  return sprite
}

export function getStatusBarFillSprite(color, direction = 'horizontal') {
  const bucket = direction === 'vertical' ? sprites.vertical : sprites.horizontal
  return cachedSprite(bucket, color, () => createFillSprite(color, direction))
}

function getGlossSprite(color, direction) {
  const bucket = direction === 'vertical' ? sprites.glossVertical : sprites.glossHorizontal
  return cachedSprite(bucket, color, () => createGlossSprite(color, direction))
}

function createRailSprite(height) {
  const surface = createCanvas(1, height)
  if (!surface) return null
  surface.ctx.fillStyle = RAIL_BODY
  surface.ctx.fillRect(0, 0, 1, height)
  if (height >= 2) {
    surface.ctx.fillStyle = RAIL_SHADE
    surface.ctx.fillRect(0, 0, 1, 1)
  }
  return surface.canvas
}

function getRailSprite(height) {
  const px = Math.max(1, Math.min(8, Math.round(height)))
  if (railByHeight.has(px)) return railByHeight.get(px)
  const sprite = createRailSprite(px)
  railByHeight.set(px, sprite)
  return sprite
}

function getRailBodySprite() {
  if (railBodySprite !== null) return railBodySprite
  const surface = createCanvas(1, 1)
  if (!surface) {
    railBodySprite = null
    return null
  }
  surface.ctx.fillStyle = RAIL_BODY
  surface.ctx.fillRect(0, 0, 1, 1)
  railBodySprite = surface.canvas
  return railBodySprite
}

/**
 * Empty-track background. Dark, slightly transparent, with a darker top pixel.
 * The 1px outline is separate so it can be drawn after the fill.
 */
export function paintStatusBarTrack(ctx, x, y, width, height) {
  if (!ctx || !(width > 0) || !(height > 0)) return
  if (typeof ctx.drawImage === 'function') {
    if (height <= 8) {
      const sprite = getRailSprite(height)
      if (sprite) {
        ctx.drawImage(sprite, x, y, width, height)
        return
      }
    } else {
      const cap = getRailSprite(2)
      const body = getRailBodySprite()
      if (cap && body) {
        ctx.drawImage(cap, 0, 0, 1, 1, x, y, width, 1)
        ctx.drawImage(body, x, y + 1, width, height - 1)
        return
      }
    }
  }
  if (typeof ctx.fillRect === 'function') {
    ctx.fillStyle = '#16181c'
    ctx.fillRect(x, y, width, height)
  }
}

/** Crisp hairline around the existing bar rect. It does not grow the bar. */
export function paintStatusBarOutline(ctx, x, y, width, height) {
  if (!ctx || typeof ctx.strokeRect !== 'function') return
  if (!(width >= 2) || !(height >= 2)) return
  const previousStyle = ctx.strokeStyle
  const previousWidth = ctx.lineWidth
  ctx.strokeStyle = STATUS_BAR_RAIL_EDGE
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
  ctx.strokeStyle = previousStyle
  ctx.lineWidth = previousWidth
}

/**
 * Fill one status-bar segment. The rect is the filled portion, not the track.
 * Horizontal grows left → right. Vertical grows bottom → top.
 * A 1px gloss line sits on the top edge when the fill is at least 2px tall.
 */
export function fillStatusBar(ctx, x, y, width, height, color, direction = 'horizontal') {
  if (!ctx || !(width > 0) || !(height > 0)) return
  const sprite = getStatusBarFillSprite(color, direction)
  if (sprite && typeof ctx.drawImage === 'function') {
    const horizontal = direction !== 'vertical'
    const gloss = getGlossSprite(color, direction)
    // Horizontal gloss sits one pixel inside the hairline so the border does not cover it.
    if (gloss && horizontal && height >= 3) {
      ctx.drawImage(sprite, x, y + 2, width, height - 2)
      ctx.drawImage(gloss, x, y + 1, width, 1)
      return
    }
    if (gloss && !horizontal && height >= 2) {
      ctx.drawImage(sprite, x, y + 1, width, height - 1)
      ctx.drawImage(gloss, x, y, width, 1)
      return
    }
    ctx.drawImage(sprite, x, y, width, height)
    return
  }
  ctx.fillStyle = color
  if (typeof ctx.fillRect === 'function') ctx.fillRect(x, y, width, height)
}

/**
 * Track, fill, then hairline. ratio is 0–1 along the grow direction.
 */
export function drawStatusBar(ctx, x, y, width, height, ratio, color, direction = 'horizontal') {
  if (!ctx || !(width > 0) || !(height > 0)) return
  paintStatusBarTrack(ctx, x, y, width, height)
  const clamped = clamp01(ratio)
  if (clamped > 0) {
    if (direction === 'vertical') {
      const fillHeight = height * clamped
      fillStatusBar(ctx, x, y + height - fillHeight, width, fillHeight, color, 'vertical')
    } else {
      fillStatusBar(ctx, x, y, width * clamped, height, color, 'horizontal')
    }
  }
  paintStatusBarOutline(ctx, x, y, width, height)
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
      const t = (index + 0.5) / STATUS_BAR_ARC_SEGMENTS
      list[index] = colorToCss(sampleStatusBarFill(color, t))
    }
  }
  arcColors.set(color, list)
  return list
}

/**
 * Empty donut track: dark outer edge with a slightly lighter inner stroke
 * when the arc is thick enough to show both.
 */
export function strokeStatusRailArc(ctx, cx, cy, radius, startAngle, endAngle) {
  const sweep = endAngle - startAngle
  if (!ctx || !(sweep > 0) || !(radius > 0)) return
  const width = ctx.lineWidth || 1
  const previousCap = ctx.lineCap
  const previousStyle = ctx.strokeStyle
  const previousWidth = width
  ctx.strokeStyle = STATUS_BAR_RAIL_EDGE
  ctx.beginPath()
  ctx.arc(cx, cy, radius, startAngle, endAngle)
  ctx.stroke()
  if (width >= 3) {
    ctx.lineWidth = width - 2
    ctx.strokeStyle = STATUS_BAR_RAIL_INNER
    ctx.beginPath()
    ctx.arc(cx, cy, radius, startAngle, endAngle)
    ctx.stroke()
    ctx.lineWidth = previousWidth
  }
  ctx.strokeStyle = previousStyle
  ctx.lineCap = previousCap
}

/**
 * Stroke a donut HUD arc. The sweep darkens at the start and lightens
 * toward the growing end. Thick arcs stay inset so the rail edge remains.
 */
export function strokeStatusArc(ctx, cx, cy, radius, startAngle, endAngle, color) {
  const sweep = endAngle - startAngle
  if (!ctx || !(sweep > 0) || !(radius > 0)) return
  const colors = arcSegmentColors(color)
  const segments = colors.length
  const fullWidth = ctx.lineWidth || 1
  const fillWidth = fullWidth >= 3 ? Math.max(1, fullWidth - 2) : (fullWidth >= 2 ? Math.max(1, fullWidth - 1) : fullWidth)
  const overlap = (Math.max(1, fillWidth) * 0.55) / radius
  const previousCap = ctx.lineCap
  ctx.lineCap = 'butt'
  ctx.lineWidth = fillWidth
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
  ctx.lineWidth = fullWidth
  ctx.lineCap = previousCap
}

export function resetStatusBarGradientCacheForTests() {
  sprites.horizontal.clear()
  sprites.vertical.clear()
  sprites.glossHorizontal.clear()
  sprites.glossVertical.clear()
  arcColors.clear()
  railByHeight.clear()
  railBodySprite = null
}
