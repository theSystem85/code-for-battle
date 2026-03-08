import { test, expect } from '@playwright/test'

test.describe('Enemy F35 production parity and strike targeting', () => {
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

  test('enemy AI adds an F35 to match planned F22 count and sends it to an anti-air-uncovered ground building', async({ page }) => {
    test.setTimeout(150000)

    await page.goto('/?seed=23')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      return Boolean(gs?.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units && Array.isArray(gs.factories))
    }, { timeout: 30000 })

    const setup = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const buildings = gs.buildings || []
      const humanPlayer = gs.humanPlayer || 'player1'
      const enemyPlayer = humanPlayer === 'player1' ? 'player2' : 'player1'
      const knownUnitIds = new Set(units.map(u => u.id))

      const enemyBaseBuilding = buildings.find(b => b.owner === enemyPlayer && b.health > 0)
      const humanBaseBuilding = buildings.find(b => b.owner === humanPlayer && b.health > 0)
      if (!enemyBaseBuilding || !humanBaseBuilding) {
        return { error: 'Missing enemy or human base building for setup' }
      }

      const spawnAt = (tileX, tileY, command) => {
        gs.cursorX = tileX * 32
        gs.cursorY = tileY * 32
        window.cheatSystem.processCheatCode(command)
      }

      const enemyX = enemyBaseBuilding.x + 6
      const enemyY = enemyBaseBuilding.y + 4
      spawnAt(enemyX + 0, enemyY + 0, `build airstrip ${enemyPlayer}`)
      spawnAt(enemyX + 4, enemyY + 0, `build hospital ${enemyPlayer}`)
      spawnAt(enemyX + 8, enemyY + 0, `build rocketTurret ${enemyPlayer}`)
      spawnAt(enemyX + 10, enemyY + 0, `build teslaCoil ${enemyPlayer}`)
      spawnAt(enemyX + 12, enemyY + 0, `build artilleryTurret ${enemyPlayer}`)

      spawnAt(enemyX + 2, enemyY + 3, `f22Raptor 1 ${enemyPlayer}`)
      spawnAt(enemyX + 2, enemyY + 4, `harvester 4 ${enemyPlayer}`)
      spawnAt(enemyX + 2, enemyY + 5, `tankerTruck 1 ${enemyPlayer}`)
      spawnAt(enemyX + 2, enemyY + 6, `ambulance 1 ${enemyPlayer}`)
      spawnAt(enemyX + 2, enemyY + 7, `tank_v1 1 ${enemyPlayer}`)

      const humanX = humanBaseBuilding.x + 8
      const humanY = humanBaseBuilding.y + 5
      spawnAt(humanX + 0, humanY + 0, `build powerPlant ${humanPlayer}`)
      spawnAt(humanX + 6, humanY + 0, `build oreRefinery ${humanPlayer}`)
      spawnAt(humanX + 0, humanY + 1, `rocketTank 1 ${humanPlayer}`)

      const spawned = units.filter(u => !knownUnitIds.has(u.id))
      const enemyF22 = spawned.find(u => u.owner === enemyPlayer && u.type === 'f22Raptor')
      const enemyHunter = spawned.find(u => u.owner === enemyPlayer && u.type === 'tank_v1')
      const humanRocketTank = spawned.find(u => u.owner === humanPlayer && u.type === 'rocketTank')
      const humanPowerPlant = (gs.buildings || []).find(b => b.owner === humanPlayer && b.type === 'powerPlant')
      const humanRefinery = (gs.buildings || []).find(b => b.owner === humanPlayer && b.type === 'oreRefinery')
      if (!enemyF22 || !enemyHunter || !humanRocketTank || !humanPowerPlant || !humanRefinery) {
        return { error: 'Failed to create parity/targeting scenario units and buildings' }
      }

      enemyHunter.harvesterHunter = true
      enemyHunter.lastDecisionTime = 0

      humanRocketTank.x = (humanPowerPlant.x + 1) * 32
      humanRocketTank.y = (humanPowerPlant.y + 1) * 32
      humanRocketTank.tileX = Math.floor(humanRocketTank.x / 32)
      humanRocketTank.tileY = Math.floor(humanRocketTank.y / 32)
      humanRocketTank.path = []
      humanRocketTank.moveTarget = null

      const aiFactory = (gs.factories || []).find(f => (f.id === enemyPlayer || f.owner === enemyPlayer) && f.health > 0)
      if (!aiFactory) {
        return { error: 'Missing enemy AI factory state' }
      }

      aiFactory.budget = Math.max(aiFactory.budget || 0, 30000)
      aiFactory.currentlyProducingUnit = null
      aiFactory.unitBuildStartTime = null
      aiFactory.unitBuildDuration = null
      aiFactory.unitSpawnBuilding = null
      gs[`${enemyPlayer}LastProductionTime`] = 0

      window.__enemyF35ParityE2E = {
        enemyPlayer,
        humanPlayer,
        expectedTargetBuildingId: humanRefinery.id,
        guardedBuildingId: humanPowerPlant.id,
        setupTimestamp: Date.now()
      }

      return { ok: true }
    })

    expect(setup.error || null).toBeNull()

    const parityHandle = await page.waitForFunction(() => {
      const tracker = window.__enemyF35ParityE2E
      if (!tracker) return false

      const units = window.gameInstance?.units || []
      const f22Count = units.filter(u => u.owner === tracker.enemyPlayer && u.type === 'f22Raptor' && u.health > 0).length
      const f35s = units.filter(u => u.owner === tracker.enemyPlayer && u.type === 'f35' && u.health > 0)
      if (f22Count < 1 || f35s.length < 1) return false

      const newestF35 = f35s.reduce((latest, candidate) => {
        if (!latest) return candidate
        return (candidate.spawnTime || 0) > (latest.spawnTime || 0) ? candidate : latest
      }, null)

      if (!newestF35) return false
      newestF35.lastDecisionTime = 0
      newestF35.lastTargetChangeTime = 0

      const target = newestF35.target
      const pickedExpectedGroundBuilding = Boolean(target && target.id === tracker.expectedTargetBuildingId)
      const avoidedGuardedBuilding = !target || target.id !== tracker.guardedBuildingId
      if (!pickedExpectedGroundBuilding || !avoidedGuardedBuilding) {
        return false
      }

      return {
        f22Count,
        f35Count: f35s.length,
        newestF35Id: newestF35.id,
        targetId: target?.id || null,
        targetType: target?.type || null
      }
    }, { timeout: 80000 })

    const result = await parityHandle.jsonValue()

    expect(result.f22Count).toBeGreaterThanOrEqual(1)
    expect(result.f35Count).toBeGreaterThanOrEqual(1)
    expect(result.targetId).toBeTruthy()
    expect(result.targetType).toBe('oreRefinery')

    expect(consoleErrors, `Console errors encountered:\n${consoleErrors.join('\n')}`).toEqual([])
  })
})
