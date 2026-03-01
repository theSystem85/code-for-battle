import { test, expect } from '@playwright/test'

test.describe('Enemy F22 runway discipline and targeting priorities', () => {
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

  test('enemy F22 stays on airstrip while grounded, prioritizes ore-field harvesters, then unprotected defenses', async({ page }) => {
    test.setTimeout(120000)

    await page.goto('/?seed=19')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      return Boolean(gs?.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units)
    }, { timeout: 30000 })

    const setup = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const humanPlayer = gs.humanPlayer || 'player1'
      const enemyPlayer = humanPlayer === 'player1' ? 'player2' : 'player1'
      const knownUnitIds = new Set(units.map(u => u.id))

      gs.cursorX = 24 * 32
      gs.cursorY = 24 * 32
      window.cheatSystem.processCheatCode(`build airstrip ${enemyPlayer}`)
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${enemyPlayer}`)
      window.cheatSystem.processCheatCode(`harvester 1 ${humanPlayer}`)

      gs.cursorX = 32 * 32
      gs.cursorY = 18 * 32
      window.cheatSystem.processCheatCode(`build turretGunV1 ${humanPlayer}`)

      const spawned = units.filter(u => !knownUnitIds.has(u.id))
      const enemyF22 = spawned.find(u => u.type === 'f22Raptor' && u.owner === enemyPlayer)
      const humanHarvester = spawned.find(u => u.type === 'harvester' && u.owner === humanPlayer)
      const defenseBuilding = (gs.buildings || []).find(
        b => b.owner === humanPlayer && b.type === 'turretGunV1'
      )

      if (!enemyF22 || !humanHarvester || !defenseBuilding) {
        return { error: 'Failed to create enemy F22, human harvester, and defense building' }
      }

      const oreTile = (() => {
        for (let y = 0; y < gs.mapGrid.length; y++) {
          for (let x = 0; x < gs.mapGrid[0].length; x++) {
            const tile = gs.mapGrid[y][x]
            if (tile?.ore && !tile.seedCrystal && !tile.building) {
              return { x, y }
            }
          }
        }
        return null
      })()

      if (!oreTile) {
        return { error: 'No free ore tile found for harvester targeting scenario' }
      }

      humanHarvester.x = oreTile.x * 32
      humanHarvester.y = oreTile.y * 32
      humanHarvester.tileX = oreTile.x
      humanHarvester.tileY = oreTile.y
      humanHarvester.path = []
      humanHarvester.moveTarget = null
      humanHarvester.harvesting = true
      humanHarvester.oreCarried = 0

      enemyF22.lastDecisionTime = 0
      enemyF22.lastTargetChangeTime = 0
      enemyF22.target = null
      enemyF22.allowedToAttack = false

      window.__enemyF22DisciplineE2E = {
        enemyF22Id: enemyF22.id,
        humanHarvesterId: humanHarvester.id,
        defenseBuildingId: defenseBuilding.id,
        humanPlayer,
        groundedOffStripObserved: false
      }

      return { ok: true }
    })

    expect(setup.error || null).toBeNull()

    const harvesterTargetHandle = await page.waitForFunction(() => {
      const tracker = window.__enemyF22DisciplineE2E
      if (!tracker) return false

      const gs = window.gameState
      const units = window.gameInstance?.units || []
      const f22 = units.find(u => u.id === tracker.enemyF22Id)
      const harvester = units.find(u => u.id === tracker.humanHarvesterId)
      if (!f22 || !harvester || harvester.health <= 0) return false

      const centerTileX = Math.floor((f22.x + 16) / 32)
      const centerTileY = Math.floor((f22.y + 16) / 32)
      const tile = gs.mapGrid?.[centerTileY]?.[centerTileX]
      const onAirstripStreet = Boolean(tile && tile.airstripStreet)

      if (f22.flightState === 'grounded' && !onAirstripStreet) {
        tracker.groundedOffStripObserved = true
      }

      const targetingHarvester = Boolean(
        f22.target && f22.target.id === harvester.id && f22.target.owner === tracker.humanPlayer
      )

      if (!targetingHarvester || tracker.groundedOffStripObserved) {
        return false
      }

      return {
        targetingHarvester,
        groundedOffStripObserved: tracker.groundedOffStripObserved,
        f22State: f22.f22State || null,
        flightState: f22.flightState || null
      }
    }, { timeout: 30000 })

    const harvesterTargetResult = await harvesterTargetHandle.jsonValue()
    expect(harvesterTargetResult.targetingHarvester).toBe(true)
    expect(harvesterTargetResult.groundedOffStripObserved).toBe(false)

    const defenseTargetHandle = await page.waitForFunction(() => {
      const tracker = window.__enemyF22DisciplineE2E
      if (!tracker) return false

      const gs = window.gameState
      const units = window.gameInstance?.units || []
      const f22 = units.find(u => u.id === tracker.enemyF22Id)
      const harvester = units.find(u => u.id === tracker.humanHarvesterId)
      const defense = (gs.buildings || []).find(b => b.id === tracker.defenseBuildingId)
      if (!f22 || !harvester || !defense || defense.health <= 0) return false

      harvester.health = 0
      harvester.targetable = false
      f22.lastDecisionTime = 0
      f22.lastTargetChangeTime = 0

      const targetingDefense = Boolean(f22.target && f22.target.id === defense.id)
      if (!targetingDefense) {
        return false
      }

      return {
        targetingDefense,
        defenseType: defense.type,
        defenseOwner: defense.owner,
        targetType: f22.target?.type || null
      }
    }, { timeout: 30000 })

    const defenseTargetResult = await defenseTargetHandle.jsonValue()
    expect(defenseTargetResult.targetingDefense).toBe(true)
    expect(defenseTargetResult.defenseType).toBe('turretGunV1')

    expect(consoleErrors, `Console errors encountered:\n${consoleErrors.join('\n')}`).toEqual([])
  })
})
