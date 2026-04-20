import { describe, expect, it, vi } from 'vitest'
import { GameWebGLRenderer } from '../../src/rendering/webglRenderer.js'

describe('GameWebGLRenderer crystal resource tile selection', () => {
  it('suppresses legacy ore atlas textures when a non-atlas integrated crystal tile exists', () => {
    const spriteImage = { id: 'atlas' }
    const renderer = new GameWebGLRenderer(null, {
      spriteImage,
      tileTextureCache: {
        ore: [{ x: 10, y: 20, width: 64, height: 64 }]
      },
      getTileVariation: vi.fn(() => 0)
    })

    vi.spyOn(renderer, 'getIntegratedResourceTile').mockReturnValue({
      rect: { x: 0, y: 0, width: 64, height: 64 },
      image: { id: 'default-crystals-sheet' }
    })

    const instance = renderer.createInstance('ore', 3, 4, [[{ oreDensity: 3 }]], true)

    expect(instance.textureType).toBe(0)
    expect(instance.uvRect).toEqual([0, 0, 0, 0])
  })

  it('keeps legacy ore atlas textures when no integrated crystal tile exists', () => {
    const spriteImage = { id: 'atlas' }
    const renderer = new GameWebGLRenderer(null, {
      spriteImage,
      tileTextureCache: {
        ore: [{ x: 10, y: 20, width: 64, height: 64 }]
      },
      getTileVariation: vi.fn(() => 0)
    })

    vi.spyOn(renderer, 'getIntegratedResourceTile').mockReturnValue(null)

    const instance = renderer.createInstance('ore', 3, 4, [[{ oreDensity: 3 }]], true)

    expect(instance.textureType).toBe(1)
    expect(instance.uvRect).toEqual([10, 20, 74, 84])
  })
})
