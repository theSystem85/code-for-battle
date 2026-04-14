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

export function getSpriteSheetTexture(assetPath) {
  if (!assetPath) return null
  if (textureCache.has(assetPath)) {
    return textureCache.get(assetPath)
  }

  const img = new Image()
  img.decoding = 'async'
  img.src = assetPath.startsWith('/') ? assetPath : `/${assetPath}`
  textureCache.set(assetPath, img)
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
  scale = 1
}) {
  const metadata = parseSpriteSheetMetadataFromFilename(assetPath)
  const computedDuration = Number.isFinite(durationSeconds)
    ? Math.max(1, durationSeconds * 1000)
    : duration

  return {
    type: 'spriteSheet',
    assetPath,
    x,
    y,
    startTime,
    duration: computedDuration,
    loop,
    scale,
    ...metadata
  }
}

export function getAnimationFrameIndex(animation, now) {
  const safeFrameCount = Math.max(1, animation.frameCount || 1)
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
  const column = frameIndex % animation.columns
  const row = Math.floor(frameIndex / animation.columns)

  const sourceX = column * animation.tileWidth
  const sourceY = row * animation.tileHeight
  const drawWidth = TILE_SIZE * (animation.scale || 1)
  const aspectRatio = animation.tileHeight / animation.tileWidth
  const drawHeight = drawWidth * aspectRatio
  const centerX = animation.x - scrollOffset.x
  const centerY = animation.y - scrollOffset.y

  ctx.drawImage(
    texture,
    sourceX,
    sourceY,
    animation.tileWidth,
    animation.tileHeight,
    centerX - drawWidth / 2,
    centerY - drawHeight / 2,
    drawWidth,
    drawHeight
  )
}
