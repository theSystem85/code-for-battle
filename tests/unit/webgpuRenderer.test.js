import { describe, expect, it } from 'vitest'
import { GameWebGPURenderer } from '../../src/rendering/webgpuRenderer.js'

describe('GameWebGPURenderer', () => {
  it('packs the WebGL-compatible tile instance layout for WebGPU instancing', () => {
    const renderer = new GameWebGPURenderer({}, null)
    const packed = renderer.packInstances([{
      translation: [2, 3],
      uvRect: [0.1, 0.2, 0.3, 0.4],
      color: [1, 0.5, 0.25, 1],
      textureType: 2,
      waterEdges: [1, 0, 1, 0],
      clipOrientation: 3,
      textureSource: 1
    }])

    expect(packed).toHaveLength(17)
    expect([...packed.slice(0, 2)]).toEqual([2, 3])
    expect([...packed.slice(2, 6)]).toEqual(expect.arrayContaining([
      expect.closeTo(0.1), expect.closeTo(0.2), expect.closeTo(0.3), expect.closeTo(0.4)
    ]))
    expect([...packed.slice(10)]).toEqual([2, 1, 0, 1, 0, 3, 1])
  })

  it('returns the fallback signal while WebGPU is unavailable', () => {
    const renderer = new GameWebGPURenderer({}, null)
    renderer.status = 'failed'

    expect(renderer.render([[{ type: 'land' }]], { x: 0, y: 0 }, {}, {})).toBe(false)
  })

  it('builds instances for every terrain asset class', () => {
    const textureManager = {
      allTexturesLoaded: true,
      tileTextureCache: {
        land: [{ x: 0, y: 0, width: 32, height: 32 }],
        rock: [{ x: 32, y: 0, width: 32, height: 32 }]
      },
      getTileVariation: () => 0,
      selectStreetTileByTags: () => ({ image: streetAtlas, rect: { x: 0, y: 0, width: 32, height: 32 } })
    }
    const streetAtlas = {}
    const renderer = new GameWebGPURenderer(textureManager, null)
    renderer.atlasSize = { width: 64, height: 32 }
    renderer.secondaryAtlasSize = { width: 32, height: 32 }
    renderer.secondaryAtlasImage = streetAtlas

    const instances = renderer.buildTileInstances([[
      { type: 'land' },
      { type: 'rock' },
      { type: 'water' },
      { type: 'street' }
    ]], 0, 0, 4, 1)
    const counts = renderer.countInstances(instances)

    expect(counts.primaryAtlas).toBeGreaterThanOrEqual(2)
    expect(counts.water).toBe(1)
    expect(counts.secondaryAtlas).toBe(1)
  })

  it('does not activate WebGPU until a submitted frame validates', () => {
    const renderer = new GameWebGPURenderer({}, null)
    renderer.validationPending = true

    expect(renderer.validationComplete).toBe(false)
    expect(renderer.getStatus()).toMatchObject({ validationPending: true, validationComplete: false })
  })

  it('schedules only one completion check for a pending validation frame', () => {
    let completionChecks = 0
    const renderer = new GameWebGPURenderer({}, null)
    renderer.validationPending = true
    renderer.device = {
      queue: {
        onSubmittedWorkDone: () => {
          completionChecks += 1
          return new Promise(() => {})
        }
      }
    }

    renderer.finishFrameValidation()
    renderer.finishFrameValidation()

    expect(completionChecks).toBe(1)
  })
})
