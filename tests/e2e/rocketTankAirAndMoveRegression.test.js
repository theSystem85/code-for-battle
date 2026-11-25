import { test, expect } from '@playwright/test'
import { prepareRegressionScenario, observeSimulation, pollRegressionState } from './helpers/regressionScenario.js'

test('[E00098] rocket tank hits an airborne Apache and fires no rockets after an ordinary move order', async({ page }) => {
  await prepareRegressionScenario(page, 212, 64)
  await page.evaluate(() => {
    const r = window.__regression
    r.rocket = r.unit('rocketTank', r.human, 22, 24)
    r.apache = r.unit('apache', r.enemy, 27, 24)
    r.apache.flightState = 'airborne'
    r.apache.altitude = r.apache.maxAltitude
    r.apache.manualFlightState = 'hover'
    r.apache.autoHoldAltitude = true
    r.apache.llmOrderLockUntil = Number.MAX_SAFE_INTEGER
    r.apache.rocketAmmo = r.apache.maxRocketAmmo // Empty ammunition would trigger automatic resupply.
    r.apache.target = null
    r.apache.dodgeChance = 0
    r.apache.health = r.apache.maxHealth = 10000
    r.rocket.target = r.apache
    r.rocket.ammunition = r.rocket.maxAmmunition
    r.rocket.allowedToAttack = true
    window.gameState.gamePaused = false
  })
  await pollRegressionState(page, 'Rocket tank must fire and damage a target that remains airborne', () => {
    const r = window.__regression
    return { damaged: r.apache.health < 10000, airborne: r.apache.flightState !== 'grounded',
      health: r.apache.health, altitude: r.apache.altitude, ammo: r.rocket.ammunition,
      target: r.rocket.target?.id, heading: r.rocket.direction, turret: r.rocket.turretDirection,
      burstActive: Boolean(r.rocket.burstState), apacheTarget: r.apache.target?.id }
  }, { damaged: true, airborne: true })
  await page.evaluate(() => {
    const r = window.__regression
    window.unitCommandsHandler.handleMovementCommand([r.rocket], 22 * 32, 30 * 32, window.gameState.mapGrid)
    r.moveAmmo = r.rocket.ammunition
    r.moveShotTime = r.rocket.lastShotTime
    r.startY = r.rocket.y
  })
  // Longer than the 12-second rocket cooldown; also covers cancellation of an active burst.
  await observeSimulation(page, 14000)
  const state = await page.evaluate(() => {
    const r = window.__regression
    return { target: r.rocket.target?.id || null, ammo: r.rocket.ammunition,
      initialAmmo: r.moveAmmo, lastShot: r.rocket.lastShotTime ?? null,
      initialShot: r.moveShotTime ?? null, moved: r.rocket.y > r.startY, burstActive: Boolean(r.rocket.burstState) }
  })
  expect(state, `After ordinary move: ${JSON.stringify(state)}`).toMatchObject({
    target: null, ammo: state.initialAmmo, lastShot: state.initialShot, moved: true, burstActive: false
  })
})

test('[E00280] an ordered rocket tank approaches an enemy building and fires from its extended range', async({ page }) => {
  await prepareRegressionScenario(page, 212, 64)
  await page.evaluate(() => {
    const r = window.__regression
    const gs = window.gameState
    r.rocket = r.unit('rocketTank', r.human, 17, 24)
    r.target = r.building('powerPlant', r.enemy, 38, 24)
    r.initialX = r.rocket.x
    r.initialAmmo = r.rocket.ammunition
    window.unitCommandsHandler.handleAttackCommand([r.rocket], r.target, gs.mapGrid)
    gs.gamePaused = false
  })

  await pollRegressionState(page, 'The rocket tank must drive into range, stop and fire', () => {
    const { rocket, target, initialX, initialAmmo } = window.__regression
    const distance = Math.hypot(
      (target.x + target.width / 2) - (rocket.x / 32 + 0.5),
      (target.y + target.height / 2) - (rocket.y / 32 + 0.5)
    )
    return {
      moved: rocket.x > initialX,
      fired: rocket.ammunition < initialAmmo,
      inExtendedRange: distance > 13.5 && distance <= 16.2,
      stopped: !rocket.moveTarget && !rocket.path.length && !rocket.movement.isMoving,
      distance
    }
  }, { moved: true, fired: true, inExtendedRange: true, stopped: true }, 30000)
})
