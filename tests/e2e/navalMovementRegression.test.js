import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

test('[E00234] naval move orders turn toward close targets without random detours and settle permanently', async({ page }) => {
  await prepareRegressionScenario(page, 216)
  const results = await page.evaluate(async() => {
    const { createUnit, buildOccupancyMap } = await import('/src/units.js')
    const { updateUnitMovement } = await import('/src/game/unitMovement.js')
    const { updateGlobalPathfinding } = await import('/src/game/pathfinding.js')
    const { rebuildSpatialQuadtree } = await import('/src/game/spatialQuadtree.js')
    const gs = window.gameState
    const units = window.gameInstance.units
    // Step the actual movement systems at fixed simulation times while paused.
    // This verifies behavior independently of browser frame/render speed.
    for (let y = 16; y <= 40; y++) {
      for (let x = 16; x <= 40; x++) gs.mapGrid[y][x].type = 'water'
    }
    const results = []
    for (const type of ['aircraftCarrier', 'battleship', 'destroyer']) {
      for (const [targetX, targetY] of [[27, 26], [34, 26], [31, 30]]) {
        units.splice(0)
        const ship = createUnit({ id: gs.humanPlayer, owner: gs.humanPlayer }, type, 26, 26)
        ship.direction = Math.PI
        units.push(ship)
        gs.occupancyMap = buildOccupancyMap(units, gs.mapGrid)
        const initialOccupancy = JSON.stringify(gs.occupancyMap)
        window.unitCommandsHandler.handleMovementCommand([ship], targetX * 32, targetY * 32, gs.mapGrid)
        const commanded = ship.path.length > 0
        const commandedPath = ship.path.map(tile => ({ ...tile }))
        let dodged = false
        let maxLateralDistance = 0
        for (let tick = 0; tick < 2400; tick++) {
          gs.simulationTime += 1000 / 60
          rebuildSpatialQuadtree(units)
          updateGlobalPathfinding(units, gs.mapGrid, gs.occupancyMap, gs)
          updateUnitMovement(units, gs.mapGrid, gs.occupancyMap, gs, gs.simulationTime)
          dodged ||= Boolean(ship.isDodging)
          const crossTrack = Math.abs(
            (ship.x - 26 * 32) * (targetY - 26) - (ship.y - 26 * 32) * (targetX - 26)
          ) / Math.hypot(targetX - 26, targetY - 26)
          maxLateralDistance = Math.max(maxLateralDistance, crossTrack)
        }
        const stopped = ship.path.length === 0 && !ship.moveTarget && ship.movement.currentSpeed === 0
        const stoppedX = ship.x
        for (let tick = 0; tick < 180; tick++) {
          gs.simulationTime += 1000 / 60
          updateGlobalPathfinding(units, gs.mapGrid, gs.occupancyMap, gs)
          updateUnitMovement(units, gs.mapGrid, gs.occupancyMap, gs, gs.simulationTime)
        }
        results.push({ type, targetX, targetY, commanded, commandedPath, dodged, maxLateralDistance, stopped,
          stayedStopped: ship.x === stoppedX && ship.path.length === 0,
          occupancyUnchanged: JSON.stringify(gs.occupancyMap) === initialOccupancy })
      }
    }
    return results
  })

  for (const result of results) {
    expect(result, JSON.stringify(result)).toMatchObject({
      commanded: true, dodged: false, stopped: true, stayedStopped: true, occupancyUnchanged: true
    })
    expect(result.maxLateralDistance, JSON.stringify(result)).toBeLessThan(1)
  }
})
