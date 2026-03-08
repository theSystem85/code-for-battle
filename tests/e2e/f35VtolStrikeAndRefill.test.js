import { test, expect } from '@playwright/test'

test.describe('F35 VTOL strike and refill', () => {
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

  test('cheat-spawned F35 destroys multiple queued buildings, returns to helipad, and refills', async({ page }) => {
    test.setTimeout(180000)

    await page.goto('/?seed=13')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      return Boolean(gs && gs.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units)
    }, { timeout: 30000 })

    const scenario = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const buildings = gs.buildings
      const factories = gs.factories || []
      const humanPlayer = gs.humanPlayer || 'player1'
      const normalizeOwner = owner => owner === 'player' ? 'player1' : owner
      const enemyPlayer = (factories.find(factory => normalizeOwner(factory.id) !== normalizeOwner(humanPlayer))?.id) || 'player2'
      const knownUnitIds = new Set(units.map(unit => unit.id))
      const knownBuildingIds = new Set(buildings.map(building => building.id))

      gs.cursorX = 20 * 32
      gs.cursorY = 20 * 32
      window.cheatSystem.processCheatCode(`build helipad ${humanPlayer}`)

      const helipad = buildings.find(building =>
        building.type === 'helipad' &&
        building.owner === humanPlayer &&
        !knownBuildingIds.has(building.id)
      )

      if (!helipad) {
        return { error: 'Failed to build helipad' }
      }

      const hostileBuildingPositions = [
        { x: 42 * 32, y: 18 * 32 },
        { x: 46 * 32, y: 18 * 32 },
        { x: 50 * 32, y: 18 * 32 }
      ]

      const hostileBuildings = []
      const enemyKnownIds = new Set(buildings.map(building => building.id))

      hostileBuildingPositions.forEach(({ x, y }) => {
        gs.cursorX = x
        gs.cursorY = y
        window.cheatSystem.processCheatCode(`build powerPlant ${enemyPlayer}`)
        const created = buildings.find(building =>
          building.type === 'powerPlant' &&
          building.owner === enemyPlayer &&
          !enemyKnownIds.has(building.id)
        )
        if (created) {
          enemyKnownIds.add(created.id)
          created.health = 1
          hostileBuildings.push(created)
        }
      })

      if (hostileBuildings.length !== 3) {
        return { error: `Expected 3 hostile buildings, got ${hostileBuildings.length}` }
      }

      gs.cursorX = (helipad.x + 0.5) * 32
      gs.cursorY = (helipad.y + 0.5) * 32
      window.cheatSystem.processCheatCode(`f35 1 ${humanPlayer}`)

      const f35 = units.find(unit =>
        unit.type === 'f35' &&
        unit.owner === humanPlayer &&
        !knownUnitIds.has(unit.id)
      )

      if (!f35) {
        return { error: 'Failed to spawn F35' }
      }

      f35.x = 45 * 32
      f35.y = 10 * 32
      f35.tileX = Math.floor((f35.x + 16) / 32)
      f35.tileY = Math.floor((f35.y + 16) / 32)
      f35.flightState = 'airborne'
      f35.altitude = Math.max(48, (f35.maxAltitude || 64) * 0.8)
      f35.path = []
      f35.moveTarget = null
      f35.flightPlan = null
      f35.helipadLandingRequested = false
      f35.helipadTargetId = null
      f35.landedHelipadId = null
      f35.groundLandingRequested = false
      f35.groundLandingTarget = null
      f35.landedOnGround = false
      f35.airstripId = null
      f35.airstripParkingSlotIndex = null
      f35.rocketAmmo = 3
      f35.maxRocketAmmo = 6
      f35.gas = Math.floor((f35.maxGas || 8000) * 0.4)
      f35.apacheAmmoEmpty = false
      f35.canFire = true
      f35.target = hostileBuildings[0]
      f35.attackQueue = hostileBuildings.slice(1)
      f35.allowedToAttack = true
      f35.lastShotTime = 0

      return {
        f35Id: f35.id,
        helipadId: helipad.id,
        hostileBuildingIds: hostileBuildings.map(building => building.id)
      }
    })

    expect(scenario.error || '').toBe('')

    await page.waitForFunction(({ hostileBuildingIds }) => {
      const buildings = window.gameState?.buildings || []
      return hostileBuildingIds.every(id => {
        const building = buildings.find(candidate => candidate.id === id)
        return !building || building.health <= 0
      })
    }, scenario, { timeout: 45000 })

    const postStrikeState = await page.evaluate(({ f35Id, hostileBuildingIds }) => {
      const units = window.gameInstance?.units || []
      const buildings = window.gameState?.buildings || []
      const f35 = units.find(unit => unit.id === f35Id)
      return {
        rocketAmmo: f35?.rocketAmmo,
        attackQueueLength: Array.isArray(f35?.attackQueue) ? f35.attackQueue.length : -1,
        destroyedBuildings: hostileBuildingIds.filter(id => {
          const building = buildings.find(candidate => candidate.id === id)
          return !building || building.health <= 0
        }).length
      }
    }, scenario)

    expect(postStrikeState.destroyedBuildings).toBe(3)
    expect(postStrikeState.rocketAmmo).toBe(0)

    await page.waitForFunction(({ f35Id, helipadId }) => {
      const units = window.gameInstance?.units || []
      const buildings = window.gameState?.buildings || []
      const f35 = units.find(unit => unit.id === f35Id)
      const helipad = buildings.find(building => building.id === helipadId)
      if (!f35 || !helipad) return false

      return (
        f35.flightState === 'grounded' &&
        f35.landedHelipadId === helipadId &&
        f35.rocketAmmo >= f35.maxRocketAmmo &&
        f35.gas >= f35.maxGas &&
        helipad.landedUnitId === f35Id
      )
    }, scenario, { timeout: 90000 })

    const finalState = await page.evaluate(({ f35Id, helipadId }) => {
      const units = window.gameInstance?.units || []
      const buildings = window.gameState?.buildings || []
      const f35 = units.find(unit => unit.id === f35Id)
      const helipad = buildings.find(building => building.id === helipadId)
      return {
        flightState: f35?.flightState,
        landedHelipadId: f35?.landedHelipadId,
        rocketAmmo: f35?.rocketAmmo,
        maxRocketAmmo: f35?.maxRocketAmmo,
        gas: f35?.gas,
        maxGas: f35?.maxGas,
        helipadLandedUnitId: helipad?.landedUnitId
      }
    }, scenario)

    expect(finalState.flightState).toBe('grounded')
    expect(finalState.landedHelipadId).toBe(scenario.helipadId)
    expect(finalState.rocketAmmo).toBeGreaterThanOrEqual(finalState.maxRocketAmmo)
    expect(finalState.gas).toBeGreaterThanOrEqual(finalState.maxGas)
    expect(finalState.helipadLandedUnitId).toBe(scenario.f35Id)
    expect(consoleErrors).toEqual([])
  })
})
