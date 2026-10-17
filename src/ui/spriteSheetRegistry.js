// Single source of truth for the bundled static sprite sheets. Shared by the
// map settings (integrated sprite-sheet mode) and the Sprite Sheet Editor so
// the two lists cannot drift apart again.

const SHEET_DIR = 'images/map/sprite_sheets/'

export const DEFAULT_SSE_SHEETS = Object.freeze([
  `${SHEET_DIR}seasons_1024_q90_2.webp`,
  `${SHEET_DIR}seasons_1024_q90_3.webp`,
  `${SHEET_DIR}crystals_q90_1024x1024.webp`,
  `${SHEET_DIR}rocks_64x64_1024x1024_q85.webp`,
  `${SHEET_DIR}debris_craters_tracks.webp`
])

// Vite resolves availability at build time; missing future sheets never enter
// either picker. Both image and metadata must exist before registration.
// Besides the required dtv3 sheets, any other bundled `dtv<N>_<name>` pair
// (for example a future snow-tagged winter sheet such as `dtv3_winter`) is
// registered automatically, so dropping its .webp + .json into the folder is
// enough to offer it.
const futureSheetFiles = import.meta.glob('/public/images/map/sprite_sheets/dtv*_*.{webp,json}', { eager: true, query: '?url', import: 'default' })
const REQUIRED_FUTURE_SHEETS = Object.freeze(['dtv3_ground_detail', 'dtv3_shore', 'dtv3_city'])
const BASE_OPTIONAL_SHEETS = Object.freeze(['dtv2_grass', 'dtv2_soil', 'dtv2_sand', 'dtv2_snow', 'dtv2_universal'])
export function availableFutureSheets(files = {}, warn = console.warn) {
  files = files || {}
  const prefixOf = name => `/public/${SHEET_DIR}${name}`
  const hasPair = name => Object.hasOwn(files, `${prefixOf(name)}.webp`) && Object.hasOwn(files, `${prefixOf(name)}.json`)
  const required = REQUIRED_FUTURE_SHEETS.flatMap(name => {
    if (hasPair(name)) return [`${SHEET_DIR}${name}.webp`]
    warn(`Skipping unavailable optional sprite sheet: ${name}`)
    return []
  })
  const known = new Set([...REQUIRED_FUTURE_SHEETS, ...BASE_OPTIONAL_SHEETS])
  const discovered = [...new Set(Object.keys(files || {})
    .map(path => path.match(/\/(dtv\d+_[A-Za-z0-9_-]+)\.(?:webp|json)$/)?.[1])
    .filter(name => name && !known.has(name) && hasPair(name)))]
    .sort()
    .map(name => `${SHEET_DIR}${name}.webp`)
  return [...required, ...discovered]
}

export const OPTIONAL_SSE_SHEETS = Object.freeze([
  ...BASE_OPTIONAL_SHEETS.map(name => `${SHEET_DIR}${name}.webp`),
  ...availableFutureSheets(futureSheetFiles)
])

// Sheets that used to ship and were removed. Stored settings, editor state and
// saved games that still point at them must fall back to the defaults.
export const RETIRED_SPRITE_SHEET_PATHS = Object.freeze(new Set([
  `${SHEET_DIR}dt_grass_1024_q85.webp`,
  `${SHEET_DIR}dt_soil_1024_q85.webp`,
  `${SHEET_DIR}dt_sand_1024_q85.webp`,
  `${SHEET_DIR}dt_snow_1024_q85.webp`,
  `${SHEET_DIR}dt_universal_1024_q85.webp`,
  `${SHEET_DIR}major_sprite_sheet_default.webp`,
  `${SHEET_DIR}grass.webp`,
  `${SHEET_DIR}soil.webp`,
  `${SHEET_DIR}snow.webp`,
  `${SHEET_DIR}desert.webp`,
  `${SHEET_DIR}water.webp`,
  `${SHEET_DIR}multiTerrainSpriteSheet.webp`,
  // Removed in 0.62.0: streets and rock cliffs come from the organic terrain art.
  `${SHEET_DIR}streets24_q90_1024x1024.webp`,
  `${SHEET_DIR}rockCliffsMountains_64x64_1024x1024.webp`
]))

export function normalizeSheetPath(sheetPath) {
  if (typeof sheetPath !== 'string') return ''
  return sheetPath.trim().replace(/^\/+/, '')
}

export function isRetiredSpriteSheetPath(sheetPath) {
  const normalized = normalizeSheetPath(sheetPath)
  return Boolean(normalized) && RETIRED_SPRITE_SHEET_PATHS.has(normalized)
}

export function filterRetiredSheetPaths(sheetPaths) {
  if (!Array.isArray(sheetPaths)) return []
  return sheetPaths.filter(path => typeof path === 'string' && path.trim() && !isRetiredSpriteSheetPath(path))
}

/**
 * Drop applied metadata that references a retired sheet.
 * Returns null when the metadata is unusable so callers fall back to defaults.
 */
export function sanitizeAppliedSheetMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null
  if (isRetiredSpriteSheetPath(metadata.sheetPath)) return null
  return metadata
}

/**
 * Remove stored keys that point at retired sheets: per-sheet editor metadata,
 * the applied metadata, the editor's last-opened sheet and the selection list.
 * `storage` exposes getStoredItem/setStoredItem/removeStoredItem/getStoredKeys.
 */
export function purgeRetiredSheetStorage(storage) {
  if (!storage || typeof storage.getStoredItem !== 'function') return []
  const removed = []
  const remove = (key) => {
    try {
      storage.removeStoredItem(key)
      removed.push(key)
    } catch {
      // ignore storage failures
    }
  }
  const parse = (raw) => {
    try { return JSON.parse(raw) } catch { return null }
  }
  try {
    const keys = typeof storage.getStoredKeys === 'function' ? storage.getStoredKeys('rts-sse-metadata:') : []
    keys.forEach((key) => {
      if (isRetiredSpriteSheetPath(key.slice('rts-sse-metadata:'.length))) remove(key)
    })
    const lastSheet = storage.getStoredItem('rts-sse-last-sheet')
    if (lastSheet && isRetiredSpriteSheetPath(lastSheet)) remove('rts-sse-last-sheet')
    const applied = storage.getStoredItem('rts-sse-applied-metadata')
    if (applied && isRetiredSpriteSheetPath(parse(applied)?.sheetPath)) remove('rts-sse-applied-metadata')
    const selected = parse(storage.getStoredItem('rts-integrated-spritesheet-selected-sheets'))
    if (Array.isArray(selected) && selected.some(isRetiredSpriteSheetPath)) {
      storage.setStoredItem('rts-integrated-spritesheet-selected-sheets', JSON.stringify(filterRetiredSheetPaths(selected)))
    }
  } catch {
    // ignore
  }
  return removed
}

/** Normalise the sprite-sheet part of a loaded saved game in place. */
export function migrateSavedSpriteSheetState(savedGameState) {
  if (!savedGameState || typeof savedGameState !== 'object') return savedGameState
  if (isRetiredSpriteSheetPath(savedGameState.activeSpriteSheetPath)) {
    savedGameState.activeSpriteSheetPath = null
  }
  if (savedGameState.activeSpriteSheetMetadata && isRetiredSpriteSheetPath(savedGameState.activeSpriteSheetMetadata.sheetPath)) {
    savedGameState.activeSpriteSheetMetadata = null
  }
  return savedGameState
}
