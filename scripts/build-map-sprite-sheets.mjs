import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { CURATED_PROFILES } from './map-prop-guides.mjs'
import { LARGE_NATURE_PROFILES } from './large-nature-profiles.mjs'
import { mapPropImportScale } from './map-prop-calibration.mjs'
import { detectSprites } from '../src/ui/sseDetect.js'
import { findPackingRegion } from '../src/ui/ssePack.js'
import { exportMetadata } from '../src/ui/sseExport.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = 'public/images/map/sprite_sheets'
const TALL_CITY_PROFILE = {
  kind: 'city', cityOverhangs: true, layoutVersion: 6, expectedSprites: 20,
  detection: { transparent: true, alphaCutoff: 16, gap: 0, minArea: 1000 }
}
export const SOURCE_PROFILES = [
  ...['temperate', 'sand', 'snow'].flatMap(biome => ['low', 'medium'].map(level => ({
    ...TALL_CITY_PROFILE, source: `cities_${biome}_${level}`, name: `dtv5_city_${biome}_${level}`,
    biomes: biome === 'temperate' ? ['grass', 'soil'] : [biome],
    seasons: biome === 'snow' ? ['winter'] : [], densityLevel: level, sourceRows: 5, importScale: level === 'low' ? 0.5 : 0.75
  }))),
  { source: 'vegetation_rocks_lakes_sand', name: 'dtv4_nature_sand', biomes: ['sand'], kind: 'nature' },
  { source: 'vegetation_rocks_lakes_snow', name: 'dtv4_nature_snow', biomes: ['snow'], kind: 'nature' },
  ...CURATED_PROFILES,
  ...LARGE_NATURE_PROFILES
]
export const DETECTION_OPTIONS = Object.freeze({ transparent: true, alphaCutoff: 128, gap: 0, minArea: 256 })
export const MAP_SHEET_QUALITY = 85

function splitAtGuide(component, guide) {
  const b = component.bbox, r = guide.region
  if (b.x >= r.x + r.width || b.y >= r.y + r.height || b.x + b.width <= r.x || b.y + b.height <= r.y) return [component]
  const start = guide.axis === 'x' ? b.x : b.y
  const length = guide.axis === 'x' ? b.width : b.height
  if (guide.at <= start || guide.at >= start + length) return [component]
  const split = guide.at - start
  return [[0, split], [split, length]].flatMap(([from, to]) => {
    const x = guide.axis === 'x' ? from : 0
    const y = guide.axis === 'y' ? from : 0
    const width = guide.axis === 'x' ? to - from : b.width
    const height = guide.axis === 'y' ? to - from : b.height
    const data = new Uint8ClampedArray(width * height * 4)
    for (let row = 0; row < height; row++) {
      const offset = ((y + row) * b.width + x) * 4
      data.set(component.pixels.subarray(offset, offset + width * 4), row * width * 4)
    }
    return detectSprites({ width, height, data }, DETECTION_OPTIONS).map(part => ({ ...part,
      bbox: { ...part.bbox, x: part.bbox.x + b.x + x, y: part.bbox.y + b.y + y } }))
  })
}

export function extractMapSource(image, profile) {
  let components = detectSprites(image, profile.detection || DETECTION_OPTIONS)
  for (const guide of profile.guides || []) components = components.flatMap(component => splitAtGuide(component, guide))
  if (profile.sourceColumns) {
    components.sort((a, b) => a.bbox.y + a.bbox.height / 2 - b.bbox.y - b.bbox.height / 2)
    return components.flatMap((_, index) => index % profile.sourceColumns ? [] : components.slice(index, index + profile.sourceColumns).sort((a, b) => a.bbox.x - b.bbox.x))
  }
  const sourceRow = b => profile.sourceRows
    ? Math.min(profile.sourceRows - 1, Math.floor((b.y + b.height / 2) / (image.height / profile.sourceRows)))
    : [250, 450, 710, 1050, Infinity].findIndex(limit => b.y < limit)
  return components.sort((a, b) => profile.cityOverhangs
    ? sourceRow(a.bbox) - sourceRow(b.bbox) || a.bbox.x - b.bbox.x
    : a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x)
}

export function classifyMapSprite({ bbox: b }, profile) {
  if (profile.cityOverhangs) return ['city', ...(!profile.densityLevel && b.y >= 710 ? ['skyscraper'] : []), 'impassable']
  if (profile.kind === 'nature') {
    if (b.y >= 638) return ['water', ...(profile.biomes.includes('snow') ? ['frozen_lake'] : ['lake']), 'impassable']
    if (b.y >= 390) return ['rocks', ...(b.width <= 55 && b.height <= 55 ? ['stones'] : []), 'impassable']
    if (b.y < 180 || (b.y < 300 && b.height >= 65)) return ['trees', 'impassable']
    return ['shrubs', 'passable']
  }
  const parking = (b.x < 125 && b.y >= 840) || (b.x >= 125 && b.x < 335 && b.y >= 600 && b.y < 650 && b.height < 100)
  const building = !parking && (b.y < 790 || (b.x < 90 && b.y < 850) || (b.x >= 890 && b.y >= 825 && b.width >= 80 && b.height >= 60) || (b.x >= 800 && b.y >= 910))
  return building ? ['city', 'impassable'] : ['roadside', 'passable']
}

export async function buildMapSpriteSheet(profile) {
  const sourcePath = `${directory}/sources/${profile.source}.webp`
  const bytes = await readFile(resolve(root, sourcePath))
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const components = extractMapSource({ width: info.width, height: info.height, data }, profile)
  if (!components.length || (profile.expectedSprites && components.length !== profile.expectedSprites) || components.some(c => c.bbox.width > info.width / 2 || c.bbox.height > info.height / 2)) {
    throw new Error(`Unreliable extraction: ${profile.source}`)
  }
  const occupied = new Set(), tiles = {}, imports = [], propLayout = [], overlays = []
  const columns = 16, tileSize = 64, borderWidth = 0
  let rows = 1
  for (let index = 0; index < components.length; index++) {
    const component = components[index], b = component.bbox
    const guide = profile.props?.[index]
    const categories = guide?.tags || classifyMapSprite(component, profile)
    const density = profile.cityOverhangs ? (profile.densityLevel === 'low' ? [1, 2, 3, 2, 3][Math.floor(index / 4)]
      : profile.densityLevel === 'medium' ? [4, 5, 6, 7, 5][Math.floor(index / 4)]
        : [4, 5, 6, 5, 4, 5, 7, 6, 7, 7, 6, 5, 8, 9, 9, 8, 10, 10, 10, 9][index]) : null
    const tags = [...(guide?.biomes || profile.biomes), ...(profile.seasons || []), 'decorative', ...categories, ...(density ? [`density_${density}`] : []), `group_${index + 1}`]
    const scale = guide?.referenceSize ? mapPropImportScale(b, guide.referenceSize, profile.maxImportScale || 1) : profile.importScale || 1
    const width = Math.round(b.width * scale), height = Math.round(b.height * scale)
    const spanX = Math.max(profile.cityOverhangs ? 2 : 1, Math.ceil((width + 4) / tileSize)), spanY = Math.max(profile.cityOverhangs ? 2 : 1, Math.ceil((height + 4) / tileSize))
    const region = findPackingRegion({ columns, rows, tileSize, borderWidth, occupied, width: spanX * tileSize, height: spanY * tileSize })
    rows = region.rows
    // Native imports stay exact; explicit tier calibration is performed once
    // during asset creation and recorded in source.packing and each import.
    const left = region.x * tileSize + Math.floor((spanX * tileSize - width) / 2)
    const top = region.y * tileSize + Math.floor((spanY * tileSize - height) / 2)
    const crop = scale === 1 ? Buffer.from(component.pixels)
      : await sharp(Buffer.from(component.pixels), { raw: { width: b.width, height: b.height, channels: 4 } }).resize(width, height).raw().toBuffer()
    overlays.push({ input: crop, raw: { width, height, channels: 4 }, left, top })
    const smallHouse = profile.densityLevel === 'low' && density === 1
    const minimumRows = smallHouse ? 1 : 2
    const preferredRows = smallHouse ? 1 : categories.includes('skyscraper') || (!profile.densityLevel && b.height > 185) || (profile.densityLevel === 'medium' && b.height > 210) ? 3 : 2
    const baseRows = profile.cityOverhangs ? Math.min(spanY, Math.max(minimumRows, Math.min(spanY - 1, preferredRows))) : spanY
    const upperRows = spanY - baseRows
    const footprint = { x: 0, y: upperRows, width: spanX, height: baseRows }
    if (profile.cityOverhangs && (spanX < 2 || baseRows < minimumRows || (categories.includes('skyscraper') && (spanX < 3 || baseRows < 3)))) throw new Error('Building source is too small for its minimum ground footprint')
    for (let dy = 0; dy < spanY; dy++) for (let dx = 0; dx < spanX; dx++) {
      const col = region.x + dx, row = region.y + dy
      occupied.add(`${col},${row}`)
      const cellTags = profile.cityOverhangs && dy < upperRows ? [...tags.filter(tag => tag !== 'impassable'), 'passable', 'overhang'] : tags
      tiles[`${col},${row}`] = { col, row, tags: cellTags, rect: { x: col * tileSize, y: row * tileSize, width: tileSize, height: tileSize } }
    }
    const id = guide ? `${profile.biomes[0]}_${guide.name}` : `${profile.source}_${categories[0]}_${String(index + 1).padStart(3, '0')}`
    imports.push({ id, sourceId: profile.source, bbox: b, area: component.area, anchor: 'center', sizeRatio: scale,
      ...(guide?.referenceSize ? { referenceSize: guide.referenceSize } : {}),
      tileSpan: { columns: spanX, rows: spanY }, placedAt: { column: region.x, row: region.y }, tags,
      renderRect: { x: left - region.x * tileSize, y: top - region.y * tileSize, width, height } })
    propLayout.push({ id, col: region.x, row: region.y, w: spanX, h: spanY, groupId: index + 1, tags, ...(density ? { density } : {}), sourceRect: b, ...(profile.cityOverhangs ? { footprint } : {}) })
  }
  const source = { path: sourcePath.replace(/^public\//, ''), sha256: createHash('sha256').update(bytes).digest('hex'),
    width: info.width, height: info.height, detection: profile.detection || DETECTION_OPTIONS, guides: profile.guides || [], spriteCount: components.length, packing: { scale: profile.props ? 'per-sprite' : profile.importScale || 1, padding: 2, ...(profile.maxImportScale ? { maxScale: profile.maxImportScale } : {}) } }
  const metadata = exportMetadata({ schemaVersion: 1, layoutVersion: profile.layoutVersion || 3, tileSize, rowHeight: tileSize, borderWidth, columns, rows,
    blendMode: 'alpha', tags: [...new Set(Object.values(tiles).flatMap(tile => tile.tags).filter(tag => !/^group_/.test(tag)))], tiles, propLayout,
    source, extension: { imports, occupiedTiles: [...occupied] } }, profile.name, { lossless: false, quality: MAP_SHEET_QUALITY })
  metadata.sheetPath = `images/map/sprite_sheets/${profile.name}.webp`
  await sharp({ create: { width: columns * tileSize, height: rows * tileSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(overlays).webp({ quality: MAP_SHEET_QUALITY, alphaQuality: 100 }).toFile(resolve(root, `${directory}/${profile.name}.webp`))
  await writeFile(resolve(root, `${directory}/${profile.name}.json`), JSON.stringify(metadata, null, 2) + '\n')
  console.log(`${profile.source}: ${components.length} sprites -> ${profile.name} (${columns}x${rows} tiles, WebP quality ${MAP_SHEET_QUALITY})`)
  return metadata
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv.find(arg => arg.startsWith('--name='))?.slice(7)
  const kind = process.argv.find(arg => arg.startsWith('--kind='))?.slice(7)
  if (kind && !['city', 'nature', 'props'].includes(kind)) throw new Error('Expected --kind=city, --kind=nature or --kind=props')
  for (const profile of SOURCE_PROFILES.filter(profile => (!kind || profile.kind === kind) && (!name || profile.name === name))) await buildMapSpriteSheet(profile)
}
