import { test, expect } from '@playwright/test'

test.describe('Enemy air-target eligibility', () => {
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

  test('enemy non-rocket ground units drop airborne Apache/F22 targets while rocket units keep valid air targets', async({ page }) => {
    test.setTimeout(120000)

    await page.goto('/?seed=11')
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
      window.cheatSystem.processCheatCode(`apache 1 ${humanPlayer}`)
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${humanPlayer}`)
      window.cheatSystem.processCheatCode(`tank_v1 1 ${enemyPlayer}`)
      window.cheatSystem.processCheatCode(`rocketTank 1 ${enemyPlayer}`)

      const spawned = units.filter(u => !knownUnitIds.has(u.id))
      const apache = spawned.find(u => u.type === 'apache' && u.owner === humanPlayer)
      const f22 = spawned.find(u => u.type === 'f22Raptor' && u.owner === humanPlayer)
      const enemyTank = spawned.find(u => u.type === 'tank_v1' && u.owner === enemyPlayer)
      const enemyRocketTank = spawned.find(u => u.type === 'rocketTank' && u.owner === enemyPlayer)
      if (!apache || !f22 || !enemyTank || !enemyRocketTank) {
        return { error: 'Failed to spawn scenario units' }
      }

      apache.flightState = 'airborne'
      apache.altitude = Math.max(apache.maxAltitude || 90, 90)
      apache.x = 26 * 32
      apache.y = 24 * 32
      apache.tileX = Math.floor(apache.x / 32)
      apache.tileY = Math.floor(apache.y / 32)
      apache.path = []
      apache.moveTarget = null

      f22.flightState = 'airborne'
      f22.f22State = 'airborne'
      f22.altitude = Math.max(f22.maxAltitude || 120, 120)
      f22.x = 26 * 32
      f22.y = 26 * 32
      f22.tileX = Math.floor(f22.x / 32)
      f22.tileY = Math.floor(f22.y / 32)
      f22.path = []
      f22.moveTarget = null
      f22.flightPlan = null

      enemyTank.x = 24 * 32
      enemyTank.y = 24 * 32
      enemyTank.tileX = Math.floor(enemyTank.x / 32)
      enemyTank.tileY = Math.floor(enemyTank.y / 32)
      enemyTank.path = []
      enemyTank.moveTarget = null
      enemyTank.target = apache
      enemyTank.targetId = apache.id
      enemyTank.targetType = 'unit'
      enemyTank.lastDecisionTime = 0
      enemyTank.lastTargetChangeTime = 0

      enemyRocketTank.x = 24 * 32
      enemyRocketTank.y = 26 * 32
      enemyRocketTank.tileX = Math.floor(enemyRocketTank.x / 32)
      enemyRocketTank.tileY = Math.floor(enemyRocketTank.y / 32)
      enemyRocketTank.path = []
      enemyRocketTank.moveTarget = null
      enemyRocketTank.target = f22
      enemyRocketTank.targetId = f22.id
      enemyRocketTank.targetType = 'unit'
      enemyRocketTank.lastDecisionTime = 0
      enemyRocketTank.lastTargetChangeTime = 0

      window.__enemyAirTargetE2E = {
        enemyTankId: enemyTank.id,
        enemyRocketTankId: enemyRocketTank.id,
        apacheId: apache.id,
        f22Id: f22.id
      }

      return { ok: true }
    })

    expect(setup.error || null).toBeNull()

    const resultHandle = await page.waitForFunction(() => {
      const tracker = window.__enemyAirTargetE2E
      if (!tracker) return false
      const units = window.gameInstance?.units || []
      const enemyTank = units.find(u => u.id === tracker.enemyTankId)
      const enemyRocketTank = units.find(u => u.id === tracker.enemyRocketTankId)
      const apache = units.find(u => u.id === tracker.apacheId)
      const f22 = units.find(u => u.id === tracker.f22Id)
      if (!enemyTank || !enemyRocketTank || !apache || !f22) return false

      const enemyTankDroppedAirTarget = enemyTank.targetId !== apache.id && enemyTank.target !== apache
      const rocketTankStillTracksAirTarget = enemyRocketTank.targetId === f22.id || enemyRocketTank.target === f22

      if (!enemyTankDroppedAirTarget) return false
      if (!rocketTankStillTracksAirTarget) return false

      return {
        enemyTankDroppedAirTarget,
        rocketTankStillTracksAirTarget,
        enemyTankTargetId: enemyTank.targetId || null,
        enemyRocketTankTargetId: enemyRocketTank.targetId || null,
        apacheFlightState: apache.flightState,
        f22FlightState: f22.flightState
      }
    }, { timeout: 30000 })

    const result = await resultHandle.jsonValue()

    expect(result.enemyTankDroppedAirTarget).toBe(true)
    expect(result.rocketTankStillTracksAirTarget).toBe(true)
    expect(result.apacheFlightState).toBe('airborne')
    expect(result.f22FlightState).toBe('airborne')

    expect(consoleErrors, `Console errors encountered:\n${consoleErrors.join('\n')}`).toEqual([])
  })
})
