import {
  SPRITE_DERIVATIVE_CACHE,
  cacheSelectedOfflineSpriteRepresentations,
  isImmutableSpriteDerivativeUrl
} from '../../pwa/offlineAssetPlan.js'
import { yieldOfflineFillToVisibleRequests } from '../../pwa/offlineAssetDownload.js'

/**
 * Builds selector entries for the active prepared map-sprite manifests. The
 * map-sprite build emits one density-independent coarse/final pair per sheet,
 * so both pages represent the active density bucket.
 */
export function buildMapSpriteOfflineEntries(manifests, { density = 1 } = {}) {
  const entries = []
  for (const manifest of manifests || []) {
    for (const page of manifest?.pages || []) {
      if (!page?.url || !isImmutableSpriteDerivativeUrl(page.url)) continue
      entries.push({
        url: page.url,
        tier: page.tierName,
        density,
        size: Number(page.compressedBytes) || 0,
        sheet: manifest.name || ''
      })
    }
  }
  return entries
}

async function fetchDerivative(entry, fetchImpl) {
  const response = await fetchImpl(entry.url, { credentials: 'same-origin' })
  if (!response || response.status !== 200) {
    throw new Error(`Sprite derivative download failed: ${response?.status || 'empty response'}`)
  }
  return response
}

/**
 * Offline retention for the active density and the final tier: the minimum
 * coarse tier plus the selected final page, nothing else. Stale immutable
 * derivatives outside this selection are removed from the derivative cache.
 */
export async function cacheActiveMapSpriteRepresentations(manifests, {
  density = 1,
  selectedTier = 'final',
  cacheStorage = globalThis.caches,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  waitForDownloadSlot = () => yieldOfflineFillToVisibleRequests()
} = {}) {
  if (typeof cacheStorage?.open !== 'function' || typeof fetchImpl !== 'function') return null
  const entries = buildMapSpriteOfflineEntries(manifests, { density })
  if (!entries.length) return null
  const cache = await cacheStorage.open(SPRITE_DERIVATIVE_CACHE)
  return cacheSelectedOfflineSpriteRepresentations(entries, {
    cache,
    selectedTier,
    selectedDensity: density,
    load: entry => fetchDerivative(entry, fetchImpl),
    waitForDownloadSlot
  })
}
