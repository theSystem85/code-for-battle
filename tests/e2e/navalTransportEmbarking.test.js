import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { waitForLoadingScreenHidden } from './helpers/loadingScreen.js'

const TRANSPORT_IDS = {
  ferry: 'e2e-ferry',
  hoverLand: 'e2e-hover-land',
  hoverCoast: 'e2e-hover-coast'
}

async function setupScenario(page, { transportType, transportId, tankCount, onLand }) {
  await page.evaluate(async({ transportType, transportId, tankCount, onLand }) => {
    const [{ TILE_SIZE }, { createUnit }, mainModule, { addMovableOccupancy }] = await Promise.all([
      import('/src/config.js'),
      import('/src/units.js'),
      import('/src/main.js'),
      import('/src/game/occupancyTags.js')
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
      // Keep one overflow vehicle near the coast as well as one in the queue's
      // inland approach, exercising avoidance without asking either to yield.
      const nearCoastOverflow = !onLand && index === tankCount - 1 && tankCount > transport.transportCapacity
      const tileX = nearCoastOverflow ? coastX - 1 : onLand ? 12 + (index % 2) : 8 + (index % 3)
      const tileY = nearCoastOverflow ? 11 : 6 + Math.floor(index / (onLand ? 2 : 3))
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
      gameState.occupancyMap[occupiedY][occupiedX] = addMovableOccupancy(gameState.occupancyMap[occupiedY][occupiedX], 1)
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
  await page.mouse.move(end.x, end.y, { steps: 2 })
  await page.mouse.up()
}

async function prepareBoardingAtRendezvous(page, transportId) {
  await page.evaluate(async id => {
    const { TILE_SIZE } = await import('/src/config.js')
    const { addMovableOccupancy } = await import('/src/game/occupancyTags.js')
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
      // A retry can begin transferring immediately because the ship is already
      // docked. Its cargo has left ground occupancy; do not reinsert it while
      // rebuilding the prepared fixture or the next vehicle sees a phantom blocker.
      if (cargo.transportTransfer || cargo.embarkedOnId) return
      const slot = rendezvous.cargoSlots[cargoId]
      cargo.x = slot.x * TILE_SIZE
      cargo.y = slot.y * TILE_SIZE
      cargo.tileX = slot.x
      cargo.tileY = slot.y
      cargo.path = []
      cargo.moveTarget = null
      gameState.occupancyMap[slot.y][slot.x] = addMovableOccupancy(gameState.occupancyMap[slot.y][slot.x], 1)
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

test.describe('Naval transport embarking', () => {
  test.beforeEach(async({ page }) => {
    test.setTimeout(180000)
    await page.addInitScript(() => {
      localStorage.setItem('rts_tutorial_settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('rts_tutorial_progress', JSON.stringify({ completed: true, stepIndex: 0 }))
      localStorage.setItem('rts-game-master-volume', '0')
    })
    await page.goto('/?seed=31&size=32&players=2&oreFields=8')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 60000 })
    await page.waitForFunction(() => Boolean(window.gameInstance?.gameLoop && window.gameState?.gameStarted), null, { timeout: 60000 })
    await waitForLoadingScreenHidden(page)
  })

  test.afterEach(async({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return
    const snapshot = await page.evaluate(() => ({
      observation: window.__boardingObservation,
      units: window.gameState?.units.map(unit => ({
        id: unit.id, x: unit.x, y: unit.y, direction: unit.direction,
        path: unit.path, moveTarget: unit.moveTarget, pending: unit.pendingTransportId,
        embarked: unit.embarkedOnId, transfer: unit.transportTransfer,
        operation: unit.transportOperation, rendezvous: unit.pendingLoadRendezvous
      }))
    })).catch(() => null)
    const snapshotPath = testInfo.outputPath('boarding-state.json')
    await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2))
    await testInfo.attach('boarding-state', { path: snapshotPath, contentType: 'application/json' })
  })

  test('[E00077] boards every prepared ferry and hovercraft scenario without guard fallback or dangling cancellation state', async({ page }) => {
    test.setTimeout(180000)

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
    TRANSPORT_IDS.ferry, { timeout: 90000 })

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
    TRANSPORT_IDS.hoverLand, { timeout: 60000 })

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
    TRANSPORT_IDS.hoverCoast, { timeout: 60000 })

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

  for (const scenario of [
    { transportType: 'vehicleFerry', capacity: 10, onLand: false },
    { transportType: 'hovercraft', capacity: 4, onLand: false },
    { transportType: 'hovercraft', capacity: 4, onLand: true }
  ]) {
    test(`[E00258] loads a moving ${scenario.transportType} queue naturally and leaves excess vehicles stationary (${scenario.onLand ? 'land' : 'coast'})`, async({ page }) => {
      test.setTimeout(180000)
      const transportId = 'natural-boarding-transport'
      await setupScenario(page, { ...scenario, transportId, tankCount: scenario.capacity + 2 })
      const tankIds = await page.evaluate(() => window.__navalTransportFixture.tankIds)
      const initial = await page.evaluate(ids => ids.map(id => {
        const unit = window.gameState.units.find(candidate => candidate.id === id)
        return { id, x: unit.x, y: unit.y }
      }), tankIds)
      await selectUnits(page, tankIds)
      await clickUnit(page, transportId)

      const accepted = await page.evaluate(id => {
        const transport = window.gameState.units.find(unit => unit.id === id)
        const pending = transport.pendingLoadUnitIds.slice()
        // Observe every simulation frame; no movement or transfer is forced.
        window.__boardingObservation = {
          pending, order: [], violations: [], dock: null, moved: [],
          rendezvous: { ...transport.pendingLoadRendezvous },
          idle: window.gameState.units.filter(unit => window.__navalTransportFixture.tankIds.includes(unit.id) && !pending.includes(unit.id))
            .map(unit => ({ id: unit.id, x: unit.x, y: unit.y }))
        }
        const observe = () => {
          const observation = window.__boardingObservation
          if (!observation) return
          const units = window.gameState.units
          const transport = units.find(unit => unit.id === id)
          for (const start of observation.idle) {
            const idle = units.find(unit => unit.id === start.id)
            if (idle.x !== start.x || idle.y !== start.y || idle.moveTarget || idle.path?.length) {
              const reason = `overflow vehicle moved: ${idle.id}`
              if (!observation.violations.includes(reason)) observation.violations.push(reason)
            }
          }
          const active = units.filter(unit => unit.transportTransfer?.transportId === id)
          if (active.length > 1) observation.violations.push('simultaneous transfers')
          if (transport.transportOperation?.phase === 'transferring') {
            observation.dock ||= { x: transport.x, y: transport.y, direction: transport.direction }
            const dock = observation.dock
            if (Math.hypot(dock.x - transport.x, dock.y - transport.y) > 0.01 ||
                Math.abs(dock.direction - transport.direction) > 0.001) observation.violations.push('transport moved while boarding')
          }
          for (const cargoId of observation.pending) {
            const cargo = units.find(unit => unit.id === cargoId)
            if (cargo.embarkedOnId === id && !observation.order.includes(cargoId)) observation.order.push(cargoId)
            if ((cargo.path?.length || cargo.transportTransfer) && !observation.moved.includes(cargoId)) observation.moved.push(cargoId)
          }
          observation.frame = requestAnimationFrame(observe)
        }
        observe()
        return pending
      }, transportId)
      expect(accepted).toHaveLength(scenario.capacity)
      const rejected = initial.filter(unit => !accepted.includes(unit.id))
      expect(rejected).toHaveLength(2)
      await expect.poll(() => page.evaluate(id => {
        const transport = window.gameState.units.find(unit => unit.id === id)
        return { loaded: transport.embarkedUnitIds.length, pending: transport.pendingLoadUnitIds.length }
      }, transportId), { timeout: 90000, intervals: [500] }).toEqual({ loaded: scenario.capacity, pending: 0 })
      const result = await page.evaluate(({ transportId, rejected }) => {
        const transport = window.gameState.units.find(unit => unit.id === transportId)
        const observation = window.__boardingObservation
        cancelAnimationFrame(observation.frame)
        window.__boardingObservation = null
        return {
          violations: observation.violations,
          order: observation.order,
          moved: observation.moved,
          dock: observation.dock,
          direction: transport.direction,
          rendezvous: observation.rendezvous,
          rejected: rejected.map(({ id }) => {
            const cargo = window.gameState.units.find(unit => unit.id === id)
            return { id, x: cargo.x, y: cargo.y, pending: cargo.pendingTransportId || null, moving: Boolean(cargo.moveTarget || cargo.path?.length) }
          })
        }
      }, { transportId, rejected })
      if (result.violations.length) console.log('Boarding invariant failure:', JSON.stringify(result))
      expect(result.violations).toEqual([])
      const slots = accepted.map(id => result.rendezvous.cargoSlots[id])
      for (let index = 1; index < slots.length; index++) {
        expect(Math.abs(slots[index].x - slots[index - 1].x) + Math.abs(slots[index].y - slots[index - 1].y)).toBe(1)
      }
      expect(result.order).toEqual(accepted)
      expect(result.moved.sort()).toEqual(accepted.slice().sort())
      expect(result.dock).not.toBeNull()
      expect(result.dock.x + 16).toBeCloseTo(result.rendezvous.desiredCenterX, 4)
      expect(result.dock.y + 16).toBeCloseTo(result.rendezvous.desiredCenterY, 4)
      expect(result.direction).toBeCloseTo(result.rendezvous.desiredDirection, 4)
      for (const cargo of result.rejected) {
        const original = rejected.find(unit => unit.id === cargo.id)
        expect(cargo).toEqual({ ...original, pending: null, moving: false })
      }
      await assertNoDanglingTransportState(page, transportId)
    })
  }

})
