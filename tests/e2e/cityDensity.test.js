import { test, expect } from '@playwright/test'

test('[E00225] SSE isolates all six density sources at calibrated house and neighborhood scales', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  const results = await page.evaluate(async() => {
    const results = []
    for (const biome of ['temperate', 'sand', 'snow']) for (const level of ['low', 'medium']) {
      const ratio = level === 'low' ? 0.5 : 0.75
      const sse = window.__SSE__
      await sse.newSheet({ name: `${biome}-${level}`, cols: 16, rows: 1, tileSize: 64 })
      await sse.setSizeRatio(ratio)
      await sse.loadSourceImage(await (await fetch(`/images/map/sprite_sheets/sources/cities_${biome}_${level}.webp`)).blob())
      const sprites = await sse.extractAll({ alphaCutoff: 16, gap: 0, minArea: 1000 })
      const records = sse.getState().sprites
      const metadata = await (await fetch(`/images/map/sprite_sheets/dtv5_city_${biome}_${level}.json`)).json()
      results.push({ biome, level, count: sprites.length, ratio: metadata.source.packing.scale,
        calibrated: records.every(sprite => Math.abs(sprite.renderRect.width - sprite.bbox.width * ratio) <= 1 && Math.abs(sprite.renderRect.height - sprite.bbox.height * ratio) <= 1),
        smallest: metadata.propLayout.filter(p => p.density === 1).every(p => p.footprint.width === 2 && p.footprint.height === 1 && p.footprint.y >= 1),
        scores: metadata.propLayout.every(p => p.density >= (level === 'low' ? 1 : 4) && p.density <= (level === 'low' ? 3 : 7)),
        winter: biome !== 'snow' || Object.values(metadata.tiles).every(tile => tile.tags.includes('snow') && tile.tags.includes('winter')) })
    }
    return results
  })
  expect(results).toHaveLength(6)
  for (const result of results) expect(result).toMatchObject({ count: 20, calibrated: true, smallest: true, scores: true, winter: true })
})

test('[E00226] all biome catalogs form villages, towns and medium centers without retired skyline sheets at realistic building scales', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  const result = await page.evaluate(async() => {
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const { DEFAULT_SSE_SHEETS } = await import('/src/ui/spriteSheetRegistry.js')
    const { gameState } = await import('/src/gameState.js')
    const { getCityBuildingDensity } = await import('/src/rendering/cityDensity.js')
    const paths = DEFAULT_SSE_SHEETS.filter(path => /\/dtv5_city_\w+\.webp$/.test(path))
    const sheets = await Promise.all(paths.map(async sheetPath => ({ sheetPath, metadata: await (await fetch(`/${sheetPath.replace('.webp', '.json')}`)).json() })))
    const manager = new TextureManager()
    await manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets, biomeTag: 'mixed' })
    manager.prepareCityVisuals(3)
    Object.assign(gameState, { citySeeds: 8, cityClusterSize: 12, ruinSeeds: 0, mapSeed: 'density-cities' })
    const biomes = []
    for (const biome of ['grass', 'soil', 'sand', 'snow']) {
      const map = Array.from({ length: 160 }, () => Array.from({ length: 160 }, () => ({ type: 'land', biome })))
      const layout = manager.prepareDecorationLayout(map)
      const buildings = layout.placements.filter(p => p.cityIndex !== undefined)
      const cities = Array.from({ length: 8 }, (_, index) => buildings.filter(p => p.cityIndex === index))
      const groups = manager.integratedDecorationPools[biome].multi
      const houses = groups.filter(g => getCityBuildingDensity(g) === 1)
      const towns = groups.filter(g => getCityBuildingDensity(g) >= 4)
      const width = group => group.cityVisual?.width || group.width * 32
      const height = group => group.cityVisual?.height || group.height * 32
      const mean = a => a.reduce((sum, value) => sum + value, 0) / a.length
      biomes.push({ biome, populated: cities.every(city => city.length),
        maximums: cities.map(city => Math.max(...city.map(p => getCityBuildingDensity(p.group)))),
        stats: cities.map(city => ({ count: city.length, high: city.filter(p => p.cityDensity >= 4).map(p => p.cityRadius), low: city.filter(p => p.cityDensity <= 3).map(p => p.cityRadius) })),
        lowOutside: cities.filter((_, i) => i % 4 === 3).every(city => mean(city.filter(p => p.cityDensity >= 4).map(p => p.cityRadius)) < mean(city.filter(p => p.cityDensity <= 3).map(p => p.cityRadius))),
        houseBase: houses.every(g => g.width === 2 && g.height === 1),
        townBase: towns.every(g => g.width >= 2 && g.height >= 2),
        scale: Math.max(...houses.map(width)) < Math.min(...towns.map(width)) && Math.max(...houses.map(height)) < Math.min(...towns.map(height)),
        biomeTags: buildings.every(p => p.group.tagSet.has(biome)) })
    }
    return { paths: paths.length, bytes: manager.cityVisualBytes, biomes }
  })
  expect(result.paths).toBe(6)
  expect(result.bytes).toBeLessThanOrEqual(64 * 1024 * 1024)
  for (const biome of result.biomes) {
    expect(biome, JSON.stringify(result.biomes)).toMatchObject({ populated: true, lowOutside: true, houseBase: true, townBase: true, scale: true, biomeTags: true })
    expect(biome.maximums).toHaveLength(8)
    biome.maximums.forEach((maximum, index) => {
      expect(maximum).toBeLessThanOrEqual([3, 7, 7, 7][index % 4])
      if (index % 4 === 3) expect(maximum).toBeGreaterThanOrEqual(4)
    })
  }
})
