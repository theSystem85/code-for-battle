import { test, expect } from '@playwright/test'

test.describe('Help shortcut routing', () => {
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

  test('pressing i opens settings modal on keybindings tab and never shows legacy help overlay', async({ page }) => {
    await page.keyboard.press('i')

    const settingsModal = page.locator('#configSettingsModal')
    await expect(settingsModal).toHaveClass(/config-modal--open/)
    await expect(settingsModal).toHaveAttribute('aria-hidden', 'false')
    await expect(page.locator('[data-config-tab="keybindings"]')).toHaveClass(/config-modal__tab--active/)
    await expect(page.locator('#helpOverlay')).toHaveCount(0)
  })

  test('clicking sidebar info button opens settings modal on keybindings tab', async({ page }) => {
    await page.click('#helpBtn')

    const settingsModal = page.locator('#configSettingsModal')
    await expect(settingsModal).toHaveClass(/config-modal--open/)
    await expect(page.locator('[data-config-tab="keybindings"]')).toHaveClass(/config-modal__tab--active/)
    await expect(page.locator('#helpOverlay')).toHaveCount(0)
  })
})
