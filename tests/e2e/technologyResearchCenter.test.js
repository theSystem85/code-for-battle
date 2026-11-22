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
  const skipTutorial = page.getByRole('button', { name: 'Skip tutorial', exact: true })
  if (await skipTutorial.isVisible()) await skipTutorial.click()
  const card = page.locator('[data-research-blueprint="droneFactory"]')
  await expect(card).toBeHidden()
  const point = await page.evaluate(() => {
    const state = window.gameState
    const yard = state.buildings.find(building => building.owner === state.humanPlayer && building.type === 'constructionYard')
    const center = { ...yard, id: 'research-fixture', type: 'technologyResearchCenter', health: 500, maxHealth: 500, constructionFinished: true }
    state.buildings.push(center)
    state.perks.owners[state.humanPlayer] = { earned: 5, spent: 0, owned: [], log: [] }
    window.selectedUnitsRef.length = 0
    window.gameInstance.productionController.updateBuildingButtonStates()
    const worldX = (center.x + center.width / 2) * 32
    const worldY = (center.y + center.height / 2) * 32
    state.scrollOffset.x = Math.max(0, worldX - 250)
    state.scrollOffset.y = Math.max(0, worldY - 200)
    return { x: worldX - state.scrollOffset.x, y: worldY - state.scrollOffset.y }
  })
  await expect(card).toBeHidden()
  await expect(page.locator('#technologyResearchPerksBtn, #commandCenterPerksBtn')).toHaveCount(0)
  const openBuildingPerks = async label => {
    await page.locator('#gameCanvas').click({ button: 'right', position: point })
    const action = page.getByRole('button', { name: label, exact: true })
    await expect(action).toBeVisible()
    const coords = await action.evaluate(element => ({
      x: Number.parseFloat(element.style.getPropertyValue('--tx')),
      y: Number.parseFloat(element.style.getPropertyValue('--ty'))
    }))
    await page.mouse.click(coords.x, coords.y)
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible()
  }
  await openBuildingPerks('Research Perks')
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
  await expect(card.locator('img')).toHaveAttribute('src', /drone_factory_sidebar\.webp$/)
  await expect(page.locator('[data-research-blueprint="rocketLaunchBase"]')).toBeHidden()
  await page.evaluate(() => {
    window.gameState.buildings.find(building => building.id === 'research-fixture').type = 'commandCenter'
  })
  await openBuildingPerks('Automation Perks')
})
