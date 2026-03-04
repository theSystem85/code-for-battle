import { test, expect } from '@playwright/test'

test.describe('F22 landing centerline guard', () => {
  test.beforeEach(async({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })
  })

  test('landing roll softly recenters F22 away from non-passable airstrip edge tiles', async({ page }) => {
    test.setTimeout(180000)

    await page.goto('/?seed=41')
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
      if (!airstrip?.runwayPoints?.runwayExit || !airstrip?.runwayPoints?.runwayStart || !airstrip?.runwayPoints?.runwayLiftOff) {
        return { error: 'airstrip setup failed' }
      }

      const parking = airstrip.f22ParkingSpots?.[0]
      if (!parking) return { error: 'parking setup failed' }

      gs.cursorX = parking.worldX
      gs.cursorY = parking.worldY
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${human}`)

      const f22 = units.find(u => u.type === 'f22Raptor' && u.owner === human && !knownUnits.has(u.id))
      if (!f22) return { error: 'f22 setup failed' }

      const runway = airstrip.runwayPoints
      const runwayCenterY = (runway.runwayExit.worldY + runway.runwayStart.worldY) / 2
      const forcedOffset = 32 * 1.6

      f22.airstripId = airstrip.id
      f22.helipadTargetId = airstrip.id
      f22.f22State = 'landing_roll'
      f22.flightState = 'landing'
      f22.helipadLandingRequested = true
      f22.altitude = f22.maxAltitude * 0.55
      f22.path = []
      f22.moveTarget = null
      f22.flightPlan = null
      f22.f22AssignedDestination = null

      const spawnX = Math.max(runway.runwayLiftOff.worldX + 16, runway.runwayExit.worldX - 32)
      f22.x = spawnX - 16
      f22.y = runwayCenterY + forcedOffset - 16
      f22.tileX = Math.floor((f22.x + 16) / 32)
      f22.tileY = Math.floor((f22.y + 16) / 32)

      return { f22Id: f22.id, runwayCenterY }
    })

    expect(setup.error || '').toBe('')

    const tracking = await page.evaluate(({ f22Id, runwayCenterY }) => new Promise(resolve => {
      const started = performance.now()
      const samples = []

      const interval = setInterval(() => {
        const f22 = (window.gameInstance?.units || []).find(u => u.id === f22Id)
        if (!f22) {
          clearInterval(interval)
          resolve({ error: 'f22 missing' })
          return
        }

        const centerX = f22.x + 16
        const centerY = f22.y + 16
        const tileX = Math.floor(centerX / 32)
        const tileY = Math.floor(centerY / 32)
        const tile = window.gameState?.mapGrid?.[tileY]?.[tileX] || null
        samples.push({
          deltaY: Math.abs(centerY - runwayCenterY),
          onTaxiSurface: Boolean(tile && (tile.type === 'street' || tile.airstripStreet)),
          state: f22.f22State,
          flight: f22.flightState
        })

        const done = performance.now() - started > 9000 || f22.f22State === 'taxi_to_parking' || f22.f22State === 'parked'
        if (done) {
          clearInterval(interval)
          const initialDelta = samples[0]?.deltaY ?? null
          const minDelta = samples.reduce((best, s) => Math.min(best, s.deltaY), Number.POSITIVE_INFINITY)
          const final = samples[samples.length - 1] || null
          const touchedTaxiSurface = samples.some(s => s.onTaxiSurface)
          resolve({ initialDelta, minDelta, final, touchedTaxiSurface, sampleCount: samples.length })
        }
      }, 120)
    }), setup)

    expect(tracking.error || '').toBe('')
    expect(tracking.sampleCount).toBeGreaterThan(6)
    expect(tracking.minDelta).toBeLessThan(tracking.initialDelta - 10)
    expect(tracking.touchedTaxiSurface || ['taxi_to_parking', 'parked'].includes(tracking.final?.state)).toBeTruthy()
  })
})
