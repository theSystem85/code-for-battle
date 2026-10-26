import { SPRITE_STREAMING_BYTE_CLASSES } from '../spriteStreamingDiagnostics.js'
import { createSpriteReservationToken, createSpriteReleaseToken } from '../spriteStreamingLifecycle.js'

const NATIVE_BYTE_CLASSES = new Set(['reserved', 'staging', 'transfer', 'resident'])

export class SpriteResourceBudgetError extends Error {
  constructor(byteClass, requested, available) {
    super(`Sprite ${byteClass} budget exceeded: requested ${requested}, available ${available}`)
    this.name = 'SpriteResourceBudgetError'
    this.byteClass = byteClass
    this.requested = requested
    this.available = available
  }
}

function requireBytes(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new RangeError('Invalid resource bytes')
  return bytes
}

function closeValue(value) {
  if (typeof value?.close === 'function') value.close()
}

function sameGenerations(left, right) {
  return left?.asset === right?.asset && left?.map === right?.map && left?.density === right?.density
}

/**
 * Owns the complete native-byte lifetime of streamed sprite images. A resource
 * may have many atlas/tier/source views, but its allocations are charged once.
 * GPU bytes are estimates and deliberately excluded from the native total.
 */
export class SpriteResourceStore {
  constructor({ budgets = {}, diagnostics = null } = {}) {
    this.budgets = Object.fromEntries(SPRITE_STREAMING_BYTE_CLASSES.map(name => [name, budgets[name] ?? Infinity]))
    this.totals = Object.fromEntries(SPRITE_STREAMING_BYTE_CLASSES.map(name => [name, 0]))
    this.peaks = { ...this.totals }
    this.diagnostics = diagnostics
    this.reservations = new Map()
    this.resources = new Map()
    this.views = new Map()
    this.publications = new Map()
    this.jobs = new Map()
    this.nextToken = 1
    this.clock = 1
    this.currentGenerations = null
    this.disposed = false
  }

  setCurrentGenerations(generations) {
    if (!Number.isSafeInteger(generations?.asset) || generations.asset < 0 ||
      !Number.isSafeInteger(generations?.map) || generations.map < 0 ||
      !Number.isSafeInteger(generations?.density) || generations.density < 0) {
      throw new RangeError('Invalid sprite resource generations')
    }
    this.currentGenerations = Object.freeze({ ...generations })
    let cancelled = 0
    for (const [key, job] of this.jobs) {
      if (!sameGenerations(job.generations, generations) && this.cancelJob(key, 'superseded-generation')) cancelled++
    }
    return cancelled
  }

  reserve({ owner, byteClass, bytes, generation = 0, tier = 0 }) {
    if (this.disposed) throw new Error('Sprite resource store is disposed')
    if (!SPRITE_STREAMING_BYTE_CLASSES.includes(byteClass)) throw new TypeError('Invalid sprite byte class')
    requireBytes(bytes)
    let available = this.budgets[byteClass] - this.totals[byteClass]
    if (byteClass === 'resident' && bytes > available) {
      this.evict(bytes - Math.max(0, available))
      available = this.budgets[byteClass] - this.totals[byteClass]
    }
    if (bytes > available) throw new SpriteResourceBudgetError(byteClass, bytes, Math.max(0, available))
    const token = createSpriteReservationToken({
      tokenId: `sprite-resource-${this.nextToken++}`,
      owner,
      byteClass,
      bytes,
      generation
    })
    this.reservations.set(token.tokenId, { token, tier })
    this.totals[byteClass] += bytes
    this.peaks[byteClass] = Math.max(this.peaks[byteClass], this.totals[byteClass])
    this.diagnostics?.recordBytes(SPRITE_STREAMING_BYTE_CLASSES.indexOf(byteClass), generation, tier, bytes)
    return token
  }

  release(token, reason = 'released') {
    const record = this.reservations.get(token?.tokenId)
    if (!record) return false
    this.reservations.delete(token.tokenId)
    this.totals[record.token.byteClass] -= record.token.bytes
    this.diagnostics?.recordBytes(
      SPRITE_STREAMING_BYTE_CLASSES.indexOf(record.token.byteClass),
      record.token.generation,
      record.tier,
      -record.token.bytes
    )
    return createSpriteReleaseToken(record.token, reason)
  }

  registerResource({ resourceId, value, allocations, generation = 0, tier = 0, kind = 'bitmap' }) {
    if (typeof resourceId !== 'string' || !resourceId || this.resources.has(resourceId)) throw new TypeError('Invalid or duplicate resource id')
    if (!Array.isArray(allocations) || allocations.length === 0) throw new TypeError('Resource allocations are required')
    const tokens = []
    try {
      for (const allocation of allocations) {
        tokens.push(this.reserve({ owner: resourceId, generation, tier, ...allocation }))
      }
    } catch (error) {
      for (const token of tokens) this.release(token, 'registration-rollback')
      closeValue(value)
      throw error
    }
    this.resources.set(resourceId, {
      resourceId, value, tokens, generation, tier, kind, references: 0, pins: 0,
      lastUsed: this.clock++, closed: false
    })
    return this.acquire(resourceId)
  }

  acquire(resourceId) {
    const resource = this.resources.get(resourceId)
    if (!resource || resource.closed) return null
    resource.references++
    resource.lastUsed = this.clock++
    let released = false
    return Object.freeze({
      resourceId,
      value: resource.value,
      release: () => {
        if (released) return false
        released = true
        resource.references--
        return true
      }
    })
  }

  registerView(viewId, resourceId, metadata = null) {
    if (typeof viewId !== 'string' || !viewId || this.views.has(viewId)) throw new TypeError('Invalid or duplicate resource view id')
    if (!this.resources.has(resourceId)) throw new Error('Resource view target is unavailable')
    this.views.set(viewId, Object.freeze({ viewId, resourceId, metadata }))
    return this.views.get(viewId)
  }

  lookupView(viewId) {
    const view = this.views.get(viewId)
    const resource = view && this.resources.get(view.resourceId)
    if (!resource || resource.closed) return null
    resource.lastUsed = this.clock++
    return Object.freeze({ ...view, value: resource.value })
  }

  pin(resourceId) {
    const resource = this.resources.get(resourceId)
    if (!resource || resource.closed) return false
    resource.pins++
    return true
  }

  unpin(resourceId) {
    const resource = this.resources.get(resourceId)
    if (!resource || resource.pins === 0) return false
    resource.pins--
    return true
  }

  /** Pin exactly the resources which are visible in the current frame. */
  setVisible(spriteIds = []) {
    const visible = new Set(spriteIds)
    for (const resource of this.resources.values()) resource.pins = 0
    for (const spriteId of visible) {
      const publication = this.publications.get(spriteId)
      const resource = publication && this.resources.get(publication.resourceId)
      if (resource && !resource.closed) resource.pins++
    }
  }

  publish(spriteId, publication) {
    const resource = this.resources.get(publication?.resourceId)
    if (!resource || resource.closed) return false
    if (this.currentGenerations && !sameGenerations(publication.generations, this.currentGenerations)) return false
    const previous = this.publications.get(spriteId)
    if (previous && publication.revision <= previous.revision) return false
    resource.references++
    resource.lastUsed = this.clock++
    this.publications.set(spriteId, Object.freeze({ spriteId, ...publication }))
    if (previous) this.releasePublicationReference(previous)
    return true
  }

  lookup(spriteId) {
    const publication = this.publications.get(spriteId)
    const resource = publication && this.resources.get(publication.resourceId)
    if (!resource || resource.closed) return null
    resource.lastUsed = this.clock++
    return Object.freeze({ ...publication, value: resource.value })
  }

  remove(spriteId) {
    const publication = this.publications.get(spriteId)
    if (!publication) return false
    this.publications.delete(spriteId)
    this.releasePublicationReference(publication)
    return true
  }

  releasePublicationReference(publication) {
    const resource = this.resources.get(publication.resourceId)
    if (resource) resource.references--
  }

  evict(bytesNeeded = 0) {
    const candidates = [...this.resources.values()]
      .filter(resource => resource.references === 0 && resource.pins === 0)
      .sort((left, right) => left.lastUsed - right.lastUsed)
    let freed = 0
    for (const resource of candidates) {
      if (freed >= bytesNeeded && bytesNeeded > 0) break
      freed += this.resourceNativeBytes(resource)
      this.disposeResource(resource.resourceId, 'evicted')
    }
    return freed
  }

  resourceNativeBytes(resource) {
    return resource.tokens.reduce((sum, token) => sum + (NATIVE_BYTE_CLASSES.has(token.byteClass) ? token.bytes : 0), 0)
  }

  disposeResource(resourceId, reason = 'disposed') {
    const resource = this.resources.get(resourceId)
    if (!resource || resource.closed || resource.references > 0 || resource.pins > 0) return false
    // A stale lookup must never survive resource teardown, even when a caller
    // forgot to remove an unpublished/failed tier explicitly.
    for (const [spriteId, publication] of this.publications) {
      if (publication.resourceId === resourceId) this.remove(spriteId)
    }
    if (resource.references > 0) return false
    resource.closed = true
    closeValue(resource.value)
    for (const token of resource.tokens) this.release(token, reason)
    for (const [viewId, view] of this.views) if (view.resourceId === resourceId) this.views.delete(viewId)
    this.resources.delete(resourceId)
    return true
  }

  /** Dedupe only active work. Rejections/timeouts are removed so callers retry. */
  runJob(key, { generations, timeoutMs, operation, stop = null }) {
    if (this.disposed) return Promise.reject(new Error('Sprite resource store is disposed'))
    const current = this.jobs.get(key)
    if (current && sameGenerations(current.generations, generations)) return current.promise
    if (current) this.cancelJob(key, 'superseded')
    const job = { generations, active: true, stop, timer: null, promise: null }
    const operationPromise = Promise.resolve().then(() => operation())
    const guarded = new Promise((resolve, reject) => {
      if (Number.isFinite(timeoutMs) && timeoutMs >= 0) {
        job.timer = setTimeout(() => {
          job.active = false
          stop?.('timeout')
          reject(new Error(`Sprite resource job timed out: ${key}`))
        }, timeoutMs)
      }
      operationPromise.then(value => {
        if (!job.active || this.jobs.get(key) !== job) {
          closeValue(value)
          reject(new Error(`Sprite resource job discarded: ${key}`))
          return
        }
        resolve(value)
      }, reject)
    })
    job.promise = guarded.finally(() => {
      if (job.timer !== null) clearTimeout(job.timer)
      if (this.jobs.get(key) === job) this.jobs.delete(key)
    })
    this.jobs.set(key, job)
    return job.promise
  }

  cancelJob(key, reason = 'cancelled') {
    const job = this.jobs.get(key)
    if (!job) return false
    this.jobs.delete(key)
    job.active = false
    if (job.timer !== null) clearTimeout(job.timer)
    job.stop?.(reason)
    return true
  }

  cancelGenerations(generations, reason = 'generation-cancelled') {
    let count = 0
    for (const [key, job] of this.jobs) {
      if (sameGenerations(job.generations, generations) && this.cancelJob(key, reason)) count++
    }
    return count
  }

  snapshot() {
    return Object.freeze({
      totals: Object.freeze({ ...this.totals }),
      peaks: Object.freeze({ ...this.peaks }),
      nativeBytes: [...NATIVE_BYTE_CLASSES].reduce((sum, name) => sum + this.totals[name], 0),
      gpuEstimateBytes: this.totals['gpu-estimate'],
      resources: this.resources.size,
      views: this.views.size,
      publications: this.publications.size,
      jobs: this.jobs.size
    })
  }

  dispose() {
    if (this.disposed) return
    for (const key of [...this.jobs.keys()]) this.cancelJob(key, 'store-disposed')
    this.publications.clear()
    for (const resource of this.resources.values()) resource.references = 0
    for (const resourceId of [...this.resources.keys()]) this.disposeResource(resourceId, 'store-disposed')
    for (const { token } of [...this.reservations.values()]) this.release(token, 'store-disposed')
    this.views.clear()
    this.disposed = true
  }
}
