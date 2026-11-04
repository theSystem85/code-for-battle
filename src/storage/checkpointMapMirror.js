import { RENDER_REVISION_DOMAINS } from '../rendering/prepared/renderRevisionStore.js'

const DOMAINS = [RENDER_REVISION_DOMAINS.TOPOLOGY, RENDER_REVISION_DOMAINS.SURFACE,
  RENDER_REVISION_DOMAINS.RESOURCE, RENDER_REVISION_DOMAINS.DECAL, RENDER_REVISION_DOMAINS.LAYOUT]
const CITY_FIELDS = ['id', 'type', 'owner', 'x', 'y', 'width', 'height', 'health', 'maxHealth']

// Read-only projection: never decorate or mutate simulation tiles. Chunk copies
// are immutable after posting, so an encoder can retain a consistent cut while
// subsequent simulation ticks continue changing the live map.
export class CheckpointMapMirror {
  constructor({ serializeTile, onReset = () => {}, onChunk = () => {},
    yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)), clock = () => performance.now(), budgetMs = 2 } = {}) {
    Object.assign(this, { serializeTile, onReset, onChunk, yieldTask, clock, budgetMs })
    this.generation = 0
    this.grid = null
    this.chunks = []
  }

  reset() {
    this.generation++
    this.grid = null
    this.chunks = []
  }

  matches(record, store) {
    if (!record || record.store !== store) return false
    if (!store || store.disposed) return false
    for (let i = 0; i < DOMAINS.length; i++) {
      if (record.revisions[i] !== store.getChunkRevision(DOMAINS[i], record.chunkX, record.chunkY)) return false
    }
    // City HP changes are intentionally not terrain invalidations until death.
    for (const city of record.cities) for (const key of CITY_FIELDS) {
      if (city.live[key] !== city.saved[key]) return false
    }
    return true
  }

  async synchronize(grid, getStore) {
    const width = grid[0]?.length || 0, height = grid.length
    let store = getStore()
    if (!store && width * height > 256) throw new Error('A large checkpoint requires map mutation revisions')
    if (this.grid !== grid || this.width !== width || this.height !== height || this.store !== store) {
      this.reset()
      Object.assign(this, { grid, width, height, store })
      this.onReset({ width, height, generation: this.generation })
    }
    const generation = this.generation
    const chunkSize = store?.chunkSize || 16
    const columns = Math.ceil(width / chunkSize), rows = Math.ceil(height / chunkSize)
    let sliceStart = this.clock()
    // Without a revision producer, copy every chunk once. Actual game maps use
    // the lifecycle revision store; final consistency checks below use it.
    let copiedWithoutStore = false
    for (;;) {
      for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < columns; cx++) {
        if (generation !== this.generation || getStore() !== store) throw new DOMException('Checkpoint map replaced', 'AbortError')
        const index = cy * columns + cx
        if (this.matches(this.chunks[index], store) || (!store && copiedWithoutStore)) continue
        const x = cx * chunkSize, y = cy * chunkSize
        const data = [], cities = []
        for (let dy = 0; dy < Math.min(chunkSize, height - y); dy++) {
          const row = []
          for (let dx = 0; dx < Math.min(chunkSize, width - x); dx++) {
            const live = grid[y + dy][x + dx]
            const saved = this.serializeTile(live)
            row.push(saved)
            if (live.cityBuilding) cities.push({ live: live.cityBuilding, saved: saved.cityBuilding })
          }
          data.push(row)
        }
        const record = { chunkX: cx, chunkY: cy, x, y, rows: data, cities, store,
          revisions: DOMAINS.map(domain => store?.getChunkRevision(domain, cx, cy) || 0) }
        this.chunks[index] = record
        this.onChunk({ x, y, rows: data, generation })
        if (this.clock() - sliceStart >= this.budgetMs) {
          await this.yieldTask()
          sliceStart = this.clock()
        }
      }
      copiedWithoutStore = true
      // No yield between this validation and the caller's dynamic snapshot.
      // synchronizeAndCapture below deliberately performs both in one task.
      if (!store || this.chunks.every(record => this.matches(record, store))) return generation
      store = getStore()
      if (store !== this.store) throw new DOMException('Checkpoint map replaced', 'AbortError')
    }
  }

  async synchronizeAndCapture(grid, getStore, capture) {
    for (;;) {
      const generation = await this.synchronize(grid, getStore)
      if (generation !== this.generation) throw new DOMException('Checkpoint map replaced', 'AbortError')
      const store = getStore()
      if (store && !this.chunks.every(record => this.matches(record, store))) continue
      return capture(generation)
    }
  }

  snapshotRows() {
    const rows = Array.from({ length: this.height }, () => new Array(this.width))
    for (const chunk of this.chunks) for (let y = 0; y < chunk.rows.length; y++) {
      for (let x = 0; x < chunk.rows[y].length; x++) rows[chunk.y + y][chunk.x + x] = chunk.rows[y][x]
    }
    return rows
  }
}
