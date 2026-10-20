import { getStoredItem, setStoredItem } from '../storage/indexedDbStorage.js'

const KEYS = {
  autoActivate: 'rts_auto_activate_building_placement',
  autoAdvance: 'rts_auto_advance_building_placement'
}
let loaded = false
const settings = { autoActivate: true, autoAdvance: true }

export function getProductionPlacementSettings() {
  if (!loaded) {
    for (const [name, key] of Object.entries(KEYS)) {
      try { settings[name] = getStoredItem(key) !== 'false' } catch { settings[name] = true }
    }
    loaded = true
  }
  return settings
}

export function setProductionPlacementSetting(name, enabled) {
  if (!Object.hasOwn(KEYS, name)) return
  getProductionPlacementSettings()[name] = Boolean(enabled)
  try { setStoredItem(KEYS[name], String(Boolean(enabled))) } catch { /* Keep the session preference when storage is unavailable. */ }
}
