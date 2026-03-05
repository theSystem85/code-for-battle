import { test, expect } from '@playwright/test'

test.describe('Enemy harvester stuck rescan', () => {
  /** @type {string[]} */
  let consoleErrors = []

  test.beforeEach(async({ page }) => {
    consoleErrors = []

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    page.on('pageerror', error => {
      consoleErrors.push(`Page error: ${error.message}`)
    })

    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })
  })

  test('enemy AI rescans every 60s and reassigns stuck harvester ore tile', async({ page }) => {
    test.setTimeout(120000)

    await page.goto('/?seed=17')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      return Boolean(gs?.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units)
    }, { timeout: 30000 })

    const setup = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const humanPlayer = gs.humanPlayer || 'player1'
      const enemyPlayer = humanPlayer === 'player1' ? 'player2' : 'player1'
      const knownUnitIds = new Set(units.map(u => u.id))

      gs.cursorX = 40 * 32
      gs.cursorY = 40 * 32
      window.cheatSystem.processCheatCode(`harvester 1 ${enemyPlayer}`)

      const spawnedHarvester = units.find(u => !knownUnitIds.has(u.id) && u.type === 'harvester' && u.owner === enemyPlayer)
      if (!spawnedHarvester) {
        return { error: 'Failed to spawn enemy harvester' }
      }

      const originTile = { x: 40, y: 40 }
      const alternateTile = { x: 43, y: 40 }
      gs.mapGrid[originTile.y][originTile.x].ore = true
      gs.mapGrid[alternateTile.y][alternateTile.x].ore = true

      spawnedHarvester.x = originTile.x * 32
      spawnedHarvester.y = originTile.y * 32
      spawnedHarvester.tileX = originTile.x
      spawnedHarvester.tileY = originTile.y
      // Simulate a truly idle stuck harvester: no active path and no move target
      spawnedHarvester.path = []
      spawnedHarvester.moveTarget = null
      spawnedHarvester.oreField = { x: originTile.x, y: originTile.y }
      spawnedHarvester.oreCarried = 0
      spawnedHarvester.harvesting = false
      spawnedHarvester.unloadingAtRefinery = false
      spawnedHarvester.lastEnemyAiHarvesterStuckSample = {
        x: spawnedHarvester.x,
        y: spawnedHarvester.y,
        time: performance.now() - 61000
      }

      const stuckScanKey = `${enemyPlayer}LastHarvesterStuckScanTime`
      gs[stuckScanKey] = performance.now() - 61000
      gs.targetedOreTiles[`${originTile.x},${originTile.y}`] = spawnedHarvester.id

      window.__enemyHarvesterStuckE2E = {
        enemyPlayer,
        harvesterId: spawnedHarvester.id,
        originalOreKey: `${originTile.x},${originTile.y}`,
        alternateOreKey: `${alternateTile.x},${alternateTile.y}`
      }

      return { ok: true }
    })

    expect(setup.error || null).toBeNull()

    const resultHandle = await page.waitForFunction(() => {
      const tracker = window.__enemyHarvesterStuckE2E
      if (!tracker) return false
      const harvester = (window.gameInstance?.units || []).find(u => u.id === tracker.harvesterId)
      if (!harvester || !harvester.oreField) return false

      const currentOreKey = `${harvester.oreField.x},${harvester.oreField.y}`
      if (currentOreKey === tracker.originalOreKey) return false

      return {
        currentOreKey,
        switchedToAlternate: currentOreKey === tracker.alternateOreKey,
        hasPath: Array.isArray(harvester.path) && harvester.path.length > 0,
        targetedBySelf: window.gameState?.targetedOreTiles?.[currentOreKey] === harvester.id
      }
    }, { timeout: 45000 })

    const result = await resultHandle.jsonValue()

    expect(result.currentOreKey).not.toBe('40,40')
    expect(result.switchedToAlternate).toBe(true)
    expect(result.hasPath).toBe(true)
    expect(result.targetedBySelf).toBe(true)
    expect(consoleErrors, `Console errors encountered:\n${consoleErrors.join('\n')}`).toEqual([])
  })
})
