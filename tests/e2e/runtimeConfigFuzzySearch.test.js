import { test, expect } from '@playwright/test'

test.describe('Runtime config fuzzy search', () => {
  test.beforeEach(async({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })
    await page.goto('/')
    await page.waitForSelector('#gameCanvas', { state: 'visible' })
    await page.waitForSelector('#sidebar', { state: 'visible' })
    await page.waitForFunction(() => Boolean(window.gameState))
  })

  test('searches runtime variables by fuzzy name and edits values from search results', async({ page }) => {
    await page.click('#helpBtn')
    await page.click('[data-config-tab="runtime"]')
    await page.click('#openRuntimeConfigDialogBtn')

    const runtimeDialog = page.locator('#runtime-config-overlay')
    await expect(runtimeDialog).toBeVisible()

    const searchInput = page.locator('#runtime-config-search-input')
    await searchInput.fill('xpmult')

    const xpItem = page.locator('.runtime-config-item').filter({ hasText: 'XP Multiplier' })
    await expect(xpItem).toBeVisible()

    const xpInput = xpItem.locator('input[type="number"]')
    await xpInput.fill('1.5')
    await xpInput.blur()

    await expect(xpItem.locator('.runtime-config-item-value')).toHaveText('1.5')

    await searchInput.fill('999999-no-match')
    await expect(page.locator('.runtime-config-no-results')).toBeVisible()
  })
})
