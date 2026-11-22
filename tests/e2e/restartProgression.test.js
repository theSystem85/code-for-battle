import { expect, test } from '@playwright/test'

test('[E00276] restarting clears production progress and earned perks', async({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
  await expect(page.locator('#loadingScreen')).toBeHidden()

  const result = await page.evaluate(async() => {
    const { adjustPerkStars, applyPerkPurchase } = await import('/src/perks/perkState.js')
    const { productionQueue } = await import('/src/productionQueue.js')
    const { gameState, gameInstance } = window
    gameState.gamePaused = true
    const owner = gameState.humanPlayer
    for (const type of ['commandCenter', 'technologyResearchCenter', 'radarStation', 'vehicleFactory', 'shipyard', 'helipad']) {
      gameState.buildings.push({ type, owner, health: 100 })
    }
    gameInstance.productionController.syncTechTreeWithBuildings()
    gameInstance.productionController.unlockUnitType('tank-v3', true)
    adjustPerkStars(owner, 100)
    const purchases = ['cc.unit.start', 'tc.foundation', 'tc.autonomy'].map(id => applyPerkPurchase(owner, id).ok)
    productionQueue.restoreFromSerializableState({
      pausedUnit: true,
      unitItems: [{ type: 'tank' }],
      currentUnit: { type: 'tank', progress: 0.5, duration: 1000 },
      completedBuildings: [{ type: 'powerPlant' }],
      unitProductionLanes: {
        air: { unitItems: [{ type: 'apache' }] },
        naval: { unitItems: [{ type: 'destroyer' }] }
      }
    })
    gameInstance.productionController.activateTab('units', { scrollIntoView: false })
    return purchases
  })
  expect(result).toEqual([true, true, true])

  const tank = page.locator('[data-unit-type="tank"]')
  const powerPlant = page.locator('[data-building-type="powerPlant"]')
  const buildingsTab = page.locator('#productionTabs [data-tab="buildings"]')
  const stars = page.locator('#perkStarChip')
  await expect(tank).toHaveClass(/unlocked/)
  await expect(tank).toHaveClass(/paused/)
  await expect(page.locator('[data-unit-type="tank-v3"] .new-label')).toBeVisible()
  await expect(page.locator('[data-building-type="droneFactory"]')).toHaveClass(/unlocked/)
  await expect(powerPlant).toHaveClass(/ready-for-placement/)
  await expect(buildingsTab).toHaveClass(/has-ready-buildings/)
  await expect(stars).not.toHaveText('★ 0')

  await page.locator('#restartBtn').click()
  await expect(stars).toHaveText('★ 0')
  await expect(page.locator('#loadingScreen')).toBeHidden()
  await expect(tank).not.toHaveClass(/unlocked|paused|active/)
  await expect(page.locator('[data-unit-type="tank-v3"] .new-label')).toBeHidden()
  await expect(page.locator('[data-building-type="droneFactory"]')).not.toHaveClass(/unlocked/)
  await expect(buildingsTab).toHaveClass(/\bactive\b/)
  await expect(buildingsTab).not.toHaveClass(/has-ready-buildings/)
  await expect(powerPlant).toBeVisible()
  await expect(powerPlant).not.toHaveClass(/ready-for-placement/)

  const progression = await page.evaluate(async() => {
    const { getPerkLedger, ownsPerk } = await import('/src/perks/perkState.js')
    const { productionQueue } = await import('/src/productionQueue.js')
    const owner = window.gameState.humanPlayer
    return {
      ledger: getPerkLedger(owner),
      automationUnlocked: ownsPerk(owner, 'cc.unit.start'),
      availableUnits: [...window.gameState.availableUnitTypes],
      streetAvailable: window.gameState.availableBuildingTypes.has('street'),
      currentUnit: productionQueue.currentUnit,
      airQueueLength: productionQueue.unitQueues.air.unitItems.length,
      navalQueueLength: productionQueue.unitQueues.naval.unitItems.length
    }
  })
  expect(progression).toEqual({
    ledger: { earned: 0, spent: 0, available: 0, owned: [] },
    automationUnlocked: false,
    availableUnits: [],
    streetAvailable: true,
    currentUnit: null,
    airQueueLength: 0,
    navalQueueLength: 0
  })
})
