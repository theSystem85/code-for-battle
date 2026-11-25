import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

test('[E00282] sell mode quotes the workshop refund above the cursor and sells only a fully repaired unit', async({ page }) => {
  await prepareRegressionScenario(page, 212, 64)
  const { x, y, tooltip, price } = await page.evaluate(async() => {
    const { UNIT_COSTS } = await import('/src/config.js')
    const r = window.__regression
    const state = window.gameState
    r.building('vehicleWorkshop', r.human, 27, 24).constructionFinished = true
    r.saleUnit = r.unit('rocketTank', r.human, 25, 25)
    r.saleUnit.health = r.saleUnit.maxHealth - 1
    r.startMoney = state.money
    const price = Math.floor(UNIT_COSTS.rocketTank * 0.66)
    const canvas = document.getElementById('gameCanvas').getBoundingClientRect()
    return {
      x: canvas.left + r.saleUnit.x + 16 - state.scrollOffset.x,
      y: canvas.top + r.saleUnit.y + 16 - state.scrollOffset.y,
      tooltip: `$${price.toLocaleString()}`,
      price
    }
  })

  await page.locator('#sellBtn').click()
  await page.mouse.move(x, y)
  await expect(page.locator('#gameCanvas')).toHaveClass(/sell-blocked-mode/)
  await page.mouse.click(x, y)
  expect(await page.evaluate(() => window.gameInstance.units.includes(window.__regression.saleUnit))).toBe(true)

  await page.evaluate(() => {
    const { saleUnit } = window.__regression
    saleUnit.health = saleUnit.maxHealth
  })
  await page.mouse.move(x + 1, y)
  await expect(page.locator('#gameCanvas')).toHaveCSS('cursor', /sell\.svg/)
  const quote = page.locator('.range-cursor-info--above.visible')
  await expect(quote).toHaveText(tooltip)
  expect((await quote.boundingBox()).y).toBeLessThan(y - 16)

  await page.mouse.click(x, y)
  expect(await page.evaluate(() => ({
    sold: !window.gameInstance.units.includes(window.__regression.saleUnit),
    refund: window.gameState.money - window.__regression.startMoney
  }))).toEqual({ sold: true, refund: price })
  await expect(quote).toHaveCount(0)
})
