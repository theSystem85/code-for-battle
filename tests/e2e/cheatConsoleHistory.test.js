import { test, expect } from '@playwright/test'

test.describe('Cheat console history navigation', () => {
  test.beforeEach(async({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
      localStorage.removeItem('rts-cheat-console-history')
      localStorage.setItem('rts-config-overrides', JSON.stringify({ CHEAT_CONSOLE_HISTORY_LIMIT: 3 }))
    })
  })

  test('ArrowUp/ArrowDown restore recent commands and persist capped history', async({ page }) => {
    await page.goto('/?seed=11')

    await page.waitForFunction(() => {
      const gs = window.gameState
      return Boolean(gs?.gameStarted && !gs?.gamePaused && window.cheatSystem)
    }, { timeout: 30000 })

    await page.keyboard.press('c')
    await page.waitForSelector('#cheat-input', { state: 'visible', timeout: 10000 })

    const input = page.locator('#cheat-input')
    await input.fill('status')
    await page.keyboard.press('Enter')
    await input.fill('give 999')
    await page.keyboard.press('Enter')
    await input.fill('godmode on')
    await page.keyboard.press('Enter')
    await input.fill('money 1')
    await page.keyboard.press('Enter')

    await input.fill('draft value')
    await page.keyboard.press('ArrowUp')
    await expect(input).toHaveValue('money 1')
    await page.keyboard.press('ArrowUp')
    await expect(input).toHaveValue('godmode on')
    await page.keyboard.press('ArrowUp')
    await expect(input).toHaveValue('give 999')

    await page.keyboard.press('ArrowDown')
    await expect(input).toHaveValue('godmode on')
    await page.keyboard.press('ArrowDown')
    await expect(input).toHaveValue('money 1')
    await page.keyboard.press('ArrowDown')
    await expect(input).toHaveValue('draft value')

    const storedHistory = await page.evaluate(() => JSON.parse(localStorage.getItem('rts-cheat-console-history') || '[]'))
    expect(storedHistory).toEqual(['give 999', 'godmode on', 'money 1'])
  })
})
