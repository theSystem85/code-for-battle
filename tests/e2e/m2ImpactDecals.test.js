import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

test('[E00206] M2 hits damage a tank without stamping the impact decal produced by a standard tank', async({ page }) => {
  await prepareRegressionScenario(page, 211)
  const results = await page.evaluate(async() => {
    const { handleTankFiring } = await import('/src/game/unitCombat/firingHandlers.js')
    const { updateBullets } = await import('/src/game/bulletSystem.js')
    const { getBaseFireRateForTankType } = await import('/src/game/unitCombat/combatConfig.js')
    const gs = window.gameState
    const r = window.__regression
    const results = []
    for (const [index, type] of ['lightTank', 'tank_v1'].entries()) {
      const y = 25 + index * 3
      const shooter = r.unit(type, r.human, 20, y)
      const target = r.unit('tank_v1', r.enemy, 24, y)
      shooter.direction = shooter.turretDirection = 0
      shooter.lastShotTime = 0
      const healthBefore = target.health
      const tile = gs.mapGrid[y][24]
      delete tile.decal
      const bullets = []
      gs.simulationTime += 10000
      const fired = handleTankFiring(shooter, target, bullets, gs.simulationTime,
        getBaseFireRateForTankType(type), target.x + 16, target.y + 16, 'bullet',
        window.gameInstance.units, gs.mapGrid)
      for (let frame = 0; frame < 60 && bullets.length; frame++) {
        updateBullets(bullets, window.gameInstance.units, gs.factories, gs, gs.mapGrid)
      }
      results.push({ type, fired, damage: healthBefore - target.health, decal: tile.decal?.tag || null, remaining: bullets.length })
    }
    return results
  })
  for (const result of results) {
    expect(result.fired).toBe(true)
    expect(result.damage).toBeGreaterThan(0)
    expect(result.remaining).toBe(0)
    expect(result.decal).toBe(result.type === 'lightTank' ? null : 'impact')
  }
})
