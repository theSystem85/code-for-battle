import { describe, it, expect, vi } from 'vitest'
import { MapRenderer } from '../../src/rendering/mapRenderer.js'
import { GameWebGLRenderer } from '../../src/rendering/webglRenderer.js'

describe('MapRenderer water rendering', () => {
  const makeTextureManager = () => ({
    integratedSpriteSheetMode: false,
    allTexturesLoaded: false,
    tileTextureCache: { land: [] },
    waterFrames: [{ id: 'legacy-water-frame' }],
    getCurrentWaterFrame: () => ({ id: 'legacy-water-frame' }),
    getTileVariation: () => 0,
    integratedRenderSignature: 'sig',
    getIntegratedTileForMapTile: vi.fn(() => null)
  })

  it('uses procedural water for base water tiles instead of water frame assets', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const ctx = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '#000'
    }

    mapRenderer.drawTileBase(ctx, 5, 6, 'water', 100, 120, false, null)

    expect(ctx.drawImage).not.toHaveBeenCalled()
    expect(ctx.fillRect).toHaveBeenCalled()
  })

  it('keeps the chunk cache active for static CPU terrain over GPU water-only rendering', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    mapRenderer.canUseOffscreen = true
    mapRenderer.sotMask = [[null, null], [null, null]]
    const chunk = {
      canvas: { width: 42, height: 42 },
      ctx: { clearRect: vi.fn(), imageSmoothingEnabled: true },
      startX: 0,
      startY: 0,
      endX: 2,
      endY: 2,
      padding: 2,
      offsetX: -2,
      offsetY: -2
    }
    const ctx = {
      drawImage: vi.fn(),
      imageSmoothingEnabled: true
    }
    const mapGrid = [
      [{ type: 'street' }, { type: 'water' }],
      [{ type: 'land' }, { type: 'street' }]
    ]
    const updateChunkCache = vi.spyOn(mapRenderer, 'updateChunkCache').mockImplementation(() => {})
    vi.spyOn(mapRenderer, 'getOrCreateChunk').mockReturnValue(chunk)

    mapRenderer.renderTiles(ctx, mapGrid, { x: 0, y: 0 }, 0, 0, 2, 2, {}, {
      skipWaterBase: true,
      skipWaterSot: true
    })

    expect(updateChunkCache).toHaveBeenCalledWith(
      chunk,
      mapGrid,
      expect.any(Boolean),
      expect.anything(),
      { skipWaterBase: true, skipWaterSot: true }
    )
    expect(ctx.drawImage).toHaveBeenCalledWith(chunk.canvas, -2, -2)
  })

  it('reports chunk cache hits, misses, redraws, and drawn chunks for the last frame', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    mapRenderer.canUseOffscreen = true
    const ctx = {
      drawImage: vi.fn(),
      imageSmoothingEnabled: true
    }
    const mapGrid = [
      [{ type: 'land' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'land' }]
    ]

    mapRenderer.renderTiles(ctx, mapGrid, { x: 0, y: 0 }, 0, 0, 2, 2, {}, {})
    const firstFrameStats = { ...mapRenderer.frameChunkStats }

    mapRenderer.resetFrameChunkStats()
    mapRenderer.renderTiles(ctx, mapGrid, { x: 0, y: 0 }, 0, 0, 2, 2, {}, {})
    const secondFrameStats = { ...mapRenderer.frameChunkStats }

    expect(firstFrameStats.chunksDrawn).toBe(1)
    expect(firstFrameStats.chunkMisses).toBe(1)
    expect(secondFrameStats.chunksDrawn).toBe(1)
    expect(secondFrameStats.chunkHits).toBe(1)

    mapGrid[0][0].type = 'street'
    mapRenderer.markTileDirty(0, 0)
    mapRenderer.resetFrameChunkStats()
    mapRenderer.renderTiles(ctx, mapGrid, { x: 0, y: 0 }, 0, 0, 2, 2, {}, {})

    expect(mapRenderer.frameChunkStats.chunkRedraws).toBe(1)
  })

  it('keeps mixed water chunks static when dynamic water is rendered separately', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const ctx = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      imageSmoothingEnabled: true,
      fillStyle: '#000',
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn()
    }
    vi.spyOn(mapRenderer, 'applyVisibilityOverlay').mockImplementation(() => {})
    vi.spyOn(mapRenderer, 'renderGrid').mockImplementation(() => {})
    vi.spyOn(mapRenderer, 'renderOccupancyMap').mockImplementation(() => {})
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 128 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 128 })
    canvas.getBoundingClientRect = () => ({ width: 128, height: 128 })
    const mapGrid = Array.from({ length: 4 }, (_, y) =>
      Array.from({ length: 4 }, (_, x) => ({ type: (x + y) % 2 === 0 ? 'water' : 'street' }))
    )

    mapRenderer.render(ctx, mapGrid, { x: 0, y: 0 }, canvas, {}, null, { separateWaterLayer: true })
    const firstFrameStats = mapRenderer.getLastFrameChunkStats()
    mapRenderer.render(ctx, mapGrid, { x: 0, y: 0 }, canvas, {}, null, { separateWaterLayer: true })
    const secondFrameStats = mapRenderer.getLastFrameChunkStats()

    expect(firstFrameStats.chunkMisses).toBe(1)
    expect(secondFrameStats.chunkHits).toBe(1)
    expect(secondFrameStats.chunkRedraws).toBe(0)
  })

  it('uses logical canvas dimensions for visible tile bounds on high-DPR screens', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = Array.from({ length: 128 }, () => Array.from({ length: 128 }, () => ({ type: 'land' })))
    const renderTiles = vi.spyOn(mapRenderer, 'renderTiles').mockImplementation(() => {})
    vi.spyOn(mapRenderer, 'applyVisibilityOverlay').mockImplementation(() => {})
    vi.spyOn(mapRenderer, 'renderGrid').mockImplementation(() => {})
    vi.spyOn(mapRenderer, 'renderOccupancyMap').mockImplementation(() => {})
    const canvas = document.createElement('canvas')
    canvas.width = 1170
    canvas.height = 2532
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 390 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 844 })
    canvas.getBoundingClientRect = () => ({ width: 390, height: 844 })
    const originalDevicePixelRatio = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 3
    })

    try {
      mapRenderer.render(
        { imageSmoothingEnabled: true },
        mapGrid,
        { x: 0, y: 0 },
        canvas,
        {},
        null
      )
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        value: originalDevicePixelRatio
      })
    }

    expect(renderTiles.mock.calls[0].slice(3, 7)).toEqual([0, 0, 14, 28])
  })

  it('falls back to procedural water when custom sprite sheets are enabled without water tags', () => {
    const mapRenderer = new MapRenderer({
      ...makeTextureManager(),
      integratedSpriteSheetMode: true,
      getIntegratedTileForMapTile: vi.fn((type) => {
        if (type === 'land') {
          return {
            image: { id: 'custom-land-sheet' },
            rect: { x: 0, y: 0, width: 64, height: 64 },
            tags: ['grass', 'passable']
          }
        }
        return null
      })
    })
    const ctx = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '#000'
    }

    mapRenderer.drawTileBase(ctx, 5, 6, 'water', 100, 120, false, null)

    expect(ctx.drawImage).not.toHaveBeenCalled()
    expect(ctx.fillRect).toHaveBeenCalled()
  })

  it('draws land beneath integrated rock sprites so black-key transparency reveals terrain', () => {
    const integratedLookup = vi.fn((type) => {
      if (type === 'land') {
        return {
          image: { id: 'land-sheet' },
          rect: { x: 0, y: 0, width: 64, height: 64 },
          tags: ['grass', 'passable']
        }
      }

      if (type === 'rock') {
        return {
          image: { id: 'rock-sheet' },
          rect: { x: 64, y: 0, width: 64, height: 64 },
          tags: ['rocks']
        }
      }

      return null
    })
    const mapRenderer = new MapRenderer({
      ...makeTextureManager(),
      integratedSpriteSheetMode: true,
      getIntegratedTileForMapTile: integratedLookup
    })
    const ctx = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '#000'
    }

    mapRenderer.drawTileBase(ctx, 7, 8, 'rock', 100, 120, false, null)

    expect(integratedLookup).toHaveBeenCalledWith('rock', 7, 8)
    expect(integratedLookup).toHaveBeenCalledWith('land', 7, 8)
    expect(ctx.drawImage).toHaveBeenCalledTimes(2)
    expect(ctx.drawImage.mock.calls[0][0]).toEqual({ id: 'land-sheet' })
    expect(ctx.drawImage.mock.calls[1][0]).toEqual({ id: 'rock-sheet' })
  })

  it('uses procedural water for water SOT overlays', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const proceduralSpy = vi.spyOn(mapRenderer, 'drawProceduralWater')
    const ctx = {
      save: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '#000'
    }

    mapRenderer.drawSOT(ctx, 4, 4, 'top-left', { x: 0, y: 0 }, false, new Set(), 'water', null)

    expect(proceduralSpy).toHaveBeenCalled()
    expect(ctx.drawImage).not.toHaveBeenCalled()
  })

  it('uses integrated custom water tiles for water SOT overlays when available', () => {
    const mapRenderer = new MapRenderer({
      ...makeTextureManager(),
      integratedSpriteSheetMode: true,
      getIntegratedTileForMapTile: vi.fn((type) => {
        if (type === 'water') {
          return {
            image: { id: 'water-sheet' },
            rect: { x: 0, y: 0, width: 64, height: 64 },
            tags: ['water']
          }
        }
        return null
      })
    })
    const proceduralSpy = vi.spyOn(mapRenderer, 'drawProceduralWater')
    const ctx = {
      save: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '#000'
    }

    mapRenderer.drawSOT(ctx, 4, 4, 'top-left', { x: 0, y: 0 }, false, new Set(), 'water', null)

    expect(proceduralSpy).not.toHaveBeenCalled()
    expect(ctx.drawImage).toHaveBeenCalledTimes(1)
    expect(ctx.drawImage.mock.calls[0][0]).toEqual({ id: 'water-sheet' })
  })

  it('uses only full-tagged street art for street SOT overlays', () => {
    const selectFullStreetTileForSOT = vi.fn(() => ({
      image: { id: 'full-street-sheet' },
      rect: { x: 64, y: 128, width: 64, height: 64 },
      tags: ['street', 'full', 'grass']
    }))
    const mapRenderer = new MapRenderer({
      ...makeTextureManager(),
      selectFullStreetTileForSOT,
      getIntegratedTileForMapTile: vi.fn(() => ({
        image: { id: 'legacy-street-or-land' },
        rect: { x: 0, y: 0, width: 64, height: 64 },
        tags: ['street']
      }))
    })
    const ctx = {
      save: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '#000'
    }

    mapRenderer.drawSOT(ctx, 4, 4, 'top-left', { x: 0, y: 0 }, false, new Set(), 'street', null)

    expect(selectFullStreetTileForSOT).toHaveBeenCalledWith(4, 4)
    expect(mapRenderer.textureManager.getIntegratedTileForMapTile).not.toHaveBeenCalled()
    expect(ctx.drawImage).toHaveBeenCalledTimes(1)
    expect(ctx.drawImage.mock.calls[0][0]).toEqual({ id: 'full-street-sheet' })
  })

  it('can leave top-canvas water tiles transparent for GPU fallback while still drawing land tiles', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const drawTileBaseSpy = vi.spyOn(mapRenderer, 'drawTileBase').mockImplementation(() => {})
    const drawSotSpy = vi.spyOn(mapRenderer, 'drawSOT').mockImplementation(() => {})
    const ctx = {}
    const mapGrid = [
      [{ type: 'water' }, { type: 'land' }]
    ]

    mapRenderer.drawBaseLayer(ctx, mapGrid, 0, 0, 2, 1, 0, 0, false, null, { skipWaterBase: true })

    expect(drawTileBaseSpy).toHaveBeenCalledTimes(1)
    expect(drawTileBaseSpy).toHaveBeenCalledWith(ctx, 1, 0, 'land', 32, 0, false, null)
    expect(drawSotSpy).not.toHaveBeenCalled()
  })

  it('cuts out coastline water SOT on the 2D fallback while still allowing land inverse SOT', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const drawTileBaseSpy = vi.spyOn(mapRenderer, 'drawTileBase').mockImplementation(() => {})
    const drawSotSpy = vi.spyOn(mapRenderer, 'drawSOT').mockImplementation(() => {})
    const clearTriangleSpy = vi.spyOn(mapRenderer, 'clearTriangleArea').mockImplementation(() => {})
    const ctx = {}
    const mapGrid = [
      [{ type: 'water' }, { type: 'land' }]
    ]

    mapRenderer.sotMask = [[
      { orientation: 'top-left', type: 'land' },
      { orientation: 'top-left', type: 'water' }
    ]]

    mapRenderer.drawBaseLayer(ctx, mapGrid, 0, 0, 2, 1, 0, 0, false, null, { skipWaterBase: true, skipWaterSot: true })

    expect(drawTileBaseSpy).toHaveBeenCalledTimes(1)
    expect(drawTileBaseSpy).toHaveBeenCalledWith(ctx, 1, 0, 'land', 32, 0, false, null)
    expect(drawSotSpy).toHaveBeenCalledTimes(1)
    expect(drawSotSpy).toHaveBeenCalledWith(
      ctx,
      0,
      0,
      'top-left',
      { x: 0, y: 0 },
      false,
      expect.any(Set),
      'land',
      null
    )
    expect(clearTriangleSpy).toHaveBeenCalledTimes(1)
    expect(clearTriangleSpy).toHaveBeenCalledWith(ctx, 32, 0, 33, 'top-left')
  })

  it('adds water SOT triangles to the WebGL tile batch so they match shader-rendered water', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'land' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'land' }, { type: 'land' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    const webglRenderer = new GameWebGLRenderer(null, makeTextureManager(), mapRenderer)
    const instances = webglRenderer.buildTileInstances(mapGrid, 0, 0, 3, 3)
    const waterSotInstances = instances.filter(instance => instance.textureType === 2 && instance.clipOrientation > 0)

    expect(waterSotInstances).toHaveLength(1)
    expect(waterSotInstances[0].translation).toEqual([1, 1])
  })

  it('adds coastline water SOT triangles to the WebGL water-only fallback batch', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'land' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'land' }, { type: 'land' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    const webglRenderer = new GameWebGLRenderer(null, makeTextureManager(), mapRenderer)
    const instances = webglRenderer.buildTileInstances(mapGrid, 0, 0, 3, 3, { waterOnly: true })
    const waterSotInstances = instances.filter(instance => instance.textureType === 2 && instance.clipOrientation > 0)

    expect(waterSotInstances).toHaveLength(1)
    expect(waterSotInstances[0].translation).toEqual([1, 1])
  })

  it('uses the actual canvas backing-store ratio for WebGL water placement', () => {
    const webglRenderer = new GameWebGLRenderer(null, makeTextureManager(), new MapRenderer(makeTextureManager()))
    const canvas = document.createElement('canvas')
    canvas.width = 390
    canvas.height = 844
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 390 })
    canvas.getBoundingClientRect = () => ({ width: 390, height: 844 })
    const originalDevicePixelRatio = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 3
    })

    try {
      expect(webglRenderer.getCanvasPixelRatio(canvas)).toBe(1)
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        value: originalDevicePixelRatio
      })
    }
  })

  it('does not add a legacy WebGL decal layer when the 2D map pass renders decals', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'land', decal: { tag: 'impact', variantSeed: 7 } }]
    ]

    const webglRenderer = new GameWebGLRenderer(null, makeTextureManager(), mapRenderer)
    const instances = webglRenderer.buildTileInstances(mapGrid, 0, 0, 1, 1)

    expect(instances).toHaveLength(1)
    expect(instances[0].translation).toEqual([0, 0])
    expect(instances[0].clipOrientation).toBe(0)
  })

  it('suppresses water SOT for a single land tile island inside water', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    expect(mapRenderer.sotMask[1][1]).toBeNull()
  })

  it('suppresses water SOT for islands smaller than a 3x3 cross footprint', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    expect(mapRenderer.sotMask[1][1]).toBeNull()
    expect(mapRenderer.sotMask[2][2]).toBeNull()
  })

  it('suppresses water SOT on narrow cross-shaped islands so inner land stays dominant', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'land' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'land' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    expect(mapRenderer.sotMask[1][2]).toBeNull()
    expect(mapRenderer.sotMask[2][1]).toBeNull()
    expect(mapRenderer.sotMask[2][3]).toBeNull()
    expect(mapRenderer.sotMask[3][2]).toBeNull()
  })

  it('does not add water SOT on enclosed solid land islands when no inverse corner smoothing is needed', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    expect(mapRenderer.sotMask[1][1]).toBeNull()
    expect(mapRenderer.sotMask[1][3]).toBeNull()
    expect(mapRenderer.sotMask[3][1]).toBeNull()
    expect(mapRenderer.sotMask[3][3]).toBeNull()
  })

  it('keeps water SOT for solid coastline land corners that are not enclosed islands', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'land' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'land' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'land' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'land' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    expect(mapRenderer.sotMask[1][1]).toEqual({ orientation: 'top-left', type: 'water' })
  })

  it('adds inverse land SOT on surrounding water tiles for enclosed cross-shaped islands', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'land' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'land' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    expect(mapRenderer.sotMask[1][1]).toEqual({ orientation: 'bottom-right', type: 'land' })
    expect(mapRenderer.sotMask[1][3]).toEqual({ orientation: 'bottom-left', type: 'land' })
    expect(mapRenderer.sotMask[3][1]).toEqual({ orientation: 'top-right', type: 'land' })
    expect(mapRenderer.sotMask[3][3]).toEqual({ orientation: 'top-left', type: 'land' })
  })

  it('adds inverse land SOT triangles to the WebGL batch for enclosed cross-shaped islands', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'land' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'land' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    const webglRenderer = new GameWebGLRenderer(null, makeTextureManager(), mapRenderer)
    const instances = webglRenderer.buildTileInstances(mapGrid, 0, 0, 5, 5)
    const inverseLandSotInstances = instances.filter(instance =>
      instance.clipOrientation > 0 &&
      instance.textureType === 0 &&
      JSON.stringify(instance.color) === JSON.stringify(webglRenderer.getColor('land'))
    )

    expect(inverseLandSotInstances).toHaveLength(4)
    expect(inverseLandSotInstances.map(instance => instance.translation)).toEqual(
      expect.arrayContaining([[1, 1], [3, 1], [1, 3], [3, 3]])
    )
  })

  it('does not add inverse land SOT on coastline water tiles when the land mass reaches the map edge', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'land' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'land' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    expect(mapRenderer.sotMask[1][1]).toBeNull()

    const webglRenderer = new GameWebGLRenderer(null, makeTextureManager(), mapRenderer)
    const instances = webglRenderer.buildTileInstances(mapGrid, 0, 0, 5, 5)
    const inverseLandSotInstances = instances.filter(instance =>
      instance.clipOrientation > 0 &&
      JSON.stringify(instance.color) === JSON.stringify(webglRenderer.getColor('land'))
    )

    expect(inverseLandSotInstances).toHaveLength(0)
  })

  it('adds street SOT only when land corners sit between full-eligible street tiles', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'street' }, { type: 'street' }, { type: 'street' }, { type: 'land' }],
      [{ type: 'street' }, { type: 'street' }, { type: 'street' }, { type: 'land' }],
      [{ type: 'street' }, { type: 'street' }, { type: 'land' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'land' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    expect(mapRenderer.sotMask[2][2]).toEqual({ orientation: 'top-left', type: 'street' })
  })

  it('keeps full street SOT dominant on water corners between full-eligible street tiles', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'street' }, { type: 'street' }, { type: 'street' }, { type: 'land' }],
      [{ type: 'street' }, { type: 'street' }, { type: 'street' }, { type: 'land' }],
      [{ type: 'street' }, { type: 'street' }, { type: 'water' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'land' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    expect(mapRenderer.sotMask[2][2]).toEqual({ orientation: 'top-left', type: 'street' })
  })

  it('does not add street SOT for non-full street corners', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'land' }, { type: 'street' }, { type: 'land' }],
      [{ type: 'street' }, { type: 'land' }, { type: 'land' }],
      [{ type: 'land' }, { type: 'land' }, { type: 'land' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    expect(mapRenderer.sotMask[1][1]).toBeNull()
  })

  it('adds inverse land SOT for enclosed island notch corners even when the diagonal tile is water', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'water' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    expect(mapRenderer.sotMask[2][2]).toEqual({ orientation: 'top-left', type: 'land' })

    const webglRenderer = new GameWebGLRenderer(null, makeTextureManager(), mapRenderer)
    const instances = webglRenderer.buildTileInstances(mapGrid, 0, 0, 5, 5)
    const inverseLandSotInstances = instances.filter(instance =>
      instance.clipOrientation > 0 &&
      JSON.stringify(instance.color) === JSON.stringify(webglRenderer.getColor('land'))
    )

    expect(inverseLandSotInstances.map(instance => instance.translation)).toEqual(
      expect.arrayContaining([[2, 2]])
    )
  })

  it('adds inverse land SOT for enclosed island diagonal shoulder corners', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'land' }, { type: 'land' }, { type: 'land' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }, { type: 'water' }]
    ]

    mapRenderer.computeSOTMask(mapGrid)

    expect(mapRenderer.sotMask[1][1]).toEqual({ orientation: 'bottom-right', type: 'land' })
    expect(mapRenderer.sotMask[2][1]).toEqual({ orientation: 'top-right', type: 'land' })

    const webglRenderer = new GameWebGLRenderer(null, makeTextureManager(), mapRenderer)
    const instances = webglRenderer.buildTileInstances(mapGrid, 0, 0, 6, 5)
    const inverseLandSotInstances = instances.filter(instance =>
      instance.clipOrientation > 0 &&
      JSON.stringify(instance.color) === JSON.stringify(webglRenderer.getColor('land'))
    )

    expect(inverseLandSotInstances.map(instance => instance.translation)).toEqual(
      expect.arrayContaining([[1, 1], [1, 2]])
    )
  })
})
