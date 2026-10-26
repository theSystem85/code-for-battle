import { test, expect } from '@playwright/test'

test('[E00220] new native-alpha city and nature atlases load by default and generate biome-matching map sprites', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  const result = await page.evaluate(async() => {
    const { DEFAULT_SSE_SHEETS } = await import('/src/ui/spriteSheetRegistry.js')
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const { gameState } = await import('/src/gameState.js')
    const { getCityBuildings } = await import('/src/game/cityBuildings.js')
    const names = ['dtv4_nature_sand', 'dtv4_nature_snow', ...['temperate', 'sand', 'snow'].flatMap(biome => ['low', 'medium'].map(level => `dtv5_city_${biome}_${level}`))]
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
      const layout = manager.prepareDecorationLayout(grid)
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
  expect(result.alpha).toEqual(Array(8).fill(0))
  for (const entry of result.biomes) {
    expect(entry.buildings).toBeGreaterThan(0)
    expect(entry.allMatch).toBe(true)
    expect(entry.alpha).toBe(true)
    const cluster = ['grass', 'soil'].includes(entry.biome) ? 'temperate' : entry.biome
    const allowed = [`dtv5_city_${cluster}_low`, `dtv5_city_${cluster}_medium`].map(name => `images/map/sprite_sheets/${name}.webp`)
    expect(entry.citySheets.length).toBeGreaterThan(0)
    expect(entry.citySheets.every(path => allowed.includes(path))).toBe(true)
    expect(entry.citySheets).toContain(`images/map/sprite_sheets/dtv5_city_${cluster}_low.webp`)
    if (entry.biome === 'sand' || entry.biome === 'snow') expect(entry.natureSheets).toEqual([`images/map/sprite_sheets/dtv4_nature_${entry.biome}.webp`])
  }
  await page.locator('#sseSheetSelect').selectOption('images/map/sprite_sheets/dtv5_city_temperate_medium.webp')
  await page.waitForFunction(() => window.__SSE__.getState().targetSheetPath === 'images/map/sprite_sheets/dtv5_city_temperate_medium.webp')
  const exported = await page.evaluate(async() => {
    const { json } = await window.__SSE__.exportSheet({ lossless: false, quality: 85 })
    return { layoutVersion: json.layoutVersion, blendMode: json.blendMode, imported: json.extension.imports.length }
  })
  expect(exported).toEqual({ layoutVersion: 6, blendMode: 'alpha', imported: 20 })
})

test('[E00227] replacement alpha decorations, expanded shore and separate nature sheets load in SSE at calibrated map scale with full tags', async({ page }) => {
  await page.addInitScript(() => {
    const names = ['dtv6_decor_grass', 'dtv6_decor_soil', 'dtv6_decor_sand', 'dtv6_decor_snow', 'dtv6_decor_universal', 'dtv6_shore', 'dtv6_nature_grass', 'dtv6_nature_soil']
    for (const name of names) {
      const sheetPath = `images/map/sprite_sheets/${name}.webp`
      localStorage.setItem(`rts-sse-metadata:${sheetPath}`, JSON.stringify({ sheetPath, schemaVersion: 1, layoutVersion: 1, tileSize: 64, rowHeight: 64, borderWidth: 0, columns: 16, rows: 35, blendMode: 'alpha', tiles: { '0,0': { col: 0, row: 0, tags: ['grass', 'decorative', 'passable'], rect: { x: 0, y: 0, width: 64, height: 64 } } }, extension: { imports: [] } }))
    }
  })
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  const names = ['dtv6_decor_grass', 'dtv6_decor_soil', 'dtv6_decor_sand', 'dtv6_decor_snow', 'dtv6_decor_universal', 'dtv6_shore', 'dtv6_nature_grass', 'dtv6_nature_soil']
  for (const [index, name] of names.entries()) {
    const path = `images/map/sprite_sheets/${name}.webp`
    await page.locator('#sseSheetSelect').selectOption(path)
    await page.waitForFunction(path => window.__SSE__.getState().targetSheetPath === path, path)
    const result = await page.evaluate(async() => {
      const { json } = await window.__SSE__.exportSheet({ lossless: false, quality: 85 })
      return { count: json.extension.imports.length, blend: json.blendMode,
        calibrated: json.layoutVersion === 2 && json.extension.imports.every(item => item.sizeRatio > 0 && item.sizeRatio < 1 && Math.round(item.bbox.width * item.sizeRatio) === item.renderRect.width && Math.round(item.bbox.height * item.sizeRatio) === item.renderRect.height && item.renderRect.width <= item.referenceSize.width && item.renderRect.height <= item.referenceSize.height),
        complete: json.extension.imports.every(prop => prop.tags.includes('decorative') && prop.tags.some(tag => /^group_/.test(tag)) && prop.tags.some(tag => ['grass', 'soil', 'sand', 'snow', 'universal'].includes(tag)) && Array.from({ length: prop.tileSpan.rows }, (_, dy) => Array.from({ length: prop.tileSpan.columns }, (_, dx) => json.tiles[`${prop.placedAt.column + dx},${prop.placedAt.row + dy}`]?.tags.includes('decorative'))).flat().every(Boolean)) }
    })
    expect(result).toEqual({ count: index < 5 ? 24 : index === 5 ? 36 : 40, blend: 'alpha', calibrated: true, complete: true })
  }
  const options = await page.locator('#sseSheetSelect option').evaluateAll(options => options.map(option => option.value))
  expect(options.some(value => /dtv2_|dtv3_(city|shore|winter)|dtv4_city_(sand|snow)/.test(value))).toBe(false)
})

test('[E00228] calibrated dtv6 props generate biome-matching forests, shore and farm layouts below factory size', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  const result = await page.evaluate(async() => {
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const { gameState } = await import('/src/gameState.js')
    const { buildingData } = await import('/src/data/buildingData.js')
    const names = ['dtv6_decor_grass', 'dtv6_decor_soil', 'dtv6_decor_sand', 'dtv6_decor_snow', 'dtv6_decor_universal', 'dtv6_shore', 'dtv6_nature_grass', 'dtv6_nature_soil']
    const sheets = await Promise.all(names.map(async name => {
      const sheetPath = `images/map/sprite_sheets/${name}.webp`
      return { sheetPath, metadata: await (await fetch(`/${sheetPath.replace('.webp', '.json')}`)).json() }
    }))
    Object.assign(gameState, { citySeeds: 0, ruinSeeds: 3, mapSeed: 'calibrated-dtv6' })
    const manager = new TextureManager()
    await manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets, biomeTag: 'mixed' })
    const biomes = []
    for (const biome of ['grass', 'soil', 'sand', 'snow']) {
      const grid = Array.from({ length: 96 }, (_, y) => Array.from({ length: 96 }, (_, x) => ({ type: x < 24 ? 'water' : y === 48 ? 'street' : 'land', biome })))
      const cells = manager.prepareDecorationLayout(grid).cells.filter(Boolean)
      biomes.push({ biome, placed: cells.filter(cell => cell.offsetX === 0 && cell.offsetY === 0).length,
        trees: cells.filter(cell => cell.group.tagSet.has('trees')).length,
        shore: cells.filter(cell => cell.group.tagSet.has('shore')).length,
        bounded: cells.every(cell => cell.group.width <= 3 && cell.group.height <= 3),
        matching: cells.every(cell => cell.group.tagSet.has(biome) || cell.group.tagSet.has('universal')) })
    }
    return { biomes, factoryWidth: buildingData.vehicleFactory.width * 32,
      allBodiesSmaller: sheets.every(({ metadata }) => metadata.extension.imports.every(item => item.renderRect.width / 2 < buildingData.vehicleFactory.width * 32 && item.renderRect.height / 2 < buildingData.vehicleFactory.height * 32)) }
  })
  expect(result.factoryWidth).toBe(96)
  expect(result.allBodiesSmaller).toBe(true)
  for (const biome of result.biomes) {
    expect(biome.placed).toBeGreaterThan(20)
    expect(biome.trees).toBeGreaterThan(0)
    expect(biome.shore).toBeGreaterThan(0)
    expect(biome.bounded).toBe(true)
    expect(biome.matching).toBe(true)
  }
})

test('[E00229] large grass and soil nature sheets load by default, preserve reference scales and place woods, lakes and stones', async({ page }) => {
  await page.goto('/sse')
  await page.waitForFunction(() => Boolean(window.__SSE__))
  for (const biome of ['grass', 'soil']) {
    const path = `images/map/sprite_sheets/dtv7_nature_${biome}_large.webp`
    await page.locator('#sseSheetSelect').selectOption(path)
    await page.waitForFunction(path => window.__SSE__.getState().targetSheetPath === path, path)
    const exported = await page.evaluate(async() => {
      const { json } = await window.__SSE__.exportSheet({ lossless: false, quality: 85 })
      return { count: json.extension.imports.length, layout: json.layoutVersion, alpha: json.blendMode,
        calibrated: json.extension.imports.every(item => Math.round(item.bbox.width * item.sizeRatio) === item.renderRect.width && Math.round(item.bbox.height * item.sizeRatio) === item.renderRect.height) }
    })
    expect(exported).toEqual({ count: 24, layout: 1, alpha: 'alpha', calibrated: true })
  }
  const result = await page.evaluate(async() => {
    const { DEFAULT_SSE_SHEETS } = await import('/src/ui/spriteSheetRegistry.js')
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const { gameState } = await import('/src/gameState.js')
    const sheets = await Promise.all(['grass', 'soil'].map(async biome => {
      const sheetPath = `images/map/sprite_sheets/dtv7_nature_${biome}_large.webp`
      return { sheetPath, metadata: await (await fetch(`/${sheetPath.replace('.webp', '.json')}`)).json() }
    }))
    const manager = new TextureManager()
    await manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets, biomeTag: 'mixed' })
    Object.assign(gameState, { mapSeed: 'larger-nature-art', citySeeds: 0, ruinSeeds: 0, stoneCount: 80 })
    const result = []
    for (const biome of ['grass', 'soil']) {
      const map = Array.from({ length: 120 }, () => Array.from({ length: 120 }, () => ({ type: 'land', biome })))
      const cells = manager.prepareDecorationLayout(map).cells.filter(cell => cell && cell.offsetX === 0 && cell.offsetY === 0)
      result.push({ biome, trees: cells.filter(cell => cell.group.tagSet.has('trees')).length,
        lakes: cells.filter(cell => cell.group.tagSet.has('water')).length,
        rocks: cells.filter(cell => cell.group.tagSet.has('rocks')).length,
        larger: cells.some(cell => cell.group.width >= 4 || cell.group.height >= 4),
        matching: cells.every(cell => cell.group.tagSet.has(biome)),
        blockedLakes: cells.filter(cell => cell.group.tagSet.has('water')).every(cell => cell.group.tagSet.has('impassable')) })
    }
    return { registered: sheets.every(sheet => DEFAULT_SSE_SHEETS.includes(sheet.sheetPath)), otherBiomesEmpty: manager.integratedDecorationPools.sand.multi.length === 0 && manager.integratedDecorationPools.snow.multi.length === 0, result }
  })
  expect(result.registered).toBe(true)
  expect(result.otherBiomesEmpty).toBe(true)
  for (const biome of result.result) {
    expect(biome.trees).toBeGreaterThan(0)
    expect(biome.lakes).toBeGreaterThan(0)
    expect(biome.rocks).toBeGreaterThan(0)
    expect(biome.larger).toBe(true)
    expect(biome.matching).toBe(true)
    expect(biome.blockedLakes).toBe(true)
  }
})
