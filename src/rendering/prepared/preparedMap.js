export const PREPARED_MAP_STATES = Object.freeze({
  PREPARING: 'preparing',
  READY: 'ready',
  FAILED: 'failed',
  DISPOSED: 'disposed'
})

export class PreparedMap {
  constructor({ generation, assetGeneration, density, byteUsage, resources, disposeResource }) {
    if (!Number.isInteger(generation) || generation < 0) throw new RangeError('Invalid map generation')
    if (!Number.isInteger(assetGeneration) || assetGeneration < 0) throw new RangeError('Invalid asset generation')
    if (!Number.isFinite(density) || density <= 0) throw new RangeError('Invalid prepared-map density')
    this.generation = generation
    this.assetGeneration = assetGeneration
    this.density = density
    this.byteUsage = Object.freeze({ ...byteUsage })
    this.resources = resources
    this.disposeResource = disposeResource
    this.state = PREPARED_MAP_STATES.PREPARING
    this.error = null
  }

  publish() {
    if (this.state !== PREPARED_MAP_STATES.PREPARING) throw new Error('Only a preparing map can be published')
    this.state = PREPARED_MAP_STATES.READY
    return this
  }

  fail(error) {
    if (this.state !== PREPARED_MAP_STATES.PREPARING) throw new Error('Only a preparing map can fail')
    this.error = error instanceof Error ? error : new Error(String(error))
    this.state = PREPARED_MAP_STATES.FAILED
    return this
  }

  isCurrent({ generation, assetGeneration, density }) {
    return this.state === PREPARED_MAP_STATES.READY && this.generation === generation &&
      this.assetGeneration === assetGeneration && this.density === density
  }

  dispose() {
    if (this.state === PREPARED_MAP_STATES.DISPOSED) return
    if (this.disposeResource) this.disposeResource(this.resources)
    this.resources = null
    this.state = PREPARED_MAP_STATES.DISPOSED
  }
}

export class PreparationGeneration {
  constructor(generation) {
    this.generation = generation
    this.controller = new AbortController()
  }

  get signal() { return this.controller.signal }

  cancel(reason = 'Preparation superseded') {
    if (!this.signal.aborted) this.controller.abort(new DOMException(reason, 'AbortError'))
  }

  assertCurrent(currentGeneration) {
    this.signal.throwIfAborted()
    if (currentGeneration !== this.generation) throw new DOMException('Preparation generation is stale', 'AbortError')
  }
}
