export const RENDER_REVISION_DOMAINS = Object.freeze({
  SURFACE: 1,
  TOPOLOGY: 2,
  WATER: 3,
  RESOURCE: 4,
  DECAL: 5,
  ASSET: 6,
  LAYOUT: 7
})

const DOMAIN_COUNT = Object.keys(RENDER_REVISION_DOMAINS).length

function assertDomain(domain) {
  if (!Number.isInteger(domain) || domain < 1 || domain > DOMAIN_COUNT) {
    throw new RangeError(`Unknown render revision domain: ${domain}`)
  }
}

function normalizeBounds(bounds, width, height) {
  const left = Math.max(0, Math.floor(bounds.left))
  const top = Math.max(0, Math.floor(bounds.top))
  const right = Math.min(width, Math.ceil(bounds.right))
  const bottom = Math.min(height, Math.ceil(bounds.bottom))
  return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) }
}

export class RenderRevisionStore {
  constructor({ width, height, chunkSize = 16 }) {
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new RangeError('RenderRevisionStore dimensions must be positive integers')
    }
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new RangeError('RenderRevisionStore chunkSize must be a positive integer')
    }
    this.width = width
    this.height = height
    this.chunkSize = chunkSize
    this.chunkColumns = Math.ceil(width / chunkSize)
    this.chunkRows = Math.ceil(height / chunkSize)
    this.revisions = Array.from(
      { length: DOMAIN_COUNT },
      () => new Uint32Array(this.chunkColumns * this.chunkRows)
    )
    this.generations = new Uint32Array(DOMAIN_COUNT)
    this.transactionDepth = 0
    this.pending = Array.from({ length: DOMAIN_COUNT }, () => null)
    this.disposed = false
  }

  getChunkRevision(domain, chunkX, chunkY) {
    this.#assertActive()
    assertDomain(domain)
    if (chunkX < 0 || chunkY < 0 || chunkX >= this.chunkColumns || chunkY >= this.chunkRows) return 0
    return this.revisions[domain - 1][chunkY * this.chunkColumns + chunkX]
  }

  getGeneration(domain) {
    this.#assertActive()
    assertDomain(domain)
    return this.generations[domain - 1]
  }

  invalidate(domain, oldBounds, newBounds = oldBounds, halo = 0) {
    this.#assertActive()
    assertDomain(domain)
    if (!Number.isFinite(halo) || halo < 0) throw new RangeError('Invalidation halo must be non-negative')
    const oldArea = normalizeBounds(oldBounds, this.width, this.height)
    const newArea = normalizeBounds(newBounds, this.width, this.height)
    const area = normalizeBounds({
      left: Math.min(oldArea.left, newArea.left) - halo,
      top: Math.min(oldArea.top, newArea.top) - halo,
      right: Math.max(oldArea.right, newArea.right) + halo,
      bottom: Math.max(oldArea.bottom, newArea.bottom) + halo
    }, this.width, this.height)
    if (this.transactionDepth > 0) {
      this.pending[domain - 1] = mergeBounds(this.pending[domain - 1], area)
      return
    }
    this.#apply(domain, area)
  }

  invalidateAll(domain) {
    this.invalidate(domain, { left: 0, top: 0, right: this.width, bottom: this.height })
  }

  beginTransaction() {
    this.#assertActive()
    this.transactionDepth++
  }

  commitTransaction() {
    this.#assertActive()
    if (this.transactionDepth === 0) throw new Error('No render revision transaction is active')
    this.transactionDepth--
    if (this.transactionDepth !== 0) return
    for (let index = 0; index < this.pending.length; index++) {
      const area = this.pending[index]
      if (area) this.#apply(index + 1, area)
      this.pending[index] = null
    }
  }

  cancelTransaction() {
    this.#assertActive()
    if (this.transactionDepth === 0) throw new Error('No render revision transaction is active')
    this.transactionDepth = 0
    this.pending.fill(null)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.revisions = []
    this.pending = []
  }

  #apply(domain, area) {
    if (area.left === area.right || area.top === area.bottom) return
    const revision = ++this.generations[domain - 1]
    const minX = Math.floor(area.left / this.chunkSize)
    const maxX = Math.floor((area.right - 1) / this.chunkSize)
    const minY = Math.floor(area.top / this.chunkSize)
    const maxY = Math.floor((area.bottom - 1) / this.chunkSize)
    const chunks = this.revisions[domain - 1]
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) chunks[y * this.chunkColumns + x] = revision
    }
  }

  #assertActive() {
    if (this.disposed) throw new Error('RenderRevisionStore has been disposed')
  }
}

function mergeBounds(first, second) {
  if (!first) return second
  return {
    left: Math.min(first.left, second.left),
    top: Math.min(first.top, second.top),
    right: Math.max(first.right, second.right),
    bottom: Math.max(first.bottom, second.bottom)
  }
}
