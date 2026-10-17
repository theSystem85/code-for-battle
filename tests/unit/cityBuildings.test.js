import { describe, it, expect, vi } from 'vitest'
import { buildDecorationLayout, buildDecorationPools, getValidDecorationCell, buildRuinClusters } from '../../src/rendering/decorationLayout.js'
import { normalizeDecorationSettings } from '../../src/game/decorationSettings.js'
import { prepareCityBuildings, getCityBuildings, applyCityDamage, applyCitySnapshot, getCityAtWorld, renderCityHealthBars, findCityBuildingById, getAttackableCityAtWorld, isCityBuildingTarget } from '../../src/game/cityBuildings.js'
import { createReplayEntityReference } from '../../src/replayCommandPrimitives.js'
import { CITY_BUILDING_HEALTH } from '../../src/config.js'
import { pathCache } from '../../src/game/pathCache.js'

vi.mock('../../src/sound.js', () => ({ playPositionalSound: vi.fn() }))
vi.mock('../../src/game/spriteSheetEffects.js', () => ({ spawnDestructionExplosion: vi.fn() }))

function fixture(size = 64) {
  const map = Array.from({ length: size }, () => Array.from({ length: size }, () => ({ type: 'land', biome: 'grass' })))
  const tags = ['universal', 'decorative', 'city', 'impassable']
  const group = { width: 2, height: 2, tagSet: new Set(tags), tilesByOffset: Object.fromEntries(['0,0', '1,0', '0,1', '1,1'].map(key => [key, { tags, rect: { x: 0, y: 0, width: 64, height: 64 } }])) }
  return { map, pools: buildDecorationPools([group]) }
}

function prepared() {
  const { map, pools } = fixture()
  const layout = buildDecorationLayout(map, pools, { salt: 688 })
  const buildings = prepareCityBuildings(map, layout)
  return { map, layout, buildings }
}

describe('city clusters and settings', () => {
  it('normalizes defaults and clamps integer settings, preserving zero centers', () => {
    expect(normalizeDecorationSettings()).toEqual({ citySeeds: 2, cityClusterSize: 8, ruinSeeds: 3, ruinClusterSize: 7 })
    expect(normalizeDecorationSettings({ citySeeds: 0, cityClusterSize: 900, ruinSeeds: -5, ruinClusterSize: 1 })).toEqual({ citySeeds: 0, cityClusterSize: 20, ruinSeeds: 0, ruinClusterSize: 3 })
    expect(normalizeDecorationSettings({ citySeeds: '7.9', ruinSeeds: NaN }).citySeeds).toBe(7)
  })

  it('places dense deterministic city grids only in seeded clusters, without overlap or water', () => {
    const { map, pools } = fixture()
    map[12][12].type = 'water'
    map[40][40].ore = true
    const options = { salt: 688, citySeeds: 2, cityClusterSize: 8, startPositions: [{ x: 20, y: 20 }] }
    const layout = buildDecorationLayout(map, pools, options)
    expect(buildDecorationLayout(map, pools, options)).toEqual(layout)
    expect(buildDecorationLayout(map, pools, { ...options, salt: 689 }).cells).not.toEqual(layout.cells)
    expect(layout.placements.length).toBeGreaterThan(8)
    const clusters = buildRuinClusters(map, { salt: 688 + 7919, count: 2, radius: 8, minDistance: 1 })
    for (const placement of layout.placements) {
      const { anchorX: x, anchorY: y } = placement
      expect(clusters.centers.some(c => Math.hypot(c.x - x, c.y - y) <= 8)).toBe(true)
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        expect(map[y + dy][x + dx].type).toBe('land')
        expect(Math.hypot(x + dx - 20, y + dy - 20)).toBeGreaterThan(8)
        expect(Math.hypot(x + dx - 40, y + dy - 40)).toBeGreaterThan(2)
        expect(layout.cells[(y + dy) * 64 + x + dx].anchorX).toBe(x)
      }
    }
    expect(buildDecorationLayout(map, pools, { ...options, citySeeds: 0 }).cells.every(cell => !cell)).toBe(true)
  })
})

describe('city structure lifecycle', () => {
  it.each([
    ['house', 1, 1], ['shop', 2, 1], ['shop block', 2, 2], ['petrol station', 2, 2]
  ])('derives %s HP from its actual %ix%i footprint', (label, width, height) => {
    const { map, pools } = fixture()
    const group = { ...pools.grass.multi[0], groupLabel: label, width, height }
    const cells = new Array(64 * 64).fill(null)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      cells[y * 64 + x] = { group, anchorX: 0, anchorY: 0, offsetX: x, offsetY: y }
    }
    const buildings = prepareCityBuildings(map, { cells, width: 64, height: 64 })
    expect(buildings).toHaveLength(1)
    expect(buildings[0].health).toBe(CITY_BUILDING_HEALTH[width * height])
    expect(buildings[0].maxHealth).toBe(CITY_BUILDING_HEALTH[width * height])
    expect(cells.filter(Boolean).every(cell => cell.cityBuilding === buildings[0])).toBe(true)
  })

  it('shares group HP, stamps existing debris, removes intact imagery, frees only static occupancy and clears cached paths', () => {
    const { map, layout, buildings } = prepared()
    const building = buildings[0]
    expect(building.maxHealth).toBe(400)
    expect(getCityAtWorld(map, building.x * 32 + 16, building.y * 32 + 16)).toBe(building)
    const state = { mapSeed: '688', occupancyMap: map.map(row => row.map(() => 2)) }
    pathCache.set('test', [])
    applyCityDamage(building, 100, map, state)
    expect(building.health).toBe(300)
    expect(getValidDecorationCell(layout, map, building.x, building.y)).not.toBeNull()
    applyCityDamage(building, 5000, map, state)
    expect(building.health).toBe(0)
    expect(getValidDecorationCell(layout, map, building.x, building.y)).toBeNull()
    expect(pathCache.size).toBe(0)
    for (let y = building.y; y < building.y + 2; y++) for (let x = building.x; x < building.x + 2; x++) {
      expect(map[y][x].decal.tag).toBe('debris')
      expect(state.occupancyMap[y][x]).toBe(1)
    }
    const counter = map[building.y][building.x].decalCounter
    applyCityDamage(building, 5000, map, state)
    expect(map[building.y][building.x].decalCounter).toBe(counter)
  })

  it('preserves tombstones and HP after serialization and layout preparation', () => {
    const { map, layout, buildings } = prepared()
    applyCityDamage(buildings[0], 9999, map, {})
    applyCityDamage(buildings[1], 100, map, {})
    const restored = JSON.parse(JSON.stringify(map))
    // Use the same deterministic catalog/layout, with new persistent anchor objects.
    prepareCityBuildings(restored, layout)
    expect(getCityBuildings(restored)[0].health).toBe(0)
    expect(getCityBuildings(restored)[1].health).toBe(300)
    expect(getValidDecorationCell(layout, restored, buildings[0].x, buildings[0].y)).toBeNull()
  })

  it('accepts host snapshots in place and rejects local client damage', () => {
    const { map, buildings } = prepared()
    const building = buildings[0]
    const state = { multiplayerSession: { isRemote: true, localRole: 'client' } }
    expect(applyCityDamage(building, 9999, map, state)).toBe(false)
    applyCitySnapshot(map, state, JSON.parse(JSON.stringify([{ ...building, health: 0 }])))
    expect(building.health).toBe(0)
    expect(map[building.y][building.x].decal.tag).toBe('debris')
    const counter = map[building.y][building.x].decalCounter
    applyCitySnapshot(map, state, [{ ...building }])
    expect(map[building.y][building.x].decalCounter).toBe(counter)
  })

  it('draws health bars only for damaged living cities', () => {
    const { map, buildings } = prepared()
    const ctx = { canvas: { width: 4096, height: 4096 }, fillRect: vi.fn() }
    renderCityHealthBars(ctx, map, { x: 0, y: 0 })
    expect(ctx.fillRect).not.toHaveBeenCalled()
    buildings[0].health--
    renderCityHealthBars(ctx, map, { x: 0, y: 0 })
    expect(ctx.fillRect).toHaveBeenCalledTimes(2)
  })

  it('resolves city targets by id and reference for commands, replays and saves', () => {
    const { map, buildings } = prepared()
    const building = buildings[0]
    expect(isCityBuildingTarget(building)).toBe(true)
    expect(isCityBuildingTarget({ id: 'x', type: 'tank', owner: 'player' })).toBe(false)
    expect(findCityBuildingById(map, building.id)).toBe(building)
    expect(findCityBuildingById(map, 'city-999,999')).toBeNull()
    expect(findCityBuildingById(map, 'unit-1')).toBeNull()
    expect(createReplayEntityReference(building)).toEqual({ kind: 'city', id: building.id, x: building.x, y: building.y })
    const worldX = building.x * 32 + 16
    const worldY = building.y * 32 + 16
    expect(getAttackableCityAtWorld(map, worldX, worldY)).toBe(building)
    applyCityDamage(building, 9999, map, {})
    expect(getAttackableCityAtWorld(map, worldX, worldY)).toBeNull()
  })
})
