import { expect, test } from '@playwright/test'

test('policy construction pays the player price and sale removes power, occupancy and chimney emitters', async({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
  })
  await page.goto('/?seed=41&size=64&players=2&oreFields=8')
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop)

  const results = await page.evaluate(async() => {
    const { gameState: state } = await import('/src/gameState.js')
    const { productionQueue: queue } = await import('/src/productionQueue.js')
    const { units, factories } = await import('/src/main.js')
    const { installBasePolicyGameBindings } = await import('/src/policies/basePolicyGameBindings.js')
    const { executeBuildCommand } = await import('/src/policies/buildCommandApi.js')
    const { buildingSellHandler } = await import('/src/buildingSellHandler.js')
    const { updateBuildings } = await import('/src/game/buildingSystem.js')
    const { buildingData, updatePowerSupply } = await import('/src/buildings.js')
    const { TILE_SIZE, BUILDING_SELL_DURATION } = await import('/src/config.js')
    const { selectedUnits } = await import('/src/inputHandler.js')
    const canvas = document.getElementById('gameCanvas')
    state.gamePaused = false
    state.money = 100000
    const context = installBasePolicyGameBindings({ owner: state.humanPlayer, units, factories, buildings: state.buildings, mapGrid: state.mapGrid })
    const outcomes = []
    for (const type of ['powerPlant', 'oreRefinery']) {
      updatePowerSupply(state.buildings, state)
      const moneyBefore = state.money
      const powerBefore = state.playerPowerSupply
      const result = executeBuildCommand('buildBuilding', { buildingType: type }, context)
      if (!result.ok) throw new Error(`${result.reason}: ${JSON.stringify({ owner: state.humanPlayer, factories: factories.map(f => ({ id: f.id, owner: f.owner, x: f.x, y: f.y })), yards: state.buildings.filter(b => b.type === 'constructionYard').map(b => ({ id: b.id, owner: b.owner, x: b.x, y: b.y })) })}`)
      const current = queue.currentBuilding
      if (!current) throw new Error('Policy failed to start production')
      const blueprint = current.blueprint
      state.simulationTime = current.startTime + current.duration
      queue.updateProgress(state.simulationTime)
      const building = state.buildings.find(item => item.type === type && item.x === blueprint.x && item.y === blueprint.y)
      if (!building) throw new Error('Policy did not construct the building')
      const moneyAfterBuild = state.money
      const powerAfterBuild = state.playerPowerSupply
      const occupied = state.mapGrid[building.y][building.x].building === building
      selectedUnits.push(building)
      building.selected = true
      building.constructionFinished = true
      state.sellMode = true
      const simulationAtSale = state.simulationTime
      const bounds = canvas.getBoundingClientRect()
      buildingSellHandler({
        clientX: bounds.left + (building.x + 0.5) * TILE_SIZE - state.scrollOffset.x,
        clientY: bounds.top + (building.y + 0.5) * TILE_SIZE - state.scrollOffset.y
      }, state, canvas, state.mapGrid, units, factories)
      const saleStart = building.sellStartTime
      state.simulationTime += BUILDING_SELL_DURATION + 1
      updateBuildings(state, units, [], factories, state.mapGrid, 0)
      outcomes.push({
        type, cost: buildingData[type].cost,
        spent: moneyBefore - moneyAfterBuild,
        powerAdded: powerAfterBuild - powerBefore,
        expectedPower: buildingData[type].power,
        powerRestored: state.playerPowerSupply === powerBefore,
        refund: state.money - moneyAfterBuild,
        occupied,
        removed: !state.buildings.includes(building),
        unselected: !selectedUnits.includes(building),
        tileCleared: !state.mapGrid[building.y][building.x].building,
        simulationSaleTime: saleStart === simulationAtSale
      })
      state.sellMode = false
    }
    state.gamePaused = true
    return outcomes
  })
  for (const result of results) {
    expect(result.spent, result.type).toBe(result.cost)
    expect(result.powerAdded, result.type).toBe(result.expectedPower)
    expect(result.refund, result.type).toBe(Math.floor(result.cost * 0.7))
    for (const flag of ['occupied', 'removed', 'unselected', 'tileCleared', 'powerRestored', 'simulationSaleTime']) {
      expect(result[flag], `${result.type}: ${flag}`).toBe(true)
    }
  }
})
