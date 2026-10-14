import { expect, test } from '@playwright/test'

test('available update stays in the sidebar immediately before Online/Offline', async({ page }) => {
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
  await page.evaluate(async() => {
    const { applyOfflineModeDom, offlineModeCopy } = await import('/src/pwa/offlineController.js')
    applyOfflineModeDom({ updatePrompt: document.getElementById('offlineUpdatePrompt') }, {
      ...offlineModeCopy('en'), updateAvailable: true
    })
  })
  const prompt = page.locator('#offlineUpdatePrompt')
  await expect(prompt).toBeVisible()
  await expect(page.locator('#sidebarStatusRow > #offlineUpdatePrompt + #offlineModeButton')).toHaveCount(1)
  await expect(page.locator('#offlineUpdateReload')).toHaveCount(1)
  const bounds = await page.locator('#offlineUpdateReload').boundingBox()
  const offline = await page.locator('#offlineModeButton').boundingBox()
  const sidebar = await page.locator('#sidebar').boundingBox()
  expect(bounds.x).toBeGreaterThanOrEqual(sidebar.x)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(offline.x)
  expect(bounds.y).toBeGreaterThanOrEqual(sidebar.y)
  expect(await prompt.evaluate(element => window.getComputedStyle(element).position)).toBe('static')
})
