import { test, expect } from '@playwright/test'

async function loadReadyGame(page) {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })

  await page.goto('/?seed=11')
  await page.waitForSelector('#gameCanvas', { state: 'visible' })
  await page.waitForFunction(() => window.gameState?.gameStarted === true)
  await page.evaluate(() => {
    window.gameState.gamePaused = false
  })
}

test.describe('Game speed control', () => {
  test('updates simulation rate from the sidebar input without freezing render cadence', async({ page }) => {
    await loadReadyGame(page)

    const speedInput = page.locator('#speedMultiplier')
    await expect(speedInput).toBeVisible()

    const baseline = await page.evaluate(async() => {
      const startGameTime = window.gameState.gameTime
      const startFrames = window.gameState.frameCount
      await new Promise(resolve => setTimeout(resolve, 1200))
      return {
        gameTimeDelta: window.gameState.gameTime - startGameTime,
        frameDelta: window.gameState.frameCount - startFrames
      }
    })

    await speedInput.fill('2')
    await speedInput.dispatchEvent('input')

    const boosted = await page.evaluate(async() => {
      const startGameTime = window.gameState.gameTime
      const startFrames = window.gameState.frameCount
      await new Promise(resolve => setTimeout(resolve, 1200))
      return {
        speedMultiplier: window.gameState.speedMultiplier,
        gameTimeDelta: window.gameState.gameTime - startGameTime,
        frameDelta: window.gameState.frameCount - startFrames
      }
    })

    expect(boosted.speedMultiplier).toBe(2)
    expect(boosted.gameTimeDelta).toBeGreaterThan(baseline.gameTimeDelta * 1.6)
    expect(boosted.frameDelta).toBeGreaterThan(0)
    expect(Math.abs(boosted.frameDelta - baseline.frameDelta)).toBeLessThan(Math.max(20, baseline.frameDelta * 0.35))
  })
})
