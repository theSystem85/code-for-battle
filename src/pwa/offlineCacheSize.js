export function clampPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, Math.round(number)))
}

export function formatCachedByteSize(bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size < 0) return '0.0 MB'
  const megabytes = size / (1024 * 1024)
  if (megabytes >= 0.1) return `${megabytes.toFixed(1)} MB`
  const kilobytes = size / 1024
  if (kilobytes >= 0.5) return `${kilobytes.toFixed(1)} KB`
  return `${Math.round(size)} B`
}

export function formatOfflineCacheTooltip({
  ready = false,
  percent = 0,
  bytes = 0,
  preparingTemplate = 'Preparing offline cache… {percent}%',
  readyTemplate = 'Offline ready, {size} cached'
} = {}) {
  if (!ready) {
    return String(preparingTemplate).replace('{percent}', String(clampPercent(percent)))
  }
  return String(readyTemplate).replace('{size}', formatCachedByteSize(bytes))
}

export async function cachedResponseSize(response) {
  if (!response) return 0
  const header = response.headers?.get?.('content-length')
  if (header != null && header !== '') {
    const parsed = Number(header)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  const readable = typeof response.clone === 'function' ? response.clone() : response
  if (typeof readable.blob === 'function') {
    const blob = await readable.blob()
    return Number(blob?.size) || 0
  }
  if (typeof readable.arrayBuffer === 'function') {
    const buffer = await readable.arrayBuffer()
    return buffer?.byteLength || 0
  }
  return 0
}

export async function sumCachedResponseBytes(cacheStorage) {
  if (!cacheStorage || typeof cacheStorage.keys !== 'function') {
    throw new Error('Cache Storage is unavailable')
  }
  const names = await cacheStorage.keys()
  let bytes = 0
  let entries = 0
  for (const name of names) {
    const cache = await cacheStorage.open(name)
    const requests = await cache.keys()
    for (const request of requests) {
      const response = await cache.match(request)
      if (!response) continue
      bytes += await cachedResponseSize(response)
      entries += 1
    }
  }
  return { bytes, entries }
}

export async function resolveOfflineCacheBytes({ cacheStorage, estimate } = {}) {
  try {
    if (cacheStorage) {
      const summed = await sumCachedResponseBytes(cacheStorage)
      return { bytes: summed.bytes, source: 'cache', entries: summed.entries }
    }
  } catch {
    // Fall through to the storage estimate when Cache Storage cannot be read.
  }

  try {
    const estimateFn = estimate
      || (typeof navigator !== 'undefined' ? navigator.storage?.estimate?.bind(navigator.storage) : null)
    if (typeof estimateFn === 'function') {
      const result = await estimateFn()
      if (result && Number.isFinite(result.usage)) {
        return { bytes: result.usage, source: 'estimate', entries: 0 }
      }
    }
  } catch {
    // Both sources failed.
  }

  return { bytes: 0, source: 'none', entries: 0 }
}
