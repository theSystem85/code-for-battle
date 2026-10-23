import { test, expect } from '@playwright/test'

test('[E00220] new native-alpha city and nature atlases load by default and generate biome-matching map sprites', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  const result = await page.evaluate(async() => {
    const { DEFAULT_SSE_SHEETS } = await import('/src/ui/spriteSheetRegistry.js')
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const { gameState } = await import('/src/gameState.js')
    const { getCityBuildings } = await import('/src/game/cityBuildings.js')
    const names = ['dtv3_city', 'dtv4_city_sand', 'dtv4_city_snow', 'dtv4_nature_sand', 'dtv4_nature_snow', ...['temperate', 'sand', 'snow'].flatMap(biome => ['low', 'medium'].map(level => `dtv5_city_${biome}_${level}`))]
    const sheets = await Promise.all(names.map(async name => {
      const sheetPath = `images/map/sprite_sheets/${name}.webp`
      const metadata = await (await fetch(`/${sheetPath.replace('.webp', '.json')}`)).json()
      return { sheetPath, metadata }
    }))
    const manager = new TextureManager()
    Object.assign(gameState, { mapSeed: 'new-biome-sheets', citySeeds: 2, cityClusterSize: 8 })
    await manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets, biomeTag: 'grass' })
    const biomes = []
    for (const biome of ['grass', 'soil', 'sand', 'snow']) {
      const grid = Array.from({ length: 96 }, () => Array.from({ length: 96 }, () => ({ type: 'land', biome })))
      const layout = manager.getDecorationLayout(grid)
      const cells = layout.cells.filter(Boolean)
      const cities = cells.filter(cell => cell.group.tagSet.has('city'))
      const nature = cells.filter(cell => cell.group.tagSet.has('trees') || cell.group.tagSet.has('water') || cell.group.tagSet.has('rocks'))
      biomes.push({ biome, buildings: getCityBuildings(grid).length,
        citySheets: [...new Set(cities.map(cell => cell.group.tilesByOffset['0,0'].sheetPath))],
        natureSheets: [...new Set(nature.map(cell => cell.group.tilesByOffset['0,0'].sheetPath))],
        allMatch: cells.every(cell => cell.group.tagSet.has(biome)),
        alpha: cells.every(cell => cell.group.tilesByOffset['0,0'].blendMode === 'alpha') })
    }
    const alpha = []
    for (const sheet of manager.integratedSpriteSheets) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      canvas.getContext('2d').drawImage(sheet.image, 0, 0)
      alpha.push(canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3])
    }
    return { registered: sheets.every(sheet => DEFAULT_SSE_SHEETS.includes(sheet.sheetPath)),
      nativeDimensions: sheets.every(({ metadata }) => metadata.extension.imports.every(item => Math.round(item.bbox.width * metadata.source.packing.scale) === item.renderRect.width && Math.round(item.bbox.height * metadata.source.packing.scale) === item.renderRect.height)), biomes, alpha }
  })
  expect(result.registered).toBe(true)
  expect(result.nativeDimensions).toBe(true)
  expect(result.alpha).toEqual(Array(11).fill(0))
  for (const entry of result.biomes) {
    expect(entry.buildings).toBeGreaterThan(0)
    expect(entry.allMatch).toBe(true)
    expect(entry.alpha).toBe(true)
    const suffix = entry.biome === 'sand' || entry.biome === 'snow' ? `dtv4_city_${entry.biome}` : 'dtv3_city'
    const cluster = ['grass', 'soil'].includes(entry.biome) ? 'temperate' : entry.biome
    const allowed = [suffix, `dtv5_city_${cluster}_low`, `dtv5_city_${cluster}_medium`].map(name => `images/map/sprite_sheets/${name}.webp`)
    expect(entry.citySheets.length).toBeGreaterThan(0)
    expect(entry.citySheets.every(path => allowed.includes(path))).toBe(true)
    expect(entry.citySheets).toContain(`images/map/sprite_sheets/dtv5_city_${cluster}_low.webp`)
    if (entry.biome === 'sand' || entry.biome === 'snow') expect(entry.natureSheets).toEqual([`images/map/sprite_sheets/dtv4_nature_${entry.biome}.webp`])
  }
  await page.locator('#sseSheetSelect').selectOption('images/map/sprite_sheets/dtv3_city.webp')
  await page.waitForFunction(() => window.__SSE__.getState().targetSheetPath === 'images/map/sprite_sheets/dtv3_city.webp')
  const exported = await page.evaluate(async() => {
    const { json } = await window.__SSE__.exportSheet({ lossless: false, quality: 85 })
    return { layoutVersion: json.layoutVersion, blendMode: json.blendMode, imported: json.extension.imports.length }
  })
  expect(exported).toEqual({ layoutVersion: 6, blendMode: 'alpha', imported: 20 })
})
