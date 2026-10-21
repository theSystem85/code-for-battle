import { describe, it, expect, vi } from 'vitest'
import { buildDecorationLayout, buildDecorationPools, planOrganicCityStreets, buildRuinClusters } from '../../src/rendering/decorationLayout.js'
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
  it('[U00866] lays streets between city buildings without covering any building', () => {
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

  it('[U00867] connects every city street to the generated road network', () => {
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

  it('[U00868] is idempotent once streets are stamped and reverts them when cities are disabled', () => {
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

  it('[U00869] lines every house up with one full side facing a street (no interior blocks)', () => {
    const { map, pools } = fixture()
    const layout = buildDecorationLayout(map, pools, options)
    const streets = new Set(layout.cityStreets)
    const houses = layout.placements.filter(p => p.group.tagSet.has('city'))
    expect(houses.length).toBeGreaterThan(8)
    for (const { anchorX: x, anchorY: y, group: { width: w, height: h } } of houses) {
      const row = (y0) => [...Array(w)].every((_, i) => streets.has(y0 * 64 + x + i))
      const column = (x0) => [...Array(h)].every((_, i) => streets.has((y + i) * 64 + x0))
      expect(row(y - 1) || row(y + h) || column(x - 1) || column(x + w)).toBe(true)
    }
  })

  it('[U00870] plans one curved main street per city with 1-4 side streets, deterministically', () => {
    const { map } = fixture()
    const cities = buildRuinClusters(map, { salt: 7919, count: 2, radius: 8, minDistance: 1 })
    const plan = planOrganicCityStreets(map, cities, { salt: 5 })
    expect(plan.cities.length).toBe(cities.centers.length)
    for (const city of plan.cities) {
      const main = city.streets.filter(street => street.kind === 'main')
      expect(main).toHaveLength(1)
      expect(main[0].tiles.length).toBeGreaterThanOrEqual(9)
      const sides = city.streets.filter(street => street.kind === 'side')
      expect(sides.length).toBeGreaterThanOrEqual(1)
      expect(sides.length).toBeLessThanOrEqual(4)
      // Every street is a single 4-connected chain.
      for (const street of city.streets) {
        for (let i = 1; i < street.tiles.length; i++) {
          const a = street.tiles[i - 1]
          const b = street.tiles[i]
          expect(Math.abs((a % 64) - (b % 64)) + Math.abs(Math.floor(a / 64) - Math.floor(b / 64))).toBe(1)
        }
      }
    }
    // The main street is not a straight line through the centre (gentle curve or a sidestep).
    const bent = plan.cities.some(city => {
      const tiles = city.streets[0].tiles
      return new Set(tiles.map(o => o % 64)).size > 1 && new Set(tiles.map(o => Math.floor(o / 64))).size > 1
    })
    expect(bent).toBe(true)
    expect(planOrganicCityStreets(map, cities, { salt: 5 }).cities).toEqual(plan.cities)
  })

  it('[U00871] bends a street around water instead of crossing it', () => {
    const { map } = fixture()
    const cities = { radius: 8, centers: [{ x: 30, y: 30, biome: 'grass' }] }
    const straight = planOrganicCityStreets(map, cities, { salt: 1 })
    const main = straight.cities[0].streets[0].tiles
    const blocker = main[main.length - 3]
    const bx = blocker % 64
    const by = Math.floor(blocker / 64)
    map[by][bx].type = 'water'
    const bent = planOrganicCityStreets(map, cities, { salt: 1 })
    for (const city of bent.cities) for (const street of city.streets) for (const offset of street.tiles) expect(map[Math.floor(offset / 64)][offset % 64].type).not.toBe('water')
    expect(bent.cities[0].streets[0].tiles.length).toBeGreaterThanOrEqual(main.length - 1)
  })
})

it('[U05432] places large city buildings closer to the center while keeping small houses on outer streets', () => {
  const groups = [1, 2, 3].map(size => {
    const tags = ['grass', 'decorative', 'city', 'impassable']
    return { width: size, height: size, groupLabel: `city-${size}`, tagSet: new Set(tags),
      tilesByOffset: Object.fromEntries(Array.from({ length: size * size }, (_, i) => [`${i % size},${Math.floor(i / size)}`, { tags }])) }
  })
  const distances = [[], [], []]
  for (const seed of [1, 2, 3, 688]) {
    const map = Array.from({ length: 96 }, () => Array.from({ length: 96 }, () => ({ type: 'land', biome: 'grass' })))
    const pools = buildDecorationPools(groups)
    const settings = { salt: seed, citySeeds: 2, cityClusterSize: 8 }
    const layout = buildDecorationLayout(map, pools, settings)
    const centers = buildRuinClusters(map, { salt: seed + 7919, count: 2, radius: 8, minDistance: 1 }).centers
    const seen = new Set()
    for (const cell of layout.cells) {
      if (!cell || seen.has(`${cell.anchorX},${cell.anchorY}`)) continue
      seen.add(`${cell.anchorX},${cell.anchorY}`)
      const { group, anchorX: x, anchorY: y } = cell
      const distance = Math.min(...centers.map(center => Math.hypot(x + (group.width - 1) / 2 - center.x, y + (group.height - 1) / 2 - center.y)))
      distances[group.width - 1].push(distance)
      for (let dy = 0; dy < group.height; dy++) for (let dx = 0; dx < group.width; dx++) {
        expect(layout.cells[(y + dy) * 96 + x + dx].group).toBe(group)
        expect(layout.cityStreets).not.toContain((y + dy) * 96 + x + dx)
      }
    }
    expect(buildDecorationLayout(map, pools, settings).cells).toEqual(layout.cells)
  }
  const means = distances.map(values => values.reduce((sum, value) => sum + value, 0) / values.length)
  expect(distances.every(values => values.length > 0)).toBe(true)
  expect(means[2]).toBeLessThan(means[1])
  expect(means[1]).toBeLessThan(means[0])
})
