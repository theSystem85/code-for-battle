import { test, expect } from '@playwright/test'

test('[E00021] optional city sheet produces whole destructible buildings and persistent debris', async({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async() => {
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const { gameState } = await import('/src/gameState.js')
    const { getCityBuildings, applyCityDamage } = await import('/src/game/cityBuildings.js')
    const response = await fetch('/images/map/sprite_sheets/dtv5_city_temperate_medium.json')
    const metadata = await response.json()
    const manager = new TextureManager()
    Object.assign(gameState, { mapSeed: 'city-e2e', citySeeds: 2, cityClusterSize: 8 })
    await manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets: [{ sheetPath: 'images/map/sprite_sheets/dtv5_city_temperate_medium.webp', metadata }], biomeTag: 'grass' })
    const mapGrid = Array.from({ length: 96 }, () => Array.from({ length: 96 }, () => ({ type: 'land', biome: 'grass' })))
    manager.prepareDecorationLayout(mapGrid)
    const building = getCityBuildings(mapGrid)[0]
    if (!building) throw new Error('City sheet did not produce buildings')
    const before = manager.getIntegratedTileForMapTile('land', building.x, building.y, { mapGrid })
    applyCityDamage(building, building.maxHealth, mapGrid, gameState)
    const after = manager.getIntegratedTileForMapTile('land', building.x, building.y, { mapGrid })
    const decals = []
    for (let y = building.y; y < building.y + building.height; y++) for (let x = building.x; x < building.x + building.width; x++) decals.push(mapGrid[y][x].decal?.tag)
    return { beforeCity: before?.tags?.includes('city'), afterCity: after?.tags?.includes('city') || false, health: building.health, decals }
  })
  expect(result.beforeCity).toBe(true)
  expect(result.afterCity).toBe(false)
  expect(result.health).toBe(0)
  expect(result.decals.length).toBeGreaterThan(0)
  expect(result.decals.every(tag => tag === 'debris')).toBe(true)
})
