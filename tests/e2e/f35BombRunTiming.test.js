import { test, expect } from '@playwright/test'

test.describe('F35 bomb run timing', () => {
  test('drops bombs over target with staggered cadence', async({ page }) => {
    test.setTimeout(180000)

    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=37')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.gameState?.gameStarted && window.cheatSystem && window.gameInstance?.units), { timeout: 30000 })

    const setup = await page.evaluate(() => {
      const gs = window.gameState
      const units = window.gameInstance.units
      const buildings = gs.buildings
      const humanPlayer = gs.humanPlayer || 'player1'
      const knownUnitIds = new Set(units.map(u => u.id))
      const knownBuildingIds = new Set(buildings.map(b => b.id))

      gs.cursorX = 28 * 32
      gs.cursorY = 16 * 32
      window.cheatSystem.processCheatCode('build refinery player2')
      const target = buildings.find(b => b.type === 'refinery' && !knownBuildingIds.has(b.id))
      if (!target) return { error: 'missing target' }
      target.health = 900

      gs.cursorX = 16 * 32
      gs.cursorY = 16 * 32
      window.cheatSystem.processCheatCode(`f35 1 ${humanPlayer}`)
      const f35 = units.find(u => u.type === 'f35' && u.owner === humanPlayer && !knownUnitIds.has(u.id))
      if (!f35) return { error: 'missing f35' }

      f35.x = 6 * 32
      f35.y = 16 * 32
      f35.tileX = Math.floor((f35.x + 16) / 32)
      f35.tileY = Math.floor((f35.y + 16) / 32)
      f35.flightState = 'airborne'
      f35.altitude = Math.max(56, (f35.maxAltitude || 64) * 0.9)
      f35.path = []
      f35.flightPlan = null
      f35.moveTarget = null
      f35.commandIntent = 'attack'
      f35.helipadLandingRequested = false
      f35.groundLandingRequested = false
      f35.groundLandingTarget = null
      f35.target = target
      f35.attackQueue = []
      f35.allowedToAttack = true
      f35.canFire = true
      f35.rocketAmmo = 4
      f35.maxRocketAmmo = 6
      f35.lastShotTime = 0

      const bullets = window.gameInstance.bullets
      window.__f35DropEvents = []
      if (!bullets.__f35PushPatched) {
        const originalPush = bullets.push.bind(bullets)
        bullets.push = (...items) => {
          const result = originalPush(...items)
          for (const item of items) {
            if (!item || item.originType !== 'f35Bomb') continue
            const shooter = item.shooter
            const targetPos = item.targetPosition || null
            if (!shooter || !targetPos) continue
            const shooterCenterX = shooter.x + 16
            const shooterCenterY = shooter.y + 16
            window.__f35DropEvents.push({
              creationTime: item.creationTime,
              distanceToTarget: Math.hypot(targetPos.x - shooterCenterX, targetPos.y - shooterCenterY)
            })
          }
          return result
        }
        bullets.__f35PushPatched = true
      }

      return { error: '', f35Id: f35.id }
    })

    expect(setup.error || '').toBe('')

    await page.waitForFunction(() => Array.isArray(window.__f35DropEvents) && window.__f35DropEvents.length >= 3, { timeout: 45000 })

    const result = await page.evaluate(() => {
      const events = Array.isArray(window.__f35DropEvents) ? window.__f35DropEvents.slice(0, 4) : []
      const delays = []
      for (let i = 1; i < events.length; i++) {
        delays.push(events[i].creationTime - events[i - 1].creationTime)
      }
      return {
        events,
        delays,
        allNearTarget: events.every(event => event.distanceToTarget <= (32 * 0.75) + 2)
      }
    })

    expect(result.events.length).toBeGreaterThanOrEqual(3)
    expect(result.delays.length).toBeGreaterThanOrEqual(2)
    expect(result.delays.every(delay => delay >= 300)).toBeTruthy()
    expect(result.allNearTarget).toBeTruthy()
  })
})
