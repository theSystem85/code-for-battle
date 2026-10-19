import { test, expect } from '@playwright/test'

test.beforeEach(async({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=9&size=40')
  await page.waitForFunction(() => window.gameState?.mapGrid?.length > 0, null, { timeout: 90000 })
})

test('[E00207] Graphics tab owns visual controls and persists Coastal Shallows and wave controls', async({ page }) => {
  await page.click('#helpBtn')
  await page.click('[data-config-tab="graphics"]')
  const graphics = page.locator('[data-config-tab-panel="graphics"]')
  await expect(graphics).toBeVisible()
  for (const selector of ['#settingsWaterToneRange', '#settingsWaterSaturationRange', '#settingsFrameLimiterToggle', '#settingsRadarOfflineAnimationToggle', '#settingsTrackMarksToggle', '#selectionHudModeSelect', '#settingsGraphics-maxSmokeParticles']) {
    await expect(graphics.locator(selector)).toHaveCount(1)
    await expect(page.locator('[data-config-tab-panel="runtime"]').locator(selector)).toHaveCount(0)
  }
  await page.locator('#settingsCoastalShallowsToggle').uncheck()
  for (const [name, value] of [['Direction', 135], ['Speed', 1.5], ['Strength', 0.6], ['Height', 2]]) {
    await page.locator(`#settingsWater${name}Range`).evaluate((input, value) => {
      input.value = String(value)
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    }, value)
  }
  await page.evaluate(async() => {
    const { flushGameStorageWrites } = await import('/src/storage/indexedDbStorage.js')
    await flushGameStorageWrites()
  })
  await page.reload()
  await page.waitForFunction(() => window.gameState?.mapGrid?.length > 0)
  await page.click('#helpBtn')
  await page.click('[data-config-tab="graphics"]')
  await expect(page.locator('#settingsCoastalShallowsToggle')).not.toBeChecked()
  for (const [name, value] of [['Direction', '135'], ['Speed', '1.5'], ['Strength', '0.6'], ['Height', '2']]) {
    await expect(page.locator(`#settingsWater${name}Range`)).toHaveValue(value)
  }
})

test('[E00130] water pixels reveal sand continuously across five tiles and retain topology when toggled', async({ page }) => {
  const hardwareGpu = await page.evaluate(() => window.gameInstance?.renderer?.gpuRenderer?.hardwareGpuAvailable === true)
  test.skip(!hardwareGpu, 'Requires a verified hardware GPU per AGENTS.md')
  const result = await page.evaluate(async() => {
    const resources = performance.getEntriesByType('resource')
    const rendererUrl = resources.find(entry => /\/src\/rendering\/webglRenderer\.js(?:\?|$)/.test(entry.name))?.name || '/src/rendering/webglRenderer.js'
    const configUrl = resources.find(entry => /\/src\/config\.js(?:\?|$)/.test(entry.name))?.name || '/src/config.js'
    const { GameWebGLRenderer } = await import(rendererUrl)
    const config = await import(configUrl)
    config.setWaterEffectStrength(0)
    config.setWaterEffectSpeed(0)
    config.setWaterEffectTone(0)
    config.setWaterEffectSaturation(1)
    config.setCoastalShallowsEnabled(true)
    const canvas = document.createElement('canvas')
    const size = config.TILE_SIZE
    canvas.width = 12 * size
    canvas.height = 8 * size
    canvas.style.width = `${canvas.width}px`
    canvas.style.height = `${canvas.height}px`
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL2 unavailable')
    const map = Array.from({ length: 8 }, () => Array.from({ length: 12 }, (_, x) => ({ type: x < 2 ? 'land' : 'water' })))
    const atlas = document.createElement('canvas')
    atlas.width = atlas.height = 1
    const renderer = new GameWebGLRenderer(gl, { primarySpriteSheetImage: atlas })
    const draw = () => renderer.render(map, { x: 0, y: 0 }, canvas, { waterOnly: true, time: 1200, topologyRevision: 1 })
    const pixel = x => {
      const bytes = new Uint8Array(4)
      gl.readPixels(x, 4 * size, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
      return Array.from(bytes)
    }
    if (!draw()) throw new Error('Water draw failed')
    const before = renderer.waterTopology.data
    const sampleXs = [2, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5].map(value => Math.floor(value * size))
    const samples = sampleXs.map(pixel)
    config.setCoastalShallowsEnabled(false)
    draw()
    const opaque = sampleXs.map(pixel)
    const retained = before === renderer.waterTopology.data
    const builds = renderer.stats.topologyBuilds
    config.setCoastalShallowsEnabled(true)
    config.setWaterEffectTone(1)
    config.setWaterEffectSaturation(0)
    draw()
    const recolored = pixel(sampleXs[4])
    return { samples, opaque, retained, builds, recolored, error: gl.getError() }
  })
  console.log('COASTAL_PIXELS', JSON.stringify(result))
  expect(result.error).toBe(0)
  expect(result.retained).toBe(true)
  expect(result.builds).toBe(1)
  // Red sand contribution decreases monotonically with offshore distance.
  for (let i = 1; i < 6; i++) expect(result.samples[i][0]).toBeLessThan(result.samples[i - 1][0])
  expect(result.samples[0][0]).toBeGreaterThan(175)
  expect(result.samples[6]).toEqual(result.opaque[6])
  expect(result.samples[7]).toEqual(result.opaque[7])
  expect(result.samples[1]).not.toEqual(result.opaque[1])
  expect(result.recolored).not.toEqual(result.samples[4])
})
