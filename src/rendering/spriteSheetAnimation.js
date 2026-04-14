import { TILE_SIZE } from '../config.js'
import { getSimulationTime } from '../game/time.js'

const FILE_PATTERN = /(\d+)x(\d+)_([0-9]+)x([0-9]+)_.+\.(?:webp|png|jpg|jpeg)$/i
const spriteSheetDefinitionCache = new Map()
const imageCache = new Map()

function getFileName(texturePath) {
  if (typeof texturePath !== 'string') return ''
  const normalized = texturePath.split('?')[0]
  const segments = normalized.split('/')
  return segments[segments.length - 1] || normalized
}

export function parseSpriteSheetMetadataFromFilename(texturePath) {
  const fileName = getFileName(texturePath)
  const match = fileName.match(FILE_PATTERN)
  if (!match) {
    return null
  }

  const tileWidth = Number.parseInt(match[1], 10)
  const tileHeight = Number.parseInt(match[2], 10)
  const columns = Number.parseInt(match[3], 10)
  const rows = Number.parseInt(match[4], 10)
  if (!tileWidth || !tileHeight || !columns || !rows) {
    return null
  }

  return {
    tileWidth,
    tileHeight,
    columns,
    rows,
    frameCount: columns * rows
  }
}

export function getSpriteSheetDefinition(texturePath) {
  if (spriteSheetDefinitionCache.has(texturePath)) {
    return spriteSheetDefinitionCache.get(texturePath)
  }

  const metadata = parseSpriteSheetMetadataFromFilename(texturePath)
  if (!metadata) {
    return null
  }

  const definition = {
    texture: texturePath,
    ...metadata
  }
  spriteSheetDefinitionCache.set(texturePath, definition)
  return definition
}

function getOrLoadImage(texturePath) {
  if (imageCache.has(texturePath)) {
    return imageCache.get(texturePath)
  }

  const image = new Image()
  image.decoding = 'async'
  image.loading = 'eager'
  image.src = texturePath
  imageCache.set(texturePath, image)
  return image
}

export function spawnSpriteSheetAnimation(gameState, options = {}) {
  if (!gameState) return null
  if (!Array.isArray(gameState.spriteSheetAnimations)) {
    gameState.spriteSheetAnimations = []
  }

  const {
    texture,
    x,
    y,
    duration = 1.05,
    loop = false,
    scale = 1,
    frameCount
  } = options

  if (!texture || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }

  const definition = getSpriteSheetDefinition(texture)
  if (!definition) {
    return null
  }

  const instanceFrameCount = Number.isFinite(frameCount) && frameCount > 0
    ? Math.floor(frameCount)
    : definition.frameCount

  const animation = {
    id: `ssa_${Math.random().toString(36).slice(2)}`,
    texture,
    x,
    y,
    tileWidth: definition.tileWidth,
    tileHeight: definition.tileHeight,
    columns: definition.columns,
    rows: definition.rows,
    frameCount: instanceFrameCount,
    duration: Math.max(0.05, Number.isFinite(duration) ? duration : 1.05),
    loop: Boolean(loop),
    scale: Math.max(0.1, Number.isFinite(scale) ? scale : 1),
    startTime: getSimulationTime(gameState),
    image: getOrLoadImage(texture)
  }

  gameState.spriteSheetAnimations.push(animation)
  return animation
}

export function renderSpriteSheetAnimations(ctx, gameState, scrollOffset) {
  const animations = gameState?.spriteSheetAnimations
  if (!Array.isArray(animations) || animations.length === 0) return

  const currentTime = getSimulationTime(gameState)
  const canvasWidth = ctx.canvas.width
  const canvasHeight = ctx.canvas.height
  const prevBlendMode = ctx.globalCompositeOperation
  ctx.globalCompositeOperation = 'lighter'

  for (let i = animations.length - 1; i >= 0; i--) {
    const anim = animations[i]
    if (!anim || !anim.image || !anim.image.complete) {
      continue
    }

    const durationMs = anim.duration * 1000
    const elapsed = currentTime - anim.startTime
    if (!anim.loop && elapsed >= durationMs) {
      animations.splice(i, 1)
      continue
    }

    const progress = anim.loop
      ? ((elapsed % durationMs) + durationMs) % durationMs / durationMs
      : Math.min(Math.max(elapsed / durationMs, 0), 0.999999)
    const frameIndex = Math.min(
      anim.frameCount - 1,
      Math.floor(progress * anim.frameCount)
    )
    const sourceX = (frameIndex % anim.columns) * anim.tileWidth
    const sourceY = Math.floor(frameIndex / anim.columns) * anim.tileHeight

    const drawSize = TILE_SIZE * anim.scale
    const drawX = anim.x - scrollOffset.x - drawSize / 2
    const drawY = anim.y - scrollOffset.y - drawSize / 2
    const cullPadding = drawSize
    if (
      drawX + drawSize < -cullPadding ||
      drawY + drawSize < -cullPadding ||
      drawX > canvasWidth + cullPadding ||
      drawY > canvasHeight + cullPadding
    ) {
      continue
    }

    ctx.drawImage(
      anim.image,
      sourceX,
      sourceY,
      anim.tileWidth,
      anim.tileHeight,
      drawX,
      drawY,
      drawSize,
      drawSize
    )
  }

  ctx.globalCompositeOperation = prevBlendMode
}
