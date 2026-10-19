import { test, expect } from '@playwright/test'

const TILE_SIZE = 32

async function findWaterSample(page) {
  return page.evaluate((tileSize) => {
    const game = window.gameInstance
    const gameState = window.gameState
    const map = game?.mapGrid || gameState?.mapGrid
    const gameCanvas = document.getElementById('gameCanvas')
    if (!map || !gameState || !gameCanvas) {
      return null
    }

    const isWater = (x, y) => map?.[y]?.[x]?.type === 'water'
    let target = null

    for (let y = 1; y < map.length - 1 && !target; y++) {
      for (let x = 1; x < map[0].length - 1 && !target; x++) {
        if (isWater(x, y)) {
          target = { x, y }
        }
      }
    }

    if (!target) {
      return null
    }

    const cssWidth = gameCanvas.clientWidth || gameCanvas.width
    const cssHeight = gameCanvas.clientHeight || gameCanvas.height
    const mapPixelWidth = map[0].length * tileSize
    const mapPixelHeight = map.length * tileSize

    gameState.scrollOffset.x = Math.max(0, Math.min(target.x * tileSize - (cssWidth / 2), mapPixelWidth - cssWidth))
    gameState.scrollOffset.y = Math.max(0, Math.min(target.y * tileSize - (cssHeight / 2), mapPixelHeight - cssHeight))
    game?.gameLoop?.requestRender?.()

    return target
  }, TILE_SIZE)
}

async function readWaterPixel(page) {
  return page.evaluate(async(tileSize) => {
    const game = window.gameInstance
    const gameState = window.gameState
    const map = game?.mapGrid || gameState?.mapGrid
    const canvas = document.getElementById('gameCanvas')
    const ctx = canvas?.getContext('2d')
    const glCanvas = document.getElementById('gameCanvasGL')
    const gl = glCanvas?.getContext('webgl2') || glCanvas?.getContext('webgl')
    if (!gameState || !map || !canvas || !ctx) {
      return null
    }

    const graphicsSettings = JSON.parse(localStorage.getItem('rts_graphics_settings') || '{}')
    const useProceduralWaterRendering = graphicsSettings.useProceduralWaterRendering !== false
    const isWater = (x, y) => map?.[y]?.[x]?.type === 'water'
    let selected = null
    for (let y = 1; y < map.length - 1 && !selected; y++) {
      for (let x = 1; x < map[0].length - 1 && !selected; x++) {
        if (isWater(x, y)) {
          selected = { x, y }
        }
      }
    }
    if (!selected) {
      return null
    }

    const ratio = window.devicePixelRatio || 1
    const x = Math.max(0, Math.floor((selected.x * tileSize - gameState.scrollOffset.x + tileSize * 0.5) * ratio))
    const yTop = Math.max(0, Math.floor((selected.y * tileSize - gameState.scrollOffset.y + tileSize * 0.5) * ratio))

    if (useProceduralWaterRendering && glCanvas && gl) {
      window.gameInstance.renderer.gpuRenderer.render(map, gameState.scrollOffset, glCanvas, { waterOnly: true, time: 1200 })
      const px = Math.min(glCanvas.width - 1, x)
      const py = glCanvas.height - 1 - Math.min(glCanvas.height - 1, yTop)
      const out = new Uint8Array(4)
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
      return Array.from(out)
    }

    if (x >= canvas.width || yTop >= canvas.height) {
      return null
    }
    return Array.from(ctx.getImageData(x, yTop, 1, 1).data)
  }, TILE_SIZE)
}

test.describe('Procedural WebGL water rendering', () => {
  test('[E00091] animates the loaded battlefield water without rebuilding its geometry', async({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('rts_graphics_settings', JSON.stringify({ rendererBackendChoice: 'webgl' }))
    })
    await page.goto('/?seed=9&size=100')
    await page.waitForFunction(() => window.gameState?.gameStarted && window.gameState?.mapGrid?.length > 0)
    expect(await findWaterSample(page)).not.toBeNull()
    await page.waitForFunction(() => Boolean(window.gameInstance?.renderer?.gpuRenderer?.program))
    const result = await page.evaluate(async() => {
      const renderer = window.gameInstance.renderer.gpuRenderer
      const canvas = document.getElementById('gameCanvasGL')
      const gl = canvas.getContext('webgl2')
      const state = window.gameState
      const sample = time => {
        renderer.render(state.mapGrid, state.scrollOffset, canvas, { waterOnly: true, time })
        const pixels = new Uint8Array(canvas.width * canvas.height * 4)
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        return pixels
      }
      const first = sample(1200)
      const uploads = renderer.stats.topologyUploadBytes
      const later = sample(2200)
      let changed = 0
      let opaque = 0
      let uncovered = 0
      for (let i = 0; i < first.length; i += 4) {
        if (first[i + 3] === 255) opaque++
        if (first[i + 3] === 0) uncovered++
        if (first[i + 3] === 255 && Math.abs(first[i] - later[i]) + Math.abs(first[i + 1] - later[i + 1]) + Math.abs(first[i + 2] - later[i + 2]) > 8) changed++
      }
      return { changed, opaque, uncovered, uploadDelta: renderer.stats.topologyUploadBytes - uploads, error: gl.getError() }
    })
    expect(result.error).toBe(0)
    expect(result.opaque).toBeGreaterThan(100)
    expect(result.uncovered).toBeGreaterThan(100)
    expect(result.changed).toBeGreaterThan(100)
    expect(result.uploadDelta).toBe(0)
  })

  test('[E00092] settings modal persists procedural water color sliders', async({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Water settings rendering checks run on Chromium only')

    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
      if (!localStorage.getItem('rts_graphics_settings')) {
        localStorage.setItem('rts_graphics_settings', JSON.stringify({
          rendererBackend: 'webgl',
          rendererBackendChoice: 'webgl'
        }))
      }
    })

    await page.goto('/?seed=9')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => window.gameState?.gameStarted && window.gameState?.mapGrid?.length > 0, null, { timeout: 90000 })
    await page.waitForFunction(() => Boolean(window.gameState && window.gameInstance))

    await page.waitForFunction(() => Boolean(window.gameInstance?.renderer?.gpuRenderer?.program))
    const target = await findWaterSample(page)
    expect(target).not.toBeNull()
    await page.waitForTimeout(400)

    const proceduralBefore = await readWaterPixel(page)
    expect(proceduralBefore).not.toBeNull()

    await page.locator('#helpBtn').click()
    await page.locator('[data-config-tab="runtime"]').click()
    await expect(page.locator('#configSettingsModal')).toHaveClass(/config-modal--open/)

    await page.locator('[data-config-tab="graphics"]').click()
    const toneSlider = page.locator('#settingsWaterToneRange')
    const saturationSlider = page.locator('#settingsWaterSaturationRange')

    await expect(page.locator('#settingsProceduralWaterToggle')).toHaveCount(0)

    await toneSlider.evaluate((element, value) => {
      element.value = String(value)
      element.dispatchEvent(new window.Event('input', { bubbles: true }))
    }, 0.7)
    await saturationSlider.evaluate((element, value) => {
      element.value = String(value)
      element.dispatchEvent(new window.Event('input', { bubbles: true }))
    }, 1.6)
    await page.waitForTimeout(250)

    const tonedProcedural = await readWaterPixel(page)
    expect(tonedProcedural).not.toBeNull()
    expect(tonedProcedural).not.toEqual(proceduralBefore)

    await page.reload()
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => window.gameState?.gameStarted && window.gameState?.mapGrid?.length > 0, null, { timeout: 90000 })
    await page.waitForFunction(() => Boolean(window.gameState && window.gameInstance))
    await findWaterSample(page)
    await page.waitForTimeout(400)

    await page.locator('#helpBtn').click()
    await page.locator('[data-config-tab="runtime"]').click()
    await expect(page.locator('#configSettingsModal')).toHaveClass(/config-modal--open/)
    await page.locator('[data-config-tab="graphics"]').click()
    await expect(toneSlider).toHaveValue('0.7')
    await expect(saturationSlider).toHaveValue('1.6')

    const storedSettings = await page.evaluate(async() => {
      const { getStoredItem } = await import('/src/storage/indexedDbStorage.js')
      return JSON.parse(getStoredItem('rts_graphics_settings') || '{}')
    })
    expect(storedSettings).toMatchObject({
      waterEffectTone: 0.7,
      waterEffectSaturation: 1.6
    })
  })
})
