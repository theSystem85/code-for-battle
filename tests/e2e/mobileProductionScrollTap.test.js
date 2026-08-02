import { test, expect, devices } from '@playwright/test'

const iphoneLandscape = { ...devices['iPhone 13 Pro Max landscape'] }
delete iphoneLandscape.defaultBrowserType
test.use({ ...iphoneLandscape, storageState: undefined })

test('scrolling the mobile unit build bar does not activate a unit on release', async({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=11')
  await page.waitForFunction(() => window.gameState?.gameStarted)

  await page.evaluate(() => {
    window.gameState.gamePaused = false
    window.gameState.money = 100000
    window.gameState.buildings.push({
      id: 'mobile-e2e-factory', type: 'vehicleFactory', owner: window.gameState.humanPlayer,
      health: 300, maxHealth: 300, x: 10, y: 10, width: 3, height: 3
    })

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'))
    document.getElementById('unitsTabContent')?.classList.add('active')
    document.querySelectorAll('.production-button[data-unit-type]').forEach(button => {
      button.classList.add('unlocked')
      button.classList.remove('disabled', 'active', 'paused')
    })
  })

  const buildMenu = page.locator('#mobileBuildMenuContainer')
  const production = page.locator('#mobileBuildMenuContainer #production')
  const tankButton = page.locator('#mobileBuildMenuContainer .production-button[data-unit-type="tank"]')
  await expect(buildMenu).toHaveAttribute('aria-hidden', 'false')
  await expect(tankButton).toBeVisible()

  const box = await tankButton.boundingBox()
  if (!box) throw new Error('Tank production button has no touch target')

  const client = await context.newCDPSession(page)
  const x = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: startY, id: 1 }]
  })
  for (const distance of [15, 35, 60]) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: startY - distance, id: 1 }]
    })
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

  await expect.poll(() => production.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await expect(tankButton).not.toHaveClass(/active/)
  await expect(tankButton.locator('.batch-counter')).toBeHidden()

  await production.evaluate(element => { element.scrollTop = 0 })
  await page.waitForTimeout(550)
  const tapBox = await tankButton.boundingBox()
  if (!tapBox) throw new Error('Tank production button has no tap target after scrolling')
  const tapX = tapBox.x + tapBox.width / 2
  const tapY = tapBox.y + tapBox.height / 2
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: tapX, y: tapY, id: 2 }]
  })
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: tapX + 4, y: tapY, id: 2 }]
  })
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(tankButton).toHaveClass(/active/)
})
