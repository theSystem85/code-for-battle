import { test, expect } from '@playwright/test'

test.describe('Gentle environment collision response', () => {
  test.beforeEach(async({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=17')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => window.gameState?.gameStarted === true, { timeout: 30000 })
  })

  test('ground units no longer get strongly shoved backwards when pressing into a building tile', async({ page }) => {
    const result = await page.evaluate(async() => {
      const { gameState } = await import('/src/gameState.js')
      const { createBuilding, placeBuilding } = await import('/src/buildings.js')
      const { createUnit } = await import('/src/units.js')
      const { updateUnitPosition, initializeUnitMovement } = await import('/src/game/unifiedMovement.js')

      const owner = gameState.humanPlayer || 'player1'
      const blocker = createBuilding('powerPlant', 18, 18)
      blocker.owner = owner
      blocker.constructionFinished = true
      gameState.buildings.push(blocker)
      placeBuilding(blocker, gameState.mapGrid, gameState.occupancyMap, { recordTransition: false })

      const tank = createUnit({ id: owner, owner }, 'tank_v1', 17, 18)
      tank.owner = owner
      tank.path = [{ x: 18, y: 18 }]
      tank.moveTarget = { x: 18, y: 18 }
      tank.health = tank.maxHealth
      tank.crew = { driver: true, commander: true, loader: true }
      tank.lastMovedTime = performance.now()
      initializeUnitMovement(tank)
      gameState.units.push(tank)

      const samples = []
      let now = performance.now()
      for (let i = 0; i < 90; i++) {
        now += 16
        updateUnitPosition(tank, gameState.mapGrid, gameState.occupancyMap, now, gameState.units, gameState, gameState.factories)
        samples.push({ x: tank.x, y: tank.y, vx: tank.movement.velocity.x, vy: tank.movement.velocity.y })
      }

      const maxX = Math.max(...samples.map(sample => sample.x))
      const final = samples.at(-1)
      return {
        startX: samples[0]?.x ?? tank.x,
        maxX,
        finalX: final?.x ?? tank.x,
        finalVelocityX: final?.vx ?? 0,
        retreatAfterContact: maxX - (final?.x ?? tank.x),
        sampleCount: samples.length
      }
    })

    expect(result.sampleCount).toBe(90)
    expect(result.maxX).toBeGreaterThan(result.startX)
    expect(result.retreatAfterContact).toBeLessThan(4)
    expect(result.finalVelocityX).toBeGreaterThanOrEqual(0)
  })
})
