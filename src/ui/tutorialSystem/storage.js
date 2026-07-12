import { getStoredItem, setStoredItem } from '../../storage/indexedDbStorage.js'

export function readFromStorage(key, fallback) {
  try {
    const raw = getStoredItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) }
  } catch (err) {
    window.logger?.warn?.('Failed to read tutorial storage:', err)
    return fallback
  }
}

export function writeToStorage(key, payload) {
  try {
    setStoredItem(key, JSON.stringify(payload))
  } catch (err) {
    window.logger?.warn?.('Failed to write tutorial storage:', err)
  }
}
