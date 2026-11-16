import { expect, test } from '@playwright/test'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

test('[E00262] fire engine extinguishes a burning building and restores fire state', async({ page }) => {
  await prepareRegressionScenario(page, '419&size=64&players=2')
  const result = await page.evaluate(async() => {
    const { createBuilding, placeBuilding } = await import('/src/buildings.js')
    const { igniteTile, updateFireSystem, restoreFires } = await import('/src/game/fireSystem.js')
    const gs = window.gameState
    const owner = window.__regression.human
    const station = createBuilding('fireDepartment', 20, 20)
    station.owner = owner
    gs.buildings.push(station)
    placeBuilding(station, gs.mapGrid, gs.occupancyMap)
    const truck = window.__regression.unit('fireEngine', owner, 24, 22)
    const house = createBuilding('vehicleFactory', 26, 22)
    house.owner = owner
    gs.buildings.push(house)
    placeBuilding(house, gs.mapGrid, gs.occupancyMap)
    const initialHealth = house.health
    igniteTile(gs, gs.mapGrid, 26, 22)
    const records = JSON.parse(JSON.stringify(gs.fires))
    restoreFires(gs, gs.mapGrid, records)
    const restored = gs.mapGrid[22][26].fire === gs.fires[0]
    for (let i = 0; i < 180; i++) updateFireSystem([truck], gs, gs.mapGrid, 1000 / 60)
    // One final tick allows fractional suppression to cross the threshold.
    updateFireSystem([truck], gs, gs.mapGrid, 1000 / 60)
    return { restored, burning: Boolean(gs.mapGrid[22][26].fire), water: truck.water, damaged: house.health < initialHealth, departmentCard: Boolean(document.querySelector('[data-building-type="fireDepartment"]')) }
  })
  expect(result.restored).toBe(true)
  expect(result.burning).toBe(false)
  expect(result.water).toBeGreaterThan(870)
  expect(result.water).toBeLessThan(881)
  expect(result.damaged).toBe(true)
  await expect.poll(() => page.evaluate(async() => {
    const { getPreparedSprite } = await import('/src/rendering/prepared/preparedSpritePipeline.js')
    return Boolean(getPreparedSprite('unit:fireEngine:base'))
  }), { timeout: 15000 }).toBe(true)
  expect(result.departmentCard).toBe(true)
})

test('[E00263] fire atlas prepares and graphics quality variants render translucent flames', async({ page }) => {
  await prepareRegressionScenario(page, '419&size=64&players=2')
  const result = await page.evaluate(async() => {
    const { prepareFireSprites, getFireSprites } = await import('/src/rendering/fireSprites.js')
    const { renderFires } = await import('/src/rendering/fireRenderer.js')
    const { setConfigValue, getConfigValue } = await import('/src/configRegistry.js')
    await prepareFireSprites()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')
    const fires = [{ x: 2, y: 3, age: 80, suppression: 0 }, { x: 3, y: 3, age: 80, suppression: 0 }]
    const grid = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({})))
    for (const fire of fires) grid[fire.y][fire.x].fire = fire
    const modes = []
    for (const detail of ['high', 'low']) {
      setConfigValue('fireDetail', detail)
      ctx.clearRect(0, 0, 256, 256)
      renderFires(ctx, { fires, simulationTime: 3000 }, grid, [], { x: 0, y: 0 })
      const data = ctx.getImageData(0, 0, 256, 256).data
      let translucent = false
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0 && data[i] < 255) { translucent = true; break }
      modes.push({ detail: getConfigValue('fireDetail'), translucent })
    }
    setConfigValue('fireDetail', 'high')
    return { width: getFireSprites().naturalWidth, modes }
  })
  await page.click('#helpBtn')
  await page.click('[data-config-tab="graphics"]')
  const detail = page.locator('#settingsGraphics-fireDetail')
  await expect(detail).toHaveValue('high')
  await detail.selectOption('low')
  await expect.poll(() => page.evaluate(async() => {
    const { getConfigValue } = await import('/src/configRegistry.js')
    return getConfigValue('fireDetail')
  })).toBe('low')
  await detail.selectOption('high')
  expect(result.width).toBe(512)
  expect(result.modes).toEqual([{ detail: 'high', translucent: true }, { detail: 'low', translucent: true }])
})
