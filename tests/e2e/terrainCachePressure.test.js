import { test, expect } from '@playwright/test'

test('[E00244] keeps terrain visible across fast camera reversals with a saturated cache', async({ page }) => {
  // Use real browser 2D canvases without booting unrelated game/GPU systems.
  await page.route('**/terrain-pressure-fixture', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><canvas id="terrain" width="1024" height="1024"></canvas>'
  }))
  await page.goto('/terrain-pressure-fixture')
  const result = await page.evaluate(async() => {
    const { MapRenderer } = await import('/src/rendering/mapRenderer.js')
    const { createTerrainByteBudget } = await import('/src/rendering/prepared/terrainCacheState.js')
    const { TILE_SIZE } = await import('/src/config.js')
    const renderer = new MapRenderer({
      integratedSpriteSheetMode: false, integratedRenderSignature: 'pressure',
      allTexturesLoaded: false, tileTextureCache: { land: [] }, waterFrames: [],
      getCurrentWaterFrame: () => null, getTileVariation: () => 0,
      getIntegratedTileForMapTile: () => null, getDecalTileCandidatesByTags: () => []
    })
    const size = 64
    const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => ({ type: 'land' })))
    const chunkPixels = renderer.chunkSize * TILE_SIZE + renderer.chunkPadding * 2 + 1
    const bytes = chunkPixels ** 2 * 4
    renderer.terrainByteBudget = createTerrainByteBudget({ residentBytes: bytes * 4, stagingBytes: bytes })
    const canvas = document.querySelector('canvas')
    canvas.width = canvas.height = TILE_SIZE * 32
    const ctx = canvas.getContext('2d')
    renderer.renderTiles(ctx, grid, { x: 0, y: 0 }, 0, 0, 16, 16, {})
    const chunk = renderer.chunkCache.get('0,0')
    renderer.decorativeWarmQueue.set(chunk.key, {
      chunk, mapGrid: grid, useTexture: false, key: renderer.getDecorativeKey(chunk)
    })
    const remaining = [10, 0]
    renderer.processDecorativeWarmQueue({ timeRemaining: () => remaining.shift() || 0 })
    const stagedBeforeScroll = renderer.terrainByteBudget.usage.terrainStaging
    const frames = []
    for (const start of [0, 16, 32, 16, 0]) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      renderer.renderTiles(ctx, grid, { x: start * TILE_SIZE, y: 0 }, start, 0, start + 32, 32, {})
      const samples = []
      for (const y of [8, 24]) for (const x of [8, 24]) {
        samples.push(Array.from(ctx.getImageData(x * TILE_SIZE, y * TILE_SIZE, 1, 1).data))
      }
      frames.push({ samples, resident: renderer.terrainByteBudget.usage.terrainResident })
      // Let warming run between jumps as it would during play.
      await new Promise(resolve => requestAnimationFrame(resolve))
    }
    renderer.invalidateAllChunks()
    return { frames, residentLimit: bytes * 4, stagedBeforeScroll }
  })
  expect(result.stagedBeforeScroll).toBeGreaterThan(0)
  expect(result.frames).toHaveLength(5)
  for (const frame of result.frames) {
    expect(frame.samples).toHaveLength(4)
    for (const [red, green, blue, alpha] of frame.samples) {
      expect(alpha).toBe(255)
      expect(red + green + blue).toBeGreaterThan(0)
    }
    expect(frame.resident).toBeLessThanOrEqual(result.residentLimit)
  }
  await expect(page.locator('#terrain')).toBeVisible()
})
