import { UNIT_PROPERTIES } from '../config.js'

const DEG_TO_RADIANS = Math.PI / 180
const CACHE_PADDING = 36
const MASK_SIZE = 96
const SAMPLING_MARGIN = 2

const shadowCache = new Map()
const shadowSources = new Map()
let cacheRevision = 0

export function usesUnitGroundShadow(unit) {
  return unit?.isAirUnit !== true && UNIT_PROPERTIES[unit?.type]?.isAirUnit !== true
}

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

function getShadowBounds(image) {
  let pixels
  try {
    pixels = image.getContext('2d').getImageData(0, 0, image.width, image.height).data
  } catch (error) {
    if (error.name === 'SecurityError') return { x: 0, y: 0, width: image.width, height: image.height }
    throw error
  }
  let left = image.width
  let top = image.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!pixels[(y * image.width + x) * 4 + 3]) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < 0) return null
  // Retain transparent pixels around the silhouette for fractional sampling.
  left = Math.max(0, left - SAMPLING_MARGIN)
  top = Math.max(0, top - SAMPLING_MARGIN)
  right = Math.min(image.width - 1, right + SAMPLING_MARGIN)
  bottom = Math.min(image.height - 1, bottom + SAMPLING_MARGIN)
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

function buildEntry(drawMask, footprint, settings) {
  const image = createUnitShadowCanvas(drawMask, footprint, settings)
  const bounds = getShadowBounds(image)
  return {
    image,
    bounds,
    drawOffsetX: (bounds?.x ?? 0) - image.width / 2,
    drawOffsetY: (bounds?.y ?? 0) - image.height / 2,
    revision: cacheRevision
  }
}

export function drawCachedUnitShadow(ctx, type, centerX, centerY, footprint, drawMask, getSettings) {
  let entry = shadowCache.get(type)
  if (entry?.revision !== cacheRevision) {
    let source = shadowSources.get(type)
    if (!source) {
      source = { drawMask, footprint }
      shadowSources.set(type, source)
    }
    entry = buildEntry(source.drawMask, source.footprint, getSettings())
    shadowCache.set(type, entry)
  }
  if (!entry.bounds) return
  const { x, y, width, height } = entry.bounds
  ctx.drawImage(entry.image, x, y, width, height, centerX + entry.drawOffsetX, centerY + entry.drawOffsetY, width, height)
}

export function rebuildUnitShadowCaches(settings) {
  cacheRevision++
  shadowCache.clear()
  for (const [type, source] of shadowSources) {
    shadowCache.set(type, buildEntry(source.drawMask, source.footprint, settings))
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
