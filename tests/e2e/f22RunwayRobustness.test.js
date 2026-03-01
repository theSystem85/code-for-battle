import { test, expect } from '@playwright/test'

test.describe('F22 runway robustness and combat command reliability', () => {
  test.beforeEach(async({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })
  })

  test('stale runway operation does not permanently block landing F22', async({ page }) => {
    test.setTimeout(180000)

    await page.goto('/?seed=23')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.gameState?.gameStarted && window.cheatSystem && window.gameInstance?.units), { timeout: 30000 })

    const setup = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const buildings = gs.buildings
      const human = gs.humanPlayer || 'player1'
      const knownBuildings = new Set(buildings.map(b => b.id))
      const knownUnits = new Set(units.map(u => u.id))

      gs.cursorX = 24 * 32
      gs.cursorY = 24 * 32
      window.cheatSystem.processCheatCode(`build airstrip ${human}`)

      const airstrip = buildings.find(b => b.type === 'airstrip' && b.owner === human && !knownBuildings.has(b.id))
      if (!airstrip?.runwayPoints?.runwayExit) return { error: 'airstrip setup failed' }

      const parking = airstrip.f22ParkingSpots?.[0]
      if (!parking) return { error: 'parking setup failed' }

      gs.cursorX = parking.worldX
      gs.cursorY = parking.worldY
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${human}`)

      const f22 = units.find(u => u.type === 'f22Raptor' && u.owner === human && !knownUnits.has(u.id))
      if (!f22) return { error: 'f22 setup failed' }

      // Simulate stale blockers from old/broken state
      airstrip.f22RunwayOperation = { unitId: 'ghost-unit', type: 'landing' }
      airstrip.f22RunwayLandingQueue = ['ghost-unit']
      airstrip.f22RunwayTakeoffQueue = ['ghost-unit']

      f22.x = airstrip.runwayPoints.runwayExit.worldX + 64
      f22.y = airstrip.runwayPoints.runwayExit.worldY
      f22.tileX = Math.floor((f22.x + 16) / 32)
      f22.tileY = Math.floor((f22.y + 16) / 32)
      f22.flightState = 'airborne'
      f22.altitude = f22.maxAltitude * 0.9
      f22.f22State = 'airborne'
      f22.helipadLandingRequested = true
      f22.airstripId = airstrip.id
      f22.helipadTargetId = airstrip.id
      f22.landedHelipadId = null
      f22.path = []
      f22.moveTarget = null
      f22.flightPlan = null
      f22.f22AssignedDestination = null

      return { f22Id: f22.id, airstripId: airstrip.id }
    })

    expect(setup.error || '').toBe('')

    await page.waitForFunction(({ f22Id, airstripId }) => {
      const units = window.gameInstance?.units || []
      const buildings = window.gameState?.buildings || []
      const f22 = units.find(u => u.id === f22Id)
      const airstrip = buildings.find(b => b.id === airstripId)
      if (!f22 || !airstrip) return false
      return f22.f22State === 'parked' && f22.flightState === 'grounded' && airstrip.f22OccupiedSlotUnitIds?.includes(f22Id)
    }, setup, { timeout: 90000 })

    const result = await page.evaluate(({ f22Id, airstripId }) => {
      const units = window.gameInstance?.units || []
      const buildings = window.gameState?.buildings || []
      const f22 = units.find(u => u.id === f22Id)
      const airstrip = buildings.find(b => b.id === airstripId)
      return {
        state: f22?.f22State,
        flight: f22?.flightState,
        runwayOperation: airstrip?.f22RunwayOperation || null,
        landingQueue: airstrip?.f22RunwayLandingQueue || []
      }
    }, setup)

    expect(result.state).toBe('parked')
    expect(result.flight).toBe('grounded')
    expect(result.runwayOperation === null || result.runwayOperation.unitId !== 'ghost-unit').toBeTruthy()
    expect(result.landingQueue.includes('ghost-unit')).toBeFalsy()
  })

  test('attack-assigned F22 does not reland immediately after takeoff while target is alive', async({ page }) => {
    test.setTimeout(180000)

    await page.goto('/?seed=31')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.gameState?.gameStarted && window.cheatSystem && window.gameInstance?.units), { timeout: 30000 })

    const setup = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const buildings = gs.buildings
      const human = gs.humanPlayer || 'player1'
      const enemy = human === 'player2' ? 'player1' : 'player2'
      const knownBuildings = new Set(buildings.map(b => b.id))
      const knownUnits = new Set(units.map(u => u.id))

      gs.cursorX = 20 * 32
      gs.cursorY = 20 * 32
      window.cheatSystem.processCheatCode(`build airstrip ${human}`)

      const airstrip = buildings.find(b => b.type === 'airstrip' && b.owner === human && !knownBuildings.has(b.id))
      if (!airstrip) return { error: 'airstrip setup failed' }

      const slot = airstrip.f22ParkingSpots?.[0]
      if (!slot) return { error: 'slot setup failed' }

      gs.cursorX = slot.worldX
      gs.cursorY = slot.worldY
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${human}`)

      const f22 = units.find(u => u.type === 'f22Raptor' && u.owner === human && !knownUnits.has(u.id))
      if (!f22) return { error: 'f22 setup failed' }
      knownUnits.add(f22.id)

      const runwayExit = airstrip.runwayPoints?.runwayExit
      gs.cursorX = (runwayExit?.worldX || (airstrip.x + airstrip.width + 6) * 32) + 10 * 32
      gs.cursorY = (runwayExit?.worldY || (airstrip.y + 2) * 32)
      window.cheatSystem.processCheatCode(`tank_v1 1 ${enemy}`)

      const target = units.find(u => u.owner === enemy && u.type === 'tank_v1' && !knownUnits.has(u.id))
      if (!target) return { error: 'target setup failed' }

      f22.rocketAmmo = Math.max(3, f22.rocketAmmo || 0)
      f22.gas = f22.maxGas
      f22.helipadLandingRequested = true // simulate stale landing flag before attack command

      const center = {
        x: target.x + 16,
        y: target.y + 16
      }

      // Mirror attack-command assignment for F22 combat flight
      f22.path = []
      f22.moveTarget = null
      f22.f22AssignedDestination = {
        x: center.x,
        y: center.y,
        stopRadius: 32 * 0.25,
        mode: 'combat',
        destinationTile: { x: Math.floor(center.x / 32), y: Math.floor(center.y / 32) },
        followTargetId: target.id
      }
      f22.f22OrbitAngle = Math.atan2((f22.y + 16) - center.y, (f22.x + 16) - center.x)
      f22.helipadLandingRequested = false
      if (f22.flightState === 'grounded') {
        f22.f22PendingTakeoff = true
        f22.f22State = 'wait_takeoff_clearance'
      }
      f22.target = target

      return { f22Id: f22.id, targetId: target.id, airstripId: airstrip.id }
    })

    expect(setup.error || '').toBe('')

    await page.waitForFunction(({ f22Id }) => {
      const f22 = window.gameInstance?.units?.find(u => u.id === f22Id)
      return Boolean(f22 && f22.flightState === 'airborne' && (f22.f22State === 'airborne' || f22.f22State === 'liftoff'))
    }, setup, { timeout: 60000 })

    const tracking = await page.evaluate(({ f22Id, targetId }) => new Promise(resolve => {
      const started = performance.now()
      let enteredLandingWhileTargetAlive = false
      let targetDamaged = false
      const seenStates = new Set()

      const interval = setInterval(() => {
        const units = window.gameInstance?.units || []
        const f22 = units.find(u => u.id === f22Id)
        const target = units.find(u => u.id === targetId)
        if (!f22) {
          clearInterval(interval)
          resolve({ error: 'f22 missing' })
          return
        }

        seenStates.add(f22.f22State)

        if (target && target.health > 0) {
          if (['wait_landing_clearance', 'approach_runway', 'landing_roll', 'taxi_to_parking', 'parked'].includes(f22.f22State)) {
            enteredLandingWhileTargetAlive = true
          }
          if (target.health < target.maxHealth) {
            targetDamaged = true
          }
        }

        if (performance.now() - started > 12000) {
          clearInterval(interval)
          resolve({
            enteredLandingWhileTargetAlive,
            targetDamaged,
            states: Array.from(seenStates),
            finalState: f22.f22State,
            finalFlight: f22.flightState,
            finalAmmo: f22.rocketAmmo,
            targetAlive: Boolean(target && target.health > 0)
          })
        }
      }, 100)
    }), setup)

    expect(tracking.error || '').toBe('')
    expect(tracking.enteredLandingWhileTargetAlive).toBeFalsy()
    expect(tracking.targetDamaged).toBeTruthy()
    expect(tracking.states.includes('airborne') || tracking.finalState === 'airborne').toBeTruthy()
  })
})
