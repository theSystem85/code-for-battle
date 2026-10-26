import { SPRITE_WORKER_OPERATIONS } from './spriteStreamingProtocol.js'

const TWO_PI = Math.PI * 2
function cellSize(width, height) {
  const diagonal = Math.ceil(Math.hypot(width, height)) + 2
  return diagonal % 2 === 0 ? diagonal : diagonal + 1
}
function release(resource) {
  if (typeof resource?.close === 'function') resource.close()
  else if (resource) { resource.width = 0; resource.height = 0 }
}

export function prepareTankRotationRequest(request, sources, {
  canvasFactory = (width, height) => new globalThis.OffscreenCanvas(width, height),
  bitmapFactory = canvas => canvas.transferToImageBitmap()
} = {}) {
  if (request?.operation !== SPRITE_WORKER_OPERATIONS.PREPARE_ROTATIONS) throw new TypeError('Invalid tank rotation operation')
  const entries = []
  const transfer = []
  try {
    for (const set of request.spriteSets) {
      const parts = []
      for (const descriptor of set.sprites) {
        const source = sources[descriptor.sourceIndex]
        if (!source) throw new Error('Missing tank rotation source')
        const size = cellSize(descriptor.backingWidth, descriptor.backingHeight)
        const ss = request.supersample
        const large = canvasFactory(size * ss, size * ss)
        const target = canvasFactory(size, size)
        const frames = []
        try {
          const largeCtx = large.getContext('2d')
          const targetCtx = target.getContext('2d')
          if (!largeCtx || !targetCtx) throw new Error('Tank rotation canvas context is unavailable')
          largeCtx.imageSmoothingEnabled = targetCtx.imageSmoothingEnabled = true
          largeCtx.imageSmoothingQuality = targetCtx.imageSmoothingQuality = 'high'
          for (let index = 0; index < request.steps; index++) {
            largeCtx.setTransform(1, 0, 0, 1, 0, 0)
            largeCtx.clearRect(0, 0, large.width, large.height)
            largeCtx.translate(large.width / 2, large.height / 2)
            largeCtx.rotate(index / request.steps * TWO_PI)
            largeCtx.drawImage(source, -descriptor.backingWidth * ss / 2, -descriptor.backingHeight * ss / 2,
              descriptor.backingWidth * ss, descriptor.backingHeight * ss)
            targetCtx.setTransform(1, 0, 0, 1, 0, 0)
            targetCtx.clearRect(0, 0, size, size)
            targetCtx.drawImage(large, 0, 0, large.width, large.height, 0, 0, size, size)
            const bitmap = bitmapFactory(target)
            frames.push(bitmap)
            transfer.push(bitmap)
          }
        } finally {
          release(large)
          release(target)
        }
        parts.push({ part: descriptor.part, cellSize: size, frames })
      }
      entries.push({ variant: set.variant, parts })
    }
    return { generation: request.generation, entries, transfer }
  } catch (error) {
    for (const bitmap of transfer) release(bitmap)
    throw error
  } finally {
    for (const source of sources) release(source)
  }
}

const isWorker = typeof globalThis.WorkerGlobalScope !== 'undefined' && globalThis instanceof globalThis.WorkerGlobalScope
if (isWorker) {
  globalThis.onmessage = event => {
    try {
      const result = prepareTankRotationRequest(event.data, event.data.sources)
      globalThis.postMessage({ generation: result.generation, entries: result.entries }, result.transfer)
    } catch (error) {
      globalThis.postMessage({ generation: event.data?.generation, error: error instanceof Error ? error.message : String(error) })
    }
  }
}
