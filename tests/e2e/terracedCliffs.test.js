import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })

test('dense cliff scrolling performance at DPR 2', async({ page }, testInfo) => {
  test.skip(process.env.CLIFF_BENCHMARK !== '1', 'Opt in with CLIFF_BENCHMARK=1')
  await page.route('**/__cliff-benchmark', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' }))
  await page.goto('/__cliff-benchmark')
  const report = await page.evaluate(async() => {
    const { MapRenderer } = await import('/src/rendering/mapRenderer.js')
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const manager = new TextureManager()
    await new Promise(resolve => manager.preloadAllTextures(resolve))
    const renderer = new MapRenderer(manager)
    await Promise.all([renderer.organicTerrain.image.decode(), renderer.organicTerrain.details.decode()])
    if (renderer.organicTerrain.cliffs) await renderer.organicTerrain.cliffs.decode()
    const grid = Array.from({ length: 100 }, (_, y) => Array.from({ length: 100 }, (_, x) => ({
      type: Math.abs((x + Math.round(Math.sin(y / 9) * 6)) % 28 - 14) < 9 ? 'rock' : 'land'
    })))
    const canvas = document.createElement('canvas')
    canvas.width = 2880; canvas.height = 2000
    canvas.style.cssText = 'position:fixed;inset:0;width:1440px;height:1000px;z-index:99999'
    document.body.append(canvas)
    const ctx = canvas.getContext('2d'); ctx.scale(2, 2)
    const costs = [], frames = [], heaps = []
    let last = 0
    for (let frame = 0; frame < 240; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve))
      const now = performance.now()
      if (frame > 30) frames.push(now - last)
      last = now
      const x = frame * 4, y = frame * 2
      const begin = performance.now()
      renderer.renderTiles(ctx, grid, { x, y }, Math.floor(x / 32), Math.floor(y / 32), Math.ceil((x + 1440) / 32), Math.ceil((y + 1000) / 32), {}, { skipWaterBase: true, skipWaterSot: true })
      if (frame > 30) costs.push(performance.now() - begin)
      if (performance.memory && frame % 30 === 0) heaps.push(performance.memory.usedJSHeapSize / 1048576)
    }
    const mean = a => a.reduce((sum, v) => sum + v, 0) / a.length
    return { fps: 1000 / mean(frames), renderMs: mean(costs), maxRenderMs: Math.max(...costs), slowFrames: frames.filter(ms => ms > 34).length, heapsMiB: heaps, rockTiles: grid.flat().filter(t => t.type === 'rock').length }
  })
  console.log('CLIFF_BENCHMARK', JSON.stringify(report))
  await testInfo.attach('cliff-performance', { body: JSON.stringify(report), contentType: 'application/json' })
  await page.screenshot({ path: testInfo.outputPath('cliffs.png') })
  expect(report.fps).toBeGreaterThanOrEqual(55)
  if (process.env.CLIFF_BASELINE_FPS) expect(report.fps).toBeGreaterThanOrEqual(Number(process.env.CLIFF_BASELINE_FPS) * 0.8)
})

test('terraced cliff preview and alpha atlas', async({ page }, testInfo) => {
  await page.route('**/__cliff-preview', route => route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;background:#262921"></body></html>' }))
  await page.goto('/__cliff-preview')
  const result = await page.evaluate(async() => {
    const { MapRenderer } = await import('/src/rendering/mapRenderer.js')
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const manager = new TextureManager()
    await new Promise(resolve => manager.preloadAllTextures(resolve))
    const renderer = new MapRenderer(manager)
    await Promise.all([renderer.organicTerrain.image.decode(), renderer.organicTerrain.details.decode(), renderer.organicTerrain.cliffs.decode()])
    const grid = Array.from({ length: 32 }, (_, y) => Array.from({ length: 44 }, (_, x) => ({
      type: (Math.abs(x - 19 - Math.sin(y / 6) * 4) < (y > 10 && y < 24 ? 7 : 2.6) || (y > 5 && y < 11 && x > 2 && x < 37) || (Math.abs(x + y - 41) < 2.2 && y < 18)) ? 'rock' : 'land'
    })))
    const canvas = document.createElement('canvas'); canvas.width = 1408; canvas.height = 1024
    document.body.append(canvas)
    const ctx = canvas.getContext('2d')
    renderer.drawBaseLayer(ctx, grid, 0, 0, 44, 32, 0, 0, true, null, { skipWaterBase: true, skipWaterSot: true })
    const atlas = document.createElement('canvas'); atlas.width = 2720; atlas.height = 800
    const ac = atlas.getContext('2d'); ac.drawImage(renderer.organicTerrain.cliffs, 0, 0)
    const data = ac.getImageData(0, 0, atlas.width, atlas.height).data
    let clear = 0, translucent = 0, solid = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) clear++
      else if (data[i] === 255) solid++
      else translucent++
    }
    const distinct = []
    for (let mask = 1; mask <= 16; mask++) {
      if (mask === 15) continue
      const hashes = new Set()
      for (let variant = 0; variant < 5; variant++) {
        const pixels = ac.getImageData(mask * 160, variant * 160, 160, 160).data
        let hash = 2166136261
        for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619)
        hashes.add(hash)
      }
      distinct.push(hashes.size)
    }
    return { clear, translucent, solid, distinct }
  })
  expect(result.distinct).toEqual(Array(15).fill(5))
  expect(result.clear).toBeGreaterThan(result.solid)
  expect(result.translucent).toBeGreaterThan(10000)
  expect(result.solid).toBeGreaterThan(10000)
  await page.screenshot({ path: testInfo.outputPath('terraced-cliffs-preview.png') })
})

test('plateau pixels stay on rock tiles and the top carries detail', async({ page }) => {
  await page.route('**/__cliff-ownership', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }))
  await page.goto('/__cliff-ownership')
  const result = await page.evaluate(async() => {
    const { OrganicTerrain } = await import('/src/rendering/organicTerrain.js')
    const terrain = new OrganicTerrain(() => {})
    await Promise.all([terrain.image.decode(), terrain.details.decode(), terrain.cliffs.decode()])
    const grid = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => ({
      type: x >= 2 && x <= 4 && y >= 2 && y <= 4 ? 'rock' : 'land'
    })))
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 224
    const ctx = canvas.getContext('2d')
    terrain.drawCliffs(ctx, grid, 0, 0, 7, 7, 0, 0, 32)
    const pixels = ctx.getImageData(0, 0, 224, 224).data
    let landAlpha = 0, centerAlpha = 0
    for (let y = 0; y < 224; y++) for (let x = 0; x < 224; x++) {
      const alpha = pixels[(y * 224 + x) * 4 + 3]
      const tileX = Math.floor(x / 32), tileY = Math.floor(y / 32)
      if (grid[tileY][tileX].type !== 'rock') landAlpha += alpha
      if (tileX === 3 && tileY === 3) centerAlpha += alpha
    }
    return { landAlpha, centerAlpha }
  })
  expect(result.landAlpha).toBe(0)
  expect(result.centerAlpha).toBeGreaterThan(0)
})
