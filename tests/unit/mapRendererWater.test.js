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
})
