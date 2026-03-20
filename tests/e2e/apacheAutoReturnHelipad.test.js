import { test, expect } from '@playwright/test'

test.describe('Apache helipad auto-return regression', () => {
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

  test('cheat-spawned apache attacks with low ammo, auto-returns to helipad, refills, and resumes attack', async({ page }) => {
    await page.goto('/?seed=11')

    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForSelector('#sidebar', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      if (!gs) return false
      if (gs.gameStarted && gs.gamePaused) {
        gs.gamePaused = false
      }
      return gs.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units
    }, { timeout: 30000 })

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const skipTutorialBtn = buttons.find(button =>
        button.getAttribute('aria-label') === 'Skip tutorial' ||
        button.textContent?.trim() === 'Skip tutorial'
      )
      if (skipTutorialBtn && typeof skipTutorialBtn.click === 'function') {
        skipTutorialBtn.click()
      }

      const benchmarkCloseBtn = document.getElementById('benchmarkModalCloseBtn') ||
        document.getElementById('benchmarkModalCloseFooterBtn')
      if (benchmarkCloseBtn && typeof benchmarkCloseBtn.click === 'function') {
        benchmarkCloseBtn.click()
      }

      if (window.gameState?.gamePaused) {
        window.gameState.gamePaused = false
      }
    })

    // Center camera on the spawn location before starting the test
    await page.evaluate(() => {
      const gs = window.gameState
      const canvas = document.getElementById('gameCanvas')
      const logicalCanvasWidth = canvas ? canvas.width / window.devicePixelRatio : 800
      const logicalCanvasHeight = canvas ? canvas.height / window.devicePixelRatio : 600

      // Center on helipad spawn position (22*32, 22*32)
      const focusX = 22 * 32
      const focusY = 22 * 32

      gs.scrollOffset.x = Math.max(0, Math.min(
        focusX - logicalCanvasWidth / 2,
        (gs.mapGrid ? gs.mapGrid[0].length * 32 : 100 * 32) - logicalCanvasWidth
      ))

      gs.scrollOffset.y = Math.max(0, Math.min(
        focusY - logicalCanvasHeight / 2,
        (gs.mapGrid ? gs.mapGrid.length * 32 : 100 * 32) - logicalCanvasHeight
      ))

      gs.dragVelocity = { x: 0, y: 0 }
    })

    const scenario = await page.evaluate(() => {
      const gs = window.gameState
      const humanPlayer = gs.humanPlayer || 'player1'
      const units = window.gameInstance.units
      const knownUnitIds = new Set(units.map(unit => unit.id))

      // Calculate helipad spawn position
      const helipadSpawnX = 22 * 32
      const helipadSpawnY = 22 * 32

      return {
        helipadSpawnX,
        helipadSpawnY,
        humanPlayer,
        knownUnitIds: Array.from(knownUnitIds)
      }
    })

    // Click on the map where the helipad should be spawned
    const canvas = await page.$('#gameCanvas')
    const canvasBox = await canvas.boundingBox()
    await page.mouse.click(
      canvasBox.x + scenario.helipadSpawnX,
      canvasBox.y + scenario.helipadSpawnY
    )

    const scenarioAfterHelipad = await page.evaluate(({ helipadSpawnX, helipadSpawnY, humanPlayer, knownUnitIds }) => {
      const gs = window.gameState

      gs.cursorX = helipadSpawnX
      gs.cursorY = helipadSpawnY
      window.cheatSystem.processCheatCode('build helipad')

      const helipadCandidates = gs.buildings.filter(building =>
        building.type === 'helipad' && building.owner === humanPlayer
      )
      const helipad = helipadCandidates[helipadCandidates.length - 1]
      if (!helipad) {
        return null
      }

      const padCenterX = (helipad.x + helipad.width / 2) * 32
      const padCenterY = (helipad.y + helipad.height / 2) * 32

      // Calculate apache spawn position
      const apacheSpawnX = padCenterX + 32
      const apacheSpawnY = padCenterY + 32

      return {
        apacheSpawnX,
        apacheSpawnY,
        helipadId: helipad.id,
        padCenterX,
        padCenterY,
        humanPlayer,
        knownUnitIds
      }
    }, scenario)

    expect(scenarioAfterHelipad).not.toBeNull()

    // Click on the map where the apache should be spawned
    await page.mouse.click(
      canvasBox.x + scenarioAfterHelipad.apacheSpawnX,
      canvasBox.y + scenarioAfterHelipad.apacheSpawnY
    )

    const scenarioAfterApache = await page.evaluate(({ apacheSpawnX, apacheSpawnY, helipadId, padCenterX, padCenterY, humanPlayer, knownUnitIds }) => {
      const gs = window.gameState
      const units = window.gameInstance.units

      gs.cursorX = apacheSpawnX
      gs.cursorY = apacheSpawnY
      window.cheatSystem.processCheatCode(`apache 1 ${humanPlayer}`)

      const spawned = units.filter(unit => !knownUnitIds.includes(unit.id))
      const apache = spawned.find(unit => unit.type === 'apache' && unit.owner === humanPlayer)
      if (!apache) {
        return null
      }

      apache.x = padCenterX + 64
      apache.y = padCenterY + 64
      apache.tileX = Math.floor(apache.x / 32)
      apache.tileY = Math.floor(apache.y / 32)
      apache.flightState = 'airborne'
      apache.path = []
      apache.moveTarget = null
      apache.flightPlan = null
      apache.helipadLandingRequested = true
      apache.helipadTargetId = helipadId
      apache.landedHelipadId = null
      apache.autoHelipadReturnActive = false
      apache.autoHelipadReturnTargetId = null
      apache.autoHelipadRetryAt = 0
      apache.rocketAmmo = apache.maxRocketAmmo || 38
      apache.apacheAmmoEmpty = false
      apache.canFire = true
      apache.target = null
      apache.manualFlightState = 'land'
      apache.autoHoldAltitude = false

      return {
        apacheId: apache.id,
        helipadId,
        humanPlayer,
        apacheX: apache.x,
        apacheY: apache.y
      }
    }, scenarioAfterHelipad)

    expect(scenarioAfterApache).not.toBeNull()

    const landingCommandIssued = await page.evaluate(({ apacheId, helipadId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      return Boolean(
        apache &&
        apache.helipadLandingRequested === true &&
        apache.helipadTargetId === helipadId
      )
    }, scenarioAfterApache)

    expect(landingCommandIssued).toBe(true)

    await page.evaluate(({ apacheId, helipadId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      const helipad = window.gameState.buildings.find(building => building.id === helipadId)
      if (!apache || !helipad) return

      const padCenterX = (helipad.x + helipad.width / 2) * 32
      const padCenterY = (helipad.y + helipad.height / 2) * 32
      apache.x = padCenterX - 16
      apache.y = padCenterY - 16
      apache.tileX = Math.floor(apache.x / 32)
      apache.tileY = Math.floor(apache.y / 32)
      apache.flightState = 'grounded'
      apache.landedHelipadId = helipadId
      helipad.landedUnitId = apache.id
      apache.helipadLandingRequested = false
    }, scenarioAfterApache)

    await page.evaluate(({ apacheId, helipadId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      const helipad = window.gameState.buildings.find(building => building.id === helipadId)
      if (!apache || !helipad) return

      apache.flightState = 'airborne'
      apache.manualFlightState = 'takeoff'
      apache.autoHoldAltitude = true
      apache.helipadLandingRequested = false
      apache.landedHelipadId = null
      apache.helipadTargetId = null
      apache.moveTarget = {
        x: helipad.x + helipad.width + 2,
        y: helipad.y + 1
      }
      apache.flightPlan = {
        x: (helipad.x + helipad.width + 2) * 32,
        y: (helipad.y + 1) * 32,
        stopRadius: 12,
        mode: 'direct',
        followTargetId: null,
        destinationTile: {
          x: helipad.x + helipad.width + 2,
          y: helipad.y + 1
        }
      }
      helipad.landedUnitId = null
    }, scenarioAfterApache)

    await page.waitForFunction(({ apacheId, helipadId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      const helipad = window.gameState.buildings.find(building => building.id === helipadId)
      if (!apache || !helipad) return false

      const helipadCenterX = (helipad.x + helipad.width / 2) * 32
      const helipadCenterY = (helipad.y + helipad.height / 2) * 32
      const apacheCenterX = apache.x + 16
      const apacheCenterY = apache.y + 16
      const distance = Math.hypot(apacheCenterX - helipadCenterX, apacheCenterY - helipadCenterY)

      return apache.flightState === 'airborne' && distance > 64
    }, scenarioAfterApache, { timeout: 15000 })

    const tankSpawnScenario = await page.evaluate(({ apacheId, humanPlayer }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      if (!apache) return null

      const spawnX = Math.floor(apache.x / 32) + 2
      const spawnY = Math.floor(apache.y / 32)

      return {
        apacheId,
        humanPlayer,
        spawnX: spawnX * 32,
        spawnY: spawnY * 32,
        tileSpawnX: spawnX,
        tileSpawnY: spawnY
      }
    }, scenarioAfterApache)

    // Click on the map where the tank should be spawned
    await page.mouse.click(
      canvasBox.x + tankSpawnScenario.spawnX,
      canvasBox.y + tankSpawnScenario.spawnY
    )

    await page.evaluate(({ apacheId, humanPlayer, spawnX, spawnY, tileSpawnX, tileSpawnY }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      if (!apache) return

      window.cheatSystem.setSelectedUnitsRef([apache])
      window.cheatSystem.processCheatCode('ammo 1')

      window.gameState.cursorX = spawnX
      window.gameState.cursorY = spawnY
      window.cheatSystem.processCheatCode('tank_v1 1 player2')

      const enemy = window.gameInstance.units.find(unit =>
        unit.type === 'tank_v1' &&
        unit.owner !== humanPlayer &&
        unit.health > 0 &&
        Math.abs(Math.floor(unit.x / 32) - tileSpawnX) <= 2 &&
        Math.abs(Math.floor(unit.y / 32) - tileSpawnY) <= 2
      )

      if (!enemy) return

      apache.selected = true
      apache.target = enemy
      apache.allowedToAttack = true
      apache.attackMoving = false
      apache.autoHelipadReturnAttackTargetId = null
      apache.autoHelipadReturnActive = false
    }, tankSpawnScenario)

    // Enable auto-focus on the selected Apache helicopter
    await page.keyboard.down('Shift')
    await page.keyboard.press('E')
    await page.keyboard.up('Shift')

    const combatState = await page.waitForFunction(({ apacheId, humanPlayer }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      if (!apache || !apache.target) return null

      const enemyId = apache.target.id
      const enemy = window.gameInstance.units.find(unit => unit.id === enemyId && unit.owner !== humanPlayer)
      if (!enemy) return null

      const damaged = typeof enemy.maxHealth === 'number' && enemy.health < enemy.maxHealth
      if (!damaged) return null

      return {
        enemyId,
        enemyHealthAfterHit: enemy.health
      }
    }, tankSpawnScenario, { timeout: 15000 })

    const combatStateValue = await combatState.jsonValue()
    expect(combatStateValue).not.toBeNull()

    await page.waitForFunction(({ apacheId, helipadId, enemyId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      if (!apache) return false

      return (
        apache.helipadLandingRequested === true &&
        apache.helipadTargetId === helipadId &&
        apache.autoHelipadReturnActive === true &&
        apache.autoHelipadReturnAttackTargetId === enemyId
      )
    }, {
      ...scenarioAfterApache,
      enemyId: combatStateValue.enemyId
    }, { timeout: 20000 })

    await page.evaluate(({ apacheId, helipadId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      const helipad = window.gameState.buildings.find(building => building.id === helipadId)
      if (!apache || !helipad) return

      const padCenterX = (helipad.x + helipad.width / 2) * 32
      const padCenterY = (helipad.y + helipad.height / 2) * 32
      apache.x = padCenterX - 16 + 6
      apache.y = padCenterY - 16 + 6
      apache.tileX = Math.floor(apache.x / 32)
      apache.tileY = Math.floor(apache.y / 32)
      apache.flightState = 'airborne'
    }, scenarioAfterApache)

    await page.waitForFunction(({ apacheId, helipadId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      if (!apache) return false

      return (
        apache.flightState === 'grounded' &&
        apache.landedHelipadId === helipadId &&
        apache.rotorSound == null &&
        apache.rotorSoundLoading === false
      )
    }, scenarioAfterApache, { timeout: 30000 })

    await page.waitForFunction(({ apacheId, enemyId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      const enemy = window.gameInstance.units.find(unit => unit.id === enemyId)
      if (!apache || !enemy || enemy.health <= 0) return false

      return (
        apache.flightState !== 'grounded' &&
        apache.landedHelipadId === null &&
        apache.target &&
        apache.target.id === enemyId &&
        apache.autoHelipadReturnActive === false &&
        apache.helipadLandingRequested === false &&
        apache.rocketAmmo > 0 &&
        apache.canFire === true
      )
    }, {
      apacheId: scenarioAfterApache.apacheId,
      enemyId: combatStateValue.enemyId
    }, { timeout: 35000 })

    const postState = await page.evaluate(({ apacheId, enemyId, helipadId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      const enemy = window.gameInstance.units.find(unit => unit.id === enemyId)
      const helipad = window.gameState.buildings.find(building => building.id === helipadId)
      return {
        apacheFound: Boolean(apache),
        enemyFound: Boolean(enemy),
        helipadFound: Boolean(helipad),
        autoReturnActive: apache?.autoHelipadReturnActive,
        helipadLandingRequested: apache?.helipadLandingRequested,
        ammo: apache?.rocketAmmo,
        flightState: apache?.flightState,
        currentTargetId: apache?.target?.id || null,
        canFire: apache?.canFire,
        enemyHealth: enemy?.health,
        enemyMaxHealth: enemy?.maxHealth
      }
    }, {
      apacheId: scenarioAfterApache.apacheId,
      enemyId: combatStateValue.enemyId,
      helipadId: scenarioAfterApache.helipadId
    })

    expect(postState.apacheFound).toBe(true)
    expect(postState.enemyFound).toBe(true)
    expect(postState.helipadFound).toBe(true)
    expect(postState.currentTargetId).toBe(combatStateValue.enemyId)
    expect(postState.canFire).toBe(true)
    expect(postState.ammo).toBeGreaterThan(0)
    expect(postState.flightState).not.toBe('grounded')
    expect(postState.helipadLandingRequested).toBe(false)
    expect(postState.enemyHealth).toBeLessThan(postState.enemyMaxHealth)

    await page.evaluate(({ apacheId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      if (!apache) return

      apache.flightState = 'airborne'
      apache.altitude = apache.maxAltitude || 100
      apache.manualFlightState = 'auto'
      apache.autoHoldAltitude = true
      apache.moveTarget = { x: Math.floor(apache.x / 32) + 2, y: Math.floor(apache.y / 32) }
      apache.health = 100
      apache.destroyed = false
      window.__apacheDestroyedStopArgs = null
    }, { apacheId: scenarioAfterApache.apacheId })

    await page.waitForFunction(({ apacheId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      return Boolean(apache?.rotorSound)
    }, { apacheId: scenarioAfterApache.apacheId })

    await page.evaluate(({ apacheId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      if (!apache?.rotorSound?.source) return

      const originalStop = apache.rotorSound.source.stop.bind(apache.rotorSound.source)
      apache.rotorSound.source.stop = (...args) => {
        window.__apacheDestroyedStopArgs = args
        return originalStop(...args)
      }
    }, { apacheId: scenarioAfterApache.apacheId })

    await page.evaluate(({ apacheId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      if (!apache) return
      apache.health = 0
    }, { apacheId: scenarioAfterApache.apacheId })

    const destroyedAudioState = await page.waitForFunction(({ apacheId }) => {
      const apache = window.gameInstance.units.find(unit => unit.id === apacheId)
      const stopArgs = window.__apacheDestroyedStopArgs
      if (apache) return false
      if (!Array.isArray(stopArgs)) return false
      return { stopArgs }
    }, { apacheId: scenarioAfterApache.apacheId }).then(result => result.jsonValue())

    expect(destroyedAudioState.stopArgs.length).toBeGreaterThan(0)

    const criticalErrors = consoleErrors.filter(error =>
      !error.includes('favicon') &&
      !error.includes('404') &&
      !error.includes('net::ERR') &&
      !error.includes('ResizeObserver')
    )

    expect(criticalErrors).toHaveLength(0)
  })
})
