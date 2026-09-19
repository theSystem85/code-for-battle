import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assignMapBiomes } from '../../src/game/mapBiomes.js'
import { setTileDecal } from '../../src/game/tileDecals.js'
import {
  beginMapMutationTransaction,
  commitMapMutationTransaction,
  getMapMutationRevisionStore,
  M10_MUTATION_PRODUCERS,
  M10_RENDER_DEPENDENCIES,
  notifyResourceTileMutation,
  notifySurfaceMutation,
  notifyTopologyMutation,
  resetMapMutationRevisionStore
} from '../../src/rendering/prepared/mapMutationNotifier.js'
import { RENDER_REVISION_DOMAINS } from '../../src/rendering/prepared/renderRevisionStore.js'

function createGrid(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      type: 'land',
      ore: false,
      oreDensity: 0,
      seedCrystal: false,
      seedCrystalDensity: 0
    }))
  )
}

describe('M10 map mutation notifications', () => {
  beforeEach(() => {
    resetMapMutationRevisionStore()
  })

  afterEach(() => {
    resetMapMutationRevisionStore()
  })

  it('keeps the complete producer inventory and render dependency matrix explicit', () => {
    expect(M10_MUTATION_PRODUCERS).toEqual([
      'src/mapEditor.js',
      'src/buildings.js',
      'src/factories.js',
      'src/game/harvesterLogic.js',
      'src/game/gameStateManager.js',
      'src/game/tileDecals.js',
      'src/game/mapBiomes.js',
      'src/gameSetup.js',
      'src/saveGame.js',
      'src/network/stateSync.js',
      'src/game/gameOrchestrator.js'
    ])
    expect(M10_RENDER_DEPENDENCIES.resource).toEqual([
      'ore',
      'oreDensity',
      'seedCrystal',
      'seedCrystalDensity'
    ])
    expect(M10_RENDER_DEPENDENCIES.surface).toContain('biomeBlend.featherPixels')
    expect(M10_RENDER_DEPENDENCIES.decal).toEqual(expect.arrayContaining([
      'decal.groupWidth',
      'decal.groupHeight',
      'decal.groupOriginX',
      'decal.groupOriginY'
    ]))
    expect(M10_RENDER_DEPENDENCIES.excluded).toEqual(['noBuild', 'decalCounter'])
  })

  it('unions old and new topology and surface footprints with their specified halos', () => {
    const dimensions = { width: 96, height: 96 }
    notifyTopologyMutation(
      dimensions,
      { left: 20, top: 20, right: 21, bottom: 21 },
      { left: 70, top: 70, right: 71, bottom: 71 }
    )
    notifySurfaceMutation(
      dimensions,
      { left: 32, top: 32, right: 34, bottom: 34 },
      { left: 48, top: 48, right: 50, bottom: 50 }
    )

    const store = getMapMutationRevisionStore()
    expect(store.getGeneration(RENDER_REVISION_DOMAINS.TOPOLOGY)).toBe(1)
    expect(store.getGeneration(RENDER_REVISION_DOMAINS.WATER)).toBe(1)
    expect(store.getChunkRevision(RENDER_REVISION_DOMAINS.TOPOLOGY, 0, 0)).toBe(1)
    expect(store.getChunkRevision(RENDER_REVISION_DOMAINS.TOPOLOGY, 5, 5)).toBe(1)
    expect(store.getChunkRevision(RENDER_REVISION_DOMAINS.SURFACE, 1, 1)).toBe(1)
    expect(store.getChunkRevision(RENDER_REVISION_DOMAINS.SURFACE, 3, 3)).toBe(1)
  })

  it('coalesces resource density notifications and bulk replacement domains', () => {
    const dimensions = { width: 64, height: 64 }
    const transaction = beginMapMutationTransaction(dimensions, { replace: true })
    notifyResourceTileMutation(dimensions, 4, 5)
    notifyResourceTileMutation(dimensions, 4, 5)

    expect(transaction.getGeneration(RENDER_REVISION_DOMAINS.RESOURCE)).toBe(0)
    commitMapMutationTransaction(transaction)

    for (const domain of [
      RENDER_REVISION_DOMAINS.TOPOLOGY,
      RENDER_REVISION_DOMAINS.WATER,
      RENDER_REVISION_DOMAINS.SURFACE,
      RENDER_REVISION_DOMAINS.RESOURCE,
      RENDER_REVISION_DOMAINS.DECAL
    ]) {
      expect(transaction.getGeneration(domain)).toBe(1)
    }
  })

  it('invalidates parity fields omitted by the legacy signatures', () => {
    const grid = createGrid(24, 24)

    grid[3][2].oreDensity = 4
    notifyResourceTileMutation(grid, 2, 3)
    grid[3][2].seedCrystalDensity = 5
    notifyResourceTileMutation(grid, 2, 3)
    const store = getMapMutationRevisionStore()
    expect(store.getGeneration(RENDER_REVISION_DOMAINS.RESOURCE)).toBe(2)

    setTileDecal(grid, { mapSeed: 'm10' }, 7, 8, 'debris', {
      groupWidth: 3,
      groupHeight: 2,
      groupOriginX: 6,
      groupOriginY: 8
    })
    expect(grid[8][7].decal).toMatchObject({
      groupWidth: 3,
      groupHeight: 2,
      groupOriginX: 6,
      groupOriginY: 8
    })
    expect(store.getGeneration(RENDER_REVISION_DOMAINS.DECAL)).toBe(1)

    assignMapBiomes(grid, 17, {
      activeSpriteSheetBiomeTag: 'mixed',
      mapBiomeRegionCount: 8,
      mapBiomeDistribution: 'random',
      mapBiomeWeights: { grass: 25, soil: 25, sand: 25, snow: 25 },
      mapBiomeTransitionPixels: 19,
      mapShorelineWidth: 0,
      mapSnowOnPlateaus: false
    })
    const blends = grid.flat().map(tile => tile.biomeBlend).filter(Boolean)
    expect(blends.length).toBeGreaterThan(0)
    expect(blends.every(blend => blend.featherPixels === 19)).toBe(true)
    expect(store.getGeneration(RENDER_REVISION_DOMAINS.SURFACE)).toBe(1)
  })
})
