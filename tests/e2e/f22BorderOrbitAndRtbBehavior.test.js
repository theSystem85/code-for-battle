import { test, expect } from '@playwright/test'

test.describe('F22 border avoidance, orbit speed, and repeated attack passes', () => {
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

  test('F22 keeps wide passes near border, slows down while orbiting, and returns when ammo is empty', async({ page }) => {
    test.setTimeout(120000)

    await page.goto('/?seed=29')
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

      gs.cursorX = 16 * 32
      gs.cursorY = 16 * 32
      window.cheatSystem.processCheatCode(`build airstrip ${humanPlayer}`)
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${humanPlayer}`)
      window.cheatSystem.processCheatCode(`tank_v1 1 ${enemyPlayer}`)

      const spawnedUnits = units.filter(u => !knownUnitIds.has(u.id))
      const f22 = spawnedUnits.find(u => u.type === 'f22Raptor' && u.owner === humanPlayer)
      const enemyTank = spawnedUnits.find(u => u.type === 'tank_v1' && u.owner === enemyPlayer)

      if (!f22 || !enemyTank) {
        return { error: 'Failed to spawn F22 and enemy target.' }
      }

      enemyTank.x = 2 * 32
      enemyTank.y = 14 * 32
      enemyTank.tileX = 2
      enemyTank.tileY = 14
      enemyTank.path = []
      enemyTank.moveTarget = null
      enemyTank.health = 9000
      enemyTank.maxHealth = 9000

      f22.x = 8 * 32
      f22.y = 14 * 32
      f22.tileX = 8
      f22.tileY = 14
      f22.flightState = 'airborne'
      f22.f22State = 'airborne'
      f22.altitude = f22.maxAltitude || 32
      f22.path = []
      f22.moveTarget = null
      f22.helipadLandingRequested = false
      f22.f22PendingTakeoff = false
      f22.target = enemyTank
      f22.maxRocketAmmo = Math.max(4, f22.maxRocketAmmo || 4)
      f22.rocketAmmo = 4
      f22.f22AssignedDestination = {
        x: enemyTank.x + 16,
        y: enemyTank.y + 16,
        stopRadius: 16,
        mode: 'combat',
        destinationTile: { x: enemyTank.tileX, y: enemyTank.tileY },
        followTargetId: enemyTank.id
      }

      window.__f22BorderOrbitTracker = {
        f22Id: f22.id,
        enemyTankId: enemyTank.id,
        passCount: 0,
        wasFar: false,
        borderHit: false,
        orbitSlowObserved: false,
        minDistanceToTarget: Infinity,
        sampleCount: 0
      }

      return { ok: true }
    })

    expect(setup.error || null).toBeNull()

    const resultHandle = await page.waitForFunction(() => {
      const tracker = window.__f22BorderOrbitTracker
      if (!tracker) return false

      const gs = window.gameState
      const units = window.gameInstance?.units || []
      const f22 = units.find(u => u.id === tracker.f22Id)
      const tank = units.find(u => u.id === tracker.enemyTankId)
      if (!f22 || !tank || f22.health <= 0 || tank.health <= 0) return false

      const centerX = f22.x + 16
      const centerY = f22.y + 16
      const targetX = tank.x + 16
      const targetY = tank.y + 16
      const distance = Math.hypot(centerX - targetX, centerY - targetY)

      const nearThreshold = 6 * 32
      const farThreshold = 10 * 32
      if (distance >= farThreshold) {
        tracker.wasFar = true
      }
      if (tracker.wasFar && distance <= nearThreshold) {
        tracker.passCount += 1
        tracker.wasFar = false
      }

      tracker.minDistanceToTarget = Math.min(tracker.minDistanceToTarget, distance)
      tracker.sampleCount += 1

      const mapWidth = gs.mapGrid[0].length * 32
      const mapHeight = gs.mapGrid.length * 32
      const borderMargin = 32
      if (centerX <= borderMargin || centerY <= borderMargin || centerX >= mapWidth - borderMargin || centerY >= mapHeight - borderMargin) {
        tracker.borderHit = true
      }

      const velocity = f22.movement?.targetVelocity
      const speed = velocity ? Math.hypot(velocity.x || 0, velocity.y || 0) : 0
      const cruise = f22.airCruiseSpeed || f22.speed || 0
      if (f22.flightPlan?.mode === 'orbit' && cruise > 0 && speed <= cruise * 0.75) {
        tracker.orbitSlowObserved = true
      }

      const returnedForAmmo = (f22.rocketAmmo ?? 0) <= 0 && f22.helipadLandingRequested === true
      if (!returnedForAmmo) return false

      if (tracker.passCount < 2 || tracker.borderHit || !tracker.orbitSlowObserved) {
        return false
      }

      return {
        passCount: tracker.passCount,
        borderHit: tracker.borderHit,
        orbitSlowObserved: tracker.orbitSlowObserved,
        minDistanceToTarget: tracker.minDistanceToTarget,
        rocketAmmo: f22.rocketAmmo,
        helipadLandingRequested: f22.helipadLandingRequested
      }
    }, { timeout: 50000 })

    const result = await resultHandle.jsonValue()

    expect(result.passCount).toBeGreaterThanOrEqual(2)
    expect(result.borderHit).toBe(false)
    expect(result.orbitSlowObserved).toBe(true)
    expect(result.minDistanceToTarget).toBeGreaterThan(4 * 32)
    expect(result.rocketAmmo).toBeLessThanOrEqual(0)
    expect(result.helipadLandingRequested).toBe(true)
    expect(consoleErrors, `Console errors encountered:\n${consoleErrors.join('\n')}`).toEqual([])
  })
})
