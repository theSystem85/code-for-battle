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
  expect(result.water).toBeGreaterThan(1778)
  expect(result.water).toBeLessThan(1781)
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

test('[E00266] one engine saves a fully burning 3x3 building with neighbouring fire', async({ page }) => {
  await prepareRegressionScenario(page, '419&size=64&players=2')
  const result = await page.evaluate(async() => {
    const { createBuilding, placeBuilding } = await import('/src/buildings.js')
    const { igniteTile, updateFireSystem } = await import('/src/game/fireSystem.js')
    const gs = window.gameState
    const owner = window.__regression.human
    const building = createBuilding('vehicleFactory', 26, 22)
    building.owner = owner
    gs.buildings.push(building)
    placeBuilding(building, gs.mapGrid, gs.occupancyMap)
    const truck = window.__regression.unit('fireEngine', owner, 25, 23)
    for (let y = 22; y < 25; y++) for (let x = 26; x < 29; x++) {
      igniteTile(gs, gs.mapGrid, x, y)
      gs.mapGrid[y][x].fire.age = 80
    }
    // A neighbouring fire can spread back into the building and is within hose range.
    gs.mapGrid[21][26].type = 'woods'
    igniteTile(gs, gs.mapGrid, 26, 21)
    gs.mapGrid[21][26].fire.age = 80
    let seed = 123456
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    let ticks = 0
    while (gs.fires.length && building.health > 0 && truck.water > 0 && ticks < 60 * 120) {
      updateFireSystem([truck], gs, gs.mapGrid, 1000 / 60, null, random)
      ticks++
    }
    return { fires: gs.fires.length, health: building.health, water: truck.water, ticks }
  })
  expect(result.fires).toBe(0)
  expect(result.health).toBeGreaterThan(0)
  expect(result.water).toBeGreaterThan(0)
  expect(result.ticks).toBeLessThan(60 * 120)
})


test('[E00267] fire pauses repairs until the attack cooldown expires', async({ page }) => {
  await prepareRegressionScenario(page, '419&size=64&players=2')
  const result = await page.evaluate(async() => {
    const { createBuilding, placeBuilding, updateBuildingsUnderRepair, updateBuildingsAwaitingRepair } = await import('/src/buildings.js')
    const { igniteTile, updateFireSystem, restoreFires } = await import('/src/game/fireSystem.js')
    const gs = window.gameState
    const building = createBuilding('vehicleFactory', 26, 22)
    building.owner = window.__regression.human
    gs.buildings.push(building)
    placeBuilding(building, gs.mapGrid, gs.occupancyMap)
    building.health -= 50
    gs.buildingsUnderRepair = [{ building, startTime: performance.now(), duration: 20000, startHealth: building.health, targetHealth: building.maxHealth, healthToRepair: 50, cost: 100, costPaid: 0 }]
    igniteTile(gs, gs.mapGrid, 26, 22)
    updateFireSystem([], gs, gs.mapGrid, 1000)
    const attackTime = building.lastAttackedTime
    updateBuildingsUnderRepair(gs, attackTime)
    const paused = gs.buildingsUnderRepair.length === 0 && gs.buildingsAwaitingRepair.length === 1
    updateBuildingsAwaitingRepair(gs, attackTime + 9999)
    const waiting = gs.buildingsUnderRepair.length === 0
    restoreFires(gs, gs.mapGrid, [])
    updateBuildingsAwaitingRepair(gs, attackTime + 10000)
    return { paused, waiting, resumed: gs.buildingsUnderRepair.length === 1 }
  })
  expect(result).toEqual({ paused: true, waiting: true, resumed: true })
})

test('[E00268] the running game saves a fully burning factory with one engine', async({ page }) => {
  await prepareRegressionScenario(page, '419&size=64&players=2')
  await page.evaluate(async() => {
    const { igniteTile } = await import('/src/game/fireSystem.js')
    const gs = window.gameState
    const building = window.__regression.building('vehicleFactory', window.__regression.human, 26, 22)
    const truck = window.__regression.unit('fireEngine', window.__regression.human, 25, 23)
    for (let y = 22; y < 25; y++) for (let x = 26; x < 29; x++) {
      igniteTile(gs, gs.mapGrid, x, y)
      gs.mapGrid[y][x].fire.age = 80
    }
    gs.mapGrid[21][26].type = 'woods'
    igniteTile(gs, gs.mapGrid, 26, 21)
    gs.mapGrid[21][26].fire.age = 80
    window.__fireTest = { building, truck }
    gs.speedMultiplier = 3
    gs.gamePaused = false
  })
  await expect.poll(() => page.evaluate(() => ({
    fires: window.gameState.fires.length,
    health: window.__fireTest.building.health,
    water: window.__fireTest.truck.water
  })), { timeout: 90000 }).toMatchObject({ fires: 0, health: expect.any(Number), water: expect.any(Number) })
  const result = await page.evaluate(() => ({
    alive: window.gameState.buildings.includes(window.__fireTest.building),
    health: window.__fireTest.building.health,
    water: window.__fireTest.truck.water
  }))
  expect(result.alive).toBe(true)
  expect(result.health).toBeGreaterThan(0)
  expect(result.water).toBeGreaterThan(0)
})
