// Single source of truth for the bundled static sprite sheets. Shared by the
// map settings (integrated sprite-sheet mode) and the Sprite Sheet Editor so
// the two lists cannot drift apart again.

const SHEET_DIR = 'images/map/sprite_sheets/'

// Vite resolves availability at build time; missing future sheets never enter
// either picker. Both image and metadata must exist before registration.
// Besides the required dtv3 sheets, any other bundled `dtv<N>_<name>` pair
// (for example a biome nature sheet such as `dtv6_nature_soil`) is
// registered automatically, so dropping its .webp + .json into the folder is
// enough to offer it.
const futureSheetFiles = import.meta.glob('/public/images/map/sprite_sheets/dtv*_*.{webp,json}', { eager: true, query: '?url', import: 'default' })
const REQUIRED_FUTURE_SHEETS = Object.freeze(['dtv3_ground_detail'])
export function availableFutureSheets(files = {}, warn = console.warn) {
  files = files || {}
  const prefixOf = name => `/public/${SHEET_DIR}${name}`
  const hasPair = name => Object.hasOwn(files, `${prefixOf(name)}.webp`) && Object.hasOwn(files, `${prefixOf(name)}.json`)
  const required = REQUIRED_FUTURE_SHEETS.flatMap(name => {
    if (hasPair(name)) return [`${SHEET_DIR}${name}.webp`]
    warn(`Skipping unavailable optional sprite sheet: ${name}`)
    return []
  })
  const known = new Set(REQUIRED_FUTURE_SHEETS)
  const discovered = [...new Set(Object.keys(files || {})
    .map(path => path.match(/\/(dtv\d+_[A-Za-z0-9_-]+)\.(?:webp|json)$/)?.[1])
    .filter(name => name && !known.has(name) && hasPair(name)))]
    .sort()
    .map(name => `${SHEET_DIR}${name}.webp`)
  return [...required, ...discovered]
}

// Every bundled dtv sheet is part of the initial selection. The discovered
// tail makes future dtv image/metadata pairs opt-out without another registry edit.
export const DEFAULT_SSE_SHEETS = Object.freeze([
  `${SHEET_DIR}debris_craters_tracks.webp`,
  ...availableFutureSheets(futureSheetFiles)
])

export const OPTIONAL_SSE_SHEETS = Object.freeze([])

// Sheets that used to ship and were removed. Stored settings, editor state and
// saved games that still point at them must fall back to the defaults.
export const RETIRED_SPRITE_SHEET_PATHS = Object.freeze(new Set([
  ...['dtv3_city', 'dtv4_city_sand', 'dtv4_city_snow', 'dtv2_grass', 'dtv2_soil', 'dtv2_sand', 'dtv2_snow', 'dtv2_universal', 'dtv3_shore', 'dtv3_winter'].map(name => `${SHEET_DIR}${name}.webp`),
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
  `${SHEET_DIR}rockCliffsMountains_64x64_1024x1024.webp`,
  `${SHEET_DIR}seasons_1024_q90_2.webp`,
  `${SHEET_DIR}seasons_1024_q90_3.webp`,
  `${SHEET_DIR}rocks_64x64_1024x1024_q85.webp`
]))

// Built-in resource art is deliberately absent from both pickers, but is not
// retired: TextureManager still preloads it for ore and seed crystals.
const NON_SELECTABLE_SPRITE_SHEET_PATHS = new Set([
  `${SHEET_DIR}crystals_q90_1024x1024.webp`
])

// Map settings store the sheets the user explicitly unchecked (opt-outs), so
// newly shipped default sheets are enabled automatically for existing users.
// The older whitelist key is only read to migrate it away.
export const DISABLED_SHEETS_STORAGE_KEY = 'rts-integrated-spritesheet-disabled-sheets'
export const LEGACY_SELECTED_SHEETS_STORAGE_KEY = 'rts-integrated-spritesheet-selected-sheets'

/**
 * Every sheet the pickers must offer: the bundled registry first (resolved at
 * build time, so a stale cached index.json can never hide a shipped sheet),
 * then any extra index.json entries and user-added sheets. Retired and
 * non-selectable sheets are dropped silently.
 */
export function resolveAvailableSheetPaths(indexSheets = [], extraSheets = []) {
  const merged = []
  const seen = new Set()
  for (const sheetPath of [...DEFAULT_SSE_SHEETS, ...OPTIONAL_SSE_SHEETS, ...(Array.isArray(indexSheets) ? indexSheets : []), ...(Array.isArray(extraSheets) ? extraSheets : [])]) {
    if (typeof sheetPath !== 'string' || !sheetPath.trim()) continue
    const normalized = sheetPath.startsWith('blob:') ? sheetPath : normalizeSheetPath(sheetPath)
    if (seen.has(normalized) || isRetiredSpriteSheetPath(normalized) || NON_SELECTABLE_SPRITE_SHEET_PATHS.has(normalized)) continue
    seen.add(normalized)
    merged.push(normalized)
  }
  return merged
}

/** Parse the stored opt-out list; anything unusable means "no opt-outs". */
export function parseDisabledSheetPaths(raw) {
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { return [] }
  }
  if (!Array.isArray(parsed)) return []
  return [...new Set(parsed.filter(path => typeof path === 'string' && path.trim() && !isRetiredSpriteSheetPath(path)).map(path => path.startsWith('blob:') ? path : normalizeSheetPath(path)))]
}

/** Enabled sheets = every available sheet the user did not explicitly uncheck. */
export function selectionFromDisabled(availableSheets = [], disabledSheets = []) {
  const disabled = new Set(disabledSheets)
  return availableSheets.filter(path => !disabled.has(path))
}

/** Opt-outs to store for a given available list and current selection. */
export function disabledFromSelection(availableSheets = [], selectedSheets = [], previousDisabled = []) {
  const selected = new Set(selectedSheets)
  const available = new Set(availableSheets)
  // Keep opt-outs for sheets that are temporarily not offered (e.g. an
  // uploaded sheet from another session) so they stay unchecked later.
  const kept = previousDisabled.filter(path => !available.has(path))
  return [...new Set([...kept, ...availableSheets.filter(path => !selected.has(path))])]
}

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
  return sheetPaths.filter(path => typeof path === 'string' && path.trim() &&
    !isRetiredSpriteSheetPath(path) && !NON_SELECTABLE_SPRITE_SHEET_PATHS.has(normalizeSheetPath(path)))
}

// Native-size source atlases have new grids. Saved editor coordinates from
// earlier layouts cannot be applied to their repacked pixels.
export function isSupersededSheetMetadata(metadata) {
  const path = normalizeSheetPath(metadata?.sheetPath)
  if (['temperate', 'sand', 'snow'].flatMap(biome => ['low', 'medium'].map(level => `dtv5_city_${biome}_${level}`)).some(name => path === `${SHEET_DIR}${name}.webp`)) return metadata.layoutVersion !== 6
  return ['dtv4_nature_sand', 'dtv4_nature_snow'].some(name => path === `${SHEET_DIR}${name}.webp`) && metadata.layoutVersion !== 3
}

/**
 * Drop applied metadata that references a retired sheet.
 * Returns null when the metadata is unusable so callers fall back to defaults.
 */
export function sanitizeAppliedSheetMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null
  if (isRetiredSpriteSheetPath(metadata.sheetPath) || isSupersededSheetMetadata(metadata)) return null
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
      if (isRetiredSpriteSheetPath(key.slice('rts-sse-metadata:'.length)) || isSupersededSheetMetadata({ ...parse(storage.getStoredItem(key)), sheetPath: key.slice('rts-sse-metadata:'.length) })) remove(key)
    })
    const lastSheet = storage.getStoredItem('rts-sse-last-sheet')
    if (lastSheet && isRetiredSpriteSheetPath(lastSheet)) remove('rts-sse-last-sheet')
    const applied = storage.getStoredItem('rts-sse-applied-metadata')
    if (applied && (isRetiredSpriteSheetPath(parse(applied)?.sheetPath) || isSupersededSheetMetadata(parse(applied)))) remove('rts-sse-applied-metadata')
    const selected = parse(storage.getStoredItem('rts-integrated-spritesheet-selected-sheets'))
    if (Array.isArray(selected) && selected.some(path => isRetiredSpriteSheetPath(path) || NON_SELECTABLE_SPRITE_SHEET_PATHS.has(normalizeSheetPath(path)))) {
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
  if (savedGameState.activeSpriteSheetMetadata && !sanitizeAppliedSheetMetadata(savedGameState.activeSpriteSheetMetadata)) {
    savedGameState.activeSpriteSheetMetadata = null
  }
  return savedGameState
}
