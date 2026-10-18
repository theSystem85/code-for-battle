import { afterEach, describe, expect, it } from 'vitest'
import { normalizeStorageKeyPrefix, prefixBlobStore, readStorageKeyPrefix } from '../../src/network/storageKeyPrefix.js'

function netlifyStore() {
  const blobs = new Map()
  return {
    blobs,
    async get(key) { return blobs.has(key) ? blobs.get(key) : null },
    async setJSON(key, value) { blobs.set(key, value) },
    async set(key, value) { blobs.set(key, value) },
    async delete(key) { blobs.delete(key) },
    async list({ prefix = '' } = {}) {
      return { blobs: [...blobs.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key, etag: 'e' })) }
    }
  }
}

describe('storage key prefix', () => {
  afterEach(() => {
    delete globalThis.Netlify
    delete process.env.REDIS_KEY_PREFIX
  })

  it('[U05193] accepts dev-style prefixes, treats empty as unprefixed and rejects malformed values', () => {
    expect(normalizeStorageKeyPrefix('dev:')).toBe('dev:')
    expect(normalizeStorageKeyPrefix('  dev: ')).toBe('dev:')
    expect(normalizeStorageKeyPrefix('')).toBe('')
    expect(normalizeStorageKeyPrefix(undefined)).toBe('')
    expect(normalizeStorageKeyPrefix('dev')).toBeNull()
    expect(normalizeStorageKeyPrefix('dev :')).toBeNull()
    expect(normalizeStorageKeyPrefix('a'.repeat(40) + ':')).toBeNull()
  })

  it('[U05194] reads the prefix from the explicit env bag, Netlify.env and process.env, and throws on a typo', () => {
    expect(readStorageKeyPrefix({})).toBe('')
    expect(readStorageKeyPrefix({ REDIS_KEY_PREFIX: 'dev:' })).toBe('dev:')
    globalThis.Netlify = { env: { get: key => (key === 'REDIS_KEY_PREFIX' ? 'dev:' : undefined) } }
    expect(readStorageKeyPrefix({})).toBe('dev:')
    delete globalThis.Netlify
    process.env.REDIS_KEY_PREFIX = 'qa:'
    expect(readStorageKeyPrefix({})).toBe('qa:')
    expect(() => readStorageKeyPrefix({ REDIS_KEY_PREFIX: 'dev' })).toThrow(/REDIS_KEY_PREFIX/)
  })

  it('[U05195] stores every Netlify Blobs key under the prefix and lists keys without it', async() => {
    const raw = netlifyStore()
    const store = prefixBlobStore(raw, 'dev:')
    await store.setJSON('offer:a:b', { offer: 1 })
    await store.set('cand:a:b:1', { candidate: 'x' })
    expect([...raw.blobs.keys()].sort()).toEqual(['dev:cand:a:b:1', 'dev:offer:a:b'])
    expect(await store.get('offer:a:b')).toEqual({ offer: 1 })
    const page = await store.list({ prefix: 'cand:a:b:' })
    expect(page.blobs).toEqual([{ key: 'cand:a:b:1', etag: 'e' }])
    await raw.setJSON('offer:prod', { offer: 2 })
    expect((await store.list({})).blobs.map(blob => blob.key).sort()).toEqual(['cand:a:b:1', 'offer:a:b'])
    await store.delete('offer:a:b')
    expect(raw.blobs.has('dev:offer:a:b')).toBe(false)
    expect(raw.blobs.has('offer:prod')).toBe(true)
  })

  it('[U05196] supports string-prefix list stores and returns the store unchanged without a prefix', async() => {
    const keys = new Map([['dev:mp-stats:open:a', 1], ['mp-stats:open:b', 2]])
    const adapted = { list: async prefix => [...keys.keys()].filter(key => key.startsWith(prefix)) }
    expect(await prefixBlobStore(adapted, 'dev:').list('mp-stats:open:')).toEqual(['mp-stats:open:a'])
    expect(prefixBlobStore(adapted, '')).toBe(adapted)
  })
})
