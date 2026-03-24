import { describe, it, expect, vi, beforeEach } from 'vitest'

const lightningMocks = vi.hoisted(() => ({
  drawTeslaCoilLightning: vi.fn()
}))

vi.mock('../../src/rendering/renderingUtils.js', () => ({
  drawTeslaCoilLightning: lightningMocks.drawTeslaCoilLightning
}))

import { EffectsRenderer } from '../../src/rendering/effectsRenderer.js'

describe('EffectsRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
