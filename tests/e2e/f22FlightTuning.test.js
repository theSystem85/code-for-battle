import { test, expect } from '@playwright/test'

test.describe('F22 tuning regression', () => {
  test('applies updated F22 turn/top speed and faster F22 rockets', async({ page }) => {
    test.setTimeout(90000)

    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=31')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })

    await page.waitForFunction(() => {
      const gs = window.gameState
      return Boolean(gs?.gameStarted && !gs.gamePaused && window.cheatSystem && window.gameInstance?.units)
    }, { timeout: 30000 })

    const setupResult = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const humanPlayer = gs.humanPlayer || 'player1'
      const enemyPlayer = humanPlayer === 'player1' ? 'player2' : 'player1'
      const knownIds = new Set(units.map(u => u.id))

      gs.cursorX = 24 * 32
      gs.cursorY = 24 * 32
      window.cheatSystem.processCheatCode(`build airstrip ${humanPlayer}`)
      window.cheatSystem.processCheatCode(`f22Raptor 1 ${humanPlayer}`)
      window.cheatSystem.processCheatCode(`tank_v1 1 ${enemyPlayer}`)

      const spawned = units.filter(u => !knownIds.has(u.id))
      const f22 = spawned.find(u => u.type === 'f22Raptor' && u.owner === humanPlayer)
      const target = spawned.find(u => u.type === 'tank_v1' && u.owner === enemyPlayer)

      if (!f22 || !target) return { error: 'Failed to spawn F22 or target.' }

      f22.flightState = 'airborne'
      f22.f22State = 'airborne'
      f22.altitude = f22.maxAltitude || 32
      f22.helipadLandingRequested = false
      f22.f22PendingTakeoff = false
      f22.path = []
      f22.x = 24 * 32
      f22.y = 24 * 32

      target.x = 31 * 32
      target.y = 24 * 32
      target.path = []
      target.moveTarget = null

      f22.target = target
      f22.f22AssignedDestination = {
        x: target.x + 16,
        y: target.y + 16,
        stopRadius: 16,
        mode: 'combat',
        destinationTile: { x: 31, y: 24 },
        followTargetId: target.id
      }

      return {
        f22Id: f22.id,
        speed: f22.speed,
        rotationSpeed: f22.rotationSpeed
      }
    })

    expect(setupResult.error || null).toBeNull()
    expect(setupResult.speed).toBeCloseTo(6.075, 6)
    expect(setupResult.rotationSpeed).toBeCloseTo(0.1, 6)

    const rocketHandle = await page.waitForFunction((f22Id) => {
      const bullets = window.gameState?.bullets || []
      const f22Rocket = bullets.find(b => b?.f22Rocket === true && b?.shooter?.id === f22Id && b?.active)
      if (!f22Rocket) return false
      return { speed: f22Rocket.speed, originType: f22Rocket.originType }
    }, setupResult.f22Id, { timeout: 30000 })

    const rocket = await rocketHandle.jsonValue()
    expect(rocket.originType).toBe('apacheRocket')
    expect(rocket.speed).toBeCloseTo(7.5, 6)
  })
})
