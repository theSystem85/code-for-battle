import { expect, test, devices } from '@playwright/test'

for (const phone of [false, true]) {
  test(`input chooser shows visual mappings, persists preference and continues the tutorial on ${phone ? 'phone' : 'desktop'}`, async({ browser }) => {
    const context = await browser.newContext(phone ? { ...devices['iPhone 13'] } : {})
    const page = await context.newPage()
    try {
      await page.addInitScript(() => {
        if (!sessionStorage.getItem('input-guide-seeded')) {
          localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: true, speechEnabled: false }))
          localStorage.removeItem('rts_tutorial_progress')
          sessionStorage.setItem('input-guide-seeded', 'true')
        }
      })
      await page.goto('/?seed=41&size=64&players=2&oreFields=8')
      await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
      const guide = page.getByRole('region', { name: 'Choose your input method', exact: true })
      await expect(guide).toBeVisible()
      await expect(page.locator('.tutorial-title')).toHaveText('Choose your controls')
      const next = page.locator('[data-tutorial-action="next"]')
      await expect(next).toBeDisabled()
      await expect(guide.locator('[data-input-method]')).toHaveCount(4)
      for (const method of ['touch', 'gamepad', 'trackpad', 'mouse-keyboard']) {
        const choice = guide.locator(`[data-input-method="${method}"]`)
        await choice.click()
        await expect(choice).toHaveAttribute('aria-pressed', 'true')
        await expect(next).toBeEnabled()
        await expect(guide.locator('.input-method-guide__mappings')).toBeVisible()
        expect(await choice.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
      }
      await guide.locator('[data-input-method="trackpad"]').click()
      await expect(guide).toContainText('Swipe between pages')
      await guide.getByRole('button', { name: 'Open control settings', exact: true }).click()
      await expect(page.locator('[data-config-tab="keybindings"]')).toHaveAttribute('aria-selected', 'true')
      await page.locator('#configModalCloseBtn').click()
      await guide.getByRole('button', { name: 'Refresh mappings', exact: true }).click()
      await page.reload()
      await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
      await expect(guide).toBeVisible()
      await expect(guide.locator('[data-input-method="trackpad"]')).toHaveAttribute('aria-pressed', 'true')
      await next.click()
      await expect(page.locator('.tutorial-title')).toHaveText('Welcome to the Command Briefing')
      await expect(guide).toBeHidden()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally { await context.close() }
  })
}
