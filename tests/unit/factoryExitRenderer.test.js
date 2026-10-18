import { describe, it, expect, vi } from 'vitest'
import { PreparedSpriteRegistry } from '../../src/rendering/prepared/preparedSpriteRegistry.js'
import { prepareFactoryExitSprites, renderFactoryInterior, renderFactoryExitEffects } from '../../src/rendering/factoryExitRenderer.js'
import { TILE_SIZE } from '../../src/config.js'

function context() {
  return { scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })), fill: vi.fn(), transform: vi.fn(),
    drawImage: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    arc: vi.fn(), ellipse: vi.fn(), globalAlpha: 1 }
}

describe('prepared factory garage rendering', () => {
  it.each([1, 3])('[U01553] prepares bounded alpha masks once at DPR %s and reuses them for draws', density => {
    const registry = new PreparedSpriteRegistry({ assetGeneration: 1, density, byteBudget: 1024 * 1024 })
    const source = { width: 96 * density, height: 96 * density }
    registry.register(`test@${density}:building:vehicleFactory:base`, { image: source }, { decodedBytes: 0 })
    const contexts = []
    const create = vi.spyOn(document, 'createElement').mockImplementation(() => {
      const ctx = context()
      contexts.push(ctx)
      return { width: 0, height: 0, getContext: () => ctx }
    })
    try {
      prepareFactoryExitSprites(registry, 'test')
      expect(registry.decodedBytes).toBe((2 * (TILE_SIZE * 3 * density) ** 2 + (16 * density) ** 2) * 4)
      expect(contexts[1].drawImage).toHaveBeenCalledWith(source, 0, 0, TILE_SIZE * 3, TILE_SIZE * 3)
      expect(contexts[1].globalCompositeOperation).toBe('source-in')
      const ctx = context()
      const scroll = { x: 0, y: 0 }
      const factory = { type: 'vehicleFactory', x: 5, y: 5 }
      const unit = { x: 160, y: 160, factoryExit: { factoryX: 5, factoryY: 5, elapsed: 600, duration: 1200, phase: 'moving' } }
      for (let i = 0; i < 10; i++) {
        renderFactoryInterior(ctx, factory, scroll, registry)
        renderFactoryExitEffects(ctx, unit, scroll, registry)
      }
      expect(create).toHaveBeenCalledTimes(3)
      expect(ctx.clip).toHaveBeenCalledTimes(10)
      expect(ctx.drawImage).toHaveBeenCalledTimes(30)
      const mask = registry.get('factoryExit:shadow')
      registry.dispose()
      expect(mask.width).toBe(0)
    } finally { create.mockRestore() }
  })
})

describe('clipOutsideFactoryBody', () => {
  it('[U01554] clips exiting units with an even-odd mask around the factory body and ignores others', async() => {
    const { clipOutsideFactoryBody } = await import('../../src/rendering/factoryExitRenderer.js')
    const calls = []
    const ctx = new Proxy({}, { get: (_t, key) => (...args) => calls.push([key, ...args]) })
    expect(clipOutsideFactoryBody(ctx, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(false)
    const unit = { x: 100, y: 120, factoryExit: { factoryX: 3, factoryY: 3 } }
    expect(clipOutsideFactoryBody(ctx, unit, { x: 0, y: 0 })).toBe(true)
    expect(calls.at(-1)).toEqual(['clip', 'evenodd'])
    expect(calls.some(([key]) => key === 'rect')).toBe(true)
  })
})
