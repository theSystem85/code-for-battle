import { fitSprite, resetSourceImports } from '../../src/ui/sseFit.js'
import { getNavigationShellPath } from '../../src/pwa/navigationFallback.js'
import { describe, it, expect } from 'vitest'
import { isolateComponent } from '../../src/ui/sseIsolate.js'
import { findPackingRegion, validateGrid } from '../../src/ui/ssePack.js'

function image() {
  const data = new Uint8ClampedArray(12 * 8 * 4)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  const pixel = (x, y, color) => data.set(color, (y * 12 + x) * 4)
  for (let y = 1; y < 4; y++) {
    for (let x = 1; x < 5; x++) pixel(x, y, [255, 0, 0, 255])
  }
  pixel(2, 2, [0, 0, 0, 255]) // Black pixel enclosed by the component: kept as sprite detail.
  pixel(8, 5, [0, 255, 0, 255])
  pixel(9, 5, [0, 255, 0, 255])
  pixel(0, 7, [16, 16, 16, 255])
  pixel(1, 7, [255, 255, 255, 0])
  return { width: 12, height: 8, data }
}

describe('SSE connected-component isolation', () => {
  it('crops only the clicked component and keeps enclosed black pixels opaque', () => {
    const result = isolateComponent(image(), 1, 1)
    expect(result.bbox).toEqual({ x: 1, y: 1, width: 4, height: 3 })
    expect(result.area).toBe(11)
    expect(result.holes).toBe(1)
    expect([...result.pixels.slice((1 * 4 + 1) * 4, (1 * 4 + 1) * 4 + 4)]).toEqual([0, 0, 0, 255])
    expect(isolateComponent(image(), 8, 5).area).toBe(2)
  })
  it('rejects background, transparent pixels and out-of-bounds clicks', () => {
    for (const [x, y] of [[0, 0], [-1, 1], [12, 2], [1, 7], [NaN, 0]]) {
      expect(isolateComponent(image(), x, y)).toBeNull()
    }
  })
  it('uses an inclusive near-black cutoff and validates thresholds', () => {
    expect(isolateComponent(image(), 0, 7, 16)).toBeNull()
    expect(isolateComponent(image(), 0, 7, 15).area).toBe(1)
    expect(() => isolateComponent(image(), 1, 1, -1)).toThrow()
    expect(() => isolateComponent(image(), 1, 1, NaN)).toThrow()
  })
})

describe('SSE grid packing', () => {
  const grid = { columns: 3, rows: 2, tileSize: 16, rowHeight: 24, borderWidth: 1, occupied: new Set(['0,0', '1,0']) }
  it('scans row-major, respecting occupancy and rectangular cells', () => {
    expect(findPackingRegion({ ...grid, width: 14, height: 22 })).toEqual({ x: 2, y: 0, spanX: 1, spanY: 1, rows: 2 })
    expect(findPackingRegion({ ...grid, width: 20, height: 30 })).toEqual({ x: 0, y: 1, spanX: 2, spanY: 2, rows: 3 })
    expect(grid.occupied.size).toBe(2)
  })
  it('grows by whole rows when the existing grid is full', () => {
    const occupied = new Set(['0,0', '1,0', '2,0', '0,1', '1,1', '2,1'])
    expect(findPackingRegion({ ...grid, occupied, width: 30, height: 22 })).toEqual({ x: 0, y: 2, spanX: 2, spanY: 1, rows: 3 })
  })
  it('rejects excessive width and invalid or excessive grids without mutating occupancy', () => {
    expect(() => findPackingRegion({ ...grid, width: 48, height: 1 })).toThrow('wider')
    expect(() => validateGrid({ ...grid, borderWidth: 8 })).toThrow()
    expect(() => validateGrid({ ...grid, columns: 100000 })).toThrow()
    expect(() => findPackingRegion({ ...grid, width: NaN, height: 1 })).toThrow()
  })
})

describe('SSE document fallback', () => {
  it('preserves the editor shell on pretty, trailing-slash and direct HTML routes', () => {
    for (const path of ['/sse', '/sse/', '/sse.html', '/sse?test=1']) {
      expect(getNavigationShellPath(path)).toBe('/sse.html')
    }
    expect(getNavigationShellPath('/')).toBe('/index.html')
    expect(getNavigationShellPath('/sse-other')).toBe('/index.html')
  })
})

describe('SSE reserved-area fitting', () => {
  it('contains wide and tall sprites without overflow or changing aspect', () => {
    expect(fitSprite(100, 50, 32, 32)).toEqual({ x: 0, y: 8, width: 32, height: 16 })
    expect(fitSprite(50, 100, 32, 32)).toEqual({ x: 8, y: 0, width: 16, height: 32 })
    expect(fitSprite(8, 4, 32, 32)).toEqual({ x: 12, y: 14, width: 8, height: 4 })
  })
  it('supports every anchor and explicit stretch', () => {
    for (const [anchor, x, y] of [['top-left', 0, 0], ['top-right', 24, 0], ['bottom-left', 0, 28], ['bottom-right', 24, 28]]) {
      expect(fitSprite(8, 4, 32, 32, anchor)).toEqual({ x, y, width: 8, height: 4 })
    }
    expect(fitSprite(8, 4, 32, 32, 'stretch')).toEqual({ x: 0, y: 0, width: 32, height: 32 })
    expect(() => fitSprite(0, 1, 32, 32)).toThrow()
    expect(() => fitSprite(1, 1, 32, 32, 'invalid')).toThrow()
  })
  it('clears duplicate mappings in place so overlays and imports can reset', () => {
    const source = { isolated: new Set(['sprite']), masks: new Map([['sprite', {}]]) }
    const { isolated, masks } = source
    resetSourceImports(source)
    expect(source.isolated).toBe(isolated)
    expect(source.masks).toBe(masks)
    expect(isolated.size).toBe(0)
    expect(masks.size).toBe(0)
    resetSourceImports(null)
  })
})
