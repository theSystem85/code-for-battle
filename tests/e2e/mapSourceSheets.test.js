import { test, expect } from '@playwright/test'

test('[E00220] new native-alpha city and nature atlases load by default and generate biome-matching map sprites', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  const result = await page.evaluate(async() => {
    const { DEFAULT_SSE_SHEETS } = await import('/src/ui/spriteSheetRegistry.js')
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const { gameState } = await import('/src/gameState.js')
    const { getCityBuildings } = await import('/src/game/cityBuildings.js')
    const names = ['dtv3_city', 'dtv4_city_sand', 'dtv4_city_snow', 'dtv4_nature_sand', 'dtv4_nature_snow']
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
        zoomed: cities.every(cell => cell.group.zoomFactor === 2 && cell.group.width === 2 * cell.group.sourceWidth && cell.group.height === 2 * cell.group.sourceHeight),
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
      nativeDimensions: sheets.every(({ metadata }) => metadata.source.packing.scale === 1 && metadata.extension.imports.every(item => item.bbox.width === item.renderRect.width && item.bbox.height === item.renderRect.height)), biomes, alpha }
  })
  expect(result.registered).toBe(true)
  expect(result.nativeDimensions).toBe(true)
  expect(result.alpha).toEqual([0, 0, 0, 0, 0])
  for (const entry of result.biomes) {
    expect(entry.buildings).toBeGreaterThan(0)
    expect(entry.zoomed).toBe(true)
    expect(entry.allMatch).toBe(true)
    expect(entry.alpha).toBe(true)
    const suffix = entry.biome === 'sand' || entry.biome === 'snow' ? `dtv4_city_${entry.biome}` : 'dtv3_city'
    expect(entry.citySheets).toEqual([`images/map/sprite_sheets/${suffix}.webp`])
    if (entry.biome === 'sand' || entry.biome === 'snow') expect(entry.natureSheets).toEqual([`images/map/sprite_sheets/dtv4_nature_${entry.biome}.webp`])
  }
  await page.locator('#sseSheetSelect').selectOption('images/map/sprite_sheets/dtv3_city.webp')
  await page.waitForFunction(() => window.__SSE__.getState().targetSheetPath === 'images/map/sprite_sheets/dtv3_city.webp')
  const exported = await page.evaluate(async() => {
    const { json } = await window.__SSE__.exportSheet({ lossless: false, quality: 85 })
    return { layoutVersion: json.layoutVersion, zoomFactor: json.zoomFactor, blendMode: json.blendMode, imported: json.extension.imports.length }
  })
  expect(exported).toEqual({ layoutVersion: 4, zoomFactor: 2, blendMode: 'alpha', imported: 153 })
})

test('[E00221] fractional sheet zoom renders exact-size artwork inside rounded footprints without seams', async({ page }) => {
  await page.goto('/sse')
  const result = await page.evaluate(async() => {
    const { zoomDecorationGroup } = await import('/src/rendering/spriteSheetZoom.js')
    const { MapRenderer } = await import('/src/rendering/mapRenderer.js')
    const source = document.createElement('canvas')
    source.width = 192
    source.height = 128
    source.getContext('2d').fillStyle = '#ff0000'
    source.getContext('2d').fillRect(0, 0, 192, 128)
    const group = { width: 3, height: 2, tagSet: new Set(['decorative']), tilesByOffset: Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`${i % 3},${Math.floor(i / 3)}`, { image: source, rect: { x: i % 3 * 64, y: Math.floor(i / 3) * 64, width: 64, height: 64 } }])) }
    return [2, 1.25, 0.4].map(zoom => {
      const prepared = zoomDecorationGroup(group, zoom)
      const canvas = document.createElement('canvas')
      canvas.width = prepared.width * 32
      canvas.height = prepared.height * 32
      const ctx = canvas.getContext('2d')
      for (const [offset, tile] of Object.entries(prepared.tilesByOffset)) {
        const [x, y] = offset.split(',').map(Number)
        MapRenderer.prototype.drawIntegratedTileImage.call({}, ctx, tile, x * 32, y * 32)
      }
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const left = (prepared.width - 3 * zoom) * 16, top = (prepared.height - 2 * zoom) * 16
      let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1, holes = 0
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        const alpha = data[(y * canvas.width + x) * 4 + 3]
        if (alpha) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
        if (x > Math.ceil(left) && x < Math.floor(left + 3 * zoom * 32) - 1 && y > Math.ceil(top) && y < Math.floor(top + 2 * zoom * 32) - 1 && alpha < 250) holes++
      }
      return { zoom, width: prepared.width, height: prepared.height, minX, minY, maxX, maxY, holes, left, top }
    })
  })
  for (const entry of result) {
    expect([entry.width, entry.height]).toEqual([Math.ceil(3 * entry.zoom), Math.ceil(2 * entry.zoom)])
    expect(entry.holes).toBe(0)
    expect(Math.abs(entry.minX - entry.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(entry.minY - entry.top)).toBeLessThanOrEqual(1)
    expect(Math.abs(entry.maxX + 1 - entry.left - 3 * entry.zoom * 32)).toBeLessThanOrEqual(1)
    expect(Math.abs(entry.maxY + 1 - entry.top - 2 * entry.zoom * 32)).toBeLessThanOrEqual(1)
  }
})
