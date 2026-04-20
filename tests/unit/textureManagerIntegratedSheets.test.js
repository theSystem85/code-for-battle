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

  it('falls back to bundled combat decal candidates when integrated sheets do not provide decal tags', () => {
    const manager = new TextureManager()
    manager.defaultCombatDecalTagBuckets = {
      crater: [
        {
          tags: ['crater'],
          rect: { x: 0, y: 0, width: 64, height: 64 },
          image: { id: 'combat-sheet' },
          sheetPath: 'images/map/sprite_sheets/debris_craters_tracks.webp'
        }
      ]
    }

    expect(manager.getDecalTileCandidatesByTags(['crater'])).toEqual([
      expect.objectContaining({
        sheetPath: 'images/map/sprite_sheets/debris_craters_tracks.webp'
      })
    ])
  })

  it('loads blob and data integrated sheets without prefixing a slash', async() => {
    const manager = new TextureManager()
    const assignedSrc = []

    const OriginalImage = globalThis.Image
    class MockImage {
      set onload(handler) {
        this._onload = handler
      }

      set onerror(handler) {
        this._onerror = handler
      }

      set src(value) {
        assignedSrc.push(value)
        if (this._onload) this._onload()
      }
    }

    globalThis.Image = MockImage
    try {
      await manager.loadIntegratedSpriteSheetImage('blob:runtime-uploaded')
      await manager.loadIntegratedSpriteSheetImage('data:image/webp;base64,abc123')
      await manager.loadIntegratedSpriteSheetImage('images/map/sprite_sheets/default.webp')
    } finally {
      globalThis.Image = OriginalImage
    }

    expect(assignedSrc).toEqual([
      'blob:runtime-uploaded',
      'data:image/webp;base64,abc123',
      '/images/map/sprite_sheets/default.webp'
    ])
  })

  it('builds rectangular grouped tile candidates and filters by dimensions', async() => {
    const manager = new TextureManager()
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue({ id: 'sheet-a' })

    await manager.setIntegratedSpriteSheetConfig({
      enabled: true,
      sheets: [
        {
          sheetPath: 'images/map/sprite_sheets/group.webp',
          metadata: {
            blendMode: 'alpha',
            tileSize: 64,
            borderWidth: 0,
            tiles: {
              '0,0': { tags: ['rocks', 'group_7'], rect: { x: 0, y: 0, width: 64, height: 64 }, col: 0, row: 0 },
              '1,0': { tags: ['rocks', 'group_7'], rect: { x: 64, y: 0, width: 64, height: 64 }, col: 1, row: 0 }
            }
          }
        }
      ]
    })

    const allRockGroups = manager.getIntegratedGroupCandidatesByTags(['rocks'])
    const exactWideGroups = manager.getIntegratedGroupCandidatesByTags(['rocks'], { exactWidth: 2, exactHeight: 1 })
    expect(allRockGroups).toHaveLength(1)
    expect(exactWideGroups).toHaveLength(1)
    expect(exactWideGroups[0].offsets).toHaveLength(2)
  })
})
