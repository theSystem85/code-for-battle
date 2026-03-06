import { expect, test } from '@playwright/test'

test.describe('World-space water rendering', () => {
  test('renders continuous water with deterministic shoreline foam mask', async({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=11')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      if (!gs) return false
      if (gs.gameStarted && gs.gamePaused) gs.gamePaused = false
      return gs.gameStarted && !gs.gamePaused
    }, { timeout: 30000 })

    await page.evaluate(() => {
      const gs = window.gameState
      const width = 40
      const height = 30
      const grid = Array.from({ length: height }, (_, y) => {
        return Array.from({ length: width }, (_, x) => {
          const onOuterLandBorder = x < 3 || y < 3 || x > width - 4 || y > height - 4
          const island = x >= 18 && x <= 21 && y >= 12 && y <= 15
          const isWater = !(onOuterLandBorder || island)
          return {
            type: isWater ? 'water' : 'land',
            isWater,
            waterVariant: isWater ? 'default' : null,
            ore: false,
            seedCrystal: false
          }
        })
      })
      gs.mapGrid = grid
      gs.scrollOffset = { x: 0, y: 0 }
      gs.waterRenderConfig = {
        ...(gs.waterRenderConfig || {}),
        shorelineDebugOverlay: false,
        showFoam: true,
        distortionStrength: 0.1
      }
    })

    await page.waitForFunction(() => {
      const info = window.gameState?.waterDebugInfo
      return Boolean(info && info.waterTileCount > 0 && info.shoreTileCount > 0)
    })

    const firstStats = await page.evaluate(() => window.gameState?.waterDebugInfo)

    await page.evaluate(() => {
      window.gameState.scrollOffset = { x: 320, y: 224 }
    })

    await page.waitForTimeout(250)

    const secondStats = await page.evaluate(() => window.gameState?.waterDebugInfo)

    expect(firstStats.waterTileCount).toBeGreaterThan(100)
    expect(firstStats.shoreTileCount).toBeGreaterThan(0)
    expect(firstStats.shoreTileCount).toBeLessThan(firstStats.waterTileCount)

    expect(secondStats.waterTileCount).toBeGreaterThan(100)
    expect(secondStats.shoreTileCount).toBeGreaterThan(0)
    expect(secondStats.shoreTileCount).toBeLessThan(secondStats.waterTileCount)

    expect(firstStats.config.waterTextureScale).toBe(secondStats.config.waterTextureScale)
    expect(firstStats.config.layerASpeed.x).toBe(secondStats.config.layerASpeed.x)
  })
})
