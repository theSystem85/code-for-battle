import { describe, expect, it } from 'vitest'
import {
  createStaticPagePreparationJob,
  StaticPageDependencyIndex
} from '../../src/rendering/staticPagePreparation.js'
import { MapRenderer } from '../../src/rendering/mapRenderer.js'
import { RENDER_REVISION_DOMAINS } from '../../src/rendering/prepared/renderRevisionStore.js'
import { createSpritePublication, createSpriteReservationToken } from '../../src/rendering/spriteStreamingLifecycle.js'

function makeTextureManager() {
  return {
    integratedSpriteSheetMode: false,
    integratedRenderSignature: 'static-page-test',
    allTexturesLoaded: false,
    tileTextureCache: { land: [], street: [], water: [] },
    waterFrames: [],
    waterFrameIndex: 0,
    getCurrentWaterFrame: () => null,
    getTileVariation: () => 0,
    getIntegratedTileForMapTile: () => null,
    getDecalTileCandidatesByTags: () => []
  }
}

describe('static terrain page preparation', () => {
  it('[U06178] creates immutable jobs with immutable dependency revisions', () => {
    const job = createStaticPagePreparationJob({
      pageKey: '1,2',
      mapGeneration: 4,
      densityGeneration: 2,
      tier: 2,
      pageRevision: 7,
      bounds: { startX: 16, startY: 32, endX: 32, endY: 48 },
      assetRevisions: [{ assetId: 'sheet-a', revision: 3 }]
    })

    expect(Object.isFrozen(job)).toBe(true)
    expect(Object.isFrozen(job.bounds)).toBe(true)
    expect(Object.isFrozen(job.assetRevisions[0])).toBe(true)
    expect(job.assetRevisions).toEqual([{ assetId: 'sheet-a', revision: 3 }])
  })

  it('[U06179] deduplicates tier revisions and returns only locally dependent pages', () => {
    const index = new StaticPageDependencyIndex()
    index.replacePage('0,0', ['sheet-a', 'sheet-a'])
    index.replacePage('1,0', ['sheet-b'])

    expect(index.publishAssetTier('sheet-a', 0, 1)).toEqual(['0,0'])
    expect(index.publishAssetTier('sheet-a', 0, 1)).toEqual([])
    expect(index.publishAssetTier('sheet-a', 0, 2)).toEqual(['0,0'])
    expect(index.snapshotForPage('0,0', 0)).toEqual([{ assetId: 'sheet-a', revision: 2 }])

    index.removePage('0,0')
    expect(index.publishAssetTier('sheet-a', 0, 3)).toEqual([])
  })

  it('[U06180] invalidates one dependent cached page for a newer sheet tier', () => {
    const renderer = new MapRenderer(makeTextureManager())
    const mapGrid = Array.from({ length: 32 }, () =>
      Array.from({ length: 32 }, () => ({ type: 'land', biome: 'grass' })))
    renderer.terrainRevisions.ensureMap(mapGrid)
    renderer.getOrCreateChunk(0, 0, 0, 0, 16, 16)
    renderer.getOrCreateChunk(1, 0, 16, 0, 32, 16)
    renderer.pageDependencies.replacePage('0,0', ['sheet-a'])
    renderer.pageDependencies.replacePage('1,0', ['sheet-b'])
    const token = createSpriteReservationToken({
      tokenId: 'sheet-a-final', owner: 'terrain', byteClass: 'resident', bytes: 4, generation: 1
    })
    const publication = createSpritePublication({
      spriteId: 'sheet-a', tier: 2, revision: 1,
      generations: { asset: 1, map: renderer.terrainRevisions.mapGeneration, density: 0 },
      resourceToken: token
    })

    expect(renderer.notifySpriteTierPublication(publication)).toBe(1)
    expect(renderer.notifySpriteTierPublication(publication)).toBe(0)
    expect(renderer.terrainRevisions.store.getChunkRevision(RENDER_REVISION_DOMAINS.ASSET, 0, 0)).toBe(1)
    expect(renderer.terrainRevisions.store.getChunkRevision(RENDER_REVISION_DOMAINS.ASSET, 1, 0)).toBe(0)
  })
})
