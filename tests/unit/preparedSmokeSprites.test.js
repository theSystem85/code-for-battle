import { describe, it, expect, vi } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import { EffectsRenderer } from '../../src/rendering/effectsRenderer.js'
import { PreparedSmokeBatch, SMOKE_SPRITE_SIZE } from '../../src/rendering/preparedSmokeSprites.js'

function context() {
  return {
    canvas: { width: 200, height: 200 },
    globalAlpha: 1,
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn()
  }
}

describe('PreparedSmokeBatch', () => {
  it('prepares fixed sprites once and reuses them', () => {
    const batch = new PreparedSmokeBatch()
    expect(batch.ensure()).toBe(true)
    const sprites = batch.sprites
    expect(sprites.smoke.width).toBe(SMOKE_SPRITE_SIZE)
    expect(sprites.flame.width).toBe(SMOKE_SPRITE_SIZE)
    expect(sprites.shade.width).toBe(SMOKE_SPRITE_SIZE)
    expect(batch.ensure()).toBe(true)
    expect(batch.sprites).toBe(sprites)
    expect(batch.backend).toBe('prepared-sprite')
  })

  it('draws one smoke sprite per visible puff and skips culled ones', () => {
    const batch = new PreparedSmokeBatch()
    const ctx = context()
    const hiddenRow = []
    const shownRow = []
    const visibleTile = Math.floor(80 / TILE_SIZE)
    shownRow[visibleTile] = { visible: true }
    hiddenRow[visibleTile] = { visible: false }
    const visibilityMap = []
    visibilityMap[Math.floor(90 / TILE_SIZE)] = shownRow

    const handled = batch.render(ctx, [
      { x: 80, y: 90, size: 6.5, alpha: 0.6, smokeShade: 0, fireIntensity: 0 },
      { x: -40, y: 90, size: 6.5, alpha: 0.6 },
      { x: 80, y: 90, size: 0, alpha: 0.6 },
      { x: 16, y: 90, size: 4, alpha: 0.5, fireIntensity: 0 }
    ], 0, 0, 200, 200, visibilityMap)

    expect(handled).toBe(true)
    expect(ctx.createRadialGradient).not.toHaveBeenCalled()
    expect(ctx.drawImage).toHaveBeenCalledTimes(1)
    expect(ctx.drawImage).toHaveBeenCalledWith(
      batch.sprites.smoke,
      80 - 6.5,
      90 - 6.5,
      13,
      13
    )
    expect(ctx.globalAlpha).toBe(1)
    expect(batch.lastDrawCount).toBe(1)
  })

  it('draws flame and shade only for puffs that need them', () => {
    const batch = new PreparedSmokeBatch()
    const ctx = context()
    batch.render(ctx, [
      { x: 40, y: 50, size: 10, alpha: 0.8, fireIntensity: 1, smokeShade: 0.9 }
    ], 0, 0, 200, 200, null)

    expect(ctx.drawImage).toHaveBeenCalledTimes(3)
    expect(ctx.drawImage.mock.calls[0][0]).toBe(batch.sprites.flame)
    expect(ctx.drawImage.mock.calls[1][0]).toBe(batch.sprites.smoke)
    expect(ctx.drawImage.mock.calls[2][0]).toBe(batch.sprites.shade)
    const flameRadius = 10 * (0.5 + 0.65)
    expect(ctx.drawImage.mock.calls[0][3]).toBeCloseTo(flameRadius * 2)
  })

  it('samples a full chimney budget from the same sprite without rebuilding it', () => {
    const batch = new PreparedSmokeBatch()
    const particles = Array.from({ length: 300 }, (_, index) => ({
      x: 20 + (index % 20) * 12,
      y: 20 + Math.floor(index / 20) * 12,
      size: 3 + (index % 7) * 0.35,
      alpha: 0.75,
      fireIntensity: 0,
      smokeShade: 0
    }))
    let draws = 0
    const ctx = {
      canvas: { width: 800, height: 600 },
      globalAlpha: 1,
      drawImage: () => { draws += 1 }
    }
    batch.render(ctx, particles, 0, 0, 800, 600, null)
    const sprites = batch.sprites
    expect(draws).toBe(300)
    draws = 0
    const started = performance.now()
    for (let frame = 0; frame < 200; frame++) {
      batch.render(ctx, particles, 0, 0, 800, 600, null)
    }
    const perFrame = (performance.now() - started) / 200
    expect(batch.sprites).toBe(sprites)
    expect(draws).toBe(300 * 200)
    expect(perFrame).toBeLessThan(2)
  })

  it('uses prepared sprites from the effects renderer and keeps the gradient fallback', () => {
    const renderer = new EffectsRenderer()
    const ctx = context()
    renderer.renderSmoke(ctx, {
      smokeParticles: [
        { x: 40, y: 50, size: 8, alpha: 0.7, fireIntensity: 0, smokeShade: 0 },
        { x: 70, y: 55, size: 5, alpha: 0.5, fireIntensity: 0, smokeShade: 0 }
      ]
    }, { x: 0, y: 0 })

    expect(ctx.createRadialGradient).not.toHaveBeenCalled()
    expect(ctx.arc).not.toHaveBeenCalled()
    expect(ctx.drawImage).toHaveBeenCalledTimes(2)
    expect(renderer.gpuSmoke.backend).toBe('prepared-sprite')
    expect(renderer.gpuSmoke.presentCount).toBe(1)

    const fallback = new EffectsRenderer()
    fallback.gpuSmoke.failed = true
    const fallbackCtx = context()
    fallback.renderSmoke(fallbackCtx, {
      smokeParticles: [{ x: 50, y: 60, size: 7.25, alpha: 0.8 }]
    }, { x: 0, y: 0 })
    expect(fallbackCtx.arc).toHaveBeenCalledWith(50, 60, 7.25, 0, Math.PI * 2)
    expect(fallbackCtx.drawImage).not.toHaveBeenCalled()
  })
})
