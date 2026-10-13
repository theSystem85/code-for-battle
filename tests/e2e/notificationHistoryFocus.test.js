import { expect, test } from '@playwright/test'

test('expired attack notification history focuses the original unit with mouse or keyboard', async({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
  await page.evaluate(async() => { (await import('/src/saveGame.js')).loadGame('builtin:demo') })
  await page.waitForFunction(() => window.gameState?.currentSessionId === 'demo' && document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'))
  await page.evaluate(async() => {
    const { gameState } = await import('/src/gameState.js')
    const { handleAttackNotification, resetAttackNotifications } = await import('/src/game/attackNotifications.js')
    gameState.gamePaused = true
    gameState.smoothScroll = null
    const unit = gameState.units.find(item => item.owner === gameState.humanPlayer && item.type === 'harvester' && item.health > 0)
    if (!unit) throw new Error('Demo requires an owned harvester')
    window.historyFocusUnit = unit
    resetAttackNotifications()
    handleAttackNotification(unit, { owner: 'enemy' }, 70000)
  })
  await page.locator('.notification__inline-link').click()
  const originalFocus = await page.evaluate(async() => {
    const { gameState } = await import('/src/gameState.js')
    const { selectedUnits } = await import('/src/inputHandler.js')
    return { ids: selectedUnits.map(unit => unit.id), scroll: { ...gameState.scrollOffset } }
  })
  expect(originalFocus.ids).toEqual([await page.evaluate(() => window.historyFocusUnit.id)])
  await expect(page.locator('.notification')).toHaveCount(0, { timeout: 7000 })
  await page.evaluate(async() => {
    const { showNotification } = await import('/src/ui/notifications.js')
    showNotification('Plain history message')
  })
  await page.getByRole('button', { name: 'Notification history', exact: true }).click()
  const row = page.locator('.notif-history__item').filter({ hasText: 'Harvester is under attack!' })
  await expect(row).toHaveAttribute('type', 'button')
  await expect(page.locator('.notif-history__item').filter({ hasText: 'Plain history message' })).not.toHaveAttribute('type', 'button')
  for (const activation of ['click', 'Enter', 'Space']) {
    await page.evaluate(async() => {
      const { gameState } = await import('/src/gameState.js')
      const { selectedUnits } = await import('/src/inputHandler.js')
      selectedUnits.length = 0
      window.historyFocusUnit.selected = false
      gameState.scrollOffset.x = 0
      gameState.scrollOffset.y = 0
    })
    if (activation === 'click') await row.locator('.notif-history__time').click()
    else { await row.focus(); await row.press(activation) }
    expect(await page.evaluate(async() => {
      const { gameState } = await import('/src/gameState.js')
      const { selectedUnits } = await import('/src/inputHandler.js')
      return { ids: selectedUnits.map(unit => unit.id), scroll: { ...gameState.scrollOffset } }
    })).toEqual(originalFocus)
  }
})
