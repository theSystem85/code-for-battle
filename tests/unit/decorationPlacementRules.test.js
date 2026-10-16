import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  buildCategoryClusters, buildDecorationConstraints, buildDecorationLayout, buildDecorationPools,
  categoryClusterAllows, createDecorationBag, decorationDensity, decorationEnvironmentAllows,
  decorationFootprintDistance, decorationIdentity, decorationSeed, decorationSpacing,
  decorationSpacingAllows, getValidDecorationCell, landmarkAllows
} from '../../src/rendering/decorationLayout.js'
import { MapRenderer } from '../../src/rendering/mapRenderer.js'
import { TextureManager } from '../../src/rendering/textureManager.js'
import { availableFutureSheets } from '../../src/ui/spriteSheetRegistry.js'

const grid = (size = 96) => Array.from({ length: size }, () => Array.from({ length: size }, () => ({ type: 'land', biome: 'grass' })))
function group(id, tags = [], width = 1, height = width) {
  const tilesByOffset = {}
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    tilesByOffset[`${x},${y}`] = { sheetPath: 'optional.webp', image: {}, rect: { x: x * 64, y: y * 64, width: 64, height: 64 }, tags: ['grass', 'decorative', ...tags] }
  }
  return { groupLabel: id, width, height, tilesByOffset, tagSet: new Set(['grass', 'decorative', ...tags]) }
}
const point = (g, x, y) => ({ group: g, anchorX: x, anchorY: y })
const anchors = layout => layout.cells.filter(cell => cell && cell.offsetX === 0 && cell.offsetY === 0)

describe('natural decoration preparation', () => {
  it('samples smooth seeded noise with both dense patches and clearings', () => {
    expect(decorationSeed('map-688')).toBe(decorationSeed('map-688'))
    expect(decorationSeed('map-689')).not.toBe(decorationSeed('map-688'))
    const values = []
    for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) {
      const value = decorationDensity(x, y, 'map-688')
      expect(value).toBe(decorationDensity(x, y, 'map-688'))
      expect(Math.abs(value - decorationDensity(x + 0.01, y, 'map-688'))).toBeLessThan(0.01)
      values.push(value)
    }
    expect(Math.min(...values)).toBe(0)
    expect(Math.max(...values)).toBe(1)
    expect(decorationDensity(12, 25, 688)).not.toBe(decorationDensity(12, 25, 689))
  })

  it('grows separate seeded forest, rock and farm patches on matching biomes', () => {
    const map = grid()
    const clusters = buildCategoryClusters(map, { salt: 688 })
    expect(buildCategoryClusters(map, { salt: 688 })).toEqual(clusters)
    expect(buildCategoryClusters(map, { salt: 689 }).trees.centers).not.toEqual(clusters.trees.centers)
    expect(clusters.trees.centers).not.toEqual(clusters.rocks.centers)
    for (const category of ['trees', 'rocks', 'farm']) {
      const center = clusters[category].centers[0]
      expect(categoryClusterAllows(group(category, [category]), center.x, center.y, 'grass', clusters)).toBe(true)
      expect(categoryClusterAllows(group(category, [category]), center.x, center.y, 'snow', clusters)).toBe(false)
      const layout = buildDecorationLayout(map, buildDecorationPools([group(category, [category])]), { salt: 688 })
      expect(anchors(layout).length).toBeGreaterThan(0)
      for (const cell of anchors(layout)) expect(categoryClusterAllows(cell.group, cell.anchorX, cell.anchorY, cell.biome, clusters)).toBe(true)
    }
    const center = clusters.farm.centers[0]
    expect(categoryClusterAllows(group('orchard', ['trees', 'farm']), center.x, center.y, 'grass', clusters)).toBe(true)
    expect(categoryClusterAllows(group('other'), 0, 0, 'grass', clusters)).toBe(true)
  })

  it('reserves road buffers and confines roadside and shore sprites to their environments', () => {
    const map = grid(40)
    for (let y = 0; y < 40; y++) { map[y][10].type = 'street'; map[y][30].type = 'water' }
    const constraints = buildDecorationConstraints(map)
    const roadside = group('wreck', ['roadside'])
    const shore = group('reeds', ['shore'])
    expect(decorationEnvironmentAllows(roadside, 12, 10, constraints)).toBe(true)
    expect(decorationEnvironmentAllows(roadside, 11, 10, constraints)).toBe(false)
    expect(decorationEnvironmentAllows(roadside, 13, 10, constraints)).toBe(false)
    expect(decorationEnvironmentAllows(shore, 29, 10, constraints)).toBe(true)
    expect(decorationEnvironmentAllows(shore, 28, 10, constraints)).toBe(false)
    const layout = buildDecorationLayout(map, buildDecorationPools([roadside, shore]), { salt: 688 })
    expect(anchors(layout).length).toBeGreaterThan(0)
    for (const cell of anchors(layout)) {
      expect(map[cell.anchorY][cell.anchorX].type).toBe('land')
      expect(decorationEnvironmentAllows(cell.group, cell.anchorX, cell.anchorY, constraints)).toBe(true)
    }
  })

  it('keeps starts, bases, ore and narrow passages clear over entire footprints', () => {
    const map = grid(64)
    map[30][30].ore = true
    map[48][48].basePosition = true
    map[10][19].type = 'water'
    map[10][22].type = 'rock'
    const starts = [{ x: 10, y: 40 }]
    const constraints = buildDecorationConstraints(map, starts)
    for (const [x, y] of [[18, 40], [10, 32], [32, 30], [48, 40], [20, 10], [21, 10]]) expect(constraints.keepClear[y * 64 + x]).toBe(1)
    expect(constraints.keepClear[30 * 64 + 33]).toBe(0)
    const layout = buildDecorationLayout(map, buildDecorationPools([group('large', [], 3), group('small')]), { salt: 688, placementRules: true, startPositions: starts })
    expect(anchors(layout).length).toBeGreaterThan(0)
    layout.cells.forEach((cell, index) => { if (cell) expect(constraints.keepClear[index]).toBe(0) })
  })

  it('uses footprint spans for small/medium/large spacing and six-tile variety', () => {
    const large = group('large', [], 3)
    const medium = group('medium', [], 2)
    const small = group('small')
    expect([large, medium, small].map(decorationSpacing)).toEqual([4, 2, 1])
    expect(decorationFootprintDistance(point(large, 0, 0), point(medium, 6, 0))).toBe(4)
    expect(decorationSpacingAllows(point(medium, 5, 0), [point(large, 0, 0)])).toBe(false)
    expect(decorationSpacingAllows(point(medium, 6, 0), [point(large, 0, 0)])).toBe(true)
    expect(decorationSpacingAllows(point(small, 5, 0), [point(small, 0, 0)])).toBe(false)
    expect(decorationSpacingAllows(point(small, 6, 0), [point(small, 0, 0)])).toBe(true)
    expect(decorationIdentity({ ...small, tilesByOffset: { '0,0': { sheetPath: 'other.webp' } } })).not.toBe(decorationIdentity(small))
    const layout = buildDecorationLayout(grid(), buildDecorationPools([large, medium, small]), { salt: 688, placementRules: true })
    const placed = anchors(layout)
    expect(placed.length).toBeGreaterThan(10)
    placed.forEach((cell, i) => expect(decorationSpacingAllows(cell, placed.slice(i + 1))).toBe(true))
  })

  it('caps landmarks per 64x64 region and at three per map', () => {
    expect(landmarkAllows(63, 63, [{ anchorX: 0, anchorY: 0 }])).toBe(false)
    expect(landmarkAllows(64, 63, [{ anchorX: 0, anchorY: 0 }])).toBe(true)
    expect(landmarkAllows(200, 200, [{ anchorX: 0, anchorY: 0 }, { anchorX: 64, anchorY: 0 }, { anchorX: 0, anchorY: 64 }])).toBe(false)
    const layout = buildDecorationLayout(grid(192), buildDecorationPools([group('landmark', ['landmark'], 3)]), { salt: 688 })
    const placed = anchors(layout)
    expect(placed.length).toBe(3)
    expect(new Set(placed.map(p => `${Math.floor(p.anchorX / 64)},${Math.floor(p.anchorY / 64)}`)).size).toBe(3)
  })

  it('offers candidates evenly in reproducible shuffled bags', () => {
    const candidates = [group('a'), group('b'), group('c')]
    const bag = createDecorationBag(candidates, 688)
    const again = createDecorationBag(candidates, 688)
    const choices = Array.from({ length: 30 }, () => bag.next())
    expect(choices).toEqual(Array.from({ length: 30 }, () => again.next()))
    for (const candidate of candidates) expect(choices.filter(value => value === candidate)).toHaveLength(10)
    expect(new Set(choices.slice(0, 3)).size).toBe(3)
    expect(createDecorationBag([]).next()).toBeNull()
  })

  it('places passable detail independently, without altering decoration spacing or occupancy', () => {
    const map = grid()
    const prop = group('prop')
    const detail = group('detail', ['ground_detail', 'passable'])
    const layout = buildDecorationLayout(map, buildDecorationPools([prop, detail]), { salt: 688 })
    const without = buildDecorationLayout(map, buildDecorationPools([prop]), { salt: 688, placementRules: true })
    expect(layout.cells).toEqual(without.cells)
    expect(layout.groundDetails.filter(Boolean).length).toBeGreaterThan(0)
    expect(layout.groundDetails.filter(Boolean).length).toBeLessThan(map.length ** 2 / 20)
    const offset = layout.groundDetails.findIndex(Boolean)
    expect(getValidDecorationCell(layout, map, offset % 96, Math.floor(offset / 96), 'grass', true)).toBeTruthy()
    map[Math.floor(offset / 96)][offset % 96].type = 'water'
    expect(getValidDecorationCell(layout, map, offset % 96, Math.floor(offset / 96), 'grass', true)).toBeNull()
    const again = buildDecorationLayout(grid(), buildDecorationPools([prop, detail]), { salt: 688 })
    expect(again).toEqual(layout)
  })

  it('renders detail at 0.55 opacity below decorations, restoring canvas state', () => {
    const events = []
    const renderer = Object.create(MapRenderer.prototype)
    const ctx = { globalAlpha: 0.8 }
    const detail = { image: {}, rect: { x: 0, y: 0, width: 32, height: 32 } }
    const decoration = { ...detail }
    renderer.textureManager = {
      integratedSpriteSheetMode: true, hasGroundDetails: true,
      getGroundDetailForMapTile: () => detail,
      getIntegratedTileForMapTile: () => decoration
    }
    renderer.drawIntegratedTileImage = vi.fn((context, tile) => { events.push({ tile, alpha: context.globalAlpha }); return true })
    renderer.drawIntegratedLandOverlay(ctx, grid(1), { type: 'land' }, 0, 0, 0, 0)
    expect(events).toEqual([{ tile: detail, alpha: 0.8 * 0.55 }, { tile: decoration, alpha: 0.8 }])
    expect(ctx.globalAlpha).toBe(0.8)
    renderer.textureManager.hasGroundDetails = false
    renderer.textureManager.getGroundDetailForMapTile = vi.fn()
    renderer.drawGroundDetail(ctx, grid(1), 0, 0, 0, 0)
    expect(renderer.textureManager.getGroundDetailForMapTile).not.toHaveBeenCalled()
  })

  it('loads ungrouped ground detail separately from terrain and blocking tags', async() => {
    const manager = new TextureManager()
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue({ width: 64, height: 64 })
    await manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets: [{ sheetPath: 'images/map/sprite_sheets/dtv3_ground_detail.webp', metadata: {
      blendMode: 'alpha', tiles: { '0,0': { col: 0, row: 0, tags: ['grass', 'passable', 'ground_detail'], rect: { x: 0, y: 0, width: 64, height: 64 } } }
    } }] })
    expect(manager.hasGroundDetails).toBe(true)
    expect(manager.integratedLandBuckets.grass.passable).toHaveLength(0)
    const map = grid()
    const layout = manager.getDecorationLayout(map)
    expect(layout.cells.some(Boolean)).toBe(false)
    const index = layout.groundDetails.findIndex(Boolean)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(manager.getGroundDetailForMapTile(map, index % 96, Math.floor(index / 96))).toBeTruthy()
    expect(manager.getIntegratedTileForMapTile('land', index % 96, Math.floor(index / 96), { mapGrid: map })).toBeNull()
  })

  it('registers future sheets only when both files exist and warns for missing pairs', () => {
    const warn = vi.fn()
    expect(availableFutureSheets({}, warn)).toEqual([])
    expect(warn).toHaveBeenCalledTimes(2)
    const prefix = '/public/images/map/sprite_sheets/dtv3_ground_detail'
    expect(availableFutureSheets({ [`${prefix}.webp`]: 'image' }, warn)).toEqual([])
    expect(availableFutureSheets({ [`${prefix}.webp`]: 'image', [`${prefix}.json`]: 'metadata' }, warn)).toEqual(['images/map/sprite_sheets/dtv3_ground_detail.webp'])
  })

  it('preserves source impassability and synchronizes categories on every prop cell', () => {
    for (const biome of ['grass', 'soil', 'sand', 'snow', 'universal']) {
      const sheet = JSON.parse(readFileSync(`public/images/map/sprite_sheets/dtv2_${biome}.json`, 'utf8'))
      for (const prop of sheet.propLayout) {
        const categories = prop.tags.filter(tag => ['trees', 'rocks', 'farm', 'landmark', 'roadside'].includes(tag))
        for (let y = prop.row; y < prop.row + prop.h; y++) for (let x = prop.col; x < prop.col + prop.w; x++) {
          expect(sheet.tiles[`${x},${y}`].tags).toEqual(expect.arrayContaining(categories))
          if (prop.tags.includes('impassable')) expect(sheet.tiles[`${x},${y}`].tags).toContain('impassable')
        }
      }
      for (const prop of sheet.propLayout.filter(prop => prop.tags.includes('landmark'))) expect([prop.w, prop.h]).toEqual([3, 3])
    }
  })
})
