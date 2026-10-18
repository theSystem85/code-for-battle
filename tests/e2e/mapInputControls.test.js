import { expect, test, devices } from '@playwright/test'

async function startGame(page) {
  await page.addInitScript(() => {
    localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('rts_tutorial_progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
}

test('[E00066] map wheel movement consumes diagonal and boundary gestures while sidebar scrolling stays separate', async({ page }) => {
  await startGame(page)
  const url = page.url()
  await page.evaluate(() => {
    const state = window.gameState
    state.gamePaused = true
    state.scrollOffset.x = 300
    state.scrollOffset.y = 300
    state.dragVelocity.x = 0
    state.dragVelocity.y = 0
    state.smoothScroll.active = false
  })
  const canvas = page.locator('#gameCanvas')
  await canvas.hover({ position: { x: 300, y: 300 } })
  await page.mouse.wheel(47, 63)
  await expect.poll(() => page.evaluate(() => ({ ...window.gameState.scrollOffset }))).toEqual({ x: 347, y: 363 })
  await page.keyboard.down('Shift')
  await page.mouse.wheel(0, 35)
  await page.keyboard.up('Shift')
  await expect.poll(() => page.evaluate(() => window.gameState.scrollOffset.x)).toBe(382)
  await page.mouse.wheel(-10000, -10000)
  await expect.poll(() => page.evaluate(() => ({ ...window.gameState.scrollOffset }))).toEqual({ x: 0, y: 0 })
  await page.mouse.wheel(-10000, 0)
  expect(page.url()).toBe(url)
  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({ x: 0, y: 0 })
  const outside = await page.locator('#sidebar').evaluate(element => {
    const event = new window.WheelEvent('wheel', { deltaX: 30, deltaY: 50, bubbles: true, cancelable: true })
    element.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(outside).toBe(false)
})

test('[E00067] secondary drag still pans without adding a pan action button', async({ page }) => {
  await startGame(page)
  await expect(page.locator('#mapPanBtn')).toHaveCount(0)
  await page.evaluate(() => {
    window.gameState.gamePaused = true
    window.gameState.scrollOffset.x = 300
    window.gameState.scrollOffset.y = 300
    window.gameState.dragVelocity.x = 0
    window.gameState.dragVelocity.y = 0
    window.gameState.smoothScroll.active = false
  })
  const rect = await page.locator('#gameCanvas').boundingBox()
  await page.mouse.move(rect.x + 300, rect.y + 300)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(rect.x + 220, rect.y + 240, { steps: 5 })
  await page.mouse.up({ button: 'right' })
  const offset = await page.evaluate(() => ({ ...window.gameState.scrollOffset }))
  expect(offset.x).toBeGreaterThan(300)
  expect(offset.y).toBeGreaterThan(300)
})

test('[E00068] a touch tap sells a selected vehicle factory without changing its rally point or double refund', async({ browser }) => {
  const context = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await context.newPage()
  try {
    await startGame(page)
    await page.evaluate(async() => { (await import('/src/saveGame.js')).loadGame('builtin:demo') })
    await page.waitForFunction(() => window.gameState?.currentSessionId === 'demo' && document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'))
    const initial = await page.evaluate(async() => {
      const { gameState: state } = await import('/src/gameState.js')
      const { selectedUnits } = await import('/src/inputHandler.js')
      const { TILE_SIZE } = await import('/src/config.js')
      const { getPlayableViewportWidth, getPlayableViewportHeight } = await import('/src/utils/layoutMetrics.js')
      state.gamePaused = true
      state.buildingPlacementMode = false
      state.smoothScroll.active = false
      state.dragVelocity.x = 0
      state.dragVelocity.y = 0
      const building = state.buildings.find(item => item.owner === state.humanPlayer && item.type === 'vehicleFactory')
      if (!building) throw new Error('Demo requires an owned vehicle factory')
      building.constructionFinished = true
      selectedUnits.length = 0
      selectedUnits.push(building)
      building.selected = true
      window.touchSaleBuilding = building
      const canvas = document.getElementById('gameCanvas')
      const centerX = (building.x + building.width / 2) * TILE_SIZE
      const centerY = (building.y + building.height / 2) * TILE_SIZE
      state.scrollOffset.x = Math.max(0, centerX - getPlayableViewportWidth(canvas) / 2)
      state.scrollOffset.y = Math.max(0, centerY - getPlayableViewportHeight(canvas) / 2)
      return { money: state.money, rally: building.rallyPoint || null }
    })
    await page.locator('#sellBtn').tap()
    const point = await page.evaluate(async() => {
      const { TILE_SIZE } = await import('/src/config.js')
      const building = window.touchSaleBuilding
      const rect = document.getElementById('gameCanvas').getBoundingClientRect()
      return { x: rect.left + (building.x + building.width / 2) * TILE_SIZE - window.gameState.scrollOffset.x,
        y: rect.top + (building.y + building.height / 2) * TILE_SIZE - window.gameState.scrollOffset.y }
    })
    await page.touchscreen.tap(point.x, point.y)
    const outcome = await page.evaluate(async() => {
      const { buildingCosts } = await import('/src/main.js')
      return { selling: window.touchSaleBuilding.isBeingSold, rally: window.touchSaleBuilding.rallyPoint || null,
        refund: window.gameState.money, expectedRefund: Math.floor(buildingCosts.vehicleFactory * 0.7) }
    })
    expect(outcome.selling).toBe(true)
    expect(outcome.rally).toEqual(initial.rally)
    expect(outcome.refund - initial.money).toBe(outcome.expectedRefund)
  } finally { await context.close() }
})

test('[E00069] Controls inversion reverses two-finger touch panning', async({ browser }) => {
  const context = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await context.newPage()
  try {
    await startGame(page)
    const cdp = await context.newCDPSession(page)
    async function pan() {
      await page.evaluate(() => {
        const state = window.gameState
        state.gamePaused = true
        state.scrollOffset.x = 500
        state.scrollOffset.y = 500
        state.dragVelocity.x = 0
        state.dragVelocity.y = 0
        state.smoothScroll.active = false
      })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 230 }, { x: 210, y: 230 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: 260 }, { x: 240, y: 260 }] })
      const offset = await page.evaluate(() => ({ ...window.gameState.scrollOffset }))
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.evaluate(() => { window.gameState.dragVelocity.x = 0; window.gameState.dragVelocity.y = 0 })
      return offset
    }
    const normal = await pan()
    expect(normal.x).toBeLessThan(500)
    expect(normal.y).toBeLessThan(500)
    await page.keyboard.press('k')
    await page.getByRole('button', { name: 'Controls', exact: true }).click()
    await page.locator('#config-invertTouchMapScroll').check()
    await page.locator('#runtime-config-close').click()
    const inverted = await pan()
    expect(inverted.x).toBeGreaterThan(500)
    expect(inverted.y).toBeGreaterThan(500)
  } finally { await context.close() }
})
