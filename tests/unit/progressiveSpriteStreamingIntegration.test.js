import { describe, expect, it, vi } from 'vitest'
import {
  createProgressiveSpriteStreamer,
  getProgressiveSpriteCacheKey
} from '../../src/rendering/prepared/preparedSpritePipeline.js'

const generations = density => ({ asset: density, map: 1, density })
const manifest = signature => ({
  spriteId: 'terrain:trees',
  signature,
  logicalWidth: 128,
  logicalHeight: 64,
  sources: [
    { tier: 0, backingDensity: 0.5, x: 2, y: 4, width: 64, height: 32, decodedBytes: 8192 },
    { tier: 2, backingDensity: 1, x: 70, y: 8, width: 128, height: 64, decodedBytes: 32768 }
  ]
})

const schedule = callback => Promise.resolve().then(() => callback({ didTimeout: true, timeRemaining: () => 5 }))
const settle = async() => {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('progressive sprite streaming integration', () => {
  it('[U06205] publishes coarse geometry first and promotes a settled demand without changing logical size', async() => {
    const publications = []
    const streamer = createProgressiveSpriteStreamer({
      loadTier: vi.fn(async(_manifest, source) => ({ tier: source.tier, close: vi.fn() })),
      onPublish: publication => publications.push(publication),
      schedule
    })

    const staged = streamer.stage([manifest('asset-v1')], { generations: generations(1), finalDensity: 2 })
    expect(staged[0].logicalWidth).toBe(128)
    expect(streamer.lookup('terrain:trees')).toBeNull()
    await settle()

    expect(streamer.lookup('terrain:trees')).toEqual(expect.objectContaining({
      tier: 0,
      finalDensity: 2,
      currentDensity: 0.5,
      logicalWidth: 128,
      sourceRect: { x: 2, y: 4, width: 64, height: 32 }
    }))

    streamer.updateDemand({ visibleSpriteIds: ['terrain:trees'], moving: false, capturedAt: 1000 })
    streamer.updateDemand({ visibleSpriteIds: ['terrain:trees'], moving: false, capturedAt: 1300 })
    await settle()

    expect(streamer.lookup('terrain:trees')).toEqual(expect.objectContaining({
      tier: 2,
      finalDensity: 2,
      currentDensity: 1,
      logicalHeight: 64,
      sourceRect: { x: 70, y: 8, width: 128, height: 64 }
    }))
    expect(publications.map(item => item.tier)).toEqual([0, 2])
    expect(publications[1].cacheKey).toBe(getProgressiveSpriteCacheKey('asset-v1', 2, 2, 'terrain:trees'))
    streamer.dispose()
  })

  it('[U06206] rejects a late prior-generation decode instead of replacing current art', async() => {
    let releaseOld
    const oldDecode = new Promise(resolve => { releaseOld = resolve })
    const loadTier = vi.fn((entry, source) => entry.signature === 'old'
      ? oldDecode
      : Promise.resolve({ signature: entry.signature, tier: source.tier, close: vi.fn() }))
    const published = []
    const streamer = createProgressiveSpriteStreamer({ loadTier, onPublish: item => published.push(item), schedule })

    streamer.stage([manifest('old')], { generations: generations(1), finalDensity: 1 })
    await settle()
    streamer.stage([manifest('current')], { generations: generations(2), finalDensity: 2 })
    releaseOld({ signature: 'old', close: vi.fn() })
    await settle()
    await settle()

    expect(streamer.lookup('terrain:trees')).toEqual(expect.objectContaining({ finalDensity: 2, tier: 0 }))
    expect(published).toHaveLength(1)
    expect(published[0].cacheKey).toContain('current@2:terrain:trees@tier:0')
    streamer.dispose()
  })
})
