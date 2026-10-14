import { expect } from '@playwright/test'

export async function prepareRegressionScenario(page, seed) {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto(`/?seed=${seed}`)
  await page.waitForFunction(() => Boolean(
    window.gameState?.gameStarted && window.gameInstance?.units && window.cheatSystem && window.unitCommandsHandler
  ), null, { timeout: 30000 })
  await page.evaluate(async() => {
    const { buildOccupancyMap, removeUnitOccupancy, updateUnitOccupancy } = await import('/src/units.js')
    const { clearBuildingFromMapGrid } = await import('/src/buildings.js')
    const { ensureMultiplayerState } = await import('/src/network/multiplayerStore.js')
    document.querySelector('[aria-label="Skip tutorial"]')?.click()
    document.getElementById('benchmarkModalCloseBtn')?.click()
    const gs = window.gameState
    // An empty partyStates list makes the enemy AI loop drive every party, including the
    // human one (it sold human test buildings for emergency funds). Seed the real party table.
    ensureMultiplayerState()
    const units = window.gameInstance.units
    gs.gamePaused = true
    gs.speedMultiplier = 1
    // Keep both bases alive, but remove starting armies and prepare a flat arena.
    units.splice(0)
    for (const factory of gs.factories || []) factory.budget = 0
    for (let i = gs.buildings.length - 1; i >= 0; i--) {
      const b = gs.buildings[i]
      if (b.x <= 40 && b.x + b.width > 16 && b.y <= 40 && b.y + b.height > 16) {
        clearBuildingFromMapGrid(b, gs.mapGrid, gs.occupancyMap)
        gs.buildings.splice(i, 1)
        // Construction yards also live in gs.factories, where bullets still collide with them.
        const factoryIndex = (gs.factories || []).indexOf(b)
        if (factoryIndex !== -1) gs.factories.splice(factoryIndex, 1)
      }
    }
    for (let y = 16; y <= 40; y++) {
      for (let x = 16; x <= 40; x++) {
        const tile = gs.mapGrid[y][x]
        tile.type = 'land'
        tile.noBuild = 0
        tile.buildOnlyOccupied = 0
        tile.building = null
        tile.ore = 0
        tile.seedCrystal = null
        if (gs.occupancyMap?.[y]) gs.occupancyMap[y][x] = 0
      }
    }
    gs.occupancyMap = buildOccupancyMap(units, gs.mapGrid)
    window.selectedUnitsRef.splice(0)
    gs.scrollOffset.x = 16 * 32
    gs.scrollOffset.y = 16 * 32
    gs.dragVelocity = { x: 0, y: 0 }
    window.__regression = {
      human: gs.humanPlayer || 'player1',
      enemy: gs.humanPlayer === 'player2' ? 'player1' : 'player2',
      unit(type, owner, x, y) {
        const known = new Set(units.map(u => u.id))
        gs.cursorX = x * 32
        gs.cursorY = y * 32
        window.cheatSystem.processCheatCode(`${type} 1 ${owner}`)
        const unit = units.find(u => !known.has(u.id) && u.type === type && u.owner === owner)
        if (!unit) throw new Error(`Failed to spawn ${type}`)
        removeUnitOccupancy(unit, gs.occupancyMap)
        unit.x = x * 32
        unit.y = y * 32
        unit.tileX = Math.floor((unit.x + 16) / 32)
        unit.tileY = Math.floor((unit.y + 16) / 32)
        updateUnitOccupancy(unit, -1, -1, gs.occupancyMap)
        unit.path = []
        unit.moveTarget = null
        unit.target = null
        unit.alertMode = false
        if (type === 'apache') {
          removeUnitOccupancy(unit, gs.occupancyMap, { ignoreFlightState: true })
          unit.flightState = 'airborne'
          unit.altitude = unit.maxAltitude
          unit.manualFlightState = 'hover'
          unit.autoHoldAltitude = true
          unit.occupancyRemoved = true
          unit.groundedOccupancyApplied = false
        }
        return unit
      },
      building(type, owner, x, y) {
        const known = new Set(gs.buildings.map(b => b.id))
        gs.cursorX = x * 32
        gs.cursorY = y * 32
        window.cheatSystem.processCheatCode(`build ${type} ${owner}`)
        const building = gs.buildings.find(b => !known.has(b.id) && b.type === type && b.owner === owner)
        if (!building) throw new Error(`Failed to spawn ${type}`)
        if (building.x !== x || building.y !== y) {
          throw new Error(`Expected ${type} at ${x},${y}; spawned at ${building.x},${building.y}`)
        }
        // The arena removes harvesters and zeroes budgets, so the economy AI would sell fixture
        // buildings for emergency funds. Pin them so only the behaviour under test changes the arena.
        Object.defineProperty(building, 'isBeingSold', { get: () => false, set: () => {}, configurable: true })
        return building
      }
    }
  })
}

// Negative assertions must span actual simulation time, including several weapon cooldowns.
export async function observeSimulation(page, milliseconds) {
  const start = await page.evaluate(() => window.gameState.simulationTime)
  await pollRegressionState(page, `Simulation must advance by ${milliseconds}ms from ${start}`, () => ({
    simulationTime: window.gameState.simulationTime, paused: window.gameState.gamePaused,
    speed: window.gameState.speedMultiplier, started: window.gameState.gameStarted
  }), { paused: false, started: true }, 10000)
  try {
    await page.waitForFunction(({ start, milliseconds }) => window.gameState.simulationTime >= start + milliseconds,
      { start, milliseconds }, { timeout: 90000 })
  } catch (error) {
    const state = await page.evaluate(() => ({ simulationTime: window.gameState.simulationTime,
      paused: window.gameState.gamePaused, speed: window.gameState.speedMultiplier }))
    error.message += `\nSimulation interval ${start} + ${milliseconds}ms: ${JSON.stringify(state)}`
    throw error
  }
}

// Keep the last observed state in timeout errors; booleans alone hide setup failures.
export async function pollRegressionState(page, label, readState, expected, timeout = 30000) {
  let state
  try {
    await expect.poll(async() => {
      state = await page.evaluate(readState)
      return state
    }, { timeout, message: label }).toMatchObject(expected)
  } catch (error) {
    error.message += `\n${label}: ${safeStringify(state)}`
    throw error
  }
}

// Game objects reference each other (unit.target.target...), so drop repeated references.
function safeStringify(value) {
  const seen = new WeakSet()
  return JSON.stringify(value, (key, nested) => {
    if (nested && typeof nested === 'object') {
      if (seen.has(nested)) return '[circular]'
      seen.add(nested)
    }
    return nested
  })
}
