import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TextureManager } from '../../src/rendering/textureManager.js'

describe('TextureManager integrated multi-sheet support', () => {
  let textureManager

  beforeEach(() => {
    textureManager = new TextureManager()
    vi.spyOn(textureManager, 'loadIntegratedSpriteSheetImage').mockImplementation(async(sheetPath) => ({
      complete: true,
      width: 64,
      height: 64,
      sheetPath
    }))
  })

  it('combines matching tag buckets from multiple sheets', async() => {
    await textureManager.setIntegratedSpriteSheetConfig({
      enabled: true,
      biomeTag: 'grass',
      sheets: [
        {
          sheetPath: 'images/map/sprite_sheets/a.webp',
          metadata: {
            blendMode: 'alpha',
            tiles: {
              '0,0': {
                tags: ['rock', 'rocks'],
                rect: { x: 0, y: 0, width: 62, height: 62 }
              }
            }
          }
        },
        {
          sheetPath: 'images/map/sprite_sheets/b.webp',
          metadata: {
            blendMode: 'black',
            tiles: {
              '1,0': {
                tags: ['rock', 'rocks'],
                rect: { x: 10, y: 10, width: 62, height: 62 }
              }
            }
          }
        }
      ]
    })

    expect(textureManager.integratedSpriteSheetMode).toBe(true)
    expect(textureManager.integratedTagBuckets.rocks).toHaveLength(2)
    const candidates = textureManager.getIntegratedTileCandidatesByTags(['rocks'])
    const rects = candidates.map(tile => `${tile.rect.x},${tile.rect.y}`)
    expect(new Set(rects).size).toBe(2)

    const tileA = textureManager.getIntegratedTileForMapTile('rock', 0, 0)
    const tileB = textureManager.getIntegratedTileForMapTile('rock', 1, 0)

    expect(tileA).toBeTruthy()
    expect(tileB).toBeTruthy()
  })

  it('skips untagged sheets so they are not loaded into runtime buckets', async() => {
    await textureManager.setIntegratedSpriteSheetConfig({
      enabled: true,
      sheets: [
        {
          sheetPath: 'images/map/sprite_sheets/untagged.webp',
          metadata: {
            tiles: {
              '0,0': {
                tags: [],
                rect: { x: 0, y: 0, width: 62, height: 62 }
              }
            }
          }
        }
      ]
    })

    expect(textureManager.integratedSpriteSheetMode).toBe(false)
    expect(textureManager.integratedTagBuckets.rocks || []).toHaveLength(0)
  })
})
