import { test, expect } from '@playwright/test'
import { prepareRegressionScenario, pollRegressionState } from './helpers/regressionScenario.js'

test('[E00278] Plane Factory rolls out an F-22 and a C-5 resumes along newly built streets', async({ page }) => {
  await prepareRegressionScenario(page, 211)
  await page.evaluate(async() => {
    const { productionQueue } = await import('/src/productionQueue.js')
    const { createBuilding, placeBuilding, canPlaceBuilding } = await import('/src/buildings.js')
    const gs = window.gameState
    const r = window.__regression
    r.strip = r.building('airstrip', r.human, 26, 27)
    r.factory = r.building('planeFactory', r.human, 20, 24)
    r.factory.constructionFinished = r.strip.constructionFinished = true
    r.finish = (type) => {
      const item = { type, button: document.createElement('button'), factoryId: r.factory.id }
      productionQueue.unitItems = [item]
      productionQueue.currentUnit = item
      productionQueue.completeCurrentUnitProduction()
      return window.gameInstance.units.find(unit => unit.type === type)
    }
    r.pave = (x, y) => {
      if (!canPlaceBuilding('street', x, y, gs.mapGrid, window.gameInstance.units, gs.buildings, gs.factories, r.human)) {
        throw new Error(`Cannot pave ${x},${y}`)
      }
      const street = createBuilding('street', x, y)
      street.owner = r.human
      placeBuilding(street, gs.mapGrid, gs.occupancyMap)
      gs.buildings.push(street)
    }
    r.f22 = r.finish('f22Raptor')
    r.galaxy = r.finish('c5Galaxy')
    window.gameState.gamePaused = false
  })
  await pollRegressionState(page, 'Factory rollout must be visible and Galaxy must already be clear of the building', () => {
    const { f22, galaxy, factory } = window.__regression
    const exit = f22.factoryExit
    return {
      rolling: exit?.phase === 'moving' && exit.elapsed > 0 && f22.x < exit.startX,
      exit, simulationTime: window.gameState.simulationTime,
      galaxyReady: !galaxy.factoryExit && galaxy.tileY >= factory.y + factory.height + 1,
      grounded: f22.flightState === 'grounded' && galaxy.flightState === 'grounded'
    }
  }, { rolling: true, galaxyReady: true, grounded: true })
  const link = page.getByRole('button', { name: 'F-22 Raptor', exact: true })
  await expect(link).toBeVisible({ timeout: 10000 })
  await expect(page.locator('.notification')).toContainText('Build a street from the Plane Factory to the Airstrip')
  await link.click()
  await expect.poll(() => page.evaluate(() => window.__regression.f22.selected)).toBe(true)
  await page.evaluate(() => {
    const { f22, galaxy, pave } = window.__regression
    for (let y = f22.tileY; y <= 29; y++) pave(f22.tileX, y)
    for (let x = f22.tileX + 1; x <= 25; x++) pave(x, 29)
    pave(galaxy.tileX, galaxy.tileY)
  })
  await pollRegressionState(page, 'Both planes must reach their own parking slots by ground', () => {
    const { f22, galaxy, strip } = window.__regression
    return {
      f22: f22.landedHelipadId,
      galaxy: galaxy.landedHelipadId,
      strip: strip.id,
      fighterProgress: { x: f22.tileX, y: f22.tileY, exit: f22.factoryExit, delivery: f22.aircraftDelivery },
      distinct: f22.airstripParkingSlotIndex !== galaxy.airstripParkingSlotIndex,
      parked: !f22.aircraftDelivery && !galaxy.aircraftDelivery && f22.flightState === 'grounded' && galaxy.flightState === 'grounded'
    }
  }, { distinct: true, parked: true }, 60000)
})

test('[E00279] Factory-built Apache and F-35 take off before landing at their destinations', async({ page }) => {
  await prepareRegressionScenario(page, 211)
  const ids = await page.evaluate(async() => {
    const { productionQueue } = await import('/src/productionQueue.js')
    const r = window.__regression
    const factory = r.building('planeFactory', r.human, 20, 24)
    const pad = r.building('helipad', r.human, 28, 22)
    const strip = r.building('airstrip', r.human, 26, 29)
    factory.constructionFinished = pad.constructionFinished = strip.constructionFinished = true
    for (const type of ['apache', 'f35']) {
      const item = { type, button: document.createElement('button'), factoryId: factory.id }
      productionQueue.unitItems = [item]
      productionQueue.currentUnit = item
      productionQueue.completeCurrentUnitProduction()
      r[type] = window.gameInstance.units.find(unit => unit.type === type)
      if (r[type].factoryExit?.factoryId !== factory.id || r[type].landedHelipadId) throw new Error('Expected aircraft at factory gate')
    }
    r.sawFlight = { apache: false, f35: false }
    const trackFlight = () => {
      for (const type of ['apache', 'f35']) {
        if (r[type].altitude > 8) r.sawFlight[type] = true
      }
      if (!r.sawFlight.apache || !r.sawFlight.f35) requestAnimationFrame(trackFlight)
    }
    requestAnimationFrame(trackFlight)
    window.gameState.gamePaused = false
    return { pad: pad.id, strip: strip.id }
  })
  await pollRegressionState(page, 'Both VTOL aircraft must be airborne before delivery', () => {
    const { apache, f35, sawFlight } = window.__regression
    return {
      ...sawFlight,
      flight: [apache, f35].map(unit => ({ exit: unit.factoryExit, delivery: unit.aircraftDelivery, state: unit.flightState })),
      simulationTime: window.gameState.simulationTime
    }
  }, { apache: true, f35: true })
  await pollRegressionState(page, 'Both aircraft must land using normal pad and airstrip logic', () => {
    const { apache, f35 } = window.__regression
    return { apache: apache.landedHelipadId, f35: f35.landedHelipadId, settled: !apache.aircraftDelivery && !f35.aircraftDelivery }
  }, { apache: ids.pad, f35: ids.strip, settled: true })
})
