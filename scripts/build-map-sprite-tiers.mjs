import { readdir, readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSheetArtifacts } from './lib/mapSpriteBuild/build.mjs'
import { metadataSignature } from './lib/mapSpriteBuild/catalog.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = resolve(root, 'public/images/map/sprite_sheets')
const outputDirectory = resolve(root, 'public/images/prepared-map-sprites')

export async function discoverBundledSheets(directory = sourceDirectory) {
  const files = await readdir(directory)
  const byStem = new Map()
  for (const file of files.sort()) {
    const extension = extname(file)
    if (extension !== '.webp' && extension !== '.json') continue
    const stem = file.slice(0, -extension.length)
    if (stem === 'index') continue
    const entry = byStem.get(stem) || { name: stem }
    entry[extension.slice(1)] = join(directory, file)
    byStem.set(stem, entry)
  }
  const incomplete = [...byStem.values()].filter(entry => !entry.webp || !entry.json)
  if (incomplete.length) throw new Error(`Missing image/metadata pair: ${incomplete.map(entry => entry.name).join(', ')}`)
  return [...byStem.values()].sort((left, right) => left.name.localeCompare(right.name))
}

async function expectedArtifacts() {
  const sheets = await discoverBundledSheets()
  const artifacts = await Promise.all(sheets.map(sheet => buildSheetArtifacts({ name: sheet.name, imagePath: sheet.webp, metadataPath: sheet.json })))
  const catalogSheets = artifacts.map(({ manifest }) => ({ name: manifest.name, manifest: `${manifest.name}.json`, signature: manifest.signature,
    metadataSignature: manifest.identity.metadataSignature, decodedBytes: manifest.pages.reduce((sum, page) => sum + page.decodedBytes, 0),
    compressedBytes: manifest.pages.reduce((sum, page) => sum + page.compressedBytes, 0) }))
  const catalog = { schemaVersion: 1, signature: metadataSignature(catalogSheets), sheets: catalogSheets }
  return { artifacts, catalog }
}

async function checkFile(path, expected) {
  try { return Buffer.compare(await readFile(path), expected) === 0 } catch { return false }
}

export async function buildMapSpriteTiers({ check = false } = {}) {
  const { artifacts, catalog } = await expectedArtifacts()
  const expected = new Map([['catalog.json', Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`)]])
  for (const { manifest, pages } of artifacts) {
    expected.set(`${manifest.name}.json`, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`))
    for (const page of pages) expected.set(page.name, page.bytes)
  }
  if (check) {
    const missingOrStale = []
    for (const [name, bytes] of expected) if (!await checkFile(join(outputDirectory, name), bytes)) missingOrStale.push(name)
    let extras = []
    try { extras = (await readdir(outputDirectory)).filter(name => !expected.has(name)).sort() } catch {}
    if (missingOrStale.length || extras.length) throw new Error(`Prepared map sprites are stale (missing/stale: ${missingOrStale.join(', ') || 'none'}; extra: ${extras.join(', ') || 'none'})`)
    return catalog
  }
  await rm(outputDirectory, { recursive: true, force: true })
  await mkdir(outputDirectory, { recursive: true })
  for (const [name, bytes] of expected) await writeFile(join(outputDirectory, name), bytes)
  return catalog
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check')
  const catalog = await buildMapSpriteTiers({ check })
  const bytes = catalog.sheets.reduce((sum, sheet) => sum + sheet.compressedBytes, 0)
  console.log(`${check ? 'Verified' : 'Built'} ${catalog.sheets.length} map sprite sheets (${bytes} compressed bytes)`)
}
