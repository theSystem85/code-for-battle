// Decoded Float32 PCM for the shipped effects is about 72 MB if every file is
// kept. iOS WebKit kills the tab well before that once the canvas backing
// stores are also resident. The cache is a byte-capped LRU. A path that is
// still playing (including loops) is retained and is not evicted. Callers share
// one in-flight decode per path, and dropping a path removes that decode so the
// other version of a paired effect is not held as well.

export const MAX_DECODED_SOUND_BYTES = 12 * 1024 * 1024

export function audioBufferBytes(buffer) {
  const frames = buffer?.length || 0
  const channels = buffer?.numberOfChannels || 0
  return frames * channels * 4
}

export function createDecodedSoundCache(maxBytes = MAX_DECODED_SOUND_BYTES) {
  const entries = new Map()
  const pending = new Map()
  const retained = new Map()
  let totalBytes = 0

  function evict(extraBytes) {
    for (const [key, entry] of entries) {
      if (totalBytes + extraBytes <= maxBytes) return
      if ((retained.get(key) || 0) > 0) continue
      entries.delete(key)
      totalBytes -= entry.bytes
    }
  }

  return {
    get maxBytes() { return maxBytes },
    get totalBytes() { return totalBytes },
    get size() { return entries.size },
    get pending() { return pending },
    keys() { return entries.keys() },
    has(key) { return entries.has(key) },
    get(key) {
      const entry = entries.get(key)
      if (!entry) return null
      entries.delete(key)
      entries.set(key, entry)
      return entry.buffer
    },
    put(key, buffer, bytes = audioBufferBytes(buffer)) {
      const existing = entries.get(key)
      if (existing) {
        entries.delete(key)
        totalBytes -= existing.bytes
      }
      evict(bytes)
      entries.set(key, { buffer, bytes })
      totalBytes += bytes
      return buffer
    },
    retain(key) {
      retained.set(key, (retained.get(key) || 0) + 1)
    },
    release(key) {
      const count = (retained.get(key) || 0) - 1
      if (count > 0) retained.set(key, count)
      else retained.delete(key)
      evict(0)
    },
    delete(key) {
      pending.delete(key)
      retained.delete(key)
      const existing = entries.get(key)
      if (!existing) return false
      entries.delete(key)
      totalBytes -= existing.bytes
      return true
    },
    clear() {
      entries.clear()
      pending.clear()
      retained.clear()
      totalBytes = 0
    }
  }
}

export function shareInflightDecode(cache, key, loader) {
  const cached = cache.get(key)
  if (cached) return Promise.resolve(cached)
  const existing = cache.pending.get(key)
  if (existing) return existing
  const promise = Promise.resolve()
    .then(loader)
    .then(buffer => {
      if (cache.pending.get(key) !== promise) return buffer
      cache.pending.delete(key)
      cache.put(key, buffer)
      return buffer
    }, error => {
      if (cache.pending.get(key) === promise) cache.pending.delete(key)
      throw error
    })
  cache.pending.set(key, promise)
  return promise
}
