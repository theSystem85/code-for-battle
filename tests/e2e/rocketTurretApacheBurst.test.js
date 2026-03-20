import { test, expect } from '@playwright/test'

test.describe('Rocket turret anti-air Apache damage', () => {
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

  test('three rocket turret rockets are enough to destroy an airborne Apache', async({ page }) => {
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
      const buildings = gs.buildings || []
      const humanPlayer = gs.humanPlayer || 'player1'
      const enemyPlayer = humanPlayer === 'player1' ? 'player2' : 'player1'
      const knownUnitIds = new Set(units.map(unit => unit.id))
      const knownBuildingIds = new Set(buildings.map(building => building.id))

      gs.cursorX = 24 * 32
      gs.cursorY = 24 * 32
      window.cheatSystem.processCheatCode(`build rocketTurret ${humanPlayer}`)

      const rocketTurret = (gs.buildings || []).find(building => !knownBuildingIds.has(building.id) && building.type === 'rocketTurret' && building.owner === humanPlayer)
      if (!rocketTurret) {
        return { error: 'Failed to spawn rocket turret' }
      }

      rocketTurret.ammo = 3
      rocketTurret.lastShotTime = 0
      rocketTurret.currentBurst = 0
      rocketTurret.lastBurstTime = 0
      rocketTurret.holdFire = false
      rocketTurret.forcedAttackTarget = null
      rocketTurret.forcedAttackQueue = []

      gs.cursorX = (rocketTurret.x + 4) * 32
      gs.cursorY = rocketTurret.y * 32
      window.cheatSystem.processCheatCode(`apache 1 ${enemyPlayer}`)

      const apache = units.find(unit => !knownUnitIds.has(unit.id) && unit.type === 'apache' && unit.owner === enemyPlayer)
      if (!apache) {
        return { error: 'Failed to spawn apache' }
      }

      const turretCenterX = (rocketTurret.x + rocketTurret.width / 2) * 32
      const turretCenterY = (rocketTurret.y + rocketTurret.height / 2) * 32
      apache.flightState = 'airborne'
      apache.altitude = Math.max(apache.maxAltitude || 90, 90)
      apache.x = turretCenterX + (6 * 32)
      apache.y = turretCenterY - 16
      apache.tileX = Math.floor(apache.x / 32)
      apache.tileY = Math.floor(apache.y / 32)
      apache.path = []
      apache.moveTarget = null
      apache.target = null
      apache.allowedToAttack = false

      window.__rocketTurretApacheE2E = {
        rocketTurretId: rocketTurret.id,
        apacheId: apache.id,
        initialAmmo: rocketTurret.ammo
      }

      return { ok: true }
    })

    expect(setup.error || null).toBeNull()

    const resultHandle = await page.waitForFunction(() => {
      const tracker = window.__rocketTurretApacheE2E
      if (!tracker) return false
      const gs = window.gameState
      const buildings = gs?.buildings || []
      const units = window.gameInstance?.units || []
      const rocketTurret = buildings.find(building => building.id === tracker.rocketTurretId)
      const apache = units.find(unit => unit.id === tracker.apacheId)
      if (!rocketTurret) return false

      const rocketsInFlight = (gs?.bullets || []).filter(bullet => bullet.originType === 'rocketTurret').length
      const apacheDestroyed = !apache || apache.health <= 0
      const ammoSpent = tracker.initialAmmo - (rocketTurret.ammo ?? 0)

      if (!apacheDestroyed) return false
      if (rocketsInFlight > 0) return false

      return {
        ammoRemaining: rocketTurret.ammo ?? null,
        ammoSpent,
        apacheDestroyed,
        apacheStillPresent: Boolean(apache),
        apacheHealth: apache?.health ?? 0
      }
    }, { timeout: 30000 })

    const result = await resultHandle.jsonValue()

    expect(result.apacheDestroyed).toBe(true)
    expect(result.ammoSpent).toBe(3)
    expect(result.ammoRemaining).toBe(0)
    expect(result.apacheHealth).toBeLessThanOrEqual(0)
    expect(consoleErrors, `Console errors encountered\n${consoleErrors.join('\n')}`).toEqual([])
  })
})
