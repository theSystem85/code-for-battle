import { describe, expect, it } from 'vitest'
import { expandCompactSpriteSheetMetadata } from '../../src/utils/spriteSheetMetadata.js'

describe('spriteSheetMetadata', () => {
  it('expands deduped compact entries with logical tile coordinates and shared source rects', () => {
    const metadata = expandCompactSpriteSheetMetadata({
      schemaVersion: 2,
      tileSize: 64,
      rowHeight: 64,
      borderWidth: 0,
      tags: ['rocks', 'group_7'],
      hashes: ['hash-a'],
      tileEntries: [
        [0, 0, [0, 1], 0],
        [1, 0, [0, 1], 0, 0, 0]
      ]
    })

    expect(metadata.tiles['0,0']).toMatchObject({
      col: 0,
      row: 0,
      sourceCol: 0,
      sourceRow: 0,
      hash: 'hash-a',
      rect: { x: 0, y: 0, width: 64, height: 64 },
      tags: ['rocks', 'group_7']
    })
    expect(metadata.tiles['1,0']).toMatchObject({
      col: 1,
      row: 0,
      sourceCol: 0,
      sourceRow: 0,
      hash: 'hash-a',
      rect: { x: 0, y: 0, width: 64, height: 64 },
      tags: ['rocks', 'group_7']
    })
  })
})
