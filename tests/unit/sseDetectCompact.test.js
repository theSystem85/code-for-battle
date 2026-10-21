import { describe, it, expect } from 'vitest'
import { isolateComponent, hasTransparency } from '../../src/ui/sseIsolate.js'
import { detectSprites } from '../../src/ui/sseDetect.js'
import { compactSprites } from '../../src/ui/ssePack.js'

describe('extract-all detection', () => {
  it('[U04171] finds blobs, bridges tiny gaps, preserves holes and ignores black, transparent and tiny noise', () => {
    const image = { width: 24, height: 16, data: new Uint8ClampedArray(24 * 16 * 4) }
    const dot = (x, y, value = 255, alpha = 255) => image.data.set([value, 0, 0, alpha], (y * 24 + x) * 4)
    for (const [x, y] of [[1, 1], [2, 1], [4, 1], [4, 2], [12, 3], [13, 3], [12, 4], [20, 12]]) dot(x, y)
    dot(7, 12, 16)
    dot(8, 12, 255, 0)
    const result = detectSprites(image)
    expect(result.map(item => item.area)).toEqual([4, 3])
    expect(result[0].bbox).toEqual({ x: 1, y: 1, width: 4, height: 2 })
    expect(result[0].pixels[2 * 4 + 3]).toBe(0)
    expect(detectSprites(image, { gap: 0 })).toHaveLength(3)
    expect(detectSprites(image, { minArea: 4 })).toHaveLength(1)
    expect(() => detectSprites(image, { cutoff: -1 })).toThrow()
    expect(() => detectSprites(image, { gap: 99 })).toThrow()
  })
})

describe('compaction', () => {
  it('[U04172] packs in reading order into first free whole-tile slots without overlaps or input mutation', () => {
    const sprites = [
      { id: 'last', placedAt: { column: 0, row: 5 }, tileSpan: { columns: 2, rows: 2 } },
      { id: 'second', placedAt: { column: 2, row: 2 }, tileSpan: { columns: 1, rows: 1 } },
      { id: 'first', placedAt: { column: 0, row: 2 }, tileSpan: { columns: 2, rows: 1 } }
    ]
    const before = JSON.stringify(sprites)
    const result = compactSprites(sprites, { columns: 3, rows: 7, tileSize: 16, rowHeight: 24, borderWidth: 1, occupied: new Set(['0,0']) })
    expect(result.placements.map(item => item.id)).toEqual(['first', 'second', 'last'])
    expect(result.placements.map(item => item.placedAt)).toEqual([
      { column: 1, row: 0 }, { column: 0, row: 1 }, { column: 1, row: 1 }
    ])
    const cells = new Set(['0,0'])
    for (const sprite of result.placements) {
      expect(Number.isInteger(sprite.placedAt.column)).toBe(true)
      expect(Number.isInteger(sprite.placedAt.row)).toBe(true)
      for (let y = 0; y < sprite.tileSpan.rows; y++) {
        for (let x = 0; x < sprite.tileSpan.columns; x++) {
          const key = `${sprite.placedAt.column + x},${sprite.placedAt.row + y}`
          expect(cells.has(key)).toBe(false)
          cells.add(key)
        }
      }
    }
    expect(result.occupied).toEqual(cells)
    expect(JSON.stringify(sprites)).toBe(before)
  })
})


it('[U05435] follows alpha contours including diagonal black edges and preserves holes and semitransparent pixels', () => {
  const image = { width: 12, height: 8, data: new Uint8ClampedArray(12 * 8 * 4) }
  for (const [x, y, alpha] of [[1, 1, 255], [2, 1, 255], [3, 1, 255], [1, 2, 255], [3, 2, 255], [1, 3, 255], [2, 3, 255], [3, 3, 255], [4, 4, 90], [9, 1, 255], [9, 2, 255]]) {
    image.data.set([0, 0, 0, alpha], (y * image.width + x) * 4)
  }
  expect(hasTransparency(image)).toBe(true)
  const options = { transparent: true, gap: 0, innerCuts: true }
  const components = detectSprites(image, options)
  const clicked = isolateComponent(image, 1, 1, 16, options)
  expect(components).toHaveLength(2)
  expect(clicked).toEqual(components[0])
  expect(clicked.bbox).toEqual({ x: 1, y: 1, width: 4, height: 4 })
  expect(clicked.innerCuts).toBe(false)
  expect(clicked.pixels[(1 * 4 + 1) * 4 + 3]).toBe(0)
  expect(clicked.pixels[(3 * 4 + 3) * 4 + 3]).toBe(90)
  expect(detectSprites(image, { ...options, alphaCutoff: 100 })[0].bbox.width).toBe(3)
  expect(() => detectSprites(image, { ...options, alphaCutoff: 255 })).toThrow()
  expect(() => isolateComponent(image, 1, 1, 16, { ...options, gap: -1 })).toThrow()
})
