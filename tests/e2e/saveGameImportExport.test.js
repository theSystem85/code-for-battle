import { test, expect } from '@playwright/test'

test.describe('Save game import/export from sidebar', () => {
  test('exports a save as JSON, imports it back from disk, and loads from clickable label', async({ page }, testInfo) => {
    await page.goto('/')
    await page.waitForSelector('#saveLoadMenu', { state: 'visible' })

    const uniqueSuffix = Date.now().toString().slice(-6)
    const saveLabel = `Shareable Save ${uniqueSuffix}`

    await page.fill('#saveLabelInput', saveLabel)
    await page.click('#saveGameBtn')

    const saveRow = page.locator('#saveGamesList > li', {
      has: page.locator('.save-game-label-button', { hasText: saveLabel })
    }).first()
    await expect(saveRow).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await saveRow.locator('button[aria-label="Export save game"]').click()
    const download = await downloadPromise

    const suggestedName = download.suggestedFilename()
    expect(suggestedName).toContain('Shareable_Save')
    expect(suggestedName).toContain('.json')

    const exportedPath = testInfo.outputPath(`exported-save-${uniqueSuffix}.json`)
    await download.saveAs(exportedPath)

    const deleteBtn = saveRow.locator('button[title="Delete save"]')
    await deleteBtn.click()
    await expect(saveRow).toHaveCount(0)

    await page.setInputFiles('#importSaveInput', exportedPath)

    const importedRow = page.locator('#saveGamesList > li', {
      has: page.locator('.save-game-label-button', { hasText: saveLabel })
    }).first()
    await expect(importedRow).toBeVisible()

    await importedRow.locator('.save-game-label-button').click()
    await expect(importedRow).toBeVisible()
  })
})
