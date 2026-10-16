import { test, expect } from '@playwright/test'

test('persisted optional sheets apply before the startup map is generated', async({ page }) => {
  const missingSheets = []
  page.on('response', response => {
    if (response.status() === 404 && response.url().includes('/sprite_sheets/')) {
      missingSheets.push(response.url())
    }
  })
  await page.addInitScript(() => {
    const names = [
      'dtv2_grass', 'dtv2_soil', 'dtv2_sand', 'dtv2_snow', 'dtv2_universal',
      'dtv3_city', 'dtv3_shore', 'dtv3_ground_detail',
      'unknown_stale_sheet'
    ]
    localStorage.setItem('rts-integrated-spritesheet-mode', 'true')
    localStorage.setItem('rts-integrated-spritesheet-selected-sheets',
      JSON.stringify(names.map(name => `images/map/sprite_sheets/${name}.webp`)))
  })
  await page.goto('/?seed=23&size=96&players=2')
  await page.waitForFunction(() => window.gameState?.gameStarted)
  const result = await page.evaluate(async() => {
    const { gameState } = await import('/src/gameState.js')
    const { getTextureManager } = await import('/src/rendering.js')
    const { getCityBuildings } = await import('/src/game/cityBuildings.js')
    const manager = getTextureManager()
    return {
      enabled: manager.integratedSpriteSheetMode,
      sheets: manager.integratedSpriteSheets.map(sheet => sheet.sheetPath),
      cities: getCityBuildings(gameState.mapGrid).length
    }
  })
  expect(result.enabled).toBe(true)
  expect(result.sheets).toContain('images/map/sprite_sheets/dtv3_city.webp')
  expect(result.cities).toBeGreaterThan(0)
  expect(missingSheets).toEqual([])
})
