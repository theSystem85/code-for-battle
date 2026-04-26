import { readFileSync } from 'node:fs'
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

  it('builds rectangular grouped variants and returns tile slices by offset', async() => {
    const manager = new TextureManager()
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue({ id: 'group-sheet' })

    await manager.setIntegratedSpriteSheetConfig({
      enabled: true,
      sheets: [{
        sheetPath: 'images/map/sprite_sheets/grouped.webp',
        metadata: {
          blendMode: 'black',
          tiles: {
            '0,0': { col: 0, row: 0, tags: ['rocks', 'group_7'], rect: { x: 0, y: 0, width: 64, height: 64 } },
            '1,0': { col: 1, row: 0, tags: ['rocks', 'group_7'], rect: { x: 64, y: 0, width: 64, height: 64 } }
          }
        }
      }]
    })

    const left = manager.selectGroupedTileVariant('rocks', { width: 2, height: 1, offsetX: 0, offsetY: 0, seed: 0 })
    const right = manager.selectGroupedTileVariant('rocks', { width: 2, height: 1, offsetX: 1, offsetY: 0, seed: 0 })
    expect(left?.rect?.x).toBe(0)
    expect(right?.rect?.x).toBe(64)
  })

  it('does not use grouped tiles as non-group fallback candidates', async() => {
    const manager = new TextureManager()
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue({ id: 'group-exclusive-sheet' })

    await manager.setIntegratedSpriteSheetConfig({
      enabled: true,
      sheets: [{
        sheetPath: 'images/map/sprite_sheets/group-exclusive.webp',
        metadata: {
          blendMode: 'black',
          tiles: {
            '0,0': { col: 0, row: 0, tags: ['debris', 'group_3'], rect: { x: 0, y: 0, width: 64, height: 64 } }
          }
        }
      }]
    })

    expect(manager.getIntegratedTileCandidatesByTags(['debris'])).toEqual([])
    expect(manager.selectIntegratedTileByTags(['debris'], 0, 0)).toBeNull()
    expect(manager.selectGroupedTileVariant('debris', {
      width: 1,
      height: 1,
      offsetX: 0,
      offsetY: 0,
      seed: 0
    })).toBeTruthy()
  })

  it('uses default crystal sheet tags when integrated custom sheets are disabled', () => {
    const manager = new TextureManager()
    manager.integratedSpriteSheetMode = false
    manager.defaultCrystalTagBuckets = {
      ore: [
        {
          tags: ['ore', 'density_2'],
          rect: { x: 128, y: 0, width: 64, height: 64 },
          image: { id: 'default-crystals' },
          sheetPath: 'images/map/sprite_sheets/crystals_q90_1024x1024.webp'
        }
      ],
      density_2: [
        {
          tags: ['ore', 'density_2'],
          rect: { x: 128, y: 0, width: 64, height: 64 },
          image: { id: 'default-crystals' },
          sheetPath: 'images/map/sprite_sheets/crystals_q90_1024x1024.webp'
        }
      ]
    }

    const selected = manager.selectCrystalTileByTags(['ore', 'density_2'], 3, 9)
    expect(selected).toEqual(expect.objectContaining({
      sheetPath: 'images/map/sprite_sheets/crystals_q90_1024x1024.webp'
    }))
  })

  it('prefers integrated crystal tags over default crystal fallback when available', () => {
    const manager = new TextureManager()
    manager.integratedSpriteSheetMode = true
    manager.integratedTagBuckets = {
      ore: [
        {
          tags: ['ore', 'density_3'],
          rect: { x: 64, y: 64, width: 64, height: 64 },
          image: { id: 'custom-crystals' },
          sheetPath: 'images/map/sprite_sheets/custom_crystals.webp'
        }
      ],
      density_3: [
        {
          tags: ['ore', 'density_3'],
          rect: { x: 64, y: 64, width: 64, height: 64 },
          image: { id: 'custom-crystals' },
          sheetPath: 'images/map/sprite_sheets/custom_crystals.webp'
        }
      ]
    }
    manager.defaultCrystalTagBuckets = {
      ore: [
        {
          tags: ['ore', 'density_3'],
          rect: { x: 0, y: 0, width: 64, height: 64 },
          image: { id: 'default-crystals' },
          sheetPath: 'images/map/sprite_sheets/crystals_q90_1024x1024.webp'
        }
      ],
      density_3: [
        {
          tags: ['ore', 'density_3'],
          rect: { x: 0, y: 0, width: 64, height: 64 },
          image: { id: 'default-crystals' },
          sheetPath: 'images/map/sprite_sheets/crystals_q90_1024x1024.webp'
        }
      ]
    }

    const selected = manager.selectCrystalTileByTags(['ore', 'density_3'], 7, 11)
    expect(selected).toEqual(expect.objectContaining({
      sheetPath: 'images/map/sprite_sheets/custom_crystals.webp'
    }))
  })

  it('selects street tiles with exactly matching directional tags', () => {
    const manager = new TextureManager()
    manager.defaultStreetTagBuckets = {
      street: [
        {
          tags: ['street', 'top'],
          rect: { x: 0, y: 0, width: 64, height: 64 },
          image: { id: 'default-streets' },
          sheetPath: 'images/map/sprite_sheets/streets24_q90_1024x1024.webp'
        },
        {
          tags: ['street', 'top', 'left'],
          rect: { x: 64, y: 0, width: 64, height: 64 },
          image: { id: 'default-streets' },
          sheetPath: 'images/map/sprite_sheets/streets24_q90_1024x1024.webp'
        }
      ]
    }
    const mapGrid = [
      [{ type: 'land' }, { type: 'street' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'street' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'land' }, { type: 'land' }]
    ]

    const selected = manager.selectStreetTileByTags(['street'], 1, 1, mapGrid)

    expect(selected?.tags).toEqual(['street', 'top'])
  })

  it('uses full street tiles for diagonal cluster corners before directional matches', () => {
    const manager = new TextureManager()
    manager.defaultStreetTagBuckets = {
      street: [
        {
          tags: ['street', 'top', 'left'],
          rect: { x: 0, y: 0, width: 64, height: 64 },
          image: { id: 'default-streets' },
          sheetPath: 'images/map/sprite_sheets/streets24_q90_1024x1024.webp'
        },
        {
          tags: ['street', 'full', 'top', 'bottom', 'left', 'right'],
          rect: { x: 64, y: 0, width: 64, height: 64 },
          image: { id: 'default-streets' },
          sheetPath: 'images/map/sprite_sheets/streets24_q90_1024x1024.webp'
        }
      ],
      full: [
        {
          tags: ['street', 'full', 'top', 'bottom', 'left', 'right'],
          rect: { x: 64, y: 0, width: 64, height: 64 },
          image: { id: 'default-streets' },
          sheetPath: 'images/map/sprite_sheets/streets24_q90_1024x1024.webp'
        }
      ]
    }
    const mapGrid = [
      [{ type: 'street' }, { type: 'street' }, { type: 'land' }],
      [{ type: 'street' }, { type: 'street' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'land' }, { type: 'land' }]
    ]

    const selected = manager.selectStreetTileByTags(['street'], 1, 1, mapGrid)

    expect(selected?.tags).toContain('full')
  })

  it('keeps T-cross and 4-way street candidates separated by exact direction tags', () => {
    const manager = new TextureManager()
    const grassFourWay = {
      tags: ['street', 'grass', 'top', 'bottom', 'left', 'right'],
      rect: { x: 256, y: 256, width: 64, height: 64 },
      image: { id: 'default-streets' },
      sheetPath: 'images/map/sprite_sheets/streets24_q90_1024x1024.webp'
    }
    const grassRightT = {
      tags: ['street', 'grass', 'top', 'bottom', 'right'],
      rect: { x: 320, y: 256, width: 64, height: 64 },
      image: { id: 'default-streets' },
      sheetPath: 'images/map/sprite_sheets/streets24_q90_1024x1024.webp'
    }
    manager.defaultStreetTagBuckets = {
      street: [grassFourWay, grassRightT],
      grass: [grassFourWay, grassRightT],
      top: [grassFourWay, grassRightT],
      bottom: [grassFourWay, grassRightT],
      left: [grassFourWay],
      right: [grassFourWay, grassRightT]
    }
    const fourWayGrid = [
      [{ type: 'land' }, { type: 'street' }, { type: 'land' }],
      [{ type: 'street' }, { type: 'street' }, { type: 'street' }],
      [{ type: 'land' }, { type: 'street' }, { type: 'land' }]
    ]
    const rightTGrid = [
      [{ type: 'land' }, { type: 'street' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'street' }, { type: 'street' }],
      [{ type: 'land' }, { type: 'street' }, { type: 'land' }]
    ]

    expect(manager.selectStreetTileByTags(['street'], 1, 1, fourWayGrid)).toBe(grassFourWay)
    expect(manager.selectStreetTileByTags(['street'], 1, 1, rightTGrid)).toBe(grassRightT)
  })

  it('keeps the real streets24 grass T and 4-way metadata distinct', () => {
    const metadata = JSON.parse(readFileSync(
      'public/images/map/sprite_sheets/streets24_q90_1024x1024.json',
      'utf8'
    ))

    expect(metadata.tiles['4,4'].tags).toEqual(['street', 'grass', 'right', 'top', 'bottom'])
    expect(metadata.tiles['5,4'].tags).toEqual(['street', 'grass', 'left', 'right', 'top', 'bottom'])
  })

  it('selects only full-tagged street tiles for SOT fill art', () => {
    const manager = new TextureManager()
    const isolatedStreet = {
      tags: ['street', 'grass'],
      rect: { x: 0, y: 0, width: 64, height: 64 },
      image: { id: 'default-streets' },
      sheetPath: 'images/map/sprite_sheets/streets24_q90_1024x1024.webp'
    }
    const fullGrassStreet = {
      tags: ['street', 'full', 'grass'],
      rect: { x: 64, y: 0, width: 64, height: 64 },
      image: { id: 'default-streets' },
      sheetPath: 'images/map/sprite_sheets/streets24_q90_1024x1024.webp'
    }
    manager.defaultStreetTagBuckets = {
      street: [isolatedStreet, fullGrassStreet],
      grass: [isolatedStreet, fullGrassStreet],
      full: [fullGrassStreet]
    }

    expect(manager.selectFullStreetTileForSOT(5, 7)).toBe(fullGrassStreet)
  })
})
