import { describe, it, expect, vi } from 'vitest'
import { MapRenderer } from '../../src/rendering/mapRenderer.js'
import { GameWebGLRenderer } from '../../src/rendering/webglRenderer.js'

describe('MapRenderer water rendering', () => {
  const makeTextureManager = () => ({
    integratedSpriteSheetMode: false,
    tileTextureCache: { land: [] },
    waterFrames: [{ id: 'legacy-water-frame' }],
    getTileVariation: () => 0,
    integratedRenderSignature: 'sig'
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

  it('builds shoreline mesh strips for land-water borders including chunk boundaries', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }]
    ]

    const shorelineMesh = mapRenderer.computeShorelineMeshForChunk(mapGrid, 1, 1, 3, 3)

    // Two top edges + two left edges for the 2x2 land block touching water
    expect(shorelineMesh).toHaveLength(4)
    shorelineMesh.forEach(segment => {
      expect(segment.triangles).toHaveLength(2)
      expect(segment.edgeLine).toHaveLength(2)
    })
  })

  it('reuses shoreline chunk mesh when nearby terrain signature is unchanged', () => {
    const mapRenderer = new MapRenderer(makeTextureManager())
    const mapGrid = [
      [{ type: 'water' }, { type: 'water' }, { type: 'water' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }],
      [{ type: 'water' }, { type: 'land' }, { type: 'land' }]
    ]
    const chunk = {
      startX: 1,
      startY: 1,
      endX: 3,
      endY: 3,
      shorelineSignature: null,
      shorelineMesh: null
    }

    mapRenderer.updateShorelineChunkCache(chunk, mapGrid)
    const firstMesh = chunk.shorelineMesh
    const firstSignature = chunk.shorelineSignature

    mapRenderer.updateShorelineChunkCache(chunk, mapGrid)

    expect(chunk.shorelineSignature).toBe(firstSignature)
    expect(chunk.shorelineMesh).toBe(firstMesh)
  })
})
