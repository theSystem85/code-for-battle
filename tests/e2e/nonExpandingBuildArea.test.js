import { test, expect } from '@playwright/test'

test.describe('Non-expanding build area anchors', () => {
  test.beforeEach(async({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=11')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => window.gameState?.gameStarted === true, { timeout: 30000 })
  })

  test('streets and walls only extend placement for their own type', async({ page }) => {
    const result = await page.evaluate(async() => {
      const { canPlaceBuilding, createBuilding, placeBuilding } = await import('/src/buildings.js')
      const { gameState } = await import('/src/gameState.js')

      const owner = 'player'
      const streetTiles = [23, 24, 25, 26]
      const wallTiles = [23, 24, 25, 26]

      for (const x of streetTiles) {
        const street = createBuilding('street', x, 20)
        street.owner = owner
        gameState.buildings.push(street)
        placeBuilding(street, gameState.mapGrid, gameState.occupancyMap, { recordTransition: false })
      }

      const powerFromStreet = canPlaceBuilding('powerPlant', 27, 20, gameState.mapGrid, gameState.units, gameState.buildings, gameState.factories, owner)
      const streetFromStreet = canPlaceBuilding('street', 27, 20, gameState.mapGrid, gameState.units, gameState.buildings, gameState.factories, owner)

      for (const x of wallTiles) {
        const wall = createBuilding('concreteWall', x, 24)
        wall.owner = owner
        gameState.buildings.push(wall)
        placeBuilding(wall, gameState.mapGrid, gameState.occupancyMap, { recordTransition: false })
      }

      const powerFromWall = canPlaceBuilding('powerPlant', 27, 24, gameState.mapGrid, gameState.units, gameState.buildings, gameState.factories, owner)
      const wallFromWall = canPlaceBuilding('concreteWall', 27, 24, gameState.mapGrid, gameState.units, gameState.buildings, gameState.factories, owner)

      return { powerFromStreet, streetFromStreet, powerFromWall, wallFromWall }
    })

    expect(result.powerFromStreet).toBe(false)
    expect(result.streetFromStreet).toBe(true)
    expect(result.powerFromWall).toBe(false)
    expect(result.wallFromWall).toBe(true)
  })

  test('planned street and wall chains remain eligible for production outside the base radius', async({ page }) => {
    const result = await page.evaluate(async() => {
      const { gameState } = await import('/src/gameState.js')
      const { productionQueue } = await import('/src/productionQueue.js')

      const streetBlueprint = { type: 'street', x: 27, y: 20 }
      gameState.blueprints = [
        { type: 'street', x: 23, y: 20 },
        { type: 'street', x: 24, y: 20 },
        { type: 'street', x: 25, y: 20 },
        { type: 'street', x: 26, y: 20 },
        streetBlueprint
      ]
      productionQueue.currentBuilding = null
      productionQueue.pausedBuilding = false
      productionQueue.buildingItems = [{ type: 'street', button: null, isBuilding: true, blueprint: streetBlueprint }]
      productionQueue.startNextBuildingProduction()
      const streetStarted = productionQueue.currentBuilding?.type === 'street'

      const wallBlueprint = { type: 'concreteWall', x: 27, y: 24 }
      gameState.blueprints = [
        { type: 'concreteWall', x: 23, y: 24 },
        { type: 'concreteWall', x: 24, y: 24 },
        { type: 'concreteWall', x: 25, y: 24 },
        { type: 'concreteWall', x: 26, y: 24 },
        wallBlueprint
      ]
      productionQueue.currentBuilding = null
      productionQueue.pausedBuilding = false
      productionQueue.buildingItems = [{ type: 'concreteWall', button: null, isBuilding: true, blueprint: wallBlueprint }]
      productionQueue.startNextBuildingProduction()
      const wallStarted = productionQueue.currentBuilding?.type === 'concreteWall'

      return { streetStarted, wallStarted }
    })

    expect(result.streetStarted).toBe(true)
    expect(result.wallStarted).toBe(true)
  })
})
