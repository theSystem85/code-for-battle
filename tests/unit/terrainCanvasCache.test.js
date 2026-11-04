import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerrainCanvasCache } from '../../src/rendering/terrainCanvasCache.js'

function installCanvases() {
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(tag => {
    if (tag !== 'canvas') return create(tag)
    const context = { setTransform: vi.fn(), clearRect: vi.fn(), globalAlpha: 1, globalCompositeOperation: 'source-over' }
    return { width: 0, height: 0, getContext: () => context }
  })
}

describe('bounded terrain canvas recycling', () => {
  afterEach(() => vi.restoreAllMocks())

  it('[U07070] reuses prepared backing stores across thousands of distinct tile keys without allocating more contexts', async() => {
    installCanvases()
    const cache = new TerrainCanvasCache({ maxEntries: 4, maxBytes: 4 * 32 * 32 * 4 })
    await cache.prepare(32, async() => {})
    const spares = cache.spares, stats = cache.stats
    const first = cache.acquire('first', 32)
    first.getContext('2d').globalCompositeOperation = 'destination-in'
    for (let i = 0; i < 2000; i++) cache.acquire(String(i), 32)
    expect(stats.created).toBe(4)
    expect(stats.bytes).toBe(16384)
    expect(stats.peakBytes).toBe(16384)
    expect(cache.size).toBe(4)
    expect(stats.evicted).toBe(1997)
    expect(first.getContext('2d').globalCompositeOperation).toBe('source-over')
    expect(cache.acquire('1999', 32)).toBe(cache.get('1999'))
    await cache.prepare(32, async() => {})
    expect(cache.stats).toBe(stats)
    expect(cache.spares).toBe(spares)
    expect(stats.created).toBe(4)
  })

  it('[U07071] releases all active and spare pixels on disposal and respects a controlled size change', async() => {
    installCanvases()
    const cache = new TerrainCanvasCache({ maxEntries: 4, maxBytes: 16384 })
    await cache.prepare(32, async() => {})
    const first = cache.acquire('tile', 32)
    const spare = cache.spares[0]
    await cache.prepare(64, async() => {})
    expect(first.width).toBe(0)
    expect(spare.width).toBe(0)
    expect(cache.stats.bytes).toBe(16384)
    expect(cache.spares).toHaveLength(1)
    const large = cache.acquire('large', 64)
    expect(cache.delete('large')).toBe(true)
    expect(large.width).toBe(0)
    cache.clear()
    cache.clear()
    expect(cache.stats.bytes).toBe(0)
    expect(() => cache.acquire('oversize', 128)).toThrow(/byte budget/)
  })
})
