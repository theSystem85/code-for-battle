import { test, expect } from '@playwright/test'

const PARTY_EXPECTATIONS = [
  { owner: 'player1', spawn: 'green', rgb: [0, 255, 0] },
  { owner: 'player2', spawn: 'red', rgb: [255, 0, 0] },
  { owner: 'player3', spawn: 'blue', rgb: [0, 128, 255] },
  { owner: 'player4', spawn: 'yellow', rgb: [255, 255, 0] }
]

test.describe('Unit party association circle', () => {
  test('renders a semi-transparent party-colored circle at the center of each party unit', async({ page }) => {
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
      gs.scrollOffset = { x: 0, y: 0 }
      gs.gamePaused = false
      gs.enemyAiEnabled = false
      if (window.cheatSystem) {
        window.cheatSystem.processCheatCode('godmode on')
      }

      const baseTileX = 14
      const baseTileY = 14
      const spacing = 4
      const spawnOrder = ['green', 'red', 'blue', 'yellow']

      spawnOrder.forEach((party, index) => {
        const tileX = baseTileX + index * spacing
        const tileY = baseTileY
        gs.cursorX = tileX * 32 + 16
        gs.cursorY = tileY * 32 + 16
        window.cheatSystem.processCheatCode(`tank_v1 1 ${party}`)
      })
    })

    await page.waitForTimeout(300)

    const sampleData = await page.evaluate(() => {
      const canvas = document.getElementById('gameCanvas')
      const ctx = canvas?.getContext('2d', { willReadFrequently: true })
      if (!canvas || !ctx) return null

      const unitSamples = []
      const parties = ['player1', 'player2', 'player3', 'player4']
      const units = window.units || []
      const scroll = window.gameState?.scrollOffset || { x: 0, y: 0 }

      for (const owner of parties) {
        const unit = units.find(candidate => candidate.owner === owner && candidate.type === 'tank_v1')
        if (!unit) continue

        const cx = Math.round(unit.x + 16 - scroll.x)
        const cy = Math.round(unit.y + 16 - scroll.y)

        const pixels = []
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -2; dy <= 2; dy++) {
            pixels.push(Array.from(ctx.getImageData(cx + dx, cy + dy, 1, 1).data))
          }
        }

        unitSamples.push({ owner, pixels })
      }

      return unitSamples
    })

    expect(sampleData).not.toBeNull()
    expect(sampleData.length).toBe(4)

    for (const expectation of PARTY_EXPECTATIONS) {
      const partySample = sampleData.find(sample => sample.owner === expectation.owner)
      expect(partySample, `missing sample for ${expectation.owner}`).toBeTruthy()

      const hasPartyTint = partySample.pixels.some(pixel => {
        const [r, g, b, a] = pixel
        if (a < 200) return false

        const [pr, pg, pb] = expectation.rgb
        const dominantThreshold = 20

        if (pr > pg && pr > pb) {
          return r >= Math.max(g, b) + dominantThreshold
        }
        if (pg > pr && pg > pb) {
          return g >= Math.max(r, b) + dominantThreshold
        }
        if (pb > pr && pb > pg) {
          return b >= Math.max(r, g) + dominantThreshold
        }

        return r >= 120 && g >= 120
      })

      expect(hasPartyTint, `expected visible party-colored center circle for ${expectation.owner}`).toBe(true)
    }
  })
})
