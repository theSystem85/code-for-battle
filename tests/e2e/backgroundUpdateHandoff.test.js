import { expect, test } from '@playwright/test'

test('[E00238] downloads while playing, preserves the paused battlefield across restart, restores the save, and leaves manual reload loading intact', async({ page }) => {
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
  await expect(page.locator('#loadingScreen')).toHaveClass(/loading-screen--hidden/)
  await page.evaluate(async() => {
    const [{ createLiveUpdater }, { prepareRunningGameUpdate }] = await Promise.all([
      import('/src/pwa/liveUpdate.js'), import('/src/pwa/updateHandoff.js')
    ])
    const download = new Promise(resolve => { window.__finishUpdateDownload = resolve })
    window.__updateSaved = false
    window.__updater = createLiveUpdater({
      getGameState: () => window.gameState,
      stageUpdate: () => download,
      activateServiceWorker: async() => {},
      prepareReload: async() => {
        await prepareRunningGameUpdate()
        window.__updateSaved = true
      }
    })
    window.__updater.applyBreakingUpdate({ commit: 'bbbbbbb', version: '0.64.1' })
  })
  expect(await page.evaluate(() => ({ paused: window.gameState.gamePaused, saved: window.__updateSaved }))).toEqual({ paused: false, saved: false })
  await expect(page.locator('#gameUpdateFrame')).toHaveCount(0)

  let releaseBoot
  const bootGate = new Promise(resolve => { releaseBoot = resolve })
  await page.route('**/src/main.js', async route => {
    await bootGate
    await route.continue()
  })
  await page.evaluate(() => {
    window.gameState.money = 1234567
    window.__finishUpdateDownload()
  })
  await page.waitForURL(/cfb-update=bbbbbbb/)
  await expect(page.locator('#gameUpdateFrame')).toBeVisible()
  expect(await page.evaluate(() => document.elementFromPoint(window.innerWidth / 2, 40)?.closest('#gameUpdateFrame')?.id)).toBe('gameUpdateFrame')
  releaseBoot()
  await page.waitForFunction(() => window.gameState?.gameStarted && !window.gameState.gamePaused && !document.getElementById('gameUpdateFrame'))
  expect(await page.evaluate(() => window.gameState.money)).toBeGreaterThanOrEqual(1234567)
  await expect(page.locator('#loadingScreen')).toHaveClass(/loading-screen--hidden/)

  await page.unroute('**/src/main.js')
  let releaseManualBoot
  const manualGate = new Promise(resolve => { releaseManualBoot = resolve })
  await page.route('**/src/main.js', async route => {
    await manualGate
    await route.continue()
  })
  await page.reload({ waitUntil: 'commit' })
  await expect(page.locator('#gameUpdateFrame')).toHaveCount(0)
  await expect(page.locator('#loadingScreen')).toBeVisible()
  releaseManualBoot()
})
