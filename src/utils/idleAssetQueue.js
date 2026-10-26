export const IDLE_ASSET_PRIORITIES = Object.freeze({ VISIBLE_COARSE: 0, LOOKAHEAD: 1, VISIBLE_REFINEMENT: 2, OPTIONAL: 3 })
const PRIORITY_COUNT = 4

function defaultSchedule(callback) {
  if (typeof globalThis.requestIdleCallback === 'function') return globalThis.requestIdleCallback(callback, { timeout: 1000 })
  // A timer is only a chance to re-check foreground slack, not an idle-period claim.
  return setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 16)
}

function normalizePriority(value) {
  if (value === true) return IDLE_ASSET_PRIORITIES.VISIBLE_COARSE
  if (value === false || value === undefined) return IDLE_ASSET_PRIORITIES.OPTIONAL
  const priority = typeof value === 'object' ? value.priority ?? IDLE_ASSET_PRIORITIES.OPTIONAL : value
  if (!Number.isInteger(priority) || priority < 0 || priority >= PRIORITY_COUNT) throw new RangeError('Invalid idle asset priority')
  return priority
}

function generationKey(generations) {
  if (generations === undefined || generations === null) return ''
  if (Number.isSafeInteger(generations)) return String(generations)
  const { asset, map, density } = generations
  if (![asset, map, density].every(value => Number.isSafeInteger(value) && value >= 0)) throw new RangeError('Invalid idle asset generation')
  return `${asset}:${map}:${density}`
}

function abortError(reason = 'Sprite asset request cancelled') {
  const error = new Error(reason)
  error.name = 'AbortError'
  return error
}

// Dispatches small, budgeted batches. Promise settlement is also scheduled so a
// large worker batch cannot create an unbounded main-thread microtask burst.
export function createIdleAssetQueue(load, {
  concurrency = 2, maxReservedBytes = Number.POSITIVE_INFINITY, maxStartsPerTurn = 2,
  maxCompletionsPerTurn = 4, minIdleMs = 1, agingTurns = 8, maxRetries = 1,
  retryDelayTurns = 2, maxQueued = 512, hasForegroundSlack = () => true, schedule = defaultSchedule
} = {}) {
  if (typeof load !== 'function') throw new TypeError('Idle asset queue requires a loader')
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('Invalid idle asset concurrency')
  const queues = Array.from({ length: PRIORITY_COUNT }, () => new Map())
  const jobs = new Map()
  const completions = []
  const cancelledGenerations = new Set()
  let reservedBytes = 0
  let running = 0
  let scheduled = false
  let turn = 0
  let sequence = 0

  const hasPending = () => queues.some(queue => queue.size)
  const canUseTurn = deadline => !deadline || deadline.timeRemaining?.() >= minIdleMs || Boolean(deadline.didTimeout && hasForegroundSlack())
  const settle = ({ job, value, error }) => {
    reservedBytes -= job.bytes
    running--
    if (job.cancelled || cancelledGenerations.has(job.generationKey)) {
      jobs.delete(job.key)
      job.reject(abortError(job.cancelReason))
    } else if (error && job.attempts <= job.maxRetries) {
      job.readyTurn = turn + retryDelayTurns
      queues[job.priority].set(job.key, job)
    } else {
      jobs.delete(job.key)
      if (error) job.reject(error)
      else job.resolve(value)
    }
  }
  const selectJob = () => {
    let selected = null
    let selectedQueue = null
    for (let priority = 0; priority < PRIORITY_COUNT; priority++) {
      for (const job of queues[priority].values()) {
        if (job.readyTurn > turn || job.bytes + reservedBytes > maxReservedBytes) continue
        const effectivePriority = Math.max(0, priority - Math.floor((turn - job.enqueuedTurn) / agingTurns))
        if (!selected || effectivePriority < selected.effectivePriority ||
          (effectivePriority === selected.effectivePriority && job.sequence < selected.job.sequence)) {
          selected = { job, effectivePriority }
          selectedQueue = queues[priority]
        }
      }
    }
    if (!selected) return null
    selectedQueue.delete(selected.job.key)
    return selected.job
  }
  const kick = () => {
    if (scheduled || (!hasPending() && !completions.length) || (!completions.length && running >= concurrency)) return
    scheduled = true
    schedule(pump)
  }
  const pump = deadline => {
    scheduled = false
    turn++
    let completed = 0
    while (completions.length && completed++ < maxCompletionsPerTurn) settle(completions.shift())
    if (!canUseTurn(deadline)) {
      kick()
      return
    }
    let starts = 0
    while (running < concurrency && starts < maxStartsPerTurn) {
      const job = selectJob()
      if (!job) break
      if (job.cancelled || cancelledGenerations.has(job.generationKey)) {
        jobs.delete(job.key)
        job.reject(abortError(job.cancelReason))
        continue
      }
      running++
      starts++
      reservedBytes += job.bytes
      job.attempts++
      Promise.resolve().then(() => load(job.id, job)).then(value => {
        if (job.boundedCompletion) completions.push({ job, value })
        else settle({ job, value })
      }, error => {
        if (job.boundedCompletion) completions.push({ job, error })
        else settle({ job, error })
      }).finally(kick)
    }
    kick()
  }
  return {
    request(id, priorityOrOptions = false) {
      const options = typeof priorityOrOptions === 'object' && priorityOrOptions !== null ? priorityOrOptions : {}
      const generation = generationKey(options.generations)
      const key = `${String(id)}\u0000${generation}`
      const existing = jobs.get(key)
      const priority = normalizePriority(priorityOrOptions)
      if (existing) {
        if (priority < existing.priority && queues[existing.priority].delete(key)) {
          existing.priority = priority
          queues[priority].set(key, existing)
        }
        return existing.promise
      }
      if (jobs.size >= maxQueued) {
        let displaced = null
        for (let candidatePriority = PRIORITY_COUNT - 1; candidatePriority > priority && !displaced; candidatePriority--) {
          for (const candidate of queues[candidatePriority].values()) displaced = candidate
        }
        if (!displaced) return Promise.reject(new RangeError('Idle asset queue capacity exceeded'))
        queues[displaced.priority].delete(displaced.key)
        jobs.delete(displaced.key)
        displaced.reject(abortError('Displaced by urgent sprite demand'))
      }
      const bytes = options.bytes ?? 0
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maxReservedBytes) return Promise.reject(new RangeError('Invalid idle asset byte reservation'))
      let resolve
      let reject
      const promise = new Promise((res, rej) => { resolve = res; reject = rej })
      const job = { id: String(id), key, generationKey: generation, bytes, priority, promise, resolve, reject,
        boundedCompletion: typeof priorityOrOptions === 'object' && priorityOrOptions !== null,
        attempts: 0, maxRetries: options.maxRetries ?? maxRetries, enqueuedTurn: turn,
        readyTurn: turn, sequence: sequence++, cancelled: false, cancelReason: '' }
      jobs.set(key, job)
      queues[priority].set(key, job)
      kick()
      return promise
    },
    cancelGeneration(generations, reason = 'Generation superseded') {
      const key = generationKey(generations)
      cancelledGenerations.add(key)
      for (const job of jobs.values()) {
        if (job.generationKey !== key) continue
        job.cancelled = true
        job.cancelReason = reason
        if (queues[job.priority].delete(job.key)) {
          jobs.delete(job.key)
          job.reject(abortError(reason))
        }
      }
      kick()
    },
    cancel(id, generations, reason = 'Request no longer demanded') {
      const key = `${String(id)}\u0000${generationKey(generations)}`
      const job = jobs.get(key)
      if (!job) return false
      job.cancelled = true
      job.cancelReason = reason
      if (queues[job.priority].delete(key)) {
        jobs.delete(key)
        job.reject(abortError(reason))
      }
      return true
    },
    getStats: () => Object.freeze({ queued: queues.reduce((sum, queue) => sum + queue.size, 0), running, reservedBytes, completions: completions.length })
  }
}
