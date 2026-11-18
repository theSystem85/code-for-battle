const WORKER_STAGE_BYTES = 24 * 1024 * 1024
const IDLE_RELEASE_MS = 6000

export function createAtlasCropClient(store) {
  let worker
  let staging
  let idleTimer
  let requestId = 0
  let unavailable = false
  const pending = new Map()

  function settle(id, error, bitmap) {
    const request = pending.get(id)
    if (!request) {
      bitmap?.close()
      return
    }
    pending.delete(id)
    request.signal.removeEventListener('abort', request.abort)
    if (error) request.reject(error)
    else request.resolve(bitmap)
    if (worker && !pending.size) idleTimer = setTimeout(() => stop(), IDLE_RELEASE_MS)
  }

  function stop(error = new Error('Atlas crop worker released')) {
    clearTimeout(idleTimer)
    worker?.terminate()
    worker = null
    if (staging) store.release(staging, 'atlas-crop-worker-stopped')
    staging = null
    for (const id of pending.keys()) settle(id, error)
  }

  return {
    crop(url, rect, width, height, signal) {
      if (unavailable || typeof globalThis.Worker !== 'function' || typeof globalThis.createImageBitmap !== 'function') return Promise.resolve(null)
      return new Promise((resolve, reject) => {
        signal.throwIfAborted()
        clearTimeout(idleTimer)
        if (!worker) {
          try {
            staging = store.reserve({ owner: 'atlas-crop-worker', byteClass: 'staging', bytes: WORKER_STAGE_BYTES })
            worker = new globalThis.Worker(new URL('./atlasCrop.worker.js', import.meta.url), { type: 'module' })
            worker.onmessage = ({ data }) => settle(data.id, data.error && new Error(data.error), data.bitmap)
            worker.onerror = event => {
              event.preventDefault()
              unavailable = true
              stop(new Error('Atlas crop worker failed'))
            }
            worker.onmessageerror = () => stop(new Error('Atlas crop worker transfer failed'))
          } catch (error) {
            stop(error)
            reject(error)
            return
          }
        }
        const id = ++requestId
        // Restart on a timed-out job so wedged work cannot block queued crops.
        const abort = () => stop(signal.reason)
        pending.set(id, { resolve, reject, signal, abort })
        signal.addEventListener('abort', abort, { once: true })
        try {
          worker.postMessage({ id, url: new URL(url, document.baseURI).href, rect, width, height, maxSourceBytes: WORKER_STAGE_BYTES })
        } catch (error) {
          settle(id, error)
        }
      })
    },
    dispose() {
      unavailable = true
      stop()
    }
  }
}
