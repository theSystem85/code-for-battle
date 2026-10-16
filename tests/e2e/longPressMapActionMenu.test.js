import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

async function prepare(page) {
  await prepareRegressionScenario(page, 417)
  return page.evaluate(async() => {
    const r = window.__regression
    r.tank = r.unit('tank_v1', r.human, 22, 22)
    r.tank.selected = true
    window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length, r.tank)
    window.remoteControlApi.setLongPressDuration(400)
    const { savePolicy } = await import('/src/policies/policyStore.js')
    const { POLICY_TEMPLATES } = await import('/src/policies/policyTemplates.js')
    savePolicy(r.human, POLICY_TEMPLATES[0].create('map-arrival-test'))
    const rect = document.getElementById('gameCanvas').getBoundingClientRect()
    return { x: rect.left + 300, y: rect.top + 300 }
  })
}
const menu = page => page.locator('[data-map-action-menu="true"]')
async function choose(page, id) {
  const button = menu(page).locator(`[data-id="${id}"]`)
  await expect(button).toBeVisible()
  // The existing radial component uses geometric hit testing, not DOM click handlers.
  await page.waitForTimeout(450)
  const box = await button.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}
async function hold(page, point, ms = 500) {
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test('desktop hold opens, release is consumed, short click and movement do not open', async({ page }) => {
  const point = await prepare(page)
  await page.mouse.click(point.x, point.y)
  await expect(menu(page)).toBeHidden()
  // A short click is allowed to change selection; restore the selected test unit.
  await page.evaluate(() => { window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length, window.__regression.tank) })
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 25, point.y)
  await page.waitForTimeout(550)
  await page.mouse.up()
  await expect(menu(page)).toBeHidden()
  await page.evaluate(() => { window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length, window.__regression.tank) })
  await hold(page, point)
  await expect(menu(page)).toBeVisible()
  expect(await page.evaluate(() => window.__regression.tank.moveTarget)).toBeNull()
  await choose(page, 'forceAttackAt')
  expect(await page.evaluate(() => ({ forced: window.__regression.tank.forcedAttack, ground: window.__regression.tank.target?.isGroundTarget }))).toEqual({ forced: true, ground: true })
})

test('hold and automation orders move units and take effect when they arrive', async({ page }) => {
  const point = await prepare(page)
  await hold(page, point)
  await choose(page, 'defendHoldAt')
  expect(await page.evaluate(() => ({ pending: window.__regression.tank.mapArrivalAction?.action, move: Boolean(window.__regression.tank.moveTarget), held: Boolean(window.__regression.tank.mapHoldPosition) }))).toEqual({ pending: 'defendHoldAt', move: true, held: false })
  await page.evaluate(() => { window.gameState.gamePaused = false })
  await expect.poll(() => page.evaluate(() => Boolean(window.__regression.tank.mapHoldPosition)), { timeout: 30000 }).toBe(true)
  await page.evaluate(() => { window.gameState.gamePaused = true })
  await hold(page, { x: point.x + 64, y: point.y })
  await choose(page, 'applyAutomationOnArrival')
  await choose(page, 'map-arrival-test')
  expect(await page.evaluate(() => window.__regression.tank.policyBindings?.some(b => b.policyId === 'map-arrival-test') || false)).toBe(false)
  await page.evaluate(() => { window.gameState.gamePaused = false })
  await expect.poll(() => page.evaluate(() => window.__regression.tank.policyBindings?.some(b => b.policyId === 'map-arrival-test') || false), { timeout: 30000 }).toBe(true)
})

test('settings change hold duration and browser agent API exposes every action', async({ page }) => {
  const point = await prepare(page)
  await page.evaluate(async() => {
    const { openSettingsModal } = await import('/src/ui/settingsModal.js')
    openSettingsModal('runtime')
  })
  await page.locator('#settingsMapActionLongPressMs').fill('900')
  await page.locator('#settingsMapActionLongPressMs').dispatchEvent('change')
  await page.locator('#configModalCloseBtn').click()
  await hold(page, point, 500)
  await expect(menu(page)).toBeHidden()
  await page.evaluate(() => { window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length, window.__regression.tank) })
  await hold(page, point, 1050)
  await expect(menu(page)).toBeVisible()
  await page.keyboard.press('Escape')
  const result = await page.evaluate(() => {
    const api = window.remoteControlApi
    const point = { x: 25 * 32 + 16, y: 25 * 32 + 16 }
    return {
      list: api.listApplicableAutomations().some(p => p.policyId === 'map-arrival-test'),
      attack: api.forceAttackAt(point), defend: api.defendHoldAt(point),
      automation: api.applyAutomationOnArrival({ ...point, policyId: 'map-arrival-test' }),
      duration: api.setLongPressDuration(500), open: api.openMapActionMenu(point)
    }
  })
  expect(Object.values(result).every(Boolean)).toBe(true)
})

test.describe('mobile map holds', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 900, height: 700 } })
  test('touch hold opens and a two-finger gesture cancels', async({ page, context }) => {
    const point = await prepare(page)
    const cdp = await context.newCDPSession(page)
    const first = { x: point.x, y: point.y, id: 1 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] })
    await page.waitForTimeout(550)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(menu(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, { x: point.x + 50, y: point.y, id: 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...first, x: first.x - 30 }, { x: point.x + 90, y: point.y, id: 2 }] })
    await page.waitForTimeout(550)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(menu(page)).toBeHidden()
  })
})
