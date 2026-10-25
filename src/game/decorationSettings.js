// Shared by generation, saves, URL inputs and host map snapshots.
//
// The fine-grained decorative counts are the source of truth. The overall
// decorative-tile count is always their sum, so the sidebar cannot show a
// total that disagrees with the parts.

export const DECORATION_PART_KEYS = Object.freeze([
  'stoneCount',
  'singleTreeCount',
  'woodsCount',
  'otherVegetationCount',
  'groundDetailCount'
])

// Piece counts from the legacy probabilistic placer on an open 200×200 map.
// Defaults are about 3% of that mix. Lakes default to about 30% of the legacy
// lake count. Raising a control restores the fuller map.
export const DECORATION_FULL_REFERENCE = Object.freeze({
  stoneCount: 40,
  singleTreeCount: 350,
  woodsCount: 20,
  otherVegetationCount: 200,
  groundDetailCount: 485,
  lakeCount: 365
})

export const DECORATION_DEFAULT_SCALE = 0.03
export const LAKE_DEFAULT_SCALE = 0.3

const scaledReference = (key, scale) => Math.round(DECORATION_FULL_REFERENCE[key] * scale)

const PART_DEFAULTS = Object.freeze({
  stoneCount: scaledReference('stoneCount', DECORATION_DEFAULT_SCALE),
  singleTreeCount: scaledReference('singleTreeCount', DECORATION_DEFAULT_SCALE),
  woodsCount: scaledReference('woodsCount', DECORATION_DEFAULT_SCALE),
  otherVegetationCount: scaledReference('otherVegetationCount', DECORATION_DEFAULT_SCALE),
  groundDetailCount: scaledReference('groundDetailCount', DECORATION_DEFAULT_SCALE)
})

const DECORATIVE_TILE_DEFAULT = DECORATION_PART_KEYS.reduce((sum, key) => sum + PART_DEFAULTS[key], 0)
const DECORATIVE_TILE_MAX = 400 + 2000 + 400 + 2000 + 4000

export const DECORATION_SETTINGS = Object.freeze({
  citySeeds: { default: 4, min: 0, max: 8 },
  cityClusterSize: { default: 8, min: 3, max: 20 },
  cityDensityFactor: { default: 100, min: 0, max: 200 },
  ruinSeeds: { default: 3, min: 0, max: 10 },
  ruinClusterSize: { default: 7, min: 3, max: 20 },
  lakeCount: { default: scaledReference('lakeCount', LAKE_DEFAULT_SCALE), min: 0, max: 800 },
  decorativeTileCount: { default: DECORATIVE_TILE_DEFAULT, min: 0, max: DECORATIVE_TILE_MAX },
  stoneCount: { default: PART_DEFAULTS.stoneCount, min: 0, max: 400 },
  woodClusterCount: { default: 4, min: 0, max: 24 },
  woodClusterRadius: { default: 11, min: 3, max: 30 },
  singleTreeCount: { default: PART_DEFAULTS.singleTreeCount, min: 0, max: 2000 },
  woodsCount: { default: PART_DEFAULTS.woodsCount, min: 0, max: 400 },
  otherVegetationCount: { default: PART_DEFAULTS.otherVegetationCount, min: 0, max: 2000 },
  groundDetailCount: { default: PART_DEFAULTS.groundDetailCount, min: 0, max: 4000 }
})

function clampSetting(key, value) {
  const rule = DECORATION_SETTINGS[key]
  const numeric = value == null || value === '' ? rule.default : Number(value)
  if (!Number.isFinite(numeric)) return rule.default
  return Math.max(rule.min, Math.min(rule.max, Math.floor(numeric)))
}

export function decorativeTileTotal(settings = {}) {
  return DECORATION_PART_KEYS.reduce((sum, key) => sum + clampSetting(key, settings[key]), 0)
}

export function normalizeDecorationSettings(settings = {}) {
  const normalized = Object.fromEntries(Object.keys(DECORATION_SETTINGS).map(key => [key, clampSetting(key, settings[key])]))
  normalized.decorativeTileCount = decorativeTileTotal(normalized)
  return normalized
}

/**
 * Scale the fine-grained counts so they sum to `total`, keeping their current
 * ratios. A zero mix falls back to the legacy full-budget ratios.
 */
export function distributeDecorativeTiles(total, current = {}) {
  const normalized = normalizeDecorationSettings(current)
  const target = clampSetting('decorativeTileCount', total)
  const currentParts = DECORATION_PART_KEYS.map(key => normalized[key])
  const currentSum = currentParts.reduce((sum, value) => sum + value, 0)
  const weights = currentSum > 0 ? currentParts : DECORATION_PART_KEYS.map(key => DECORATION_FULL_REFERENCE[key])
  const weightSum = weights.reduce((sum, value) => sum + value, 0)
  const raw = weights.map(weight => (target * weight) / weightSum)
  const floors = raw.map(value => Math.floor(value))
  let remainder = target - floors.reduce((sum, value) => sum + value, 0)
  const order = raw.map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  let guard = 0
  while (remainder > 0 && guard < DECORATION_PART_KEYS.length + 1) {
    let progressed = false
    for (const entry of order) {
      if (remainder <= 0) break
      const key = DECORATION_PART_KEYS[entry.index]
      if (floors[entry.index] >= DECORATION_SETTINGS[key].max) continue
      floors[entry.index] += 1
      remainder -= 1
      progressed = true
    }
    if (!progressed) break
    guard += 1
  }
  const parts = Object.fromEntries(DECORATION_PART_KEYS.map((key, index) => [key, floors[index]]))
  return normalizeDecorationSettings({ ...normalized, ...parts })
}

export function syncDecorationSettings(settings, changedKey, rawValue) {
  if (!Object.prototype.hasOwnProperty.call(DECORATION_SETTINGS, changedKey)) return normalizeDecorationSettings(settings)
  if (changedKey === 'decorativeTileCount') return distributeDecorativeTiles(rawValue, settings)
  return normalizeDecorationSettings({ ...settings, [changedKey]: rawValue })
}
