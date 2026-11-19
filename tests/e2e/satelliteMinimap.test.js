import { expect, test } from '@playwright/test'

test('[E00271] switches minimap terrain using the image prepared for each map', async({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cfb-story-intro-v1', 'seen')
    localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    window.satelliteLoadingSteps = []
    const observer = new window.MutationObserver(() => {
      const screen = document.getElementById('loadingScreen')
      if (screen?.dataset.phase === 'satellite' && window.satelliteLoadingSteps.at(-1) !== screen.getAttribute('aria-hidden')) {
        window.satelliteLoadingSteps.push(screen.getAttribute('aria-hidden'))
      }
    })
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-phase', 'aria-hidden'] })
  })

  await page.goto('/?seed=41&size=64&players=2')
  const loadingScreen = page.locator('#loadingScreen')
  await expect(loadingScreen).toHaveAttribute('aria-hidden', 'true', { timeout: 90000 })
  const toggle = page.locator('#minimapSatelliteToggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(toggle).toHaveAccessibleName('Switch to satellite view')
  await expect(toggle.locator('.minimap-satellite-icon')).toBeVisible()

  const terrainColors = await page.evaluate(async() => {
    const { minimapRenderer } = (await import('/src/rendering.js')).getGameRenderer()
    const canvas = document.getElementById('minimap')
    window.initialSatelliteImage = minimapRenderer.satelliteImage.canvas
    const satellite = window.initialSatelliteImage
    const pixels = satellite.getContext('2d').getImageData(0, 0, satellite.width, satellite.height).data
    const colors = new Set()
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 255) colors.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2])
    }
    window.gameState.gamePaused = true
    window.gameState.radarActive = true
    const ctx = canvas.getContext('2d')
    const drawImage = ctx.drawImage
    ctx.drawImage = function(source, ...args) {
      if (source === minimapRenderer.satelliteImage?.canvas || source === minimapRenderer.terrainCacheCanvas) {
        window.drawnMinimapTerrain = source === minimapRenderer.satelliteImage?.canvas ? 'satellite' : 'normal'
      }
      return drawImage.call(this, source, ...args)
    }
    return colors.size
  })
  expect(terrainColors).toBeGreaterThan(25)
  expect(await page.evaluate(() => window.satelliteLoadingSteps)).toEqual(['false'])

  await expect.poll(() => page.evaluate(() => window.drawnMinimapTerrain)).toBe('normal')
  await toggle.press('Space')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toHaveAccessibleName('Switch to normal view')
  await expect(toggle.locator('.minimap-normal-icon')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.drawnMinimapTerrain)).toBe('satellite')
  await toggle.click()
  await expect.poll(() => page.evaluate(() => window.drawnMinimapTerrain)).toBe('normal')
  expect(await page.evaluate(async() => {
    const { minimapRenderer } = (await import('/src/rendering.js')).getGameRenderer()
    return minimapRenderer.satelliteImage.canvas === window.initialSatelliteImage
  })).toBe(true)

  await page.evaluate(() => document.body.classList.add('sidebar-condensed'))
  await expect(toggle).toBeHidden()
  await page.evaluate(() => document.body.classList.remove('sidebar-condensed'))
  await expect(toggle).toBeVisible()

  await page.locator('#mapSettingsToggle').click()
  await page.locator('#mapSeed').fill('42')
  await page.locator('#mapSettingsApplyBtn').click()
  await expect(loadingScreen).toHaveAttribute('data-phase', 'satellite', { timeout: 90000 })
  await expect(loadingScreen).toHaveAttribute('aria-hidden', 'true')
  expect(await page.evaluate(async() => {
    const { minimapRenderer } = (await import('/src/rendering.js')).getGameRenderer()
    return window.gameState.mapSeed === '42' &&
      minimapRenderer.satelliteImage.canvas !== window.initialSatelliteImage
  })).toBe(true)
})
