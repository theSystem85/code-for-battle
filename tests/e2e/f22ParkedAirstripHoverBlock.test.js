import { test, expect } from '@playwright/test'

test.describe('F22 parked airstrip command guard', () => {
  /** @type {string[]} */
  let consoleErrors = []
  let checkingCommands = false

  test.beforeEach(async({ page }) => {
    consoleErrors = []
    checkingCommands = false

    page.on('console', msg => {
      if (checkingCommands && msg.type() === 'error') {
        consoleErrors.push(`${msg.text()} (${msg.location().url})`)
      }
    })

    page.on('pageerror', error => {
      if (checkingCommands) consoleErrors.push(`Page error: ${error.message}`)
    })

    await page.addInitScript(() => {
      localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('rts_tutorial_progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })
  })

  test('[E00038] parked F22 shows blocked cursor on its own airstrip, move-into on another, and does not relaunch on right click', async({ page }) => {
    await page.goto('/?seed=11&size=64&players=2&oreFields=8')

    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => {
      const gs = window.gameState
      if (!gs) return false
      if (gs.gameStarted && gs.gamePaused) {
        gs.gamePaused = false
      }
      return gs.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units
    }, { timeout: 30000 })

    await expect(page.locator('#loadingScreen')).toHaveClass(/loading-screen--hidden/)

    const scenario = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const buildings = gs.buildings
      const humanPlayer = gs.humanPlayer || 'player1'

      const knownBuildingIds = new Set(buildings.map(building => building.id))
      const knownUnitIds = new Set(units.map(unit => unit.id))

      const spawnPositions = [
        { x: 8 * 32, y: 26 * 32 },
        { x: 24 * 32, y: 26 * 32 }
      ]

      // Provide two clear land footprints on the small fixture map. Airstrip
      // placement must not depend on which coast the seeded terrain generated.
      for (const pos of spawnPositions) {
        for (let y = pos.y / 32; y < pos.y / 32 + 6; y++) {
          for (let x = pos.x / 32; x < pos.x / 32 + 12; x++) {
            const tile = gs.mapGrid[y][x]
            if (tile.building) return { error: 'Fixture land overlaps an existing building' }
            tile.type = 'land'
            tile.seedCrystal = false
            gs.occupancyMap[y][x] = 0
          }
        }
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

      // Keep both fixture airstrips inside the playable viewport. The startup
      // camera follows the generated base, which need not be near these tiles.
      const canvas = document.getElementById('gameCanvas').getBoundingClientRect()
      const homeCenterX = (homeAirstrip.x + homeAirstrip.width / 2) * 32
      const otherCenterX = (otherAirstrip.x + otherAirstrip.width / 2) * 32
      const centerY = (homeAirstrip.y + homeAirstrip.height / 2) * 32
      gs.scrollOffset.x = Math.max(0, (homeCenterX + otherCenterX) / 2 - canvas.width / 2)
      gs.scrollOffset.y = Math.max(0, centerY - canvas.height / 2)
      gs.dragVelocity.x = 0
      gs.dragVelocity.y = 0
      gs.smoothScroll.active = false
      // Inspect input command guards without allowing flight simulation to
      // advance the manually configured parked and approach states.
      gs.gamePaused = true
      window.gameInstance.gameLoop.requestRender()


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
    // Camera relocation and cheat spawning load optional assets and cancel
    // obsolete preparation requests. Observe errors from the command exercise
    // after that fixture setup settles, rather than unrelated startup traffic.
    await page.waitForLoadState('networkidle')
    checkingCommands = true

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

    await expect(page.locator('#gameCanvas')).toHaveClass(/move-blocked-mode/)

    const otherCursorPoint = await toScreen(scenario.otherCenter)
    await page.mouse.move(otherCursorPoint.x, otherCursorPoint.y)

    await expect(page.locator('#gameCanvas')).toHaveClass(/move-into-mode/)

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
      // Right-click deselects units. Select the aircraft again before checking
      // whether a new landing command is blocked during its active approach.
      const selected = window.debugGetSelectedUnits()
      selected.length = 0
      selected.push(f22)
      f22.selected = true
      f22.flightState = 'airborne'
      f22.f22State = 'approach_runway'
      f22.helipadLandingRequested = true
      f22.airstripId = f22.landedHelipadId
      f22.helipadTargetId = f22.landedHelipadId
      f22.f22PendingTakeoff = false
    }, { f22Id: scenario.f22Id })

    await page.mouse.move(homeCursorPoint.x + 1, homeCursorPoint.y)
    await page.mouse.move(homeCursorPoint.x, homeCursorPoint.y)
    await expect(page.locator('#gameCanvas')).toHaveClass(/move-blocked-mode/)

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
