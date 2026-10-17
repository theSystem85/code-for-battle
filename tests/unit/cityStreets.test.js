import { describe, it, expect, vi } from 'vitest'
import { buildDecorationLayout, buildDecorationPools } from '../../src/rendering/decorationLayout.js'
import { applyCityStreets, prepareCityBuildings } from '../../src/game/cityBuildings.js'

vi.mock('../../src/sound.js', () => ({ playPositionalSound: vi.fn() }))
vi.mock('../../src/game/spriteSheetEffects.js', () => ({ spawnDestructionExplosion: vi.fn() }))

const ROAD_ROW = 58

function fixture() {
  const map = Array.from({ length: 64 }, (_, y) => Array.from({ length: 64 }, () => ({ type: y === ROAD_ROW ? 'street' : 'land', biome: 'grass' })))
  const tags = ['universal', 'decorative', 'city', 'impassable']
  const city = { width: 2, height: 2, groupLabel: 'block', tagSet: new Set(tags), tilesByOffset: Object.fromEntries(['0,0', '1,0', '0,1', '1,1'].map(key => [key, { tags, rect: { x: 0, y: 0, width: 64, height: 64 } }])) }
  const treeTags = ['universal', 'decorative', 'trees', 'impassable']
  const tree = { width: 1, height: 1, groupLabel: 'tree', tagSet: new Set(treeTags), tilesByOffset: { '0,0': { tags: treeTags, rect: { x: 64, y: 0, width: 64, height: 64 } } } }
  return { map, pools: buildDecorationPools([city, tree]) }
}

const options = { salt: 688, citySeeds: 2, cityClusterSize: 8 }

function cityTiles(layout) {
  const tiles = new Set()
  layout.cells.forEach((cell, offset) => { if (cell?.group.tagSet.has('city')) tiles.add(offset) })
  return tiles
}

describe('city streets', () => {
  it('lays streets between city buildings without covering any building', () => {
    const { map, pools } = fixture()
    const layout = buildDecorationLayout(map, pools, options)
    const houses = cityTiles(layout)
    expect(houses.size).toBeGreaterThan(8)
    expect(layout.cityStreets.length).toBeGreaterThan(0)
    for (const offset of layout.cityStreets) {
      expect(houses.has(offset)).toBe(false)
      expect(layout.cells[offset]).toBeNull()
    }
    // Every city building touches a street on at least one side.
    const streets = new Set(layout.cityStreets)
    for (const placement of layout.placements.filter(p => p.group.tagSet.has('city'))) {
      const { anchorX: x, anchorY: y } = placement
      const ring = []
      for (let d = 0; d < 2; d++) ring.push([x - 1, y + d], [x + 2, y + d], [x + d, y - 1], [x + d, y + 2])
      expect(ring.some(([rx, ry]) => streets.has(ry * 64 + rx))).toBe(true)
    }
  })

  it('connects every city street to the generated road network', () => {
    const { map, pools } = fixture()
    const layout = buildDecorationLayout(map, pools, options)
    prepareCityBuildings(map, layout)
    const start = layout.cityStreets[0]
    const seen = new Set([start])
    const queue = [start]
    let reachedRoad = false
    while (queue.length) {
      const offset = queue.shift()
      const x = offset % 64
      const y = (offset - x) / 64
      if (map[y][x].type === 'street' && !map[y][x].cityStreet) reachedRoad = true
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const next = ny * 64 + nx
        if (nx < 0 || ny < 0 || nx >= 64 || ny >= 64 || seen.has(next) || map[ny][nx].type !== 'street') continue
        seen.add(next)
        queue.push(next)
      }
    }
    expect(reachedRoad).toBe(true)
    for (const offset of layout.cityStreets) expect(seen.has(offset)).toBe(true)
  })

  it('is idempotent once streets are stamped and reverts them when cities are disabled', () => {
    const { map, pools } = fixture()
    const layout = buildDecorationLayout(map, pools, options)
    expect(applyCityStreets(map, layout)).toBe(layout.cityStreets.length)
    const offset = layout.cityStreets[0]
    expect(map[Math.floor(offset / 64)][offset % 64]).toMatchObject({ type: 'street', cityStreet: true })
    const rebuilt = buildDecorationLayout(map, pools, options)
    expect(rebuilt.cityStreets).toEqual(layout.cityStreets)
    expect(rebuilt.placements.map(p => `${p.anchorX},${p.anchorY}`)).toEqual(layout.placements.map(p => `${p.anchorX},${p.anchorY}`))
    expect(applyCityStreets(map, rebuilt)).toBe(0)
    const disabled = buildDecorationLayout(map, pools, { ...options, citySeeds: 0 })
    expect(disabled.cityStreets).toEqual([])
    applyCityStreets(map, disabled)
    expect(map.flat().some(tile => tile.cityStreet)).toBe(false)
    expect(map.flat().filter(tile => tile.type === 'street')).toHaveLength(64)
  })
})
