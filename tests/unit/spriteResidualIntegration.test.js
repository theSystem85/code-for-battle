import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  disposeSpriteResourceLifecycle,
  getSpriteResourceLifecycleStore,
  onSpriteResourceLifecycleTeardown
} from '../../src/rendering/prepared/spriteResourceLifecycle.js'
import { PreparedSpriteRegistry } from '../../src/rendering/prepared/preparedSpriteRegistry.js'
import {
  disposePreparedSpriteRegistry,
  getPreparedDemandRevision,
  publishPreparedSpriteRegistry,
  updatePreparedSpriteDemand
} from '../../src/rendering/prepared/preparedSpritePipeline.js'
import { disposeSpriteSheetTextures } from '../../src/rendering/spriteSheetAnimation.js'
import { TextureManager } from '../../src/rendering/textureManager.js'
import {
  buildMapSpriteOfflineEntries,
  cacheActiveMapSpriteRepresentations
} from '../../src/rendering/prepared/mapSpriteOfflineCache.js'
import { SPRITE_DERIVATIVE_CACHE } from '../../src/pwa/offlineAssetPlan.js'

afterEach(() => {
  disposePreparedSpriteRegistry()
  disposeSpriteResourceLifecycle()
})

function pageUrl(name, identity) {
  return `/images/prepared-map-sprites/${name}?cfb-content=${identity}`
}

function mapManifest(name, { extraTier = false } = {}) {
  const pages = [
    { name: `${name}.coarse.webp`, tier: 0, tierName: 'coarse', backingDensity: 0.5, decodedBytes: 64, compressedBytes: 10, url: pageUrl(`${name}.coarse.webp`, `${name}-coarse-1234`) },
    { name: `${name}.final.webp`, tier: 2, tierName: 'final', backingDensity: 1, decodedBytes: 256, compressedBytes: 40, url: pageUrl(`${name}.final.webp`, `${name}-final-1234`) }
  ]
  if (extraTier) {
    pages.push({ name: `${name}.medium.webp`, tier: 1, tierName: 'medium', backingDensity: 0.75, decodedBytes: 128, compressedBytes: 20, url: pageUrl(`${name}.medium.webp`, `${name}-medium-1234`) })
  }
  return { name, signature: `${name}-signature`, pages }
}

function memoryCacheStorage() {
  const entries = new Map()
  const cache = {
    async put(url, response) { entries.set(url, response) },
    async match(url) { return entries.get(url) || null },
    async delete(url) { return entries.delete(url) },
    async keys() { return [...entries.keys()] }
  }
  return { entries, open: vi.fn(async() => cache) }
}

describe('shared sprite resource lifecycle store (S04)', () => {
  it('[U06215] shares one store between registries without view or resource id collisions', () => {
    const store = getSpriteResourceLifecycleStore()
    const outgoing = new PreparedSpriteRegistry({ assetGeneration: 1, density: 1, byteBudget: 1_000_000, resourceStore: store })
    const incoming = new PreparedSpriteRegistry({ assetGeneration: 1, density: 1, byteBudget: 1_000_000, resourceStore: store })
    incoming.register('unit:tank', { image: { width: 4, height: 4 } }, { decodedBytes: 64 })
    store.setCurrentGenerations(outgoing.generations)
    outgoing.register('unit:tank', { image: { width: 4, height: 4 } }, { decodedBytes: 64 })
    expect(store.snapshot().resources).toBe(2)
    outgoing.dispose()
    expect(store.disposed).toBe(false)
    expect(store.snapshot().resources).toBe(1)
    expect(incoming.get('unit:tank')).toBeTruthy()
    incoming.dispose()
    expect(store.snapshot().totals.resident).toBe(0)
  })

  it('[U06216] tears down every participant before closing the store and starts a fresh lifecycle', () => {
    const first = getSpriteResourceLifecycleStore()
    expect(getSpriteResourceLifecycleStore()).toBe(first)
    const order = []
    const unregister = onSpriteResourceLifecycleTeardown(store => order.push(store.disposed ? 'closed' : 'open'))
    disposeSpriteResourceLifecycle()
    unregister()
    expect(order).toEqual(['open'])
    expect(first.disposed).toBe(true)
    const second = getSpriteResourceLifecycleStore()
    expect(second).not.toBe(first)
    expect(second.disposed).toBe(false)
  })

  it('[U06217] releases explosion sheets without disposing the shared store', () => {
    const store = getSpriteResourceLifecycleStore()
    disposeSpriteSheetTextures()
    expect(store.disposed).toBe(false)
    expect(getSpriteResourceLifecycleStore()).toBe(store)
  })

  it('[U06218] charges the selected map-sprite page to the shared store and releases it when the sheet goes inactive', () => {
    const manager = new TextureManager()
    const manifest = mapManifest('terrain')
    const prepared = { manifest, page: manifest.pages[1] }
    manager.publishPreparedMapSpriteSheet('images/map/sprite_sheets/terrain.webp', prepared)
    const store = getSpriteResourceLifecycleStore()
    expect(store.lookup('map-sprite:images/map/sprite_sheets/terrain.webp')).toEqual(expect.objectContaining({ resourceId: 'map-sprite:terrain-signature:2' }))
    expect(store.snapshot().totals.resident).toBe(256)
    // Resident pressure must not evict the active page.
    expect(store.evict(1_000_000)).toBe(0)
    manager.releaseInactivePreparedMapSpriteResources([])
    expect(store.snapshot().totals.resident).toBe(0)
    expect(store.lookup('map-sprite:images/map/sprite_sheets/terrain.webp')).toBeNull()
  })
})

describe('offline map-sprite representation selection (S09)', () => {
  it('[U06219] builds selector entries for the active density from immutable page URLs only', () => {
    const manifest = mapManifest('terrain')
    manifest.pages.push({ name: 'mutable.webp', tierName: 'final', url: '/images/map/sprite_sheets/terrain.webp', compressedBytes: 5 })
    const entries = buildMapSpriteOfflineEntries([manifest], { density: 2 })
    expect(entries.map(entry => [entry.tier, entry.density])).toEqual([['coarse', 2], ['final', 2]])
  })

  it('[U06220] caches only coarse plus the selected final tier, reuses cached pages and removes stale derivatives', async() => {
    const cacheStorage = memoryCacheStorage()
    const stale = pageUrl('old.final.webp', 'old-final-1234')
    cacheStorage.entries.set(stale, 'stale')
    const cachedCoarse = mapManifest('terrain').pages[0].url
    cacheStorage.entries.set(cachedCoarse, 'cached')
    const fetchImpl = vi.fn(async() => ({ status: 200 }))
    const plan = await cacheActiveMapSpriteRepresentations([mapManifest('terrain', { extraTier: true }), mapManifest('rocks')], {
      density: 1, cacheStorage, fetchImpl, waitForDownloadSlot: async() => {}
    })
    expect(cacheStorage.open).toHaveBeenCalledWith(SPRITE_DERIVATIVE_CACHE)
    expect(plan.finalIncluded).toBe(true)
    expect(plan.assets.map(entry => entry.tier).sort()).toEqual(['coarse', 'coarse', 'final', 'final'])
    const fetched = fetchImpl.mock.calls.map(([url]) => url)
    expect(fetched).not.toContain(cachedCoarse)
    expect(fetched.some(url => url.includes('.medium.'))).toBe(false)
    expect(fetched).toHaveLength(3)
    expect(cacheStorage.entries.has(stale)).toBe(false)
    expect([...cacheStorage.entries.keys()].sort()).toEqual(plan.assets.map(entry => entry.url).sort())
  })

  it('[U06221] selects offline representations once per active selection from the texture manager', async() => {
    const manager = new TextureManager()
    const original = globalThis.caches
    const cacheStorage = memoryCacheStorage()
    globalThis.caches = cacheStorage
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async() => ({ status: 200 }))
    try {
      const first = manager.scheduleOfflineMapSpriteCaching([mapManifest('terrain')], 1)
      expect(manager.scheduleOfflineMapSpriteCaching([mapManifest('terrain')], 1)).toBe(first)
      await first
      expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    } finally {
      globalThis.caches = original
      globalThis.fetch = originalFetch
    }
  })
})

describe('camera-revision gated prepared demand (S05)', () => {
  function publishFakePrepared() {
    const registry = new PreparedSpriteRegistry({ assetGeneration: 7, density: 1, byteBudget: 1_000_000, resourceStore: getSpriteResourceLifecycleStore() })
    const updateDemand = vi.fn(() => true)
    publishPreparedSpriteRegistry({ registry, manifest: { assetVersion: 'test', entries: [] }, density: 1, updateDemand })
    return updateDemand
  }

  it('[U06222] advances the demand revision only when camera or demand inputs change', () => {
    const updateDemand = publishFakePrepared()
    const camera = { x: 10, y: 20, width: 800, height: 600 }
    expect(updatePreparedSpriteDemand({ camera, capturedAt: 0, visibleSpriteIds: [] })).toBe(true)
    const revision = getPreparedDemandRevision()
    for (let frame = 1; frame <= 10; frame++) {
      expect(updatePreparedSpriteDemand({ camera: { ...camera }, capturedAt: frame * 16, visibleSpriteIds: [] })).toBe(false)
    }
    expect(getPreparedDemandRevision()).toBe(revision)
    expect(updateDemand).toHaveBeenCalledTimes(1)
    updatePreparedSpriteDemand({ camera: { ...camera, x: 42 }, capturedAt: 200, visibleSpriteIds: [] })
    expect(getPreparedDemandRevision()).toBe(revision + 1)
    updatePreparedSpriteDemand({ camera: { ...camera, x: 42 }, capturedAt: 216, moving: true, visibleSpriteIds: [] })
    expect(getPreparedDemandRevision()).toBe(revision + 2)
    expect(updateDemand.mock.calls.map(([snapshot]) => snapshot.revision)).toEqual([revision, revision + 1, revision + 2])
  })

  it('[U06223] re-submits an unchanged visible snapshot exactly once after the settle dwell', () => {
    const updateDemand = publishFakePrepared()
    const camera = { x: 0, y: 0, width: 800, height: 600 }
    updatePreparedSpriteDemand({ camera, moving: true, capturedAt: 0, visibleSpriteIds: ['unit:tank'] })
    updatePreparedSpriteDemand({ camera, moving: false, capturedAt: 16, visibleSpriteIds: ['unit:tank'] })
    expect(updateDemand).toHaveBeenCalledTimes(2)
    updatePreparedSpriteDemand({ camera, capturedAt: 100, visibleSpriteIds: ['unit:tank'] })
    expect(updateDemand).toHaveBeenCalledTimes(2)
    updatePreparedSpriteDemand({ camera, capturedAt: 300, visibleSpriteIds: ['unit:tank'] })
    expect(updateDemand).toHaveBeenCalledTimes(3)
    updatePreparedSpriteDemand({ camera, capturedAt: 600, visibleSpriteIds: ['unit:tank'] })
    expect(updateDemand).toHaveBeenCalledTimes(3)
  })
})
