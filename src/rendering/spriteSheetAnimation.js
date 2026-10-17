import { TILE_SIZE } from '../config.js'
import { getCanvasLogicalSize } from './renderingUtils.js'
import { applyBlackKey, applyEdgeConnectedBlackKey, buildBlackKeySeedMask } from './blackKeyPixels.js'
import { prepareExplosionInWorker } from './explosionPreparation.js'

const FILENAME_PATTERN = /^(\d+)x(\d+)_([0-9]+)x([0-9]+)_.+\.[a-z0-9]+$/i
const BLACK_ALPHA_CUTOFF_BRIGHTNESS = 24
const BLACK_ALPHA_SOFTEN_BRIGHTNESS = 48

const textureCache = new Map()
const sheetAliases = new Map()
const metadataCache = new Map()
const processedImageCache = new WeakMap()
const MAX_SHEET_BYTES = 16 * 1024 * 1024
const MAX_CACHE_BYTES = 64 * 1024 * 1024
const MAX_SHEETS = 32
let reservedBytes = 0

function normalizeBlackKeyConfig(config = null) {
  const cutoffBrightness = Number.isFinite(config?.cutoffBrightness)
    ? Math.max(0, Math.floor(config.cutoffBrightness))
    : BLACK_ALPHA_CUTOFF_BRIGHTNESS
  const softenBrightness = Number.isFinite(config?.softenBrightness)
    ? Math.max(cutoffBrightness + 1, Math.floor(config.softenBrightness))
    : BLACK_ALPHA_SOFTEN_BRIGHTNESS

  return {
    cutoffBrightness,
    softenBrightness
  }
}

export function normalizeSpriteSheetBlendMode(mode) {
  return mode === 'alpha' ? 'alpha' : 'black'
}

function isCanvasTexture(texture) {
  return (typeof window !== 'undefined' && typeof window.HTMLCanvasElement !== 'undefined' && texture instanceof window.HTMLCanvasElement) ||
    (typeof globalThis.ImageBitmap !== 'undefined' && texture instanceof globalThis.ImageBitmap)
}

function isImageTextureReady(texture) {
  if (!texture) return false
  if (isCanvasTexture(texture)) {
    return texture.width > 0 && texture.height > 0
  }
  return Boolean(texture.complete && texture.naturalWidth > 0 && texture.naturalHeight > 0)
}

function getTextureWidth(texture) {
  return isCanvasTexture(texture) ? texture.width : texture.naturalWidth
}

function getTextureHeight(texture) {
  return isCanvasTexture(texture) ? texture.height : texture.naturalHeight
}

function getFilename(path) {
  if (typeof path !== 'string') return ''
  const cleanPath = path.split('?')[0]
  const segments = cleanPath.split('/')
  return segments[segments.length - 1] || ''
}

export function parseSpriteSheetMetadataFromFilename(assetPath) {
  if (metadataCache.has(assetPath)) {
    return metadataCache.get(assetPath)
  }

  const filename = getFilename(assetPath)
  const match = filename.match(FILENAME_PATTERN)
  if (!match) {
    throw new Error(`Invalid sprite sheet filename format: "${filename}"`)
  }

  const tileWidth = Number.parseInt(match[1], 10)
  const tileHeight = Number.parseInt(match[2], 10)
  const columns = Number.parseInt(match[3], 10)
  const rows = Number.parseInt(match[4], 10)
  const frameCount = columns * rows

  if (
    !Number.isFinite(tileWidth) || tileWidth <= 0 ||
    !Number.isFinite(tileHeight) || tileHeight <= 0 ||
    !Number.isFinite(columns) || columns <= 0 ||
    !Number.isFinite(rows) || rows <= 0
  ) {
    throw new Error(`Invalid sprite sheet metadata in filename: "${filename}"`)
  }

  const metadata = {
    tileWidth,
    tileHeight,
    columns,
    rows,
    frameCount
  }

  metadataCache.set(assetPath, metadata)
  return metadata
}

function buildBlackTransparentTexture(image, blackKeyConfig = null, metadata = null) {
  if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return null
  }

  const { cutoffBrightness, softenBrightness } = normalizeBlackKeyConfig(blackKeyConfig)

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return image

  ctx.drawImage(image, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  if (metadata?.tiles) {
    // Map sprite sheets: only background connected to each sprite's outer
    // edge is keyed, so dark detail inside a sprite stays opaque.
    const seeds = buildBlackKeySeedMask(canvas.width, canvas.height, metadata)
    applyEdgeConnectedBlackKey(data, canvas.width, canvas.height, cutoffBrightness, softenBrightness, seeds)
  } else {
    applyBlackKey(data, cutoffBrightness, softenBrightness)
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

// Tag edits that add or remove inner_cuts change the keyed texture.
function innerCutsSignature(metadata) {
  let hash = 0
  let count = 0
  for (const [key, tile] of Object.entries(metadata.tiles || {})) {
    if (!tile?.tags?.includes?.('inner_cuts')) continue
    count++
    for (let i = 0; i < key.length; i++) hash = (Math.imul(hash, 31) + key.charCodeAt(i)) >>> 0
  }
  return count ? `:cuts${count}-${hash.toString(36)}` : ''
}

export function getImageTextureWithBlendMode(image, blendMode = 'black', blackKeyConfig = null, metadata = null) {
  const normalizedBlendMode = normalizeSpriteSheetBlendMode(blendMode)
  if (!image || normalizedBlendMode === 'alpha') {
    return image
  }

  const normalizedBlackKey = blackKeyConfig ? normalizeBlackKeyConfig(blackKeyConfig) : null
  const cacheKey = (normalizedBlackKey ? `black:${normalizedBlackKey.cutoffBrightness}:${normalizedBlackKey.softenBrightness}` : 'black:24:48') +
    (metadata?.tiles ? `:edges${innerCutsSignature(metadata)}` : '')
  const existingByConfig = processedImageCache.get(image)
  const existing = existingByConfig?.get(cacheKey)
  if (existing) {
    return existing
  }

  const processed = buildBlackTransparentTexture(image, normalizedBlackKey, metadata)
  if (processed) {
    const nextCache = existingByConfig || new Map()
    nextCache.set(cacheKey, processed)
    processedImageCache.set(image, nextCache)
  }

  return processed || image
}

export function getSpriteSheetTexture(assetPath, blendMode = 'black') {
  if (!assetPath) return null
  // Render is lookup-only. Startup/editor preparation owns loading and jobs.
  const existing = findSheet(assetPath)
  if (!existing) return null
  return normalizeSpriteSheetBlendMode(blendMode) === 'alpha' ? existing.image : existing.black
}

function sheetURL(assetPath) {
  const source = assetPath.startsWith('/') || assetPath.startsWith('blob:') || assetPath.startsWith('data:') || /^https?:\/\//i.test(assetPath)
    ? assetPath : `/${assetPath}`
  return new URL(source, document.baseURI).href
}

function findSheet(assetPath) {
  const existing = sheetAliases.get(assetPath)
  if (existing) return existing
  const canonical = textureCache.get(sheetURL(assetPath))
  if (canonical) {
    if (sheetAliases.size < MAX_SHEETS * 2) sheetAliases.set(assetPath, canonical)
  }
  return canonical
}

function ensureSheet(assetPath) {
  const existing = findSheet(assetPath)
  if (existing) return existing
  if (textureCache.size >= MAX_SHEETS) return null
  const key = sheetURL(assetPath)
  const img = new Image()
  img.decoding = 'async'
  img.src = key
  const entry = { image: img, black: null, ready: null }
  textureCache.set(key, entry)
  if (sheetAliases.size < MAX_SHEETS * 2) sheetAliases.set(assetPath, entry)
  entry.ready = prepareSheet(entry)
  // Render callers only poll readiness. Startup/editor callers await the same
  // promise and receive errors; no unhandled rejection from a render lookup.
  entry.ready.catch(() => {})
  return entry
}

async function prepareSheet(entry) {
  await entry.image.decode()
  const bytes = entry.image.naturalWidth * entry.image.naturalHeight * 4
  // Account for both the source and processed sheet; no gameplay eviction.
  if (!bytes || bytes > MAX_SHEET_BYTES || reservedBytes + bytes * 2 > MAX_CACHE_BYTES) {
    entry.image.src = ''
    throw new Error('Explosion sheet exceeds the prepared texture byte budget')
  }
  reservedBytes += bytes * 2
  try {
    entry.black = await prepareExplosionInWorker(entry.image)
  } catch {
    // Older Safari/CSP/worker failures use the same pixels during preparation,
    // before publishing the asset. No synchronous conversion in render calls.
  }
  if (!entry.black) entry.black = getImageTextureWithBlendMode(entry.image)
  return entry.black
}

export function prewarmSpriteSheetTexture(assetPath) {
  if (!assetPath) return Promise.resolve(null)
  const entry = ensureSheet(assetPath)
  return entry ? entry.ready : Promise.reject(new Error('Prepared explosion sheet count budget exceeded'))
}

export function createSpriteSheetAnimationInstance({
  assetPath,
  x,
  y,
  startTime,
  duration = 1100,
  durationSeconds,
  loop = false,
  scale = 1,
  frameSequence,
  frameRects,
  tileWidth,
  tileHeight,
  columns,
  rows,
  frameCount,
  blendMode = 'black'
}) {
  let metadata = null
  try {
    metadata = parseSpriteSheetMetadataFromFilename(assetPath)
  } catch {
    metadata = null
  }
  const computedDuration = Number.isFinite(durationSeconds)
    ? Math.max(1, durationSeconds * 1000)
    : duration
  const fallbackColumns = Number.isFinite(columns) ? columns : (metadata?.columns || 1)
  const fallbackRows = Number.isFinite(rows) ? rows : (metadata?.rows || 1)
  const fallbackTileWidth = Number.isFinite(tileWidth) ? tileWidth : (metadata?.tileWidth || 64)
  const fallbackTileHeight = Number.isFinite(tileHeight) ? tileHeight : (metadata?.tileHeight || 64)
  const frameRectsCount = Array.isArray(frameRects) ? frameRects.length : 0
  const fallbackFrameCount = Number.isFinite(frameCount)
    ? frameCount
    : (metadata?.frameCount || (frameRectsCount > 0 ? frameRectsCount : (fallbackColumns * fallbackRows)))

  return {
    type: 'spriteSheet',
    assetPath,
    x,
    y,
    startTime,
    duration: computedDuration,
    loop,
    scale,
    frameSequence: Array.isArray(frameSequence) ? frameSequence : null,
    frameRects: Array.isArray(frameRects) ? frameRects : null,
    tileWidth: fallbackTileWidth,
    tileHeight: fallbackTileHeight,
    columns: fallbackColumns,
    rows: fallbackRows,
    frameCount: fallbackFrameCount,
    blendMode: normalizeSpriteSheetBlendMode(blendMode)
  }
}

export function getAnimationFrameIndex(animation, now) {
  const derivedFrameCount = Array.isArray(animation.frameRects) && animation.frameRects.length
    ? animation.frameRects.length
    : (Array.isArray(animation.frameSequence) && animation.frameSequence.length
      ? animation.frameSequence.length
      : (animation.frameCount || 1))
  const safeFrameCount = Math.max(1, derivedFrameCount)
  const safeDuration = Math.max(1, animation.duration || 1)
  const elapsed = Math.max(0, now - (animation.startTime || 0))

  if (animation.loop) {
    const loopProgress = (elapsed % safeDuration) / safeDuration
    return Math.min(safeFrameCount - 1, Math.floor(loopProgress * safeFrameCount))
  }

  const progress = Math.min(1, elapsed / safeDuration)
  return Math.min(safeFrameCount - 1, Math.floor(progress * safeFrameCount))
}

export function renderSpriteSheetAnimation(ctx, animation, scrollOffset, now) {
  const texture = getSpriteSheetTexture(animation.assetPath, animation.blendMode)
  if (!isImageTextureReady(texture)) {
    return
  }
  const textureWidth = getTextureWidth(texture)
  const textureHeight = getTextureHeight(texture)

  const frameIndex = getAnimationFrameIndex(animation, now)
  let sourceX = 0
  let sourceY = 0
  let sourceTileWidth = 0
  let sourceTileHeight = 0
  if (Array.isArray(animation.frameRects) && animation.frameRects[frameIndex]) {
    const rect = animation.frameRects[frameIndex]
    sourceX = rect.x
    sourceY = rect.y
    sourceTileWidth = rect.width
    sourceTileHeight = rect.height
  } else {
    const sourceFrameIndex = Array.isArray(animation.frameSequence) && Number.isFinite(animation.frameSequence[frameIndex])
      ? animation.frameSequence[frameIndex]
      : frameIndex
    const columns = Math.max(1, animation.columns)
    const sourceColumn = sourceFrameIndex % columns
    const sourceRow = Math.floor(sourceFrameIndex / columns)
    sourceTileWidth = textureWidth / columns
    sourceTileHeight = textureHeight / Math.max(1, animation.rows)
    if (!Number.isFinite(sourceTileWidth) || !Number.isFinite(sourceTileHeight) || sourceTileWidth <= 0 || sourceTileHeight <= 0) {
      return
    }
    sourceX = Math.floor(sourceColumn * sourceTileWidth)
    sourceY = Math.floor(sourceRow * sourceTileHeight)
  }

  const drawWidth = TILE_SIZE * (animation.scale || 1)
  const aspectRatio = sourceTileHeight / sourceTileWidth
  const drawHeight = drawWidth * aspectRatio
  const centerX = animation.x - scrollOffset.x
  const centerY = animation.y - scrollOffset.y
  const { width: viewportWidth, height: viewportHeight } = getCanvasLogicalSize(ctx.canvas)
  if (
    viewportWidth > 0 &&
    viewportHeight > 0 &&
    (
      centerX + drawWidth / 2 < 0 ||
      centerY + drawHeight / 2 < 0 ||
      centerX - drawWidth / 2 > viewportWidth ||
      centerY - drawHeight / 2 > viewportHeight
    )
  ) {
    return
  }

  // Resize audit: arbitrary custom sheets can combine runtime frameRects,
  // scale, blob URLs and density. Preparing these exact finite frames requires
  // I20 to pass the selected animation metadata into the startup readiness
  // barrier. Until that owner wiring exists, keep this parity-preserving
  // source draw explicit; do not hide it behind an aircraft exception or
  // quantize the time-based animation further.
  ctx.drawImage(
    texture,
    sourceX,
    sourceY,
    Math.floor(sourceTileWidth),
    Math.floor(sourceTileHeight),
    centerX - drawWidth / 2,
    centerY - drawHeight / 2,
    drawWidth,
    drawHeight
  )
}
