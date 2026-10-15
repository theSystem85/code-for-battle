import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAssetJson, withTimeout } from '../../src/utils/assetLoading.js'
import { loadPreparedImage } from '../../src/rendering/prepared/imagePreparation.js'
import { createIdleAssetQueue } from '../../src/utils/idleAssetQueue.js'

afterEach(() => vi.useRealTimers())

describe('bounded asset operations', () => {
  it('rejects an operation that never settles', async() => {
    vi.useFakeTimers()
    const result = expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10)
    await result
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears the deadline on success and preserves failures', async() => {
    vi.useFakeTimers()
    expect(await withTimeout(Promise.resolve('ready'))).toBe('ready')
    await expect(withTimeout(Promise.reject(new Error('decode failed')))).rejects.toThrow('decode failed')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts timed out JSON requests and rejects HTML fallback responses', async() => {
    vi.useFakeTimers()
    let signal
    const pending = fetchAssetJson('/missing.json', { timeoutMs: 10, fetchImpl: (_url, options) => {
      signal = options.signal
      return new Promise(() => {})
    } })
    const result = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10)
    await result
    expect(signal.aborted).toBe(true)
    await expect(fetchAssetJson('/missing.json', { fetchImpl: async() => ({ ok: true, json: async() => { throw new SyntaxError('HTML') } }) })).rejects.toThrow('HTML')
    await expect(fetchAssetJson('/missing.json', { fetchImpl: async() => ({ ok: false, status: 404 }) })).rejects.toThrow('404')
  })

  it.each(['network', 'decode'])('bounds a hanging image %s and removes handlers', async stage => {
    vi.useFakeTimers()
    const image = { naturalWidth: 32, naturalHeight: 32, decode: () => new Promise(() => {}) }
    const pending = loadPreparedImage('/hang.webp', { imageFactory: () => image, timeoutMs: 10 })
    if (stage === 'decode') image.onload()
    const result = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10)
    await result
    expect(image.onload).toBeNull()
    expect(image.onerror).toBeNull()
    await vi.runAllTimersAsync()
  })

  it('rejects image errors so callers can use their fallback', async() => {
    const image = {}
    const pending = loadPreparedImage('/404.webp', { imageFactory: () => image })
    image.onerror()
    await expect(pending).rejects.toThrow('Failed to load')
  })
})

describe('idle asset queue', () => {
  it('deduplicates work, caps concurrency and promotes on-demand images', async() => {
    const turns = []
    const releases = []
    const started = []
    const queue = createIdleAssetQueue(id => {
      started.push(id)
      return new Promise(resolve => releases.push(resolve))
    }, { concurrency: 2, schedule: callback => turns.push(callback) })
    const first = queue.request('first')
    expect(queue.request('first')).toBe(first)
    queue.request('later')
    queue.request('urgent')
    queue.request('urgent', true)
    expect(started).toEqual([])
    turns.shift()()
    await Promise.resolve()
    expect(started).toEqual(['urgent', 'first'])
    releases.shift()()
    await new Promise(resolve => setTimeout(resolve, 0))
    turns.shift()()
    await Promise.resolve()
    expect(started).toEqual(['urgent', 'first', 'later'])
    for (const release of releases) release()
    await first
  })
})
