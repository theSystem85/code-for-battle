import { test, expect } from '@playwright/test'

test.describe('Multiplayer sidebar defeated state', () => {
  test('shows Defeated status when a party is defeated', async({ page }) => {
    await page.goto('/')

    await page.waitForSelector('#multiplayerPartyList', { state: 'visible' })

    const player2Status = page.locator('[data-testid="multiplayer-party-status-player2"]')

    await expect(player2Status).not.toHaveText('Defeated')

    await page.evaluate(() => {
      window.gameState.defeatedPlayers = new Set(['player2'])
    })

    await expect(player2Status).toHaveText('Defeated')
    await expect(player2Status).toHaveClass(/defeated/)
  })
})
