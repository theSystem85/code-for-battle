export const RENDER_BYTE_OWNERS = Object.freeze([
  'terrainResident', 'terrainStaging', 'decodedSources', 'sprites',
  'transfer', 'gpuStaging', 'minimap', 'effects'
])

export class RenderByteBudget {
  constructor(limits) {
    this.limits = Object.freeze({ ...limits })
    this.usage = Object.fromEntries(RENDER_BYTE_OWNERS.map(owner => [owner, 0]))
    for (const owner of RENDER_BYTE_OWNERS) {
      if (!Number.isSafeInteger(this.limits[owner]) || this.limits[owner] < 0) {
        throw new RangeError(`Missing or invalid byte limit for ${owner}`)
      }
    }
  }

  reserve(owner, bytes, { signal } = {}) {
    if (!Object.hasOwn(this.usage, owner)) throw new RangeError(`Unknown byte-budget owner: ${owner}`)
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RangeError('Reserved bytes must be a non-negative safe integer')
    signal?.throwIfAborted()
    if (this.usage[owner] + bytes > this.limits[owner]) throw new Error(`${owner} byte budget exceeded`)
    this.usage[owner] += bytes
    let released = false
    return Object.freeze({
      owner,
      bytes,
      release: () => {
        if (released) return
        released = true
        this.usage[owner] -= bytes
      }
    })
  }

  getUsage() {
    return { ...this.usage }
  }
}
