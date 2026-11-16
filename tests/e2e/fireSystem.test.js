import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

test('[E00262] fire engine extinguishes a burning building and restores fire state', async({ page }) => {
  await prepareRegressionScenario(page, '419&size=64&players=2')
  const result = await page.evaluate(async() => {
    const { createBuilding, placeBuilding } = await import('/src/buildings.js')
    const { igniteTile, updateFireSystem, restoreFires } = await import('/src/game/fireSystem.js')
    const gs = window.gameState
    const owner = window.__regression.human
    const station = createBuilding('fireDepartment', 20, 20)
    station.owner = owner
    gs.buildings.push(station)
    placeBuilding(station, gs.mapGrid, gs.occupancyMap)
    const truck = window.__regression.unit('fireEngine', owner, 24, 22)
    const house = createBuilding('vehicleFactory', 26, 22)
    house.owner = owner
    gs.buildings.push(house)
    placeBuilding(house, gs.mapGrid, gs.occupancyMap)
    const initialHealth = house.health
    igniteTile(gs, gs.mapGrid, 26, 22)
    const records = JSON.parse(JSON.stringify(gs.fires))
    restoreFires(gs, gs.mapGrid, records)
    const restored = gs.mapGrid[22][26].fire === gs.fires[0]
    for (let i = 0; i < 180; i++) updateFireSystem([truck], gs, gs.mapGrid, 1000 / 60)
    // One final tick allows fractional suppression to cross the threshold.
    updateFireSystem([truck], gs, gs.mapGrid, 1000 / 60)
    return { restored, burning: Boolean(gs.mapGrid[22][26].fire), water: truck.water, damaged: house.health < initialHealth, departmentCard: Boolean(document.querySelector('[data-building-type="fireDepartment"]')) }
  })
  expect(result.restored).toBe(true)
  expect(result.burning).toBe(false)
  expect(result.water).toBeGreaterThan(870)
  expect(result.water).toBeLessThan(881)
  expect(result.damaged).toBe(true)
  await expect.poll(() => page.evaluate(async() => {
    const { getPreparedSprite } = await import('/src/rendering/prepared/preparedSpritePipeline.js')
    return Boolean(getPreparedSprite('unit:fireEngine:base'))
  }), { timeout: 15000 }).toBe(true)
  expect(result.departmentCard).toBe(true)
})
