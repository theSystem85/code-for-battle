const DEG_TO_RADIANS = Math.PI / 180
const CACHE_PADDING = 36
const MASK_SIZE = 96

const shadowCache = new Map()
const shadowSources = new Map()
let cacheRevision = 0

export function getUnitShadowOffset(offset, directionDegrees, footprint) {
  const distance = Math.max(0, Number(offset) || 0) * Math.max(0, Number(footprint) || 0)
  const radians = (Number(directionDegrees) || 0) * DEG_TO_RADIANS
  return {
    x: Math.cos(radians) * distance,
    y: -Math.sin(radians) * distance
  }
}

function makeCanvas(width, height) {
  if (typeof globalThis.OffscreenCanvas === 'function') return new globalThis.OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function normalizedSettings(settings) {
  return {
    offset: Math.max(0, Number(settings.offset) || 0),
    direction: Number(settings.direction) || 45,
    startStretch: Math.max(0.1, Number(settings.startStretch) || 1),
    endStretch: Math.max(0.1, Number(settings.endStretch) || 1.35),
    size: Math.max(0.1, Number(settings.size) || 1),
    opacity: Math.min(1, Math.max(0, Number(settings.opacity) || 0)),
    blur: Math.max(0, Number(settings.blur) || 0)
  }
}

export function createUnitShadowCanvas(drawMask, footprint, rawSettings) {
  const settings = normalizedSettings(rawSettings)
  const extent = Math.ceil(footprint * (settings.size * Math.max(settings.startStretch, settings.endStretch) + settings.offset + 1) + CACHE_PADDING * 2)
  const canvas = makeCanvas(extent, extent)
  const ctx = canvas.getContext('2d')
  const mask = makeCanvas(MASK_SIZE, MASK_SIZE)
  const maskCtx = mask.getContext('2d')
  drawMask(maskCtx, MASK_SIZE / 2, MASK_SIZE / 2)
  maskCtx.globalCompositeOperation = 'source-in'
  maskCtx.fillStyle = '#080c0e'
  maskCtx.fillRect(0, 0, MASK_SIZE, MASK_SIZE)

  const offset = getUnitShadowOffset(settings.offset, settings.direction, footprint)
  const center = extent / 2
  const steps = Math.max(2, Math.ceil(Math.hypot(offset.x, offset.y) / 3))
  ctx.save()
  ctx.globalAlpha = settings.opacity
  ctx.filter = settings.blur ? `blur(${settings.blur}px)` : 'none'
  for (let step = 0; step <= steps; step++) {
    const progress = step / steps
    const stretch = settings.startStretch + (settings.endStretch - settings.startStretch) * progress
    const width = footprint * settings.size * stretch
    const height = footprint * settings.size
    ctx.drawImage(mask, center + offset.x * progress - width / 2, center + offset.y * progress - height / 2, width, height)
  }
  ctx.restore()
  return canvas
}

function buildEntry(type, drawMask, footprint, settings) {
  return {
    image: createUnitShadowCanvas(drawMask, footprint, settings),
    revision: cacheRevision,
    footprint
  }
}

export function drawCachedUnitShadow(ctx, type, centerX, centerY, footprint, drawMask, getSettings) {
  if (!shadowSources.has(type)) shadowSources.set(type, { drawMask, footprint })
  let entry = shadowCache.get(type)
  if (!entry || entry.revision !== cacheRevision) {
    entry = buildEntry(type, drawMask, footprint, getSettings())
    shadowCache.set(type, entry)
  }
  ctx.drawImage(entry.image, centerX - entry.image.width / 2, centerY - entry.image.height / 2)
}

export function rebuildUnitShadowCaches(settings) {
  cacheRevision++
  shadowCache.clear()
  for (const [type, source] of shadowSources) {
    shadowCache.set(type, buildEntry(type, source.drawMask, source.footprint, settings))
  }
}

export function getUnitShadowCacheStats() {
  return { revision: cacheRevision, entries: shadowCache.size, sources: shadowSources.size }
}

export function clearUnitShadowCaches() {
  shadowCache.clear()
  shadowSources.clear()
  cacheRevision++
}
