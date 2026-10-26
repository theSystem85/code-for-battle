import { describe, expect, it, vi } from 'vitest'
import { buildDecorationPools, getDecorationPoolSelectors } from '../../src/rendering/decorationLayout.js'
import { DecorationLayoutPreparation } from '../../src/rendering/decorationLayoutPreparation.js'

function group(label, sprite = null) {
  return {
    groupLabel: label,
    width: 1,
    height: 1,
    tagSet: new Set(['grass', 'decorative', 'summer']),
    tilesByOffset: { '0,0': { rect: { x: 0, y: 0, width: 64, height: 64 }, sprite } }
  }
}

function grid(width = 40, height = 40) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => ({ type: 'land', biome: 'grass' })))
}

describe('decoration layout preparation', () => {
  it('[U06197] publishes an immutable layout and never constructs from a read lookup', () => {
    const mapGrid = grid()
    const pools = buildDecorationPools([group('tree')])
    const applySimulationEffects = vi.fn((_map, layout) => {
      const cell = layout.cells.find(Boolean)
      cell.cityBuilding = { health: 100 }
    })
    const preparation = new DecorationLayoutPreparation()
    const key = { mapGrid, mapRevision: 4, catalogRevision: 2, configRevision: 7 }

    expect(preparation.read(key)).toBeNull()
    const state = preparation.prepare({ ...key, pools, options: {}, applySimulationEffects })

    expect(applySimulationEffects).toHaveBeenCalledOnce()
    expect(preparation.read(key)).toBe(state.layout)
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.layout)).toBe(true)
    expect(Object.isFrozen(state.layout.cells)).toBe(true)
    expect(Object.isFrozen(state.layout.cells.find(Boolean))).toBe(true)
  })

  it('[U06198] rejects every stale lifecycle revision without rebuilding', () => {
    const mapGrid = grid()
    const pools = buildDecorationPools([group('tree')])
    const preparation = new DecorationLayoutPreparation()
    const key = { mapGrid, mapRevision: 1, catalogRevision: 2, configRevision: 3 }
    const state = preparation.prepare({ ...key, pools })

    expect(preparation.read({ ...key, mapGrid: grid() })).toBeNull()
    expect(preparation.read({ ...key, mapRevision: 2 })).toBeNull()
    expect(preparation.read({ ...key, catalogRevision: 3 })).toBeNull()
    expect(preparation.read({ ...key, configRevision: 4 })).toBeNull()
    expect(preparation.published).toBe(state)

    preparation.invalidate()
    expect(preparation.read(key)).toBeNull()
    expect(preparation.published).toBeNull()
  })

  it('[U06199] caches immutable selectors while placement signatures ignore visual tiers', () => {
    const coarse = buildDecorationPools([group('tree', { tier: 'coarse' }), group('bush')])
    const final = buildDecorationPools([group('tree', { tier: 'final' }), group('bush')])
    const coarseSelectors = getDecorationPoolSelectors(coarse)

    expect(getDecorationPoolSelectors(coarse)).toBe(coarseSelectors)
    expect(Object.isFrozen(coarseSelectors)).toBe(true)
    expect(Object.isFrozen(coarseSelectors.biomes.grass.single)).toBe(true)
    expect(getDecorationPoolSelectors(final).placementSignature).toBe(coarseSelectors.placementSignature)

    const mapGrid = grid()
    const options = { salt: 91 }
    const preparation = new DecorationLayoutPreparation()
    const coarseLayout = preparation.prepare({ mapGrid, pools: coarse, mapRevision: 1, catalogRevision: 1, configRevision: 1, options }).layout
    const finalLayout = preparation.prepare({ mapGrid, pools: final, mapRevision: 1, catalogRevision: 2, configRevision: 1, options }).layout
    const placements = layout => layout.cells.map(cell => cell && `${cell.group.groupLabel}@${cell.anchorX},${cell.anchorY}`)
    expect(placements(finalLayout)).toEqual(placements(coarseLayout))
  })
})
