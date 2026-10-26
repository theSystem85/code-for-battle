import { mkdtemp, writeFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverBundledSheets } from '../../scripts/build-map-sprite-tiers.mjs'
import { collectGroups, metadataSignature, packShelf } from '../../scripts/lib/mapSpriteBuild/catalog.mjs'
import { applyDecorationCutout, applySheetPixelRules } from '../../scripts/lib/mapSpriteBuild/pixelRules.mjs'

describe('S01 prepared map sprite build', () => {
  it('[U06174] auto-discovers sorted WebP and JSON pairs and rejects incomplete pairs', async() => {
    const directory = await mkdtemp(join(tmpdir(), 'map-sprite-pairs-'))
    await Promise.all(['z.webp', 'z.json', 'a.webp', 'a.json'].map(name => writeFile(join(directory, name), 'fixture')))
    await expect(discoverBundledSheets(directory)).resolves.toMatchObject([{ name: 'a' }, { name: 'z' }])
    await writeFile(join(directory, 'orphan.webp'), 'fixture')
    await expect(discoverBundledSheets(directory)).rejects.toThrow('Missing image/metadata pair: orphan')
  })

  it('[U06175] groups contiguous sheet cells without exposing inner seams', () => {
    const metadata = { tiles: {
      '0,0': { rect: { x: 0, y: 0, width: 64, height: 64 }, tags: ['group_2', 'grass'] },
      '1,0': { rect: { x: 64, y: 0, width: 64, height: 64 }, tags: ['group_2', 'inner_cuts'] }
    } }
    const [group] = collectGroups(metadata)
    expect(group).toMatchObject({ id: 'group_2', rect: { x: 0, y: 0, width: 128, height: 64 }, tags: ['grass', 'group_2', 'inner_cuts'] })
    expect(packShelf([{ id: group.id, width: 64, height: 32 }], 2)).toMatchObject({
      width: 68, height: 36, placements: [{ x: 2, y: 2, width: 64, height: 32 }]
    })
  })

  it('[U06176] preserves enclosed dark pixels unless inner cuts explicitly key them', () => {
    const width = 7; const height = 7
    const createPixels = () => {
      const pixels = Buffer.alloc(width * height * 4, 255)
      for (let index = 0; index < width * height; index++) pixels[index * 4 + 3] = 255
      const black = (x, y) => { const offset = ((y * width) + x) * 4; pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0 }
      for (let x = 0; x < width; x++) { black(x, 0); black(x, height - 1) }
      for (let y = 0; y < height; y++) { black(0, y); black(width - 1, y) }
      black(3, 3)
      return pixels
    }
    const metadata = { blendMode: 'black', tiles: { '0,0': { col: 0, row: 0, rect: { x: 0, y: 0, width, height }, tags: [] } } }
    const enclosed = createPixels()
    applySheetPixelRules(enclosed, width, height, metadata)
    expect(enclosed[((3 * width) + 3) * 4 + 3]).toBe(255)
    const cut = createPixels()
    metadata.tiles['0,0'].tags = ['inner_cuts']
    applySheetPixelRules(cut, width, height, metadata)
    expect(cut[((3 * width) + 3) * 4 + 3]).toBe(0)
  })

  it('[U06177] applies deterministic cutout coverage and metadata signatures', () => {
    const pixels = Buffer.alloc(8 * 8 * 4)
    for (let index = 0; index < 64; index++) {
      pixels[index * 4] = 100; pixels[index * 4 + 1] = 110; pixels[index * 4 + 2] = 90; pixels[index * 4 + 3] = 255
    }
    const first = applyDecorationCutout(Buffer.from(pixels), 8, 8, { cellSize: 8, innerCuts: true })
    const second = applyDecorationCutout(Buffer.from(pixels), 8, 8, { cellSize: 8, innerCuts: true })
    expect(first).toEqual(second)
    expect(first.coverage).toBe(0)
    expect(metadataSignature({ mixed: ['snow', 'sand', 'grass'], version: 1 })).toBe(metadataSignature({ version: 1, mixed: ['snow', 'sand', 'grass'] }))
  })
})
