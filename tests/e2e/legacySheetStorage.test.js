import { test, expect } from '@playwright/test'

const DIR = 'images/map/sprite_sheets/'
const DEFAULT_SHEETS = ['debris_craters_tracks', 'dtv2_grass', 'dtv2_soil', 'dtv2_sand', 'dtv2_snow', 'dtv2_universal',
  'dtv3_ground_detail', 'dtv3_shore', 'dtv3_city', 'dtv3_winter', 'dtv4_city_sand', 'dtv4_city_snow', 'dtv4_nature_sand', 'dtv4_nature_snow']
const RETIRED = /seasons_1024|rocks_64x64|crystals_q90|streets24|rockCliffs/

for (const mode of ['true', 'false']) {
  test(`[E00057] old stored sheet selection (custom sheets ${mode}) still lists and renders every sheet`, async({ page }) => {
    await page.addInitScript((mode) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      const dir = 'images/map/sprite_sheets/'
      localStorage.setItem('rts-integrated-spritesheet-mode', mode)
      localStorage.setItem('rts-integrated-spritesheet-selected-sheets', JSON.stringify(
        ['streets24_q90_1024x1024', 'seasons_1024_q90_2', 'seasons_1024_q90_3', 'crystals_q90_1024x1024',
          'rockCliffsMountains_64x64_1024x1024', 'rocks_64x64_1024x1024_q85', 'debris_craters_tracks'].map(name => `${dir}${name}.webp`)))
      localStorage.setItem('rts-sse-last-sheet', `${dir}seasons_1024_q90_2.webp`)
      localStorage.setItem(`rts-sse-metadata:${dir}rocks_64x64_1024x1024_q85.webp`, '{"tiles":{}}')
    }, mode)
    // Simulate an index.json cached by an older deploy.
    await page.route('**/images/map/sprite_sheets/index.json', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ sheets: ['seasons_1024_q90_2', 'seasons_1024_q90_3', 'crystals_q90_1024x1024', 'rocks_64x64_1024x1024_q85', 'debris_craters_tracks'].map(name => `${DIR}${name}.webp`) })
    }))
    await page.goto('/?seed=23&size=96&players=2')
    await page.waitForFunction(() => window.gameState?.gameStarted)

    if (mode === 'false') {
      await page.click('#mapSettingsToggle')
      await page.check('#integratedSpriteSheetModeCheckbox')
    } else {
      await page.click('#mapSettingsToggle')
    }
    const expected = DEFAULT_SHEETS.map(name => `${DIR}${name}.webp`)
    await page.waitForFunction(async(expected) => {
      const { getTextureManager } = await import('/src/rendering.js')
      const loaded = (getTextureManager().integratedSpriteSheets || []).map(sheet => sheet.sheetPath)
      return expected.every(path => loaded.includes(path))
    }, expected, { timeout: 30000 })

    const listed = await page.$$eval('#integratedSpriteSheetSelectionList input', inputs => inputs.map(input => ({ path: input.dataset.sheetPath, checked: input.checked })))
    expect(listed.map(item => item.path)).toEqual(expect.arrayContaining(expected))
    expect(listed.every(item => item.checked)).toBe(true)
    expect(listed.some(item => RETIRED.test(item.path))).toBe(false)

    await page.click('#openSpriteSheetEditorBtn')
    await expect(page.locator('#spriteSheetEditorModal')).toHaveClass(/config-modal--open/)
    const sseSheets = await page.$$eval('#sseSheetSelect option', options => options.map(option => option.value))
    expect(sseSheets).toEqual(expect.arrayContaining(expected))
    expect(sseSheets.some(path => RETIRED.test(path))).toBe(false)
  })
}
