import { describe, expect, it, vi } from 'vitest'
import { MapRenderer } from '../../src/rendering/mapRenderer.js'
import { RENDER_REVISION_DOMAINS } from '../../src/rendering/prepared/renderRevisionStore.js'
import {
  createTerrainByteBudget,
  TerrainWarmQueue
} from '../../src/rendering/prepared/terrainCacheState.js'

function makeTask(key, priority, queuedAt = 0, generation = 1) {
  return {
    key,
    priority,
    queuedAt,
    generation,
    previousWarmTask: null,
    nextWarmTask: null
  }
}

function makeTextureManager() {
  return {
    integratedSpriteSheetMode: false,
    integratedRenderSignature: 'warm-test',
    allTexturesLoaded: false,
    tileTextureCache: { land: [] },
    waterFrames: [],
    waterFrameIndex: 0,
    getCurrentWaterFrame: () => null,
    getTileVariation: () => 0,
    getIntegratedTileForMapTile: () => null,
    getDecalTileCandidatesByTags: () => []
  }
}

function makeMap(size = 64) {
  return Array.from(
    { length: size },
    () => Array.from({ length: size }, () => ({ type: 'land' }))
  )
}

describe('TerrainWarmQueue', () => {
  it('keeps stable priority order and bounds backlog without sorting', () => {
    const queue = new TerrainWarmQueue({ maxEntries: 3, maxJobAgeMs: 1000 })
    const sort = vi.spyOn(Array.prototype, 'sort')
    const initialSortCalls = sort.mock.calls.length

    queue.enqueue(makeTask('low-oldest', 1))
    queue.enqueue(makeTask('high-first', 3))
    queue.enqueue(makeTask('high-second', 3))
    queue.enqueue(makeTask('low-newest', 1))

    expect(queue.size).toBe(3)
    expect(queue.get('low-oldest')).toBeUndefined()
    expect(queue.take(10, 1)?.key).toBe('high-first')
    expect(queue.take(10, 1)?.key).toBe('high-second')
    expect(queue.take(10, 1)?.key).toBe('low-newest')
    expect(sort.mock.calls.length).toBe(initialSortCalls)
    sort.mockRestore()
  })

  it('expires old work and rejects stale cancellation generations', () => {
    const queue = new TerrainWarmQueue({ maxEntries: 4, maxJobAgeMs: 50 })
    queue.enqueue(makeTask('expired', 3, 0, 2))
    queue.enqueue(makeTask('cancelled', 3, 100, 1))

    expect(queue.take(100, 2)).toBeNull()
    expect(queue.expiredJobs).toBe(1)
    expect(queue.cancelledJobs).toBe(1)
    expect(queue.size).toBe(0)
  })
})

describe('MapRenderer bounded terrain residency', () => {
  it('refreshes neighbor discovery only for boundary, direction, or revision changes', () => {
    const renderer = new MapRenderer(makeTextureManager())
    const mapGrid = makeMap()
    renderer.ensureCacheValidity(mapGrid, false)
    const queueChunk = vi.spyOn(renderer, 'queueChunkForWarm').mockImplementation(() => {})
    const options = { skipWaterBase: true, skipWaterSot: true }
    const delta = { x: 1, y: 0 }

    renderer.queueWarmChunksAroundViewport(
      mapGrid, 0, 0, 2, 2, 64, 64, false, null, options, delta
    )
    const initialDiscoveries = queueChunk.mock.calls.length
    renderer.queueWarmChunksAroundViewport(
      mapGrid, 0, 0, 2, 2, 64, 64, false, null, options, delta
    )
    expect(queueChunk).toHaveBeenCalledTimes(initialDiscoveries)

    const bounds = { left: 40, top: 40, right: 41, bottom: 41 }
    renderer.notifyTerrainMutation(
      mapGrid,
      RENDER_REVISION_DOMAINS.SURFACE,
      bounds,
      bounds
    )
    renderer.queueWarmChunksAroundViewport(
      mapGrid, 0, 0, 2, 2, 64, 64, false, null, options, delta
    )
    expect(queueChunk.mock.calls.length).toBeGreaterThan(initialDiscoveries)
  })

  it('does not treat queued work as a resident pin during eviction', () => {
    const renderer = new MapRenderer(makeTextureManager())
    renderer.maxCachedChunks = 1
    const first = renderer.getOrCreateChunk(0, 0, 0, 0, 16, 16)
    const second = renderer.getOrCreateChunk(1, 0, 16, 0, 32, 16)
    renderer.chunkWarmQueue.enqueue(makeTask(first.key, 1, 0, renderer.chunkWarmGeneration))

    renderer.activeChunkKeys.clear()
    renderer.activeChunkKeys.add(second.key)
    renderer.evictOldChunks(renderer.activeChunkKeys)

    expect(renderer.chunkCache.has(first.key)).toBe(false)
    expect(renderer.chunkCache.has(second.key)).toBe(true)
    expect(renderer.chunkWarmQueue.get(first.key)).toBeDefined()
  })

  it('enforces terrainResident and terrainStaging byte ownership', () => {
    const renderer = new MapRenderer(makeTextureManager())
    renderer.terrainByteBudget = createTerrainByteBudget({
      residentBytes: 100,
      stagingBytes: 100
    })
    const first = renderer.getOrCreateChunk(0, 0, 0, 0, 1, 1)
    const second = renderer.getOrCreateChunk(1, 0, 1, 0, 2, 1)
    const firstStaging = renderer.reserveChunkRaster(first, 100)
    firstStaging.release()

    const secondStaging = renderer.reserveChunkRaster(second, 100)
    expect(renderer.chunkCache.has(first.key)).toBe(false)
    expect(renderer.chunkCache.has(second.key)).toBe(true)
    expect(renderer.terrainByteBudget.getUsage()).toMatchObject({
      terrainResident: 100,
      terrainStaging: 100
    })

    secondStaging.release()
    renderer.updateTerrainByteTelemetry()
    expect(renderer.frameChunkStats.terrainResidentBytes).toBe(100)
    expect(renderer.frameChunkStats.terrainStagingBytes).toBe(0)
  })
})
