import { createSpriteSheetAnimationInstance } from '../rendering/spriteSheetAnimation.js'
import { getSimulationTime } from './time.js'

const DEFAULT_DESTRUCTION_SPRITE = 'images/map/animations/64x64_9x9_q85_explosion.webp'
const DEFAULT_DESTRUCTION_DURATION = 1050

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
    rows: Number.isFinite(metadata.rows) ? metadata.rows : undefined
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
    scale = 1,
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
    frameRects: configured?.frameRects,
    frameCount: configured?.frameCount,
    columns: configured?.columns,
    rows: configured?.rows
  })
}
