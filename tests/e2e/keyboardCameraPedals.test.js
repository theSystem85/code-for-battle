import { expect, test } from '@playwright/test'

test('[E00056] arrow keys accelerate, auto-brake and expose live runtime Controls tuning', async({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
  })
  await page.goto('/?seed=41&size=96&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
  await page.keyboard.press('k')
  await page.getByRole('button', { name: 'Controls', exact: true }).click()
  await expect(page.locator('#config-keyboardScrollAcceleration')).toHaveValue('1200')
  await expect(page.locator('#config-keyboardScrollDeceleration')).toHaveValue('2400')
  await expect(page.locator('#config-keyboardScrollAutoBrake')).toHaveValue('1200')
  await expect(page.locator('#config-keyboardScrollSpeed')).toHaveValue('32')
  await page.locator('#config-keyboardScrollSpeed').fill('4')
  await page.locator('#config-keyboardScrollSpeed').dispatchEvent('change')
  await page.locator('#config-keyboardScrollAcceleration').fill('600')
  await page.locator('#config-keyboardScrollAcceleration').dispatchEvent('change')
  await page.locator('#runtime-config-close').click()
  await page.waitForFunction(() => !window.gameState.runtimeConfigDialogOpen)
  await page.evaluate(() => {
    const state = window.gameState
    state.gamePaused = true
    state.scrollOffset.x = 500
    state.scrollOffset.y = 500
    state.dragVelocity.x = 0
    state.dragVelocity.y = 0
    state.smoothScroll.active = false
    window.selectedUnitsRef.length = 0
  })
  await page.keyboard.down('ArrowRight')
  await expect.poll(() => page.evaluate(() => Math.abs(window.gameState.dragVelocity.x))).toBeGreaterThan(0)
  const slow = await page.evaluate(() => Math.abs(window.gameState.dragVelocity.x))
  expect(slow).toBeLessThan(4)
  await expect.poll(() => page.evaluate(() => Math.abs(window.gameState.dragVelocity.x))).toBeGreaterThan(slow)
  await expect.poll(() => page.evaluate(() => Math.abs(window.gameState.dragVelocity.x))).toBe(4)
  await page.keyboard.up('ArrowRight')
  const releasedAt = await page.evaluate(() => ({ at: performance.now(), x: window.gameState.scrollOffset.x }))
  await expect.poll(() => page.evaluate(() => window.gameState.dragVelocity.x), { intervals: [16, 16, 32, 32] }).toBe(0)
  const stopped = await page.evaluate(() => ({ at: performance.now(), x: window.gameState.scrollOffset.x }))
  expect(stopped.at - releasedAt.at).toBeLessThan(500)
  expect(stopped.x - releasedAt.x).toBeLessThan(65)
})
