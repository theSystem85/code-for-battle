import { test, expect } from '@playwright/test'

const RUN_ROCKET_TURRET_PERF = process.env.PERF_ROCKET_TURRET_AIR === '1'

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

test.describe('Rocket turret anti-air performance', () => {
  test.skip(!RUN_ROCKET_TURRET_PERF, 'Set PERF_ROCKET_TURRET_AIR=1 to run this benchmark.')

  test('keeps 120 homing rockets tracking airborne targets within the frame budget', async({ page }) => {
    await page.goto('/?seed=11')
    await page.waitForFunction(() => Boolean(window.gameState?.gameStarted && window.gameInstance?.units))

    const result = await page.evaluate(async() => {
      const { performanceMonitor } = await import('/src/performance/performanceMonitor.js')
      const gs = window.gameState
      const units = window.gameInstance.units
      const bullets = gs.bullets
      const owner = gs.humanPlayer === 'player1' ? 'player2' : 'player1'
      const centerX = (gs.scrollOffset?.x || 0) + 500
      const centerY = (gs.scrollOffset?.y || 0) + 350

      const sample = duration => new Promise(resolve => {
        const frames = []
        const heapStart = performance.memory?.usedJSHeapSize ?? null
        performanceMonitor.start()
        let previous = performance.now()
        const start = previous
        const record = now => {
          frames.push(now - previous)
          previous = now
          if (now - start >= duration) {
            const usable = frames.filter(frame => frame > 0 && frame < 250)
            const elapsed = usable.reduce((sum, frame) => sum + frame, 0)
            const monitor = performanceMonitor.stop()
            const heapEnd = performance.memory?.usedJSHeapSize ?? null
            resolve({
              fps: elapsed ? usable.length * 1000 / elapsed : 0,
              frameCount: usable.length,
              heapDeltaMb: heapStart !== null && heapEnd !== null ? (heapEnd - heapStart) / 1048576 : null,
              timingMs: monitor?.timingMs || null
            })
            return
          }
          requestAnimationFrame(record)
        }
        requestAnimationFrame(record)
      })

      const baseline = await sample(2000)
      for (let index = 0; index < 120; index++) {
        const aircraft = {
          id: `perf-air-${index}`,
          type: index % 3 === 0 ? 'apache' : index % 3 === 1 ? 'f22Raptor' : 'f35',
          owner,
          x: centerX + (index % 12) * 8,
          y: centerY + Math.floor(index / 12) * 8,
          health: 100000,
          maxHealth: 100000,
          flightState: 'airborne',
          altitude: 90 + (index % 3) * 10,
          path: []
        }
        units.push(aircraft)
        bullets.push({
          id: `perf-rocket-${index}`,
          x: centerX - 300,
          y: centerY,
          vx: 0,
          vy: 0,
          speed: 0.05,
          baseDamage: 18,
          active: true,
          shooter: { id: `perf-turret-${index}`, type: 'rocketTurret', owner: gs.humanPlayer, isBuilding: true, x: 0, y: 0, width: 2, height: 2 },
          homing: true,
          target: aircraft,
          targetPosition: { x: aircraft.x + 16, y: aircraft.y + 16 },
          projectileType: 'rocket',
          originType: 'rocketTurret',
          skipCollisionChecks: true,
          creationTime: gs.simulationTime,
          startTime: gs.simulationTime,
          maxFlightTime: 60000
        })
      }
      const active = await sample(2000)
      return { baseline, active }
    })

    console.log(`ROCKET_TURRET_AIR_PERF ${JSON.stringify(result)}`)
    expect(result.active.frameCount).toBeGreaterThan(0)
    expect(result.active.fps).toBeGreaterThanOrEqual(result.baseline.fps * 0.8)
  })
})
