// Single source of truth for the bundled static sprite sheets. Shared by the
// map settings (integrated sprite-sheet mode) and the Sprite Sheet Editor so
// the two lists cannot drift apart again.

const SHEET_DIR = 'images/map/sprite_sheets/'

export const DEFAULT_SSE_SHEETS = Object.freeze([
  `${SHEET_DIR}streets24_q90_1024x1024.webp`,
  `${SHEET_DIR}seasons_1024_q90_2.webp`,
  `${SHEET_DIR}seasons_1024_q90_3.webp`,
  `${SHEET_DIR}crystals_q90_1024x1024.webp`,
  `${SHEET_DIR}rocks_64x64_1024x1024_q85.webp`,
  `${SHEET_DIR}rockCliffsMountains_64x64_1024x1024.webp`,
  `${SHEET_DIR}debris_craters_tracks.webp`
])

// Vite resolves availability at build time; missing future sheets never enter
// either picker. Both image and metadata must exist before registration.
const futureSheetFiles = import.meta.glob('/public/images/map/sprite_sheets/dtv3_*.{webp,json}', { eager: true, query: '?url', import: 'default' })
export function availableFutureSheets(files, warn = console.warn) {
  return ['dtv3_ground_detail', 'dtv3_shore', 'dtv3_city'].flatMap(name => {
    const prefix = `/public/${SHEET_DIR}${name}`
    if (Object.hasOwn(files, `${prefix}.webp`) && Object.hasOwn(files, `${prefix}.json`)) return [`${SHEET_DIR}${name}.webp`]
    warn(`Skipping unavailable optional sprite sheet: ${name}`)
    return []
  })
}

export const OPTIONAL_SSE_SHEETS = Object.freeze([
  `${SHEET_DIR}dtv2_grass.webp`,
  `${SHEET_DIR}dtv2_soil.webp`,
  `${SHEET_DIR}dtv2_sand.webp`,
  `${SHEET_DIR}dtv2_snow.webp`,
  `${SHEET_DIR}dtv2_universal.webp`,
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
  `${SHEET_DIR}multiTerrainSpriteSheet.webp`
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
