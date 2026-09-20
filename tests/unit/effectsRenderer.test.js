import { describe, it, expect, vi, beforeEach } from 'vitest'

const lightningMocks = vi.hoisted(() => ({
  drawTeslaCoilLightning: vi.fn()
}))

vi.mock('../../src/rendering/renderingUtils.js', () => ({
  drawTeslaCoilLightning: lightningMocks.drawTeslaCoilLightning,
  getCanvasLogicalSize: canvas => ({
    width: canvas?.width || 0,
    height: canvas?.height || 0
  })
}))

import { EffectsRenderer } from '../../src/rendering/effectsRenderer.js'

describe('EffectsRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders torpedoes at half opacity to place them below the water surface', () => {
    const renderer = new EffectsRenderer()
    const ctx = {
      globalAlpha: 1,
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      beginPath: vi.fn(), ellipse: vi.fn(), fill: vi.fn()
    }

    renderer.renderBullets(ctx, [{
      id: 'torpedo-1', x: 40, y: 50, vx: 1, vy: 0,
      projectileType: 'torpedo', originType: 'torpedo'
    }], { x: 0, y: 0 })

    expect(ctx.globalAlpha).toBe(0.5)
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
  })

  describe('renderTeslaLightning', () => {
    it('keeps Tesla lightning visible using simulation time', () => {
      const renderer = new EffectsRenderer()
      const units = [{
        teslaCoilHit: {
          fromX: 100,
          fromY: 120,
          toX: 180,
          toY: 210,
          impactTime: 1000
        }
      }]

      renderer.renderTeslaLightning({}, units, { x: 10, y: 20 }, { simulationTime: 1200 })

      expect(lightningMocks.drawTeslaCoilLightning).toHaveBeenCalledTimes(1)
      expect(lightningMocks.drawTeslaCoilLightning).toHaveBeenCalledWith(
        {},
        90,
        100,
        170,
        190,
        32
      )
    })
  })

  describe('renderShipWakes', () => {
    it('draws rotating-ship disturbances as expanding circular rings', () => {
      const renderer = new EffectsRenderer()
      const ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        quadraticCurveTo: vi.fn()
      }
      const state = {
        simulationTime: 1300,
        shipWakes: [{
          kind: 'turn',
          x: 100,
          y: 120,
          size: 30,
          createdAt: 1000,
          duration: 850
        }]
      }

      renderer.renderShipWakes(ctx, state, { x: 10, y: 20 })

      expect(ctx.translate).toHaveBeenCalledWith(90, 100)
      expect(ctx.arc).toHaveBeenCalledWith(0, 0, expect.any(Number), 0, Math.PI * 2)
      expect(ctx.quadraticCurveTo).not.toHaveBeenCalled()
    })

    it('expires offscreen wakes without replacing the simulation array', () => {
      const renderer = new EffectsRenderer()
      const ctx = {
        canvas: { width: 100, height: 100 },
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        quadraticCurveTo: vi.fn(),
        moveTo: vi.fn()
      }
      const wakes = [
        { kind: 'turn', x: 1000, y: 1000, size: 30, createdAt: 1000, duration: 850 },
        { kind: 'turn', x: 50, y: 50, size: 30, createdAt: 0, duration: 100 }
      ]
      const state = { simulationTime: 1300, shipWakes: wakes }

      renderer.renderShipWakes(ctx, state, { x: 0, y: 0 })

      expect(state.shipWakes).toBe(wakes)
      expect(wakes).toHaveLength(1)
      expect(ctx.translate).not.toHaveBeenCalled()
    })
  })

  it('renders continuous smoke and explosion radii procedurally without resized rasters', () => {
    const renderer = new EffectsRenderer()
    const gradient = { addColorStop: vi.fn() }
    const ctx = {
      canvas: { width: 200, height: 200 },
      globalAlpha: 1,
      createRadialGradient: vi.fn(() => gradient),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      drawImage: vi.fn()
    }

    renderer.renderSmoke(ctx, {
      smokeParticles: [{ x: 50, y: 60, size: 7.25, alpha: 0.8 }]
    }, { x: 0, y: 0 })
    renderer.renderExplosions(ctx, {
      simulationTime: 500,
      explosions: [{ x: 80, y: 90, startTime: 0, duration: 1000, maxRadius: 40 }]
    }, { x: 0, y: 0 })

    expect(ctx.arc).toHaveBeenCalledWith(50, 60, 7.25, 0, Math.PI * 2)
    expect(ctx.drawImage).not.toHaveBeenCalled()
  })
})
