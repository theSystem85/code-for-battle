/**
 * Biome decorative-tile prop manifest + atlas packer.
 * Packs prop images into 1024×1024 WebP (q85) SSE sheets with 16×16 / tileSize 64 / borderWidth 1.
 *
 * Usage:
 *   node scripts/pack-biome-decorative-tiles.mjs
 */
import sharp from 'sharp'
import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROP_DIR = path.join(ROOT, 'tmp', 'dt-props')
const OUT_DIR = path.join(ROOT, 'public', 'images', 'map', 'sprite_sheets')

const SHEET_SIZE = 1024
const TILE_SIZE = 64
const BORDER = 1
const COLS = 16
const ROWS = 16
const CONTENT = TILE_SIZE - BORDER * 2 // 62
const WEBP_QUALITY = 85

/** @typedef {{ id: string, w: number, h: number, tags: string[], file: string }} PropDef */

/** Shared footprint coverage across biomes; biome/season tags differ per sheet. */
function biomeProps(biome) {
  /** @type {PropDef[]} */
  const props = [
    // Spring trees
    { id: `${biome}_spring_forest_3x3`, w: 3, h: 3, tags: [biome, 'decorative', 'spring'], file: `${biome}_spring_forest_3x3.png` },
    { id: `${biome}_spring_trees_2x1`, w: 2, h: 1, tags: [biome, 'decorative', 'spring'], file: `${biome}_spring_trees_2x1.png` },
    { id: `${biome}_spring_sapling_1x1`, w: 1, h: 1, tags: [biome, 'decorative', 'spring'], file: `${biome}_spring_sapling_1x1.png` },
    // Summer trees
    { id: `${biome}_summer_grove_2x2`, w: 2, h: 2, tags: [biome, 'decorative', 'summer'], file: `${biome}_summer_grove_2x2.png` },
    { id: `${biome}_summer_tree_1x2`, w: 1, h: 2, tags: [biome, 'decorative', 'summer'], file: `${biome}_summer_tree_1x2.png` },
    { id: `${biome}_summer_bush_1x1`, w: 1, h: 1, tags: [biome, 'decorative', 'summer'], file: `${biome}_summer_bush_1x1.png` },
    // Autumn trees
    { id: `${biome}_autumn_forest_3x2`, w: 3, h: 2, tags: [biome, 'decorative', 'autumn'], file: `${biome}_autumn_forest_3x2.png` },
    { id: `${biome}_autumn_trees_2x3`, w: 2, h: 3, tags: [biome, 'decorative', 'autumn'], file: `${biome}_autumn_trees_2x3.png` },
    { id: `${biome}_autumn_tree_1x1`, w: 1, h: 1, tags: [biome, 'decorative', 'autumn'], file: `${biome}_autumn_tree_1x1.png` },
    // Winter trees
    { id: `${biome}_winter_grove_2x2`, w: 2, h: 2, tags: [biome, 'decorative', 'winter'], file: `${biome}_winter_grove_2x2.png` },
    { id: `${biome}_winter_tree_2x1`, w: 2, h: 1, tags: [biome, 'decorative', 'winter'], file: `${biome}_winter_tree_2x1.png` },
    { id: `${biome}_winter_stump_1x1`, w: 1, h: 1, tags: [biome, 'decorative', 'winter'], file: `${biome}_winter_stump_1x1.png` },
    // Summer lake (impassable water body)
    { id: `${biome}_summer_lake_3x3`, w: 3, h: 3, tags: [biome, 'decorative', 'summer', 'impassable', 'water'], file: `${biome}_summer_lake_3x3.png` },
    // Rocks / stones (biome-tagged)
    { id: `${biome}_rocks_2x2`, w: 2, h: 2, tags: [biome, 'decorative', 'rocks'], file: `${biome}_rocks_2x2.png` },
    { id: `${biome}_rocks_3x2`, w: 3, h: 2, tags: [biome, 'decorative', 'rocks'], file: `${biome}_rocks_3x2.png` },
    { id: `${biome}_rocks_2x1`, w: 2, h: 1, tags: [biome, 'decorative', 'rocks'], file: `${biome}_rocks_2x1.png` },
    { id: `${biome}_rocks_1x2`, w: 1, h: 2, tags: [biome, 'decorative', 'rocks'], file: `${biome}_rocks_1x2.png` },
    { id: `${biome}_rock_1x1`, w: 1, h: 1, tags: [biome, 'decorative', 'rocks'], file: `${biome}_rock_1x1.png` }
  ]

  // Frozen lakes: not on sand; prefer snow/winter contexts on snow; grass/soil get winter lakes too
  if (biome !== 'sand') {
    props.push({
      id: `${biome}_winter_lake_2x2`,
      w: 2,
      h: 2,
      tags: [biome, 'decorative', 'winter', 'impassable', 'water'],
      file: `${biome}_winter_lake_2x2.png`
    })
  }

  return props
}

function universalProps() {
  return [
    { id: 'universal_deadwood_2x2', w: 2, h: 2, tags: ['universal', 'decorative'], file: 'universal_deadwood_2x2.png' },
    { id: 'universal_logs_2x1', w: 2, h: 1, tags: ['universal', 'decorative'], file: 'universal_logs_2x1.png' },
    { id: 'universal_stump_1x1', w: 1, h: 1, tags: ['universal', 'decorative'], file: 'universal_stump_1x1.png' },
    { id: 'universal_brush_1x2', w: 1, h: 2, tags: ['universal', 'decorative'], file: 'universal_brush_1x2.png' },
    { id: 'universal_clearing_3x3', w: 3, h: 3, tags: ['universal', 'decorative'], file: 'universal_clearing_3x3.png' },
    { id: 'universal_rubble_2x3', w: 2, h: 3, tags: ['universal', 'decorative'], file: 'universal_rubble_2x3.png' },
    { id: 'universal_path_stones_3x2', w: 3, h: 2, tags: ['universal', 'decorative'], file: 'universal_path_stones_3x2.png' },
    { id: 'universal_camp_1x1', w: 1, h: 1, tags: ['universal', 'decorative'], file: 'universal_camp_1x1.png' }
  ]
}

export const SHEETS = [
  { name: 'dt_grass_1024_q85', biome: 'grass', props: biomeProps('grass') },
  { name: 'dt_soil_1024_q85', biome: 'soil', props: biomeProps('soil') },
  { name: 'dt_sand_1024_q85', biome: 'sand', props: biomeProps('sand') },
  { name: 'dt_snow_1024_q85', biome: 'snow', props: biomeProps('snow') },
  { name: 'dt_universal_1024_q85', biome: 'universal', props: universalProps() }
]

function packRects(props) {
  // Shelf pack left-to-right, top-to-bottom
  const placed = []
  let cursorX = 0
  let cursorY = 0
  let rowH = 0
  let groupId = 1

  for (const prop of props) {
    if (cursorX + prop.w > COLS) {
      cursorX = 0
      cursorY += rowH
      rowH = 0
    }
    if (cursorY + prop.h > ROWS) {
      throw new Error(`Sheet overflow packing ${prop.id}`)
    }
    placed.push({ ...prop, col: cursorX, row: cursorY, groupId: groupId++ })
    cursorX += prop.w
    rowH = Math.max(rowH, prop.h)
  }
  return placed
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function makePlaceholder(prop, outPath) {
  // Deterministic colored placeholder so packing/tests work before art lands
  const pw = prop.w * TILE_SIZE - BORDER * 2
  const ph = prop.h * TILE_SIZE - BORDER * 2
  const hue = [...prop.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">
    <rect width="100%" height="100%" fill="hsl(${hue} 35% 40%)"/>
    <text x="50%" y="50%" fill="white" font-size="10" text-anchor="middle" dominant-baseline="middle">${prop.id.replace(/_/g, ' ')}</text>
  </svg>`
  await sharp(Buffer.from(svg)).png().toFile(outPath)
}

async function packSheet(sheet) {
  const placed = packRects(sheet.props)
  const base = Buffer.alloc(SHEET_SIZE * SHEET_SIZE * 4, 0)
  // black opaque background for blendMode black
  for (let i = 0; i < base.length; i += 4) {
    base[i] = 0
    base[i + 1] = 0
    base[i + 2] = 0
    base[i + 3] = 255
  }

  const composites = []
  const tiles = {}
  const sheetTags = new Set(['decorative'])

  for (const prop of placed) {
    const srcPath = path.join(PROP_DIR, prop.file)
    if (!(await exists(srcPath))) {
      await makePlaceholder(prop, srcPath)
    }

    const targetW = prop.w * TILE_SIZE - BORDER * 2
    const targetH = prop.h * TILE_SIZE - BORDER * 2
    const resized = await sharp(srcPath)
      .resize(targetW, targetH, { fit: 'fill' })
      .ensureAlpha()
      .png()
      .toBuffer()

    const left = prop.col * TILE_SIZE + BORDER
    const top = prop.row * TILE_SIZE + BORDER
    composites.push({ input: resized, left, top })

    const groupLabel = `group_${prop.groupId}`
    for (let dy = 0; dy < prop.h; dy++) {
      for (let dx = 0; dx < prop.w; dx++) {
        const col = prop.col + dx
        const row = prop.row + dy
        const key = `${col},${row}`
        const cellTags = [...prop.tags, groupLabel]
        cellTags.forEach(t => sheetTags.add(t))
        tiles[key] = {
          tags: cellTags,
          rect: {
            x: col * TILE_SIZE + BORDER,
            y: row * TILE_SIZE + BORDER,
            width: CONTENT,
            height: CONTENT
          },
          col,
          row
        }
      }
    }
  }

  const composed = await sharp(base, { raw: { width: SHEET_SIZE, height: SHEET_SIZE, channels: 4 } })
    .composite(composites)
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()

  const webpPath = path.join(OUT_DIR, `${sheet.name}.webp`)
  const jsonPath = path.join(OUT_DIR, `${sheet.name}.json`)
  await writeFile(webpPath, composed)

  const metadata = {
    schemaVersion: 1,
    sheetPath: `images/map/sprite_sheets/${sheet.name}.webp`,
    tileSize: TILE_SIZE,
    rowHeight: TILE_SIZE,
    borderWidth: BORDER,
    blendMode: 'black',
    tags: [...sheetTags],
    columns: COLS,
    rows: ROWS,
    tiles,
    displayName: `${sheet.name}.webp`,
    propLayout: placed.map(p => ({
      id: p.id,
      col: p.col,
      row: p.row,
      w: p.w,
      h: p.h,
      groupId: p.groupId,
      tags: p.tags
    }))
  }
  await writeFile(jsonPath, JSON.stringify(metadata, null, 2) + '\n')
  return { webpPath, jsonPath, placed }
}

async function main() {
  await mkdir(PROP_DIR, { recursive: true })
  await mkdir(OUT_DIR, { recursive: true })
  const manifestPath = path.join(PROP_DIR, 'manifest.json')
  await writeFile(manifestPath, JSON.stringify(SHEETS, null, 2))

  for (const sheet of SHEETS) {
    const result = await packSheet(sheet)
    console.log(`Packed ${sheet.name}: ${result.placed.length} props → ${result.webpPath}`)
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

export { packSheet, packRects, biomeProps, universalProps, PROP_DIR }
