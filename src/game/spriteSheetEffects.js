import { createSpriteSheetAnimationInstance } from '../rendering/spriteSheetAnimation.js'
import { getSimulationTime } from './time.js'

const DEFAULT_DESTRUCTION_SPRITE = 'images/map/animations/64x64_9x9_q85_explosion.webp'
const DEFAULT_DESTRUCTION_DURATION = 1050

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
  const {
    duration = DEFAULT_DESTRUCTION_DURATION,
    scale = 1,
    loop = false,
    assetPath = DEFAULT_DESTRUCTION_SPRITE
  } = options

  return spawnSpriteSheetAnimation(gameState, {
    assetPath,
    x: centerX,
    y: centerY,
    duration,
    loop,
    scale
  })
}
