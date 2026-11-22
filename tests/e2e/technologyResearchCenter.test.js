import { expect, test } from '@playwright/test'
import { waitForLoadingScreenHidden } from './helpers/loadingScreen.js'

test('[E00273] research cards update when the player buys a blueprint branch', async({ page }) => {
  test.setTimeout(180000)
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=11')
  await page.waitForFunction(() => window.gameInstance?.eventHandlers && window.gameInstance?.gameLoop)
  await waitForLoadingScreenHidden(page)
  const card = page.locator('[data-research-blueprint="droneFactory"]')
  await expect(card).toBeHidden()
  await page.evaluate(() => {
    const state = window.gameState
    const yard = state.buildings.find(building => building.owner === state.humanPlayer && building.type === 'constructionYard')
    const center = { ...yard, id: 'research-fixture', type: 'technologyResearchCenter', health: 500, maxHealth: 500, constructionFinished: true }
    state.buildings.push(center)
    state.perks.owners[state.humanPlayer] = { earned: 5, spent: 0, owned: [], log: [] }
    window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length, center)
    window.gameInstance.productionController.updateBuildingButtonStates()
  })
  await expect(card).toContainText('Research Autonomous Systems')
  await page.locator('#technologyResearchPerksBtn').click()
  await expect(page.getByRole('heading', { name: 'Research Perks' })).toBeVisible()
  for (const id of ['tc.foundation', 'tc.autonomy']) {
    const node = page.locator(`[data-perk-id="${id}"]`)
    await node.click()
    const buy = node.locator('.perk-buy')
    await buy.click()
    await buy.click()
    await expect(node).toHaveClass(/is-owned/)
  }
  await page.getByRole('button', { name: 'Close perk tree' }).click()
  await expect(card).toContainText('Researched')
  await expect(card).toHaveAttribute('aria-disabled', 'true')
})
