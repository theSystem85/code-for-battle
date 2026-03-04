import { test, expect } from '@playwright/test'

test.describe('Sidebar floating label inputs', () => {
  test('renders floating labels for sidebar text/number inputs and removes legacy join label', async({ page }) => {
    await page.goto('/')

    await page.waitForSelector('#sidebar', { state: 'visible' })
    await page.click('#mapSettingsToggle')
    await expect(page.locator('#mapSettingsContent')).toBeVisible()

    await expect(page.locator('.multiplayer-join-label')).toHaveCount(0)

    const floatingWrappers = page.locator('#sidebar .floating-label-input')
    await expect(floatingWrappers).toHaveCount(8)

    await expect(page.locator('#saveLabelInput + label')).toHaveText('Save label')
    await expect(page.locator('#inviteLinkInput + label')).toHaveText('Join via invite link')
    await expect(page.locator('#speedMultiplier + label')).toHaveText('Game Speed')
    await expect(page.locator('#mapSeed + label')).toHaveText('Seed')
    await expect(page.locator('#playerCount + label')).toHaveText('Players')
    await expect(page.locator('#playerAliasInput + label')).toHaveText('Your alias')
    await expect(page.locator('#mapWidthTiles + label')).toHaveText('Width')
    await expect(page.locator('#mapHeightTiles + label')).toHaveText('Height')
  })
})
