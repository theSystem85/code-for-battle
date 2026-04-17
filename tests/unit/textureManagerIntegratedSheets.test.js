import { describe, it, expect, vi } from 'vitest'
import { TextureManager } from '../../src/rendering/textureManager.js'

describe('TextureManager integrated multi-sheet selection', () => {
  it('combines tagged tiles from multiple selected sprite sheets', async() => {
    const manager = new TextureManager()
    const imageByPath = {
      'images/map/sprite_sheets/a.webp': { id: 'sheet-a' },
      'images/map/sprite_sheets/b.webp': { id: 'sheet-b' }
    }
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockImplementation(async(sheetPath) => imageByPath[sheetPath] || null)

    await manager.setIntegratedSpriteSheetConfig({
      enabled: true,
      biomeTag: 'grass',
      sheets: [
        {
          sheetPath: 'images/map/sprite_sheets/a.webp',
          metadata: {
            blendMode: 'alpha',
            tileSize: 64,
            borderWidth: 0,
            tiles: {
              '0,0': { tags: ['rocks'], rect: { x: 0, y: 0, width: 64, height: 64 } }
            }
          }
        },
        {
          sheetPath: 'images/map/sprite_sheets/b.webp',
          metadata: {
            blendMode: 'black',
            tileSize: 64,
            borderWidth: 0,
            tiles: {
              '0,0': { tags: ['rocks'], rect: { x: 64, y: 0, width: 64, height: 64 } }
            }
          }
        }
      ]
    })

    expect(manager.integratedSpriteSheetMode).toBe(true)
    expect(manager.integratedTagBuckets.rocks).toHaveLength(2)

    const seenSources = new Set()
    for (let i = 0; i < 40; i++) {
      const tile = manager.getIntegratedTileForMapTile('rock', i, i + 5)
      seenSources.add(tile?.sheetPath)
    }

    expect(seenSources).toEqual(new Set([
      'images/map/sprite_sheets/a.webp',
      'images/map/sprite_sheets/b.webp'
    ]))
  })

  it('disables integrated mode when selected sheets have no tagged tiles', async() => {
    const manager = new TextureManager()
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue({ id: 'sheet-empty' })

    await manager.setIntegratedSpriteSheetConfig({
      enabled: true,
      sheets: [
        {
          sheetPath: 'images/map/sprite_sheets/untagged.webp',
          metadata: {
            blendMode: 'black',
            tiles: {
              '0,0': { tags: [], rect: { x: 0, y: 0, width: 64, height: 64 } }
            }
          }
        }
      ]
    })

    expect(manager.integratedSpriteSheetMode).toBe(false)
    expect(manager.integratedTagBuckets).toEqual({})
  })
})
