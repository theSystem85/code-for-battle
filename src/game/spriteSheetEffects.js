import { createSpriteSheetAnimationInstance, prewarmSpriteSheetTexture } from '../rendering/spriteSheetAnimation.js'
import { getSimulationTime } from './time.js'

const DEFAULT_DESTRUCTION_SPRITE = 'images/map/animations/explosion.webp'
const DEFAULT_DESTRUCTION_DURATION = 1050
const DEFAULT_DESTRUCTION_TILE_SIZE = 64
const DEFAULT_DESTRUCTION_BORDER_WIDTH = 1
const DEFAULT_DESTRUCTION_COLUMNS = 16
const DEFAULT_DESTRUCTION_ROWS = 16
const DEFAULT_DESTRUCTION_FRAME_COUNT = 229
const DEFAULT_DESTRUCTION_SCALE = 1.3

function buildDefaultDestructionFrameRects() {
  const frameRects = []
  const sourceSize = DEFAULT_DESTRUCTION_TILE_SIZE - (DEFAULT_DESTRUCTION_BORDER_WIDTH * 2)
  for (let index = 0; index < DEFAULT_DESTRUCTION_FRAME_COUNT; index += 1) {
    const column = index % DEFAULT_DESTRUCTION_COLUMNS
    const row = Math.floor(index / DEFAULT_DESTRUCTION_COLUMNS)
    frameRects.push({
      x: (column * DEFAULT_DESTRUCTION_TILE_SIZE) + DEFAULT_DESTRUCTION_BORDER_WIDTH,
      y: (row * DEFAULT_DESTRUCTION_TILE_SIZE) + DEFAULT_DESTRUCTION_BORDER_WIDTH,
      width: sourceSize,
      height: sourceSize
    })
  }
  return frameRects
}

const DEFAULT_DESTRUCTION_FRAME_RECTS = buildDefaultDestructionFrameRects()

function getConfiguredDestructionAnimation(gameState) {
  const metadata = gameState?.activeAnimationSpriteSheetMetadata
  if (!metadata || typeof metadata !== 'object') return null
  const animations = metadata.animations || {}
  const preferredTag = animations.explosion
    ? 'explosion'
    : Object.keys(animations)[0]
  if (!preferredTag) return null
  const entry = animations[preferredTag]
  if (!entry) return null
  return {
    assetPath: metadata.sheetPath,
    duration: Number.isFinite(entry.durationMs) && entry.durationMs > 0 ? entry.durationMs : DEFAULT_DESTRUCTION_DURATION,
    frameSequence: Array.isArray(entry.frameIndices) ? entry.frameIndices : null,
    frameRects: Array.isArray(entry.frameRects) ? entry.frameRects : null,
    frameCount: Number.isFinite(entry.frameCount) ? entry.frameCount : undefined,
    columns: Number.isFinite(metadata.columns) ? metadata.columns : undefined,
    rows: Number.isFinite(metadata.rows) ? metadata.rows : undefined,
    blendMode: metadata.blendMode
  }
}

export function spawnSpriteSheetAnimation(gameState, config = {}) {
  if (!gameState) return null
  if (!Array.isArray(gameState.explosions)) {
    gameState.explosions = []
  }

  const now = Number.isFinite(config.startTime) ? config.startTime : getSimulationTime(gameState)
  const animation = createSpriteSheetAnimationInstance({
    ...config,
    startTime: now
  })

  gameState.explosions.push(animation)
  return animation
}

export function spawnDestructionExplosion(gameState, centerX, centerY, options = {}) {
  const configured = getConfiguredDestructionAnimation(gameState)
  const {
    duration = configured?.duration ?? DEFAULT_DESTRUCTION_DURATION,
    scale = DEFAULT_DESTRUCTION_SCALE,
    loop = false,
    assetPath = configured?.assetPath ?? DEFAULT_DESTRUCTION_SPRITE
  } = options

  return spawnSpriteSheetAnimation(gameState, {
    assetPath,
    x: centerX,
    y: centerY,
    duration,
    loop,
    scale,
    frameSequence: configured?.frameSequence,
    frameRects: configured?.frameRects ?? DEFAULT_DESTRUCTION_FRAME_RECTS,
    frameCount: configured?.frameCount ?? DEFAULT_DESTRUCTION_FRAME_COUNT,
    columns: configured?.columns ?? DEFAULT_DESTRUCTION_COLUMNS,
    rows: configured?.rows ?? DEFAULT_DESTRUCTION_ROWS,
    tileWidth: DEFAULT_DESTRUCTION_TILE_SIZE,
    tileHeight: DEFAULT_DESTRUCTION_TILE_SIZE,
    blendMode: configured?.blendMode
  })
}

export function prewarmDestructionExplosionTexture(gameState) {
  const configured = getConfiguredDestructionAnimation(gameState)
  const assetPath = configured?.assetPath ?? DEFAULT_DESTRUCTION_SPRITE
  prewarmSpriteSheetTexture(assetPath)
}
