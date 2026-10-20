import { expect, test } from '@playwright/test'
import { waitForLoadingScreenHidden } from './helpers/loadingScreen.js'

async function startGestureTestGame(page) {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=11')
  await page.waitForFunction(() => Boolean(
    window.gameState?.gameStarted &&
    window.gameInstance?.productionController &&
    window.gameInstance?.eventHandlers &&
    window.gameInstance?.gameLoop
  ))
  await waitForLoadingScreenHidden(page)
  await page.evaluate(() => {
    const gs = window.gameState
    // Keep these input tests independent of build completion and enemy AI timing.
    window.gameInstance.gameLoop.stop()
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
  const closeTooltip = page.locator('#productionTooltip[aria-hidden="false"] .money-tooltip__close')
  if (await closeTooltip.isVisible()) await closeTooltip.click()
  await page.locator(`.tab-button[data-tab="${selector.includes('data-unit-type') ? 'units' : 'buildings'}"]`).click()
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

  test('[E00093] native building drag reaches the map drop handler', async({ page }) => {
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

  for (const unitType of ['tank', 'apache', 'destroyer']) {
    test(`[E00094] ${unitType} pauses, decrements, resumes and retains drag rally points`, async({ page }) => {
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
      await expect(counter).toHaveText('2')
      await expect(button).toHaveClass(/paused/)
      await button.click({ position: { x: box.width / 2, y: box.height * 0.8 } })
      await expect(counter).toHaveText('1')
      await button.click({ position: upperPosition })
      await expect(button).not.toHaveClass(/paused/)
      await expect(counter).toHaveText('1')

      await button.dragTo(canvas, { targetPosition: { x: 320, y: 260 } })
      await expect.poll(() => page.evaluate(type => window.__productionGestureDrops.some(drop => (
        drop.kind === 'unit' &&
        drop.type === type &&
        Number.isFinite(drop.clientX) &&
        Number.isFinite(drop.clientY)
      )), unitType)).toBe(true)
      await expect(counter).toHaveText('2')
    })
  }
})


test('[E00212] label hover opens square info sheet and shows wide directional arrows', async({ page }) => {
  await startGestureTestGame(page)
  const button = await exposeButton(page, '.production-button[data-building-type="powerPlant"]')
  const box = await button.boundingBox()
  const sheet = button.locator('.production-hover-sheet')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.2)
  await expect(button).toHaveAttribute('data-stack-hover', 'increase')
  await expect(button).not.toHaveClass(/production-label-hover/)
  await expect.poll(() => sheet.evaluate(element => new window.DOMMatrix(window.getComputedStyle(element).transform).m42)).toBeGreaterThan(0)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6)
  await expect(button).toHaveAttribute('data-stack-hover', 'decrease')
  await expect(button).not.toHaveClass(/production-label-hover/)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 10)
  await expect(button).toHaveClass(/production-label-hover/)
  await expect.poll(() => sheet.evaluate(element => new window.DOMMatrix(window.getComputedStyle(element).transform).m42)).toBe(0)
  await expect(sheet).toHaveCSS('border-radius', '0px')
  await expect(button.locator('.building-name')).toHaveCSS('border-radius', '0px')
  expect(await button.evaluate(element => window.getComputedStyle(element, '::after').opacity)).toBe('0.25')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.2)
  await expect(button).not.toHaveClass(/production-label-hover/)
  await expect.poll(() => sheet.evaluate(element => new window.DOMMatrix(window.getComputedStyle(element).transform).m42)).toBeGreaterThan(0)
})

test('[E00213] pausing multiple building stacks advances to the next unpaused stack', async({ page }) => {
  await startGestureTestGame(page)
  const buttons = []
  for (const type of ['powerPlant', 'oreRefinery', 'vehicleFactory']) {
    const button = await exposeButton(page, `.production-button[data-building-type="${type}"]`)
    const box = await button.boundingBox()
    await button.click({ position: { x: box.width / 2, y: box.height * 0.2 } })
    buttons.push(button)
  }
  for (const button of buttons.slice(0, 2)) {
    const box = await button.boundingBox()
    await button.click({ position: { x: box.width / 2, y: box.height * 0.6 } })
    await expect(button).toHaveClass(/paused/)
    await expect(button.locator('.batch-counter')).toHaveText('1')
    expect(await button.evaluate(element => window.getComputedStyle(element, '::before').content)).toContain('Ⅱ')
  }
  await expect(buttons[2]).toHaveClass(/active/)
  const box = await buttons[0].boundingBox()
  await buttons[0].click({ position: { x: box.width / 2, y: box.height * 0.2 } })
  await expect(buttons[0]).toHaveClass(/active/)
  await expect(buttons[0]).not.toHaveClass(/paused/)
  await expect(buttons[1]).toHaveClass(/paused/)
})
