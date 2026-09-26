export const RADIAL_BUILD_BUDGET_MS = 1000
export const DEFAULT_BUTTON_SIZE = 48
export const DEFAULT_RADIUS = 96
export const DEFAULT_GAP = 8
export const DEFAULT_PADDING = 10
export const DEFAULT_MIN_BUTTON_SIZE = 28
export const MAX_ITEMS_PER_RING = 8

export function resolveRadialTiming(count, options = {}) {
  const total = Math.max(1, count | 0)
  const budget = Number.isFinite(options.budgetMs) ? options.budgetMs : RADIAL_BUILD_BUDGET_MS
  let fly = Number.isFinite(options.duration) ? options.duration : 220
  if (fly < 60) fly = 60
  if (fly > budget) fly = budget
  const room = Math.max(0, budget - fly)
  const requested = Number.isFinite(options.stagger) ? options.stagger : 40
  const stagger = total <= 1 ? 0 : Math.min(Math.max(0, requested), room / (total - 1))
  return {
    flyMs: fly,
    staggerMs: stagger,
    totalMs: fly + stagger * (total - 1)
  }
}

function ringLocals(count, buttonSize, gap, minRadius, maxPerRing) {
  const locals = []
  let remaining = count
  let ring = 0
  let index = 0
  while (remaining > 0) {
    const n = Math.min(maxPerRing, remaining)
    const chord = buttonSize + gap
    const needed = n <= 1
      ? Math.max(minRadius, buttonSize)
      : chord / (2 * Math.sin(Math.PI / n))
    const radius = Math.max(minRadius, needed) + ring * (buttonSize + gap)
    for (let i = 0; i < n; i += 1) {
      const angle = -Math.PI / 2 + (n === 1 ? 0 : (i / n) * Math.PI * 2)
      locals.push({
        index,
        radius,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      })
      index += 1
    }
    remaining -= n
    ring += 1
  }
  return locals
}

function spanOf(locals, buttonSize) {
  const half = buttonSize / 2
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  locals.forEach(point => {
    minX = Math.min(minX, point.x - half)
    minY = Math.min(minY, point.y - half)
    maxX = Math.max(maxX, point.x + half)
    maxY = Math.max(maxY, point.y + half)
  })
  return { spanX: maxX - minX, spanY: maxY - minY }
}

export function layoutRadialItems(count, anchor, options = {}) {
  const desiredSize = Number.isFinite(options.buttonSize) ? options.buttonSize : DEFAULT_BUTTON_SIZE
  const minSize = Number.isFinite(options.minButtonSize) ? options.minButtonSize : DEFAULT_MIN_BUTTON_SIZE
  const gapRatio = (Number.isFinite(options.gap) ? options.gap : DEFAULT_GAP) / Math.max(1, desiredSize)
  const minRadius = Number.isFinite(options.radius) ? options.radius : DEFAULT_RADIUS
  const padding = Number.isFinite(options.padding) ? options.padding : DEFAULT_PADDING
  const maxPerRing = Number.isFinite(options.maxPerRing) ? options.maxPerRing : MAX_ITEMS_PER_RING
  const viewport = options.viewport || { x: 0, y: 0, width: 1280, height: 720 }
  const total = Math.max(0, count | 0)
  const safeAnchor = anchor || { x: 0, y: 0 }

  if (total === 0) {
    return {
      centerX: safeAnchor.x,
      centerY: safeAnchor.y,
      buttonSize: desiredSize,
      points: []
    }
  }

  const availW = Math.max(minSize, viewport.width - padding * 2)
  const availH = Math.max(minSize, viewport.height - padding * 2)
  let buttonSize = desiredSize
  let locals = ringLocals(total, buttonSize, Math.max(4, buttonSize * gapRatio), minRadius * (buttonSize / desiredSize), maxPerRing)
  let guard = 0
  while (guard < 12 && buttonSize > minSize) {
    const span = spanOf(locals, buttonSize)
    if (span.spanX <= availW && span.spanY <= availH) break
    const scale = Math.min(availW / Math.max(1, span.spanX), availH / Math.max(1, span.spanY), 0.92)
    buttonSize = Math.max(minSize, Math.floor(buttonSize * scale))
    locals = ringLocals(total, buttonSize, Math.max(4, buttonSize * gapRatio), minRadius * (buttonSize / desiredSize), maxPerRing)
    guard += 1
  }

  let centerX = safeAnchor.x
  let centerY = safeAnchor.y
  const half = buttonSize / 2
  const left = viewport.x + padding
  const top = viewport.y + padding
  const right = viewport.x + viewport.width - padding
  const bottom = viewport.y + viewport.height - padding

  const bounds = () => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    locals.forEach(point => {
      minX = Math.min(minX, centerX + point.x - half)
      minY = Math.min(minY, centerY + point.y - half)
      maxX = Math.max(maxX, centerX + point.x + half)
      maxY = Math.max(maxY, centerY + point.y + half)
    })
    return { minX, minY, maxX, maxY }
  }

  let box = bounds()
  if (box.minX < left) centerX += left - box.minX
  if (box.minY < top) centerY += top - box.minY
  box = bounds()
  if (box.maxX > right) centerX -= box.maxX - right
  if (box.maxY > bottom) centerY -= box.maxY - bottom

  return {
    centerX,
    centerY,
    buttonSize,
    points: locals.map(point => ({
      index: point.index,
      x: centerX + point.x,
      y: centerY + point.y,
      localX: point.x,
      localY: point.y,
      radius: point.radius
    }))
  }
}

export function hitTestRadial(points, x, y, buttonSize) {
  if (!points || points.length === 0) return null
  const radius = buttonSize / 2
  let best = null
  let bestDistance = Infinity
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]
    const distance = Math.hypot(x - point.x, y - point.y)
    if (distance <= radius && distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best
}
