import { test, expect } from '@playwright/test'

test.describe('Save game import/export from sidebar', () => {
  test('exports saves, supports multi-import without auto-load, and auto-loads single import', async({ page }, testInfo) => {
    await page.goto('/')
    await page.waitForSelector('#saveLoadMenu', { state: 'visible' })

    const uniqueSuffix = Date.now().toString().slice(-6)
    const saveLabelA = `Shareable Save A ${uniqueSuffix}`
    const saveLabelB = `Shareable Save B ${uniqueSuffix}`

    const createSave = async(label) => {
      await page.fill('#saveLabelInput', label)
      await page.click('#saveGameBtn')
      const row = page.locator('#saveGamesList > li', {
        has: page.locator('.save-game-label-button', { hasText: label })
      }).first()
      await expect(row).toBeVisible()
      return row
    }

    const saveRowA = await createSave(saveLabelA)
    const saveRowB = await createSave(saveLabelB)

    const downloadA = page.waitForEvent('download')
    await saveRowA.locator('button[aria-label="Export save game"]').click()
    const downloadedA = await downloadA
    expect(downloadedA.suggestedFilename()).toContain('Shareable_Save_A')
    const exportedPathA = testInfo.outputPath(`exported-save-a-${uniqueSuffix}.json`)
    await downloadedA.saveAs(exportedPathA)

    const downloadB = page.waitForEvent('download')
    await saveRowB.locator('button[aria-label="Export save game"]').click()
    const downloadedB = await downloadB
    expect(downloadedB.suggestedFilename()).toContain('Shareable_Save_B')
    const exportedPathB = testInfo.outputPath(`exported-save-b-${uniqueSuffix}.json`)
    await downloadedB.saveAs(exportedPathB)

    await saveRowA.locator('button[title="Delete save"]').click()
    await saveRowB.locator('button[title="Delete save"]').click()

    const deletedRowA = page.locator('#saveGamesList > li', {
      has: page.locator('.save-game-label-button', { hasText: saveLabelA })
    })
    const deletedRowB = page.locator('#saveGamesList > li', {
      has: page.locator('.save-game-label-button', { hasText: saveLabelB })
    })
    await expect(deletedRowA).toHaveCount(0)
    await expect(deletedRowB).toHaveCount(0)

    await page.setInputFiles('#importSaveInput', [exportedPathA, exportedPathB])

    const importedRowA = page.locator('#saveGamesList > li', {
      has: page.locator('.save-game-label-button', { hasText: saveLabelA })
    }).first()
    const importedRowB = page.locator('#saveGamesList > li', {
      has: page.locator('.save-game-label-button', { hasText: saveLabelB })
    }).first()
    await expect(importedRowA).toBeVisible()
    await expect(importedRowB).toBeVisible()
    await expect(page.getByText('Imported 2 save games')).toBeVisible()

    await importedRowA.locator('.save-game-label-button').click()
    await expect(page.getByText(`Game loaded: ${saveLabelA}`)).toBeVisible()

    await importedRowB.locator('button[title="Delete save"]').click()
    await expect(importedRowB).toHaveCount(0)

    await page.setInputFiles('#importSaveInput', exportedPathB)
    await expect(page.getByText(`Game loaded: ${saveLabelB}`)).toBeVisible()
  })
})
