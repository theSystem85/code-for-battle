import { describe, it, expect, vi } from 'vitest'
import { MapRenderer } from '../../src/rendering/mapRenderer.js'

describe('decal sprite selection cache', () => {
  function setup() {
    const sprite = { image: {}, rect: { x: 1, y: 2, width: 32, height: 32 } }
    const manager = {
      getDecalTileCandidatesByTags: vi.fn(() => [sprite]),
      selectGroupedTileVariant: vi.fn(() => sprite)
    }
    const renderer = new MapRenderer(manager)
    const ctx = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), fillRect: vi.fn() }
    const tile = { type: 'land', decal: { tag: 'impact', variantSeed: 1 } }
    const draw = () => renderer.drawTileDecalOverlay(ctx, tile, 0, 0, 10, 20, [[tile]])
    return { renderer, manager, ctx, tile, draw, sprite }
  }

  it('[U07131] reuses selection for a dense viewport across repeated frames without skipping draws', () => {
    const { renderer, manager, ctx } = setup()
    const tiles = Array.from({ length: 400 }, () => ({ decal: { tag: 'impact', variantSeed: 1 } }))
    for (let frame = 0; frame < 3; frame++) {
      for (let i = 0; i < tiles.length; i++) {
        renderer.drawTileDecalOverlay(ctx, tiles[i], i, 0, i * 32 - frame, 0)
      }
    }
    expect(manager.getDecalTileCandidatesByTags).toHaveBeenCalledTimes(400)
    expect(ctx.drawImage).toHaveBeenCalledTimes(1200)
  })

  it('[U07132] invalidates on in-place decal edits and catalog publication', () => {
    const { manager, tile, draw } = setup()
    draw()
    tile.decal.variantSeed++
    draw()
    tile.decal.tag = 'crater'
    draw()
    manager.defaultCombatDecalTagBuckets = {}
    draw()
    expect(manager.getDecalTileCandidatesByTags).toHaveBeenCalledTimes(4)
  })

  it('[U07133] caches grouped sprites and refreshes when the footprint changes', () => {
    const { manager, tile, draw } = setup()
    tile.decal.groupWidth = 2
    draw()
    draw()
    expect(manager.selectGroupedTileVariant).toHaveBeenCalledTimes(1)
    tile.decal.groupOriginX = -1
    draw()
    expect(manager.selectGroupedTileVariant).toHaveBeenCalledTimes(2)
    expect(manager.getDecalTileCandidatesByTags).not.toHaveBeenCalled()
  })

  it('[U07134] keeps obstruction checks live after caching a sprite', () => {
    const { tile, ctx, draw } = setup()
    draw()
    tile.type = 'water'
    draw()
    expect(ctx.drawImage).toHaveBeenCalledTimes(1)
    tile.type = 'land'
    draw()
    expect(ctx.drawImage).toHaveBeenCalledTimes(2)
  })

  it('[U07135] caches missing sprites and retries after fallback assets are published', () => {
    const { manager, ctx, draw, sprite } = setup()
    manager.getDecalTileCandidatesByTags.mockReturnValue([])
    draw()
    draw()
    expect(manager.getDecalTileCandidatesByTags).toHaveBeenCalledTimes(1)
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
    manager.defaultCombatDecalTagBuckets = {}
    manager.getDecalTileCandidatesByTags.mockReturnValue([sprite])
    draw()
    expect(ctx.drawImage).toHaveBeenCalledTimes(1)
  })
})
