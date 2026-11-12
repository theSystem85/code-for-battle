import { test, expect } from '@playwright/test'

test('[E00259] restores every section of a decoration across page boundaries after camera eviction', async({ page }) => {
  // Exercise the real prepared-ground and decoration cache with browser pixels,
  // without starting unrelated gameplay or depending on random prop placement.
  await page.route('**/decoration-restoration-fixture', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><canvas id="map" width="1024" height="1024"></canvas>'
  }))
  await page.goto('/decoration-restoration-fixture')
  const result = await page.evaluate(async() => {
    const { MapRenderer } = await import('/src/rendering/mapRenderer.js')
    const { createTerrainByteBudget } = await import('/src/rendering/prepared/terrainCacheState.js')
    const { TILE_SIZE } = await import('/src/config.js')
    const colors = ['#f02030', '#20e040', '#3050f0', '#e0d020']
    const sources = colors.map(color => {
      const image = document.createElement('canvas')
      image.width = image.height = TILE_SIZE
      const ctx = image.getContext('2d')
      ctx.fillStyle = color
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE)
      return image
    })
    const renderer = new MapRenderer({
      integratedSpriteSheetMode: true, integratedRenderSignature: 'restoration', allTexturesLoaded: true,
      tileTextureCache: { land: [] }, waterFrames: [], getCurrentWaterFrame: () => null,
      getTileVariation: () => 0, getDecalTileCandidatesByTags: () => [],
      getIntegratedTileForMapTile: (_type, x, y) => x >= 31 && x < 33 && y >= 15 && y < 17 ? {
        image: sources[(y - 15) * 2 + x - 31], rect: { x: 0, y: 0, width: TILE_SIZE, height: TILE_SIZE },
        tags: ['decorative'], sheetPath: 'restoration-prop'
      } : null
    })
    renderer.organicTerrain.ready = true
    renderer.organicTerrain.drawDecoration = () => {}
    renderer.drawBaseLayer = ctx => { ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, 517, 517) }
    const grid = Array.from({ length: 32 }, () => Array.from({ length: 64 }, () => ({ type: 'land', biome: 'grass' })))
    const pages = await renderer.prepareStaticTerrain(grid, {
      budget: createTerrainByteBudget({ residentBytes: 16 * 1024 * 1024, stagingBytes: 2 * 1024 * 1024 }),
      yieldTask: async() => {}
    })
    renderer.publishStaticTerrain(pages)
    renderer.maxCachedChunks = 4
    const canvas = document.getElementById('map'), ctx = canvas.getContext('2d', { willReadFrequently: true })
    const render = start => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      renderer.renderTiles(ctx, grid, { x: start * TILE_SIZE, y: 0 }, start, 0, start + 32, 32,
        { decorativeFadeEnabled: false }, { skipWaterBase: true, skipWaterSot: true })
    }
    const samples = []
    for (const start of [16, 0, 32, 16]) {
      render(start)
      while (renderer.decorativeWarmQueue.size) {
        if (!renderer.processDecorativeWarmQueue({ timeRemaining: () => 10 })) throw new Error('Decoration preparation stalled')
      }
      render(start)
      if (start !== 16) continue
      // Compare every interior pixel in all four sections, including sections
      // owned by pages evicted on opposite sides of the camera route.
      let mismatchedPixels = 0
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const expected = sources[dy * 2 + dx].getContext('2d').getImageData(0, 0, 1, 1).data
        const pixels = ctx.getImageData((31 + dx - start) * TILE_SIZE, (15 + dy) * TILE_SIZE, TILE_SIZE, TILE_SIZE).data
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] !== expected[0] || pixels[i + 1] !== expected[1] || pixels[i + 2] !== expected[2] || pixels[i + 3] !== 255) mismatchedPixels++
        }
      }
      samples.push(mismatchedPixels)
    }
    const evictions = renderer.frameChunkStats.chunksEvicted
    renderer.invalidateAllChunks()
    return { samples, evictions, resident: renderer.terrainByteBudget.usage.terrainResident,
      staging: renderer.terrainByteBudget.usage.terrainStaging }
  })
  expect(result.samples).toEqual([0, 0])
  expect(result.evictions).toBeGreaterThan(0)
  expect(result.resident).toBe(0)
  expect(result.staging).toBe(0)
})
