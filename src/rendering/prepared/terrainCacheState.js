import { RenderByteBudget, RENDER_BYTE_OWNERS } from './renderByteBudget.js'
import { RenderRevisionStore, RENDER_REVISION_DOMAINS } from './renderRevisionStore.js'

export const TERRAIN_REVISION_HALOS = Object.freeze({
  [RENDER_REVISION_DOMAINS.TOPOLOGY]: 10,
  [RENDER_REVISION_DOMAINS.SURFACE]: 2,
  [RENDER_REVISION_DOMAINS.WATER]: 0,
  [RENDER_REVISION_DOMAINS.RESOURCE]: 0,
  [RENDER_REVISION_DOMAINS.DECAL]: 0,
  [RENDER_REVISION_DOMAINS.ASSET]: 0,
  [RENDER_REVISION_DOMAINS.LAYOUT]: 0
})

const MAX_WARM_PRIORITY = 3

export function mergeTerrainMutationBounds(oldBounds, newBounds = oldBounds, halo = 0, width, height) {
  const first = oldBounds || newBounds
  const second = newBounds || oldBounds
  if (!first || !second) return null
  const left = Math.max(0, Math.floor(Math.min(first.left, second.left) - halo))
  const top = Math.max(0, Math.floor(Math.min(first.top, second.top) - halo))
  const right = Math.min(width, Math.ceil(Math.max(first.right, second.right) + halo))
  const bottom = Math.min(height, Math.ceil(Math.max(first.bottom, second.bottom) + halo))
  return {
    left,
    top,
    right: Math.max(left, right),
    bottom: Math.max(top, bottom)
  }
}

export class TerrainRevisionState {
  constructor({ chunkSize = 16 } = {}) {
    this.chunkSize = chunkSize
    this.mapGrid = null
    this.store = null
    this.ownsStore = false
    this.width = 0
    this.height = 0
    this.mapGeneration = 0
    this.mutationGeneration = 0
  }

  attachStore(store, mapGrid = this.mapGrid) {
    if (!store || store.disposed) return false
    const width = mapGrid?.[0]?.length || store.width
    const height = mapGrid?.length || store.height
    if (!width || !height) return false
    const changed = this.store !== store || this.mapGrid !== mapGrid || this.width !== width || this.height !== height
    if (this.ownsStore && this.store && this.store !== store) this.store.dispose()
    this.store = store
    this.ownsStore = false
    this.mapGrid = mapGrid || this.mapGrid
    this.width = width
    this.height = height
    if (changed) {
      this.mapGeneration++
      this.mutationGeneration++
    }
    return changed
  }

  ensureMap(mapGrid) {
    const width = mapGrid?.[0]?.length || 0
    const height = mapGrid?.length || 0
    if (!width || !height) return false
    if (this.mapGrid === mapGrid && this.width === width && this.height === height && this.store && !this.store.disposed) {
      return false
    }
    if (this.ownsStore) this.store?.dispose()
    this.mapGrid = mapGrid
    this.width = width
    this.height = height
    this.store = new RenderRevisionStore({ width, height, chunkSize: this.chunkSize })
    this.ownsStore = true
    this.mapGeneration++
    this.mutationGeneration++
    return true
  }

  invalidate(mapGrid, domain, oldBounds, newBounds = oldBounds, halo = TERRAIN_REVISION_HALOS[domain]) {
    this.ensureMap(mapGrid)
    if (!this.store) return null
    const appliedHalo = Number.isFinite(halo) ? halo : 0
    this.store.invalidate(domain, oldBounds, newBounds, appliedHalo)
    this.mutationGeneration++
    return mergeTerrainMutationBounds(oldBounds, newBounds, appliedHalo, this.width, this.height)
  }

  getChunkRevisions(chunkX, chunkY, target) {
    const store = this.store
    if (!store) {
      target.topology = 0
      target.surface = 0
      target.water = 0
      target.resource = 0
      target.decal = 0
      target.asset = 0
      target.layout = 0
      return target
    }
    target.topology = store.getChunkRevision(RENDER_REVISION_DOMAINS.TOPOLOGY, chunkX, chunkY)
    target.surface = store.getChunkRevision(RENDER_REVISION_DOMAINS.SURFACE, chunkX, chunkY)
    target.water = store.getChunkRevision(RENDER_REVISION_DOMAINS.WATER, chunkX, chunkY)
    target.resource = store.getChunkRevision(RENDER_REVISION_DOMAINS.RESOURCE, chunkX, chunkY)
    target.decal = store.getChunkRevision(RENDER_REVISION_DOMAINS.DECAL, chunkX, chunkY)
    target.asset = store.getChunkRevision(RENDER_REVISION_DOMAINS.ASSET, chunkX, chunkY)
    target.layout = store.getChunkRevision(RENDER_REVISION_DOMAINS.LAYOUT, chunkX, chunkY)
    return target
  }

  dispose() {
    if (this.ownsStore) this.store?.dispose()
    this.store = null
    this.ownsStore = false
    this.mapGrid = null
    this.width = 0
    this.height = 0
    this.mapGeneration++
    this.mutationGeneration++
  }
}

export class TerrainWarmQueue {
  constructor({ maxEntries = 96, maxJobAgeMs = 500 } = {}) {
    this.maxEntries = maxEntries
    this.maxJobAgeMs = maxJobAgeMs
    this.tasks = new Map()
    this.heads = new Array(MAX_WARM_PRIORITY + 1).fill(null)
    this.tails = new Array(MAX_WARM_PRIORITY + 1).fill(null)
    this.maxObservedBacklog = 0
    this.expiredJobs = 0
    this.cancelledJobs = 0
  }

  get size() {
    return this.tasks.size
  }

  values() {
    return this.tasks.values()
  }

  keys() {
    return this.tasks.keys()
  }

  get(key) {
    return this.tasks.get(key)
  }

  enqueue(task) {
    const priority = Math.max(0, Math.min(MAX_WARM_PRIORITY, Math.floor(task.priority || 0)))
    task.priority = priority
    task.previousWarmTask = this.tails[priority]
    task.nextWarmTask = null
    if (this.tails[priority]) this.tails[priority].nextWarmTask = task
    else this.heads[priority] = task
    this.tails[priority] = task
    this.tasks.set(task.key, task)
    this.maxObservedBacklog = Math.max(this.maxObservedBacklog, this.tasks.size)
    while (this.tasks.size > this.maxEntries) this.dropLowestPriority()
  }

  reprioritize(task, priority) {
    this.unlink(task)
    task.priority = priority
    this.enqueue(task)
  }

  delete(key) {
    const task = this.tasks.get(key)
    if (!task) return false
    this.unlink(task)
    this.tasks.delete(key)
    return true
  }

  take(now, generation) {
    for (let priority = MAX_WARM_PRIORITY; priority >= 0; priority--) {
      while (this.heads[priority]) {
        const task = this.heads[priority]
        this.delete(task.key)
        if (task.generation !== generation) {
          this.cancelledJobs++
          continue
        }
        if (now - task.queuedAt > this.maxJobAgeMs) {
          this.expiredJobs++
          continue
        }
        return task
      }
    }
    return null
  }

  clear() {
    this.cancelledJobs += this.tasks.size
    this.tasks.clear()
    this.heads.fill(null)
    this.tails.fill(null)
  }

  getOldestAge(now) {
    let oldest = 0
    for (let priority = 0; priority <= MAX_WARM_PRIORITY; priority++) {
      const task = this.heads[priority]
      if (task) oldest = Math.max(oldest, now - task.queuedAt)
    }
    return Math.max(0, oldest)
  }

  dropLowestPriority() {
    for (let priority = 0; priority <= MAX_WARM_PRIORITY; priority++) {
      const task = this.heads[priority]
      if (!task) continue
      this.delete(task.key)
      this.cancelledJobs++
      return task
    }
    return null
  }

  unlink(task) {
    const priority = task.priority
    if (task.previousWarmTask) task.previousWarmTask.nextWarmTask = task.nextWarmTask
    else this.heads[priority] = task.nextWarmTask
    if (task.nextWarmTask) task.nextWarmTask.previousWarmTask = task.previousWarmTask
    else this.tails[priority] = task.previousWarmTask
    task.previousWarmTask = null
    task.nextWarmTask = null
  }
}

export function createTerrainByteBudget({ residentBytes, stagingBytes }) {
  const limits = Object.fromEntries(RENDER_BYTE_OWNERS.map(owner => [owner, 0]))
  limits.terrainResident = residentBytes
  limits.terrainStaging = stagingBytes
  return new RenderByteBudget(limits)
}

export function getTerrainRasterBytes(width, height) {
  return Math.max(0, Math.floor(width)) * Math.max(0, Math.floor(height)) * 4
}
