import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })

test('all eight organic shoreline corners have continuous rendered alpha', async({ page }) => {
  await page.goto('/?seed=4')
  const result = await page.evaluate(async() => {
    const { MapRenderer } = await import('/src/rendering/mapRenderer.js')
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const manager = new TextureManager()
    const renderer = new MapRenderer(manager)
    await Promise.all(Object.values(renderer.organicTerrain.biomeImages).flat().map(image => image.decode()))
    renderer.useOrganicTerrain = () => true
    const gallery = document.createElement('canvas')
    gallery.width = 4 * 224
    gallery.height = 2 * 224
    gallery.id = 'shoreline-gallery'
    const display = gallery.getContext('2d')
    display.fillStyle = '#315c67'
    display.fillRect(0, 0, gallery.width, gallery.height)
    let seams = 0, faded = 0, holes = 0
    for (const inward of [false, true]) for (let rotation = 0; rotation < 4; rotation++) {
      let grid = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => ({
        type: ((x < 3 && y < 3) !== inward) ? 'land' : 'water', biome: 'sand'
      })))
      for (let r = 0; r < rotation; r++) grid = grid[0].map((_, x) => grid.map(row => row[x]).reverse())
      renderer.computeSOTMask(grid)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 224
      const ctx = canvas.getContext('2d')
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        if (grid[y][x].type === 'land') renderer.organicTerrain.drawBiome(ctx, x, y, x * 32, y * 32, 32, 'sand')
        renderer.drawOrganicLandTransition(ctx, grid, x, y, x * 32, y * 32)
        const sot = renderer.sotMask[y][x]
        if (sot?.type === 'water') renderer.drawSOT(ctx, x, y, sot.orientation, { x: 0, y: 0 }, true, new Set(), 'water')
      }
      const rgba = ctx.getImageData(0, 0, 224, 224).data
      const alpha = (x, y) => rgba[(y * 224 + x) * 4 + 3]
      for (let y = 0; y < 224; y++) for (let x = 0; x < 224; x++) {
        const a = alpha(x, y)
        if (a > 0 && a < 255) faded++
        if (grid[Math.floor(y / 32)][Math.floor(x / 32)].type === 'land' && a !== 255) holes++
        if (x > 0 && x % 32 === 0 && a !== alpha(x - 1, y)) seams++
        if (y > 0 && y % 32 === 0 && a !== alpha(x, y - 1)) seams++
      }
      display.drawImage(canvas, rotation * 224, Number(inward) * 224)
    }
    document.body.replaceChildren(gallery)
    document.body.style.margin = '0'
    return { seams, faded, holes }
  })
  expect(result.seams).toBe(0)
  expect(result.holes).toBe(0)
  expect(result.faded).toBeGreaterThan(0)
  await page.locator('#shoreline-gallery').screenshot({ path: '/tmp/shoreline-corner-gallery.png' })
})

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

test('shoreline water is composited before the terrain transition pass', async({ page }) => {
  await page.goto('/?seed=4')
  const result = await page.evaluate(async() => {
    const { MapRenderer } = await import('/src/rendering/mapRenderer.js')
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const renderer = new MapRenderer(new TextureManager())
    const events = []
    renderer.useOrganicTerrain = () => true
    renderer.renderDynamicWaterLayer = () => events.push('water')
    renderer.renderTiles = () => events.push('terrain')
    renderer.applyVisibilityOverlay = () => {}
    renderer.renderGrid = () => {}
    renderer.renderOccupancyMap = () => {}

    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const grid = [
      [{ type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }]
    ]
    renderer.render({}, grid, { x: 0, y: 0 }, canvas, {}, null, { separateWaterLayer: true })

    const sotRenderer = new MapRenderer(new TextureManager())
    sotRenderer.sotMask = [[null, null], [null, { type: 'land', orientation: 'top-left' }]]
    let landSot = null
    sotRenderer.organicTerrain.drawBiomeShore = (_ctx, _x, _y, _sx, _sy, _size, mask, biome) => { landSot = { mask, biome } }
    sotRenderer.drawOrganicLandTransition({}, [
      [{ type: 'land', biome: 'sand' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }]
    ], 1, 1, 32, 32)

    sotRenderer.sotMask[1][1] = { type: 'street', orientation: 'bottom-right' }
    let streetSot = null
    sotRenderer.organicTerrain.drawTriangle = (_ctx, _x, _y, _sx, _sy, _size, orientation, type) => { streetSot = { orientation, type } }
    sotRenderer.drawOrganicLandTransition({}, [
      [{ type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }]
    ], 1, 1, 32, 32)
    return { events, landSot, streetSot }
  })

  expect(result.events).toEqual(['water', 'terrain'])
  expect(result.landSot).toEqual({ mask: 1, biome: 'sand' })
  expect(result.streetSot).toEqual({ orientation: 'bottom-right', type: 'street' })
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
  const shoreCache = await page.evaluate(async() => {
    // Reuse Vite's exact runtime module URL (including any HMR timestamp).
    const renderingUrl = performance.getEntriesByType('resource').find(entry => /\/src\/rendering\.js(?:\?|$)/.test(entry.name))?.name || '/src/rendering.js'
    const { getMapRenderer } = await import(renderingUrl)
    const terrain = getMapRenderer().organicTerrain
    return {
      masks: [...terrain.biomeBlendMasks.keys()].filter(key => key.startsWith('shore|')).length,
      composites: terrain.biomeTransitionTileCache.size
    }
  })
  expect(shoreCache.masks).toBeGreaterThan(0)
  expect(shoreCache.masks).toBeLessThanOrEqual(15)
  expect(shoreCache.composites).toBeLessThanOrEqual(512)
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

test('outward and inward SOT corners share stitched bounds in all four orientations', async({ page }) => {
  await page.goto('/?seed=4')
  const report = await page.evaluate(async() => {
    const { getSotDrawBounds } = await import('/src/rendering/organicTerrain.js')
    const { MapRenderer } = await import('/src/rendering/mapRenderer.js')
    const renderer = new MapRenderer({ integratedSpriteSheetMode: false })
    await renderer.organicTerrain.details.decode()

    const orientations = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
    const triangleCalls = []
    const triangleContext = { drawImage: (...args) => triangleCalls.push(args) }
    for (const orientation of orientations) {
      renderer.organicTerrain.drawTriangle(triangleContext, 2, 2, 64, 64, 32, orientation, 'land')
    }

    const inwardCalls = []
    renderer.drawProceduralWater = (_ctx, x, y, size) => inwardCalls.push([x, y, size])
    const waterContext = {
      save: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      clip: () => {},
      restore: () => {}
    }
    for (const orientation of orientations) {
      renderer.drawSOT(waterContext, 2, 2, orientation, { x: 0, y: 0 }, false, new Set(), 'water', null)
    }

    return {
      bounds: orientations.map(orientation => getSotDrawBounds(64, 64, 32, orientation)),
      triangleDestinations: triangleCalls.map(call => call.slice(-4)),
      inwardDestinations: inwardCalls
    }
  })

  expect(report.bounds).toEqual([
    { x: 64, y: 64, size: 33 },
    { x: 63, y: 64, size: 33 },
    { x: 63, y: 63, size: 33 },
    { x: 64, y: 63, size: 33 }
  ])
  expect(report.triangleDestinations).toEqual([
    [64, 64, 33, 33],
    [63, 64, 33, 33],
    [63, 63, 33, 33],
    [64, 63, 33, 33]
  ])
  expect(report.inwardDestinations).toEqual([
    [64, 64, 33],
    [63, 64, 33],
    [63, 63, 33],
    [64, 63, 33]
  ])
})

test('rock shorelines use sand transitions while every snow plateau surface tile stays snow', async({ page }) => {
  await page.route('**/__rock-shore-plateau', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }))
  await page.goto('/__rock-shore-plateau')
  const report = await page.evaluate(async() => {
    const { assignMapBiomes } = await import('/src/game/mapBiomes.js')
    const { MapRenderer } = await import('/src/rendering/mapRenderer.js')
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const grid = Array.from({ length: 20 }, (_, y) => Array.from({ length: 20 }, () => ({ type: y === 0 ? 'water' : 'land' })))
    for (let y = 1; y <= 5; y++) for (let x = 5; x <= 9; x++) grid[y][x].type = 'rock'
    assignMapBiomes(grid, 10, {
      activeSpriteSheetBiomeTag: 'mixed',
      mapBiomeRegionCount: 1,
      mapBiomeWeights: { grass: 100, soil: 0, sand: 20, snow: 0 },
      mapShorelineWidth: 4,
      mapSnowOnPlateaus: true
    })
    const plateauTiles = grid.flat().filter(tile => tile.type === 'rock')
    const manager = new TextureManager()
    const renderer = new MapRenderer(manager)
    renderer.sotMask = Array.from({ length: 20 }, () => Array(20).fill(null))
    renderer.organicTerrain.drawBiomeShore = (...args) => { window.__rockShoreTransition = { biome: args.at(-1) } }
    renderer.drawOrganicLandTransition({}, grid, 5, 0, 160, 0)
    return {
      plateauSurfaceBiomeSet: [...new Set(plateauTiles.map(tile => tile.biome))],
      shoreSourceSet: [...new Set(plateauTiles.map(tile => tile.shorelineBiome).filter(Boolean))],
      transitionBiome: window.__rockShoreTransition?.biome || null
    }
  })
  expect(report.plateauSurfaceBiomeSet).toEqual(['snow'])
  expect(report.shoreSourceSet).toEqual(['sand'])
  expect(report.transitionBiome).toBe('sand')
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
