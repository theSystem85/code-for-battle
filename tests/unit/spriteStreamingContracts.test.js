import { describe, expect, it } from 'vitest'
import { PROFILER_SPAN_IDS } from '../../src/performance/profilerIds.js'
import {
  createSpriteWorkerCapabilities,
  createSpriteWorkerRequest,
  createSpriteWorkerResult,
  SPRITE_WORKER_FALLBACKS,
  SPRITE_WORKER_OPERATIONS,
  SPRITE_WORKER_RESULT_KINDS
} from '../../src/rendering/spriteStreamingProtocol.js'
import {
  createProgressiveSpriteDescriptor,
  createSpriteTierSourceRect,
  createStableSpriteGeometry,
  SPRITE_TIER_IDS
} from '../../src/rendering/spriteStreamingGeometry.js'
import {
  createGenerationCancellation,
  createSpritePublication,
  createSpriteReleaseToken,
  createSpriteReservationToken,
  createVisibilityDemandSnapshot
} from '../../src/rendering/spriteStreamingLifecycle.js'
import {
  SPRITE_STREAMING_BYTE_CLASSES,
  SPRITE_STREAMING_STAGES,
  SpriteStreamingDiagnostics
} from '../../src/rendering/spriteStreamingDiagnostics.js'

describe('sprite streaming frozen contracts', () => {
  it('[U05508] creates immutable worker request/result and capability records', () => {
    const generations = { asset: 3, map: 4, density: 5 }
    const request = createSpriteWorkerRequest({ requestId: 'sheet:city', operation: SPRITE_WORKER_OPERATIONS.PREPARE_SHEET, generations })
    const result = createSpriteWorkerResult({ requestId: request.requestId, kind: SPRITE_WORKER_RESULT_KINDS.COMPLETE, generations })
    const capabilities = createSpriteWorkerCapabilities({ worker: true, imageBitmap: true, fallback: SPRITE_WORKER_FALLBACKS.PREBUILT })

    expect(request.generations).toEqual(generations)
    expect(result.generations).toEqual(generations)
    expect(capabilities).toMatchObject({ worker: true, imageBitmap: true, fallback: 'prebuilt-derivative' })
    expect(Object.isFrozen(request.generations)).toBe(true)
  })

  it('[U05509] keeps logical geometry separate from immutable per-tier source rectangles', () => {
    const geometry = createStableSpriteGeometry({ spriteId: 'city/house-a', logicalWidth: 48, logicalHeight: 64 })
    const sources = [
      createSpriteTierSourceRect({ tier: SPRITE_TIER_IDS.COARSE, x: 1, y: 1, width: 24, height: 32, backingDensity: 0.5 }),
      createSpriteTierSourceRect({ tier: SPRITE_TIER_IDS.INTERMEDIATE, x: 2, y: 2, width: 48, height: 64, backingDensity: 1 }),
      createSpriteTierSourceRect({ tier: SPRITE_TIER_IDS.FINAL, x: 3, y: 3, width: 144, height: 192, backingDensity: 3 })
    ]
    const descriptor = createProgressiveSpriteDescriptor({ geometry, sources })

    expect(descriptor.geometry).toEqual(expect.objectContaining({ spriteId: 'city/house-a', logicalWidth: 48 }))
    expect(descriptor.sources.map(source => source.backingDensity)).toEqual([0.5, 1, 3])
    expect(Object.isFrozen(descriptor.sources)).toBe(true)
  })

  it('[U05510] freezes reservation, release, demand, cancellation and publication records', () => {
    const reservation = createSpriteReservationToken({ tokenId: 'r1', owner: 'worker-0', byteClass: 'staging', bytes: 4096, generation: 2 })
    const release = createSpriteReleaseToken(reservation, 'published')
    const demand = createVisibilityDemandSnapshot({ revision: 7, capturedAt: 10, moving: true, spriteIds: ['city/house-a'], requestedTier: 0 })
    const cancellation = createGenerationCancellation({ asset: 2, map: 3, density: 4, reason: 'superseded' })
    const publication = createSpritePublication({ spriteId: 'city/house-a', tier: 0, revision: 8, generations: { asset: 2, map: 3, density: 4 }, resourceToken: reservation })

    expect(release).toMatchObject({ tokenId: 'r1', bytes: 4096, reason: 'published' })
    expect(demand.spriteIds).toEqual(['city/house-a'])
    expect(cancellation.reason).toBe('superseded')
    expect(publication.resourceToken).toBe(reservation)
    expect([reservation, release, demand, cancellation, publication].every(Object.isFrozen)).toBe(true)
  })

  it('[U05511] records bounded opt-in stage and byte diagnostics without growing trace records', () => {
    let enabled = false
    const diagnostics = new SpriteStreamingDiagnostics({ enabled: () => enabled, generationSlots: 2 })
    const stage = SPRITE_STREAMING_STAGES.indexOf('queue-wait')
    const byteClass = SPRITE_STREAMING_BYTE_CLASSES.indexOf('resident')

    expect(diagnostics.recordStage(stage, 1, 0, 2.5)).toBe(false)
    enabled = true
    diagnostics.recordStage(stage, 1, 0, 2.5)
    diagnostics.recordBytes(byteClass, 1, 0, 100)
    diagnostics.recordBytes(byteClass, 1, 0, -40)
    diagnostics.recordStage(stage, 3, 0, 1)

    const snapshot = diagnostics.snapshot()
    const current = snapshot.rows.find(row => row.generation === 3 && row.tier === 0)
    expect(snapshot.rows.some(row => row.generation === 1)).toBe(false)
    expect(current.stageCounts[stage]).toBe(1)
    expect(current.stageDurationMs[stage]).toBe(1)
    expect(diagnostics.stageCounts).toBeInstanceOf(Uint32Array)
  })

  it('[U05512] allocates stable profiler IDs for every streaming timing stage', () => {
    expect(PROFILER_SPAN_IDS).toMatchObject({
      SPRITE_SHEET_LOAD: 90,
      SPRITE_SHEET_DECODE: 91,
      SPRITE_SHEET_KEY: 92,
      SPRITE_SHEET_CUTOUT: 93,
      SPRITE_SHEET_CATALOG: 94,
      SPRITE_ROTATION_GENERATE: 95,
      SPRITE_QUEUE_WAIT: 96,
      SPRITE_BITMAP_CREATE: 97,
      SPRITE_BITMAP_PUBLISH: 98,
      CHUNK_REBUILD: 15,
      WEBGL_UPLOAD: 31
    })
  })
})
