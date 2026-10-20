import { expect, test } from '@playwright/test'
import { waitForLoadingScreenHidden } from './helpers/loadingScreen.js'

test.beforeEach(async({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=11')
  await page.waitForFunction(() => window.gameInstance?.eventHandlers && window.gameInstance?.gameLoop)
  await waitForLoadingScreenHidden(page)
  await page.evaluate(async() => {
    const { productionQueue } = await import('/src/productionQueue.js')
    const { setProductionPlacementSetting } = await import('/src/ui/productionPlacementSettings.js')
    window.gameInstance.gameLoop.stop()
    const gs = window.gameState
    gs.gamePaused = false
    gs.money = 1000000
    gs.playerPowerSupply = 1000
    gs.buildingPlacementMode = false
    gs.currentBuildingType = null
    productionQueue.completedBuildings.length = 0
    productionQueue.buildingItems.length = 0
    productionQueue.currentBuilding = null
    productionQueue.stackedPlacementActive = false
    setProductionPlacementSetting('autoActivate', true)
    setProductionPlacementSetting('autoAdvance', true)
    window.__readyQueue = productionQueue
    window.__finishBuilding = type => {
      const button = document.querySelector(`[data-building-type="${type}"]`)
      button.classList.add('unlocked')
      button.classList.remove('disabled')
      productionQueue.addItem(type, button, true)
      productionQueue.completeCurrentBuildingProduction()
    }
  })
})

async function setPlacementOptions(page, activate, advance) {
  await page.evaluate(async() => {
    const { openSettingsModal } = await import('/src/ui/settingsModal.js')
    openSettingsModal('runtime')
  })
  await page.locator('#settingsAutoActivatePlacement').setChecked(activate)
  await page.locator('#settingsAutoAdvancePlacement').setChecked(advance)
  await page.locator('#configModalCloseBtn').click()
}

async function placeCurrentBuilding(page) {
  const point = await page.evaluate(async() => {
    const { canPlaceBuilding } = await import('/src/buildings.js')
    const gs = window.gameState
    for (let y = 1; y < gs.mapGrid.length - 4; y++) {
      for (let x = 10; x < gs.mapGrid[y].length - 4; x++) {
        if (!canPlaceBuilding(gs.currentBuildingType, x, y, gs.mapGrid, gs.units, gs.buildings, gs.factories, gs.humanPlayer)) continue
        gs.scrollOffset.x = Math.max(0, x * 32 - 500)
        gs.scrollOffset.y = Math.max(0, y * 32 - 300)
        return { x: x * 32 + 16 - gs.scrollOffset.x, y: y * 32 + 16 - gs.scrollOffset.y }
      }
    }
    throw new Error('No valid placement tile near the player base')
  })
  await page.locator('#gameCanvas').click({ position: point })
}

test('[E00214] defaults automatically enter placement and continue through different ready buildings', async({ page }) => {
  await page.evaluate(async() => {
    const { openSettingsModal } = await import('/src/ui/settingsModal.js')
    openSettingsModal('runtime')
  })
  await expect(page.locator('#settingsAutoActivatePlacement')).toBeChecked()
  await expect(page.locator('#settingsAutoAdvancePlacement')).toBeChecked()
  await page.locator('#configModalCloseBtn').click()
  await page.evaluate(() => window.__finishBuilding('powerPlant'))
  // Automatic placement must still allow queuing another unlocked build.
  await page.locator('[data-building-type="street"]').click({ position: { x: 20, y: 10 } })
  await expect.poll(() => page.evaluate(() => window.__readyQueue.currentBuilding?.type)).toBe('street')
  await page.evaluate(() => window.__readyQueue.completeCurrentBuildingProduction())
  await expect.poll(() => page.evaluate(() => window.gameState.currentBuildingType)).toBe('powerPlant')
  await expect(page.locator('[data-tab="buildings"]')).toHaveClass(/has-ready-buildings/)
  await expect(page.locator('[data-building-type="powerPlant"] > .production-ready-glow')).toHaveCSS('--ready-glow-width', '20px')
  await placeCurrentBuilding(page)
  await expect.poll(() => page.evaluate(() => window.gameState.currentBuildingType)).toBe('street')
  // One canvas click must consume exactly one ready building, despite the two canvas listeners.
  expect(await page.evaluate(() => window.__readyQueue.completedBuildings.length)).toBe(1)
  await placeCurrentBuilding(page)
  expect(await page.evaluate(() => window.gameState.buildingPlacementMode)).toBe(false)
  await expect(page.locator('[data-tab="buildings"]')).not.toHaveClass(/has-ready-buildings/)
})

test('[E00215] active Buildings tab explicitly chains ready buildings with both automatic options off', async({ page }) => {
  await setPlacementOptions(page, false, false)
  await page.evaluate(() => {
    window.__finishBuilding('powerPlant')
    window.__finishBuilding('oreRefinery')
  })
  expect(await page.evaluate(() => window.gameState.buildingPlacementMode)).toBe(false)
  const tab = page.locator('#productionTabs [data-tab="buildings"]')
  await expect(tab.locator('.production-ready-glow')).toHaveCSS('--ready-glow-width', '10px')
  await tab.click()
  await expect.poll(() => page.evaluate(() => window.gameState.currentBuildingType)).toBe('powerPlant')
  await placeCurrentBuilding(page)
  await expect.poll(() => page.evaluate(() => window.gameState.currentBuildingType)).toBe('oreRefinery')
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => window.gameState.buildingPlacementMode)).toBe(false)
  expect(await page.evaluate(() => window.__readyQueue.completedBuildings.length)).toBe(1)
  expect(await page.evaluate(() => window.__readyQueue.stackedPlacementActive)).toBe(false)
  await expect(tab).toHaveClass(/has-ready-buildings/)
})

test('[E00216] automatic entry and continuation can be disabled independently', async({ page }) => {
  // This case boots the whole game twice to verify persisted settings.
  test.setTimeout(180000)
  await setPlacementOptions(page, true, false)
  await page.evaluate(() => {
    window.__finishBuilding('powerPlant')
    window.__finishBuilding('oreRefinery')
  })
  await expect.poll(() => page.evaluate(() => window.gameState.currentBuildingType)).toBe('powerPlant')
  await placeCurrentBuilding(page)
  expect(await page.evaluate(() => window.gameState.buildingPlacementMode)).toBe(false)
  expect(await page.evaluate(() => window.__readyQueue.completedBuildings.length)).toBe(1)
  await page.reload()
  await page.waitForFunction(() => window.gameInstance?.eventHandlers)
  await waitForLoadingScreenHidden(page)
  await page.evaluate(async() => {
    const { openSettingsModal } = await import('/src/ui/settingsModal.js')
    openSettingsModal('runtime')
  })
  await expect(page.locator('#settingsAutoActivatePlacement')).toBeChecked()
  await expect(page.locator('#settingsAutoAdvancePlacement')).not.toBeChecked()
})

test('[E00217] active Units tab smoothly focuses produced units newest first and resets after a new completion', async({ page }) => {
  await page.evaluate(async() => {
    const { createUnit } = await import('/src/units.js')
    const { units } = await import('/src/main.js')
    const owner = window.gameState.humanPlayer
    const older = createUnit({ owner }, 'tank_v1', 20, 20)
    const newer = createUnit({ owner }, 'tank_v1', 40, 40)
    older.productionCompletedAt = 10
    newer.productionCompletedAt = 20
    units.push(older, newer)
    window.__focusUnits = [older, newer]
    window.gameInstance.productionController.initProductionTabs()
    window.gameInstance.productionController.initProductionTabs()
    document.querySelector('[data-tab="units"]').classList.remove('disabled')
  })
  const tab = page.locator('#productionTabs [data-tab="units"]')
  await tab.click() // Open the tab first.
  await tab.click()
  expect(await page.evaluate(() => window.__focusUnits[1].selected)).toBe(true)
  expect(await page.evaluate(() => window.gameState.smoothScroll.active)).toBe(true)
  await tab.click()
  expect(await page.evaluate(() => window.__focusUnits[0].selected)).toBe(true)
  await page.evaluate(async() => {
    const { createUnit } = await import('/src/units.js')
    const { units } = await import('/src/main.js')
    const latest = createUnit({ owner: window.gameState.humanPlayer }, 'tank_v1', 50, 50)
    latest.productionCompletedAt = 30
    units.push(latest)
    window.__latestFocusUnit = latest
  })
  await tab.click()
  expect(await page.evaluate(() => window.__latestFocusUnit.selected)).toBe(true)
})
