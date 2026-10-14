import { test, expect } from '@playwright/test'
import { prepareRegressionScenario, observeSimulation, pollRegressionState } from './helpers/regressionScenario.js'

test('gun turret and tank cannot shoot through buildings and both fire with a clear line', async({ page }) => {
  await prepareRegressionScenario(page, 211)
  await page.evaluate(() => {
    const r = window.__regression
    // Separate lanes prevent either shooter becoming the other's friendly obstruction.
    r.turret = r.building('turretGunV1', r.human, 20, 20)
    r.turretBlocker = r.building('powerPlant', r.human, 22, 19)
    r.tankBlocker = r.building('powerPlant', r.human, 22, 29)
    r.tank = r.unit('tank-v2', r.human, 20, 30)
    r.turretEnemy = r.unit('tank_v1', r.enemy, 26, 20)
    r.tankEnemy = r.unit('tank_v1', r.enemy, 26, 30)
    for (const enemy of [r.turretEnemy, r.tankEnemy]) {
      enemy.crew = { driver: false, commander: false, loader: false, gunner: false }
      enemy.health = enemy.maxHealth = 10000
    }
    r.tank.crew.driver = false
    r.tank.alertMode = true
    r.tank.target = r.tankEnemy
    r.tank.ammunition = r.tank.maxAmmunition
    r.turret.ammo = r.turret.maxAmmo
    r.tankAmmo = r.tank.ammunition
    r.turretAmmo = r.turret.ammo
    window.gameState.gamePaused = false
  })
  await observeSimulation(page, 8000)
  const blocked = await page.evaluate(() => {
    const r = window.__regression
    return { tankHealth: r.tankEnemy.health, turretHealth: r.turretEnemy.health,
      tankAmmo: r.tank.ammunition, turretAmmo: r.turret.ammo,
      initialTankAmmo: r.tankAmmo, initialTurretAmmo: r.turretAmmo,
      tankPosition: [r.tank.x, r.tank.y], target: r.tank.target?.id }
  })
  expect(blocked, `Blocked lanes: ${JSON.stringify(blocked)}`).toMatchObject({
    tankHealth: 10000, turretHealth: 10000, tankAmmo: blocked.initialTankAmmo, turretAmmo: blocked.initialTurretAmmo
  })
  await page.evaluate(async() => {
    const { clearBuildingFromMapGrid } = await import('/src/buildings.js')
    const r = window.__regression
    const gs = window.gameState
    for (const blocker of [r.turretBlocker, r.tankBlocker]) {
      clearBuildingFromMapGrid(blocker, gs.mapGrid, gs.occupancyMap)
      gs.buildings.splice(gs.buildings.indexOf(blocker), 1)
    }
    r.tank.target = r.tankEnemy
  })
  await pollRegressionState(page, 'Both clear lanes must fire and damage their own target', () => {
    const r = window.__regression
    return { tankFired: r.tank.ammunition < r.tankAmmo, turretFired: r.turret.ammo < r.turretAmmo,
      tankHit: r.tankEnemy.health < 10000, turretHit: r.turretEnemy.health < 10000,
      tankAmmo: r.tank.ammunition, turretAmmo: r.turret.ammo,
      tankHealth: r.tankEnemy.health, turretHealth: r.turretEnemy.health,
      target: r.tank.target?.id, canFire: r.tank.canFire, crew: r.tank.crew,
      position: [r.tank.x, r.tank.y], turretDirection: r.tank.turretDirection }
  }, { tankFired: true, turretFired: true, tankHit: true, turretHit: true })
})
