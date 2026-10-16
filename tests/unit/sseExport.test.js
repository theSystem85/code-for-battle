import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { clearTargetTiles, compressionLabel, detectWebPCompression, encodeLosslessWebP, exportMetadata, exportOptions } from '../../src/ui/sseExport.js'

describe('SSE exports', () => {
  it('defaults to true lossless WebP and round-trips exact RGBA pixels', async() => {
    expect(exportOptions()).toEqual({ lossless: true })
    const data = new Uint8Array(17 * 9 * 4)
    for (let i = 0; i < data.length; i++) data[i] = (i * 71) % 256
    const encoded = encodeLosslessWebP({ width: 17, height: 9, data })
    expect(detectWebPCompression(encoded.buffer)).toEqual({ lossless: true })
    const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer()
    expect([...decoded]).toEqual([...data])
  })
  it('exports grid, tile and pixel rectangles, tags and compression', () => {
    const metadata = exportMetadata({ tileSize: 16, rowHeight: 24, columns: 2, rows: 3, tiles: { '1,2': { tags: ['rock'] } } }, 'rocks')
    expect(metadata.compression).toEqual({ lossless: true })
    expect(metadata.sprites[0]).toEqual({ tiles: { col: 1, row: 2, cols: 1, rows: 1 }, px: { x: 16, y: 48, width: 16, height: 24 }, tags: ['rock'] })
    expect(exportOptions({ lossless: false, quality: 42 })).toEqual({ lossless: false, quality: 42 })
    expect(() => exportOptions({ quality: 101 })).toThrow()
    expect(compressionLabel({ lossless: false })).toBe('unknown')
    expect(compressionLabel({ lossless: false, quality: 42 })).toBe('lossy 42%')
  })
})

describe('SSE clearing', () => {
  function fixture() {
    const pixels = new Uint8Array(16 * 8 * 4).fill(255)
    const context = {
      save() {}, restore() {},
      fillRect(x, y, width, height) {
        for (let row = y; row < y + height; row++) {
          for (let col = x; col < x + width; col++) pixels.set([0, 0, 0, 255], (row * 16 + col) * 4)
        }
      }
    }
    return { pixels, target: { image: { getContext: () => context }, tileSize: 8, rowHeight: 8, columns: 2, rows: 1, occupied: new Set(['0,0', '1,0']), data: { tiles: { '0,0': { tags: ['rock'] }, '1,0': { tags: ['tree'] } } }, imports: [{ placedAt: { column: 0, row: 0 }, tileSpan: { columns: 2, rows: 1 } }] } }
  }
  it('overdraws the entire tile and removes intersecting sprite records and occupancy', () => {
    const { pixels, target } = fixture()
    clearTargetTiles(target, [{ col: 0, row: 0 }, { col: 0, row: 0 }])
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 16; col++) expect([...pixels.subarray((row * 16 + col) * 4, (row * 16 + col + 1) * 4)]).toEqual(col < 8 ? [0, 0, 0, 255] : [255, 255, 255, 255])
    }
    expect(target.imports).toEqual([])
    expect([...target.occupied]).toEqual(['1,0'])
    expect(target.data.tiles).toEqual({ '1,0': { tags: ['tree'] } })
  })
  it('validates all coordinates before modifying any pixels or metadata', () => {
    const { pixels, target } = fixture()
    expect(() => clearTargetTiles(target, [{ col: 0, row: 0 }, { col: 2, row: 0 }])).toThrow()
    expect([...pixels].every(value => value === 255)).toBe(true)
    expect(target.occupied.size).toBe(2)
  })
})

describe('SSE fitted placement metadata', () => {
  it('exports fitted coordinates and merges sprite and tile tags after shrinking', () => {
    const result = exportMetadata({ tileSize: 16, rowHeight: 16, tiles: { '1,2': { tags: ['forest'] } },
      extension: { imports: [{ id: 'sprite-1', anchor: 'bottom-right', bbox: { width: 100, height: 50 },
        placedAt: { column: 1, row: 2 }, tileSpan: { columns: 1, rows: 1 },
        renderRect: { x: 0, y: 8, width: 16, height: 8 }, tags: ['tree', 'forest'] }] } }, 'trees')
    expect(result.sprites.find(sprite => sprite.id === 'sprite-1')).toEqual({
      id: 'sprite-1', anchor: 'bottom-right', tiles: { col: 1, row: 2, cols: 1, rows: 1 },
      px: { x: 16, y: 40, width: 16, height: 8 }, tags: ['tree', 'forest']
    })
  })
})
