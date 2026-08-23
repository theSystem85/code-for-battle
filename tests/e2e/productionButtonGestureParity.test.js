import { expect, test } from '@playwright/test'

async function startGestureTestGame(page) {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=11')
  await page.waitForFunction(() => Boolean(
    window.gameState?.gameStarted &&
    window.gameInstance?.productionController
  ))
  await page.evaluate(() => {
    const gs = window.gameState
    gs.gamePaused = false
    gs.money = 1000000
    gs.playerPowerSupply = 1000
    const owner = gs.humanPlayer
    const prerequisites = [
      ['vehicleFactory', 8, 8],
      ['helipad', 12, 8],
      ['shipyard', 16, 8]
    ]
    prerequisites.forEach(([type, x, y]) => {
      if (!gs.buildings.some(building => building.type === type && building.owner === owner)) {
        gs.buildings.push({ id: `gesture-${type}`, type, owner, x, y, width: 3, height: 3, health: 500, maxHealth: 500 })
      }
    })
    document.querySelectorAll('.production-button').forEach(button => {
      button.classList.add('unlocked')
      button.classList.remove('disabled')
    })
  })
}

async function exposeButton(page, selector) {
  const button = page.locator(selector)
  await button.evaluate(element => {
    element.closest('.tab-content')?.classList.add('active')
    element.style.display = 'block'
  })
  await button.scrollIntoViewIfNeeded()
  await expect(button).toBeVisible()
  return button
}

test.describe('production button desktop gesture parity', () => {
  test.beforeEach(async({ page }) => {
    await startGestureTestGame(page)
  })

  test('native building drag reaches the map drop handler', async({ page }) => {
    const button = await exposeButton(page, '.production-button[data-building-type="powerPlant"]')
    const canvas = page.locator('#gameCanvas')
    await page.evaluate(() => {
      window.__productionGestureDrops = []
      window.gameInstance.eventHandlers.handleDragDropPlacement = detail => {
        window.__productionGestureDrops.push({ kind: detail.kind, type: detail.type })
      }
    })

    await button.dragTo(canvas, { targetPosition: { x: 240, y: 240 } })

    await expect.poll(() => page.evaluate(() => window.__productionGestureDrops)).toContainEqual({
      kind: 'building',
      type: 'powerPlant'
    })
  })

  test('ground, air, and water buttons decrement and retain drag rally points', async({ page }) => {
    const unitCases = [
      'tank',
      'apache',
      'destroyer'
    ]
    const canvas = page.locator('#gameCanvas')
    await page.evaluate(() => {
      window.__productionGestureDrops = []
      const originalDrop = window.gameInstance.eventHandlers.handleDragDropPlacement.bind(window.gameInstance.eventHandlers)
      window.gameInstance.eventHandlers.handleDragDropPlacement = detail => {
        window.__productionGestureDrops.push({
          kind: detail.kind,
          type: detail.type,
          clientX: detail.clientX,
          clientY: detail.clientY
        })
        originalDrop(detail)
      }
    })

    for (const unitType of unitCases) {
      const selector = `.production-button[data-unit-type="${unitType}"]`
      const button = await exposeButton(page, selector)
      const box = await button.boundingBox()
      if (!box) throw new Error(`Missing ${unitType} production button bounds`)
      const upperPosition = { x: box.width / 2, y: box.height * 0.2 }
      await button.click({ position: upperPosition })
      await button.click({ position: upperPosition })
      const counter = button.locator('.batch-counter')
      await expect(counter).toHaveText('2')

      await button.click({ position: { x: box.width / 2, y: box.height * 0.8 } })
      await expect(counter).toHaveText('1')

      await button.dragTo(canvas, { targetPosition: { x: 320, y: 260 } })
      await expect.poll(() => page.evaluate(type => window.__productionGestureDrops.some(drop => (
        drop.kind === 'unit' &&
        drop.type === type &&
        Number.isFinite(drop.clientX) &&
        Number.isFinite(drop.clientY)
      )), unitType)).toBe(true)
      await expect(counter).toHaveText('2')
    }
  })
})
