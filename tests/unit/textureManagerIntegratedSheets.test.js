import { describe, it, expect, vi } from 'vitest'
import { TextureManager } from '../../src/rendering/textureManager.js'
import { buildOccupancyMap } from '../../src/units.js'

describe('TextureManager integrated multi-sheet selection', () => {
  it('[U06212] loads only the demanded generated manifest and final page, reuses signatures, and publishes it', async() => {
    const manager = new TextureManager()
    const manifest = {
      signature: 'sheet-signature',
      identity: { metadataSignature: 'metadata-signature' },
      source: { image: 'images/map/sprite_sheets/terrain.webp' },
      pages: [{ name: 'terrain.coarse.webp', tier: 0, tierName: 'coarse', decodedBytes: 64 }, { name: 'terrain.final.webp', tier: 2, tierName: 'final', decodedBytes: 256 }],
      sprites: [{ spriteId: 'terrain:group_1', logicalWidth: 64, logicalHeight: 64, anchorX: 0.5, anchorY: 1, tileKeys: ['0,0'], sources: [{ tier: 2, x: 2, y: 3, width: 64, height: 64 }] }]
    }
    vi.spyOn(manager, 'loadPreparedMapSpriteCatalog').mockResolvedValue({ sheets: [{ name: 'terrain', manifest: 'terrain.json' }] })
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async url => ({ ok: true, json: async() => {
      expect(url).toBe('/images/prepared-map-sprites/terrain.json')
      return manifest
    } }))
    const pageImage = { width: 100, height: 100 }
    const loadImage = vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue(pageImage)
    const publish = vi.fn()
    manager.onSpriteTierPublication = publish
    try {
      await manager.setIntegratedSpriteSheetConfig({ enabled: true, biomeTag: 'grass', sheets: [{
        sheetPath: 'images/map/sprite_sheets/terrain.webp',
        metadata: { tileSize: 64, blendMode: 'black', tiles: { '0,0': { tags: ['grass', 'passable'], rect: { x: 99, y: 99, width: 64, height: 64 } } } }
      }] })
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(loadImage).toHaveBeenCalledOnce()
    expect(loadImage).toHaveBeenCalledWith('images/prepared-map-sprites/terrain.final.webp')
    expect(manager.integratedTagBuckets.grass[0]).toEqual(expect.objectContaining({
      image: pageImage,
      spriteId: 'images/map/sprite_sheets/terrain.webp',
      metadataSignature: 'metadata-signature',
      signature: 'sheet-signature',
      rect: { x: 2, y: 3, width: 64, height: 64 }
    }))
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ spriteId: 'images/map/sprite_sheets/terrain.webp', tier: 2 }))
    expect(Object.isFrozen(publish.mock.calls[0][0])).toBe(true)
  })

  it('[U04447] invalidates layout and changes blocked occupancy after an optional sheet tag edit', async() => {
    const manager = new TextureManager()
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue({ width: 64, height: 64 })
    const grid = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => ({ type: 'land', biome: 'grass' })))
    const configure = tags => manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets: [{
      sheetPath: 'images/map/sprite_sheets/optional.webp',
      metadata: { tileSize: 64, borderWidth: 0, tiles: { '0,0': { tags, rect: { x: 0, y: 0, width: 64, height: 64 } } } }
    }] })
    await configure(['grass', 'decorative', 'impassable'])
    manager.prepareDecorationLayout(grid)
    const blocked = buildOccupancyMap([], grid, manager).flat().filter(Boolean).length
    const signature = manager.integratedRenderSignature
    const layout = manager.getDecorationLayout(grid)
    await configure(['grass', 'decorative', 'passable'])
    manager.prepareDecorationLayout(grid)
    expect(manager.getDecorationLayout(grid)).not.toBe(layout)
    expect(manager.integratedRenderSignature).not.toBe(signature)
    expect(blocked).toBeGreaterThan(0)
    expect(buildOccupancyMap([], grid, manager).flat().filter(Boolean)).toHaveLength(0)
  })

  it('[U06207] republishes the decoration layout after a sheet reconfiguration retires it', async() => {
    const manager = new TextureManager()
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue({ width: 64, height: 64 })
    const grid = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => ({ type: 'land', biome: 'grass' })))
    const configure = () => manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets: [{
      sheetPath: 'images/map/sprite_sheets/optional.webp',
      metadata: { tileSize: 64, borderWidth: 0, tiles: { '0,0': { tags: ['grass', 'decorative'], rect: { x: 0, y: 0, width: 64, height: 64 } } } }
    }] })
    expect(manager.ensureDecorationLayout(grid)).toBeNull()
    await configure()
    const published = manager.ensureDecorationLayout(grid)
    expect(published).toBeTruthy()
    expect(manager.ensureDecorationLayout(grid)).toBe(published)
    // Restoring a save re-applies the same sheets after the map was published.
    await configure()
    expect(manager.getDecorationLayout(grid)).toBeNull()
    const republished = manager.ensureDecorationLayout(grid)
    expect(republished).not.toBe(published)
    expect(manager.getDecorationLayout(grid)).toBe(republished)
  })

  it('[U04448] selects land without recursion and only from enabled SSE sheets', async() => {
    const manager = new TextureManager()
    const enabledImage = { id: 'enabled-land-sheet' }
    const loadImage = vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue(enabledImage)

    await manager.setIntegratedSpriteSheetConfig({
      enabled: true,
      biomeTag: 'grass',
      sheets: [{
        sheetPath: 'enabled.webp',
        metadata: {
          blendMode: 'alpha',
          tiles: {
            '0,0': { tags: ['grass', 'passable'], rect: { x: 0, y: 0, width: 64, height: 64 } }
          }
        }
      }]
    })

    expect(manager.getIntegratedTileForMapTile('land', 4, 7)).toEqual(expect.objectContaining({
      image: enabledImage,
      sheetPath: 'enabled.webp',
      tags: expect.arrayContaining(['grass', 'passable'])
    }))
    expect(loadImage).toHaveBeenCalledTimes(1)
    expect(loadImage).toHaveBeenCalledWith('enabled.webp')
  })

  it('[U04449] combines tagged tiles from multiple selected sprite sheets', async() => {
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

  it('[U04450] disables integrated mode when selected sheets have no tagged tiles', async() => {
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

  it('[U04451] keeps the selected biome for legacy terrain when integrated mode is disabled', async() => {
    const manager = new TextureManager()

    await manager.setIntegratedSpriteSheetConfig({ enabled: false, biomeTag: 'sand' })

    expect(manager.integratedSpriteSheetMode).toBe(false)
    expect(manager.integratedBiomeTag).toBe('sand')
    expect(manager.integratedRenderSignature).toBe('off|sand')
  })

  it('[U04452] falls back to bundled combat decal candidates when integrated sheets do not provide decal tags', () => {
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

  it('[U04453] loads blob and data integrated sheets without prefixing a slash', async() => {
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

  it('[U04454] does not publish integrated images until decode completes', async() => {
    const manager = new TextureManager()
    let finishDecode
    class MockImage {
      constructor() {
        this.naturalWidth = 64
        this.naturalHeight = 64
      }

      decode() {
        return new Promise(resolve => { finishDecode = resolve })
      }

      set src(value) {
        this.loadedSource = value
        this.onload()
      }
    }
    const OriginalImage = globalThis.Image
    globalThis.Image = MockImage
    try {
      let settled = false
      const loading = manager.loadIntegratedSpriteSheetImage('images/map/sprite_sheets/decode.webp')
        .then(() => { settled = true })
      await Promise.resolve()
      expect(settled).toBe(false)
      expect(manager.integratedSpriteSheetImagesByPath).not.toHaveProperty('images/map/sprite_sheets/decode.webp')
      finishDecode()
      await loading
      expect(manager.integratedSpriteSheetImagesByPath).toHaveProperty('images/map/sprite_sheets/decode.webp')
    } finally {
      globalThis.Image = OriginalImage
    }
  })

  it('[U04455] prevents a superseded sprite-sheet generation from publishing', async() => {
    const manager = new TextureManager()
    let resolveFirst
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockImplementation((path) => {
      if (path === 'first.webp') return new Promise(resolve => { resolveFirst = resolve })
      return Promise.resolve({ id: path })
    })
    const metadata = {
      tiles: {
        '0,0': { tags: ['rocks'], rect: { x: 0, y: 0, width: 64, height: 64 } }
      }
    }
    const first = manager.setIntegratedSpriteSheetConfig({
      enabled: true,
      sheets: [{ sheetPath: 'first.webp', metadata }]
    })
    await manager.setIntegratedSpriteSheetConfig({
      enabled: true,
      sheets: [{ sheetPath: 'second.webp', metadata }]
    })
    resolveFirst({ id: 'first.webp' })

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(manager.integratedSpriteSheetPath).toBe('second.webp')
    expect(manager.integratedConfigVersion).toBe(1)
  })

  it('[U04456] builds rectangular grouped variants and returns tile slices by offset', async() => {
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

  it('[U04457] does not use grouped tiles as non-group fallback candidates', async() => {
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

  it('[U04458] uses default crystal sheet tags when integrated custom sheets are disabled', () => {
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

  it('[U04459] prefers integrated crystal tags over default crystal fallback when available', () => {
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

  it('[U04460] selects street tiles with exactly matching directional tags', () => {
    const manager = new TextureManager()
    manager.defaultStreetTagBuckets = {
      street: [
        {
          tags: ['street', 'top'],
          rect: { x: 0, y: 0, width: 64, height: 64 },
          image: { id: 'default-streets' },
          sheetPath: 'images/map/sprite_sheets/custom_streets.webp'
        },
        {
          tags: ['street', 'top', 'left'],
          rect: { x: 64, y: 0, width: 64, height: 64 },
          image: { id: 'default-streets' },
          sheetPath: 'images/map/sprite_sheets/custom_streets.webp'
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

  it('[U04461] uses full street tiles for diagonal cluster corners before directional matches', () => {
    const manager = new TextureManager()
    manager.defaultStreetTagBuckets = {
      street: [
        {
          tags: ['street', 'top', 'left'],
          rect: { x: 0, y: 0, width: 64, height: 64 },
          image: { id: 'default-streets' },
          sheetPath: 'images/map/sprite_sheets/custom_streets.webp'
        },
        {
          tags: ['street', 'full', 'top', 'bottom', 'left', 'right'],
          rect: { x: 64, y: 0, width: 64, height: 64 },
          image: { id: 'default-streets' },
          sheetPath: 'images/map/sprite_sheets/custom_streets.webp'
        }
      ],
      full: [
        {
          tags: ['street', 'full', 'top', 'bottom', 'left', 'right'],
          rect: { x: 64, y: 0, width: 64, height: 64 },
          image: { id: 'default-streets' },
          sheetPath: 'images/map/sprite_sheets/custom_streets.webp'
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

  it('[U04462] keeps T-cross and 4-way street candidates separated by exact direction tags', () => {
    const manager = new TextureManager()
    const grassFourWay = {
      tags: ['street', 'grass', 'top', 'bottom', 'left', 'right'],
      rect: { x: 256, y: 256, width: 64, height: 64 },
      image: { id: 'default-streets' },
      sheetPath: 'images/map/sprite_sheets/custom_streets.webp'
    }
    const grassRightT = {
      tags: ['street', 'grass', 'top', 'bottom', 'right'],
      rect: { x: 320, y: 256, width: 64, height: 64 },
      image: { id: 'default-streets' },
      sheetPath: 'images/map/sprite_sheets/custom_streets.webp'
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

  it('[U04463] selects only full-tagged street tiles for SOT fill art', () => {
    const manager = new TextureManager()
    const isolatedStreet = {
      tags: ['street', 'grass'],
      rect: { x: 0, y: 0, width: 64, height: 64 },
      image: { id: 'default-streets' },
      sheetPath: 'images/map/sprite_sheets/custom_streets.webp'
    }
    const fullGrassStreet = {
      tags: ['street', 'full', 'grass'],
      rect: { x: 64, y: 0, width: 64, height: 64 },
      image: { id: 'default-streets' },
      sheetPath: 'images/map/sprite_sheets/custom_streets.webp'
    }
    manager.defaultStreetTagBuckets = {
      street: [isolatedStreet, fullGrassStreet],
      grass: [isolatedStreet, fullGrassStreet],
      full: [fullGrassStreet]
    }

    expect(manager.selectFullStreetTileForSOT(5, 7)).toBe(fullGrassStreet)
  })

  it('[U04464] reuses cached street selection pools for repeated topology lookups', () => {
    const manager = new TextureManager()
    manager.integratedBiomeTag = 'grass'
    manager.integratedRenderSignature = 'street-test-signature'
    const streetCorner = {
      tags: ['street', 'grass', 'top', 'right'],
      rect: { x: 0, y: 0, width: 64, height: 64 },
      image: { id: 'default-streets' },
      sheetPath: 'images/map/sprite_sheets/custom_streets.webp'
    }
    manager.defaultStreetTagBuckets = {
      street: [streetCorner],
      grass: [streetCorner],
      top: [streetCorner],
      right: [streetCorner]
    }

    const lookupSpy = vi.spyOn(manager, 'getTagBucketCandidates')
    const poolSpy = vi.spyOn(manager, 'getStreetSelectionPool')
    const mapGrid = [
      [{ type: 'land' }, { type: 'street' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'street' }, { type: 'street' }],
      [{ type: 'land' }, { type: 'land' }, { type: 'land' }]
    ]

    const first = manager.selectStreetTileByTags(['street'], 1, 1, mapGrid)
    const callsAfterFirst = lookupSpy.mock.calls.length
    const second = manager.selectStreetTileByTags(['street'], 1, 1, mapGrid)

    expect(first).toBe(streetCorner)
    expect(second).toBe(streetCorner)
    expect(lookupSpy.mock.calls.length).toBe(callsAfterFirst)
    expect(poolSpy).toHaveBeenCalledTimes(1)
  })

  it('[U04465] places multi-tile decorations from the layout, inside one biome, and frozen lakes block movement', async() => {
    const manager = new TextureManager()
    vi.spyOn(manager, 'loadIntegratedSpriteSheetImage').mockResolvedValue({ id: 'dt-sheet' })
    const tile = (col, row, tags) => ({ col, row, tags, rect: { x: col * 64, y: row * 64, width: 64, height: 64 } })

    await manager.setIntegratedSpriteSheetConfig({
      enabled: true,
      biomeTag: 'mixed',
      sheets: [{
        sheetPath: 'images/map/sprite_sheets/dt_test.webp',
        metadata: {
          blendMode: 'black',
          tiles: {
            '0,0': tile(0, 0, ['grass', 'decorative', 'summer', 'group_1']),
            '1,0': tile(1, 0, ['grass', 'decorative', 'summer', 'group_1']),
            '0,1': tile(0, 1, ['grass', 'decorative', 'summer', 'group_1']),
            '1,1': tile(1, 1, ['grass', 'decorative', 'summer', 'group_1']),
            '2,0': tile(2, 0, ['universal', 'decorative', 'group_3']),
            '3,0': tile(3, 0, ['snow', 'decorative', 'winter', 'impassable', 'water', 'group_4']),
            '4,0': tile(4, 0, ['snow', 'decorative', 'winter', 'impassable', 'water', 'group_4']),
            '3,1': tile(3, 1, ['snow', 'decorative', 'winter', 'impassable', 'water', 'group_4']),
            '4,1': tile(4, 1, ['snow', 'decorative', 'winter', 'impassable', 'water', 'group_4'])
          }
        }
      }]
    })

    // Left half grass, right half snow.
    const size = 60
    const mapGrid = Array.from({ length: size }, () => Array.from({ length: size }, (_, x) => ({
      type: 'land',
      biome: x < size / 2 ? 'grass' : 'snow'
    })))

    manager.prepareDecorationLayout(mapGrid)
    const layout = manager.getDecorationLayout(mapGrid)
    expect(layout.placements.length).toBeGreaterThan(0)
    const frozen = layout.placements.filter(p => p.group.tagSet.has('impassable'))
    expect(frozen.length).toBeGreaterThan(0)
    layout.placements.forEach(({ group, anchorX, anchorY, biome }) => {
      for (let gy = 0; gy < group.height; gy++) {
        for (let gx = 0; gx < group.width; gx++) {
          expect(mapGrid[anchorY + gy][anchorX + gx].biome).toBe(biome)
          const selected = manager.getIntegratedTileForMapTile('land', anchorX + gx, anchorY + gy, { mapGrid })
          expect(selected?.tags).toEqual(expect.arrayContaining([group.groupLabel]))
        }
      }
    })

    // Cached per map grid.
    expect(manager.getDecorationLayout(mapGrid)).toBe(layout)

    window.logger = window.logger || (() => {})
    const occupancy = buildOccupancyMap([], mapGrid, manager)
    const lake = frozen[0]
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
        expect(occupancy[lake.anchorY + gy][lake.anchorX + gx]).toBe(1)
      }
    }
    const grassPlacement = layout.placements.find(p => p.biome === 'grass')
    expect(occupancy[grassPlacement.anchorY][grassPlacement.anchorX]).toBe(0)

    // Cells without a decoration return null so the organic ground shows.
    const emptyIndex = layout.cells.findIndex(cell => !cell)
    const emptyX = emptyIndex % size
    const emptyY = Math.floor(emptyIndex / size)
    expect(manager.getIntegratedTileForMapTile('land', emptyX, emptyY, { mapGrid })).toBeNull()

    // Editing a covered cell drops the whole sprite instead of drawing half of it.
    mapGrid[lake.anchorY][lake.anchorX] = { type: 'street', biome: 'snow' }
    expect(manager.getIntegratedTileForMapTile('land', lake.anchorX + 1, lake.anchorY + 1, { mapGrid })).toBeNull()
  })
})


it('[U04466] explicit empty selection clears previous custom sheets and matches disabled tile choices', async() => {
  const manager = new TextureManager()
  manager.lastIntegratedSheetEntries = [{ sheetPath: 'stale.webp', metadata: { tiles: {} } }]
  const load = vi.spyOn(manager, 'loadIntegratedSpriteSheetImage')
  const grid = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => ({ type: 'land', biome: 'grass' })))
  await manager.setIntegratedSpriteSheetConfig({ enabled: false, biomeTag: 'grass' })
  const choices = grid.map((row, y) => row.map((tile, x) => manager.getIntegratedTileForMapTile(tile.type, x, y, { mapGrid: grid })))
  const pools = manager.integratedDecorationPools
  await manager.setIntegratedSpriteSheetConfig({ enabled: true, sheets: [], biomeTag: 'grass' })
  expect(grid.map((row, y) => row.map((tile, x) => manager.getIntegratedTileForMapTile(tile.type, x, y, { mapGrid: grid })))).toEqual(choices)
  expect(manager.integratedDecorationPools).toEqual(pools)
  expect(manager.integratedSpriteSheetMode).toBe(false)
  expect(load).not.toHaveBeenCalled()
})
