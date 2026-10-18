// Backend key namespace per Netlify deploy.
//
// The dev branch deploy shares production's Upstash Redis database and Netlify
// Blobs stores. Netlify sets REDIS_KEY_PREFIX=dev: for the branch-deploy
// context only, so every Redis key and every Blobs key written by a dev deploy
// starts with "dev:" while production (no variable) stays unprefixed.
const PREFIX_PATTERN = /^[A-Za-z0-9_-]{1,32}:$/

export function normalizeStorageKeyPrefix(value) {
  const prefix = typeof value === 'string' ? value.trim() : ''
  if (!prefix) return ''
  return PREFIX_PATTERN.test(prefix) ? prefix : null
}

function readRuntimeValue() {
  try {
    const netlify = globalThis.Netlify
    if (netlify?.env && typeof netlify.env.get === 'function') {
      const value = netlify.env.get('REDIS_KEY_PREFIX')
      if (typeof value === 'string' && value.trim()) return value
    }
  } catch {
    // Netlify.env.get throws when the variable is not configured.
  }
  try {
    const deno = globalThis['Deno']
    if (deno?.env && typeof deno.env.get === 'function') {
      const value = deno.env.get('REDIS_KEY_PREFIX')
      if (typeof value === 'string' && value.trim()) return value
    }
  } catch {
    // Deno denies env access without permission.
  }
  try {
    const value = typeof process !== 'undefined' ? process.env['REDIS_KEY_PREFIX'] : ''
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

// Returns '' (unprefixed), a valid prefix such as 'dev:', or throws for a
// malformed value so a typo can never fall back to production keys.
export function readStorageKeyPrefix(env = {}) {
  const raw = typeof env.REDIS_KEY_PREFIX === 'string' && env.REDIS_KEY_PREFIX.trim()
    ? env.REDIS_KEY_PREFIX
    : readRuntimeValue()
  const prefix = normalizeStorageKeyPrefix(raw)
  if (prefix === null) throw new Error('REDIS_KEY_PREFIX must look like "dev:" (letters, digits, _ or -, ending in ":")')
  return prefix
}

// Wraps a Netlify Blobs store (get, setJSON, set, delete, list) or the
// adaptNetlifyBlobStore shape (list takes a string prefix) so all keys
// live under the prefix. Listed keys come back without the prefix, so callers
// keep using their usual key names.
export function prefixBlobStore(store, prefix) {
  if (!prefix) return store
  const strip = key => (typeof key === 'string' && key.startsWith(prefix) ? key.slice(prefix.length) : key)
  return {
    get: (key, options) => store.get(`${prefix}${key}`, options),
    set: (key, value, options) => store.set(`${prefix}${key}`, value, options),
    setJSON: (key, value, options) => store.setJSON(`${prefix}${key}`, value, options),
    delete: key => (typeof store.delete === 'function' ? store.delete(`${prefix}${key}`) : undefined),
    async list(options = {}) {
      // adaptNetlifyBlobStore-style stores take a string prefix and return keys.
      if (typeof options === 'string') {
        const keys = await store.list(`${prefix}${options}`)
        return Array.isArray(keys) ? keys.map(strip) : keys
      }
      const page = await store.list({ ...options, prefix: `${prefix}${options.prefix || ''}` })
      if (!page || !Array.isArray(page.blobs)) return page
      return { ...page, blobs: page.blobs.map(blob => ({ ...blob, key: strip(blob.key) })) }
    }
  }
}
