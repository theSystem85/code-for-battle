import { test, expect } from '@playwright/test'

test.describe('Non-expanding build area anchors', () => {
  test('streets and walls only extend placement for their own type', async({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
      localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    })

    await page.goto('/?seed=11')
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => window.gameState?.gameStarted === true, { timeout: 30000 })

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
})
