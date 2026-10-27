import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

test('[E00240] new ground and sea orders avoid units once while recovery paths ignore them', async({ page }) => {
  await prepareRegressionScenario(page, 216)
  const results = await page.evaluate(async() => {
    const { createUnit, buildOccupancyMap } = await import('/src/units.js')
    const { updateGlobalPathfinding } = await import('/src/game/pathfinding.js')
    const { pathCache } = await import('/src/game/pathCache.js')
    const gs = window.gameState
    const units = window.gameInstance.units
    const results = []
    for (const type of ['tank', 'tankerTruck', 'destroyer', 'hovercraft']) {
      for (const order of ['move', 'attack']) {
        units.splice(0)
        pathCache.clear()
        for (let y = 16; y <= 40; y++) {
          for (let x = 16; x <= 40; x++) gs.mapGrid[y][x].type = ['tank', 'tankerTruck'].includes(type) ? 'land' : 'water'
        }
        const unit = createUnit({ id: gs.humanPlayer, owner: gs.humanPlayer }, type, 20, 26)
        units.push(unit)
        for (const x of [24, 25, 26]) {
          units.push(createUnit({ id: gs.humanPlayer, owner: gs.humanPlayer }, type, x, 26))
        }
        gs.occupancyMap = buildOccupancyMap(units, gs.mapGrid)
        const issueOrder = () => {
          if (order === 'move') {
            window.unitCommandsHandler.handleMovementCommand([unit], 30 * 32, 26 * 32, gs.mapGrid)
          } else {
            window.unitCommandsHandler.handleAttackCommand([unit], {
              id: 'occupancy-test-target', owner: 'enemy', health: 100,
              tileX: 35, tileY: 26, x: 35 * 32, y: 26 * 32, isNaval: unit.isNaval
            }, gs.mapGrid)
          }
        }
        issueOrder()
        const initialDetour = unit.path.some(tile => tile.y !== 26)
        const destination = unit.moveTarget
        unit.target = null
        unit.path = []
        unit.lastPathCalcTime = 1
        gs.simulationTime += 10000
        gs.lastGlobalPathCalc = 0
        updateGlobalPathfinding([unit], gs.mapGrid, gs.occupancyMap, gs)
        const recoveredStraight = unit.path.length > 0 && unit.path.every(tile => tile.y === 26)
        const reachedDestination = JSON.stringify(unit.path.at(-1)) === JSON.stringify(destination)
        issueOrder()
        results.push({ type, order, initialDetour, recoveredStraight, reachedDestination,
          newOrderDetour: unit.path.some(tile => tile.y !== 26) })
      }
    }
    return results
  })
  expect(results).toHaveLength(8)
  for (const result of results) {
    expect(result, `${result.type} ${result.order}`).toMatchObject({
      initialDetour: true, recoveredStraight: true, reachedDestination: true, newOrderDetour: true
    })
  }
})
