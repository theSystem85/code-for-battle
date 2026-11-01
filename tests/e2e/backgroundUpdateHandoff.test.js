import { expect, test } from '@playwright/test'

test('[E00238] downloads while playing, preserves the paused battlefield across restart, restores the save, and leaves manual reload loading intact', async({ page }) => {
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
  await expect(page.locator('#loadingScreen')).toHaveClass(/loading-screen--hidden/)
  // Installed browsers may classify an app-triggered update navigation as a
  // reload. A valid one-use frame must still preserve the battlefield.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('cfb-update-frame')) return
    const entries = performance.getEntriesByType.bind(performance)
    performance.getEntriesByType = type => type === 'navigation' ? [{ type: 'reload' }] : entries(type)
  })
  await page.evaluate(async() => {
    const [{ createLiveUpdater }, { prepareRunningGameUpdate }] = await Promise.all([
      import('/src/pwa/liveUpdate.js'), import('/src/pwa/updateHandoff.js')
    ])
    const download = new Promise(resolve => { window.__finishUpdateDownload = resolve })
    const { setSeamlessUpdateEnabled } = await import('/src/pwa/seamlessUpdateSettings.js')
    setSeamlessUpdateEnabled(true)
    window.__updateSaved = false
    window.__updater = createLiveUpdater({ seamlessEnabled: () => true,
      getGameState: () => window.gameState,
      stageUpdate: () => download,
      activateServiceWorker: async() => {},
      prepareReload: async info => {
        await prepareRunningGameUpdate(info)
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

test('[E00239] preserves the paused view after a startup error and recovers the saved battle through ordinary reload', async({ page }) => {
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
  await expect(page.locator('#loadingScreen')).toHaveClass(/loading-screen--hidden/)
  await page.route('**/src/main.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export async function initializeApp() { throw new Error("Simulated updated startup failure") }'
  }))
  await page.evaluate(async() => {
    const [{ createLiveUpdater }, { prepareRunningGameUpdate }, { setSeamlessUpdateEnabled }] = await Promise.all([
      import('/src/pwa/liveUpdate.js'), import('/src/pwa/updateHandoff.js'), import('/src/pwa/seamlessUpdateSettings.js')
    ])
    setSeamlessUpdateEnabled(true)
    window.gameState.money = 7654321
    const updater = createLiveUpdater({
      getGameState: () => window.gameState,
      stageUpdate: async() => {}, activateServiceWorker: async() => {},
      prepareReload: prepareRunningGameUpdate
    })
    void updater.applyBreakingUpdate({ commit: 'ccccccc', version: '0.65.1' })
  })
  await page.waitForURL(/cfb-update=ccccccc/)
  await expect(page.locator('#gameUpdateRecovery')).toBeVisible()
  await expect(page.locator('#gameUpdateFrame img').first()).toBeVisible()
  await page.unroute('**/src/main.js')
  await page.getByRole('button', { name: 'Reload normally', exact: true }).click()
  await page.waitForFunction(() => window.gameState?.gameStarted && !window.gameState.gamePaused && !document.getElementById('gameUpdateFrame'))
  await expect(page.locator('#loadingScreen')).toHaveClass(/loading-screen--hidden/)
  expect(new URL(page.url()).searchParams.has('cfb-update')).toBe(false)
  expect(await page.evaluate(() => window.gameState.money)).toBeGreaterThanOrEqual(7654321)
})

test('[E00245] restores a running match seamlessly when full-resolution snapshots exceed the session-storage budget', async({ page }) => {
  await page.goto('/?seed=43&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
  await page.evaluate(() => {
    const original = window.Storage.prototype.setItem
    window.Storage.prototype.setItem = function(key, value) {
      if (key === 'cfb-update-frame') {
        const meta = JSON.parse(this.getItem('cfb-update-frame-test-meta') || '{"attempts":0,"bytes":0}')
        meta.attempts += 1
        meta.bytes = value.length
        original.call(this, 'cfb-update-frame-test-meta', JSON.stringify(meta))
        if (value.length > 60_000) throw new DOMException('Snapshot quota exceeded', 'QuotaExceededError')
      }
      return original.call(this, key, value)
    }
  })
  await page.evaluate(async() => {
    const [{ createLiveUpdater }, { prepareRunningGameUpdate }, { setSeamlessUpdateEnabled }] = await Promise.all([
      import('/src/pwa/liveUpdate.js'), import('/src/pwa/updateHandoff.js'), import('/src/pwa/seamlessUpdateSettings.js')
    ])
    // prepareRunningGameUpdate reads the stored setting, not the updater option.
    setSeamlessUpdateEnabled(true)
    window.gameState.money = 2468135
    const updater = createLiveUpdater({
      seamlessEnabled: () => true,
      getGameState: () => window.gameState,
      stageUpdate: async() => {},
      activateServiceWorker: async() => {},
      prepareReload: prepareRunningGameUpdate
    })
    await updater.applyBreakingUpdate({ commit: 'ddddddd', version: '0.65.2' })
  })
  await page.waitForURL(/cfb-update=ddddddd/)
  const meta = await page.evaluate(() => JSON.parse(sessionStorage.getItem('cfb-update-frame-test-meta') || 'null'))
  expect(meta?.attempts).toBeGreaterThan(1)
  expect(meta?.bytes).toBeLessThanOrEqual(60_000)
  await page.waitForFunction(() => window.gameState?.gameStarted && !window.gameState.gamePaused && !document.getElementById('gameUpdateFrame'))
  expect(await page.evaluate(() => window.gameState.money)).toBeGreaterThanOrEqual(2468135)
  await expect(page.locator('#loadingScreen')).toHaveClass(/loading-screen--hidden/)
})
