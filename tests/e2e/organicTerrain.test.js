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
    await renderer.organicTerrain.image.decode()
    const grid = Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, (_, x) => ({
      type: Math.abs(x - y) < 2 ? 'street' : x > 13 && x < 18 && y > 8 && y < 24 ? 'rock' : 'land'
    })))
    const before = JSON.stringify(grid)
    const direct = document.createElement('canvas')
    const cached = document.createElement('canvas')
    direct.width = cached.width = direct.height = cached.height = 1024
    const dc = direct.getContext('2d'), cc = cached.getContext('2d')
    dc.imageSmoothingEnabled = cc.imageSmoothingEnabled = false
    const compare = () => {
      dc.clearRect(0, 0, 1024, 1024)
      renderer.drawBaseLayer(dc, grid, 0, 0, 32, 32, 0, 0, true, null)
      for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
        const chunk = renderer.getOrCreateChunk(cx, cy, cx * 16, cy * 16, cx * 16 + 16, cy * 16 + 16)
        renderer.updateChunkCache(chunk, grid, true, null)
        cc.drawImage(chunk.canvas, chunk.padding, chunk.padding, 512, 512, cx * 512, cy * 512, 512, 512)
      }
      const a = dc.getImageData(0, 0, 1024, 1024).data, b = cc.getImageData(0, 0, 1024, 1024).data
      let differences = 0
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differences++
      return differences
    }
    const initial = compare()
    const unchanged = JSON.stringify(grid) === before
    grid[15][16].type = 'land'
    renderer.markTileDirty(16, 15)
    const edited = compare()
    return { initial, edited, unchanged }
  })
  expect(result).toEqual({ initial: 0, edited: 0, unchanged: true })
})

test('terrain combat performance at DPR 2', async({ page }, testInfo) => {
  test.skip(process.env.TERRAIN_BENCHMARK !== '1', 'Opt in with TERRAIN_BENCHMARK=1')
  await page.goto('/?seed=4&size=100&monitor=1&e2eIosBenchmark=1&benchmarkDurationMs=15000&benchmarkScroll=1&benchmarkScrollPixelsPerFrame=8')
  await page.waitForFunction(() => window.gameInstance)
  await page.evaluate(async() => (await import('/src/performance/performanceMonitor.js')).performanceMonitor.start())
  await page.waitForFunction(() => window.__iosBenchmarkResult, null, { timeout: 90000 })
  const report = await page.evaluate(async() => (await import('/src/performance/performanceMonitor.js')).performanceMonitor.stop())
  await testInfo.attach('terrain-performance', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
  expect(report.averageFps).toBeGreaterThanOrEqual(Number(process.env.TERRAIN_MIN_FPS || 30))
  if (process.env.TERRAIN_BASELINE_FPS) expect(report.averageFps).toBeGreaterThanOrEqual(Number(process.env.TERRAIN_BASELINE_FPS) * 0.8)
  expect(report.renderer.mapChunks.directTilePasses).toBe(0)
})
