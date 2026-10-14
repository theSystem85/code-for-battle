import { test, expect } from '@playwright/test'
import { prepareRegressionScenario, observeSimulation, pollRegressionState } from './helpers/regressionScenario.js'

test('enemy tank travels to its hospital, restores missing crew and releases medical return state', async({ page }) => {
  await prepareRegressionScenario(page, 214)
  await page.evaluate(() => {
    const r = window.__regression
    r.hospital = r.building('hospital', r.enemy, 24, 24)
    r.tank = r.unit('tank_v1', r.enemy, 24, 36)
    r.tank.crew = { driver: true, commander: true, loader: true, gunner: false }
    r.tank.health = r.tank.maxHealth
    r.startX = r.tank.x
    r.startY = r.tank.y
    window.gameState.gamePaused = false
  })
  const readHospitalState = () => {
    const r = window.__regression
    const gs = window.gameState
    const t = r.tank
    return { returning: t.returningToHospital === true, correctHospital: t.hospitalTarget?.id === r.hospital.id,
      tileDestination: Number.isInteger(t.moveTarget?.x) && Number.isInteger(t.moveTarget?.y) &&
        t.moveTarget.x >= 0 && t.moveTarget.y >= 0 && t.moveTarget.x < gs.mapGrid[0].length && t.moveTarget.y < gs.mapGrid.length,
      travelled: Math.hypot(t.x - r.startX, t.y - r.startY) > 64,
      receivingTreatment: r.hospital.healingUnits?.some(h => h.unitId === t.id) === true,
      healed: t.crew.gunner === true, released: !t.returningToHospital && !t.needsHospital,
      x: t.x, y: t.y, crew: t.crew, destination: t.moveTarget, path: t.path,
      hospital: { x: r.hospital.x, y: r.hospital.y, width: r.hospital.width, height: r.hospital.height,
        owner: r.hospital.owner, health: r.hospital.health, radius: r.hospital.serviceRadius, healing: r.hospital.healingUnits },
      target: t.target?.id, gas: t.gas, simulationTime: gs.simulationTime, paused: gs.gamePaused }
  }
  await pollRegressionState(page, 'Enemy AI must assign its hospital with a tile destination', readHospitalState,
    { returning: true, correctHospital: true, tileDestination: true })
  await pollRegressionState(page, 'Tank must physically travel into the hospital service radius', readHospitalState,
    { travelled: true, receivingTreatment: true }, 60000)
  // Healing takes 10,000 simulation milliseconds, not 10 seconds of browser wall time.
  await observeSimulation(page, 11000)
  await pollRegressionState(page, 'Hospital must restore the gunner and AI must release its medical state', readHospitalState,
    { healed: true, released: true })
  const final = await page.evaluate(readHospitalState)
  expect(final, `Hospital completion: ${JSON.stringify(final)}`).toMatchObject({ travelled: true, healed: true, released: true })
})
