import { afterEach, describe, expect, it } from 'vitest'
import { RENDER_REVISION_DOMAINS } from '../../src/rendering/prepared/renderRevisionStore.js'
import {
  beginMapMutationTransaction,
  commitMapMutationTransaction,
  consumePendingTerrainSync,
  notifyTopologyTileMutation,
  resetMapMutationRevisionStore
} from '../../src/rendering/prepared/mapMutationNotifier.js'
import { TerrainRevisionState } from '../../src/rendering/prepared/terrainCacheState.js'
import { CpuWaterPass } from '../../src/rendering/prepared/cpuWaterPass.js'
import { bindRenderingDensityPreparation, resetRenderingPipelineForTests } from '../../src/rendering/prepared/renderingPipeline.js'

describe('I20 rendering pipeline integration', () => {
  afterEach(() => {
    resetMapMutationRevisionStore()
    resetRenderingPipelineForTests()
  })

  it('shares the mutation revision store with terrain cache state', () => {
    const grid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ type: 'land' })))
    const transaction = beginMapMutationTransaction(grid, { replace: true })
    commitMapMutationTransaction(transaction)
    notifyTopologyTileMutation(grid, 2, 3)

    const terrain = new TerrainRevisionState({ chunkSize: 16 })
    const pending = consumePendingTerrainSync()
    expect(pending.store).toBeTruthy()
    expect(pending.topologyBounds).toBeTruthy()
    terrain.attachStore(pending.store, grid)
    expect(terrain.store).toBe(pending.store)
    expect(terrain.store.getChunkRevision(RENDER_REVISION_DOMAINS.TOPOLOGY, 0, 0)).toBeGreaterThan(0)
    terrain.dispose()
    expect(pending.store.disposed).toBe(false)
    pending.store.dispose()
  })

  it('keeps CPU water topology independent from animation time', () => {
    const grid = [
      [{ type: 'water' }, { type: 'water' }],
      [{ type: 'land' }, { type: 'water' }]
    ]
    const pass = new CpuWaterPass({ now: () => 1000 })
    pass.setTopology(grid, [[null, null], [null, null]], 4)
    pass.prepareVisible(0, 0, 2, 2, true, false)
    const firstRuns = pass.runLength
    pass.stats.sampledTime = 5000
    expect(pass.prepareVisible(0, 0, 2, 2, true, false)).toBe(false)
    expect(pass.runLength).toBe(firstRuns)
  })

  it('binds density generation events once', () => {
    const listeners = []
    globalThis.document = {
      addEventListener(type, handler) {
        listeners.push({ type, handler })
      }
    }
    bindRenderingDensityPreparation()
    bindRenderingDensityPreparation()
    expect(listeners.filter(listener => listener.type === 'canvas-density-changed')).toHaveLength(1)
    delete globalThis.document
  })
})
