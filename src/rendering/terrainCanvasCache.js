// Fixed byte/entry limits include spare backing stores. Recycle a canvas after
// eviction instead of creating a new DOM/native context for each world tile.
export class TerrainCanvasCache extends Map {
  constructor({ maxEntries = 512, maxBytes = 2 * 1024 * 1024 } = {}) {
    super()
    this.maxEntries = maxEntries
    this.maxBytes = maxBytes
    this.spares = []
    this.stats = { created: 0, poolHits: 0, evicted: 0, released: 0, bytes: 0, peakBytes: 0 }
  }

  create(size) {
    const bytes = size * size * 4
    if (bytes > this.maxBytes) throw new RangeError('Terrain canvas exceeds its byte budget')
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    canvas.getContext('2d')
    this.stats.created++
    this.stats.bytes += bytes
    this.stats.peakBytes = Math.max(this.stats.peakBytes, this.stats.bytes)
    return canvas
  }

  release(canvas) {
    this.stats.bytes -= canvas.width * canvas.height * 4
    canvas.width = canvas.height = 0
    this.stats.released++
  }

  async prepare(size, yieldTask = () => new Promise(resolve => setTimeout(resolve, 0))) {
    if (this.preparedSize && this.preparedSize !== size) this.clear()
    this.preparedSize = size
    const capacity = Math.min(this.maxEntries, Math.floor(this.maxBytes / (size * size * 4)))
    for (let count = this.size + this.spares.length; count < capacity; count++) {
      if (this.stats.bytes + size * size * 4 > this.maxBytes) break
      this.spares.push(this.create(size))
      if ((count + 1) % 32 === 0) await yieldTask()
    }
  }

  acquire(key, size) {
    const hit = super.get(key)
    if (hit) return hit
    const bytes = size * size * 4
    if (bytes > this.maxBytes) throw new RangeError('Terrain canvas exceeds its byte budget')
    let canvas = this.spares.pop()
    if (canvas && (canvas.width !== size || canvas.height !== size)) { this.release(canvas); canvas = null }
    while (this.size >= this.maxEntries || (!canvas && this.stats.bytes + bytes > this.maxBytes)) {
      const oldest = this.keys().next().value
      if (oldest === undefined) {
        const spare = this.spares.pop()
        if (!spare) throw new Error('Terrain canvas byte accounting exhausted')
        this.release(spare)
        continue
      }
      const previous = super.get(oldest)
      super.delete(oldest)
      this.stats.evicted++
      if (!canvas && previous.width === size && previous.height === size) canvas = previous
      else this.release(previous)
    }
    if (canvas) {
      this.stats.poolHits++
      const context = canvas.getContext('2d')
      context.setTransform?.(1, 0, 0, 1, 0, 0)
      context.globalAlpha = 1
      context.globalCompositeOperation = 'source-over'
      context.clearRect(0, 0, size, size)
    } else canvas = this.create(size)
    super.set(key, canvas)
    return canvas
  }

  delete(key) {
    const canvas = super.get(key)
    if (!canvas) return false
    this.release(canvas)
    return super.delete(key)
  }

  clear() {
    for (const canvas of this.values()) this.release(canvas)
    for (const canvas of this.spares) this.release(canvas)
    this.spares.length = 0
    super.clear()
  }
}
