import { test, expect } from '@playwright/test'

test.describe('F22 parked airstrip command guard', () => {
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

  test('parked F22 shows blocked cursor on its own airstrip, move-into on another, and does not relaunch on right click', async({ page }) => {
    await page.goto('/?seed=11')

    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => {
      const gs = window.gameState
      if (!gs) return false
      if (gs.gameStarted && gs.gamePaused) {
        gs.gamePaused = false
      }
      return gs.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units
    }, { timeout: 30000 })

    const scenario = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const buildings = gs.buildings
      const humanPlayer = gs.humanPlayer || 'player1'

      const knownBuildingIds = new Set(buildings.map(building => building.id))
      const knownUnitIds = new Set(units.map(unit => unit.id))

      const spawnPositions = [
        { x: 14 * 32, y: 14 * 32 },
        { x: 28 * 32, y: 14 * 32 }
      ]

      for (const pos of spawnPositions) {
        gs.cursorX = pos.x
        gs.cursorY = pos.y
        window.cheatSystem.processCheatCode(`build airstrip ${humanPlayer}`)
      }

      const spawnedAirstrips = buildings.filter(building =>
        building.type === 'airstrip' &&
        building.owner === humanPlayer &&
        !knownBuildingIds.has(building.id)
      )

      if (spawnedAirstrips.length < 2) {
        return { error: 'Failed to spawn two friendly airstrips' }
      }

      const [homeAirstrip, otherAirstrip] = spawnedAirstrips
      const homeSlot = homeAirstrip.f22ParkingSpots?.[0]
      if (!homeSlot) {
        return { error: 'Home airstrip does not have a parking slot' }
      }

      gs.cursorX = homeSlot.worldX
      gs.cursorY = homeSlot.worldY
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${humanPlayer}`)

      const f22 = units.find(unit =>
        unit.type === 'f22Raptor' &&
        unit.owner === humanPlayer &&
        !knownUnitIds.has(unit.id)
      )

      if (!f22) {
        return { error: 'Failed to spawn F22' }
      }

      f22.x = homeSlot.worldX
      f22.y = homeSlot.worldY
      f22.tileX = Math.floor((f22.x + 16) / 32)
      f22.tileY = Math.floor((f22.y + 16) / 32)
      f22.flightState = 'grounded'
      f22.f22State = 'parked'
      f22.f22PendingTakeoff = false
      f22.helipadLandingRequested = false
      f22.f22AssignedDestination = null
      f22.path = []
      f22.moveTarget = null
      f22.airstripId = homeAirstrip.id
      f22.landedHelipadId = homeAirstrip.id
      f22.airstripParkingSlotIndex = 0
      f22.runwayPoints = homeAirstrip.runwayPoints

      if (!Array.isArray(homeAirstrip.f22OccupiedSlotUnitIds) || homeAirstrip.f22OccupiedSlotUnitIds.length < 1) {
        homeAirstrip.f22OccupiedSlotUnitIds = homeAirstrip.f22ParkingSpots.map(() => null)
      }
      homeAirstrip.f22OccupiedSlotUnitIds[0] = f22.id

      const selected = window.debugGetSelectedUnits?.() || []
      selected.length = 0
      selected.push(f22)
      units.forEach(unit => {
        unit.selected = unit.id === f22.id
      })

      return {
        f22Id: f22.id,
        homeCenter: {
          x: (homeAirstrip.x + homeAirstrip.width / 2) * 32,
          y: (homeAirstrip.y + homeAirstrip.height / 2) * 32
        },
        otherCenter: {
          x: (otherAirstrip.x + otherAirstrip.width / 2) * 32,
          y: (otherAirstrip.y + otherAirstrip.height / 2) * 32
        }
      }
    })

    expect(scenario.error || null).toBeNull()

    const canvas = await page.locator('#gameCanvas').boundingBox()
    expect(canvas).not.toBeNull()

    const toScreen = async({ x, y }) => {
      const scrollOffset = await page.evaluate(() => window.gameState?.scrollOffset || { x: 0, y: 0 })
      return {
        x: canvas.x + x - scrollOffset.x,
        y: canvas.y + y - scrollOffset.y
      }
    }

    const homeCursorPoint = await toScreen(scenario.homeCenter)
    await page.mouse.move(homeCursorPoint.x, homeCursorPoint.y)

    const homeCursorClass = await page.evaluate(() => {
      const gameCanvas = document.getElementById('gameCanvas')
      return Array.from(gameCanvas?.classList || [])
    })
    expect(homeCursorClass).toContain('move-blocked-mode')

    const otherCursorPoint = await toScreen(scenario.otherCenter)
    await page.mouse.move(otherCursorPoint.x, otherCursorPoint.y)

    const otherCursorClass = await page.evaluate(() => {
      const gameCanvas = document.getElementById('gameCanvas')
      return Array.from(gameCanvas?.classList || [])
    })
    expect(otherCursorClass).toContain('move-into-mode')

    await page.mouse.move(homeCursorPoint.x, homeCursorPoint.y)
    await page.mouse.click(homeCursorPoint.x, homeCursorPoint.y, { button: 'right' })

    await page.waitForTimeout(1000)

    const parkedState = await page.evaluate(({ f22Id }) => {
      const f22 = window.gameInstance.units.find(unit => unit.id === f22Id)
      if (!f22) {
        return null
      }
      return {
        flightState: f22.flightState,
        f22State: f22.f22State,
        f22PendingTakeoff: f22.f22PendingTakeoff,
        helipadLandingRequested: f22.helipadLandingRequested
      }
    }, { f22Id: scenario.f22Id })

    expect(parkedState).not.toBeNull()
    expect(parkedState.flightState).toBe('grounded')
    expect(parkedState.f22State).toBe('parked')
    expect(parkedState.f22PendingTakeoff).toBe(false)
    expect(parkedState.helipadLandingRequested).toBe(false)

    await page.evaluate(({ f22Id }) => {
      const f22 = window.gameInstance.units.find(unit => unit.id === f22Id)
      if (!f22) {
        return
      }
      f22.flightState = 'airborne'
      f22.f22State = 'approach_runway'
      f22.helipadLandingRequested = true
      f22.airstripId = f22.landedHelipadId
      f22.helipadTargetId = f22.landedHelipadId
      f22.f22PendingTakeoff = false
    }, { f22Id: scenario.f22Id })

    await page.mouse.move(homeCursorPoint.x, homeCursorPoint.y)
    const inProgressCursorClass = await page.evaluate(() => {
      const gameCanvas = document.getElementById('gameCanvas')
      return Array.from(gameCanvas?.classList || [])
    })
    expect(inProgressCursorClass).toContain('move-blocked-mode')

    await page.mouse.click(homeCursorPoint.x, homeCursorPoint.y, { button: 'right' })
    await page.waitForTimeout(600)

    const inProgressState = await page.evaluate(({ f22Id }) => {
      const f22 = window.gameInstance.units.find(unit => unit.id === f22Id)
      if (!f22) {
        return null
      }
      return {
        flightState: f22.flightState,
        f22State: f22.f22State,
        helipadLandingRequested: f22.helipadLandingRequested,
        f22PendingTakeoff: f22.f22PendingTakeoff
      }
    }, { f22Id: scenario.f22Id })

    expect(inProgressState).not.toBeNull()
    expect(inProgressState.flightState).toBe('airborne')
    expect(inProgressState.f22State).toBe('approach_runway')
    expect(inProgressState.helipadLandingRequested).toBe(true)
    expect(inProgressState.f22PendingTakeoff).toBe(false)

    expect(consoleErrors).toEqual([])
  })
})
