import { test, expect } from '@playwright/test'

test.describe('Service building range parity', () => {
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

  test('gas stations and ammunition factories service tanks at hospital-range distance', async({ page }) => {
    test.setTimeout(120000)

    await page.goto('/?seed=21')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      return Boolean(gs && gs.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units)
    }, { timeout: 30000 })

    const scenario = await page.evaluate(() => {
      const TILE_SIZE = 32
      const gs = window.gameState
      const buildings = gs.buildings
      const units = window.gameInstance.units
      const humanPlayer = gs.humanPlayer || 'player1'
      const knownBuildingIds = new Set(buildings.map(building => building.id))
      const knownUnitIds = new Set(units.map(unit => unit.id))

      const spawnBuilding = (tileX, tileY, command, type) => {
        gs.cursorX = tileX * TILE_SIZE
        gs.cursorY = tileY * TILE_SIZE
        window.cheatSystem.processCheatCode(command)
        return buildings.find(building => building.type === type && building.owner === humanPlayer && !knownBuildingIds.has(building.id))
      }

      const spawnUnit = (tileX, tileY, command, type) => {
        gs.cursorX = tileX * TILE_SIZE
        gs.cursorY = tileY * TILE_SIZE
        window.cheatSystem.processCheatCode(command)
        return units.find(unit => unit.type === type && unit.owner === humanPlayer && !knownUnitIds.has(unit.id))
      }

      const gasStation = spawnBuilding(10, 10, `build gasStation ${humanPlayer}`, 'gasStation')
      if (!gasStation) return { error: 'Failed to spawn gas station' }
      knownBuildingIds.add(gasStation.id)

      const ammunitionFactory = spawnBuilding(30, 10, `build ammunitionFactory ${humanPlayer}`, 'ammunitionFactory')
      if (!ammunitionFactory) return { error: 'Failed to spawn ammunition factory' }
      knownBuildingIds.add(ammunitionFactory.id)

      const gasTank = spawnUnit(16, 11, `tank_v1 1 ${humanPlayer}`, 'tank_v1')
      if (!gasTank) return { error: 'Failed to spawn gas test tank' }
      knownUnitIds.add(gasTank.id)

      const ammoTank = spawnUnit(35, 11, `tank_v1 1 ${humanPlayer}`, 'tank_v1')
      if (!ammoTank) return { error: 'Failed to spawn ammo test tank' }
      knownUnitIds.add(ammoTank.id)

      const placeUnit = (unit, tileX, tileY) => {
        unit.x = tileX * TILE_SIZE
        unit.y = tileY * TILE_SIZE
        unit.tileX = tileX
        unit.tileY = tileY
        unit.path = []
        unit.moveTarget = null
        unit.target = null
        unit.movement = { isMoving: false }
      }

      placeUnit(gasTank, 16, 11)
      placeUnit(ammoTank, 35, 11)

      gasTank.gas = 0
      gasTank.refueling = false
      gasTank.gasRefillTimer = 0

      ammoTank.ammunition = 0
      ammoTank.resupplyingAmmo = false
      ammoTank.ammoRefillTimer = 0

      const gasDistanceTiles = Math.hypot((16 + 0.5) - (gasStation.x + gasStation.width / 2), (11 + 0.5) - (gasStation.y + gasStation.height / 2))
      const ammoDistanceTiles = Math.hypot((35 + 0.5) - (ammunitionFactory.x + ammunitionFactory.width / 2), (11 + 0.5) - (ammunitionFactory.y + ammunitionFactory.height / 2))

      return {
        gasStationId: gasStation.id,
        ammunitionFactoryId: ammunitionFactory.id,
        gasTankId: gasTank.id,
        ammoTankId: ammoTank.id,
        gasDistanceTiles,
        ammoDistanceTiles
      }
    })

    expect(scenario.error || '').toBe('')
    expect(scenario.gasDistanceTiles).toBeGreaterThan(2.828)
    expect(scenario.gasDistanceTiles).toBeLessThan(5.657)
    expect(scenario.ammoDistanceTiles).toBeGreaterThan(2.828)
    expect(scenario.ammoDistanceTiles).toBeLessThan(5.657)

    await page.waitForFunction(({ gasTankId, ammoTankId }) => {
      const units = window.gameInstance?.units || []
      const gasTank = units.find(unit => unit.id === gasTankId)
      const ammoTank = units.find(unit => unit.id === ammoTankId)
      return Boolean(
        gasTank && gasTank.gas > 0 && gasTank.refueling &&
        ammoTank && ammoTank.ammunition > 0 && ammoTank.resupplyingAmmo
      )
    }, scenario, { timeout: 20000 })

    const finalState = await page.evaluate(({ gasTankId, ammoTankId }) => {
      const units = window.gameInstance?.units || []
      const gasTank = units.find(unit => unit.id === gasTankId)
      const ammoTank = units.find(unit => unit.id === ammoTankId)
      return {
        gas: gasTank?.gas,
        maxGas: gasTank?.maxGas,
        refueling: gasTank?.refueling,
        ammunition: ammoTank?.ammunition,
        maxAmmunition: ammoTank?.maxAmmunition,
        resupplyingAmmo: ammoTank?.resupplyingAmmo
      }
    }, scenario)

    expect(finalState.gas).toBeGreaterThan(0)
    expect(finalState.gas).toBeLessThanOrEqual(finalState.maxGas)
    expect(finalState.refueling).toBe(true)
    expect(finalState.ammunition).toBeGreaterThan(0)
    expect(finalState.ammunition).toBeLessThanOrEqual(finalState.maxAmmunition)
    expect(finalState.resupplyingAmmo).toBe(true)
    expect(consoleErrors).toEqual([])
  })
})
