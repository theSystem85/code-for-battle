import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.join(__dirname, '..')
const SPRITE_SHEET_DIR = path.join(ROOT_DIR, 'public', 'images', 'map', 'sprite_sheets')
const INDEX_PATH = path.join(SPRITE_SHEET_DIR, 'index.json')

const MAJOR_SPRITE_SHEET_PATH = 'images/map/sprite_sheets/major_sprite_sheet_default.webp'
const MAJOR_SPRITE_METADATA_PATH = 'images/map/sprite_sheets/major_sprite_sheet_default.json'
const MAJOR_SPRITE_SHEET_FILENAME = path.basename(MAJOR_SPRITE_SHEET_PATH)
const MAJOR_SPRITE_METADATA_FILENAME = path.basename(MAJOR_SPRITE_METADATA_PATH)
const TARGET_TILE_SIZE = 64
const OUTPUT_QUALITY = 90
const GRID_COLUMNS = 32
const DEFAULT_BLACK_KEY = Object.freeze({ cutoffBrightness: 8, softenBrightness: 24 })

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value, { pretty = true } = {}) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`)
}

function hashTileBuffer(tileBuffer) {
  return crypto.createHash('sha256').update(tileBuffer).digest('hex')
}

function ensureMajorSheetInIndex(indexJson) {
  const sheets = Array.isArray(indexJson?.sheets) ? indexJson.sheets : []
  const withoutMajor = sheets.filter(sheetPath => sheetPath !== MAJOR_SPRITE_SHEET_PATH)
  return { sheets: [MAJOR_SPRITE_SHEET_PATH, ...withoutMajor] }
}

function buildRuntimeNormalization(tileSize) {
  return {
    sourceTileSize: tileSize,
    targetTileSize: TARGET_TILE_SIZE,
    scale: tileSize > 0 ? TARGET_TILE_SIZE / tileSize : 1,
    requiresUpscale: tileSize < TARGET_TILE_SIZE
  }
}

function parseTileEntries(metadata = {}, sheetPath = '') {
  const tiles = metadata?.tiles && typeof metadata.tiles === 'object' ? metadata.tiles : {}
  const parsed = []
  for (const [tileKey, tile] of Object.entries(tiles)) {
    if (!Array.isArray(tile?.tags) || !tile.tags.length || !tile?.rect) continue

    const parsedCol = Number.parseInt(`${tileKey}`.split(',')[0], 10)
    const parsedRow = Number.parseInt(`${tileKey}`.split(',')[1], 10)
    const col = Number.isFinite(tile.col) ? tile.col : (Number.isFinite(parsedCol) ? parsedCol : 0)
    const row = Number.isFinite(tile.row) ? tile.row : (Number.isFinite(parsedRow) ? parsedRow : 0)

    parsed.push({
      sheetPath,
      col,
      row,
      tags: [...new Set(tile.tags.filter(Boolean))],
      rect: {
        x: Math.max(0, Math.floor(Number(tile.rect.x) || 0)),
        y: Math.max(0, Math.floor(Number(tile.rect.y) || 0)),
        width: Math.max(1, Math.floor(Number(tile.rect.width) || 0)),
        height: Math.max(1, Math.floor(Number(tile.rect.height) || 0))
      }
    })
  }
  return parsed
}

async function loadSourceTiles(sheetPath) {
  const absoluteSheetPath = path.join(ROOT_DIR, 'public', sheetPath)
  const metadataPath = absoluteSheetPath.replace(/\.(webp|png|jpg|jpeg)$/i, '.json')
  if (!fs.existsSync(absoluteSheetPath) || !fs.existsSync(metadataPath)) {
    return []
  }

  const metadata = readJson(metadataPath)
  const baseImage = sharp(fs.readFileSync(absoluteSheetPath), { failOn: 'none' })
  const records = parseTileEntries(metadata, sheetPath)
  if (!records.length) return []

  return Promise.all(records.map(async(record) => {
    const tileBuffer = await baseImage
      .clone()
      .extract({ left: record.rect.x, top: record.rect.y, width: record.rect.width, height: record.rect.height })
      .resize(TARGET_TILE_SIZE, TARGET_TILE_SIZE, { fit: 'fill' })
      .png()
      .toBuffer()

    return {
      ...record,
      hash: hashTileBuffer(tileBuffer),
      tileBuffer
    }
  }))
}

function isRectangularGroup(records = []) {
  if (!records.length) return null
  const cols = records.map(record => record.col)
  const rows = records.map(record => record.row)
  const minCol = Math.min(...cols)
  const maxCol = Math.max(...cols)
  const minRow = Math.min(...rows)
  const maxRow = Math.max(...rows)
  const width = (maxCol - minCol) + 1
  const height = (maxRow - minRow) + 1
  if (records.length !== width * height) return null

  const lookup = new Set(records.map(record => `${record.col},${record.row}`))
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (!lookup.has(`${col},${row}`)) return null
    }
  }

  return { minCol, minRow, width, height }
}

function buildAssetBlocks(sourceTiles = []) {
  const groupedByLabel = new Map()
  sourceTiles.forEach((record) => {
    const groupLabel = record.tags.find(tag => /^group_\d+$/.test(tag))
    if (!groupLabel) return
    const key = `${record.sheetPath}|${groupLabel}`
    const list = groupedByLabel.get(key) || []
    list.push(record)
    groupedByLabel.set(key, list)
  })

  const consumed = new Set()
  const blocks = []

  groupedByLabel.forEach((records, key) => {
    const rect = isRectangularGroup(records)
    if (!rect) return
    const [sheetPath, groupLabel] = key.split('|')
    const tilesByOffset = []
    records.forEach((record) => {
      consumed.add(record)
      tilesByOffset.push({
        offsetX: record.col - rect.minCol,
        offsetY: record.row - rect.minRow,
        tags: record.tags,
        hash: record.hash,
        tileBuffer: record.tileBuffer
      })
    })
    blocks.push({
      blockType: 'group',
      sheetPath,
      groupLabel,
      width: rect.width,
      height: rect.height,
      tilesByOffset
    })
  })

  sourceTiles.forEach((record) => {
    if (consumed.has(record)) return
    blocks.push({
      blockType: 'single',
      sheetPath: record.sheetPath,
      width: 1,
      height: 1,
      tilesByOffset: [{
        offsetX: 0,
        offsetY: 0,
        tags: record.tags,
        hash: record.hash,
        tileBuffer: record.tileBuffer
      }]
    })
  })

  return blocks
}

function sortBlocks(blocks = []) {
  return blocks.sort((a, b) => {
    const bucketA = Math.max(a.width, a.height)
    const bucketB = Math.max(b.width, b.height)
    if (bucketA !== bucketB) return bucketA - bucketB
    const areaDiff = (b.width * b.height) - (a.width * a.height)
    if (areaDiff !== 0) return areaDiff
    if (a.sheetPath !== b.sheetPath) return a.sheetPath.localeCompare(b.sheetPath)
    return `${a.groupLabel || ''}`.localeCompare(`${b.groupLabel || ''}`)
  })
}

function buildAtlasLayout(blocks = []) {
  const placed = []
  let y = 0

  const buckets = new Map()
  blocks.forEach((block) => {
    const bucket = Math.max(block.width, block.height)
    const list = buckets.get(bucket) || []
    list.push(block)
    buckets.set(bucket, list)
  })

  const orderedBuckets = [...buckets.keys()].sort((a, b) => a - b)
  for (const bucket of orderedBuckets) {
    const bucketBlocks = buckets.get(bucket) || []
    let x = 0
    let rowHeight = 0
    let bucketStartY = y

    bucketBlocks.forEach((block) => {
      if (x + block.width > GRID_COLUMNS) {
        x = 0
        bucketStartY += rowHeight
        rowHeight = 0
      }

      placed.push({ block, atlasCol: x, atlasRow: bucketStartY })
      x += block.width
      rowHeight = Math.max(rowHeight, block.height)
    })

    y = bucketStartY + rowHeight
  }

  return {
    placed,
    columns: GRID_COLUMNS,
    rows: Math.max(1, y)
  }
}

function assignDedupedAtlasSources(layout) {
  const uniqueTilesByHash = new Map()
  const composite = []
  let skippedDuplicateTiles = 0

  layout.placed.forEach(({ block, atlasCol, atlasRow }) => {
    block.tilesByOffset.forEach((tile) => {
      const col = atlasCol + tile.offsetX
      const row = atlasRow + tile.offsetY
      const existing = uniqueTilesByHash.get(tile.hash)

      if (existing) {
        tile.sourceCol = existing.sourceCol
        tile.sourceRow = existing.sourceRow
        skippedDuplicateTiles++
        return
      }

      tile.sourceCol = col
      tile.sourceRow = row
      uniqueTilesByHash.set(tile.hash, { sourceCol: col, sourceRow: row })
      composite.push({
        input: tile.tileBuffer,
        left: col * TARGET_TILE_SIZE,
        top: row * TARGET_TILE_SIZE
      })
    })
  })

  return {
    composite,
    uniqueTileCount: uniqueTilesByHash.size,
    skippedDuplicateTiles
  }
}

function buildMajorMetadata({ placed, columns, rows }) {
  const tagIndex = new Map()
  const hashIndex = new Map()
  const tileEntries = []

  const collectTagIndex = (tag) => {
    if (!tagIndex.has(tag)) {
      tagIndex.set(tag, tagIndex.size)
    }
    return tagIndex.get(tag)
  }

  const collectHashIndex = (hash) => {
    if (!hashIndex.has(hash)) {
      hashIndex.set(hash, hashIndex.size)
    }
    return hashIndex.get(hash)
  }

  placed.forEach(({ block, atlasCol, atlasRow }) => {
    block.tilesByOffset.forEach((tile) => {
      const col = atlasCol + tile.offsetX
      const row = atlasRow + tile.offsetY
      const tagIds = [...new Set(tile.tags.filter(Boolean))]
        .map(tag => collectTagIndex(tag))
        .sort((a, b) => a - b)

      const entry = [col, row, tagIds, collectHashIndex(tile.hash)]
      if (tile.sourceCol !== col || tile.sourceRow !== row) {
        entry.push(tile.sourceCol, tile.sourceRow)
      }
      tileEntries.push(entry)
    })
  })

  const orderedTags = [...tagIndex.entries()].sort((a, b) => a[1] - b[1]).map(([tag]) => tag)
  const orderedHashes = [...hashIndex.entries()].sort((a, b) => a[1] - b[1]).map(([hash]) => hash)

  return {
    schemaVersion: 2,
    sheetPath: MAJOR_SPRITE_SHEET_PATH,
    displayName: MAJOR_SPRITE_SHEET_FILENAME,
    tileSize: TARGET_TILE_SIZE,
    rowHeight: TARGET_TILE_SIZE,
    borderWidth: 0,
    blendMode: 'black',
    blackKey: { ...DEFAULT_BLACK_KEY },
    tags: orderedTags,
    hashes: orderedHashes,
    columns,
    rows,
    runtimeNormalization: buildRuntimeNormalization(TARGET_TILE_SIZE),
    sourceSheets: [...new Set(placed.map(entry => entry.block.sheetPath))],
    tileEntries
  }
}

async function buildMajorSpriteSheet() {
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error(`Missing sprite sheet index: ${INDEX_PATH}`)
  }

  const indexJson = ensureMajorSheetInIndex(readJson(INDEX_PATH))
  writeJson(INDEX_PATH, indexJson)

  const sourceSheets = indexJson.sheets.filter(sheetPath => sheetPath !== MAJOR_SPRITE_SHEET_PATH)
  const sourceTiles = []
  for (const sheetPath of sourceSheets) {
    const records = await loadSourceTiles(sheetPath)
    sourceTiles.push(...records)
  }

  if (!sourceTiles.length) {
    throw new Error('No tagged sprite-sheet tiles found to compile into the major sprite sheet.')
  }

  const blocks = sortBlocks(buildAssetBlocks(sourceTiles))
  const layout = buildAtlasLayout(blocks)
  const dedupedAtlas = assignDedupedAtlasSources(layout)

  const outputImagePath = path.join(SPRITE_SHEET_DIR, MAJOR_SPRITE_SHEET_FILENAME)
  const outputMetadataPath = path.join(SPRITE_SHEET_DIR, MAJOR_SPRITE_METADATA_FILENAME)

  await sharp({
    create: {
      width: layout.columns * TARGET_TILE_SIZE,
      height: layout.rows * TARGET_TILE_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(dedupedAtlas.composite)
    .webp({ quality: OUTPUT_QUALITY })
    .toFile(outputImagePath)

  const metadata = buildMajorMetadata({
    placed: layout.placed,
    columns: layout.columns,
    rows: layout.rows
  })
  writeJson(outputMetadataPath, metadata, { pretty: false })

  console.log(`Compiled major sprite sheet: ${MAJOR_SPRITE_SHEET_PATH}`)
  console.log(`Compiled major sprite metadata: ${MAJOR_SPRITE_METADATA_PATH}`)
  console.log(`Included tagged tiles: ${metadata.tileEntries.length}`)
  console.log(`Unique image tiles: ${dedupedAtlas.uniqueTileCount}`)
  console.log(`Skipped duplicate image tiles: ${dedupedAtlas.skippedDuplicateTiles}`)
}

buildMajorSpriteSheet().catch((err) => {
  console.error(err)
  process.exit(1)
})
