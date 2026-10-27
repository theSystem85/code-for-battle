import { getStoredItem, setStoredItem } from '../storage/indexedDbStorage.js'

export const SEAMLESS_UPDATE_SETTING = 'rts_seamless_updates'
export function isSeamlessUpdateEnabled() {
  return getStoredItem(SEAMLESS_UPDATE_SETTING) === 'true'
}
export function setSeamlessUpdateEnabled(enabled) {
  setStoredItem(SEAMLESS_UPDATE_SETTING, String(Boolean(enabled)))
}
