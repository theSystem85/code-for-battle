import { expect, test } from '@playwright/test'
import { waitForLoadingScreenHidden } from './helpers/loadingScreen.js'

test('[E00277] stars flyout stays visible above the build controls', async({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=11')
  await page.waitForFunction(() => window.gameInstance?.gameLoop)
  await waitForLoadingScreenHidden(page)
  const skip = page.getByRole('button', { name: 'Skip tutorial', exact: true })
  if (await skip.isVisible()) await skip.click()
  await page.evaluate(() => {
    const state = window.gameState
    const yard = state.buildings.find(building => building.owner === state.humanPlayer && building.type === 'constructionYard')
    state.buildings.push({ ...yard, id: 'flyout-command', type: 'commandCenter', health: 500, constructionFinished: true })
    state.buildings.push({ ...yard, id: 'flyout-research', type: 'technologyResearchCenter', health: 500, constructionFinished: true })
  })
  const chip = page.locator('#perkStarChip')
  const menu = page.locator('#perkStarMenu')
  await chip.click()
  await expect(menu).toBeVisible()
  const chipBox = await chip.boundingBox()
  const menuBox = await menu.boundingBox()
  expect(menuBox.x).toBeGreaterThanOrEqual(chipBox.x + chipBox.width)
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(page.viewportSize().width)
  const automation = menu.getByRole('button', { name: 'Automation perks' })
  const research = menu.getByRole('button', { name: 'Tech center perks' })
  await expect(automation).toBeVisible()
  await expect(research).toBeVisible()
  expect(await automation.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2))
  })).toBe(true)
  await automation.click()
  await expect(page.getByRole('heading', { name: 'Automation Perks' })).toBeVisible()
})
