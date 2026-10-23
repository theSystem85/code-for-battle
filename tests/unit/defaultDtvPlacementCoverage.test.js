import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { generateMap } from '../../src/gameSetup.js'
import { TextureManager } from '../../src/rendering/textureManager.js'
import { DEFAULT_SSE_SHEETS } from '../../src/ui/spriteSheetRegistry.js'

// Generates real maps with every enabled-by-default dtv sheet and fails when
// any sprite never reaches the decoration layout, i.e. it has no placement path.
describe('default dtv sheets placement coverage', () => {
  it('[U01221] places every sprite of every default dtv sheet on generated maps', async() => {
    const manager = new TextureManager()
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue({ width: 1024, height: 1024 })
    const sheets = DEFAULT_SSE_SHEETS.filter(path => /\/dtv\d+_/.test(path)).map(sheetPath => ({
      sheetPath,
      metadata: JSON.parse(readFileSync(`public/${sheetPath.replace('.webp', '.json')}`, 'utf8'))
    }))
    const name = path => path.split('/').pop()
    const expected = sheets.flatMap(sheet => Object.keys(sheet.metadata.tiles).map(key => `${name(sheet.sheetPath)} ${key}`))
    const tagsByKey = new Map(sheets.flatMap(sheet => Object.entries(sheet.metadata.tiles).map(([key, tile]) => [`${name(sheet.sheetPath)} ${key}`, tile.tags || []])))
    const seen = new Set()
    const previous = { activeSpriteSheetBiomeTag: gameState.activeSpriteSheetBiomeTag, mapSeed: gameState.mapSeed }
    const collect = async(biome, seed) => {
      gameState.activeSpriteSheetBiomeTag = biome
      gameState.mapSeed = String(seed)
      const grid = Array.from({ length: 120 }, () => Array.from({ length: 120 }, () => ({ type: 'land' })))
      generateMap(seed, grid, 120, 120)
      manager.decorationLayoutCache = null
      const layout = manager.getDecorationLayout(grid)
      for (const cell of [...layout.cells, ...(layout.groundDetails || [])]) {
        if (!cell?.group) continue
        for (const tile of Object.values(cell.group.sourceTilesByOffset || cell.group.tilesByOffset || {})) {
          if (tile?.sheetPath) seen.add(`${name(tile.sheetPath)} ${tile.col},${tile.row}`)
        }
      }
    }
    try {
      for (const biome of ['grass', 'soil', 'sand', 'snow', 'mixed']) {
        await manager.setIntegratedSpriteSheetConfig({ enabled: true, biomeTag: biome, sheets })
        for (let seed = 1; seed <= 12; seed++) await collect(biome, seed)
      }
      // Rare props (single-tile ruins, rare landmarks) get extra seeds in their own biome.
      for (const biome of ['grass', 'soil', 'sand', 'snow']) {
        const pending = () => expected.some(key => !seen.has(key) && tagsByKey.get(key).some(tag => tag === biome || tag === 'universal'))
        if (!pending()) continue
        await manager.setIntegratedSpriteSheetConfig({ enabled: true, biomeTag: biome, sheets })
        for (let seed = 13; seed <= 60 && pending(); seed++) await collect(biome, seed)
      }
    } finally {
      Object.assign(gameState, previous)
    }
    const orphaned = expected.filter(key => !seen.has(key))
    expect(orphaned, `Sprites without a placement path:\n${orphaned.join('\n')}`).toEqual([])
  }, 120000)
})
