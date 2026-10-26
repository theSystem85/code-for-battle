import { describe, expect, it, vi } from 'vitest'
import {
  OFFLINE_SPRITE_MINIMUM_TIER,
  SPRITE_DERIVATIVE_CACHE_MAX_ENTRIES,
  createImmutableSpriteDerivativeUrl,
  isImmutableSpriteDerivativeUrl,
  loadSpriteSheetsWithOverlap,
  offlineSpritePolicyManifest,
  selectOfflineSpriteRepresentations
} from '../../src/pwa/offlineAssetPlan.js'
import { downloadOfflineAssets, yieldOfflineFillToVisibleRequests } from '../../src/pwa/offlineAssetDownload.js'

function memoryCache() {
  const entries = new Map()
  return {
    async put(url, response) { entries.set(url, response) },
    async match(url) { return entries.get(url) || null },
    async delete(url) { return entries.delete(url) },
    async keys() { return [...entries.keys()] }
  }
}

describe('sprite streaming PWA policy', () => {
  it('[U06200] uses content identity for immutable derivatives without classifying mutable source sheets as immutable', () => {
    const first = createImmutableSpriteDerivativeUrl('/images/prepared/streaming/city.webp', 'source-a1b2c3d4')
    const second = createImmutableSpriteDerivativeUrl('/images/prepared/streaming/city.webp', 'source-e5f6a7b8')
    expect(first).not.toBe(second)
    expect(isImmutableSpriteDerivativeUrl(first)).toBe(true)
    expect(isImmutableSpriteDerivativeUrl('/images/map/sprite_sheets/city.webp')).toBe(false)
    expect(isImmutableSpriteDerivativeUrl('/images/prepared/streaming/city.webp')).toBe(false)
  })

  it('[U06201] overlaps a bounded number of selected loads and preserves result order', async() => {
    let active = 0
    let peak = 0
    const results = await loadSpriteSheetsWithOverlap([
      { id: 'source', selected: false },
      { id: 'coarse', selected: true },
      { id: 'final', selected: true },
      { id: 'unused-density', selected: false }
    ], async(item) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
      return item.id
    }, { concurrency: 2, shouldLoad: item => item.selected })
    expect(results).toEqual(['coarse', 'final'])
    expect(peak).toBe(2)
  })

  it('[U06202] keeps only coarse and the selected final density within the offline quota', () => {
    const entry = (tier, density, size) => ({
      tier,
      density,
      size,
      url: createImmutableSpriteDerivativeUrl(`/images/prepared/streaming/${tier}-${density}.webp`, `content-${tier}-${density}`)
    })
    const plan = selectOfflineSpriteRepresentations([
      entry('coarse', 1, 10),
      entry('intermediate', 1, 10),
      entry('final', 1, 20),
      entry('coarse', 2, 10),
      entry('final', 2, 20)
    ], { selectedDensity: 1, selectedTier: 'final', quotaBytes: 30 })
    expect(OFFLINE_SPRITE_MINIMUM_TIER).toBe('coarse')
    expect(plan.assets.map(asset => asset.tier)).toEqual(['coarse', 'final'])
    expect(plan.bytes).toBe(30)
    expect(plan).toMatchObject({ usable: true, finalIncluded: true })
    expect(SPRITE_DERIVATIVE_CACHE_MAX_ENTRIES).toBeGreaterThan(0)
    expect(offlineSpritePolicyManifest()).toMatchObject({
      minimumTier: 'coarse',
      selectedFinalTierOnly: true,
      selectedDensityOnly: true,
      automaticDerivativeDownload: false
    })

    const coarseOnly = selectOfflineSpriteRepresentations([
      entry('coarse', 1, 10), entry('final', 1, 20)
    ], { selectedDensity: 1, selectedTier: 'final', quotaBytes: 20 })
    expect(coarseOnly.assets.map(asset => asset.tier)).toEqual(['coarse'])
    expect(coarseOnly).toMatchObject({ usable: true, finalIncluded: false })
  })

  it('[U06203] yields every background fill to visible streaming before starting its request', async() => {
    const events = []
    const cache = memoryCache()
    await downloadOfflineAssets({
      assets: [{ url: '/sound/one.mp3', revision: 'one', size: 1 }, { url: '/sound/two.mp3', revision: 'two', size: 1 }],
      cache,
      concurrency: 1,
      waitForDownloadSlot: async asset => { events.push(`visible:${asset.url}`) },
      fetchImpl: async url => {
        events.push(`offline:${url}`)
        return new Response('x', { status: 200 })
      }
    })
    expect(events).toEqual([
      'visible:/sound/one.mp3', 'offline:/sound/one.mp3',
      'visible:/sound/two.mp3', 'offline:/sound/two.mp3'
    ])
  })

  it('[U06204] schedules offline work at background priority when the browser scheduler supports it', async() => {
    const postTask = vi.fn(async callback => callback())
    await yieldOfflineFillToVisibleRequests({ postTask })
    expect(postTask).toHaveBeenCalledWith(expect.any(Function), { priority: 'background' })
  })
})
