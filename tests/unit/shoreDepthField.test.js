import { describe, expect, it, vi } from 'vitest'
import { ShoreDepthField, shoreOpacity } from '../../src/rendering/prepared/shoreDepthField.js'
import { CoastalWaterStyles } from '../../src/rendering/prepared/coastalWaterStyles.js'
import { GameWebGLRenderer } from '../../src/rendering/webglRenderer.js'
import { setCoastalShallowsLength, COASTAL_SHALLOWS_LENGTH } from '../../src/config.js'

function straightCoast(width = 12, height = 8) {
  return Array.from({ length: height }, () => Array.from({ length: width }, (_, x) => ({ type: x < 2 ? 'land' : 'water' })))
}

describe('prepared coastal depth', () => {
  it.each([
    { type: 'street' },
    { type: 'street', airstripStreet: true },
    { type: 'land', airstripStreet: true },
    { type: 'water', airstripStreet: true }
  ])('[U05416] keeps water beside paved coasts opaque: %j', pavement => {
    const map = Array.from({ length: 8 }, () => Array.from({ length: 12 }, () => ({ type: 'water' })))
    map[3][3] = pavement
    const field = new ShoreDepthField()
    field.prepare(map)
    expect(field.at(4, 3)).toBe(field.maxTiles)
    expect(shoreOpacity(field.corners(4, 3), 0, 0.5)).toBe(1)
    // Natural coast still contributes sand; paving it invalidates the depth.
    map[3][6] = { type: 'land' }
    field.prepare(map, 1)
    expect(field.at(6, 3)).toBe(0)
    map[3][6] = pavement
    field.prepare(map, 2)
    expect(field.at(6, 3)).toBe(field.maxTiles)
  })

  it('[U05417] keeps paved water underlays opaque even beside a natural sandy coast', () => {
    const map = straightCoast()
    map[3][2] = { type: 'street' }
    map[4][2] = { type: 'land', airstripStreet: true }
    const field = new ShoreDepthField()
    field.prepare(map)
    for (const y of [3, 4]) {
      expect(field.corners(2, y)).toEqual([5, 5, 5, 5])
      expect(shoreOpacity(field.corners(2, y), 0, 0)).toBe(1)
    }
    expect(shoreOpacity(field.corners(2, 2), 0, 0)).toBe(0)
  })

  it('[U05418] omits sand patterns for paved SOT hosts in the Canvas fallback', () => {
    const field = new ShoreDepthField()
    field.prepare([[{ type: 'street' }, { type: 'land', airstripStreet: true }]])
    const corners = vi.spyOn(field, 'corners')
    const ctx = { createPattern: vi.fn() }
    const palette = Object.fromEntries(['deep', 'band', 'column', 'bright', 'shimmer'].map(layer => [layer, 'rgb(0, 50, 100)']))
    const styles = new CoastalWaterStyles()
    styles.prepare(ctx, field, palette, 32, 1, [[{ type: 'water' }, { type: 'water' }]])
    expect(corners).not.toHaveBeenCalled()
    expect(ctx.createPattern).not.toHaveBeenCalled()
    expect(styles.tiles.size).toBe(0)
    expect(styles.bytes).toBe(0)
  })

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

  it('[U05414] supports adjustable gradient length and custom maxTiles', () => {
    const field = new ShoreDepthField(10)
    field.prepare(straightCoast(16, 8))
    expect(field.at(10, 3)).toBe(8)
    const corners = field.corners(5, 3)
    expect(shoreOpacity(corners, 0, 0, 3)).toBe(1)
    expect(shoreOpacity(corners, 0, 0, 8)).toBeCloseTo(3 / 8)
  })

  it('[U05415] updates coastal shallows gradient length within valid range', () => {
    expect(setCoastalShallowsLength(75)).toBe(75)
    expect(COASTAL_SHALLOWS_LENGTH).toBe(75)
    expect(setCoastalShallowsLength(5)).toBe(10)
    expect(setCoastalShallowsLength(150)).toBe(100)
    setCoastalShallowsLength(20)
  })
})
