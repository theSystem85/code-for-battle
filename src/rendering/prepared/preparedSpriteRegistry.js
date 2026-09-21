export class PreparedSpriteRegistry {
  constructor({ assetGeneration, density, byteBudget }) {
    if (!Number.isInteger(assetGeneration) || assetGeneration < 0) throw new RangeError('Invalid asset generation')
    if (!Number.isFinite(density) || density <= 0) throw new RangeError('Invalid sprite density')
    if (!Number.isSafeInteger(byteBudget) || byteBudget < 0) throw new RangeError('Invalid sprite byte budget')
    this.assetGeneration = assetGeneration
    this.density = density
    this.byteBudget = byteBudget
    this.decodedBytes = 0
    this.entries = new Map()
    this.disposed = false
  }

  register(key, sprite, { decodedBytes, dispose } = {}) {
    this.#assertActive()
    if (this.entries.has(key)) throw new Error(`Prepared sprite already registered: ${key}`)
    if (!Number.isSafeInteger(decodedBytes) || decodedBytes < 0) throw new RangeError('decodedBytes must be a non-negative safe integer')
    if (this.decodedBytes + decodedBytes > this.byteBudget) throw new Error('Prepared sprite byte budget exceeded')
    this.entries.set(key, { sprite, decodedBytes, dispose })
    this.decodedBytes += decodedBytes
    return sprite
  }

  get(key) {
    this.#assertActive()
    return this.entries.get(key)?.sprite
  }

  dispose() {
    if (this.disposed) return
    for (const entry of this.entries.values()) entry.dispose?.(entry.sprite)
    this.entries.clear()
    this.decodedBytes = 0
    this.disposed = true
  }

  #assertActive() {
    if (this.disposed) throw new Error('PreparedSpriteRegistry has been disposed')
  }
}
