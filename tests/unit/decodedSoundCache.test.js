import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDecodedSoundCache,
  shareInflightDecode
} from '../../src/audio/decodedSoundCache.js'
import { decodedSoundCache } from '../../src/sound.js'
import { SOUND_VERSION_STORAGE_KEY, setSoundVersion } from '../../src/audio/soundVersionPreference.js'
import { initializeGameStorage, removeStoredItem } from '../../src/storage/indexedDbStorage.js'

function buffer(bytes) {
  return { length: bytes / 4, numberOfChannels: 1 }
}

describe('decoded sound cache', () => {
  beforeEach(async() => {
    await initializeGameStorage()
    removeStoredItem(SOUND_VERSION_STORAGE_KEY)
    decodedSoundCache.clear()
  })

  it('[U07262] evicts the oldest unused buffer when the byte cap is crossed', () => {
    const cache = createDecodedSoundCache(1000)
    cache.put('a', buffer(400), 400)
    cache.put('b', buffer(400), 400)
    cache.get('a')
    cache.put('c', buffer(400), 400)
    expect(cache.has('a')).toBe(true)
    expect(cache.has('b')).toBe(false)
    expect(cache.has('c')).toBe(true)
    expect(cache.totalBytes).toBe(800)
  })

  it('[U07263] keeps a buffer that is still playing and shares one in-flight decode', async() => {
    const cache = createDecodedSoundCache(1000)
    cache.put('loop', buffer(600), 600)
    cache.retain('loop')
    cache.put('other', buffer(600), 600)
    expect(cache.has('loop')).toBe(true)
    expect(cache.totalBytes).toBe(1200)

    let loads = 0
    const first = shareInflightDecode(cache, 'fresh', () => {
      loads += 1
      return Promise.resolve(buffer(100))
    })
    const second = shareInflightDecode(cache, 'fresh', () => {
      loads += 1
      return Promise.resolve(buffer(100))
    })
    const [left, right] = await Promise.all([first, second])
    expect(loads).toBe(1)
    expect(left).toBe(right)
    expect(cache.has('fresh')).toBe(true)
  })

  it('[U07264] drops both versions of a paired effect when the take changes', () => {
    decodedSoundCache.put('sound/error1.mp3', buffer(400), 400)
    decodedSoundCache.put('sound/legacy/error1.mp3', buffer(400), 400)
    decodedSoundCache.pending.set('sound/error1.mp3', Promise.resolve(buffer(400)))
    setSoundVersion('error1.mp3', true)
    expect(decodedSoundCache.has('sound/error1.mp3')).toBe(false)
    expect(decodedSoundCache.has('sound/legacy/error1.mp3')).toBe(false)
    expect(decodedSoundCache.pending.has('sound/error1.mp3')).toBe(false)
  })

  it('[U07265] does not store a decode that was cancelled while it was in flight', async() => {
    const cache = createDecodedSoundCache(1000)
    let finish
    const pending = shareInflightDecode(cache, 'sound/error1.mp3', () => new Promise(resolve => {
      finish = resolve
    }))
    await Promise.resolve()
    cache.delete('sound/error1.mp3')
    finish(buffer(100))
    await pending
    expect(cache.has('sound/error1.mp3')).toBe(false)
  })
})
