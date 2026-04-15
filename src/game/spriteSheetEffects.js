import { createSpriteSheetAnimationInstance } from '../rendering/spriteSheetAnimation.js'
import { getSimulationTime } from './time.js'

const DEFAULT_DESTRUCTION_SPRITE = 'images/map/animations/64x64_9x9_q85_explosion.webp'
const DEFAULT_DESTRUCTION_DURATION = 1050
const DEFAULT_ANIMATION_TAG = 'explosion'

let runtimeDestructionConfig = {
  assetPath: DEFAULT_DESTRUCTION_SPRITE,
  duration: DEFAULT_DESTRUCTION_DURATION,
  scale: 1,
  activeTag: DEFAULT_ANIMATION_TAG,
  framesByTag: {}
}

export function applyDestructionAnimationMetadata(metadata = null) {
  if (!metadata || typeof metadata !== 'object') {
    runtimeDestructionConfig = {
      assetPath: DEFAULT_DESTRUCTION_SPRITE,
      duration: DEFAULT_DESTRUCTION_DURATION,
      scale: 1,
      activeTag: DEFAULT_ANIMATION_TAG,
      framesByTag: {}
    }
    return
  }

  runtimeDestructionConfig = {
    assetPath: metadata.sheetPath || DEFAULT_DESTRUCTION_SPRITE,
    duration: Number.isFinite(metadata.duration) ? metadata.duration : DEFAULT_DESTRUCTION_DURATION,
    scale: Number.isFinite(metadata.scale) ? metadata.scale : 1,
    activeTag: metadata.activeTag || DEFAULT_ANIMATION_TAG,
    framesByTag: metadata.framesByTag && typeof metadata.framesByTag === 'object' ? metadata.framesByTag : {}
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
  const selectedTag = options.tag || runtimeDestructionConfig.activeTag || DEFAULT_ANIMATION_TAG
  const configuredFrameSequence = runtimeDestructionConfig.framesByTag?.[selectedTag]
  const {
    duration = runtimeDestructionConfig.duration ?? DEFAULT_DESTRUCTION_DURATION,
    scale = 1,
    loop = false,
    assetPath = runtimeDestructionConfig.assetPath || DEFAULT_DESTRUCTION_SPRITE
  } = options

  return spawnSpriteSheetAnimation(gameState, {
    assetPath,
    x: centerX,
    y: centerY,
    duration,
    loop,
    scale: Number.isFinite(options.scale) ? options.scale : (runtimeDestructionConfig.scale || scale),
    frameSequence: Array.isArray(configuredFrameSequence) ? configuredFrameSequence : null
  })
}
