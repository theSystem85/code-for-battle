import { test, expect } from '@playwright/test'
import { prepareRegressionScenario, observeSimulation, pollRegressionState } from './helpers/regressionScenario.js'

test('[E00003] individual Apache orders reserve separate helipads and an occupied pad shows the blocked cursor', async({ page }) => {
  await prepareRegressionScenario(page, 213)
  await page.evaluate(() => {
    const r = window.__regression
    r.pad = r.building('helipad', r.human, 22, 22)
    r.alternate = r.building('helipad', r.human, 28, 22)
    r.first = r.unit('apache', r.human, 22, 25)
    r.second = r.unit('apache', r.human, 30, 30)
    r.first.manualFlightState = 'auto'
    window.unitCommandsHandler.handleApacheHelipadCommand([r.first], r.pad, window.gameState.mapGrid)
    window.gameState.gamePaused = false
  })
  const readLandingState = () => {
    const r = window.__regression
    const state = u => ({ x: u.x, y: u.y, flight: u.flightState, altitude: u.altitude,
      landed: u.landedHelipadId, requested: u.helipadLandingRequested, target: u.helipadTargetId,
      plan: u.flightPlan, move: u.moveTarget, settle: u.servicePadTouchdownReadyAt, settlingPad: u.servicePadTouchdownId, speed: u.movement?.currentSpeed })
    return { firstLanded: r.first.landedHelipadId === r.pad.id && r.pad.landedUnitId === r.first.id,
      secondLanded: r.second.landedHelipadId === r.alternate.id && r.alternate.landedUnitId === r.second.id,
      first: state(r.first), second: state(r.second), padOccupant: r.pad.landedUnitId,
      alternateOccupant: r.alternate.landedUnitId }
  }
  await pollRegressionState(page, 'First individual landing must settle on its requested pad', readLandingState, { firstLanded: true })
  // A completed landing must retain its claim over many subsequent simulation ticks.
  await observeSimulation(page, 1000)
  const first = await page.evaluate(readLandingState)
  expect(first, `Stable first landing: ${JSON.stringify(first)}`).toMatchObject({ firstLanded: true })
  await page.evaluate(() => {
    const r = window.__regression
    window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length, r.second)
    r.second.selected = true
  })
  const point = await page.evaluate(async() => {
    const { getCanvasLogicalSize } = await import('/src/rendering/renderingUtils.js')
    const r = window.__regression
    const canvas = document.getElementById('gameCanvas')
    const rect = canvas.getBoundingClientRect()
    const logical = getCanvasLogicalSize(canvas)
    return { x: rect.left + ((r.pad.x + 0.5) * 32 - window.gameState.scrollOffset.x) * rect.width / logical.width,
      y: rect.top + ((r.pad.y + 0.5) * 32 - window.gameState.scrollOffset.y) * rect.height / logical.height }
  })
  await page.mouse.move(point.x, point.y)
  await expect(page.locator('#gameCanvas'), `Occupied helipad cursor at ${JSON.stringify(point)}; ${JSON.stringify(first)}`)
    .toHaveClass(/move-blocked-mode/)
  await page.evaluate(() => {
    const r = window.__regression
    r.second.manualFlightState = 'auto'
    window.unitCommandsHandler.handleApacheHelipadCommand([r.second], r.pad, window.gameState.mapGrid)
  })
  await pollRegressionState(page, 'Second individual order must use the free pad without replacing the first occupant',
    readLandingState, { firstLanded: true, secondLanded: true })
  await observeSimulation(page, 2000)
  const final = await page.evaluate(readLandingState)
  expect(final, `Both settled pad claims must persist: ${JSON.stringify(final)}`)
    .toMatchObject({ firstLanded: true, secondLanded: true })
})
