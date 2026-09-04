// smokeUtils.js
// Utility functions for creating smoke particle effects used by units and buildings
import {
  MAX_SMOKE_PARTICLES,
  SMOKE_PARTICLE_LIFETIME,
  SMOKE_PARTICLE_SIZE,
  SMOKE_PARTICLE_ALPHA,
  SMOKE_PARTICLE_RISE_SPEED,
  SMOKE_PARTICLE_SPREAD
} from '../config.js'
import { gameRandom } from '../utils/gameRandom.js'

function ensureSmokeCollections(gameState) {
  if (!Array.isArray(gameState.smokeParticles)) {
    gameState.smokeParticles = []
  }
  if (!Array.isArray(gameState.smokeParticlePool)) {
    gameState.smokeParticlePool = []
  }
}

function recycleParticleInstance(gameState, particle) {
  if (!particle) {
    return
  }

  // Reset mutable fields to reduce stale data when reusing the particle
  particle.originalSize = undefined
  particle.alpha = 0
  particle.size = 0
  particle.fireIntensity = 0
  particle.smokeShade = 0
  particle.initialAlpha = 0

  gameState.smokeParticlePool.push(particle)
}

export function removeSmokeParticle(gameState, index) {
  ensureSmokeCollections(gameState)

  if (index < 0 || index >= gameState.smokeParticles.length) {
    return
  }

  const [particle] = gameState.smokeParticles.splice(index, 1)
  recycleParticleInstance(gameState, particle)
}

export function enforceSmokeParticleCapacity(gameState) {
  ensureSmokeCollections(gameState)

  while (gameState.smokeParticles.length > MAX_SMOKE_PARTICLES) {
    removeSmokeParticle(gameState, 0)
  }
}

/**
 * Emit a number of smoke particles at the specified world coordinates.
 * The particles share the common wind logic handled in updateSmokeParticles.
 *
 * @param {Object} gameState - Global game state
 * @param {number} x - World X coordinate for emission center
 * @param {number} y - World Y coordinate for emission center
 * @param {number} now - Current time
 * @param {number} [count=1] - Number of particles to emit
 */
export function emitSmokeParticles(gameState, x, y, now, countOrOptions = 1) {
  ensureSmokeCollections(gameState)

  const explicitNumericCount = typeof countOrOptions === 'number'
  if (explicitNumericCount && !Number.isFinite(countOrOptions)) {
    return
  }

  const options = explicitNumericCount
    ? { count: countOrOptions }
    : (countOrOptions || {})
  const count = Number.isFinite(options.count) ? options.count : 1
  const fireIntensity = Number.isFinite(options.fireIntensity)
    ? Math.max(0, Math.min(1, options.fireIntensity))
    : 0
  const smokeShade = Number.isFinite(options.smokeShade)
    ? Math.max(0, Math.min(1, options.smokeShade))
    : 0

  if (!Number.isFinite(count) || count <= 0) {
    return
  }

  // Validate coordinates - NaN or Infinity would break rendering
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return
  }

  // Make sure we never exceed the configured cap by recycling the oldest particles
  for (let i = 0; i < count; i++) {
    if (gameState.smokeParticles.length >= MAX_SMOKE_PARTICLES) {
      removeSmokeParticle(gameState, 0)
    }

    if (gameState.smokeParticles.length >= MAX_SMOKE_PARTICLES) {
      break
    }

    const particle = gameState.smokeParticlePool.pop() || {}

    particle.x = x + (gameRandom() - 0.5) * SMOKE_PARTICLE_SPREAD
    particle.y = y + (gameRandom() - 0.5) * SMOKE_PARTICLE_SPREAD
    particle.vx = (gameRandom() - 0.5) * 0.2
    particle.vy = -SMOKE_PARTICLE_RISE_SPEED * (0.9 + gameRandom() * 0.2)
    particle.size = SMOKE_PARTICLE_SIZE * (0.85 + gameRandom() * 0.3)
    particle.originalSize = particle.size
    particle.startTime = now
    particle.duration = SMOKE_PARTICLE_LIFETIME + gameRandom() * 500 // Increased random duration variation
    particle.initialAlpha = SMOKE_PARTICLE_ALPHA * (0.9 + gameRandom() * 0.1)
    particle.alpha = particle.initialAlpha
    particle.fireIntensity = fireIntensity > 0
      ? fireIntensity * (0.65 + gameRandom() * 0.35)
      : 0
    particle.smokeShade = smokeShade

    gameState.smokeParticles.push(particle)
  }
}
