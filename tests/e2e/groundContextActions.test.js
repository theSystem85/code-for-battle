import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

async function prepare(page) {
  await prepareRegressionScenario(page, 419, 64, 60000)
  return page.evaluate(() => {
    const gs = window.gameState
    const { human, unit, building } = window.__regression
    const tank = unit('tank_v1', human, 23, 23)
    tank.gas = tank.maxGas / 3
    const tanker = unit('tankerTruck', human, 28, 23)
    tanker.supplyGas = tanker.maxSupplyGas
    const workshop = building('vehicleWorkshop', human, 30, 28)
    window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length, tank)
    tank.selected = true
    window.__groundContext = { tank, tanker, workshop }
    const rect = document.getElementById('gameCanvas').getBoundingClientRect()
    return { x: rect.left + tank.x + 16 - gs.scrollOffset.x, y: rect.top + tank.y + 16 - gs.scrollOffset.y }
  })
}
async function buttonPoint(page, id) {
  const button = page.locator(`[data-map-action-menu="true"] [data-id="${id}"]`)
  await expect(button).toBeVisible()
  await page.waitForTimeout(280)
  const box = await button.boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
async function openAndChoose(page, origin, id) {
  await page.mouse.move(origin.x, origin.y)
  await page.mouse.down()
  await page.waitForTimeout(280)
  const point = await buttonPoint(page, id)
  await page.mouse.move(point.x, point.y)
  await page.mouse.up()
}

test('[E00283] ground context offers retreat destinations, reverse movement and workshop defense', async({ page }) => {
  const origin = await prepare(page)
  await openAndChoose(page, { x: origin.x - 64, y: origin.y }, 'retreatTo')
  const retreatState = () => page.evaluate(() => {
    const { isRetreating, isMovingBackwards, retreatTarget, retreatUsesPath } = window.__groundContext.tank
    return { isRetreating, isMovingBackwards, retreatTarget, retreatUsesPath }
  })
  await expect.poll(retreatState).toEqual({ isRetreating: true, isMovingBackwards: true, retreatTarget: { x: 21, y: 23 }, retreatUsesPath: true })
  await page.waitForTimeout(650)
  await page.keyboard.down('Shift')
  await page.mouse.click(origin.x + 96, origin.y + 64)
  await page.keyboard.up('Shift')
  await expect.poll(retreatState).toEqual({ isRetreating: true, isMovingBackwards: true, retreatTarget: { x: 26, y: 25 }, retreatUsesPath: true })
  const workshop = await page.evaluate(() => {
    const gs = window.gameState
    const b = window.__groundContext.workshop
    const rect = document.getElementById('gameCanvas').getBoundingClientRect()
    return { x: rect.left + (b.x + 1) * 32 - gs.scrollOffset.x, y: rect.top + (b.y + 1) * 32 - gs.scrollOffset.y }
  })
  await page.waitForTimeout(650)
  await openAndChoose(page, workshop, 'defendBuilding')
  expect(await page.evaluate(() => window.__groundContext.tank.guardTarget?.id)).toBe(await page.evaluate(() => window.__groundContext.workshop.id))
})

test('[E00284] a continuous hold fans out supply choices and dispatches a tanker on release', async({ page }) => {
  const origin = await prepare(page)
  await page.mouse.move(origin.x, origin.y)
  await page.mouse.down()
  await page.waitForTimeout(280)
  const supply = await buttonPoint(page, 'callSupply')
  await page.mouse.move(supply.x, supply.y)
  await page.waitForTimeout(320)
  const gas = await buttonPoint(page, 'supplyGas')
  await expect(page.locator('[data-id="supplyGas"]')).not.toHaveClass(/is-disabled/)
  await page.mouse.move(gas.x, gas.y)
  await page.mouse.up()
  await expect(page.locator('[data-map-action-menu="true"]')).toBeHidden()
  expect(await page.evaluate(() => window.__groundContext.tanker.utilityQueue?.targets?.some(entry => entry.id === window.__groundContext.tank.id) || window.__groundContext.tanker.refuelTarget?.id === window.__groundContext.tank.id)).toBe(true)
})

test('[E00285] mobile map taps collect a route and a two-finger tap starts it', async({ page }) => {
  const origin = await prepare(page)
  await openAndChoose(page, origin, 'planPath')
  const touch = async(type, id, x, y) => page.locator('#gameCanvas').dispatchEvent(type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y, button: 0, bubbles: true })
  for (const [x, y] of [[origin.x + 50, origin.y], [origin.x + 50, origin.y + 60]]) {
    await touch('pointerdown', 1, x, y)
    await touch('pointerup', 1, x, y)
  }
  expect(await page.evaluate(() => window.__groundContext.tank.moveTarget)).toBeNull()
  await touch('pointerdown', 1, origin.x, origin.y)
  await touch('pointerdown', 2, origin.x + 40, origin.y)
  await touch('pointerup', 1, origin.x, origin.y)
  await touch('pointerup', 2, origin.x + 40, origin.y)
  await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-map-order-draft')
  expect(await page.evaluate(() => window.__groundContext.tank.commandQueue.length)).toBe(2)
  await page.evaluate(() => { window.gameState.gamePaused = false })
  await expect.poll(() => page.evaluate(() => window.__groundContext.tank.currentCommand?.type)).toBe('move')
})

test('[E00289] desktop right-click commits a route to the same queue as Option-click', async({ page }) => {
  const origin = await prepare(page)
  await page.keyboard.down('Alt')
  await page.mouse.click(origin.x + 100, origin.y)
  await page.keyboard.up('Alt')
  await openAndChoose(page, origin, 'planPath')
  await page.mouse.click(origin.x + 24, origin.y + 68)
  await page.mouse.click(origin.x + 85, origin.y + 98)
  await page.mouse.click(origin.x + 110, origin.y + 110, { button: 'right' })
  await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-map-order-draft')
  const actions = await page.evaluate(() => {
    const tank = window.__groundContext.tank
    return [tank.currentCommand, ...tank.commandQueue].filter(Boolean)
  })
  const world = 23 * 32 + 16
  expect(actions).toEqual([
    { type: 'move', x: world + 100, y: world },
    { type: 'move', x: world + 24, y: world + 68 },
    { type: 'move', x: world + 85, y: world + 98 }
  ])
})
