import { expect, test } from '@playwright/test'

test('[E00200] a CSS-only deploy swaps styles without reloading or losing game state', async({ page }) => {
  const oldBuild = {
    version: '0.63.0',
    commit: 'eaefa6e',
    stateSchemaVersion: 1,
    jsSignature: 'same-js',
    css: { 'html:0': '/assets/live-update-old.css' }
  }
  const newBuild = {
    ...oldBuild,
    version: '0.63.1',
    commit: '6956c8f',
    update: { kind: 'safe', reason: '' },
    css: { 'html:0': '/assets/live-update-new.css' }
  }
  let currentBuild = oldBuild

  await page.route('**/build-info.json?*', route => route.fulfill({
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify(currentBuild)
  }))
  await page.route('**/assets/live-update-old.css', route => route.fulfill({
    contentType: 'text/css',
    body: '#live-update-probe { font-size: 10px; }'
  }))
  await page.route('**/assets/live-update-new.css', route => route.fulfill({
    contentType: 'text/css',
    body: '#live-update-probe { font-size: 12px; }'
  }))
  await page.goto('/')
  await page.evaluate(async old => {
    document.head.querySelectorAll('link[rel="stylesheet"]').forEach(link => link.remove())
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = old.css['html:0']
    document.head.appendChild(link)
    const probe = document.createElement('div')
    probe.id = 'live-update-probe'
    document.body.appendChild(probe)
    window.__liveUpdateGameState = { credits: 4321, selectedUnits: ['tank-1'] }
    window.__liveUpdateReloaded = false
    window.addEventListener('beforeunload', () => { window.__liveUpdateReloaded = true })
    const { createLiveUpdater } = await import('/src/pwa/liveUpdate.js')
    window.__liveUpdater = createLiveUpdater({
      getGameState: () => window.__liveUpdateGameState,
      reload: () => { window.__liveUpdateReloaded = true },
      running: { version: old.version, commit: old.commit },
      runningSchema: old.stateSchemaVersion
    })
    await window.__liveUpdater.check()
  }, oldBuild)

  await expect(page.locator('#live-update-probe')).toHaveCSS('font-size', '10px')
  currentBuild = newBuild
  expect(await page.evaluate(() => window.__liveUpdater.check())).toBe('safe')
  await expect(page.locator('#live-update-probe')).toHaveCSS('font-size', '12px')
  await expect(page.locator('link[data-live-update]')).toHaveAttribute('href', '/assets/live-update-new.css')
  expect(await page.evaluate(() => ({ state: window.__liveUpdateGameState, reloaded: window.__liveUpdateReloaded }))).toEqual({
    state: { credits: 4321, selectedUnits: ['tank-1'] },
    reloaded: false
  })
})
