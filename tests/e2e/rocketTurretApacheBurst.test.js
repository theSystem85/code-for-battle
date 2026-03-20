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

  async function verifyApacheDestroyedInThreeRockets(page, flightState) {
    const setup = await page.evaluate((targetFlightState) => {
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
        return { error: `Failed to spawn rocket turret for ${targetFlightState}` }
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
        return { error: `Failed to spawn apache for ${targetFlightState}` }
      }

      const turretCenterX = (rocketTurret.x + rocketTurret.width / 2) * 32
      const turretCenterY = (rocketTurret.y + rocketTurret.height / 2) * 32
      apache.flightState = targetFlightState
      apache.altitude = targetFlightState === 'airborne'
        ? Math.max(apache.maxAltitude || 90, 90)
        : 0
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
        initialAmmo: rocketTurret.ammo,
        flightState: targetFlightState
      }

      return { ok: true }
    }, flightState)

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
        flightState: tracker.flightState,
        ammoRemaining: rocketTurret.ammo ?? null,
        ammoSpent,
        apacheDestroyed,
        apacheHealth: apache?.health ?? 0
      }
    }, { timeout: 30000 })

    return resultHandle.jsonValue()
  }

  test('grounded and airborne Apaches both die to three direct rocket turret rockets', async({ page }) => {
    test.setTimeout(120000)

    await page.goto('/?seed=11')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      return Boolean(gs?.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units)
    }, { timeout: 30000 })

    const groundedResult = await verifyApacheDestroyedInThreeRockets(page, 'grounded')
    const airborneResult = await verifyApacheDestroyedInThreeRockets(page, 'airborne')

    expect(groundedResult.flightState).toBe('grounded')
    expect(groundedResult.apacheDestroyed).toBe(true)
    expect(groundedResult.ammoSpent).toBe(3)
    expect(groundedResult.ammoRemaining).toBe(0)

    expect(airborneResult.flightState).toBe('airborne')
    expect(airborneResult.apacheDestroyed).toBe(true)
    expect(airborneResult.ammoSpent).toBe(3)
    expect(airborneResult.ammoRemaining).toBe(0)

    expect(consoleErrors, `Console errors encountered\n${consoleErrors.join('\n')}`).toEqual([])
  })
})
