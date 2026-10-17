// Shared by generation, saves, URL inputs and host map snapshots.
export const DECORATION_SETTINGS = Object.freeze({
  citySeeds: { default: 2, min: 0, max: 8 },
  cityClusterSize: { default: 8, min: 3, max: 20 },
  ruinSeeds: { default: 3, min: 0, max: 10 },
  ruinClusterSize: { default: 7, min: 3, max: 20 },
  stoneCount: { default: 40, min: 0, max: 400 }
})

export function normalizeDecorationSettings(settings = {}) {
  return Object.fromEntries(Object.entries(DECORATION_SETTINGS).map(([key, rule]) => {
    const value = settings[key] == null || settings[key] === '' ? rule.default : Number(settings[key])
    return [key, Number.isFinite(value) ? Math.max(rule.min, Math.min(rule.max, Math.floor(value))) : rule.default]
  }))
}
