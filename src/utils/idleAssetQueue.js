// Dispatch at most one small batch per idle turn; never drain work in a frame callback.
export function createIdleAssetQueue(load, { concurrency = 2, schedule = callback => {
  if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(callback, { timeout: 1000 })
  else setTimeout(callback, 16)
} } = {}) {
  const jobs = new Map()
  const pending = new Map()
  const urgent = new Map()
  let running = 0
  let scheduled = false
  const pump = () => {
    scheduled = false
    while (running < concurrency && (pending.size || urgent.size)) {
      const queue = urgent.size ? urgent : pending
      const [id, job] = queue.entries().next().value
      queue.delete(id)
      running++
      Promise.resolve().then(() => load(id)).then(job.resolve, job.reject).finally(() => {
        running--
        kick()
      })
    }
  }
  const kick = () => {
    if (scheduled || (!pending.size && !urgent.size) || running >= concurrency) return
    scheduled = true
    schedule(pump)
  }
  return {
    request(id, priority = false) {
      if (jobs.has(id)) {
        if (priority && pending.has(id)) {
          urgent.set(id, pending.get(id))
          pending.delete(id)
        }
        return jobs.get(id)
      }
      const promise = new Promise((resolve, reject) => {
        const job = { resolve, reject }
        if (priority) urgent.set(id, job)
        else pending.set(id, job)
      })
      jobs.set(id, promise)
      kick()
      return promise
    }
  }
}
