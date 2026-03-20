import { test, expect } from '@playwright/test'

test.describe('Service units only affect friendly grounded units', () => {
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

  test('enemy support vehicles do not service airborne aircraft while friendly ground units still can be serviced', async({ page }) => {
    test.setTimeout(120000)

    await page.goto('/?seed=17')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      return Boolean(gs && gs.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units)
    }, { timeout: 30000 })

    const scenario = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const humanPlayer = gs.humanPlayer || 'player1'
      const normalizeOwner = owner => owner === 'player' ? 'player1' : owner
      const enemyPlayer = (gs.factories || []).map(factory => normalizeOwner(factory.id)).find(owner => owner !== normalizeOwner(humanPlayer)) || 'player2'
      const knownIds = new Set(units.map(unit => unit.id))

      const spawnAt = (tileX, tileY, cheat) => {
        gs.cursorX = tileX * 32
        gs.cursorY = tileY * 32
        window.cheatSystem.processCheatCode(cheat)
      }

      spawnAt(24, 24, `ammunitionTruck 1 ${enemyPlayer}`)
      spawnAt(24, 24, `apache 1 ${humanPlayer}`)
      spawnAt(24, 24, `tank_v1 1 ${enemyPlayer}`)
      spawnAt(28, 24, `ammunitionTruck 1 ${humanPlayer}`)
      spawnAt(28, 24, `tank_v1 1 ${humanPlayer}`)
      spawnAt(32, 24, `tankerTruck 1 ${enemyPlayer}`)
      spawnAt(32, 24, `ambulance 1 ${enemyPlayer}`)
      spawnAt(32, 24, `recoveryTank 1 ${enemyPlayer}`)
      spawnAt(32, 24, `tank_v1 1 ${humanPlayer}`)
      spawnAt(36, 24, `tankerTruck 1 ${humanPlayer}`)
      spawnAt(36, 24, `ambulance 1 ${humanPlayer}`)
      spawnAt(36, 24, `recoveryTank 1 ${humanPlayer}`)
      spawnAt(36, 24, `tank_v1 1 ${humanPlayer}`)

      const spawned = units.filter(unit => !knownIds.has(unit.id))
      const enemyAmmoTruck = spawned.find(unit => unit.type === 'ammunitionTruck' && normalizeOwner(unit.owner) === enemyPlayer)
      const apache = spawned.find(unit => unit.type === 'apache' && normalizeOwner(unit.owner) === humanPlayer)
      const enemyAmmoTarget = spawned.find(unit => unit.type === 'tank_v1' && normalizeOwner(unit.owner) === enemyPlayer)
      const friendlyAmmoTruck = spawned.find(unit => unit.type === 'ammunitionTruck' && normalizeOwner(unit.owner) === humanPlayer)
      const friendlyAmmoTarget = spawned.filter(unit => unit.type === 'tank_v1' && normalizeOwner(unit.owner) === humanPlayer)[0]
      const enemyTanker = spawned.find(unit => unit.type === 'tankerTruck' && normalizeOwner(unit.owner) === enemyPlayer)
      const enemyAmbulance = spawned.find(unit => unit.type === 'ambulance' && normalizeOwner(unit.owner) === enemyPlayer)
      const enemyRecovery = spawned.find(unit => unit.type === 'recoveryTank' && normalizeOwner(unit.owner) === enemyPlayer)
      const serviceEnemyTarget = spawned.filter(unit => unit.type === 'tank_v1' && normalizeOwner(unit.owner) === humanPlayer)[1]
      const friendlyTanker = spawned.find(unit => unit.type === 'tankerTruck' && normalizeOwner(unit.owner) === humanPlayer)
      const friendlyAmbulance = spawned.find(unit => unit.type === 'ambulance' && normalizeOwner(unit.owner) === humanPlayer)
      const friendlyRecovery = spawned.find(unit => unit.type === 'recoveryTank' && normalizeOwner(unit.owner) === humanPlayer)
      const serviceFriendlyTarget = spawned.filter(unit => unit.type === 'tank_v1' && normalizeOwner(unit.owner) === humanPlayer)[2]

      if (!enemyAmmoTruck || !apache || !enemyAmmoTarget || !friendlyAmmoTruck || !friendlyAmmoTarget || !enemyTanker || !enemyAmbulance || !enemyRecovery || !serviceEnemyTarget || !friendlyTanker || !friendlyAmbulance || !friendlyRecovery || !serviceFriendlyTarget) {
        return { error: 'Failed to spawn all required units' }
      }

      apache.x = 24 * 32
      apache.y = 24 * 32
      apache.tileX = 24
      apache.tileY = 24
      apache.isAirUnit = true
      apache.flightState = 'airborne'
      apache.altitude = Math.max(apache.maxAltitude || 90, 90)
      apache.rocketAmmo = 1
      apache.maxRocketAmmo = Math.max(apache.maxRocketAmmo || 12, 12)
      apache.movement = { isMoving: false }
      apache.path = []
      apache.moveTarget = null

      enemyAmmoTarget.ammunition = 10
      enemyAmmoTarget.maxAmmunition = enemyAmmoTarget.maxAmmunition || 40
      enemyAmmoTarget.movement = { isMoving: false }
      friendlyAmmoTarget.ammunition = 10
      friendlyAmmoTarget.maxAmmunition = friendlyAmmoTarget.maxAmmunition || 40
      friendlyAmmoTarget.movement = { isMoving: false }

      serviceEnemyTarget.gas = 100
      serviceEnemyTarget.maxGas = serviceEnemyTarget.maxGas || 1000
      serviceEnemyTarget.crew = { driver: false, commander: true, gunner: true, loader: true }
      serviceEnemyTarget.health = 40
      serviceEnemyTarget.maxHealth = 100
      serviceEnemyTarget.movement = { isMoving: false }

      serviceFriendlyTarget.gas = 100
      serviceFriendlyTarget.maxGas = serviceFriendlyTarget.maxGas || 1000
      serviceFriendlyTarget.crew = { driver: false, commander: true, gunner: true, loader: true }
      serviceFriendlyTarget.health = 40
      serviceFriendlyTarget.maxHealth = 100
      serviceFriendlyTarget.movement = { isMoving: false }

      enemyTanker.tileX = 32
      enemyTanker.tileY = 24
      enemyTanker.x = 32 * 32
      enemyTanker.y = 24 * 32
      enemyTanker.supplyGas = enemyTanker.maxSupplyGas || 10000
      enemyTanker.movement = { isMoving: false }
      enemyAmbulance.tileX = 32
      enemyAmbulance.tileY = 24
      enemyAmbulance.x = 32 * 32
      enemyAmbulance.y = 24 * 32
      enemyAmbulance.medics = 5
      enemyAmbulance.movement = { isMoving: false }
      enemyRecovery.tileX = 32
      enemyRecovery.tileY = 24
      enemyRecovery.x = 32 * 32
      enemyRecovery.y = 24 * 32
      enemyRecovery.movement = { isMoving: false }

      friendlyTanker.tileX = 36
      friendlyTanker.tileY = 24
      friendlyTanker.x = 36 * 32
      friendlyTanker.y = 24 * 32
      friendlyTanker.supplyGas = friendlyTanker.maxSupplyGas || 10000
      friendlyTanker.movement = { isMoving: false }
      friendlyAmbulance.tileX = 36
      friendlyAmbulance.tileY = 24
      friendlyAmbulance.x = 36 * 32
      friendlyAmbulance.y = 24 * 32
      friendlyAmbulance.medics = 5
      friendlyAmbulance.movement = { isMoving: false }
      friendlyRecovery.tileX = 36
      friendlyRecovery.tileY = 24
      friendlyRecovery.x = 36 * 32
      friendlyRecovery.y = 24 * 32
      friendlyRecovery.movement = { isMoving: false }

      serviceEnemyTarget.tileX = 32
      serviceEnemyTarget.tileY = 24
      serviceEnemyTarget.x = 32 * 32
      serviceEnemyTarget.y = 24 * 32
      serviceFriendlyTarget.tileX = 36
      serviceFriendlyTarget.tileY = 24
      serviceFriendlyTarget.x = 36 * 32
      serviceFriendlyTarget.y = 24 * 32

      return {
        apacheId: apache.id,
        enemyAmmoTargetId: enemyAmmoTarget.id,
        friendlyAmmoTargetId: friendlyAmmoTarget.id,
        serviceEnemyTargetId: serviceEnemyTarget.id,
        serviceFriendlyTargetId: serviceFriendlyTarget.id
      }
    })

    expect(scenario.error || '').toBe('')

    await page.waitForTimeout(4000)

    const result = await page.evaluate(ids => {
      const units = window.gameInstance?.units || []
      const getUnit = id => units.find(unit => unit.id === id)
      const apache = getUnit(ids.apacheId)
      const enemyAmmoTarget = getUnit(ids.enemyAmmoTargetId)
      const friendlyAmmoTarget = getUnit(ids.friendlyAmmoTargetId)
      const serviceEnemyTarget = getUnit(ids.serviceEnemyTargetId)
      const serviceFriendlyTarget = getUnit(ids.serviceFriendlyTargetId)

      return {
        apacheRocketAmmo: apache?.rocketAmmo,
        apacheFlightState: apache?.flightState,
        enemyAmmo: enemyAmmoTarget?.ammunition,
        friendlyAmmo: friendlyAmmoTarget?.ammunition,
        enemyGas: serviceEnemyTarget?.gas,
        friendlyGas: serviceFriendlyTarget?.gas,
        enemyCrewDriver: serviceEnemyTarget?.crew?.driver,
        friendlyCrewDriver: serviceFriendlyTarget?.crew?.driver,
        enemyHealth: serviceEnemyTarget?.health,
        friendlyHealth: serviceFriendlyTarget?.health
      }
    }, scenario)

    expect(result.apacheFlightState).toBe('airborne')
    expect(result.apacheRocketAmmo).toBe(1)
    expect(result.enemyAmmo).toBe(10)
    expect(result.friendlyAmmo).toBeGreaterThan(10)
    expect(result.enemyGas).toBe(100)
    expect(result.friendlyGas).toBeGreaterThan(100)
    expect(result.enemyCrewDriver).toBe(false)
    expect(result.friendlyCrewDriver).toBe(true)
    expect(result.enemyHealth).toBe(40)
    expect(result.friendlyHealth).toBeGreaterThan(40)
    expect(consoleErrors).toEqual([])
  })
})
