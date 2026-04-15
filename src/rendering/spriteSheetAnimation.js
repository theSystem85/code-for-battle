import { TILE_SIZE } from '../config.js'

const FILENAME_PATTERN = /^(\d+)x(\d+)_([0-9]+)x([0-9]+)_.+\.[a-z0-9]+$/i

const textureCache = new Map()
const metadataCache = new Map()

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

function buildBlackTransparentTexture(image) {
  if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return image

  ctx.drawImage(image, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    const brightness = Math.max(r, g, b)
    data[i + 3] = brightness <= 8 ? 0 : a
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

export function getSpriteSheetTexture(assetPath) {
  if (!assetPath) return null
  const existing = textureCache.get(assetPath)
  if (existing) {
    if (!existing.processed && existing.image.complete && existing.image.naturalWidth > 0) {
      existing.processed = buildBlackTransparentTexture(existing.image)
    }
    return existing.processed || existing.image
  }

  const img = new Image()
  img.decoding = 'async'
  img.src = assetPath.startsWith('/') ? assetPath : `/${assetPath}`
  textureCache.set(assetPath, {
    image: img,
    processed: null
  })
  return img
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
  frameCount
}) {
  const metadata = parseSpriteSheetMetadataFromFilename(assetPath)
  const computedDuration = Number.isFinite(durationSeconds)
    ? Math.max(1, durationSeconds * 1000)
    : duration
  const resolvedColumns = Number.isFinite(columns) ? columns : metadata.columns
  const resolvedRows = Number.isFinite(rows) ? rows : metadata.rows
  const resolvedTileWidth = Number.isFinite(tileWidth) ? tileWidth : metadata.tileWidth
  const resolvedTileHeight = Number.isFinite(tileHeight) ? tileHeight : metadata.tileHeight
  const resolvedFrameCount = Number.isFinite(frameCount) ? frameCount : metadata.frameCount

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
    tileWidth: resolvedTileWidth,
    tileHeight: resolvedTileHeight,
    columns: resolvedColumns,
    rows: resolvedRows,
    frameCount: resolvedFrameCount
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
  const texture = getSpriteSheetTexture(animation.assetPath)
  if (!texture || !texture.complete || texture.naturalWidth <= 0 || texture.naturalHeight <= 0) {
    return
  }

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
    sourceTileWidth = texture.naturalWidth / columns
    sourceTileHeight = texture.naturalHeight / Math.max(1, animation.rows)
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
