import { test, expect } from '@playwright/test'

test.describe('Enemy F22 airstrike behavior', () => {
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

  test('enemy F22 acquires a human target and starts takeoff to attack', async({ page }) => {
    test.setTimeout(120000)

    await page.goto('/?seed=13')
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

      gs.cursorX = 24 * 32
      gs.cursorY = 24 * 32
      window.cheatSystem.processCheatCode(`build airstrip ${enemyPlayer}`)
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${enemyPlayer}`)
      window.cheatSystem.processCheatCode(`tank_v1 1 ${humanPlayer}`)

      const spawned = units.filter(u => !knownUnitIds.has(u.id))
      const enemyF22 = spawned.find(u => u.type === 'f22Raptor' && u.owner === enemyPlayer)
      const humanTank = spawned.find(u => u.type === 'tank_v1' && u.owner === humanPlayer)

      if (!enemyF22 || !humanTank) {
        return { error: 'Failed to spawn enemy F22 and human target tank' }
      }

      enemyF22.lastDecisionTime = 0
      enemyF22.lastTargetChangeTime = 0
      enemyF22.target = null
      enemyF22.allowedToAttack = false

      humanTank.x = 28 * 32
      humanTank.y = 24 * 32
      humanTank.tileX = Math.floor(humanTank.x / 32)
      humanTank.tileY = Math.floor(humanTank.y / 32)
      humanTank.path = []
      humanTank.moveTarget = null

      window.__enemyF22AirstrikeE2E = {
        enemyF22Id: enemyF22.id,
        humanPlayer,
        enemyPlayer
      }

      return { ok: true }
    })

    expect(setup.error || null).toBeNull()

    const resultHandle = await page.waitForFunction(() => {
      const tracker = window.__enemyF22AirstrikeE2E
      if (!tracker) return false

      const units = window.gameInstance?.units || []
      const enemyF22 = units.find(u => u.id === tracker.enemyF22Id)
      if (!enemyF22 || enemyF22.health <= 0) return false

      const hasEnemyTarget = Boolean(
        enemyF22.target &&
        enemyF22.target.owner === tracker.humanPlayer &&
        enemyF22.target.health > 0
      )

      const progressingToAttack = Boolean(
        enemyF22.f22PendingTakeoff ||
        enemyF22.f22State === 'wait_takeoff_clearance' ||
        enemyF22.f22State === 'taxi_to_runway_start' ||
        enemyF22.f22State === 'takeoff_roll' ||
        enemyF22.f22State === 'liftoff' ||
        enemyF22.flightState === 'airborne'
      )

      if (!hasEnemyTarget || !progressingToAttack || enemyF22.allowedToAttack !== true) {
        return false
      }

      return {
        targetOwner: enemyF22.target?.owner || null,
        targetType: enemyF22.target?.type || null,
        allowedToAttack: enemyF22.allowedToAttack === true,
        pendingTakeoff: Boolean(enemyF22.f22PendingTakeoff),
        f22State: enemyF22.f22State || null,
        flightState: enemyF22.flightState || null
      }
    }, { timeout: 30000 })

    const result = await resultHandle.jsonValue()

    expect(result.targetOwner).toBeTruthy()
    expect(result.allowedToAttack).toBe(true)
    expect(result.targetType).toBeTruthy()
    expect(
      result.pendingTakeoff ||
      result.f22State === 'wait_takeoff_clearance' ||
      result.f22State === 'taxi_to_runway_start' ||
      result.f22State === 'takeoff_roll' ||
      result.f22State === 'liftoff' ||
      result.flightState === 'airborne'
    ).toBe(true)

    expect(consoleErrors, `Console errors encountered:\n${consoleErrors.join('\n')}`).toEqual([])
  })
})
