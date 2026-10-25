import { expect, test } from '@playwright/test'

async function startAt(page, stepId) {
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.tutorialSystem)
  await page.evaluate(id => {
    const t = window.tutorialSystem
    t.settings.showTutorial = true
    t.settings.speechEnabled = false
    t.settings.preferredInputMethod = 'mouse-keyboard'
    t.active = true
    t.stepIndex = t.steps.findIndex(step => step.id === id)
    t.progress.completed = false
    t.showUI()
    t.runCurrentStep()
  }, stepId)
}

test('[E00230] guides building without clicking and waits for the player and narration', async({ page }) => {
  await startAt(page, 'build-power')
  const before = await page.evaluate(async() => {
    const { productionQueue } = await import('/src/productionQueue.js')
    return { buildings: window.gameState.buildings.length, queued: productionQueue.buildingItems.length }
  })
  await expect(page.locator('#tutorialCursor')).toHaveAttribute('data-instruction', 'Click here!')
  expect(await page.evaluate(async() => {
    const { productionQueue } = await import('/src/productionQueue.js')
    return { buildings: window.gameState.buildings.length, queued: productionQueue.buildingItems.length }
  })).toEqual(before)
  const button = page.locator('.production-button[data-building-type="powerPlant"]')
  const rect = await button.boundingBox()
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 4)
  await expect.poll(() => page.evaluate(async queuedBefore => {
    const { productionQueue } = await import('/src/productionQueue.js')
    // Construction can finish before this poll resolves on a busy browser.
    // A ready blueprint is also evidence that the player's click queued it.
    const ready = document.querySelector('.production-button[data-building-type="powerPlant"]')?.classList.contains('ready-for-placement')
    return productionQueue.buildingItems.length > queuedBefore || ready || window.gameState.currentBuildingType === 'powerPlant'
  }, before.queued)).toBe(true)
  await expect(page.locator('.tutorial-title')).toHaveText('Build a Power Plant')
  // Finish a real player construction while the simulated narration is busy.
  await page.evaluate(() => { window.tutorialSystem.speaking = true })
  await page.waitForFunction(() => {
    const button = document.querySelector('.production-button[data-building-type="powerPlant"]')
    return window.gameState.currentBuildingType === 'powerPlant' || button.classList.contains('ready-for-placement')
  })
  if (!await page.evaluate(() => window.gameState.buildingPlacementMode)) {
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 4)
  }
  await expect.poll(() => page.evaluate(() => parseFloat(window.tutorialSystem.cursor.style.left))).not.toBe(rect.x + rect.width / 2)
  await expect(page.locator('#tutorialCursor')).toHaveAttribute('data-instruction', 'Click here!')
  const placement = await page.evaluate(() => ({
    x: parseFloat(window.tutorialSystem.cursor.style.left), y: parseFloat(window.tutorialSystem.cursor.style.top)
  }))
  await page.mouse.click(placement.x, placement.y)
  await expect.poll(() => page.evaluate(() => window.gameState.buildings.length)).toBeGreaterThan(before.buildings)
  await expect(page.locator('.tutorial-title')).toHaveText('Build a Power Plant')
  await expect(page.locator('[data-tutorial-action="next"]')).toBeDisabled()
  await page.evaluate(() => { window.tutorialSystem.speaking = false })
  await expect(page.locator('.tutorial-title')).toHaveText('Build an Ore Refinery')
})

test('[E00231] links to the naval tech tree and only grants tutorial money on request', async({ page }) => {
  await startAt(page, 'tech-tree')
  await page.evaluate(() => { window.gameState.money = 0 })
  const grant = page.getByRole('button', { name: 'Get $20,000 for the tutorial' })
  await expect(grant).toBeVisible()
  expect(await page.evaluate(() => window.gameState.money)).toBe(0)
  await grant.click()
  expect(await page.evaluate(() => window.gameState.money)).toBe(20000)
  await page.getByRole('link', { name: 'Open the Tech Tree in the User Manual', exact: true }).click()
  await expect(page.locator('#userDocsFrame')).toHaveAttribute('src', '/docs/user-documentation.html#tech-tree')
  const tree = page.frameLocator('#userDocsFrame').locator('#tech-tree')
  await expect(tree).toContainText('Naval Mine Layer')
  await expect(tree).toContainText('Supply Ship')
  await expect(tree).toContainText('Aircraft Carrier')
})

test('[E00232] shows map imagery while dragging a production unit and clears it on release', async({ page }) => {
  await startAt(page, 'input-method')
  const unit = page.locator('.production-button[data-unit-type="tank"]')
  await page.evaluate(async() => {
    const tutorial = window.tutorialSystem
    tutorial.skipping = true
    try { await tutorial.demoBuildBuilding('vehicleFactory') } finally { tutorial.skipping = false }
  })
  await page.locator('[data-tutorial-action="minimize"]').click()
  await page.locator('.tab-button[data-tab="units"]').click()
  await expect(unit).toBeVisible()
  const button = await unit.boundingBox()
  const canvas = await page.locator('#gameCanvas').boundingBox()
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 4)
  await page.mouse.down()
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 12 })
  await expect(page.locator('#unitDragPreview')).toBeVisible()
  await expect(page.locator('#unitDragPreview div:not([hidden]) img').first()).toHaveAttribute('src', '/images/map/units/tankV1_wagon.webp')
  await page.mouse.up()
  await expect(page.locator('#unitDragPreview')).toBeHidden()
})

test('[E00233] Shift-drag adds another tank without replacing the current selection or issuing an attack group order', async({ page }) => {
  await startAt(page, 'input-method')
  await page.locator('[data-tutorial-action="minimize"]').click()
  const point = await page.evaluate(async() => {
    const state = window.gameState
    const units = window.gameInstance.units
    const existing = new Set(units.map(unit => unit.id))
    state.cursorX = state.scrollOffset.x + 300
    state.cursorY = state.scrollOffset.y + 200
    window.cheatSystem.processCheatCode(`tank_v1 2 ${state.humanPlayer}`)
    const tanks = units.filter(unit => !existing.has(unit.id))
    if (tanks.length !== 2) throw new Error('Expected two real tanks for selection test')
    const { selectedUnits } = await import('/src/inputHandler.js')
    selectedUnits.forEach(unit => { unit.selected = false })
    selectedUnits.splice(0, selectedUnits.length, tanks[0])
    tanks[0].selected = true
    const canvas = document.getElementById('gameCanvas').getBoundingClientRect()
    return {
      first: tanks[0].id, second: tanks[1].id,
      x: canvas.left + tanks[1].x + 16 - state.scrollOffset.x,
      y: canvas.top + tanks[1].y + 16 - state.scrollOffset.y
    }
  })
  await page.keyboard.down('Shift')
  await page.mouse.move(point.x - 22, point.y - 22)
  await page.mouse.down()
  await page.mouse.move(point.x + 22, point.y + 22, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  expect(await page.evaluate(async() => {
    const { selectedUnits } = await import('/src/inputHandler.js')
    return selectedUnits.map(unit => unit.id)
  })).toEqual(expect.arrayContaining([point.first, point.second]))
  expect(await page.evaluate(() => window.gameState.attackGroupMode)).toBe(false)
})
