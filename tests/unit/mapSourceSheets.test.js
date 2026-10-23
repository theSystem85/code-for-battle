import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { describe, it, expect } from 'vitest'
import { SOURCE_PROFILES, DETECTION_OPTIONS, extractMapSource, MAP_SHEET_QUALITY } from '../../scripts/build-map-sprite-sheets.mjs'
import { detectSprites } from '../../src/ui/sseDetect.js'
import { detectWebPCompression } from '../../src/ui/sseExport.js'
import { DEFAULT_SSE_SHEETS } from '../../src/ui/spriteSheetRegistry.js'
import { buildDecorationPools } from '../../src/rendering/decorationLayout.js'

const counts = [...Array(9).fill(20), 155, 118]

describe('bundled map source sheets', () => {
  it.each(SOURCE_PROFILES.map((profile, index) => ({ ...profile, count: profile.expectedSprites || counts[index] })))('[U05433] replays SSE extraction and validates $source ownership, metadata and recorded-scale alpha WebP', async(profile) => {
    const directory = 'public/images/map/sprite_sheets'
    const source = await readFile(`${directory}/sources/${profile.source}.webp`)
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const image = { width: info.width, height: info.height, data }
    const components = extractMapSource(image, profile)
    expect(components).toHaveLength(profile.count)
    // A zero cutoff joins this noisy source into a giant component. The
    // recorded settings must actually separate useful individual props.
    if (profile.kind === 'nature') expect(Math.max(...detectSprites(image, { transparent: true, minArea: 256 }).map(c => c.area))).toBeGreaterThan(900000)
    const seen = new Uint8Array(info.width * info.height)
    let duplicatePixels = 0, belowCutoff = 0
    for (const component of components) {
      const b = component.bbox
      expect(b.width).toBeLessThan(info.width / 2)
      expect(b.height).toBeLessThan(info.height / 2)
      for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
        const alpha = component.pixels[(y * b.width + x) * 4 + 3]
        if (!alpha) continue
        if (alpha <= (profile.detection || DETECTION_OPTIONS).alphaCutoff) belowCutoff++
        const offset = (b.y + y) * info.width + b.x + x
        if (seen[offset]) duplicatePixels++
        seen[offset] = 1
      }
    }
    expect(duplicatePixels).toBe(0)
    expect(belowCutoff).toBe(0)
    const metadata = JSON.parse(await readFile(`${directory}/${profile.name}.json`, 'utf8'))
    expect(DEFAULT_SSE_SHEETS).toContain(metadata.sheetPath)
    expect(metadata.source.sha256).toBe(createHash('sha256').update(source).digest('hex'))
    expect(metadata.source.detection).toEqual(profile.detection || DETECTION_OPTIONS)
    expect(metadata.layoutVersion).toBe(profile.layoutVersion || 3)
    expect(metadata.extension.imports.map(item => item.bbox)).toEqual(components.map(c => c.bbox))
    expect(metadata.propLayout).toHaveLength(components.length)
    expect(metadata.compression).toEqual({ lossless: false, quality: MAP_SHEET_QUALITY })
    expect(metadata.blendMode).toBe('alpha')
    const occupied = new Set()
    const groups = []
    for (const prop of metadata.propLayout) {
      expect(prop.tags).toEqual(expect.arrayContaining([...(profile.props?.[prop.groupId - 1]?.biomes || profile.biomes), 'decorative', `group_${prop.groupId}`]))
      if (profile.cityOverhangs) {
        expect(prop.footprint.width).toBeGreaterThanOrEqual(prop.tags.includes('skyscraper') ? 3 : 2)
        expect(prop.footprint.height).toBeGreaterThanOrEqual(prop.tags.includes('skyscraper') ? 3 : profile.densityLevel === 'low' && prop.density === 1 ? 1 : 2)
        expect(prop.footprint.y).toBeGreaterThanOrEqual(profile.densityLevel === 'low' ? 0 : 1)
        expect(prop.tags).toContain(`density_${prop.density}`)
        expect(prop.density).toBeGreaterThanOrEqual(1)
        expect(prop.density).toBeLessThanOrEqual(10)
        if (profile.seasons) expect(prop.tags).toEqual(expect.arrayContaining(profile.seasons))
      }
      if (prop.tags.includes('stones')) expect(prop.tags).toContain('rocks')
      expect(prop.tags.includes('passable') !== prop.tags.includes('impassable')).toBe(true)
      const tilesByOffset = {}
      for (let dy = 0; dy < prop.h; dy++) for (let dx = 0; dx < prop.w; dx++) {
        const key = `${prop.col + dx},${prop.row + dy}`
        expect(occupied.has(key)).toBe(false)
        occupied.add(key)
        const tileTags = metadata.tiles[key].tags
        if (prop.footprint && dy < prop.footprint.y) {
          expect(tileTags).toEqual(expect.arrayContaining([...profile.biomes, ...(profile.seasons || []), 'passable', 'overhang', 'city']))
          expect(tileTags).not.toContain('impassable')
        } else expect(tileTags).toEqual(prop.tags)
        tilesByOffset[`${dx},${dy}`] = metadata.tiles[key]
      }
      groups.push({ width: prop.w, height: prop.h, tilesByOffset, tagSet: new Set(prop.tags) })
    }
    expect(occupied.size).toBe(Object.keys(metadata.tiles).length)
    const pools = buildDecorationPools(groups)
    for (const biome of ['grass', 'soil', 'sand', 'snow']) {
      expect(pools[biome].single.length + pools[biome].multi.length).toBe(components.filter((_, index) => (profile.props?.[index]?.biomes || profile.biomes).some(tag => tag === biome || tag === 'universal')).length)
    }
    const webp = await readFile(`${directory}/${profile.name}.webp`)
    expect(detectWebPCompression(webp)).toEqual({ lossless: false })
    const output = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(output.info.width).toBe(metadata.columns * metadata.tileSize)
    expect(output.info.height).toBe(metadata.rows * metadata.rowHeight)
    expect(output.data[3]).toBe(0)
    expect(metadata.source.packing).toEqual({ scale: profile.importScale || 1, padding: 2 })
    let changedAlpha = 0
    for (let index = 0; index < components.length; index++) {
      const { bbox, pixels } = components[index]
      const { renderRect: rect, placedAt } = metadata.extension.imports[index]
      const scale = profile.importScale || 1
      expect([rect.width, rect.height]).toEqual([Math.round(bbox.width * scale), Math.round(bbox.height * scale)])
      const expectedPixels = scale === 1 ? pixels : await sharp(Buffer.from(pixels), { raw: { width: bbox.width, height: bbox.height, channels: 4 } }).resize(rect.width, rect.height).raw().toBuffer()
      const left = placedAt.column * metadata.tileSize + rect.x
      const top = placedAt.row * metadata.rowHeight + rect.y
      for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
        if (output.data[((top + y) * output.info.width + left + x) * 4 + 3] !== expectedPixels[(y * rect.width + x) * 4 + 3]) changedAlpha++
      }
    }
    // WebP RGB is lossy, but the native-size sprite silhouette is exact.
    expect(changedAlpha).toBe(0)
    let transparent = 0, visible = 0
    for (let i = 3; i < output.data.length; i += 4) output.data[i] ? visible++ : transparent++
    expect(transparent).toBeGreaterThan(1000)
    expect(visible).toBeGreaterThan(10000)
  })
})
