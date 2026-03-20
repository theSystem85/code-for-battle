import { test, expect } from '@playwright/test'

test.describe('Apache rocket straight-line regression', () => {
  test('apache rockets keep their original trajectory when the target moves after launch', async({ page }) => {
    test.setTimeout(90000)

    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=17')
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
      const knownIds = new Set(units.map(unit => unit.id))

      gs.cursorX = 24 * 32
      gs.cursorY = 24 * 32
      window.cheatSystem.processCheatCode(`apache 1 ${humanPlayer}`)
      window.cheatSystem.processCheatCode(`tank_v1 1 ${enemyPlayer}`)

      const spawned = units.filter(unit => !knownIds.has(unit.id))
      const apache = spawned.find(unit => unit.type === 'apache' && unit.owner === humanPlayer)
      const target = spawned.find(unit => unit.type === 'tank_v1' && unit.owner === enemyPlayer)
      if (!apache || !target) {
        return { error: 'Failed to spawn apache or target.' }
      }

      apache.flightState = 'airborne'
      apache.altitude = apache.maxAltitude || 90
      apache.x = 24 * 32
      apache.y = 24 * 32
      apache.tileX = Math.floor(apache.x / 32)
      apache.tileY = Math.floor(apache.y / 32)
      apache.path = []
      apache.moveTarget = null
      apache.flightPlan = null
      apache.helipadLandingRequested = false
      apache.landedHelipadId = null
      apache.rocketAmmo = Math.max(4, apache.rocketAmmo || 0)
      apache.apacheAmmoEmpty = false
      apache.canFire = true
      apache.volleyState = null
      apache.lastShotTime = 0

      target.x = 31 * 32
      target.y = 24 * 32
      target.tileX = Math.floor(target.x / 32)
      target.tileY = Math.floor(target.y / 32)
      target.path = []
      target.moveTarget = null

      apache.target = target
      apache.attackMoveTarget = null

      return {
        apacheId: apache.id,
        targetId: target.id
      }
    })

    expect(setup.error || null).toBeNull()

    const launch = await page.waitForFunction(({ apacheId, targetId }) => {
      const bullets = window.gameState?.bullets || []
      const rocket = bullets.find(b => b?.originType === 'apacheRocket' && b?.shooter?.id === apacheId && b?.apacheTargetId === targetId)
      const target = window.gameInstance?.units?.find(unit => unit.id === targetId)
      if (!rocket || !target) return false
      return {
        bulletId: rocket.id,
        startX: rocket.startX,
        startY: rocket.startY,
        targetPosition: rocket.targetPosition,
        initialTargetCenter: {
          x: target.x + 16,
          y: target.y + 16
        }
      }
    }, setup, { timeout: 30000 })

    const launchInfo = await launch.jsonValue()
    expect(launchInfo.targetPosition.x).toBeCloseTo(launchInfo.initialTargetCenter.x, 6)
    expect(launchInfo.targetPosition.y).toBeCloseTo(launchInfo.initialTargetCenter.y, 6)

    const movedState = await page.evaluate(({ bulletId, targetId }) => {
      const target = window.gameInstance.units.find(unit => unit.id === targetId)
      const rocket = window.gameState.bullets.find(b => b.id === bulletId)
      if (!target || !rocket) return null

      target.x += 8 * 32
      target.y += 5 * 32
      target.tileX = Math.floor(target.x / 32)
      target.tileY = Math.floor(target.y / 32)
      target.path = []
      target.moveTarget = null

      return {
        movedTargetCenter: {
          x: target.x + 16,
          y: target.y + 16
        },
        targetPositionAfterMove: {
          x: rocket.targetPosition.x,
          y: rocket.targetPosition.y
        }
      }
    }, launchInfo)

    expect(movedState).not.toBeNull()
    expect(movedState.targetPositionAfterMove.x).toBeCloseTo(launchInfo.targetPosition.x, 6)
    expect(movedState.targetPositionAfterMove.y).toBeCloseTo(launchInfo.targetPosition.y, 6)
    expect(Math.abs(movedState.movedTargetCenter.x - launchInfo.targetPosition.x)).toBeGreaterThan(100)
    expect(Math.abs(movedState.movedTargetCenter.y - launchInfo.targetPosition.y)).toBeGreaterThan(100)

    const impact = await page.waitForFunction(({ bulletId, targetId, initialTargetPosition }) => {
      const rocket = window.gameState?.bullets?.find(b => b.id === bulletId)
      if (rocket) return false

      const target = window.gameInstance?.units?.find(unit => unit.id === targetId)
      if (!target) return false

      const impact = window.gameState?.explosions?.at(-1)
      if (!impact) return false

      const dx = initialTargetPosition.x - impact.x
      const dy = initialTargetPosition.y - impact.y
      const targetDx = target.x + 16 - impact.x
      const targetDy = target.y + 16 - impact.y

      return {
        impactX: impact.x,
        impactY: impact.y,
        distanceFromInitialAim: Math.hypot(dx, dy),
        distanceFromMovedTarget: Math.hypot(targetDx, targetDy)
      }
    }, {
      bulletId: launchInfo.bulletId,
      targetId: setup.targetId,
      initialTargetPosition: launchInfo.targetPosition
    }, { timeout: 30000 })

    const impactInfo = await impact.jsonValue()
    expect(impactInfo.distanceFromInitialAim).toBeLessThanOrEqual(24)
    expect(impactInfo.distanceFromMovedTarget).toBeGreaterThan(120)
  })
})
