import { test, expect } from '@playwright/test'

async function loadFreshGame(page) {
  await page.addInitScript(() => {
    window.renderPreparationWarnings = []
    let logger
    Object.defineProperty(window, 'logger', { configurable: true, get: () => logger, set(value) {
      logger = value
      const warn = value.warn
      value.warn = (...args) => {
        window.renderPreparationWarnings.push(args.map(arg => arg?.stack || String(arg)).join(' '))
        return warn(...args)
      }
    } })
    window.__CFB_TERRAIN_GPU_TIMING__ = true
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=11&size=200&players=4&oreFields=24')
  await page.waitForFunction(() => document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden') &&
    window.gameInstance?.renderer?.webgpuRenderer?.status === 'ready', null, { timeout: 120000 })
}

test.describe('default high-DPI rendering lifecycle', () => {
  test.use({ deviceScaleFactor: 2 })
  test.beforeEach(async({ browser }) => {
    let gpu
    try {
      const session = await browser.newBrowserCDPSession()
      gpu = (await session.send('SystemInfo.getInfo')).gpu
      await session.detach()
    } catch { /* Non-Chromium runners cannot verify this hardware fixture. */ }
    const device = gpu?.devices?.[0]?.deviceString || ''
    const hardware = /Apple|NVIDIA|AMD|Intel|Adreno|Mali|Radeon/i.test(device) &&
      !/swiftshader|llvmpipe|software|basic render|lavapipe/i.test(device) && gpu?.featureStatus?.rasterization === 'enabled'
    test.skip(!hardware, 'Requires a verified hardware GPU; software adapters cannot validate this fixture')
  })

  test('[E00253] keeps loading visible until terrain preparation finishes even after ten seconds', async({ page }) => {
    await page.addInitScript(() => {
      const create = window.createImageBitmap
      let held = false
      window.createImageBitmap = async function(source, ...options) {
        if (!held && source instanceof window.HTMLCanvasElement && source.width === 517 && source.height === 517) {
          held = true
          await new Promise(resolve => { window.releaseTerrainPreparation = resolve })
        }
        return create.call(this, source, ...options)
      }
    })
    const loading = loadFreshGame(page)
    await page.waitForFunction(() => typeof window.releaseTerrainPreparation === 'function')
    await page.waitForTimeout(10500)
    await expect(page.locator('#loadingScreen')).not.toHaveClass(/loading-screen--hidden/)
    await page.evaluate(() => window.releaseTerrainPreparation())
    await loading
    await page.waitForFunction(() => window.gameState.renderStats?.gpuStaticGround?.active)
    expect(await page.evaluate(() => window.gameInstance.renderer.mapRenderer.preparedPages.pages.size)).toBe(169)
  })

  test('[E00249] Auto compiles WebGPU and keeps water rendering through real device recovery', async({ page }) => {
    await loadFreshGame(page)
    await page.waitForFunction(() => window.gameState.renderStats?.gpuTerrain?.backend === 'webgpu')
    await page.waitForFunction(() => Number.isFinite(window.gameState.renderStats?.gpuStaticGround?.gpuMilliseconds))
    await page.evaluate(() => {
      window.destroyedTestDevice = window.gameInstance.renderer.webgpuRenderer.device
      window.destroyedTestDevice.destroy()
    })
    await page.waitForFunction(() => window.gameState.renderStats?.gpuTerrain?.backend === 'webgl')
    const state = await page.evaluate(() => ({
      hardware: window.gameInstance.renderer.gpuRenderer.hardwareGpuAvailable,
      owner: window.gameState.renderStats.gpuTerrain.rendered
    }))
    expect(state).toMatchObject({ hardware: true, owner: true })
    await page.waitForFunction(() => window.gameState.renderStats?.gpuTerrain?.backend === 'webgpu' &&
      window.gameInstance.renderer.webgpuRenderer.device !== window.destroyedTestDevice)
  })

  test('[E00254] prepares replacement terrain before resuming after custom sprites are enabled and disabled', async({ page }) => {
    await page.addInitScript(() => localStorage.setItem('rts-integrated-spritesheet-mode', 'false'))
    await loadFreshGame(page)
    // Keep rendering active, but isolate camera work from AI terrain edits.
    // The configuration lifecycle must preserve the player's pause choice.
    await page.evaluate(() => { window.gameState.gamePaused = true })
    await page.locator('#mapSettingsToggle').click()
    const checkbox = page.locator('#integratedSpriteSheetModeCheckbox')
    for (const enabled of [true, false]) {
      await checkbox.setChecked(enabled)
      await page.waitForFunction(enabled => window.gameState.useIntegratedSpriteSheetMode === enabled &&
        window.gameInstance.renderer.mapRenderer.preparedPages?.pages.size === 169 &&
        window.gameInstance.renderer.mapRenderer.preparedPages?.gpuRasterPass &&
        window.gameInstance.gameLoop.running &&
        document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'), enabled, { timeout: 120000 })
      // Final sheet publication used to retire the pages after the UI returned.
      await page.waitForTimeout(12000)
      const state = await page.evaluate(() => {
        const game = window.gameInstance, r = game.renderer, map = game.gameLoop.mapGrid, cm = game.canvasManager, renderState = window.gameState
        game.gameLoop.stop()
        const canvas = cm.getGameCanvas(), before = r.mapRenderer.rasterBakeCount
        for (let lap = 0; lap < 2; lap++) for (const [x, y] of [[0, 0], [2500, 2500], [5000, 5000], [500, 4000], [3000, 1000]]) {
          renderState.scrollOffset.x = x; renderState.scrollOffset.y = y
          r.renderGame(canvas.getContext('2d'), canvas, map, game.gameLoop.factories, game.units, game.gameLoop.bullets,
            renderState.buildings, renderState.scrollOffset, false, null, null, renderState,
            cm.getGameGlContext(), cm.getGameGlCanvas(), cm.getGameGpuCanvas())
        }
        const result = { pages: r.mapRenderer.preparedPages?.pages.size,
          active: renderState.renderStats.gpuStaticGround?.active, bakes: r.mapRenderer.rasterBakeCount - before,
          paused: renderState.gamePaused,
          gpuBytes: r.mapRenderer.preparedPages?.budget.usage.gpuTerrain }
        game.gameLoop.start()
        return result
      })
      expect(state.pages).toBe(169)
      expect(state.active).toBe(true)
      expect(state.paused).toBe(true)
      expect(state.bakes).toBe(0)
      expect(state.gpuBytes).toBeGreaterThan(0)
      expect(state.gpuBytes).toBeLessThanOrEqual(512 * 1024 * 1024)
    }
  })

  test('[E00250] recycled terrain masks and composites match fresh rasterization across evictions', async({ page }) => {
    await loadFreshGame(page)
    const result = await page.evaluate(async() => {
      const { TerrainCanvasCache } = await import('/src/rendering/terrainCanvasCache.js')
      const original = window.gameInstance.renderer.mapRenderer.organicTerrain
      window.gameInstance.gameLoop.stop()
      const make = pooled => {
        const terrain = Object.create(original)
        for (const key of ['biomeBlendMasks', 'biomeTransitionTileCache', 'biomeSotTileCache']) {
          terrain[key] = pooled ? new TerrainCanvasCache({ maxEntries: 2, maxBytes: 8192 }) : new Map()
        }
        terrain.maskPixels = null
        return terrain
      }
      const pooled = make(true), reference = make(false)
      await pooled.prepareRasterCaches(32, async() => {})
      const create = () => {
        const c = document.createElement('canvas')
        c.width = c.height = 32
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.imageSmoothingEnabled = false
        return ctx
      }
      const a = create(), b = create()
      let maxDifference = 0
      for (let i = 0; i < 64; i++) {
        const blend = { biome: i % 2 ? 'sand' : 'soil', alpha: 0.55, angle: i * 0.13,
          featherPixels: 3 + i % 8, ...(i % 3 ? { cornerWeights: [0.2, i / 64, 0.8, 0.4] } : {}) }
        for (const [terrain, ctx] of [[pooled, a], [reference, b]]) {
          ctx.clearRect(0, 0, 32, 32)
          terrain.drawGrass(ctx, i, i + 1, 0, 0, 32, { biome: 'grass', biomeBlend: blend })
          terrain.drawBiomeShore(ctx, i, i + 2, 0, 0, 32, i % 16, 'sand')
          terrain.drawBiomeSot(ctx, i, i + 3, 0, 0, 32, 'top-left', 'soil')
        }
        const x = a.getImageData(0, 0, 32, 32).data, y = b.getImageData(0, 0, 32, 32).data
        for (let channel = 0; channel < x.length; channel++) maxDifference = Math.max(maxDifference, Math.abs(x[channel] - y[channel]))
      }
      const counts = ['biomeBlendMasks', 'biomeTransitionTileCache', 'biomeSotTileCache'].map(key => ({ ...pooled[key].stats }))
      for (const key of ['biomeBlendMasks', 'biomeTransitionTileCache', 'biomeSotTileCache']) pooled[key].clear()
      return { maxDifference, counts, releasedBytes: pooled.biomeBlendMasks.stats.bytes + pooled.biomeTransitionTileCache.stats.bytes + pooled.biomeSotTileCache.stats.bytes }
    })
    expect(result.maxDifference).toBe(0)
    for (const stats of result.counts) {
      expect(stats.created).toBe(2)
      expect(stats.evicted).toBeGreaterThan(0)
      expect(stats.peakBytes).toBeLessThanOrEqual(8192)
    }
    expect(result.releasedBytes).toBe(0)
  })

  for (const backend of ['webgl', 'webgpu']) test(`[E00251] native-DPR GPU ground preserves streamed raster pixels and needs no camera-triggered baking (${backend})`, async({ page }) => {
    await loadFreshGame(page)
    const result = await page.evaluate(async(backend) => {
      const { StaticTerrainGpuPages } = await import('/src/rendering/prepared/staticTerrainGpuPages.js')
      const renderer = window.gameInstance.renderer, manager = renderer.mapRenderer, pages = manager.preparedPages
      window.gameInstance.gameLoop.stop()
      if (!pages?.gpuRasterPass || pages.density !== 1) throw new Error(`Expected the retained streaming-raster GPU representation: ${JSON.stringify({ density: pages?.density, closed: pages?.closed, warnings: window.renderPreparationWarnings })}`)
      const canvas = document.createElement('canvas')
      canvas.width = 640; canvas.height = 480
      const { publishCanvasViewport } = await import('/src/rendering/prepared/canvasViewportRegistry.js')
      const gl = backend === 'webgl' ? canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true }) : null
      const gpu = backend === 'webgpu' ? { device: renderer.webgpuRenderer.device, format: renderer.webgpuRenderer.format, status: 'ready', context: canvas.getContext('webgpu') } : null
      if (gpu) gpu.context.configure({ device: gpu.device, format: gpu.format, alphaMode: 'premultiplied' })
      const gpuBytesBefore = pages.budget.usage.gpuTerrain
      const pass = new StaticTerrainGpuPages(pages, pages.budget)
      if (gl) pass.prepareGl(gl)
      else pass.prepareGpu(gpu)
      const make = density => {
        const c = document.createElement('canvas'); c.width = 320 * density; c.height = 240 * density
        const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.scale(density, density); ctx.imageSmoothingEnabled = false
        return ctx
      }
      let reference, actual
      let maximum = 0, bakes = 0
      const cases = []
      const resources = manager.drawResourceOverlays, decorations = manager.drawPreparedDecorations
      manager.drawResourceOverlays = () => {}
      manager.drawPreparedDecorations = () => {}
      const draw = manager.drawBaseLayer
      manager.drawBaseLayer = function(...args) { bakes++; return draw.apply(this, args) }
      try {
        for (const density of [1.5, 2, 2.5, 3]) {
          canvas.width = 320 * density; canvas.height = 240 * density
          publishCanvasViewport(canvas, { logicalWidth: 320, logicalHeight: 240, density })
          reference = make(density); actual = make(density)
          publishCanvasViewport(reference.canvas, { logicalWidth: 320, logicalHeight: 240, density })
          for (const scroll of [{ x: 1984, y: 1984 }, { x: 1984.25, y: 1984.75 }, { x: 510.5, y: 510.5 }]) {
            reference.clearRect(0, 0, 320, 240); actual.clearRect(0, 0, 320, 240)
            reference.fillStyle = actual.fillStyle = '#246'; reference.fillRect(0, 0, 320, 240); actual.fillRect(0, 0, 320, 240)
            if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT) }
            else { const encoder = gpu.device.createCommandEncoder(); const clear = encoder.beginRenderPass({ colorAttachments: [{ view: gpu.context.getCurrentTexture().createView(), clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }] }); clear.end(); gpu.device.queue.submit([encoder.finish()]) }
            pass.render(backend, gpu, canvas, scroll, 320, 240, manager, window.gameInstance.gameLoop.mapGrid)
            manager.render(reference, window.gameInstance.gameLoop.mapGrid, scroll, reference.canvas, window.gameState, null, { skipWaterBase: true, skipWaterSot: true })
            if (gpu) await gpu.device.queue.onSubmittedWorkDone()
            actual.drawImage(canvas, 0, 0, 320, 240)
            const a = reference.getImageData(0, 0, canvas.width, canvas.height).data, b = actual.getImageData(0, 0, canvas.width, canvas.height).data
            let delta = 0, first = null
            for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > delta) { delta = d; first = { pixel: Math.floor(i / 4), channel: i % 4, a: Array.from(a.slice(i - i % 4, i - i % 4 + 4)), b: Array.from(b.slice(i - i % 4, i - i % 4 + 4)) } } }
            cases.push({ backend, density, scroll, delta, first }); maximum = Math.max(maximum, delta)
          }
        }
      } finally { manager.drawBaseLayer = draw; manager.drawResourceOverlays = resources; manager.drawPreparedDecorations = decorations; pass.close() }
      return { maximum, cases, bakes, budgetRestored: pages.budget.usage.gpuTerrain === gpuBytesBefore, dpr: window.devicePixelRatio, backing: document.getElementById('gameCanvas').width,
        logical: document.getElementById('gameCanvas').clientWidth, pages: pages.pages.size, uploads: pages.gpuRasterPass.stats.uploads }
    }, backend)
    expect(result.maximum, JSON.stringify(result.cases)).toBeLessThanOrEqual(1)
    expect(result.bakes).toBe(0)
    expect(result.budgetRestored).toBe(true)
    expect(result.dpr).toBe(2)
    expect(result.backing).toBe(result.logical * 2)
    expect(result.pages).toBe(169)
    expect(result.uploads).toBe(338)
  })


  test('[E00252] updates both retained backends for terrain edits even when the mutable raster identity stays the same', async({ page }) => {
    await loadFreshGame(page)
    const result = await page.evaluate(async() => {
      const { notifyTopologyTileMutation } = await import('/src/rendering/prepared/mapMutationNotifier.js')
      const game = window.gameInstance, renderer = game.renderer, manager = renderer.mapRenderer
      const grid = game.gameLoop.mapGrid, state = window.gameState, cm = game.canvasManager
      game.gameLoop.stop()
      const canvas = document.getElementById('gameCanvas'), pages = manager.preparedPages, pass = pages.gpuRasterPass
      state.scrollOffset.x = state.scrollOffset.y = 1984
      const tile = grid[64][64], old = tile.type, before = pass.stats.uploads
      const snapshots = []
      let firstImage
      for (const type of [old === 'rock' ? 'land' : 'rock', old]) {
        tile.type = type
        notifyTopologyTileMutation(grid, 64, 64)
        renderer.renderGame(canvas.getContext('2d'), canvas, grid, game.gameLoop.factories, game.units, game.gameLoop.bullets,
          state.buildings, state.scrollOffset, false, null, null, state, cm.getGameGlContext(), cm.getGameGlCanvas(), cm.getGameGpuCanvas())
        const record = pass.records.get('4,4'), raster = record.chunk.preparedRaster
        snapshots.push({ revision: raster.revision, gl: record.glRevision, gpu: record.gpuRevision, uploads: pass.stats.uploads,
          sameImage: firstImage ? firstImage === raster.image : true })
        firstImage = raster.image
      }
      return { before, snapshots, active: pass.stats.active }
    })
    const [first, second] = result.snapshots
    expect(first.uploads).toBeGreaterThan(result.before)
    expect(second.uploads).toBeGreaterThan(first.uploads)
    expect(second.revision).toBeGreaterThan(first.revision)
    expect(second.sameImage).toBe(true)
    for (const snapshot of result.snapshots) {
      expect(snapshot.gl).toBe(snapshot.revision)
      expect(snapshot.gpu).toBe(snapshot.revision)
    }
    expect(result.active).toBe(true)
  })

})
