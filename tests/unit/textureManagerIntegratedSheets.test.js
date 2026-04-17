import { describe, it, expect, vi } from 'vitest'
import { TextureManager } from '../../src/rendering/textureManager.js'

describe('TextureManager integrated sprite sheet sources', () => {
  it('combines tagged tiles from multiple sprite sheets', async() => {
    const manager = new TextureManager()
    const images = {
      'images/map/sprite_sheets/a.webp': { id: 'sheet-a' },
      'images/map/sprite_sheets/b.webp': { id: 'sheet-b' }
    }
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockImplementation(async(path) => images[path] || null)

    await manager.setIntegratedSpriteSheetConfig({
      enabled: true,
      sheetPath: 'images/map/sprite_sheets/a.webp',
      metadata: {
        sheetPath: 'images/map/sprite_sheets/a.webp',
        tileSize: 64,
        borderWidth: 1,
        tiles: {
          '0,0': { tags: ['rocks'], rect: { x: 0, y: 0, width: 62, height: 62 } }
        }
      },
      sources: [
        {
          sheetPath: 'images/map/sprite_sheets/a.webp',
          metadata: {
            sheetPath: 'images/map/sprite_sheets/a.webp',
            blendMode: 'black',
            tiles: {
              '0,0': { tags: ['rocks'], rect: { x: 0, y: 0, width: 62, height: 62 } }
            }
          }
        },
        {
          sheetPath: 'images/map/sprite_sheets/b.webp',
          metadata: {
            sheetPath: 'images/map/sprite_sheets/b.webp',
            blendMode: 'alpha',
            tiles: {
              '1,0': { tags: ['rocks'], rect: { x: 64, y: 0, width: 62, height: 62 } }
            }
          }
        }
      ],
      biomeTag: 'grass'
    })

    expect(manager.integratedSpriteSheetMode).toBe(true)
    expect(manager.integratedSpriteSheetSources).toHaveLength(2)
    expect(manager.integratedTagBuckets.rocks).toHaveLength(2)

    const tile = manager.getIntegratedTileForMapTile('rock', 8, 11)
    expect(tile).toBeTruthy()
    expect(tile.tags).toContain('rocks')
    expect([0, 64]).toContain(tile.rect.x)
  })

  it('disables integrated mode when no tagged source metadata is provided', async() => {
    const manager = new TextureManager()
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue({ id: 'sheet' })

    await manager.setIntegratedSpriteSheetConfig({
      enabled: true,
      sheetPath: 'images/map/sprite_sheets/a.webp',
      metadata: { sheetPath: 'images/map/sprite_sheets/a.webp', tileSize: 64, borderWidth: 1, tiles: {} },
      sources: [],
      biomeTag: 'grass'
    })

    expect(manager.integratedSpriteSheetMode).toBe(false)
    expect(manager.integratedTagBuckets).toEqual({})
  })
})
