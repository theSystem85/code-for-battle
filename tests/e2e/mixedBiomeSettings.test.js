import { test, expect } from '@playwright/test'

// Sidebar map settings regenerate only through the Apply button (spec 136).
async function applyMapSettings(page) {
  const button = page.locator('#mapSettingsApplyBtn')
  // fill() does not commit a number input; fire its change event first.
  await page.evaluate(() => document.activeElement?.dispatchEvent(new Event('change', { bubbles: true })))
  await expect(button).toBeEnabled({ timeout: 3000 }).catch(() => {})
  if (!(await button.isEnabled())) return
  await button.click()
  // The button disables itself once the regenerated map is applied.
  await expect(button).toBeDisabled({ timeout: 60000 })
}

test('[E00070] mixed biome controls regenerate the map on Apply', async({ page }) => {
  await page.goto('/?seed=41&size=64')
  await page.waitForFunction(() => window.gameInstance && window.gameState?.mapGrid?.length === 64)
  expect(await page.evaluate(() => {
    const { activeSpriteSheetBiomeTag, mapBiomeRegionCount, mapBiomeWeights, mapShoreNorth,
      mapShoreWest, mapShoreEast, mapShoreSouth, mapCenterLake, mapWaterPercent,
      mapRockPercent, citySeeds, cityClusterSize, ruinSeeds, ruinClusterSize } = window.gameState
    return { activeSpriteSheetBiomeTag, mapBiomeRegionCount, mapBiomeWeights, mapShoreNorth,
      mapShoreWest, mapShoreEast, mapShoreSouth, mapCenterLake, mapWaterPercent,
      mapRockPercent, citySeeds, cityClusterSize, ruinSeeds, ruinClusterSize }
  })).toEqual({
    activeSpriteSheetBiomeTag: 'mixed', mapBiomeRegionCount: 4,
    mapBiomeWeights: { grass: 25, soil: 25, sand: 25, snow: 25 },
    mapShoreNorth: true, mapShoreWest: true, mapShoreEast: true, mapShoreSouth: true,
    mapCenterLake: true, mapWaterPercent: 10, mapRockPercent: 10,
    citySeeds: 4, cityClusterSize: 8, ruinSeeds: 3, ruinClusterSize: 7
  })
  expect(await page.evaluate(async() => {
    const config = await import('/src/config.js')
    return [config.COASTAL_SHALLOWS_ENABLED, config.COASTAL_SHALLOWS_LENGTH]
  })).toEqual([true, 15])
  await page.locator('#mapSettingsToggle').click()

  await expect(page.locator('#integratedSpriteSheetBiomeSelect')).toHaveValue('mixed')
  await expect(page.locator('#mapBiomeRegionCount')).toHaveValue('4')
  for (const biome of ['Grass', 'Soil', 'Sand', 'Snow']) {
    await expect(page.locator(`#mapBiome${biome}Weight`)).toHaveValue('25')
  }

  await page.locator('#integratedSpriteSheetBiomeSelect').selectOption('mixed')
  await applyMapSettings(page)
  await page.waitForFunction(() => window.gameState?.activeSpriteSheetBiomeTag === 'mixed' && new Set(window.gameState.mapGrid.flat().map(tile => tile.biome)).size >= 3)

  await page.locator('#mapBiomeRegionCount').fill('8')
  await applyMapSettings(page)
  await page.waitForFunction(() => window.gameState?.mapBiomeRegionCount === 8)
  await page.locator('#mapBiomeDistribution').selectOption('vertical')
  await applyMapSettings(page)
  await page.waitForFunction(() => window.gameState?.mapBiomeDistribution === 'vertical')

  await page.evaluate(() => { window.__previousBiomeTile = window.gameState.mapGrid[10][10] })
  await page.locator('#mapBiomeSoilWeight').fill('0')
  await applyMapSettings(page)
  await page.waitForFunction(() => window.gameState?.mapBiomeWeights?.soil === 0)
  await expect.poll(() => page.evaluate(() => window.gameState.mapGrid.flat().some(tile => tile.biome === 'soil'))).toBe(false)
  expect(await page.evaluate(() => window.gameState.mapGrid[10][10] !== window.__previousBiomeTile)).toBe(true)

  await page.locator('#mapSnowOnPlateausCheckbox').uncheck()
  await applyMapSettings(page)
  await page.waitForFunction(() => window.gameState?.mapSnowOnPlateaus === false)
  await page.locator('#mapShorelineWidth').fill('4')
  await applyMapSettings(page)
  await page.waitForFunction(() => window.gameState?.mapShorelineWidth === 4)
})
