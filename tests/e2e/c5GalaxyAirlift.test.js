import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

async function position(page, worldX, worldY) {
  const canvas = await page.locator('#gameCanvas').boundingBox()
  const scroll = await page.evaluate(() => window.gameState.scrollOffset)
  return { x: canvas.x + worldX - scroll.x, y: canvas.y + worldY - scroll.y }
}

async function clickUnit(page, id) {
  const unit = await page.evaluate(id => {
    const { x, y } = window.gameState.units.find(unit => unit.id === id)
    return { x: x + 16, y: y + 16 }
  }, id)
  const point = await position(page, unit.x, unit.y)
  await page.mouse.click(point.x, point.y)
}

test('[E00273] produces the Galaxy, boards by left click and airdrops through the context menu', async({ page }) => {
  test.setTimeout(180000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('rts_tutorial_progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await prepareRegressionScenario(page, 21)
  const galaxyId = await page.evaluate(async() => {
    const { createUnit, buildOccupancyMap } = await import('/src/units.js')
    const { createBuilding, placeBuilding } = await import('/src/buildings.js')
    const { productionQueue } = await import('/src/productionQueue.js')
    const state = window.gameState
    const owner = state.humanPlayer
    const units = state.units
    state.money = 10000
    state.gamePaused = false
    const airstrip = createBuilding('airstrip', 18, 18)
    airstrip.owner = owner
    airstrip.constructionFinished = true
    state.buildings.push(airstrip)
    placeBuilding(airstrip, state.mapGrid)
    state.occupancyMap = buildOccupancyMap(units, state.mapGrid)
    const button = document.querySelector('[data-unit-type="c5Galaxy"]') || document.createElement('button')
    productionQueue.addItem('c5Galaxy', button, false, null, null, { factoryId: airstrip.id })
    const lane = productionQueue.getUnitLane('c5Galaxy')
    const job = lane.currentUnit
    if (!job) throw new Error(`The Airstrip did not accept Galaxy production: ${JSON.stringify({
      paused: lane.pausedUnit, items: lane.unitItems.length,
      notification: document.querySelector('.notification')?.textContent
    })}`)
    productionQueue.updateProgress(job.startTime + job.duration)
    const galaxy = units.find(unit => unit.type === 'c5Galaxy')
    if (!galaxy) throw new Error('Galaxy production did not spawn the aircraft')
    if (!airstrip.f22OccupiedSlotUnitIds.slice(0, 3).every(id => id === galaxy.id)) throw new Error('Galaxy did not occupy its three airstrip slots')
    const tank = createUnit({ id: owner }, 'tank_v1', galaxy.tileX, galaxy.tileY + 3, { id: 'galaxy-cargo' })
    units.push(tank)
    state.occupancyMap = buildOccupancyMap(units, state.mapGrid)
    return galaxy.id
  })

  await clickUnit(page, 'galaxy-cargo')
  await clickUnit(page, galaxyId)
  await expect.poll(() => page.evaluate(id => window.gameState.units.find(unit => unit.id === id).cargoWeight, galaxyId), {
    timeout: 30000
  }).toBe(42)
  await clickUnit(page, galaxyId)
  const target = { x: 29 * 32 + 16, y: 25 * 32 + 16 }
  expect(await page.evaluate(point => window.remoteControlApi.openMapActionMenu(point), target)).toBe(true)
  const action = page.getByRole('button', { name: 'Airdrop here', exact: true })
  await expect(action).toBeVisible()
  await page.waitForTimeout(450)
  const menuButton = await action.boundingBox()
  await page.mouse.click(menuButton.x + menuButton.width / 2, menuButton.y + menuButton.height / 2)
  await expect.poll(() => page.evaluate(async() => {
    const cargo = window.gameState.units.find(unit => unit.id === 'galaxy-cargo')
    if (!cargo?.c5Drop) {
      const galaxy = window.gameState.units.find(unit => unit.type === 'c5Galaxy')
      return { flightState: galaxy?.flightState, mission: galaxy?.c5Mission, cargoTile: [cargo?.tileX, cargo?.tileY] }
    }
    const [{ createGameStateSnapshot }, { getPreparedSprite }] = await Promise.all([
      import('/src/network/stateSync.js'),
      import('/src/rendering/prepared/preparedSpritePipeline.js')
    ])
    const savedCargo = createGameStateSnapshot({ fullAutomation: true }).units.find(unit => unit.id === cargo.id)
    return savedCargo?.c5Drop && { x: savedCargo.c5Drop.tile.x, y: savedCargo.c5Drop.tile.y, airborne: savedCargo.altitude > 0, canopyWidth: getPreparedSprite('effect:c5:parachute')?.logicalWidth }
  }), {
    timeout: 60000, intervals: [50, 100]
  }).toEqual({ x: 29, y: 25, airborne: true, canopyWidth: 18 })
  await expect.poll(() => page.evaluate(() => {
    const cargo = window.gameState.units.find(unit => unit.id === 'galaxy-cargo')
    return cargo && !cargo.c5Drop && !cargo.embarkedOnId && [cargo.tileX, cargo.tileY]
  }), { timeout: 12000 }).toEqual([29, 25])
  await page.waitForTimeout(600)
  const targetOnCanvas = await position(page, target.x, target.y)
  await page.mouse.click(targetOnCanvas.x, targetOnCanvas.y)
  await expect.poll(() => page.evaluate(() => window.selectedUnitsRef[0]?.id)).toBe('galaxy-cargo')
})
