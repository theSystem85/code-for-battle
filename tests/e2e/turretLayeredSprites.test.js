import { test, expect } from '@playwright/test'
import { prepareRegressionScenario, pollRegressionState } from './helpers/regressionScenario.js'

test('V1-V3 fire each modeled barrel and retain independent burst animation times', async({ page }) => {
  await prepareRegressionScenario(page, 217)
  await page.evaluate(() => {
    const r = window.__regression
    window.gameState.useTurretImages = true
    r.gunTurrets = [1, 2, 3].map((version, index) => {
      const y = 20 + index * 6
      const turret = r.building(`turretGunV${version}`, r.human, 20, y)
      const target = r.unit('tank_v1', r.enemy, 26, y)
      target.crew = { driver: false, commander: false, loader: false, gunner: false }
      target.health = target.maxHealth = 10000
      turret.ammo = turret.maxAmmo
      return turret
    })
    window.gameState.gamePaused = false
  })
  await pollRegressionState(page, 'Every authored gun must fire during a burst', () => ({
    fired: window.__regression.gunTurrets.map(turret => turret.barrelShotTimes?.filter(Number.isFinite).length || 0)
  }), { fired: [1, 2, 3] })
  const result = await page.evaluate(async() => {
    const { getPreparedBuildingLayer } = await import('/src/rendering/prepared/preparedSpritePipeline.js')
    return window.__regression.gunTurrets.map(turret => ({
      times: turret.barrelShotTimes,
      layers: ['base', 'top', 'barrel'].map(layer => {
        const sprite = getPreparedBuildingLayer(turret.type, layer)
        return { prepared: Boolean(sprite), density: sprite?.density, width: sprite?.backingWidth }
      })
    }))
  })
  for (const [index, turret] of result.entries()) {
    expect(turret.times).toHaveLength(index + 1)
    for (let barrel = 1; barrel < turret.times.length; barrel++) {
      expect(turret.times[barrel]).toBeGreaterThan(turret.times[barrel - 1])
    }
    expect(turret.layers.every(layer => layer.prepared && layer.width > 0)).toBe(true)
  }
})
