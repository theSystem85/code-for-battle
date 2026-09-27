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

export function hasOfflineFileCount(done, total) {
  return Number(total) > 0 && Number.isFinite(Number(done))
}

export function formatOfflineFileCount(done, total, filesWord = 'files') {
  if (!hasOfflineFileCount(done, total)) return ''
  return `${done}/${total} ${filesWord || 'files'}`
}

export function formatOfflineCacheDetail({ bytes = 0, done = null, total = null, filesWord = 'files' } = {}) {
  const size = formatCachedByteSize(bytes)
  const files = formatOfflineFileCount(done, total, filesWord)
  return files ? `${size} · ${files}` : size
}

export function formatOfflineCacheTooltip({
  ready = false,
  percent = 0,
  bytes = 0,
  done = null,
  total = null,
  filesWord = 'files',
  preparingTemplate = 'Preparing offline cache… {percent}%',
  preparingFilesTemplate = 'Preparing offline cache… {size} · {done}/{total} files',
  readyTemplate = 'Offline ready, {size} cached',
  readyFilesTemplate = 'Offline ready, {size} · {done}/{total} files'
} = {}) {
  const files = hasOfflineFileCount(done, total)
  if (!ready) {
    if (files) {
      return String(preparingFilesTemplate)
        .replaceAll('{size}', formatCachedByteSize(bytes))
        .replaceAll('{done}', String(done))
        .replaceAll('{total}', String(total))
        .replaceAll('{percent}', String(clampPercent(percent)))
    }
    return String(preparingTemplate).replaceAll('{percent}', String(clampPercent(percent)))
  }
  if (files) {
    return String(readyFilesTemplate)
      .replaceAll('{size}', formatCachedByteSize(bytes))
      .replaceAll('{done}', String(done))
      .replaceAll('{total}', String(total))
      .replaceAll('{files}', formatOfflineFileCount(done, total, filesWord))
  }
  return String(readyTemplate).replaceAll('{size}', formatCachedByteSize(bytes))
}

export function formatIncompleteOfflineWarning(template, done, total) {
  const text = String(template || '')
  if (!hasOfflineFileCount(done, total)) {
    return text.replace(/\s*\(\{done\}\/\{total\}\)/g, '')
  }
  return text.replaceAll('{done}', String(done)).replaceAll('{total}', String(total))
}

export function formatOfflineCacheError(template, failure, extra = 0) {
  if (!failure) return ''
  const text = String(template || '{url}: {message}')
    .replaceAll('{url}', failure.url || '')
    .replaceAll('{message}', failure.message || '')
  if (extra > 0) return `${text} (+${extra})`
  return text
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
