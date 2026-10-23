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
  it('[U04084] keeps universal vegetation off snow but still offers it to other biomes', () => {
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

  it('[U04085] accepts a new snow-tagged winter sheet group (trees and shrubs) on snow only', () => {
    const pools = buildDecorationPools([
      group('winter-shrubs', ['decorative', 'passable', 'snow', 'shrubs', 'winter']),
      group('winter-forest', ['decorative', 'impassable', 'snow', 'trees', 'winter'], 2)
    ])
    expect(labels(pools.snow.single)).toEqual(['winter-shrubs'])
    expect(labels(pools.snow.multi)).toEqual(['winter-forest'])
    expect(pools.grass.single).toEqual([])
    expect(pools.grass.multi).toEqual([])
  })

  it('[U04086] classifies vegetation tags', () => {
    expect(isVegetationGroup(new Set(['universal', 'shrubs']))).toBe(true)
    expect(isVegetationGroup(new Set(['universal', 'rocks']))).toBe(false)
    expect(groupAllowedOnBiome(new Set(['universal', 'farm']), 'snow')).toBe(false)
    expect(groupAllowedOnBiome(new Set(['universal', 'farm']), 'soil')).toBe(true)
    expect(groupAllowedOnBiome(new Set(['snow', 'trees']), 'snow')).toBe(true)
  })

  it('[U04087] auto-registers any additional bundled dtv sheet pair, such as a winter sheet', () => {
    const warn = vi.fn()
    const dir = '/public/images/map/sprite_sheets/'
    const files = {}
    for (const name of ['dtv3_ground_detail', 'dtv6_shore', 'dtv3_city', 'dtv6_decor_snow']) {
      files[`${dir}${name}.webp`] = 'image'
      files[`${dir}${name}.json`] = 'metadata'
    }
    files[`${dir}dtv4_halfdone.webp`] = 'image'
    expect(availableFutureSheets(files, warn)).toEqual([
      'images/map/sprite_sheets/dtv3_ground_detail.webp',
      'images/map/sprite_sheets/dtv3_city.webp',
      'images/map/sprite_sheets/dtv6_decor_snow.webp',
      'images/map/sprite_sheets/dtv6_shore.webp'
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('[U04088] never draws the green fallback ground details on snow tiles', () => {
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

describe('dtv6_decor_snow sheet', () => {
  it('[U04089] is snow-only vegetation with the allowed tags and grouped multi-tile trees', async() => {
    const { readFileSync } = await import('node:fs')
    const sheet = JSON.parse(readFileSync('public/images/map/sprite_sheets/dtv6_decor_snow.json', 'utf8'))
    expect(sheet.sheetPath).toBe('images/map/sprite_sheets/dtv6_decor_snow.webp')

    for (const tile of Object.values(sheet.tiles)) {
      expect(tile.tags).toContain('winter')
      expect(tile.tags).not.toContain('universal')
      expect(tile.tags).toEqual(expect.arrayContaining(['decorative', 'snow']))
      expect(tile.tags.includes('passable') !== tile.tags.includes('impassable')).toBe(true)
    }
    for (const prop of sheet.propLayout) {
      const multi = prop.w * prop.h > 1
      expect(prop.tags.some(tag => tag.startsWith('group_'))).toBe(multi)
      if (prop.tags.includes('trees')) expect(prop.tags).toContain('impassable')
      for (let y = prop.row; y < prop.row + prop.h; y++) for (let x = prop.col; x < prop.col + prop.w; x++) expect(sheet.tiles[`${x},${y}`].tags).toEqual(prop.tags)
    }
  })
})
