import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

test('[E00236] mines detonate between movement waypoints for both parties and friendly routes avoid the field', async({ page }) => {
  await prepareRegressionScenario(page, 217)
  const results = await page.evaluate(async() => {
    const { createUnit, findPathForOwner } = await import('/src/units.js')
    const { updateUnitPosition } = await import('/src/game/movementCore.js')
    const { deployMine, updateMines, rebuildMineLookup } = await import('/src/game/mineSystem.js')
    const gs = window.gameState
    const results = []
    for (const owner of ['player1', 'player2']) {
      gs.mines = []
      rebuildMineLookup()
      const mine = deployMine(26, 25, 'player1')
      updateMines(mine.armedAt)
      const tank = createUnit({ id: owner }, 'tank_v1', 25, 25)
      tank.direction = 0
      tank.path = [{ x: 28, y: 25 }]
      tank.moveTarget = { x: 28, y: 25 }
      const health = tank.health
      for (let tick = 0; tick < 200 && gs.mines.length; tick++) {
        updateUnitPosition(tank, gs.mapGrid, gs.occupancyMap, gs.simulationTime + tick * 16, [tank], gs)
      }
      results.push({ owner, detonated: !gs.mines.length, damaged: tank.health < health })
    }
    gs.mines = []
    rebuildMineLookup()
    for (let y = 0; y < gs.mapGrid.length; y++) deployMine(26, y, 'player1')
    updateMines(gs.mines[0].armedAt)
    const friendlyPath = findPathForOwner({ x: 23, y: 25 }, { x: 30, y: 25 }, gs.mapGrid, null, 'player1')
    return { results, friendlyCrossed: friendlyPath.some(tile => tile.x >= 26) }
  })
  expect(results.results).toEqual([
    { owner: 'player1', detonated: true, damaged: true },
    { owner: 'player2', detonated: true, damaged: true }
  ])
  expect(results.friendlyCrossed).toBe(false)
})

test('[E00237] wreck occupancy blocks building placement and clears after removal', async({ page }) => {
  await prepareRegressionScenario(page, 218)
  const results = await page.evaluate(async() => {
    const { createUnit } = await import('/src/units.js')
    const { registerUnitWreck, removeWreckById } = await import('/src/game/unitWreckManager.js')
    const { canPlaceBuilding, isTileValid } = await import('/src/validation/buildingPlacement.js')
    const gs = window.gameState
    const tank = createUnit({ id: gs.humanPlayer }, 'tank_v1', 25, 25)
    const wreck = registerUnitWreck(tank, gs)
    const canPlace = () => canPlaceBuilding('street', 25, 25, gs.mapGrid, [], [], [], gs.humanPlayer, { mapEditMode: true })
    const blocked = !canPlace()
    const overlayBlocked = !isTileValid(25, 25, gs.mapGrid, [], [], [], 'street')
    removeWreckById(gs, wreck.id)
    return { blocked, overlayBlocked, cleared: canPlace() }
  })
  expect(results).toEqual({ blocked: true, overlayBlocked: true, cleared: true })
})
