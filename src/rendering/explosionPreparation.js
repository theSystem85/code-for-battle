// Presentation assets only. Never sends simulation state or consumes game RNG.
// One queued job at a time; workers terminate after transferring their bitmap.
let queue = Promise.resolve()

export function prepareExplosionInWorker(image) {
  if (typeof globalThis.Worker !== 'function' || typeof globalThis.OffscreenCanvas !== 'function' || typeof globalThis.createImageBitmap !== 'function') {
    return Promise.resolve(null)
  }
  const job = queue.then(() => prepare(image))
  queue = job.catch(() => {})
  return job
}

async function prepare(image) {
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
      worker?.terminate()
      if (!transferred) bitmap.close()
      if (error) reject(error)
      else resolve(texture)
    }
    try {
      worker = new Worker(new URL('./explosionPreparation.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data.texture)
      worker.onerror = event => {
        event.preventDefault?.()
        finish(new Error('Explosion preparation worker failed'))
      }
      worker.onmessageerror = () => finish(new Error('Explosion preparation transfer failed'))
      timeout = setTimeout(() => finish(new Error('Explosion preparation timed out')), 10000)
      worker.postMessage({ image: bitmap }, [bitmap])
      transferred = true
    } catch (error) {
      finish(error)
    }
  })
}
