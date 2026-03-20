import { test, expect } from '@playwright/test'

test.describe('Apache rocket straight-line regression', () => {
  test('apache leads a steadily moving tank without homing and kills it in one precise burst', async({ page }) => {
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
      apache.rocketAmmo = 8
      apache.maxRocketAmmo = 8
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
      target.health = 100
      target.maxHealth = 100
      target.movement = {
        velocity: { x: 2, y: 0 },
        targetVelocity: { x: 2, y: 0 },
        currentSpeed: 2,
        isMoving: true
      }

      apache.target = target
      apache.attackMoveTarget = null

      window.__apacheLeadTest = {
        targetId: target.id,
        intervalId: window.setInterval(() => {
          const liveTarget = window.gameInstance?.units?.find(unit => unit.id === target.id)
          if (!liveTarget || liveTarget.health <= 0) return
          liveTarget.x += 2
          liveTarget.tileX = Math.floor(liveTarget.x / 32)
          liveTarget.tileY = Math.floor(liveTarget.y / 32)
          liveTarget.path = []
          liveTarget.moveTarget = null
          liveTarget.movement = liveTarget.movement || {}
          liveTarget.movement.velocity = { x: 2, y: 0 }
          liveTarget.movement.targetVelocity = { x: 2, y: 0 }
          liveTarget.movement.currentSpeed = 2
          liveTarget.movement.isMoving = true
        }, 16)
      }

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
        targetPosition: rocket.targetPosition,
        currentTargetCenter: {
          x: target.x + 16,
          y: target.y + 16
        }
      }
    }, setup, { timeout: 30000 })

    const launchInfo = await launch.jsonValue()
    expect(launchInfo.targetPosition.x).toBeGreaterThan(launchInfo.currentTargetCenter.x + 40)
    expect(Math.abs(launchInfo.targetPosition.y - launchInfo.currentTargetCenter.y)).toBeLessThanOrEqual(8)

    const result = await page.waitForFunction(({ bulletId, targetId, apacheId }) => {
      const rocket = window.gameState?.bullets?.find(b => b.id === bulletId)
      const apache = window.gameInstance?.units?.find(unit => unit.id === apacheId)
      const target = window.gameInstance?.units?.find(unit => unit.id === targetId)
      if (!apache || !target) return false
      if (rocket) return false
      if (target.health > 0) return false
      return {
        targetHealth: target.health,
        rocketAmmo: apache.rocketAmmo,
        targetX: target.x
      }
    }, {
      bulletId: launchInfo.bulletId,
      targetId: setup.targetId,
      apacheId: setup.apacheId
    }, { timeout: 30000 })

    const finalState = await result.jsonValue()
    expect(finalState.targetHealth).toBeLessThanOrEqual(0)
    expect(finalState.rocketAmmo).toBe(0)

    await page.evaluate(() => {
      if (window.__apacheLeadTest?.intervalId) {
        window.clearInterval(window.__apacheLeadTest.intervalId)
      }
      window.__apacheLeadTest = null
    })
  })
})
