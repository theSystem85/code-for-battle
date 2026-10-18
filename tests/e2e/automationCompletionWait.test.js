import { expect, test } from '@playwright/test'

test('[E00006] building completion wait holds the state until real construction and placement', async({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
  const result = await page.evaluate(async() => {
    const { gameState } = await import('/src/gameState.js')
    const { units, factories } = await import('/src/main.js')
    const { productionQueue } = await import('/src/productionQueue.js')
    const { installBasePolicyGameBindings } = await import('/src/policies/basePolicyGameBindings.js')
    const { saveAutomationSource, setPolicyEnabled, setBuildAutomationOptIn, getPolicyDocument } = await import('/src/policies/policyStore.js')
    const { updateBasePolicies, resetBasePolicyEngine, getBasePolicyStatus } = await import('/src/policies/basePolicyEngine.js')
    const owner = gameState.humanPlayer
    gameState.money = 100000
    gameState.gamePaused = false
    resetBasePolicyEngine()
    const id = 'browser-building-completion'
    const accepted = saveAutomationSource(owner, { id, name: 'Build and wait', source: `build building {
      scope global; run once; start 1;
      state 1 { do wait; if (always) goto 2; }
      state 2 { do buildBuilding(buildingType=powerPlant) wait until produced; if (always) goto 3; }
      state 3 { do wait; }
    }` })
    if (!accepted.ok) throw new Error(JSON.stringify(accepted))
    setBuildAutomationOptIn(owner, true)
    setPolicyEnabled(owner, id, true)
    const ctx = installBasePolicyGameBindings({ owner, units, factories, buildings: gameState.buildings, mapGrid: gameState.mapGrid })
    const start = gameState.simulationTime
    updateBasePolicies(ctx, start)
    const current = productionQueue.currentBuilding
    if (!current) throw new Error('Automation did not queue actual construction')
    const blueprint = { ...current.blueprint }
    updateBasePolicies(ctx, start + 1000)
    const pending = getBasePolicyStatus(id)
    const expectedWaitingState = getPolicyDocument(id).states[1].id
    gameState.simulationTime = Math.max(start + 2000, current.startTime + current.duration + 1)
    productionQueue.updateProgress(gameState.simulationTime)
    const building = gameState.buildings.find(item => item.type === 'powerPlant' && item.x === blueprint.x && item.y === blueprint.y)
    updateBasePolicies(ctx, gameState.simulationTime)
    updateBasePolicies(ctx, gameState.simulationTime + 1000)
    const completed = getBasePolicyStatus(id)
    gameState.gamePaused = true
    return { waiting: pending.waiting, waitingState: pending.stateId, expectedWaitingState,
      prematureFinish: pending.finished, ordersWhilePending: pending.orders,
      actualPlaced: Boolean(building && gameState.mapGrid[building.y][building.x].building === building),
      finished: completed.finished, totalOrders: completed.orders }
  })
  expect(result.waiting).toBe(true)
  expect(result.waitingState).toBe(result.expectedWaitingState)
  expect(result.prematureFinish).toBe(false)
  expect(result.ordersWhilePending).toBe(1)
  expect(result.actualPlaced).toBe(true)
  expect(result.finished).toBe(true)
  expect(result.totalOrders).toBe(1)
})

test('[E00007] unit completion wait advances only after real movement reaches its issued destination', async({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)
  await page.evaluate(async() => { (await import('/src/saveGame.js')).loadGame('builtin:demo') })
  await page.waitForFunction(() => window.gameState?.currentSessionId === 'demo' && document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'))
  await page.evaluate(async() => {
    const { gameState } = await import('/src/gameState.js')
    const { units } = await import('/src/main.js')
    const { initializeOccupancyMap } = await import('/src/units.js')
    const { resetPolicyStore, saveAutomationSource, applyPolicyToUnit, getPolicyDocument } = await import('/src/policies/policyStore.js')
    gameState.gamePaused = true
    const owner = gameState.humanPlayer
    const tank = units.find(unit => unit.owner === owner && ['tank_v1', 'tank-v2', 'tank-v3'].includes(unit.type))
    if (!tank) throw new Error('Demo has no owned tank for the movement scenario')
    let origin = null
    for (let y = 5; y < gameState.mapGrid.length - 5 && !origin; y++) {
      for (let x = 5; x < gameState.mapGrid[y].length - 5; x++) {
        if ([0, 1, 2, 3].every(dx => {
          const tile = gameState.mapGrid[y][x + dx]
          return tile && !tile.building && !['water', 'rock'].includes(tile.type)
        })) { origin = { x, y }; break }
      }
    }
    if (!origin) throw new Error('No clear movement corridor')
    units.splice(0, units.length, tank)
    tank.x = origin.x * 32; tank.y = origin.y * 32
    tank.tileX = origin.x; tank.tileY = origin.y
    tank.direction = 0; tank.rotation = 0
    tank.path = []; tank.moveTarget = null; tank.target = null; tank.attackQueue = []; tank.commandQueue = []
    tank.health = tank.maxHealth
    gameState.occupancyMap = initializeOccupancyMap(units, gameState.mapGrid)
    resetPolicyStore()
    const id = 'browser-unit-completion'
    const saved = saveAutomationSource(owner, { id, name: 'Move and wait', source: `control unit {
      scope individual; run once; start 1;
      state 1 { do wait; if (always) goto 2; }
      state 2 { do moveForward(tiles=2) wait until done; if (always) goto 3; }
      state 3 { do wait; }
    }` })
    if (!saved.ok) throw new Error(JSON.stringify(saved))
    const applied = applyPolicyToUnit(owner, tank, id)
    if (!applied.ok) throw new Error(JSON.stringify(applied))
    window.__completionMovement = { tank, waitingState: getPolicyDocument(id).states[1].id, expectedTileX: origin.x + 2, expectedTileY: origin.y }
    gameState.gamePaused = false
  })
  await page.waitForFunction(() => window.__completionMovement.tank.policyBindings?.[0]?.runtime.wait?.status === 'pending')
  const pending = await page.evaluate(() => {
    const fixture = window.__completionMovement
    const runtime = fixture.tank.policyBindings[0].runtime
    return { state: runtime.currentStateId, expected: fixture.waitingState, finished: runtime.finished }
  })
  expect(pending.state).toBe(pending.expected)
  expect(pending.finished).toBe(false)
  await page.waitForFunction(() => !window.__completionMovement.tank.policyBindings?.length, null, { timeout: 20000 })
  const result = await page.evaluate(() => {
    const { tank, expectedTileX, expectedTileY } = window.__completionMovement
    window.gameState.gamePaused = true
    return { x: Math.floor((tank.x + 16) / 32), y: Math.floor((tank.y + 16) / 32), expectedTileX, expectedTileY, path: tank.path?.length || 0, moving: Boolean(tank.moveTarget) }
  })
  expect(result.x).toBe(result.expectedTileX)
  expect(result.y).toBe(result.expectedTileY)
  expect(result.path).toBe(0)
  expect(result.moving).toBe(false)
})
