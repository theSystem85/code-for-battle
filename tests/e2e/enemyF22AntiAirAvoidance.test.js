import { test, expect } from '@playwright/test'

test.describe('Enemy F22 anti-air aware target and approach selection', () => {
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

  test('enemy F22 avoids anti-air-protected targets and chooses path points outside anti-air radius', async({ page }) => {
    test.setTimeout(120000)

    await page.goto('/?seed=23')
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
      const knownBuildingIds = new Set((gs.buildings || []).map(b => b.id))

      gs.cursorX = 20 * 32
      gs.cursorY = 20 * 32
      window.cheatSystem.processCheatCode(`build airstrip ${enemyPlayer}`)
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${enemyPlayer}`)

      window.cheatSystem.processCheatCode(`harvester 1 ${humanPlayer}`)
      window.cheatSystem.processCheatCode(`harvester 1 ${humanPlayer}`)

      gs.cursorX = 22 * 32
      gs.cursorY = 20 * 32
      window.cheatSystem.processCheatCode(`build rocketTurret ${humanPlayer}`)

      window.cheatSystem.processCheatCode(`rocketTank 1 ${humanPlayer}`)

      const spawnedUnits = units.filter(u => !knownUnitIds.has(u.id))
      const enemyF22 = spawnedUnits.find(u => u.type === 'f22Raptor' && u.owner === enemyPlayer)
      const harvesters = spawnedUnits.filter(u => u.type === 'harvester' && u.owner === humanPlayer)
      const spawnedBuildings = (gs.buildings || []).filter(b => !knownBuildingIds.has(b.id))
      const rocketTurret = spawnedBuildings.find(b => b.owner === humanPlayer && b.type === 'rocketTurret')
      const rocketTank = spawnedUnits.find(u => u.type === 'rocketTank' && u.owner === humanPlayer)

      if (!enemyF22 || harvesters.length < 2 || !rocketTurret || !rocketTank) {
        return { error: 'Failed to set up F22 anti-air avoidance scenario.' }
      }

      const [protectedHarvester, safeHarvester] = harvesters

      protectedHarvester.x = 22 * 32
      protectedHarvester.y = 20 * 32
      protectedHarvester.tileX = 22
      protectedHarvester.tileY = 20
      protectedHarvester.path = []
      protectedHarvester.moveTarget = null
      protectedHarvester.harvesting = true

      safeHarvester.x = 44 * 32
      safeHarvester.y = 30 * 32
      safeHarvester.tileX = 44
      safeHarvester.tileY = 30
      safeHarvester.path = []
      safeHarvester.moveTarget = null
      safeHarvester.harvesting = true

      rocketTank.x = 24 * 32
      rocketTank.y = 21 * 32
      rocketTank.tileX = 24
      rocketTank.tileY = 21
      rocketTank.path = []
      rocketTank.moveTarget = null

      enemyF22.lastDecisionTime = 0
      enemyF22.lastTargetChangeTime = 0
      enemyF22.target = null
      enemyF22.allowedToAttack = false

      window.__enemyF22AntiAirE2E = {
        enemyF22Id: enemyF22.id,
        protectedHarvesterId: protectedHarvester.id,
        safeHarvesterId: safeHarvester.id,
        rocketTurretId: rocketTurret.id,
        rocketTankId: rocketTank.id,
        safeWaypointOutsideThreatObserved: false,
        humanPlayer
      }

      return { ok: true }
    })

    expect(setup.error || null).toBeNull()

    const resultHandle = await page.waitForFunction(() => {
      const tracker = window.__enemyF22AntiAirE2E
      if (!tracker) return false

      const gs = window.gameState
      const units = window.gameInstance?.units || []
      const f22 = units.find(u => u.id === tracker.enemyF22Id)
      const protectedHarvester = units.find(u => u.id === tracker.protectedHarvesterId)
      const safeHarvester = units.find(u => u.id === tracker.safeHarvesterId)
      const rocketTank = units.find(u => u.id === tracker.rocketTankId)
      const rocketTurret = (gs.buildings || []).find(b => b.id === tracker.rocketTurretId)
      if (!f22 || !protectedHarvester || !safeHarvester || !rocketTank || !rocketTurret) return false

      if (!f22.target || f22.target.health <= 0) return false

      const safeTargetChosen = f22.target.id === safeHarvester.id
      const notProtectedTarget = f22.target.id !== protectedHarvester.id

      const waypoint = f22.flightPlan
      if (!waypoint || typeof waypoint.x !== 'number' || typeof waypoint.y !== 'number') return false

      const distToRocketTank = Math.hypot((rocketTank.x + 16) - waypoint.x, (rocketTank.y + 16) - waypoint.y)
      const distToRocketTurret = Math.hypot(((rocketTurret.x + (rocketTurret.width || 1) / 2) * 32) - waypoint.x, ((rocketTurret.y + (rocketTurret.height || 1) / 2) * 32) - waypoint.y)
      const rocketTankRange = 8 * 32
      const rocketTurretRange = (rocketTurret.fireRange || 16) * 32

      const waypointOutsideThreat = distToRocketTank > rocketTankRange && distToRocketTurret > rocketTurretRange
      if (waypointOutsideThreat) {
        tracker.safeWaypointOutsideThreatObserved = true
      }

      if (!safeTargetChosen || !notProtectedTarget || !tracker.safeWaypointOutsideThreatObserved) {
        return false
      }

      return {
        targetId: f22.target.id,
        safeHarvesterId: safeHarvester.id,
        protectedHarvesterId: protectedHarvester.id,
        safeWaypointOutsideThreatObserved: tracker.safeWaypointOutsideThreatObserved,
        f22State: f22.f22State,
        flightState: f22.flightState,
        pendingTakeoff: Boolean(f22.f22PendingTakeoff)
      }
    }, { timeout: 40000 })

    const result = await resultHandle.jsonValue()

    expect(result.targetId).toBe(result.safeHarvesterId)
    expect(result.targetId).not.toBe(result.protectedHarvesterId)
    expect(result.safeWaypointOutsideThreatObserved).toBe(true)
    expect(consoleErrors, `Console errors encountered:\n${consoleErrors.join('\n')}`).toEqual([])
  })
})
