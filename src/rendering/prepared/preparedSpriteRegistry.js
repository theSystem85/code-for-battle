import { SpriteResourceStore } from './spriteResourceStore.js'

function sourceOf(sprite) {
  return sprite?.image || sprite?.source || sprite
}

export class PreparedSpriteRegistry {
  constructor({ assetGeneration, density, byteBudget, resourceStore = null, mapGeneration = 0 }) {
    if (!Number.isInteger(assetGeneration) || assetGeneration < 0) throw new RangeError('Invalid asset generation')
    if (!Number.isFinite(density) || density <= 0) throw new RangeError('Invalid sprite density')
    if (!Number.isSafeInteger(byteBudget) || byteBudget < 0) throw new RangeError('Invalid sprite byte budget')
    this.assetGeneration = assetGeneration
    this.density = density
    this.byteBudget = byteBudget
    this.decodedBytes = 0
    this.entries = new Map()
    this.disposed = false
    this.store = resourceStore || new SpriteResourceStore({ budgets: { resident: byteBudget } })
    this.ownsStore = !resourceStore
    this.generations = Object.freeze({ asset: assetGeneration, map: mapGeneration, density: Math.round(density * 1000) })
    this.store.setCurrentGenerations(this.generations)
    this.sourceResources = new WeakMap()
    this.nextResourceId = 1
    this.revision = 0
  }

  register(key, sprite, { decodedBytes, dispose } = {}) {
    this.#assertActive()
    if (!Number.isSafeInteger(decodedBytes) || decodedBytes < 0) throw new RangeError('decodedBytes must be a non-negative safe integer')
    const existing = this.entries.get(key)
    if (existing) {
      if (existing.source === sourceOf(sprite) && existing.requestedBytes === decodedBytes && existing.dispose === dispose) return existing.sprite
      throw new Error(`Prepared sprite incompatible replacement: ${key}`)
    }
    const source = sourceOf(sprite)
    const objectSource = source && (typeof source === 'object' || typeof source === 'function')
    let sourceRecord = objectSource ? this.sourceResources.get(source) : null
    let resourceId = sourceRecord?.resourceId
    let ownsResource = false
    if (!resourceId && decodedBytes > 0) {
      const width = source?.naturalWidth || source?.width
      const height = source?.naturalHeight || source?.height
      const sourceBytes = Number.isSafeInteger(width * height * 4) && width > 0 && height > 0
        ? width * height * 4
        : decodedBytes
      if (this.decodedBytes + sourceBytes > this.byteBudget) throw new Error('Prepared sprite byte budget exceeded')
      resourceId = `prepared-source-${this.assetGeneration}-${this.nextResourceId++}`
      const handle = this.store.registerResource({
        resourceId,
        // The registry disposer owns the decoded source. Keeping the store
        // value non-closeable prevents two owners from closing one bitmap.
        value: { source },
        allocations: [{ byteClass: 'resident', bytes: sourceBytes }],
        generation: this.assetGeneration
      })
      handle.release()
      sourceRecord = { resourceId, references: 0, decodedBytes: sourceBytes, dispose, sprite }
      if (objectSource) this.sourceResources.set(source, sourceRecord)
      this.decodedBytes += sourceBytes
      ownsResource = true
    }
    if (resourceId) {
      this.store.registerView(key, resourceId, { sprite })
      if (!this.store.publish(key, { resourceId, revision: ++this.revision, tier: 0, generations: this.generations })) {
        if (ownsResource) this.store.disposeResource(resourceId, 'registration-failed')
        throw new Error(`Prepared sprite publication failed: ${key}`)
      }
    }
    if (sourceRecord) sourceRecord.references++
    this.entries.set(key, { sprite, source, sourceRecord, requestedBytes: decodedBytes, decodedBytes: ownsResource ? decodedBytes : 0, dispose, resourceId })
    return sprite
  }

  registerView(key, resourceId, metadata) {
    this.#assertActive()
    return this.store.registerView(key, resourceId, metadata)
  }

  get(key) {
    this.#assertActive()
    return this.entries.get(key)?.sprite
  }

  remove(key) {
    this.#assertActive()
    const entry = this.entries.get(key)
    if (!entry) return false
    this.store.cancelJob(key, 'registry-entry-removed')
    this.store.remove(key)
    this.entries.delete(key)
    if (entry.sourceRecord && --entry.sourceRecord.references === 0) {
      this.store.disposeResource(entry.resourceId, 'registry-entry-removed')
      entry.sourceRecord.dispose?.(entry.sourceRecord.sprite)
      this.decodedBytes -= entry.sourceRecord.decodedBytes
      if (entry.source && (typeof entry.source === 'object' || typeof entry.source === 'function')) this.sourceResources.delete(entry.source)
    } else if (!entry.sourceRecord) entry.dispose?.(entry.sprite)
    return true
  }

  dispose() {
    if (this.disposed) return
    for (const key of [...this.entries.keys()]) this.remove(key)
    if (this.ownsStore) this.store.dispose()
    this.disposed = true
  }

  #assertActive() {
    if (this.disposed) throw new Error('PreparedSpriteRegistry has been disposed')
  }
}
