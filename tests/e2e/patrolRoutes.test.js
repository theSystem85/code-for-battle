import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

async function prepare(page) {
  await prepareRegressionScenario(page, 521, 64)
  return page.evaluate(async() => {
    const { applyPerkPurchase, adjustPerkStars, setAutomationPerkMode } = await import('/src/perks/perkState.js')
    const { human, unit, building } = window.__regression
    const tank = unit('tank_v1', human, 23, 23)
    building('commandCenter', human, 32, 28)
    setAutomationPerkMode('required')
    adjustPerkStars(human, 7)
    if (!applyPerkPurchase(human, 'cc.unit.start').ok) throw new Error('Could not unlock Unit Command Link')
    window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length, tank)
    tank.selected = true
    window.__patrol = { tank }
    const rect = document.getElementById('gameCanvas').getBoundingClientRect()
    return { x: rect.left + tank.x + 16 - window.gameState.scrollOffset.x, y: rect.top + tank.y + 16 - window.gameState.scrollOffset.y }
  })
}
async function choosePatrol(page, point) {
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  const button = page.locator('[data-map-action-menu="true"] [data-id="patrol"]')
  await expect(button).toBeVisible()
  await page.waitForTimeout(350)
  const box = await button.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.up()
  return button
}
async function unlock(page) {
  const point = await prepare(page)
  await choosePatrol(page, point)
  const perk = page.locator('[data-perk-id="cc.unit.do.patrol"]')
  await expect(perk).toBeFocused()
  await expect(perk).toHaveClass(/show-tooltip/)
  await expect(page.locator('#gameCanvas')).not.toHaveAttribute('data-map-order-draft')
  const box = await perk.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 30)
  await page.mouse.down()
  await page.waitForTimeout(2150)
  await page.mouse.up()
  await expect(perk).toHaveClass(/is-owned/)
  expect(await page.evaluate(() => window.gameState.perks.owners[window.__regression.human].spent)).toBe(7)
  await page.locator('.perk-tree__close').click()
  return point
}
async function finishTouch(page, point) {
  const canvas = page.locator('#gameCanvas')
  for (const type of ['pointerdown', 'pointerup']) {
    for (const id of [41, 42]) await canvas.dispatchEvent(type, { pointerType: 'touch', pointerId: id, clientX: point.x + id, clientY: point.y, button: 0, bubbles: true })
  }
}

test('[E00286] locked patrol focuses its two-star perk; one-point mobile patrol loops and engages enemies', async({ page }) => {
  const point = await unlock(page)
  await choosePatrol(page, point)
  await expect(page.locator('#gameCanvas')).toHaveAttribute('data-map-order-draft', 'patrol')
  await page.mouse.click(point.x + 96, point.y)
  await finishTouch(page, point)
  const initial = await page.evaluate(() => window.__patrol.tank.patrol)
  expect(initial.points).toHaveLength(2)
  expect(initial.index).toBe(1)
  await page.evaluate(() => {
    const { enemy, unit } = window.__regression
    const target = unit('tank_v1', enemy, 25, 26)
    target.guardMode = false
    window.__patrol.enemy = target
    window.__patrol.enemyHealth = target.health
    window.__patrol.tank.target = null
    window.gameState.shadowOfWarEnabled = false
    window.gameState.gamePaused = false
  })
  await expect.poll(() => page.evaluate(() => window.__patrol.enemy.health < window.__patrol.enemyHealth), { timeout: 45000 }).toBe(true)
  await expect.poll(() => page.evaluate(() => window.__patrol.tank.patrol?.index), { timeout: 45000 }).toBe(0)
  await expect.poll(() => page.evaluate(() => window.__patrol.tank.patrol?.index), { timeout: 45000 }).toBe(1)
})

test('[E00287] shared selections stagger independent patrols while formation members depart together', async({ page }) => {
  const point = await unlock(page)
  await page.evaluate(() => {
    const { human, unit } = window.__regression
    const a = window.__patrol.tank
    const b = unit('tank_v1', human, 24, 23)
    const c = unit('tank_v1', human, 25, 23)
    const d = unit('tank_v1', human, 26, 23)
    a.formationActive = b.formationActive = true
    a.groupNumber = b.groupNumber = 1
    a.formationOffset = { x: -16, y: 0 }; b.formationOffset = { x: 16, y: 0 }
    window.__patrol.units = [a, b, c, d]
    window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length, a, b, c, d)
  })
  await choosePatrol(page, point)
  await page.mouse.click(point.x + 128, point.y + 96)
  await page.mouse.click(point.x + 64, point.y + 128)
  await finishTouch(page, point)
  const routes = await page.evaluate(() => window.__patrol.units.map(unit => unit.patrol))
  expect(routes[0].groupId).toBe(routes[1].groupId)
  expect(routes[0].startAt).toBe(routes[1].startAt)
  expect(routes[2].startAt - routes[0].startAt).toBeCloseTo(routes[3].startAt - routes[2].startAt)
  expect(routes[0].points).toEqual(routes[3].points)
})

test('[E00288] CFBL patrol routes run through the unit command API after unlocking', async({ page }) => {
  await unlock(page)
  const result = await page.evaluate(async() => {
    const { saveAutomationSource, applyPolicyToUnit } = await import('/src/policies/policyStore.js')
    const { human, unit } = window.__regression
    const tank = unit('tank_v1', human, 24, 27)
    window.__patrol.cfbl = tank
    const saved = saveAutomationSource(human, { id: 'patrol-e2e', name: 'Loop patrol', source: 'control unit { scope individual; run once; start 1; state 1 { do wait; if (always) goto 2; } state 2 { do patrol(route="24,27;28,27;28,25"); } }' })
    const applied = saved.ok && applyPolicyToUnit(human, tank, 'patrol-e2e')
    window.gameState.gamePaused = false
    return { saved, applied }
  })
  expect(result.saved.ok).toBe(true)
  expect(result.applied.ok).toBe(true)
  await expect.poll(() => page.evaluate(() => window.__patrol.cfbl.patrol?.points.length), { timeout: 15000 }).toBe(3)
})
