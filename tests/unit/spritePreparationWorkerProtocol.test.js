import { describe, expect, it, vi } from 'vitest'
import { createSpritePreparationPool } from '../../src/rendering/spritePreparationPool.js'
import { prepareSpriteSheet } from '../../src/rendering/spritePreparation.worker.js'
import { createSpriteWorkerRequest, SPRITE_WORKER_OPERATIONS } from '../../src/rendering/spriteStreamingProtocol.js'

const generations = { asset: 0, map: 0, density: 0 }

class FakeWorker {
  static instances = []
  constructor() { this.messages = []; FakeWorker.instances.push(this) }
  postMessage(message) {
    this.messages.push(message)
    if (message.operation === SPRITE_WORKER_OPERATIONS.CAPABILITIES) Promise.resolve().then(() => this.onmessage({ data: { kind: 'capabilities', payload: { offscreenCanvas: true, imageBitmap: true, transferableImageBitmap: true } } }))
  }
  terminate() { this.terminated = true }
  complete(payload, resultGenerations = generations) { this.onmessage({ data: { kind: 'complete', generations: resultGenerations, payload } }) }
}

describe('persistent sprite preparation worker protocol', () => {
  it('[U06193] reports an explicit controlled-loading state when worker preparation is unsupported', async() => {
    const pool = createSpritePreparationPool({ capabilities: {} })
    await expect(pool.prepare({ url: '/custom.webp' }, { estimatedBytes: 1024 })).resolves.toEqual(expect.objectContaining({
      state: 'preparation-unavailable', fallback: 'controlled-loading-state'
    }))
  })

  it('[U06194] reuses bounded workers and applies byte/queue backpressure', async() => {
    FakeWorker.instances = []
    const pool = createSpritePreparationPool({ size: 1, maxBytes: 150, maxQueue: 1, workerFactory: () => new FakeWorker(), capabilities: { Worker: FakeWorker, OffscreenCanvas: class {}, createImageBitmap() {} } })
    await Promise.resolve()
    const first = pool.prepare({ url: '/one.webp' }, { estimatedBytes: 100 })
    await expect(pool.prepare({ url: '/two.webp' }, { estimatedBytes: 100 })).rejects.toThrow('backpressure')
    FakeWorker.instances[0].complete({ bitmap: { close: vi.fn() }, groups: [] })
    await expect(first).resolves.toEqual(expect.objectContaining({ groups: [] }))
    expect(FakeWorker.instances).toHaveLength(1)
    expect(pool.reservedBytes).toBe(0)
    pool.dispose()
  })

  it('[U06195] terminates active work on generation cancellation and rejects it', async() => {
    FakeWorker.instances = []
    const pool = createSpritePreparationPool({ size: 1, workerFactory: () => new FakeWorker(), capabilities: { Worker: FakeWorker, OffscreenCanvas: class {}, createImageBitmap() {} } })
    await Promise.resolve()
    const pending = pool.prepare({ url: '/old.webp' }, { estimatedBytes: 100 })
    const staleWorker = FakeWorker.instances[0]
    pool.cancelGeneration({ asset: 1, map: 0, density: 0 })
    await expect(pending).rejects.toThrow('superseded')
    expect(staleWorker.terminated).toBe(true)
    const staleBitmap = { close: vi.fn() }
    staleWorker.complete({ bitmap: staleBitmap, groups: [] })
    expect(staleBitmap.close).toHaveBeenCalledOnce()
    expect(pool.reservedBytes).toBe(0)
    pool.dispose()
  })

  it('[U06196] fetches and decodes in the worker and preserves enclosed dark pixels with metadata-aware keying', async() => {
    const data = new Uint8ClampedArray(3 * 3 * 4).fill(255)
    const dark = (x, y) => { const index = ((y * 3) + x) * 4; data[index] = data[index + 1] = data[index + 2] = 0 }
    dark(0, 0); dark(1, 1)
    const context = { drawImage: vi.fn(), getImageData: () => ({ data }), putImageData: vi.fn() }
    class Canvas { constructor(width, height) { this.width = width; this.height = height } getContext() { return context } }
    const source = { width: 3, height: 3, close: vi.fn() }
    const environment = {
      fetch: vi.fn(async() => ({ ok: true, blob: async() => ({}) })),
      createImageBitmap: vi.fn(async value => value instanceof Canvas ? { prepared: true } : source),
      OffscreenCanvas: Canvas
    }
    const request = createSpriteWorkerRequest({ requestId: 'custom:1', operation: SPRITE_WORKER_OPERATIONS.PREPARE_SHEET, generations, payload: { url: '/custom.webp', metadata: null } })
    const response = await prepareSpriteSheet(request, environment)

    expect(response.kind).toBe('complete')
    expect(data[3]).toBe(0)
    expect(data[((1 * 3 + 1) * 4) + 3]).toBe(255)
    expect(source.close).toHaveBeenCalledOnce()
    expect(environment.fetch).toHaveBeenCalledWith('/custom.webp', { credentials: 'same-origin' })
  })
})
