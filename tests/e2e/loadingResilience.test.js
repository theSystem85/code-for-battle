import { test, expect } from '@playwright/test'

async function expectPlayable(page) {
  await page.goto('/')
  await expect(page.locator('#loadingScreen')).toHaveClass(/loading-screen--hidden/, { timeout: 90000 })
  await expect(page.locator('#loadingScreenPercent')).toHaveText('100%')
  await expect.poll(() => page.evaluate(() => window.gameState?.gameStarted)).toBe(true)
  await expect(page.locator('#gameCanvas')).toBeVisible()
  if (await page.evaluate(() => window.gameState.gamePaused)) await page.locator('#pauseBtn').click()
  const first = await page.evaluate(() => window.gameState.frameCount)
  await expect.poll(() => page.evaluate(() => window.gameState.frameCount)).toBeGreaterThan(first)
}

for (const failure of ['normal', 'aborted image', 'missing metadata', 'hanging image', 'stale settings']) {
  test(`[E00059] loading reaches playable with ${failure}`, async({ page }) => {
    await page.addInitScript(() => localStorage.setItem('cfb-story-intro-v1', 'seen'))
    if (failure === 'aborted image') {
      await page.route('**/images/map/water_spritesheet.webp', route => route.abort())
    }
    if (failure === 'missing metadata') {
      await page.route('**/images/map/sprite_sheets/debris_craters_tracks.json', route => route.fulfill({ status: 404, body: 'missing' }))
    }
    if (failure === 'hanging image') {
      await page.route('**/images/map/water_spritesheet.webp', () => new Promise(() => {}))
    }
    if (failure === 'stale settings') {
      await page.goto('/offline-probe.txt')
      await page.evaluate(async() => {
        const settings = {
          'rts-integrated-spritesheet-mode': 'true',
          'rts-integrated-spritesheet-selected-sheets': JSON.stringify(['images/map/sprite_sheets/removed.webp']),
          'rts-sse-applied-metadata': '{invalid json',
          'rts-sse-last-sheet': 'blob:expired',
          'rts-map-width-tiles': 'NaN',
          'rts_graphics_settings': JSON.stringify({ rendererBackendChoice: 'retired-renderer', mobileCanvasPixelRatioCap: 'NaN' })
        }
        for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value)
        await new Promise((resolve, reject) => {
          const request = globalThis.indexedDB.open('code-for-battle-storage', 1)
          request.onupgradeneeded = () => request.result.createObjectStore('keyValue', { keyPath: 'key' })
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result
            const transaction = db.transaction('keyValue', 'readwrite')
            for (const [key, value] of Object.entries(settings)) transaction.objectStore('keyValue').put({ key, value })
            transaction.oncomplete = () => { db.close(); resolve() }
            transaction.onerror = () => reject(transaction.error)
          }
        })
      })
    }
    await expectPlayable(page)
  })
}
