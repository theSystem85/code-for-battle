import { describe, it, expect } from 'vitest'
import { buildDecorationLayout, buildDecorationPools, buildRuinClusters } from '../../src/rendering/decorationLayout.js'
import { getCityBuildingDensity, getCityMaximumDensity, getCityDensityLimit } from '../../src/rendering/cityDensity.js'

function catalog() {
  // Identical footprints ensure architecture tags, rather than sprite size,
  // control which buildings can form a skyline.
  return Array.from({ length: 10 }, (_, index) => {
    const tags = ['grass', 'decorative', 'city', 'impassable', `density_${index + 1}`]
    return { width: 2, height: 2, groupLabel: `density-${index + 1}`, tagSet: new Set(tags),
      tilesByOffset: Object.fromEntries(['0,0', '1,0', '0,1', '1,1'].map(key => [key, { tags }])) }
  })
}

describe('architectural city density', () => {
  it('[U05450] allows a skyline only in every fourth settlement and places denser buildings toward its center', () => {
    for (const salt of [1, 2, 688]) {
      const map = Array.from({ length: 192 }, () => Array.from({ length: 192 }, () => ({ type: 'land', biome: 'grass' })))
      const settings = { salt, citySeeds: 8, cityClusterSize: 10, ruinSeeds: 0 }
      const pools = buildDecorationPools(catalog())
      const layout = buildDecorationLayout(map, pools, settings)
      const centers = buildRuinClusters(map, { salt: salt + 7919, count: 8, radius: 10, minDistance: 1 }).centers
      const cities = Array.from({ length: 8 }, (_, index) => layout.placements.filter(p => p.cityIndex === index))
      expect(cities.every(city => city.length > 0)).toBe(true)
      for (const [index, buildings] of cities.entries()) {
        const scores = buildings.map(p => getCityBuildingDensity(p.group))
        const maximum = [3, 7, 7, 10][index % 4]
        expect(Math.max(...scores)).toBeLessThanOrEqual(maximum)
        expect(scores.some(score => score <= 3)).toBe(true)
        if (maximum >= 7) expect(scores.some(score => score >= 4)).toBe(true)
        if (maximum === 10) {
          expect(scores.some(score => score >= 8)).toBe(true)
          const distance = p => Math.hypot(p.anchorX + 0.5 - centers[index].x, p.anchorY + 0.5 - centers[index].y)
          const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length
          expect(mean(buildings.filter(p => getCityBuildingDensity(p.group) >= 8).map(distance)))
            .toBeLessThan(mean(buildings.filter(p => getCityBuildingDensity(p.group) <= 3).map(distance)))
        }
      }
      expect(buildDecorationLayout(map, pools, settings)).toEqual(layout)
    }
  })

  it('[U05451] keeps untagged sheets usable and never falls back to forbidden higher-density artwork', () => {
    expect(getCityBuildingDensity({ width: 5, height: 4, tagSet: new Set(['city']) })).toBe(3)
    expect(getCityBuildingDensity({ width: 5, height: 4, tagSet: new Set(['city', 'density_1']) })).toBe(1)
    expect(getCityMaximumDensity(7)).toBe(10)
    expect(getCityDensityLimit(10, 1)).toBe(1)
    const map = Array.from({ length: 96 }, () => Array.from({ length: 96 }, () => ({ type: 'land', biome: 'grass' })))
    const onlyTowers = buildDecorationPools(catalog().filter(group => getCityBuildingDensity(group) >= 8))
    const layout = buildDecorationLayout(map, onlyTowers, { salt: 688, citySeeds: 3, ruinSeeds: 0 })
    expect(layout.placements.filter(p => p.group.tagSet.has('city'))).toEqual([])
  })
})
