import {
  createSpriteWorkerRequest,
  SPRITE_WORKER_FALLBACKS,
  SPRITE_WORKER_OPERATIONS,
  SPRITE_WORKER_RESULT_KINDS
} from './spriteStreamingProtocol.js'

const DEFAULT_GENERATIONS = Object.freeze({ asset: 0, map: 0, density: 0 })

function closePayload(payload) {
  payload?.bitmap?.close?.()
  for (const group of payload?.groups || []) group.bitmap?.close?.()
}

function sameGenerations(a, b) {
  return a.asset === b.asset && a.map === b.map && a.density === b.density
}

/** Persistent, byte-bounded workers. Publication remains the caller's responsibility. */
export function createSpritePreparationPool({
  size = 2,
  maxBytes = 64 * 1024 * 1024,
  maxQueue = 32,
  timeoutMs = 15_000,
  workerFactory = () => new globalThis.Worker(new URL('./spritePreparation.worker.js', import.meta.url), { type: 'module' }),
  capabilities = globalThis
} = {}) {
  const supported = typeof capabilities.Worker === 'function' && typeof capabilities.OffscreenCanvas === 'function' && typeof capabilities.createImageBitmap === 'function'
  let sequence = 0
  let disposed = false
  let reservedBytes = 0
  const queue = []
  const workers = []
  const generations = { ...DEFAULT_GENERATIONS }

  const explicitUnavailable = reason => Object.freeze({
    state: 'preparation-unavailable',
    fallback: SPRITE_WORKER_FALLBACKS.CONTROLLED_LOADING,
    reason
  })

  function rejectJob(job, error) {
    reservedBytes -= job.estimatedBytes
    job.reject(error)
  }

  function finish(slot, result) {
    const job = slot.job
    if (!job) { closePayload(result?.payload); return }
    clearTimeout(slot.timer)
    slot.job = null
    reservedBytes -= job.estimatedBytes
    if (result.kind === SPRITE_WORKER_RESULT_KINDS.COMPLETE && sameGenerations(result.generations, generations)) job.resolve(result.payload)
    else {
      closePayload(result.payload)
      if (result.kind === SPRITE_WORKER_RESULT_KINDS.ERROR) job.reject(new Error(result.errorCode || 'sprite-preparation-failed'))
      else job.reject(new DOMException('Sprite preparation cancelled', 'AbortError'))
    }
    drain()
  }

  function replace(slot, reason) {
    slot.worker?.terminate()
    if (slot.job) {
      clearTimeout(slot.timer)
      rejectJob(slot.job, new Error(reason))
      slot.job = null
    }
    if (!disposed) startWorker(slot)
    drain()
  }

  function startWorker(slot) {
    try {
      const worker = workerFactory()
      slot.worker = worker
      slot.ready = false
      worker.onmessage = ({ data }) => {
        if (slot.worker !== worker) { closePayload(data?.payload); return }
        if (data?.kind === SPRITE_WORKER_RESULT_KINDS.CAPABILITIES) {
          slot.ready = Boolean(data.payload?.offscreenCanvas && data.payload?.imageBitmap && data.payload?.transferableImageBitmap)
          if (!slot.ready) {
            worker.terminate()
            slot.worker = null
            for (const job of queue.splice(0)) {
              reservedBytes -= job.estimatedBytes
              job.resolve(explicitUnavailable('worker-handshake-failed'))
            }
          } else drain()
          return
        }
        finish(slot, data)
      }
      worker.onerror = () => replace(slot, 'sprite-worker-crashed')
      worker.postMessage(createSpriteWorkerRequest({ requestId: `capability:${slot.id}`, operation: SPRITE_WORKER_OPERATIONS.CAPABILITIES, generations }))
    } catch {
      slot.worker = null
      slot.ready = false
    }
  }

  function drain() {
    if (disposed) return
    for (const slot of workers) {
      if (!slot.ready || slot.job || !queue.length) continue
      const job = queue.shift()
      if (!sameGenerations(job.generations, generations)) {
        rejectJob(job, new DOMException('Sprite preparation cancelled', 'AbortError'))
        continue
      }
      slot.job = job
      slot.timer = setTimeout(() => replace(slot, 'sprite-worker-timeout'), timeoutMs)
      slot.worker.postMessage(job.request)
    }
  }

  if (supported) {
    for (let id = 0; id < Math.max(1, Math.min(4, size)); id++) {
      const slot = { id, worker: null, ready: false, job: null, timer: null }
      workers.push(slot)
      startWorker(slot)
    }
  }

  function prepare(payload, { estimatedBytes, jobGenerations = generations, signal } = {}) {
    if (disposed) return Promise.reject(new Error('sprite-preparation-pool-disposed'))
    if (!supported || !workers.some(slot => slot.worker)) return Promise.resolve(explicitUnavailable('worker-capabilities-or-csp'))
    if (!Number.isSafeInteger(estimatedBytes) || estimatedBytes <= 0 || estimatedBytes > maxBytes) return Promise.reject(new RangeError('Invalid sprite preparation byte reservation'))
    if (queue.length >= maxQueue || reservedBytes + estimatedBytes > maxBytes) return Promise.reject(new Error('sprite-preparation-backpressure'))
    const requestId = `sprite-preparation:${++sequence}`
    const request = createSpriteWorkerRequest({ requestId, operation: SPRITE_WORKER_OPERATIONS.PREPARE_SHEET, generations: jobGenerations, payload })
    return new Promise((resolve, reject) => {
      const job = { request, generations: { ...jobGenerations }, estimatedBytes, resolve, reject }
      if (signal?.aborted) { reject(new DOMException('Sprite preparation cancelled', 'AbortError')); return }
      signal?.addEventListener('abort', () => cancelRequest(requestId), { once: true })
      reservedBytes += estimatedBytes
      queue.push(job)
      drain()
    })
  }

  function cancelRequest(requestId) {
    const queuedIndex = queue.findIndex(job => job.request.requestId === requestId)
    if (queuedIndex >= 0) {
      const [job] = queue.splice(queuedIndex, 1)
      rejectJob(job, new DOMException('Sprite preparation cancelled', 'AbortError'))
      return
    }
    const slot = workers.find(candidate => candidate.job?.request.requestId === requestId)
    if (slot) replace(slot, 'sprite-preparation-cancelled')
  }

  function cancelGeneration(next, reason = 'superseded') {
    Object.assign(generations, next)
    for (let i = queue.length - 1; i >= 0; i--) {
      if (!sameGenerations(queue[i].generations, generations)) rejectJob(queue.splice(i, 1)[0], new DOMException(reason, 'AbortError'))
    }
    for (const slot of workers) if (slot.job && !sameGenerations(slot.job.generations, generations)) replace(slot, reason)
  }

  function dispose() {
    disposed = true
    for (const job of queue.splice(0)) rejectJob(job, new DOMException('Pool disposed', 'AbortError'))
    for (const slot of workers) {
      if (slot.job) rejectJob(slot.job, new DOMException('Pool disposed', 'AbortError'))
      clearTimeout(slot.timer)
      slot.worker?.terminate()
      slot.job = null
    }
  }

  return Object.freeze({ prepare, cancelGeneration, dispose, get reservedBytes() { return reservedBytes }, get queued() { return queue.length } })
}
