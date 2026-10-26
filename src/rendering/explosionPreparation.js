import { runAssetJob } from '../utils/assetLoading.js'

// Presentation assets only. Never sends simulation state or consumes game RNG.
// One queued job at a time; workers terminate after transferring their bitmap.
let queue = Promise.resolve()

export function prepareExplosionInWorker(image, { store = null, key = 'explosion', generations = null, timeoutMs = 10000 } = {}) {
  if (typeof globalThis.Worker !== 'function' || typeof globalThis.OffscreenCanvas !== 'function' || typeof globalThis.createImageBitmap !== 'function') {
    return Promise.resolve(null)
  }
  const job = queue.then(() => store
    ? runAssetJob(store, key, { generations, timeoutMs, operation: signal => prepare(image, signal, 0) })
    : prepare(image, null, timeoutMs))
  queue = job.catch(() => {})
  return job
}

async function prepare(image, signal, timeoutMs) {
  const { Worker } = globalThis
  const bitmap = await globalThis.createImageBitmap(image)
  return new Promise((resolve, reject) => {
    let worker
    let transferred = false
    let timeout
    let settled = false
    const finish = (error, texture) => {
      if (settled) { texture?.close?.(); return }
      settled = true
      clearTimeout(timeout)
      if (worker) worker.onmessage = worker.onerror = worker.onmessageerror = null
      signal?.removeEventListener('abort', abort)
      worker?.terminate()
      if (!transferred) bitmap.close()
      if (error) reject(error)
      else resolve(texture)
    }
    const abort = () => finish(new Error('Explosion preparation aborted'))
    try {
      worker = new Worker(new URL('./explosionPreparation.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data.texture)
      worker.onerror = event => {
        event.preventDefault?.()
        finish(new Error('Explosion preparation worker failed'))
      }
      worker.onmessageerror = () => finish(new Error('Explosion preparation transfer failed'))
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) return abort()
      if (timeoutMs > 0) timeout = setTimeout(() => finish(new Error('Explosion preparation timed out')), timeoutMs)
      worker.postMessage({ image: bitmap }, [bitmap])
      transferred = true
    } catch (error) {
      finish(error)
    }
  })
}
