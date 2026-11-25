import { test } from '@playwright/test'
import { prepareRegressionScenario, pollRegressionState } from './helpers/regressionScenario.js'

test('[E00281] depleted support units return for supplies and a harvester deposits its partial load', async({ page }) => {
  await prepareRegressionScenario(page, 212, 64)
  await page.evaluate(() => {
    const r = window.__regression
    const gs = window.gameState
    r.building('hospital', r.human, 32, 17)
    r.building('gasStation', r.human, 32, 24)
    r.building('ammunitionFactory', r.human, 32, 31)
    r.refinery = r.building('oreRefinery', r.human, 34, 37)
    r.ambulance = r.unit('ambulance', r.human, 23, 18)
    r.tanker = r.unit('tankerTruck', r.human, 23, 25)
    r.truck = r.unit('ammunitionTruck', r.human, 23, 32)
    r.harvester = r.unit('harvester', r.human, 25, 38)
    r.ambulance.medics = 0
    r.tanker.supplyGas = 0
    r.truck.ammoCargo = 0
    r.harvester.oreCarried = 300
    window.unitCommandsHandler.handleRefineryUnloadCommand([r.harvester], r.refinery, gs.mapGrid)
    gs.speedMultiplier = 3
    gs.gamePaused = false
  })

  await pollRegressionState(page, 'Each depleted provider must refill and the refinery must credit the partial load', () => {
    const { ambulance, tanker, truck, harvester, refinery } = window.__regression
    const revenue = window.gameState.refineryRevenue[refinery.id]
    return {
      ambulanceRestocked: ambulance.medics === ambulance.maxMedics,
      tankerRestocked: tanker.supplyGas === tanker.maxSupplyGas,
      truckRestocked: truck.ammoCargo === truck.maxAmmoCargo,
      oreRemaining: harvester.oreCarried,
      revenue,
      stocks: [ambulance.medics, tanker.supplyGas, truck.ammoCargo],
      tiles: [ambulance.tileX, tanker.tileX, truck.tileX, harvester.tileX]
    }
  }, { ambulanceRestocked: true, tankerRestocked: true, truckRestocked: true, oreRemaining: 0, revenue: 300 }, 45000)
})
