import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DECORATION_DEFAULT_SCALE, DECORATION_FULL_REFERENCE, DECORATION_PART_KEYS, DECORATION_SETTINGS,
  LAKE_DEFAULT_SCALE, distributeDecorativeTiles, normalizeDecorationSettings, syncDecorationSettings
} from '../../src/game/decorationSettings.js'
import { computeMapTopologyFingerprint } from '../../src/game/mapTopology.js'
import {
  buildDecorationLayout, buildDecorationPools, isLakeSprite, isOtherVegetationSprite, isSingleTreeSprite, isWoodSprite
} from '../../src/rendering/decorationLayout.js'
import { bindDecorationCountInputs } from '../../src/ui/decorationCountSync.js'

const sheet = { sheetPath: 'a.webp', metadata: { tiles: { '0,0': { tags: ['decorative', 'grass'] } } } }
const soilDecorSheet = JSON.parse(readFileSync('public/images/map/sprite_sheets/dtv6_decor_soil.json', 'utf8'))

function grid(size, paint) {
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => paint ? paint(x, y) : ({ type: 'land', biome: 'grass' })))
}

function sprite(id, tags, width = 1, height = width) {
  const tilesByOffset = {}
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    tilesByOffset[`${x},${y}`] = { sheetPath: 'nature.webp', rect: { x: 0, y: 0, width: 64, height: 64 }, tags }
  }
  return { groupLabel: id, width, height, tilesByOffset, tagSet: new Set(['grass', 'decorative', ...tags]) }
}

const anchors = layout => layout.cells.filter(cell => cell && cell.offsetX === 0 && cell.offsetY === 0)

describe('decoration count settings', () => {
  it('[U05498] defaults to about 3% of the legacy decoration mix and 30% of the legacy lakes', () => {
    const defaults = normalizeDecorationSettings()
    const full = DECORATION_PART_KEYS.reduce((sum, key) => sum + DECORATION_FULL_REFERENCE[key], 0)
    expect(defaults.decorativeTileCount / full).toBeCloseTo(DECORATION_DEFAULT_SCALE, 2)
    expect(defaults.lakeCount / DECORATION_FULL_REFERENCE.lakeCount).toBeCloseTo(LAKE_DEFAULT_SCALE, 2)
    for (const key of DECORATION_PART_KEYS) {
      expect(defaults[key]).toBe(Math.round(DECORATION_FULL_REFERENCE[key] * DECORATION_DEFAULT_SCALE))
    }
    expect(defaults.decorativeTileCount).toBe(DECORATION_PART_KEYS.reduce((sum, key) => sum + defaults[key], 0))
    expect(defaults.cityDensityFactor).toBe(100)
    expect(defaults.woodClusterRadius).toBe(11)
  })

  it('[U05499] scales parts from the overall count and rebuilds the overall from a part', () => {
    const defaults = normalizeDecorationSettings()
    const doubled = distributeDecorativeTiles(defaults.decorativeTileCount * 2, defaults)
    expect(doubled.decorativeTileCount).toBe(defaults.decorativeTileCount * 2)
    expect(doubled.singleTreeCount).toBeGreaterThan(defaults.singleTreeCount)
    expect(doubled.groundDetailCount).toBeGreaterThan(doubled.woodsCount)
    const edited = syncDecorationSettings(defaults, 'stoneCount', defaults.stoneCount + 5)
    expect(edited.stoneCount).toBe(defaults.stoneCount + 5)
    expect(edited.decorativeTileCount).toBe(defaults.decorativeTileCount + 5)
    expect(edited.singleTreeCount).toBe(defaults.singleTreeCount)
    const cleared = distributeDecorativeTiles(10, Object.fromEntries(DECORATION_PART_KEYS.map(key => [key, 0])))
    expect(cleared.decorativeTileCount).toBe(10)
    expect(cleared.groundDetailCount).toBeGreaterThan(0)
  })

  it('[U05500] keeps the sidebar inputs and the fingerprint aligned with the counts', () => {
    const html = readFileSync('index.html', 'utf8')
    for (const [key, rule] of Object.entries(DECORATION_SETTINGS)) {
      expect(html).toContain(`id="${key}"`)
      expect(html).toMatch(new RegExp(`id="${key}"[^>]*\\bvalue="${rule.default}"`))
    }
    const original = computeMapTopologyFingerprint({ enabled: true, sheets: [sheet] })
    expect(computeMapTopologyFingerprint({ enabled: true, sheets: [sheet], decorativeTileCount: 999 })).toBe(original)
    expect(computeMapTopologyFingerprint({ enabled: true, sheets: [sheet], singleTreeCount: 80 })).not.toBe(original)
    expect(computeMapTopologyFingerprint({ enabled: true, sheets: [sheet], lakeCount: 3 })).not.toBe(original)
  })

  it('[U05501] updates the overall and the parts in the sidebar without waiting for Apply', () => {
    document.body.innerHTML = Object.keys(DECORATION_SETTINGS).map(key => `<input id="${key}" value="${DECORATION_SETTINGS[key].default}">`).join('')
    bindDecorationCountInputs(document)
    const overall = document.getElementById('decorativeTileCount')
    const stones = document.getElementById('stoneCount')
    overall.focus()
    overall.value = String(Number(overall.value) * 2)
    overall.dispatchEvent(new Event('input'))
    const sum = DECORATION_PART_KEYS.reduce((total, key) => total + Number(document.getElementById(key).value), 0)
    expect(sum).toBe(Number(overall.value))
    stones.value = String(Number(stones.value) + 4)
    stones.dispatchEvent(new Event('input'))
    const nextSum = DECORATION_PART_KEYS.reduce((total, key) => total + Number(document.getElementById(key).value), 0)
    expect(Number(document.getElementById('decorativeTileCount').value)).toBe(nextSum)
  })

  it('[U05502] places the requested counts and pulls trees and shrubs toward water', () => {
    const trees = sprite('oak', ['trees', 'impassable'], 2, 2)
    const wood = sprite('copse', ['trees', 'impassable'], 3, 3)
    const shrub = sprite('fern', ['shrubs', 'passable'])
    const lake = sprite('pond', ['water', 'lake', 'impassable'], 2, 2)
    const detail = sprite('tuft', ['ground_detail', 'passable'])
    expect(isSingleTreeSprite(trees)).toBe(true)
    expect(isWoodSprite(wood)).toBe(true)
    expect(isOtherVegetationSprite(shrub)).toBe(true)
    expect(isLakeSprite(lake)).toBe(true)
    const pools = buildDecorationPools([trees, wood, shrub, lake, detail])
    const open = grid(72)
    const budget = {
      salt: 4, citySeeds: 0, ruinSeeds: 0, stoneCount: 0, woodClusterCount: 3, woodClusterRadius: 8,
      singleTreeCount: 6, woodsCount: 2, otherVegetationCount: 5, lakeCount: 3, groundDetailCount: 8
    }
    const layout = buildDecorationLayout(open, pools, budget)
    const count = (predicate, cells = anchors(layout)) => cells.filter(cell => predicate(cell.group)).length
    expect(count(isSingleTreeSprite)).toBe(6)
    expect(count(isWoodSprite)).toBe(2)
    expect(count(isOtherVegetationSprite)).toBe(5)
    expect(count(isLakeSprite)).toBe(3)
    expect(layout.groundDetails.filter(Boolean).length).toBe(8)
    expect(buildDecorationLayout(open, pools, budget).cells).toEqual(layout.cells)

    const wet = grid(80, (x, y) => ({ type: x < 4 || (x > 36 && x < 42 && y > 36 && y < 44) ? 'water' : 'land', biome: 'grass' }))
    const placed = anchors(buildDecorationLayout(wet, pools, { ...budget, salt: 9, singleTreeCount: 16, woodsCount: 3, otherVegetationCount: 12, lakeCount: 0 }))
    const shoreDistance = cell => {
      let best = 99
      for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
        if (wet[y][x].type !== 'water') continue
        best = Math.min(best, Math.max(Math.abs(cell.anchorX - x), Math.abs(cell.anchorY - y)))
      }
      return best
    }
    const treesAndShrubs = placed.filter(cell => isSingleTreeSprite(cell.group) || isWoodSprite(cell.group) || isOtherVegetationSprite(cell.group))
    const mean = treesAndShrubs.reduce((sum, cell) => sum + shoreDistance(cell), 0) / treesAndShrubs.length
    expect(mean).toBeLessThan(18)
  })

  it('[U06571] routes the soil muddy pond through the lake budget', () => {
    const pondTags = soilDecorSheet.propLayout.find(prop => prop.id === 'soil_muddy_pond').tags
    const pond = sprite('soil_muddy_pond', pondTags, 3, 2)
    const pools = buildDecorationPools([pond])
    const settings = {
      salt: 17, citySeeds: 0, ruinSeeds: 0, stoneCount: 0, woodClusterCount: 0,
      singleTreeCount: 0, woodsCount: 0, otherVegetationCount: 0, groundDetailCount: 0
    }

    expect([...pond.tagSet]).toEqual(expect.arrayContaining(['water', 'lake', 'impassable']))
    expect(isLakeSprite(pond)).toBe(true)
    expect(anchors(buildDecorationLayout(grid(24, () => ({ type: 'land', biome: 'soil' })), pools, { ...settings, lakeCount: 0, placementRules: true }))).toHaveLength(0)
    expect(anchors(buildDecorationLayout(grid(24, () => ({ type: 'land', biome: 'soil' })), pools, { ...settings, lakeCount: 1, placementRules: true }))).toHaveLength(1)
  })
})
