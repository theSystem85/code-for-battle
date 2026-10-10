import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyBlackKey } from '../../src/rendering/blackKeyPixels.js'
import { prepareExplosionInWorker } from '../../src/rendering/explosionPreparation.js'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('explosion preparation', () => {
  it('preserves the original alpha curve for every brightness/alpha combination', () => {
    for (let brightness = 0; brightness < 256; brightness++) {
      for (let alpha = 0; alpha < 256; alpha++) {
        const pixels = new Uint8ClampedArray([brightness, 0, 0, alpha])
        applyBlackKey(pixels)
        const expected = brightness <= 24 ? 0 : brightness < 48 ? Math.round(alpha * ((brightness - 24) / 24)) : alpha
        expect(pixels[3]).toBe(expected)
        expect(pixels[0]).toBe(brightness)
      }
    }
  })

  it('returns a startup fallback when worker canvas support is missing', async() => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    expect(await prepareExplosionInWorker({})).toBeNull()
  })

  it('transfers each bitmap, serializes jobs and terminates finished workers', async() => {
    const workers = []
    const inputs = []
    vi.stubGlobal('OffscreenCanvas', class {})
    vi.stubGlobal('createImageBitmap', vi.fn(async() => {
      const bitmap = { close: vi.fn() }
      inputs.push(bitmap)
      return bitmap
    }))
    vi.stubGlobal('Worker', class {
      constructor() { this.terminate = vi.fn(); this.postMessage = vi.fn(); workers.push(this) }
    })
    const first = prepareExplosionInWorker({})
    const second = prepareExplosionInWorker({})
    await vi.waitFor(() => expect(workers).toHaveLength(1))
    expect(workers[0].postMessage).toHaveBeenCalledWith({ image: inputs[0] }, [inputs[0]])
    const texture = { width: 1024, height: 1024 }
    workers[0].onmessage({ data: { texture } })
    expect(await first).toBe(texture)
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(workers).toHaveLength(2))
    workers[1].onmessage({ data: { texture } })
    await second
    expect(inputs[0].close).not.toHaveBeenCalled()
    expect(workers[1].terminate).toHaveBeenCalledOnce()
  })

  it('releases untransferred inputs on startup failure and permits the next job', async() => {
    const close = vi.fn()
    vi.stubGlobal('OffscreenCanvas', class {})
    vi.stubGlobal('createImageBitmap', vi.fn(async() => ({ close })))
    vi.stubGlobal('Worker', class { constructor() { throw new Error('CSP blocks worker') } })
    await expect(prepareExplosionInWorker({})).rejects.toThrow('CSP blocks worker')
    expect(close).toHaveBeenCalledOnce()
    vi.stubGlobal('OffscreenCanvas', undefined)
    expect(await prepareExplosionInWorker({})).toBeNull()
  })

  it('terminates a hung worker and unblocks the preparation queue', async() => {
    vi.useFakeTimers()
    const terminate = vi.fn()
    vi.stubGlobal('OffscreenCanvas', class {})
    vi.stubGlobal('createImageBitmap', vi.fn(async() => ({ close: vi.fn() })))
    vi.stubGlobal('Worker', class {
      constructor() { this.terminate = terminate }
      postMessage() {}
    })
    const job = prepareExplosionInWorker({})
    const rejected = expect(job).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10000)
    await rejected
    expect(terminate).toHaveBeenCalledOnce()
  })
})
