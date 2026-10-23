import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { detectSprites } from '../src/ui/sseDetect.js'
import { findPackingRegion } from '../src/ui/ssePack.js'
import { exportMetadata } from '../src/ui/sseExport.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = 'public/images/map/sprite_sheets'
export const SOURCE_PROFILES = [
  { source: 'cities', name: 'dtv3_city', biomes: ['grass', 'soil'], kind: 'city' },
  { source: 'cities_sand', name: 'dtv4_city_sand', biomes: ['sand'], kind: 'city' },
  { source: 'cities_snow', name: 'dtv4_city_snow', biomes: ['snow'], kind: 'city',
    // These two snow-covered props physically touch their neighbours. Source
    // guides split their ownership without erasing any pixels; each side is
    // still isolated by the same SSE detector (not copied as a rectangle).
    guides: [
      { axis: 'x', at: 328, region: { x: 270, y: 0, width: 120, height: 70 } },
      { axis: 'y', at: 913, region: { x: 495, y: 850, width: 135, height: 160 } }
    ] },
  { source: 'vegetation_rocks_lakes_sand', name: 'dtv4_nature_sand', biomes: ['sand'], kind: 'nature' },
  { source: 'vegetation_rocks_lakes_snow', name: 'dtv4_nature_snow', biomes: ['snow'], kind: 'nature' }
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
  let components = detectSprites(image, DETECTION_OPTIONS)
  for (const guide of profile.guides || []) components = components.flatMap(component => splitAtGuide(component, guide))
  return components.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x)
}

export function classifyMapSprite({ bbox: b }, profile) {
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
  if (!components.length || components.some(c => c.bbox.width > info.width / 2 || c.bbox.height > info.height / 2)) {
    throw new Error(`Unreliable extraction: ${profile.source}`)
  }
  const occupied = new Set(), tiles = {}, imports = [], propLayout = [], overlays = []
  const columns = 16, tileSize = 64, borderWidth = 0
  let rows = 1
  for (let index = 0; index < components.length; index++) {
    const component = components[index], b = component.bbox
    const categories = classifyMapSprite(component, profile)
    const tags = [...profile.biomes, 'decorative', ...categories, `group_${index + 1}`]
    const spanX = Math.max(1, Math.ceil((b.width + 4) / tileSize)), spanY = Math.max(1, Math.ceil((b.height + 4) / tileSize))
    const region = findPackingRegion({ columns, rows, tileSize, borderWidth, occupied, width: spanX * tileSize, height: spanY * tileSize })
    rows = region.rows
    // Grow the footprint to fit the source, never resize the isolated pixels.
    const width = b.width, height = b.height
    const left = region.x * tileSize + Math.floor((spanX * tileSize - width) / 2)
    const top = region.y * tileSize + Math.floor((spanY * tileSize - height) / 2)
    const crop = Buffer.from(component.pixels)
    overlays.push({ input: crop, raw: { width, height, channels: 4 }, left, top })
    for (let dy = 0; dy < spanY; dy++) for (let dx = 0; dx < spanX; dx++) {
      const col = region.x + dx, row = region.y + dy
      occupied.add(`${col},${row}`)
      tiles[`${col},${row}`] = { col, row, tags, rect: { x: col * tileSize, y: row * tileSize, width: tileSize, height: tileSize } }
    }
    const id = `${profile.source}_${categories[0]}_${String(index + 1).padStart(3, '0')}`
    imports.push({ id, sourceId: profile.source, bbox: b, area: component.area, anchor: 'center',
      tileSpan: { columns: spanX, rows: spanY }, placedAt: { column: region.x, row: region.y }, tags,
      renderRect: { x: left - region.x * tileSize, y: top - region.y * tileSize, width, height } })
    propLayout.push({ id, col: region.x, row: region.y, w: spanX, h: spanY, groupId: index + 1, tags, sourceRect: b })
  }
  const source = { path: sourcePath.replace(/^public\//, ''), sha256: createHash('sha256').update(bytes).digest('hex'),
    width: info.width, height: info.height, detection: DETECTION_OPTIONS, guides: profile.guides || [], spriteCount: components.length, packing: { scale: 1, padding: 2 } }
  const metadata = exportMetadata({ schemaVersion: 1, layoutVersion: profile.kind === 'city' ? 4 : 3, zoomFactor: profile.kind === 'city' ? 2 : 1, tileSize, rowHeight: tileSize, borderWidth, columns, rows,
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
  const kind = process.argv.find(arg => arg.startsWith('--kind='))?.slice(7)
  if (kind && !['city', 'nature'].includes(kind)) throw new Error('Expected --kind=city or --kind=nature')
  for (const profile of SOURCE_PROFILES.filter(profile => !kind || profile.kind === kind)) await buildMapSpriteSheet(profile)
}
