import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  removeSmokeParticle,
  enforceSmokeParticleCapacity,
  emitSmokeParticles
} from '../../src/utils/smokeUtils.js'

// Mock dependencies
vi.mock('../../src/config.js', () => ({
  MAX_SMOKE_PARTICLES: 10,
  SMOKE_PARTICLE_LIFETIME: 1000,
  SMOKE_PARTICLE_SIZE: 5,
  SMOKE_PARTICLE_ALPHA: 0.8,
  SMOKE_PARTICLE_RISE_SPEED: 0.7,
  SMOKE_PARTICLE_SPREAD: 4
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn(() => 0.5)
}))

describe('smokeUtils', () => {
  let gameState

  beforeEach(() => {
    gameState = {
      smokeParticles: [],
      smokeParticlePool: []
    }
  })

  describe('removeSmokeParticle', () => {
    it('removes particle at specified index', () => {
      gameState.smokeParticles = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 20 }
      ]

      removeSmokeParticle(gameState, 1)

      expect(gameState.smokeParticles).toHaveLength(2)
      expect(gameState.smokeParticles[0].x).toBe(0)
      expect(gameState.smokeParticles[1].x).toBe(20)
    })

    it('recycles removed particle to pool', () => {
      gameState.smokeParticles = [{ x: 10, y: 10, alpha: 0.5 }]

      removeSmokeParticle(gameState, 0)

      expect(gameState.smokeParticlePool).toHaveLength(1)
      expect(gameState.smokeParticlePool[0].alpha).toBe(0)
    })

    it('handles negative index gracefully', () => {
      gameState.smokeParticles = [{ x: 0, y: 0 }]

      removeSmokeParticle(gameState, -1)

      expect(gameState.smokeParticles).toHaveLength(1)
    })

    it('handles index beyond length gracefully', () => {
      gameState.smokeParticles = [{ x: 0, y: 0 }]

      removeSmokeParticle(gameState, 5)

      expect(gameState.smokeParticles).toHaveLength(1)
    })

    it('initializes arrays if missing', () => {
      const emptyState = {}

      removeSmokeParticle(emptyState, 0)

      expect(emptyState.smokeParticles).toEqual([])
      expect(emptyState.smokeParticlePool).toEqual([])
    })

    it('resets particle fields when recycling', () => {
      const particle = { x: 10, y: 10, originalSize: 8, alpha: 0.7, size: 5 }
      gameState.smokeParticles = [particle]

      removeSmokeParticle(gameState, 0)

      const recycled = gameState.smokeParticlePool[0]
      expect(recycled.originalSize).toBeUndefined()
      expect(recycled.alpha).toBe(0)
      expect(recycled.size).toBe(0)
    })
  })

  describe('enforceSmokeParticleCapacity', () => {
    it('removes oldest particles when over capacity', () => {
      // Create 15 particles (over MAX_SMOKE_PARTICLES of 10)
      for (let i = 0; i < 15; i++) {
        gameState.smokeParticles.push({ x: i, y: i })
      }

      enforceSmokeParticleCapacity(gameState)

      expect(gameState.smokeParticles).toHaveLength(10)
      // First 5 should have been removed
      expect(gameState.smokeParticles[0].x).toBe(5)
    })

    it('does nothing when under capacity', () => {
      gameState.smokeParticles = [{ x: 0 }, { x: 1 }, { x: 2 }]

      enforceSmokeParticleCapacity(gameState)

      expect(gameState.smokeParticles).toHaveLength(3)
    })

    it('initializes arrays if missing', () => {
      const emptyState = {}

      enforceSmokeParticleCapacity(emptyState)

      expect(emptyState.smokeParticles).toEqual([])
      expect(emptyState.smokeParticlePool).toEqual([])
    })

    it('recycles removed particles to pool', () => {
      for (let i = 0; i < 12; i++) {
        gameState.smokeParticles.push({ x: i, y: i })
      }

      enforceSmokeParticleCapacity(gameState)

      expect(gameState.smokeParticlePool).toHaveLength(2)
    })
  })

  describe('emitSmokeParticles', () => {
    it('creates particle at specified position', () => {
      emitSmokeParticles(gameState, 100, 200, 1000, 1)

      expect(gameState.smokeParticles).toHaveLength(1)
      // With gameRandom returning 0.5, offset is 0
      expect(gameState.smokeParticles[0].x).toBe(100)
      expect(gameState.smokeParticles[0].y).toBe(200)
    })

    it('creates multiple particles', () => {
      emitSmokeParticles(gameState, 100, 200, 1000, 5)

      expect(gameState.smokeParticles).toHaveLength(5)
    })

    it('defaults to 1 particle', () => {
      emitSmokeParticles(gameState, 100, 200, 1000)

      expect(gameState.smokeParticles).toHaveLength(1)
    })

    it('sets particle properties', () => {
      emitSmokeParticles(gameState, 100, 200, 1000, 1)

      const particle = gameState.smokeParticles[0]
      expect(particle.startTime).toBe(1000)
      expect(particle.vx).toBeDefined()
      expect(particle.vy).toBeDefined()
      expect(particle.size).toBeDefined()
      expect(particle.duration).toBeDefined()
      expect(particle.alpha).toBeDefined()
      expect(particle.initialAlpha).toBe(particle.alpha)
      expect(particle.originalSize).toBe(particle.size)
    })

    it('respects max particle capacity', () => {
      // Fill up to capacity
      for (let i = 0; i < 10; i++) {
        gameState.smokeParticles.push({ x: i })
      }

      emitSmokeParticles(gameState, 100, 200, 1000, 5)

      // Should recycle oldest and add new ones up to cap
      expect(gameState.smokeParticles.length).toBeLessThanOrEqual(10)
    })

    it('reuses particles from pool', () => {
      const recycledParticle = { x: 0, y: 0, recycled: true }
      gameState.smokeParticlePool = [recycledParticle]

      emitSmokeParticles(gameState, 100, 200, 1000, 1)

      expect(gameState.smokeParticlePool).toHaveLength(0)
      expect(gameState.smokeParticles[0].recycled).toBe(true)
    })

    it('ignores invalid count (negative)', () => {
      emitSmokeParticles(gameState, 100, 200, 1000, -1)

      expect(gameState.smokeParticles).toHaveLength(0)
    })

    it('ignores invalid count (zero)', () => {
      emitSmokeParticles(gameState, 100, 200, 1000, 0)

      expect(gameState.smokeParticles).toHaveLength(0)
    })

    it('ignores invalid count (NaN)', () => {
      emitSmokeParticles(gameState, 100, 200, 1000, NaN)

      expect(gameState.smokeParticles).toHaveLength(0)
    })

    it('ignores invalid count (Infinity)', () => {
      emitSmokeParticles(gameState, 100, 200, 1000, Infinity)

      expect(gameState.smokeParticles).toHaveLength(0)
    })

    it('ignores NaN x coordinate', () => {
      emitSmokeParticles(gameState, NaN, 200, 1000, 1)

      expect(gameState.smokeParticles).toHaveLength(0)
    })

    it('ignores NaN y coordinate', () => {
      emitSmokeParticles(gameState, 100, NaN, 1000, 1)

      expect(gameState.smokeParticles).toHaveLength(0)
    })

    it('ignores Infinity x coordinate', () => {
      emitSmokeParticles(gameState, Infinity, 200, 1000, 1)

      expect(gameState.smokeParticles).toHaveLength(0)
    })

    it('ignores Infinity y coordinate', () => {
      emitSmokeParticles(gameState, 100, -Infinity, 1000, 1)

      expect(gameState.smokeParticles).toHaveLength(0)
    })

    it('initializes arrays if missing', () => {
      const emptyState = {}

      emitSmokeParticles(emptyState, 100, 200, 1000, 1)

      expect(emptyState.smokeParticles).toHaveLength(1)
      expect(emptyState.smokeParticlePool).toBeDefined()
    })

    it('particle has upward velocity', () => {
      emitSmokeParticles(gameState, 100, 200, 1000, 1)

      // vy should be negative (upward)
      expect(gameState.smokeParticles[0].vy).toBeLessThan(0)
    })
  })
})
