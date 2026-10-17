import { describe, it, expect, vi } from 'vitest'
import { buildDecorationPools, groupAllowedOnBiome, isVegetationGroup } from '../../src/rendering/decorationLayout.js'
import { availableFutureSheets } from '../../src/ui/spriteSheetRegistry.js'
import { OrganicTerrain } from '../../src/rendering/organicTerrain.js'

function group(label, tags, width = 1, height = width) {
  const tilesByOffset = {}
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) tilesByOffset[`${x},${y}`] = { rect: { x, y, width: 64, height: 64 }, tags }
  return { groupLabel: label, width, height, tilesByOffset, tagSet: new Set(tags) }
}
const labels = list => list.map(g => g.groupLabel).sort()

describe('strict snow decoration placement', () => {
  it('keeps universal vegetation off snow but still offers it to other biomes', () => {
    const pools = buildDecorationPools([
      group('universal-shrub', ['decorative', 'passable', 'universal', 'trees']),
      group('universal-rock', ['decorative', 'impassable', 'universal', 'rocks']),
      group('universal-ruin', ['decorative', 'impassable', 'universal', 'ruins'], 2),
      group('snowy-tree', ['decorative', 'passable', 'snow', 'trees']),
      group('grass-tree', ['decorative', 'passable', 'grass', 'trees'])
    ])
    expect(labels(pools.snow.single)).toEqual(['snowy-tree', 'universal-rock'])
    expect(labels(pools.snow.multi)).toEqual(['universal-ruin'])
    expect(labels(pools.grass.single)).toEqual(['grass-tree', 'universal-rock', 'universal-shrub'])
  })

  it('accepts a new snow-tagged winter sheet group (trees and shrubs) on snow only', () => {
    const pools = buildDecorationPools([
      group('winter-shrubs', ['decorative', 'passable', 'snow', 'shrubs', 'winter']),
      group('winter-forest', ['decorative', 'impassable', 'snow', 'trees', 'winter'], 2)
    ])
    expect(labels(pools.snow.single)).toEqual(['winter-shrubs'])
    expect(labels(pools.snow.multi)).toEqual(['winter-forest'])
    expect(pools.grass.single).toEqual([])
    expect(pools.grass.multi).toEqual([])
  })

  it('classifies vegetation tags', () => {
    expect(isVegetationGroup(new Set(['universal', 'shrubs']))).toBe(true)
    expect(isVegetationGroup(new Set(['universal', 'rocks']))).toBe(false)
    expect(groupAllowedOnBiome(new Set(['universal', 'farm']), 'snow')).toBe(false)
    expect(groupAllowedOnBiome(new Set(['universal', 'farm']), 'soil')).toBe(true)
    expect(groupAllowedOnBiome(new Set(['snow', 'trees']), 'snow')).toBe(true)
  })

  it('auto-registers any additional bundled dtv sheet pair, such as a winter sheet', () => {
    const warn = vi.fn()
    const dir = '/public/images/map/sprite_sheets/'
    const files = {}
    for (const name of ['dtv3_ground_detail', 'dtv3_shore', 'dtv3_city', 'dtv3_winter', 'dtv2_snow']) {
      files[`${dir}${name}.webp`] = 'image'
      files[`${dir}${name}.json`] = 'metadata'
    }
    files[`${dir}dtv4_halfdone.webp`] = 'image'
    expect(availableFutureSheets(files, warn)).toEqual([
      'images/map/sprite_sheets/dtv3_ground_detail.webp',
      'images/map/sprite_sheets/dtv3_shore.webp',
      'images/map/sprite_sheets/dtv3_city.webp',
      'images/map/sprite_sheets/dtv3_winter.webp'
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('never draws the green fallback ground details on snow tiles', () => {
    const renderer = Object.create(OrganicTerrain.prototype)
    renderer.details = {}
    const ctx = { drawImage: vi.fn() }
    const make = biome => Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => ({ type: 'land', biome })))
    const draws = (biome) => {
      ctx.drawImage.mockClear()
      const grid = make(biome)
      for (let y = 1; y < 39; y++) for (let x = 1; x < 39; x++) renderer.drawDecoration(ctx, grid, x, y, 0, 0, 32, null)
      return ctx.drawImage.mock.calls.length
    }
    expect(draws('grass')).toBeGreaterThan(0)
    expect(draws('snow')).toBe(0)
  })
})
