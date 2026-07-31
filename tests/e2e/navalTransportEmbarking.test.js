import { expect, test } from '@playwright/test'

const TRANSPORT_IDS = {
  ferry: 'e2e-ferry',
  hoverLand: 'e2e-hover-land',
  hoverCoast: 'e2e-hover-coast'
}

async function setupScenario(page, { transportType, transportId, tankCount, onLand }) {
  await page.evaluate(async({ transportType, transportId, tankCount, onLand }) => {
    const [{ TILE_SIZE }, { createUnit }, mainModule] = await Promise.all([
      import('/src/config.js'),
      import('/src/units.js'),
      import('/src/main.js')
    ])
    const gameState = window.gameState
    const units = mainModule.units
    const owner = gameState.humanPlayer || 'player1'
    const coastX = 15

    units.splice(0, units.length)
    window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length)
    gameState.scrollOffset.x = 0
    gameState.scrollOffset.y = 0
    gameState.attackGroupMode = false
    gameState.selectionActive = false

    for (let y = 0; y < gameState.mapGrid.length; y++) {
      for (let x = 0; x < gameState.mapGrid[y].length; x++) {
        const tile = gameState.mapGrid[y][x]
        tile.type = onLand || x < coastX ? 'land' : 'water'
        tile.building = null
        tile.seedCrystal = false
      }
    }
    gameState.occupancyMap = gameState.mapGrid.map(row => row.map(() => 0))

    const factory = { id: owner, owner }
    const transportTile = onLand ? { x: 8, y: 10 } : { x: 17, y: 10 }
    const transport = createUnit(factory, transportType, transportTile.x, transportTile.y, { id: transportId })
    transport.owner = owner
    transport.selected = false
    transport.direction = onLand ? 0 : Math.PI
    transport.path = []
    transport.moveTarget = null
    transport.embarkedUnitIds = []
    transport.embarkedUnitTypes = []
    transport.pendingLoadUnitIds = []
    transport.pendingLoadUnitId = null
    transport.pendingLoadRendezvous = null
    transport.pendingUnloadTile = null
    transport.transportOperation = null
    units.push(transport)

    const tankIds = []
    for (let index = 0; index < tankCount; index++) {
      const tileX = onLand ? 12 + (index % 2) : 8 + (index % 3)
      const tileY = 6 + Math.floor(index / (onLand ? 2 : 3))
      const id = `${transportId}-tank-${index}`
      const tank = createUnit(factory, 'tank_v1', tileX, tileY, { id })
      tank.owner = owner
      tank.selected = false
      tank.path = []
      tank.moveTarget = null
      tank.guardMode = false
      tank.guardTarget = null
      tank.guardTargets = null
      units.push(tank)
      tankIds.push(id)
      const occupiedX = Math.floor((tank.x + TILE_SIZE / 2) / TILE_SIZE)
      const occupiedY = Math.floor((tank.y + TILE_SIZE / 2) / TILE_SIZE)
      gameState.occupancyMap[occupiedY][occupiedX]++
    }

    window.__navalTransportFixture = { transportId, tankIds, coastX }
    window.gameInstance.gameLoop.requestRender()
  }, { transportType, transportId, tankCount, onLand })
}

async function selectUnits(page, ids) {
  await page.evaluate(selectedIds => {
    const selected = new Set(selectedIds)
    window.selectedUnitsRef.splice(0, window.selectedUnitsRef.length)
    window.gameState.units.forEach(unit => {
      unit.selected = selected.has(unit.id)
      if (unit.selected) window.selectedUnitsRef.push(unit)
    })
    window.gameInstance.gameLoop.requestRender()
  }, ids)
}

async function worldToClient(page, worldX, worldY) {
  const canvas = page.locator('#gameCanvas')
  const box = await canvas.boundingBox()
  const scroll = await page.evaluate(() => ({ ...window.gameState.scrollOffset }))
  return {
    x: box.x + worldX - scroll.x,
    y: box.y + worldY - scroll.y
  }
}

async function clickUnit(page, id) {
  const point = await page.evaluate(unitId => {
    const unit = window.gameState.units.find(candidate => candidate.id === unitId)
    return { x: unit.x + 16, y: unit.y + 16 }
  }, id)
  const client = await worldToClient(page, point.x, point.y)
  await page.mouse.click(client.x, client.y)
}

async function dragAroundTanks(page) {
  const bounds = await page.evaluate(() => {
    const { tankIds } = window.__navalTransportFixture
    const tanks = window.gameState.units.filter(unit => tankIds.includes(unit.id))
    return {
      left: Math.min(...tanks.map(unit => unit.x)) - 12,
      top: Math.min(...tanks.map(unit => unit.y)) - 12,
      right: Math.max(...tanks.map(unit => unit.x + 32)) + 12,
      bottom: Math.max(...tanks.map(unit => unit.y + 32)) + 12
    }
  })
  const start = await worldToClient(page, bounds.left, bounds.top)
  const end = await worldToClient(page, bounds.right, bounds.bottom)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
}

async function prepareBoardingAtRendezvous(page, transportId) {
  await page.evaluate(async id => {
    const { TILE_SIZE } = await import('/src/config.js')
    const gameState = window.gameState
    const transport = gameState.units.find(unit => unit.id === id)
    const rendezvous = transport.pendingLoadRendezvous
    if (!rendezvous) throw new Error(`No boarding rendezvous for ${id}`)

    transport.x = rendezvous.desiredCenterX - TILE_SIZE / 2
    transport.y = rendezvous.desiredCenterY - TILE_SIZE / 2
    transport.tileX = Math.floor((transport.x + TILE_SIZE / 2) / TILE_SIZE)
    transport.tileY = Math.floor((transport.y + TILE_SIZE / 2) / TILE_SIZE)
    transport.path = []
    transport.moveTarget = null
    gameState.occupancyMap = gameState.mapGrid.map(row => row.map(() => 0))

    transport.pendingLoadUnitIds.forEach(cargoId => {
      const cargo = gameState.units.find(unit => unit.id === cargoId)
      const slot = rendezvous.cargoSlots[cargoId]
      cargo.x = slot.x * TILE_SIZE
      cargo.y = slot.y * TILE_SIZE
      cargo.tileX = slot.x
      cargo.tileY = slot.y
      cargo.path = []
      cargo.moveTarget = null
      gameState.occupancyMap[slot.y][slot.x]++
    })
  }, transportId)
}

async function assertNoDanglingTransportState(page, transportId) {
  const state = await page.evaluate(id => {
    const transport = window.gameState.units.find(unit => unit.id === id)
    const linkedCargo = window.gameState.units.filter(unit =>
      unit.pendingTransportId === id || unit.transportTransfer?.transportId === id
    )
    return {
      pendingIds: transport.pendingLoadUnitIds,
      pendingUnitId: transport.pendingLoadUnitId,
      rendezvous: transport.pendingLoadRendezvous,
      unload: transport.pendingUnloadTile,
      operation: transport.transportOperation,
      linkedCargo: linkedCargo.map(unit => unit.id)
    }
  }, transportId)
  expect(state).toEqual({
    pendingIds: [],
    pendingUnitId: null,
    rendezvous: null,
    unload: null,
    operation: null,
    linkedCargo: []
  })
}

test.describe('Naval transport embarking prepared scenarios', () => {
  test.beforeEach(async({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })
    await page.goto('/?seed=31&size=64&players=2&oreFields=8')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => Boolean(window.gameInstance?.gameLoop && window.gameState?.gameStarted), null, { timeout: 30000 })
  })

  test('boards every prepared ferry and hovercraft scenario without guard fallback or dangling cancellation state', async({ page }) => {
    test.setTimeout(120000)

    await setupScenario(page, {
      transportType: 'vehicleFerry',
      transportId: TRANSPORT_IDS.ferry,
      tankCount: 10,
      onLand: false
    })
    await selectUnits(page, [TRANSPORT_IDS.ferry])
    await dragAroundTanks(page)
    await expect.poll(() => page.evaluate(id => {
      const ferry = window.gameState.units.find(unit => unit.id === id)
      return {
        pending: ferry.pendingLoadUnitIds?.length || 0,
        ferryGuards: Boolean(ferry.guardMode || ferry.guardTarget),
        tankGuards: window.__navalTransportFixture.tankIds.some(tankId => {
          const tank = window.gameState.units.find(unit => unit.id === tankId)
          return tank.guardMode || tank.guardTarget
        })
      }
    }, TRANSPORT_IDS.ferry)).toEqual({ pending: 10, ferryGuards: false, tankGuards: false })

    await page.keyboard.press('s')
    await assertNoDanglingTransportState(page, TRANSPORT_IDS.ferry)

    const ferryTankIds = await page.evaluate(() => window.__navalTransportFixture.tankIds)
    await selectUnits(page, ferryTankIds)
    await clickUnit(page, TRANSPORT_IDS.ferry)
    await expect.poll(() => page.evaluate(id =>
      window.gameState.units.find(unit => unit.id === id).pendingLoadUnitIds?.length || 0,
    TRANSPORT_IDS.ferry)).toBe(10)
    await prepareBoardingAtRendezvous(page, TRANSPORT_IDS.ferry)
    await page.waitForFunction(id => window.gameState.units.some(unit =>
      unit.transportTransfer?.transportId === id && unit.transportTransfer.kind === 'load'
    ), TRANSPORT_IDS.ferry)
    const activeFerryCargo = await page.evaluate(id => window.gameState.units.find(unit =>
      unit.transportTransfer?.transportId === id
    ).id, TRANSPORT_IDS.ferry)
    await selectUnits(page, [activeFerryCargo])
    await page.keyboard.press('s')
    await assertNoDanglingTransportState(page, TRANSPORT_IDS.ferry)

    await selectUnits(page, ferryTankIds)
    await clickUnit(page, TRANSPORT_IDS.ferry)
    await prepareBoardingAtRendezvous(page, TRANSPORT_IDS.ferry)
    await page.waitForFunction(id =>
      window.gameState.units.find(unit => unit.id === id).embarkedUnitIds?.length === 10,
    TRANSPORT_IDS.ferry, { timeout: 30000 })

    await setupScenario(page, {
      transportType: 'hovercraft',
      transportId: TRANSPORT_IDS.hoverLand,
      tankCount: 5,
      onLand: true
    })
    await selectUnits(page, [TRANSPORT_IDS.hoverLand])
    const landPoint = await worldToClient(page, 4 * 32 + 16, 15 * 32 + 16)
    await page.mouse.move(landPoint.x, landPoint.y)
    await expect(page.locator('#gameCanvas')).toHaveClass(/move-mode/)
    await dragAroundTanks(page)
    await expect.poll(() => page.evaluate(id => {
      const hovercraft = window.gameState.units.find(unit => unit.id === id)
      return {
        pending: hovercraft.pendingLoadUnitIds?.length || 0,
        landOperation: hovercraft.pendingLoadRendezvous?.landOperation === true,
        guards: Boolean(hovercraft.guardMode || hovercraft.guardTarget)
      }
    }, TRANSPORT_IDS.hoverLand)).toEqual({ pending: 4, landOperation: true, guards: false })
    await prepareBoardingAtRendezvous(page, TRANSPORT_IDS.hoverLand)
    await page.waitForFunction(id =>
      window.gameState.units.find(unit => unit.id === id).embarkedUnitIds?.length === 4,
    TRANSPORT_IDS.hoverLand, { timeout: 20000 })

    await setupScenario(page, {
      transportType: 'hovercraft',
      transportId: TRANSPORT_IDS.hoverCoast,
      tankCount: 5,
      onLand: false
    })
    const coastTankIds = await page.evaluate(() => window.__navalTransportFixture.tankIds)
    await selectUnits(page, coastTankIds)
    await clickUnit(page, TRANSPORT_IDS.hoverCoast)
    await expect.poll(() => page.evaluate(id => {
      const hovercraft = window.gameState.units.find(unit => unit.id === id)
      const guards = window.__navalTransportFixture.tankIds.some(tankId => {
        const tank = window.gameState.units.find(unit => unit.id === tankId)
        return tank.guardMode || tank.guardTarget
      })
      return { pending: hovercraft.pendingLoadUnitIds?.length || 0, guards }
    }, TRANSPORT_IDS.hoverCoast)).toEqual({ pending: 4, guards: false })
    await prepareBoardingAtRendezvous(page, TRANSPORT_IDS.hoverCoast)
    await page.waitForFunction(id =>
      window.gameState.units.find(unit => unit.id === id).embarkedUnitIds?.length === 4,
    TRANSPORT_IDS.hoverCoast, { timeout: 20000 })

    await selectUnits(page, [TRANSPORT_IDS.hoverCoast])
    const unloadPoint = await worldToClient(page, 9 * 32 + 16, 12 * 32 + 16)
    await page.mouse.click(unloadPoint.x, unloadPoint.y)
    await page.waitForFunction(id => Boolean(
      window.gameState.units.find(unit => unit.id === id).pendingUnloadTile
    ), TRANSPORT_IDS.hoverCoast)
    await page.evaluate(async id => {
      const { TILE_SIZE } = await import('/src/config.js')
      const transport = window.gameState.units.find(unit => unit.id === id)
      const rendezvous = transport.pendingUnloadTile.rendezvous
      transport.x = rendezvous.desiredCenterX - TILE_SIZE / 2
      transport.y = rendezvous.desiredCenterY - TILE_SIZE / 2
      transport.tileX = Math.floor((transport.x + TILE_SIZE / 2) / TILE_SIZE)
      transport.tileY = Math.floor((transport.y + TILE_SIZE / 2) / TILE_SIZE)
      transport.path = []
      transport.moveTarget = null
    }, TRANSPORT_IDS.hoverCoast)
    await page.waitForFunction(id => window.gameState.units.some(unit =>
      unit.transportTransfer?.transportId === id && unit.transportTransfer.kind === 'unload'
    ), TRANSPORT_IDS.hoverCoast)
    const unloadingCargo = await page.evaluate(id => window.gameState.units.find(unit =>
      unit.transportTransfer?.transportId === id && unit.transportTransfer.kind === 'unload'
    ).id, TRANSPORT_IDS.hoverCoast)
    await selectUnits(page, [unloadingCargo])
    await page.keyboard.press('s')
    await assertNoDanglingTransportState(page, TRANSPORT_IDS.hoverCoast)
    await expect.poll(() => page.evaluate(id =>
      window.gameState.units.find(unit => unit.id === id).embarkedUnitIds?.length,
    TRANSPORT_IDS.hoverCoast)).toBe(4)

    await selectUnits(page, [TRANSPORT_IDS.hoverCoast])
    await page.mouse.click(unloadPoint.x, unloadPoint.y)
    await expect.poll(() => page.evaluate(id => Boolean(
      window.gameState.units.find(unit => unit.id === id).pendingUnloadTile
    ), TRANSPORT_IDS.hoverCoast)).toBe(true)
  })
})
