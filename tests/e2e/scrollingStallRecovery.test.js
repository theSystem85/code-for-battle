import { test, expect } from '@playwright/test'

async function loadPreparedGame(page) {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    localStorage.setItem('rts_graphics_settings', JSON.stringify({ rendererBackendChoice: 'webgl' }))
  })
  await page.goto('/?seed=11&size=200&players=4&oreFields=24')
  await page.waitForFunction(() => document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden') &&
    window.gameInstance?.renderer?.mapRenderer?.preparedPages?.pages.size === 169, null, { timeout: 120000 })
}

test('[E00246] revisits prepared terrain without baking and retains GPU ownership through empty inland views', async({ page }) => {
  await loadPreparedGame(page)
  const result = await page.evaluate(() => {
    const game = window.gameInstance, state = window.gameState, renderer = game.renderer, map = game.gameLoop.mapGrid
    game.gameLoop.stop()
    const manager = renderer.mapRenderer, canvas = document.getElementById('gameCanvas'), cm = game.canvasManager
    let bakes = 0
    const bake = manager.drawBaseLayer
    manager.drawBaseLayer = function(...args) { bakes++; return bake.apply(this, args) }
    const frames = []
    for (const [x, y] of [[0, 0], [2500, 2500], [5000, 5000], [500, 4000], [3000, 1000], [0, 0], [2500, 2500]]) {
      state.scrollOffset.x = x
      state.scrollOffset.y = y
      renderer.renderGame(canvas.getContext('2d'), canvas, map, game.gameLoop.factories, game.units, game.gameLoop.bullets,
        state.buildings, state.scrollOffset, false, null, null, state, cm.getGameGlContext(), cm.getGameGlCanvas(), cm.getGameGpuCanvas?.())
      frames.push({ ...state.renderStats.mapChunks, backend: state.renderStats.gpuTerrain.backend, draws: state.renderStats.gpuOverlay.drawCalls })
    }
    manager.drawBaseLayer = bake
    return { bakes, frames, bytes: manager.preparedPages.bytes, pages: manager.preparedPages.pages.size }
  })
  expect(result.pages).toBe(169)
  expect(result.bytes).toBeLessThanOrEqual(256 * 1024 * 1024)
  expect(result.bakes).toBe(0)
  expect(result.frames.some(frame => frame.draws === 0)).toBe(true)
  for (const frame of result.frames) {
    expect(frame.backend).toBe('webgl')
    expect(frame.chunkMisses).toBe(0)
    expect(frame.chunkRedraws).toBe(0)
    expect(frame.directTilePasses).toBe(0)
  }
})

test('[E00247] prepared ground and live resources preserve the original padded-page raster at seams', async({ page }) => {
  await loadPreparedGame(page)
  const result = await page.evaluate(() => {
    const game = window.gameInstance, r = game.renderer.mapRenderer, grid = game.gameLoop.mapGrid
    game.gameLoop.stop()
    r.crystalGlowTime = 12345
    const left = 64, top = 64, offsetX = left * 32, offsetY = top * 32
    for (const x of [left + 15, left + 16]) {
      const tile = grid[top + 15][x]
      if (tile.type === 'land') { tile.ore = true; tile.oreDensity = 5 }
    }
    const create = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1024
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = '#246'
      ctx.fillRect(0, 0, 1024, 1024)
      return { canvas, ctx }
    }
    const reference = create(), prepared = create()
    for (let y = top; y < top + 32; y += 16) for (let x = left; x < left + 32; x += 16) {
      const chunk = r.preparedPages.pages.get(`${x / 16},${y / 16}`)
      const scratch = document.createElement('canvas')
      scratch.width = scratch.height = 517
      const ctx = scratch.getContext('2d')
      ctx.imageSmoothingEnabled = false
      r.drawBaseLayer(ctx, grid, x, y, x + 16, y + 16, x * 32 - 2, y * 32 - 2, true, null, { skipWaterBase: true, skipWaterSot: true })
      reference.ctx.drawImage(scratch, x * 32 - offsetX - 2, y * 32 - offsetY - 2)
      r.drawChunkRaster(prepared.ctx, chunk, x * 32 - offsetX - 2, y * 32 - offsetY - 2)
      r.drawResourceOverlays(prepared.ctx, grid, x, y, x + 16, y + 16, offsetX, offsetY, true, true)
    }
    const a = reference.ctx.getImageData(0, 0, 1024, 1024).data
    const b = prepared.ctx.getImageData(0, 0, 1024, 1024).data
    let maxDifference = 0, changedChannels = 0
    for (let i = 0; i < a.length; i++) {
      const difference = Math.abs(a[i] - b[i])
      if (difference) changedChannels++
      maxDifference = Math.max(maxDifference, difference)
    }
    return { maxDifference, changedChannels }
  })
  // A separately composited resource can round a premultiplied color channel
  // by one; geometry, coverage and all larger color differences must match.
  expect(result.maxDifference).toBeLessThanOrEqual(1)
})

test('[E00248] the periodic autosave timer writes a restorable worker-encoded map and dynamic state', async({ page }) => {
  await page.clock.install()
  await loadPreparedGame(page)
  const encoder = page.workers().find(worker => /checkpointEncoding/.test(worker.url()))
  expect(encoder).toBeTruthy()
  expect(await encoder.evaluate(() => typeof globalThis.onmessage)).toBe('function')
  await page.evaluate(async() => {
    const game = window.gameInstance, state = window.gameState, grid = game.gameLoop.mapGrid
    game.gameLoop.stop()
    state.money = 987654
    grid[2][2].ore = true
    grid[2][2].oreDensity = 5
    const { notifyResourceTileMutation } = await import('/src/rendering/prepared/mapMutationNotifier.js')
    notifyResourceTileMutation(grid, 2, 2)
    const { removeStoredItem } = await import('/src/storage/indexedDbStorage.js')
    removeStoredItem('rts_save_lastGame')
  })
  await page.clock.fastForward(60_000)
  await expect.poll(async() => page.evaluate(async() => {
    const { getStoredItem } = await import('/src/storage/indexedDbStorage.js')
    return Boolean(getStoredItem('rts_save_lastGame'))
  }), { timeout: 30000 }).toBe(true)
  const result = await page.evaluate(async() => {
    const { getStoredItem, flushGameStorageWrites, verifyStoredItemPersisted } = await import('/src/storage/indexedDbStorage.js')
    const { decodeSaveObject } = await import('/src/saveFormat.js')
    const raw = getStoredItem('rts_save_lastGame'), save = decodeSaveObject(raw), state = JSON.parse(save.state)
    await flushGameStorageWrites()
    return { compact: raw.startsWith('CFB2\n'), label: save.label, money: state.gameState.money,
      width: state.mapTileState[0].length, height: state.mapTileState.length,
      tile: state.mapTileState[2][2], persisted: await verifyStoredItemPersisted('rts_save_lastGame') }
  })
  expect(result).toMatchObject({ compact: true, label: 'lastGame', money: 987654, width: 200, height: 200,
    tile: { ore: true, oreDensity: 5 }, persisted: true })
})
