import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })

test('organic terrain is identical across chunk seams and map edits', async({ page }) => {
  await page.goto('/?seed=4')
  const result = await page.evaluate(async() => {
    const { MapRenderer } = await import('/src/rendering/mapRenderer.js')
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const manager = new TextureManager()
    await new Promise(resolve => manager.preloadAllTextures(resolve))
    const renderer = new MapRenderer(manager)
    await Promise.all([renderer.organicTerrain.image.decode(), renderer.organicTerrain.details.decode(), renderer.organicTerrain.cliffs.decode()])
    const grid = Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, (_, x) => ({
      type: x > 22 + Math.floor(Math.sin(y / 3) * 2) ? 'water' : Math.abs(x - y) < 2 ? 'street' : x > 7 && x < 23 && y > 4 && y < 28 ? 'rock' : 'land'
    })))
    const before = JSON.stringify(grid)
    const options = { skipWaterBase: true, skipWaterSot: true }
    const direct = document.createElement('canvas')
    const cached = document.createElement('canvas')
    direct.width = cached.width = direct.height = cached.height = 1024
    const dc = direct.getContext('2d'), cc = cached.getContext('2d')
    dc.imageSmoothingEnabled = cc.imageSmoothingEnabled = false
    const compare = () => {
      dc.clearRect(0, 0, 1024, 1024)
      cc.clearRect(0, 0, 1024, 1024)
      renderer.drawBaseLayer(dc, grid, 0, 0, 32, 32, 0, 0, true, null, options)
      for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
        const chunk = renderer.getOrCreateChunk(cx, cy, cx * 16, cy * 16, cx * 16 + 16, cy * 16 + 16)
        renderer.updateChunkCache(chunk, grid, true, null, options)
        cc.drawImage(chunk.canvas, chunk.padding, chunk.padding, 512, 512, cx * 512, cy * 512, 512, 512)
      }
      const a = dc.getImageData(0, 0, 1024, 1024).data, b = cc.getImageData(0, 0, 1024, 1024).data
      let differences = 0, minX = 1024, minY = 1024, maxX = -1, maxY = -1
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) {
        differences++
        const pixel = Math.floor(i / 4), x = pixel % 1024, y = Math.floor(pixel / 1024)
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      }
      return { differences, bounds: differences ? { minX, minY, maxX, maxY } : null }
    }
    const initial = compare()
    const unchanged = JSON.stringify(grid) === before
    grid[15][19].type = 'land'
    renderer.markTileDirty(19, 15)
    const edited = compare()
    return { initial, edited, unchanged }
  })
  expect(result).toEqual({ initial: { differences: 0, bounds: null }, edited: { differences: 0, bounds: null }, unchanged: true })
})

test('terrain combat performance at DPR 2', async({ page }, testInfo) => {
  test.skip(process.env.TERRAIN_BENCHMARK !== '1', 'Opt in with TERRAIN_BENCHMARK=1')
  if (process.env.TERRAIN_MIXED_BIOME === '1') {
    await page.goto('/?seed=4')
    await page.evaluate(async() => {
      const { setStoredItem, flushGameStorageWrites } = await import('/src/storage/indexedDbStorage.js')
      setStoredItem('rts-integrated-spritesheet-biome', 'mixed')
      setStoredItem('rts-map-biome-region-count', '32')
      setStoredItem('rts-map-biome-distribution', 'random')
      setStoredItem('rts-map-biome-weights', JSON.stringify({ grass: 25, soil: 25, sand: 25, snow: 25 }))
      setStoredItem('rts-map-snow-on-plateaus', 'true')
      await flushGameStorageWrites()
    })
  }
  await page.goto('/?seed=4&size=100&monitor=1&e2eIosBenchmark=1&benchmarkDurationMs=15000&benchmarkScroll=1&benchmarkScrollPixelsPerFrame=8')
  await page.waitForFunction(() => window.gameInstance)
  await page.locator('#performanceMonitorButton').dispatchEvent('click')
  await page.waitForFunction(() => window.__iosBenchmarkResult, null, { timeout: 90000 })
  await page.locator('#performanceMonitorButton').dispatchEvent('click')
  const report = await page.evaluate(() => window.getPerformanceMonitorReport())
  console.log('TERRAIN_BENCHMARK', JSON.stringify(report))
  await testInfo.attach('terrain-performance', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
  expect(report.averageFps).toBeGreaterThanOrEqual(Number(process.env.TERRAIN_MIN_FPS || 30))
  if (process.env.TERRAIN_BASELINE_FPS) expect(report.averageFps).toBeGreaterThanOrEqual(Number(process.env.TERRAIN_BASELINE_FPS) * 0.8)
  expect(report.renderer.mapChunks.directTilePasses).toBe(0)
})

test('mixed-biome cached terrain stays within the static chunk-bake budget', async({ page }, testInfo) => {
  test.skip(process.env.TERRAIN_BENCHMARK !== '1', 'Opt in with TERRAIN_BENCHMARK=1')
  await page.goto('/?seed=4')
  const report = await page.evaluate(async() => {
    const { MapRenderer } = await import('/src/rendering/mapRenderer.js')
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const { assignMapBiomes } = await import('/src/game/mapBiomes.js')
    const manager = new TextureManager()
    await new Promise(resolve => manager.preloadAllTextures(resolve))
    const renderer = new MapRenderer(manager)
    await Promise.all(Object.values(renderer.organicTerrain.biomeImages).flat().map(image => image.decode()))
    const buildGrid = () => Array.from({ length: 100 }, (_, y) => Array.from({ length: 100 }, (_, x) => ({
      type: x > 90 + Math.floor(Math.sin(y / 5) * 3) ? 'water' : x > 35 && x < 65 && y > 20 && y < 80 ? 'rock' : 'land'
    })))
    const measure = mode => {
      const grid = buildGrid()
      assignMapBiomes(grid, 4, {
        activeSpriteSheetBiomeTag: mode,
        mapBiomeRegionCount: 32,
        mapBiomeDistribution: 'random',
        mapBiomeWeights: { grass: 25, soil: 25, sand: 25, snow: 25 },
        mapSnowOnPlateaus: true
      })
      renderer.invalidateAllChunks()
      const started = performance.now()
      for (let cy = 0; cy < 7; cy++) for (let cx = 0; cx < 7; cx++) {
        const startX = cx * 16, startY = cy * 16
        const chunk = renderer.getOrCreateChunk(cx, cy, startX, startY, Math.min(100, startX + 16), Math.min(100, startY + 16))
        renderer.updateChunkCache(chunk, grid, true, null, { skipWaterBase: true, skipWaterSot: true })
      }
      const coldBakeMs = performance.now() - started
      const cachedStarted = performance.now()
      for (const chunk of renderer.chunkCache.values()) renderer.updateChunkCache(chunk, grid, true, null, { skipWaterBase: true, skipWaterSot: true })
      return { coldBakeMs, cachedPassMs: performance.now() - cachedStarted }
    }
    const baseline = measure('grass')
    const mixed = measure('mixed')
    return {
      baseline,
      mixed,
      coldRatio: mixed.coldBakeMs / baseline.coldBakeMs,
      cachedRatio: mixed.cachedPassMs / baseline.cachedPassMs,
      heapBytes: performance.memory?.usedJSHeapSize || null
    }
  })
  console.log('MIXED_BIOME_TERRAIN_BENCHMARK', JSON.stringify(report))
  await testInfo.attach('mixed-biome-terrain-performance', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
  expect(report.cachedRatio).toBeLessThan(1.2)
  expect(report.coldRatio).toBeLessThan(1.8)
})


test('SOT legs stay opaque and only the diagonal fades; cliffs have no ground mat', async({ page }) => {
  await page.goto('/?seed=4')
  const report = await page.evaluate(async() => {
    const image = new Image()
    image.src = '/images/terrain/terrain-details.png'
    await image.decode()
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height
    const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0)
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data
    const a = (x, y) => pixels[(y * c.width + x) * 4 + 3]
    let opaqueLegs = true, feathered = 0
    for (let material = 0; material < 2; material++) for (let corner = 0; corner < 4; corner++) {
      const sx = corner * 4 * 32, sy = material * 32
      for (let t = 0; t < 32; t++) {
        const x = corner === 1 || corner === 2 ? 31 : 0
        const y = corner >= 2 ? 31 : 0
        if (a(sx + x, sy + t) !== 255 || a(sx + t, sy + y) !== 255) opaqueLegs = false
      }
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (a(sx + x, sy + y) > 0 && a(sx + x, sy + y) < 255) feathered++
    }
    return { opaqueLegs, feathered, cliffCornerAlpha: a(0, 256) }
  })
  expect(report.opaqueLegs).toBe(true)
  expect(report.feathered).toBeGreaterThan(0)
  expect(report.cliffCornerAlpha).toBe(0)
})

test('CPU animated water does not erase the cached grass shore', async({ page }) => {
  await page.goto('/?seed=4')
  const pixel = await page.evaluate(async() => {
    const { MapRenderer } = await import('/src/rendering/mapRenderer.js')
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const manager = new TextureManager()
    await new Promise(resolve => manager.preloadAllTextures(resolve))
    const renderer = new MapRenderer(manager)
    await Promise.all([renderer.organicTerrain.image.decode(), renderer.organicTerrain.details.decode(), renderer.organicTerrain.cliffs.decode()])
    const grid = Array.from({ length: 16 }, () => Array.from({ length: 16 }, (_, x) => ({ type: x < 8 ? 'land' : 'water' })))
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
    const ctx = canvas.getContext('2d')
    renderer.render(ctx, grid, { x: 0, y: 0 }, canvas, {}, null, { separateWaterLayer: true })
    return [...ctx.getImageData(256, 256, 1, 1).data]
  })
  expect(pixel[3]).toBe(255)
  expect(pixel[1] - pixel[2]).toBeGreaterThan(10)
})
