import { test, expect } from '@playwright/test'

test('[E00124] applied optional sheet tags regenerate topology with the same seed', async({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => window.gameState?.mapGrid?.length > 0)
  const result = await page.evaluate(async() => {
    const { gameState } = await import('/src/gameState.js')
    const { applyIntegratedSpriteSheetRuntime } = await import('/src/ui/mapEditorControls.js')
    const { getTextureManager } = await import('/src/rendering.js')
    const sheetPath = 'images/map/sprite_sheets/dtv6_decor_grass.webp'
    const response = await fetch(sheetPath.replace('.webp', '.json'))
    const metadata = await response.json()
    gameState.multiplayerSession = {}
    gameState.useIntegratedSpriteSheetMode = true
    gameState.availableStaticSpriteSheets = [sheetPath]
    gameState.activeSpriteSheetSelections = [sheetPath]

    await applyIntegratedSpriteSheetRuntime({ ...metadata, sheetPath })
    const seed = gameState.mapSeed
    const fingerprint = gameState.mapTopologyFingerprint
    const count = () => gameState.occupancyMap.flat().filter(value => value > 0).length
    const before = count()
    for (const tile of Object.values(metadata.tiles)) {
      tile.tags = (tile.tags || []).filter(tag => tag !== 'impassable')
      tile.tags.push('passable')
    }
    await applyIntegratedSpriteSheetRuntime({ ...metadata, sheetPath })
    getTextureManager().getDecorationLayout(gameState.mapGrid)
    return { before, after: count(), fingerprint, next: gameState.mapTopologyFingerprint, sameSeed: seed === gameState.mapSeed }
  })
  expect(result.before).toBeGreaterThan(0)
  expect(result.after).toBeLessThan(result.before)
  expect(result.next).not.toBe(result.fingerprint)
  expect(result.sameSeed).toBe(true)
})
