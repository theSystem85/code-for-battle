import { test, expect } from '@playwright/test'

test.describe('F22 restored landing recovery', () => {
  test('rebinds missing-airstrip restored F22 and lands on nearest friendly airstrip', async({ page }) => {
    test.setTimeout(180000)

    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=19')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      return Boolean(gs && gs.gameStarted && window.cheatSystem && window.gameInstance?.units)
    }, { timeout: 30000 })

    const setup = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const buildings = gs.buildings
      const humanPlayer = gs.humanPlayer || 'player1'
      const knownBuildingIds = new Set(buildings.map(building => building.id))
      const knownUnitIds = new Set(units.map(unit => unit.id))

      gs.cursorX = 20 * 32
      gs.cursorY = 20 * 32
      window.cheatSystem.processCheatCode(`build airstrip ${humanPlayer}`)

      const airstrip = buildings.find(building =>
        building.type === 'airstrip' &&
        building.owner === humanPlayer &&
        !knownBuildingIds.has(building.id)
      )

      if (!airstrip) {
        return { error: 'Failed to spawn airstrip' }
      }

      const slot = airstrip.f22ParkingSpots?.[0]
      if (!slot) {
        return { error: 'Airstrip parking slot missing' }
      }

      gs.cursorX = slot.worldX
      gs.cursorY = slot.worldY
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${humanPlayer}`)

      const f22 = units.find(unit =>
        unit.type === 'f22Raptor' &&
        unit.owner === humanPlayer &&
        !knownUnitIds.has(unit.id)
      )

      if (!f22) {
        return { error: 'Failed to spawn f22' }
      }

      f22.x = airstrip.runwayPoints.runwayExit.worldX + 32
      f22.y = airstrip.runwayPoints.runwayExit.worldY
      f22.tileX = Math.floor((f22.x + 16) / 32)
      f22.tileY = Math.floor((f22.y + 16) / 32)
      f22.flightState = 'airborne'
      f22.altitude = f22.maxAltitude * 0.9
      f22.f22State = 'airborne'
      f22.path = []
      f22.moveTarget = null
      f22.target = null
      f22.f22AssignedDestination = null
      f22.helipadLandingRequested = true
      f22.airstripParkingSlotIndex = 0
      f22.airstripId = null
      f22.helipadTargetId = null
      f22.landedHelipadId = null

      return {
        f22Id: f22.id,
        airstripId: airstrip.id
      }
    })

    expect(setup.error || '').toBe('')

    await page.waitForFunction(({ f22Id, airstripId }) => {
      const units = window.gameInstance?.units || []
      const buildings = window.gameState?.buildings || []
      const f22 = units.find(unit => unit.id === f22Id)
      const airstrip = buildings.find(building => building.id === airstripId)
      if (!f22 || !airstrip) return false

      return (
        f22.f22State === 'parked' &&
        f22.flightState === 'grounded' &&
        f22.airstripId === airstripId &&
        f22.landedHelipadId === airstripId &&
        Array.isArray(airstrip.f22OccupiedSlotUnitIds) &&
        airstrip.f22OccupiedSlotUnitIds.includes(f22Id)
      )
    }, setup, { timeout: 90000 })

    const finalState = await page.evaluate(({ f22Id, airstripId }) => {
      const units = window.gameInstance?.units || []
      const buildings = window.gameState?.buildings || []
      const f22 = units.find(unit => unit.id === f22Id)
      const airstrip = buildings.find(building => building.id === airstripId)
      return {
        f22State: f22?.f22State,
        flightState: f22?.flightState,
        airstripId: f22?.airstripId,
        landedHelipadId: f22?.landedHelipadId,
        occupiedSlots: airstrip?.f22OccupiedSlotUnitIds || []
      }
    }, setup)

    expect(finalState.f22State).toBe('parked')
    expect(finalState.flightState).toBe('grounded')
    expect(finalState.airstripId).toBe(setup.airstripId)
    expect(finalState.landedHelipadId).toBe(setup.airstripId)
    expect(finalState.occupiedSlots).toContain(setup.f22Id)
  })
})
