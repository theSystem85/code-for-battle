import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { soundFiles } from '../../src/sound.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifestPath = path.join(root, 'docs/asset-sources/elevenlabs-audio-pack-2026-11-15.md')

// These keys are legacy aliases of a key that is played, or they are built
// with string concatenation (`playSound('our' + role + 'IsOut')`).
const LEGACY_ALIAS_KEYS = new Set([
  'tankShot',
  'tankShot03',
  'tankMove',
  'unitReady',
  'patriotMissile',
  'yesSir01'
])
const COMPOSED_CREW_KEYS = new Set([
  'ourLoaderIsOut',
  'ourDriverIsOut',
  'ourCommanderIsOut',
  'ourGunnerIsOut'
])

function manifestRows() {
  const rows = []
  for (const line of fs.readFileSync(manifestPath, 'utf8').split('\n')) {
    if (!line.startsWith('| `')) continue
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim().replaceAll('`', ''))
    if (cells[0] === 'id' || cells.length < 4) continue
    rows.push({ id: cells[0], file: cells[1], key: cells[3] })
  }
  return rows
}

function sourceWithoutRegistry() {
  const chunks = []
  for (const file of walkJs(path.join(root, 'src'))) {
    let text = fs.readFileSync(file, 'utf8')
    if (file.endsWith(`${path.sep}sound.js`)) text = stripSoundFiles(text)
    chunks.push(text)
  }
  return chunks.join('\n')
}

function stripSoundFiles(source) {
  const start = source.indexOf('export const soundFiles = {')
  if (start < 0) return source
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(0, start) + source.slice(i + 1)
    }
  }
  return source
}

function walkJs(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkJs(full, acc)
    else if (entry.name.endsWith('.js')) acc.push(full)
  }
  return acc
}

function isQuoted(corpus, key) {
  return corpus.includes(`'${key}'`) || corpus.includes(`"${key}"`) || corpus.includes(`\`${key}\``)
}

describe('ElevenLabs audio pack registration', () => {
  const rows = manifestRows()
  const corpus = sourceWithoutRegistry()

  it('[U07136] registers every manifest file and the file is on disk', () => {
    expect(rows).toHaveLength(78)
    const registered = new Set(Object.values(soundFiles).flat())
    const missing = []
    for (const row of rows) {
      const base = path.basename(row.file)
      if (!registered.has(base) || !(row.key in soundFiles) || !soundFiles[row.key].includes(base)) {
        missing.push(`${row.id} -> ${row.key}`)
      }
      if (!fs.existsSync(path.join(root, row.file))) missing.push(`missing ${row.file}`)
    }
    expect(missing).toEqual([])
  })

  it('[U07137] gives error and cancel real files so they do not fall through to the beep', () => {
    expect(soundFiles.error.length).toBeGreaterThan(0)
    expect(soundFiles.cancel.length).toBeGreaterThan(0)
    for (const file of [...soundFiles.error, ...soundFiles.cancel]) {
      expect(fs.existsSync(path.join(root, 'public/sound', file))).toBe(true)
    }
  })

  it('[U07138] references every registered key from gameplay code', () => {
    const unreferenced = []
    for (const key of Object.keys(soundFiles)) {
      if (LEGACY_ALIAS_KEYS.has(key) || COMPOSED_CREW_KEYS.has(key)) continue
      if (!isQuoted(corpus, key)) unreferenced.push(key)
    }
    expect(unreferenced).toEqual([])
    expect(corpus).toContain("playSound('our' +")
    for (const key of LEGACY_ALIAS_KEYS) expect(key in soundFiles).toBe(true)
    for (const key of COMPOSED_CREW_KEYS) expect(key in soundFiles).toBe(true)
  })
})
