import { encodeCompactSaveCooperatively } from '../saveFormat.js'

function createCheckpointWorker() {
  // Vite recognizes this constructor form and bundles the worker's imports.
  const { Worker } = globalThis
  return new Worker(new URL('./checkpointEncoding.worker.js', import.meta.url), { type: 'module' })
}

export class CheckpointEncoder {
  constructor({ workerFactory = createCheckpointWorker, timeoutMs = 15000 } = {}) {
    this.pending = new Map()
    this.sequence = 0
    this.timeoutMs = timeoutMs
    try {
      this.worker = workerFactory()
      this.worker.onmessage = ({ data }) => {
        const job = this.pending.get(data.id)
        if (!job) return
        clearTimeout(job.timer)
        this.pending.delete(data.id)
        if (data.error) job.reject(new Error(data.error))
        else if (data.generation !== job.generation) job.reject(new DOMException('Checkpoint generation superseded', 'AbortError'))
        else job.resolve(data.encoded)
      }
      this.worker.onerror = () => this.dispose(new Error('Checkpoint encoder failed'))
    } catch {
      this.worker = null
    }
  }

  send(message) {
    try { this.worker?.postMessage(message) } catch (error) { this.dispose(error) }
  }

  encode(save, generation, mirror, configuration) {
    const fallback = () => {
      // snapshotRows copies references to immutable tile projections, not live
      // simulation objects. Later mirror patches cannot alter this snapshot.
      const state = globalThis.structuredClone(save.state)
      state.mapTileState = mirror.snapshotRows()
      state.gameState = { ...state.gameState, ...globalThis.structuredClone(configuration) }
      return encodeCompactSaveCooperatively({ ...save, state })
    }
    if (!this.worker) return fallback()
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      const timer = setTimeout(() => this.dispose(new Error('Checkpoint encoder timed out')), this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer, generation })
      try { this.worker.postMessage({ type: 'encode', id, generation, save }) } catch (error) { this.dispose(error) }
    }).catch(error => {
      if (error.name === 'AbortError') throw error
      return fallback()
    })
  }

  dispose(error = new DOMException('Checkpoint encoder superseded', 'AbortError')) {
    this.worker?.terminate()
    this.worker = null
    for (const job of this.pending.values()) {
      clearTimeout(job.timer)
      job.reject(error)
    }
    this.pending.clear()
  }
}
