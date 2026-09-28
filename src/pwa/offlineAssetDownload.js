import {
  OFFLINE_ASSET_CONCURRENCY,
  OFFLINE_ASSET_MAX_ATTEMPTS,
  OFFLINE_ASSET_RETRY_BASE_MS,
  OFFLINE_ASSET_REVISION_HEADER,
  contentTypeForAssetUrl,
  normalizeAssetPath
} from './offlineAssetPlan.js'

function headerLength(response, fallback = 0) {
  const parsed = Number(response?.headers?.get?.('content-length'))
  if (Number.isFinite(parsed) && parsed >= 0) return parsed
  return Number(fallback) || 0
}

export async function readCachedAsset(cache, url) {
  if (!cache || typeof cache.match !== 'function') return null
  const response = await cache.match(url, { ignoreSearch: true })
  if (!response) return null
  return {
    response,
    revision: response.headers?.get?.(OFFLINE_ASSET_REVISION_HEADER) || '',
    bytes: headerLength(response)
  }
}

export async function assetRevisionMatches(cache, asset) {
  const cached = await readCachedAsset(cache, asset.url)
  return Boolean(cached && cached.revision === asset.revision)
}

export async function storeOfflineAsset(cache, asset, response) {
  const blob = await response.blob()
  const headers = new Headers()
  const type = response.headers?.get?.('content-type') || contentTypeForAssetUrl(asset.url)
  headers.set('content-type', type)
  headers.set('content-length', String(blob.size))
  headers.set(OFFLINE_ASSET_REVISION_HEADER, asset.revision)
  await cache.put(asset.url, new Response(blob, {
    status: 200,
    statusText: 'OK',
    headers
  }))
  return blob.size
}

export async function cleanupStaleOfflineAssets(cache, assets) {
  if (!cache || typeof cache.keys !== 'function') return []
  const expected = new Map((assets || []).map(asset => [normalizeAssetPath(asset.url), asset.revision]))
  const keys = await cache.keys()
  const removed = []
  for (const request of keys) {
    const path = normalizeAssetPath(request?.url || request)
    const revision = expected.get(path)
    if (!revision) {
      await cache.delete(request)
      removed.push(path)
      continue
    }
    const cached = await cache.match(request)
    const stored = cached?.headers?.get?.(OFFLINE_ASSET_REVISION_HEADER) || ''
    if (stored !== revision) {
      await cache.delete(request)
      removed.push(path)
    }
  }
  return removed
}

function permanentStatus(status) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

async function fetchAssetWithRetry(asset, {
  cache,
  fetchImpl,
  shouldContinue,
  maxAttempts,
  baseDelayMs,
  sleep
}) {
  let lastError = 'failed'
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (!shouldContinue()) return { paused: true }
    try {
      const response = await fetchImpl(asset.url, asset)
      if (!response || response.status !== 200) {
        const status = response?.status || 0
        lastError = status ? `HTTP ${status}` : 'empty response'
        if (permanentStatus(status)) return { ok: false, message: lastError }
      } else {
        const bytes = await storeOfflineAsset(cache, asset, response)
        return { ok: true, bytes }
      }
    } catch (error) {
      if (!shouldContinue()) return { paused: true }
      lastError = error?.message || String(error)
    }
    if (attempt < maxAttempts) {
      if (!shouldContinue()) return { paused: true }
      await sleep(baseDelayMs * (2 ** (attempt - 1)))
    }
  }
  return { ok: false, message: lastError }
}

export async function measureCachedEntries(cache, entries, { requireRevision = false } = {}) {
  const list = entries || []
  let done = 0
  let bytes = 0
  if (!cache) return { done: 0, total: list.length, bytes: 0 }
  for (const entry of list) {
    const cached = await readCachedAsset(cache, entry.url)
    if (!cached) continue
    if (requireRevision && cached.revision !== entry.revision) continue
    done += 1
    bytes += cached.bytes > 0 ? cached.bytes : (Number(entry.size) || 0)
  }
  return { done, total: list.length, bytes }
}

export async function measureOfflineReadiness(cacheStorage, manifest) {
  const bootEntries = manifest?.boot || []
  const bulkEntries = manifest?.assets || []
  const empty = {
    done: 0,
    total: bootEntries.length + bulkEntries.length,
    bytes: 0,
    boot: { done: 0, total: bootEntries.length, bytes: 0 },
    bulk: { done: 0, total: bulkEntries.length, bytes: 0 }
  }
  if (!cacheStorage || typeof cacheStorage.keys !== 'function') return empty
  const names = await cacheStorage.keys()
  const precacheName = names.find(name => String(name).includes('precache'))
  const assetName = names.includes(manifest?.cache) ? manifest.cache : null
  const bootCache = precacheName ? await cacheStorage.open(precacheName) : null
  const assetCache = assetName ? await cacheStorage.open(assetName) : null
  const boot = await measureCachedEntries(bootCache, bootEntries, { requireRevision: false })
  const bulk = await measureCachedEntries(assetCache, bulkEntries, { requireRevision: true })
  return {
    done: boot.done + bulk.done,
    total: boot.total + bulk.total,
    bytes: boot.bytes + bulk.bytes,
    boot,
    bulk
  }
}

export function isOfflinePlayReady({ controlled = false, done = 0, total = 0, failures = [] } = {}) {
  if (controlled !== true) return false
  if (!(Number(total) > 0) || !Number.isFinite(Number(done))) return false
  if (Number(done) !== Number(total)) return false
  if (Array.isArray(failures) && failures.length > 0) return false
  return true
}

export async function downloadOfflineAssets({
  assets = [],
  cache,
  fetchImpl,
  concurrency = OFFLINE_ASSET_CONCURRENCY,
  maxAttempts = OFFLINE_ASSET_MAX_ATTEMPTS,
  baseDelayMs = OFFLINE_ASSET_RETRY_BASE_MS,
  shouldContinue = () => true,
  sleep = (ms) => new Promise(resolve => {
    setTimeout(resolve, ms)
  }),
  onProgress = async() => {}
} = {}) {
  if (!cache || typeof cache.put !== 'function') {
    throw new Error('Cache Storage is unavailable')
  }
  await cleanupStaleOfflineAssets(cache, assets)
  const pending = []
  let done = 0
  let bytes = 0
  for (const asset of assets) {
    if (!shouldContinue()) {
      const paused = {
        done,
        total: assets.length,
        bytes,
        failures: [],
        paused: true,
        complete: false
      }
      await onProgress(paused)
      return paused
    }
    const cached = await readCachedAsset(cache, asset.url)
    if (cached && cached.revision === asset.revision) {
      done += 1
      bytes += cached.bytes > 0 ? cached.bytes : (Number(asset.size) || 0)
    } else {
      pending.push(asset)
    }
  }

  const failures = []
  let paused = false
  let cursor = 0
  const workerCount = Math.max(1, Math.min(concurrency, pending.length || 1))

  async function report() {
    await onProgress({
      done,
      total: assets.length,
      bytes,
      failures: failures.slice(),
      paused,
      complete: !paused && failures.length === 0 && done === assets.length
    })
  }

  async function worker() {
    while (!paused) {
      if (!shouldContinue()) {
        paused = true
        return
      }
      const index = cursor
      cursor += 1
      if (index >= pending.length) return
      const asset = pending[index]
      const result = await fetchAssetWithRetry(asset, {
        cache,
        fetchImpl,
        shouldContinue,
        maxAttempts,
        baseDelayMs,
        sleep
      })
      if (result.paused) {
        paused = true
        return
      }
      if (result.ok) {
        done += 1
        bytes += result.bytes || Number(asset.size) || 0
      } else {
        failures.push({ url: asset.url, message: result.message || 'failed' })
      }
      await report()
    }
  }

  await report()
  if (pending.length > 0 && shouldContinue()) {
    await Promise.all(Array.from({ length: workerCount }, () => worker()))
  } else if (pending.length > 0) {
    paused = true
  }
  const summary = {
    done,
    total: assets.length,
    bytes,
    failures,
    paused,
    complete: !paused && failures.length === 0 && done === assets.length
  }
  await onProgress(summary)
  return summary
}
