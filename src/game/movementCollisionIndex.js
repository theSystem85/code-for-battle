import { TILE_SIZE } from '../config.js'

const CELL_SIZE = TILE_SIZE * 2
const HALF_TILE = TILE_SIZE / 2

// Separation checks need live positions. The collision-detection quadtree
// contains pre-movement centers and can miss a unit that has just been pushed.
export class MovementCollisionIndex {
  constructor() {
    this.cells = new Map()
    this.unitCells = new Map()
    this.unitsById = new Map()
    this.bucketPool = []
    this.results = []
    this.stride = 1
  }

  rebuild(units, mapWidth) {
    for (const bucket of this.cells.values()) {
      bucket.length = 0
      this.bucketPool.push(bucket)
    }
    this.cells.clear()
    this.unitCells.clear()
    this.unitsById.clear()
    this.results.length = 0
    this.stride = Math.ceil(mapWidth * TILE_SIZE / CELL_SIZE) + 2

    for (const unit of units) {
      if (!unit) continue
      this.unitsById.set(unit.id, unit)
      this.update(unit)
    }
  }

  update(unit) {
    const cellX = Math.floor((unit.x + HALF_TILE) / CELL_SIZE)
    const cellY = Math.floor((unit.y + HALF_TILE) / CELL_SIZE)
    const key = cellY * this.stride + cellX
    const previousKey = this.unitCells.get(unit)
    if (key === previousKey || !Number.isFinite(key)) return

    if (previousKey !== undefined) {
      const previous = this.cells.get(previousKey)
      const index = previous.indexOf(unit)
      previous[index] = previous[previous.length - 1]
      previous.pop()
      if (previous.length === 0) {
        this.cells.delete(previousKey)
        this.bucketPool.push(previous)
      }
    }

    let bucket = this.cells.get(key)
    if (!bucket) {
      bucket = this.bucketPool.pop() || []
      this.cells.set(key, bucket)
    }
    bucket.push(unit)
    this.unitCells.set(unit, key)
  }

  // Returns a scratch array valid until the next query. The caller does the
  // exact distance and collision eligibility checks using the live entities.
  nearby(centerX, centerY, radius) {
    const results = this.results
    results.length = 0
    const minX = Math.floor((centerX - radius) / CELL_SIZE)
    const maxX = Math.floor((centerX + radius) / CELL_SIZE)
    const minY = Math.floor((centerY - radius) / CELL_SIZE)
    const maxY = Math.floor((centerY + radius) / CELL_SIZE)
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const bucket = this.cells.get(y * this.stride + x)
        if (bucket) {
          for (const unit of bucket) results.push(unit)
        }
      }
    }
    return results
  }
}
