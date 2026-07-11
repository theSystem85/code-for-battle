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
})
