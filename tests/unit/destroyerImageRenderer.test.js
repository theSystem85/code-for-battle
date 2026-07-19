import { describe, expect, it, vi } from 'vitest'
import '../setup.js'

describe('Destroyer image renderer', () => {
  it('loads only the south-facing sprite and rotates it for every heading', async() => {
    vi.resetModules()
    const createdImages = []
    globalThis.Image = class {
      constructor() {
        this.naturalWidth = 109
        this.naturalHeight = 342
        this.width = 109
        this.height = 342
        this.complete = true
        createdImages.push(this)
      }

      set src(value) {
        this._src = value
        this.onload?.()
      }

      get src() {
        return this._src
      }
    }

    const { preloadDestroyerImage, renderDestroyerWithImage, getDestroyerGunSpawnPoint } = await import('../../src/rendering/destroyerImageRenderer.js')
    const loaded = vi.fn()
    preloadDestroyerImage(loaded)

    expect(createdImages).toHaveLength(1)
    expect(createdImages[0].src).toBe('images/map/units/destroyer_map.webp')
    expect(loaded).toHaveBeenCalledWith(true)

    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn()
    }
    expect(renderDestroyerWithImage(ctx, { direction: Math.PI / 2 }, 100, 100)).toBe(true)
    expect(ctx.rotate).toHaveBeenLastCalledWith(0)

    renderDestroyerWithImage(ctx, { direction: 0 }, 100, 100)
    expect(ctx.rotate).toHaveBeenLastCalledWith(-Math.PI / 2)
    expect(ctx.drawImage).toHaveBeenCalledTimes(2)

    const southGun = getDestroyerGunSpawnPoint({ direction: Math.PI / 2 }, 100, 100)
    const northGun = getDestroyerGunSpawnPoint({ direction: -Math.PI / 2 }, 100, 100)
    expect(southGun.x).toBeCloseTo(100, 0)
    expect(southGun.y).toBeGreaterThan(100)
    expect(northGun.y).toBeLessThan(100)
  })
})
