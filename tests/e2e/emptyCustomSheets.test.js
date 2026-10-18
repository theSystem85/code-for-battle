import { test, expect } from '@playwright/test'

test('[E00022] empty custom selection matches default tile and decoration choices', async({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async() => {
    const { TextureManager } = await import('/src/rendering/textureManager.js')
    const { buildDecorationLayout } = await import('/src/rendering/decorationLayout.js')
    const manager = new TextureManager()
    const mapGrid = Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, (_, x) => ({
      type: (x * 31 + y * 17 + 688) % 11 === 0 ? 'water' : 'land', biome: 'grass'
    })))
    const snapshot = () => ({
      mode: manager.integratedSpriteSheetMode,
      tiles: mapGrid.map((row, y) => row.map((tile, x) => manager.getIntegratedTileForMapTile(tile.type, x, y, { mapGrid }))),
      decorations: buildDecorationLayout(mapGrid, manager.integratedDecorationPools, { salt: 688 })
    })
    await manager.setIntegratedSpriteSheetConfig({ enabled: false, biomeTag: 'grass' })
    const defaults = snapshot()
    manager.lastIntegratedSheetEntries = [{ sheetPath: 'stale.webp', metadata: { tiles: {} } }]
    await manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets: [], biomeTag: 'grass' })
    return { defaults, empty: snapshot() }
  })
  expect(result.empty).toEqual(result.defaults)
})
