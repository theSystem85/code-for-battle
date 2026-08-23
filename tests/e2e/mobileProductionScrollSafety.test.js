import { devices, expect, test } from '@playwright/test'

const iphoneLandscape = { ...devices['iPhone 13 Pro Max landscape'] }
delete iphoneLandscape.defaultBrowserType
test.use({ ...iphoneLandscape, storageState: undefined })

test('scrolling from every production category never builds on release', async({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=11')
  await page.waitForFunction(() => Boolean(window.gameState?.gameStarted && window.gameInstance?.productionController))
  await page.evaluate(async() => {
    const gs = window.gameState
    gs.gamePaused = false
    gs.money = 1000000
    gs.playerPowerSupply = 1000
    const owner = gs.humanPlayer
    ;['vehicleFactory', 'helipad', 'shipyard'].forEach((type, index) => {
      if (!gs.buildings.some(building => building.type === type && building.owner === owner)) {
        gs.buildings.push({ id: `mobile-${type}`, type, owner, x: 8 + index * 4, y: 8, width: 3, height: 3, health: 500, maxHealth: 500 })
      }
    })
    const { productionQueue } = await import('/src/productionQueue.js')
    productionQueue.unitItems = []
    productionQueue.buildingItems = []
    productionQueue.currentUnit = null
    productionQueue.currentBuilding = null
    ;['air', 'naval'].forEach(laneName => {
      const lane = productionQueue.unitQueues[laneName]
      lane.unitItems = []
      lane.currentUnit = null
      lane.pausedUnit = false
    })
    document.querySelectorAll('.production-button').forEach(button => {
      button.classList.add('unlocked')
      button.classList.remove('disabled', 'active', 'paused', 'ready-for-placement')
    })
  })

  const client = await context.newCDPSession(page)
  const cases = [
    ['building', 'powerPlant', 'ground'],
    ['unit', 'tank', 'ground'],
    ['unit', 'apache', 'air'],
    ['unit', 'destroyer', 'naval']
  ]

  for (const [kind, type, laneName] of cases) {
    const attribute = kind === 'building' ? 'data-building-type' : 'data-unit-type'
    const selector = `#mobileBuildMenuContainer .production-button[${attribute}="${type}"]`
    await page.evaluate(({ selector: targetSelector }) => {
      const target = document.querySelector(targetSelector)
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'))
      target?.closest('.tab-content')?.classList.add('active')
      if (target) target.style.display = 'block'
      target?.scrollIntoView({ block: 'center' })
    }, { selector })
    const button = page.locator(selector)
    await expect(button).toBeVisible()
    const box = await button.boundingBox()
    if (!box) throw new Error(`Missing ${type} touch target`)

    const x = box.x + box.width / 2
    const startY = box.y + box.height / 2
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y: startY, id: 1 }]
    })
    for (const distance of [10, 25, 45]) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: startY - distance, id: 1 }]
      })
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(100)

    const queueCount = await page.evaluate(async({ kind: queueKind, type: itemType, laneName: lane }) => {
      const { productionQueue } = await import('/src/productionQueue.js')
      return queueKind === 'building'
        ? productionQueue.buildingItems.filter(item => item.type === itemType).length
        : productionQueue.unitQueues[lane].unitItems.filter(item => item.type === itemType).length
    }, { kind, type, laneName })
    expect(queueCount, `${type} must not queue after a scroll release`).toBe(0)
  }
})
