import { test, expect } from '@playwright/test'

test.describe('F22 firing range gate', () => {
  test('F22 only fires when target is inside range and never exceeds 20-tile range cap', async({ page }) => {
    test.setTimeout(90000)

    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=33')
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

      gs.cursorX = 12 * 32
      gs.cursorY = 12 * 32
      window.cheatSystem.processCheatCode(`build airstrip ${humanPlayer}`)
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${humanPlayer}`)
      window.cheatSystem.processCheatCode(`tank_v1 1 ${enemyPlayer}`)

      const spawned = units.filter(unit => !knownIds.has(unit.id))
      const f22 = spawned.find(unit => unit.type === 'f22Raptor' && unit.owner === humanPlayer)
      const target = spawned.find(unit => unit.type === 'tank_v1' && unit.owner === enemyPlayer)
      if (!f22 || !target) {
        return { error: 'Failed to create F22 setup.' }
      }

      f22.flightState = 'airborne'
      f22.f22State = 'airborne'
      f22.altitude = f22.maxAltitude || 32
      f22.path = []
      f22.moveTarget = null
      f22.helipadLandingRequested = false
      f22.f22PendingTakeoff = false
      f22.target = target
      f22.level = 3
      f22.rangeMultiplier = 2
      f22.x = 12 * 32
      f22.y = 12 * 32
      f22.tileX = 12
      f22.tileY = 12
      f22.rocketAmmo = Math.max(4, f22.rocketAmmo || 4)
      f22.maxRocketAmmo = Math.max(4, f22.maxRocketAmmo || 4)
      f22.lastShotTime = 0
      f22.volleyState = null

      target.health = 500
      target.maxHealth = 500
      target.path = []
      target.moveTarget = null
      target.x = 35 * 32
      target.y = 12 * 32
      target.tileX = 35
      target.tileY = 12

      f22.f22AssignedDestination = {
        x: target.x + 16,
        y: target.y + 16,
        stopRadius: 16,
        mode: 'combat',
        destinationTile: { x: target.tileX, y: target.tileY },
        followTargetId: target.id
      }

      window.__f22RangeGate = {
        f22Id: f22.id,
        targetId: target.id,
        initialAmmo: f22.rocketAmmo,
        initialBulletCount: gs.bullets.length
      }

      return {
        initialAmmo: window.__f22RangeGate.initialAmmo
      }
    })

    expect(setup.error || null).toBeNull()

    const outOfRangeState = await page.waitForFunction(() => {
      const tracker = window.__f22RangeGate
      if (!tracker) return false
      const gs = window.gameState
      const units = window.gameInstance?.units || []
      const f22 = units.find(unit => unit.id === tracker.f22Id)
      const target = units.find(unit => unit.id === tracker.targetId)
      if (!f22 || !target) return false

      const distanceTiles = Math.hypot((target.x - f22.x) / 32, (target.y - f22.y) / 32)
      if (distanceTiles <= 20.5) return false

      const firedAnyRocket = gs.bullets.some(bullet => bullet?.f22Rocket === true && bullet?.shooter?.id === f22.id)
      if (firedAnyRocket) {
        return { error: 'F22 fired while target was out of range.' }
      }

      if ((f22.rocketAmmo ?? 0) !== tracker.initialAmmo) {
        return { error: 'F22 spent ammo while target was out of range.' }
      }

      return {
        ammo: f22.rocketAmmo,
        bulletCount: gs.bullets.length,
        distanceTiles
      }
    }, { timeout: 5000 })

    const outOfRangeResult = await outOfRangeState.jsonValue()
    expect(outOfRangeResult.error || null).toBeNull()
    expect(outOfRangeResult.ammo).toBe(setup.initialAmmo)

    await page.evaluate(() => {
      const tracker = window.__f22RangeGate
      const units = window.gameInstance?.units || []
      const target = units.find(unit => unit.id === tracker?.targetId)
      const f22 = units.find(unit => unit.id === tracker?.f22Id)
      if (!target || !f22) return

      target.x = 28 * 32
      target.y = 12 * 32
      target.tileX = 28
      target.tileY = 12
      target.path = []
      target.moveTarget = null
      f22.f22AssignedDestination = {
        x: target.x + 16,
        y: target.y + 16,
        stopRadius: 16,
        mode: 'combat',
        destinationTile: { x: target.tileX, y: target.tileY },
        followTargetId: target.id
      }
    })

    const inRangeState = await page.waitForFunction(() => {
      const tracker = window.__f22RangeGate
      if (!tracker) return false
      const gs = window.gameState
      const units = window.gameInstance?.units || []
      const f22 = units.find(unit => unit.id === tracker.f22Id)
      const target = units.find(unit => unit.id === tracker.targetId)
      if (!f22 || !target) return false

      const f22Rocket = gs.bullets.find(bullet => bullet?.f22Rocket === true && bullet?.shooter?.id === f22.id && bullet?.active)
      if (!f22Rocket) return false

      return {
        ammo: f22.rocketAmmo,
        targetDistanceTiles: Math.hypot((target.x - f22.x) / 32, (target.y - f22.y) / 32),
        bulletSpeed: f22Rocket.speed
      }
    }, { timeout: 30000 })

    const inRangeResult = await inRangeState.jsonValue()
    expect(inRangeResult.ammo).toBeLessThan(setup.initialAmmo)
    expect(inRangeResult.targetDistanceTiles).toBeLessThanOrEqual(20)
    expect(inRangeResult.bulletSpeed).toBeGreaterThan(0)
  })
})
