import { describe, expect, it } from 'vitest'
import { ShoreDepthField, shoreOpacity } from '../../src/rendering/prepared/shoreDepthField.js'
import { GameWebGLRenderer } from '../../src/rendering/webglRenderer.js'

function straightCoast(width = 12, height = 8) {
  return Array.from({ length: height }, () => Array.from({ length: width }, (_, x) => ({ type: x < 2 ? 'land' : 'water' })))
}

describe('prepared coastal depth', () => {
  it('[U05410] fades continuously from transparent shore to opaque water at five tiles', () => {
    const field = new ShoreDepthField()
    field.prepare(straightCoast())
    for (let tile = 0; tile < 6; tile++) {
      const corners = field.corners(tile + 2, 3)
      for (const u of [0, 0.25, 0.5, 0.75, 1]) {
        expect(shoreOpacity(corners, u, 0.5)).toBeCloseTo(Math.min(1, (tile + u) / 5))
      }
      expect(shoreOpacity(corners, 1, 0.5)).toBeCloseTo(shoreOpacity(field.corners(tile + 3, 3), 0, 0.5))
    }
  })

  it('[U05407] handles diagonal islands, narrow channels and open map edges', () => {
    const map = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ type: 'water' })))
    const field = new ShoreDepthField()
    field.prepare(map)
    expect(field.at(0, 0)).toBe(5)
    map[5][5].type = 'land'
    field.prepare(map, 1)
    expect(field.at(6, 6)).toBe(0)
    expect(field.at(7, 7)).toBeCloseTo(Math.SQRT2)
    expect(field.at(11, 5)).toBe(5)
    map[5][8].type = 'rock'
    field.prepare(map, 2)
    expect(field.at(7, 5)).toBe(1)
  })

  it('[U05408] retains its buffer until map dimensions change and invalidates edited depths', () => {
    const map = straightCoast()
    const field = new ShoreDepthField()
    field.prepare(map, 1)
    const values = field.values
    expect(field.at(5, 3)).toBe(3)
    expect(field.prepare(map, 1)).toBe(false)
    expect(field.values).toBe(values)
    map[3][4].type = 'land'
    field.prepare(map, 2)
    expect(field.values).toBe(values)
    expect(field.at(5, 3)).toBe(0)
  })

  it('[U05409] rebuilds the five-tile halo across water chunk boundaries after a coastline edit', () => {
    const map = Array.from({ length: 32 }, () => Array.from({ length: 48 }, () => ({ type: 'water' })))
    const mapRenderer = { sotMask: [], sotMaskVersion: 1, computeSOTMask() {} }
    const renderer = new GameWebGLRenderer(null, {}, mapRenderer)
    const topology = renderer.prepareRetainedWaterTopology(map, { topologyRevision: 1 })
    const data = topology.data
    map[8][14].type = 'land'
    renderer.prepareRetainedWaterTopology(map, {
      topologyRevision: 2,
      changedTopologyRanges: [{ left: 14, top: 8, right: 15, bottom: 9 }]
    })
    expect(topology.dirtyChunks).toContain(1)
    expect(topology.dirtyChunks).not.toContain(2)
    expect(topology.data).toBe(data)
    expect(renderer.shoreDepth.at(17, 8)).toBe(2)
  })
})
