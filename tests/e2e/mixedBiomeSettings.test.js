import { test, expect } from '@playwright/test'

test('mixed biome controls regenerate the map immediately', async({ page }) => {
  await page.goto('/?seed=41&size=64')
  await page.waitForFunction(() => window.gameInstance && window.gameState?.mapGrid?.length === 64)
  await page.locator('#mapSettingsToggle').click()

  await page.locator('#integratedSpriteSheetBiomeSelect').selectOption('mixed')
  await page.waitForFunction(() => window.gameState?.activeSpriteSheetBiomeTag === 'mixed' && new Set(window.gameState.mapGrid.flat().map(tile => tile.biome)).size >= 3)

  await page.locator('#mapBiomeRegionCount').fill('8')
  await page.waitForFunction(() => window.gameState?.mapBiomeRegionCount === 8)
  await page.locator('#mapBiomeDistribution').selectOption('vertical')
  await page.waitForFunction(() => window.gameState?.mapBiomeDistribution === 'vertical')

  await page.evaluate(() => { window.__previousBiomeTile = window.gameState.mapGrid[10][10] })
  await page.locator('#mapBiomeSoilWeight').fill('0')
  await page.waitForFunction(() => window.gameState?.mapBiomeWeights?.soil === 0)
  await expect.poll(() => page.evaluate(() => window.gameState.mapGrid.flat().some(tile => tile.biome === 'soil'))).toBe(false)
  expect(await page.evaluate(() => window.gameState.mapGrid[10][10] !== window.__previousBiomeTile)).toBe(true)

  await page.locator('#mapSnowOnPlateausCheckbox').uncheck()
  await page.waitForFunction(() => window.gameState?.mapSnowOnPlateaus === false)
  await page.locator('#mapShorelineWidth').fill('4')
  await page.waitForFunction(() => window.gameState?.mapShorelineWidth === 4)
})
