import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_SSE_SHEETS,
  OPTIONAL_SSE_SHEETS,
  isRetiredSpriteSheetPath,
  migrateSavedSpriteSheetState,
  purgeRetiredSheetStorage
} from '../../src/ui/spriteSheetRegistry.js'

const SEASONS = 'images/map/sprite_sheets/dt_grass_1024_q85.webp'
const RETIRED_SEASONS = 'images/map/sprite_sheets/seasons_1024_q90_2.webp'

function memoryStorage(entries) {
  const map = new Map(Object.entries(entries))
  return {
    map,
    getStoredItem: key => (map.has(key) ? map.get(key) : null),
    setStoredItem: (key, value) => map.set(key, value),
    removeStoredItem: key => map.delete(key),
    getStoredKeys: prefix => [...map.keys()].filter(key => key.startsWith(prefix))
  }
}

describe('sprite sheet registry', () => {
  it('[U04162] matches index.json and every listed sheet exists', () => {
    const index = JSON.parse(readFileSync('public/images/map/sprite_sheets/index.json', 'utf8'))
    expect(index.sheets).toEqual([...DEFAULT_SSE_SHEETS])
    DEFAULT_SSE_SHEETS.forEach((path) => {
      expect(() => readFileSync(`public/${path}`)).not.toThrow()
      expect(isRetiredSpriteSheetPath(path)).toBe(false)
    })
  })

  it('[U04163] enables every dtv sheet by default and retires removed sheets', () => {
    expect(OPTIONAL_SSE_SHEETS).toHaveLength(0)
    expect(DEFAULT_SSE_SHEETS).toContain('images/map/sprite_sheets/dtv6_decor_snow.webp')
    for (const biome of ['temperate', 'sand', 'snow']) for (const level of ['low', 'medium']) expect(DEFAULT_SSE_SHEETS).toContain(`images/map/sprite_sheets/dtv5_city_${biome}_${level}.webp`)
    expect(DEFAULT_SSE_SHEETS.filter(path => /\/dtv\d+_/.test(path))).toHaveLength(19)
    expect(DEFAULT_SSE_SHEETS).toEqual(expect.arrayContaining(['dtv5_city_sand_medium', 'dtv5_city_snow_medium', 'dtv4_nature_sand', 'dtv4_nature_snow'].map(name => `images/map/sprite_sheets/${name}.webp`)))
    expect(isRetiredSpriteSheetPath('images/map/sprite_sheets/seasons_1024_q90_2.webp')).toBe(true)
    expect(isRetiredSpriteSheetPath('images/map/sprite_sheets/streets24_q90_1024x1024.webp')).toBe(true)
    expect(isRetiredSpriteSheetPath('images/map/sprite_sheets/rockCliffsMountains_64x64_1024x1024.webp')).toBe(true)
  })

  it('[U04164] purges stored state that references retired sheets', () => {
    const storage = memoryStorage({
      [`rts-sse-metadata:${SEASONS}`]: '{}',
      [`rts-sse-metadata:${RETIRED_SEASONS}`]: '{}',
      'rts-sse-last-sheet': `/${SEASONS}`,
      'rts-sse-applied-metadata': JSON.stringify({ sheetPath: SEASONS }),
      'rts-integrated-spritesheet-selected-sheets': JSON.stringify([SEASONS, RETIRED_SEASONS, 'images/map/sprite_sheets/crystals_q90_1024x1024.webp'])
    })
    purgeRetiredSheetStorage(storage)
    expect(storage.map.has(`rts-sse-metadata:${SEASONS}`)).toBe(false)
    expect(storage.map.has(`rts-sse-metadata:${RETIRED_SEASONS}`)).toBe(false)
    expect(storage.map.has('rts-sse-last-sheet')).toBe(false)
    expect(storage.map.has('rts-sse-applied-metadata')).toBe(false)
    expect(JSON.parse(storage.map.get('rts-integrated-spritesheet-selected-sheets'))).toEqual([])
  })

  it('[U04165] clears retired sheets from loaded saved games', () => {
    const saved = migrateSavedSpriteSheetState({
      useIntegratedSpriteSheetMode: true,
      activeSpriteSheetPath: 'images/map/sprite_sheets/dt_soil_1024_q85.webp',
      activeSpriteSheetMetadata: { sheetPath: 'images/map/sprite_sheets/major_sprite_sheet_default.webp' }
    })
    expect(saved.activeSpriteSheetPath).toBeNull()
    expect(saved.activeSpriteSheetMetadata).toBeNull()
    expect(saved.useIntegratedSpriteSheetMode).toBe(true)
  })
})

it('[U04166] preserves restored sheets in stored settings and saved games', () => {
  const restored = DEFAULT_SSE_SHEETS.find(path => path.includes('dtv6_decor_grass'))
  const storage = memoryStorage({
    'rts-sse-last-sheet': restored,
    'rts-integrated-spritesheet-selected-sheets': JSON.stringify([restored])
  })
  purgeRetiredSheetStorage(storage)
  expect(storage.getStoredItem('rts-sse-last-sheet')).toBe(restored)
  expect(migrateSavedSpriteSheetState({ activeSpriteSheetPath: restored }).activeSpriteSheetPath).toBe(restored)
})

it('[U04167] tags complete ruin footprints while preserving impassability and excluding huts', () => {
  DEFAULT_SSE_SHEETS.filter(path => /\/dtv\d+_/.test(path)).forEach(path => {
    const metadata = JSON.parse(readFileSync(`public/${path.replace('.webp', '.json')}`, 'utf8'))
    metadata.propLayout.forEach(prop => {
      const isRuin = prop.id.includes('ruin') || ['soil_collapsed_shed', 'universal_rubble_pile'].includes(prop.id)
      if (!isRuin) {
        if (prop.id.includes('adobe_hut')) expect(prop.tags).not.toContain('ruins')
        return
      }
      expect(prop.tags).toContain('ruins')
      for (let y = prop.row; y < prop.row + prop.h; y++) {
        for (let x = prop.col; x < prop.col + prop.w; x++) {
          const tags = metadata.tiles[`${x},${y}`].tags
          expect(tags).toContain('ruins')
          if (prop.tags.includes('impassable')) expect(tags).toContain('impassable')
        }
      }
    })
  })
})

describe('opt-out sheet selection', () => {
  const dir = 'images/map/sprite_sheets/'
  it('[U04168] always offers every bundled sheet even with a stale index.json', async() => {
    const { resolveAvailableSheetPaths } = await import('../../src/ui/spriteSheetRegistry.js')
    const stale = ['seasons_1024_q90_2', 'seasons_1024_q90_3', 'crystals_q90_1024x1024', 'rocks_64x64_1024x1024_q85', 'debris_craters_tracks'].map(n => `${dir}${n}.webp`)
    const available = resolveAvailableSheetPaths(stale, ['blob:uploaded', `/${dir}dtv5_city_temperate_medium.webp`])
    expect(available).toEqual([...DEFAULT_SSE_SHEETS, 'blob:uploaded'])
  })

  it('[U04169] derives the selection from opt-outs and ignores retired entries', async() => {
    const { parseDisabledSheetPaths, selectionFromDisabled, disabledFromSelection } = await import('../../src/ui/spriteSheetRegistry.js')
    const city = `${dir}dtv5_city_temperate_medium.webp`
    const disabled = parseDisabledSheetPaths(JSON.stringify([city, `${dir}seasons_1024_q90_2.webp`, 7]))
    expect(disabled).toEqual([city])
    expect(parseDisabledSheetPaths('not json')).toEqual([])
    const selection = selectionFromDisabled([...DEFAULT_SSE_SHEETS], disabled)
    expect(selection).toEqual(DEFAULT_SSE_SHEETS.filter(path => path !== city))
    expect(disabledFromSelection([...DEFAULT_SSE_SHEETS], selection, ['blob:gone'])).toEqual(['blob:gone', city])
  })
})

it.each(['dtv5_city_temperate_medium', 'dtv5_city_sand_medium', 'dtv5_city_snow_medium', 'dtv4_nature_sand', 'dtv4_nature_snow'])('[U05434] drops old %s grid overrides while preserving edits for the replacement layout', async(name) => {
  const { sanitizeAppliedSheetMetadata } = await import('../../src/ui/spriteSheetRegistry.js')
  const path = `images/map/sprite_sheets/${name}.webp`
  const old = { sheetPath: path, columns: 6, rows: 8, tiles: { '0,0': { tags: ['city'] } } }
  const current = { ...old, layoutVersion: ['dtv5_city_temperate_medium', 'dtv5_city_sand_medium', 'dtv5_city_snow_medium'].includes(name) ? 6 : 3, columns: 16 }
  const storage = memoryStorage({ [`rts-sse-metadata:${path}`]: JSON.stringify(old), 'rts-sse-applied-metadata': JSON.stringify(old) })
  purgeRetiredSheetStorage(storage)
  expect(storage.map.size).toBe(0)
  expect(sanitizeAppliedSheetMetadata(old)).toBeNull()
  if (current.layoutVersion === 6) for (const layoutVersion of [3, 5]) expect(sanitizeAppliedSheetMetadata({ ...old, layoutVersion })).toBeNull()
  expect(migrateSavedSpriteSheetState({ activeSpriteSheetMetadata: old }).activeSpriteSheetMetadata).toBeNull()
  storage.setStoredItem(`rts-sse-metadata:${path}`, JSON.stringify(current))
  purgeRetiredSheetStorage(storage)
  expect(storage.map.size).toBe(1)
  expect(sanitizeAppliedSheetMetadata(current)).toBe(current)
})

it.each(['dtv3_city', 'dtv4_city_sand', 'dtv4_city_snow', 'dtv2_grass', 'dtv2_soil', 'dtv2_sand', 'dtv2_snow', 'dtv2_universal', 'dtv3_shore', 'dtv3_winter'])('[U05453] retires removed %s art and stored coordinates', name => {
  const path = `images/map/sprite_sheets/${name}.webp`
  const storage = memoryStorage({ [`rts-sse-metadata:${path}`]: '{}', 'rts-sse-last-sheet': path, 'rts-sse-applied-metadata': JSON.stringify({ sheetPath: path }) })
  expect(isRetiredSpriteSheetPath(path)).toBe(true)
  expect(DEFAULT_SSE_SHEETS).not.toContain(path)
  expect(migrateSavedSpriteSheetState({ activeSpriteSheetPath: path, activeSpriteSheetMetadata: { sheetPath: path, layoutVersion: 6 } }).activeSpriteSheetMetadata).toBeNull()
  purgeRetiredSheetStorage(storage)
  expect(storage.map.size).toBe(0)
  expect(migrateSavedSpriteSheetState({ activeSpriteSheetPath: path, activeSpriteSheetMetadata: { sheetPath: path } }).activeSpriteSheetMetadata).toBeNull()
})

it.each(['dtv6_shore', 'dtv6_nature_grass', 'dtv6_nature_soil', ...['grass', 'soil', 'sand', 'snow', 'universal'].map(biome => `dtv6_decor_${biome}`)])('[U05457] rejects oversized layout overrides for %s while preserving calibrated edits', async name => {
  const { sanitizeAppliedSheetMetadata } = await import('../../src/ui/spriteSheetRegistry.js')
  const path = `images/map/sprite_sheets/${name}.webp`
  const old = { sheetPath: path, layoutVersion: 1, tiles: { '0,0': { tags: ['decorative', 'impassable'] } } }
  const storage = memoryStorage({ [`rts-sse-metadata:${path}`]: JSON.stringify(old), 'rts-sse-applied-metadata': JSON.stringify(old) })
  purgeRetiredSheetStorage(storage)
  expect(storage.map.size).toBe(0)
  expect(sanitizeAppliedSheetMetadata(old)).toBeNull()
  const current = { ...old, layoutVersion: 2 }
  expect(sanitizeAppliedSheetMetadata(current)).toBe(current)
})

it.each(['grass', 'soil'])('[U05459] enables the new %s large-nature sheet and preserves its current metadata', async biome => {
  const { sanitizeAppliedSheetMetadata } = await import('../../src/ui/spriteSheetRegistry.js')
  const sheetPath = `images/map/sprite_sheets/dtv7_nature_${biome}_large.webp`
  expect(DEFAULT_SSE_SHEETS).toContain(sheetPath)
  const metadata = JSON.parse(readFileSync(`public/${sheetPath.replace('.webp', '.json')}`, 'utf8'))
  expect(sanitizeAppliedSheetMetadata(metadata)).toBe(metadata)
  expect(sanitizeAppliedSheetMetadata({ ...metadata, layoutVersion: 0 })).toBeNull()
})
