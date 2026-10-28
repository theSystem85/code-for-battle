import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

async function prepare(page) {
  await page.addInitScript(() => {
    localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('rts_tutorial_progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await prepareRegressionScenario(page, 418)
  return page.evaluate(async() => {
    const { createUnit } = await import('/src/units.js')
    const gs = window.gameState
    const owner = window.__regression.human
    gs.shadowOfWarEnabled = false
    for (let y = 16; y <= 28; y++) for (let x = 16; x <= 38; x++) gs.mapGrid[y][x].type = 'water'
    const supplier = createUnit({ id: owner, owner }, 'supplyShip', 22, 22, { id: 'context-supplier' })
    const target = createUnit({ id: owner, owner }, 'destroyer', 28, 22, { id: 'context-target' })
    target.gas = 100
    supplier.supplyFuel = supplier.maxSupplyFuel
    target.direction = 0.7
    supplier.direction = 0
    window.gameInstance.units.push(supplier, target)
    gs.buildings.push({ id: 'context-gas', type: 'gasStation', owner, health: 100, x: 40, y: 40, width: 3, height: 3, constructionFinished: true })
    window.remoteControlApi.setLongPressDuration(500)
    window.__context = { supplier, target }
    const rect = document.getElementById('gameCanvas').getBoundingClientRect()
    const screen = unit => ({ x: rect.left + unit.x + 16 - gs.scrollOffset.x, y: rect.top + unit.y + 16 - gs.scrollOffset.y })
    return { supplier: screen(supplier), target: screen(target) }
  })
}

test('[E00241] supply click serves and holding a unit executes Follow on release', async({ page }) => {
  const points = await prepare(page)
  await page.mouse.click(points.supplier.x, points.supplier.y)
  await expect.poll(() => page.evaluate(() => window.selectedUnitsRef.map(unit => unit.id))).toEqual(['context-supplier'])
  await page.mouse.move(points.target.x, points.target.y)
  await expect(page.locator('#gameCanvas')).toHaveClass(/move-into-mode/)
  await page.mouse.click(points.target.x, points.target.y)
  expect(await page.evaluate(() => ({ mode: window.__context.supplier.guardOrderMode, target: window.__context.supplier.guardTarget?.id }))).toEqual({ mode: 'serve', target: 'context-target' })
  await page.mouse.down()
  await page.waitForTimeout(550)
  const menu = page.locator('[data-map-action-menu="true"]')
  await expect(menu).toBeVisible()
  await expect(menu.locator('[data-id="guardUnit"]')).toBeVisible()
  await expect(menu.locator('[data-id="serveUnit"]')).toBeVisible()
  const follow = menu.locator('[data-id="followUnit"]')
  await expect(follow).toBeVisible()
  await page.waitForTimeout(450)
  const box = await follow.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.up()
  await expect(menu).toBeHidden()
  expect(await page.evaluate(() => window.__context.supplier.guardOrderMode)).toBe('follow')
})

test('[E00242] naval selection rejects transparent padding after rotation', async({ page }) => {
  const points = await prepare(page)
  await page.mouse.click(points.target.x, points.target.y)
  await expect.poll(() => page.evaluate(() => window.selectedUnitsRef.map(unit => unit.id))).toEqual(['context-target'])
  const miss = await page.evaluate(async() => {
    const { unitContainsPoint } = await import('/src/input/unitHitTest.js')
    const { target } = window.__context
    const gs = window.gameState
    const rect = document.getElementById('gameCanvas').getBoundingClientRect()
    window.selectedUnitsRef.splice(0)
    target.selected = false
    for (let dy = -40; dy <= 40; dy += 5) for (let dx = -40; dx <= 40; dx += 5) {
      if (Math.hypot(dx, dy) < 45 && !unitContainsPoint(target, target.x + 16 + dx, target.y + 16 + dy)) {
        return { x: rect.left + target.x + 16 + dx - gs.scrollOffset.x, y: rect.top + target.y + 16 + dy - gs.scrollOffset.y }
      }
    }
    throw new Error('No transparent point found within the former selection circle')
  })
  await page.mouse.click(miss.x, miss.y)
  expect(await page.evaluate(() => window.selectedUnitsRef.map(unit => unit.id))).toEqual([])
})
