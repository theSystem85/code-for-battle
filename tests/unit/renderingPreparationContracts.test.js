import { describe, expect, it, vi } from 'vitest'
import { FrameViewport } from '../../src/rendering/prepared/frameViewport.js'
import { PreparedMap, PREPARED_MAP_STATES, PreparationGeneration } from '../../src/rendering/prepared/preparedMap.js'
import { PreparedSpriteRegistry } from '../../src/rendering/prepared/preparedSpriteRegistry.js'
import { RenderRevisionStore, RENDER_REVISION_DOMAINS } from '../../src/rendering/prepared/renderRevisionStore.js'
import { createRenderDiagnosticsSnapshot } from '../../src/performance/renderDiagnostics.js'
import { RenderByteBudget, RENDER_BYTE_OWNERS } from '../../src/rendering/prepared/renderByteBudget.js'
import { getProfilerDefinition, PROFILER_SPAN_IDS } from '../../src/performance/profilerIds.js'

describe('rendering preparation contracts', () => {
  it('invalidates the old and new chunk footprints with a halo and coalesces transactions', () => {
    const store = new RenderRevisionStore({ width: 96, height: 96, chunkSize: 16 })
    store.beginTransaction()
    store.invalidate(RENDER_REVISION_DOMAINS.TOPOLOGY,
      { left: 20, top: 20, right: 21, bottom: 21 },
      { left: 40, top: 40, right: 41, bottom: 41 }, 9)
    expect(store.getGeneration(RENDER_REVISION_DOMAINS.TOPOLOGY)).toBe(0)
    store.commitTransaction()

    expect(store.getChunkRevision(RENDER_REVISION_DOMAINS.TOPOLOGY, 4, 4)).toBe(0)
    expect(store.getChunkRevision(RENDER_REVISION_DOMAINS.TOPOLOGY, 1, 1)).toBe(1)
    expect(store.getChunkRevision(RENDER_REVISION_DOMAINS.TOPOLOGY, 3, 3)).toBe(1)
  })

  it('publishes prepared maps atomically and disposes resources once', () => {
    const dispose = vi.fn()
    const prepared = new PreparedMap({ generation: 2, assetGeneration: 4, density: 2,
      byteUsage: { terrain: 100 }, resources: { pages: [] }, disposeResource: dispose })
    expect(prepared.isCurrent({ generation: 2, assetGeneration: 4, density: 2 })).toBe(false)
    prepared.publish()
    expect(prepared.state).toBe(PREPARED_MAP_STATES.READY)
    expect(prepared.isCurrent({ generation: 2, assetGeneration: 4, density: 2 })).toBe(true)
    prepared.dispose()
    prepared.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('rejects stale preparation and enforces sprite byte ownership', () => {
    const generation = new PreparationGeneration(3)
    expect(() => generation.assertCurrent(4)).toThrowError(/stale/)
    const registry = new PreparedSpriteRegistry({ assetGeneration: 1, density: 2, byteBudget: 10 })
    registry.register('tank:idle', {}, { decodedBytes: 8 })
    expect(() => registry.register('tank:move', {}, { decodedBytes: 3 })).toThrowError(/budget/)
  })

  it('reuses viewport and diagnostics shapes', () => {
    const viewport = new FrameViewport()
    const values = { logicalWidth: 100, logicalHeight: 80, backingWidth: 200, backingHeight: 160,
      density: 2, worldLeft: 10, worldTop: 20 }
    expect(viewport.update(values)).toBe(true)
    expect(viewport.update(values)).toBe(false)
    expect(viewport.worldRight).toBe(110)
    expect(createRenderDiagnosticsSnapshot()).toMatchObject({ schemaVersion: 1, backend: 'unknown' })
    expect(getProfilerDefinition(PROFILER_SPAN_IDS.CHUNK_SIGNATURE)?.name).toBe('CHUNK_SIGNATURE')
  })

  it('accounts for byte reservations and releases them idempotently', () => {
    const limits = Object.fromEntries(RENDER_BYTE_OWNERS.map(owner => [owner, 100]))
    const budget = new RenderByteBudget(limits)
    const token = budget.reserve('terrainStaging', 40)
    expect(budget.getUsage().terrainStaging).toBe(40)
    token.release()
    token.release()
    expect(budget.getUsage().terrainStaging).toBe(0)
  })
})
