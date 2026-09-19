const STORAGE_KEY = 'codeForBattle.functionTimingsEnabled'

function readStoredPreference() {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

let enabled = readStoredPreference()
const listeners = new Set()

export function isFunctionTimingEnabled() {
  return enabled
}

export function setFunctionTimingEnabled(nextEnabled) {
  enabled = Boolean(nextEnabled)
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled))
    } catch {
      // Storage can be unavailable in private browsing or restricted embeds.
    }
  }
  listeners.forEach(listener => listener(enabled))
  return enabled
}

export function subscribeFunctionTiming(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetFunctionTimingForTests() {
  enabled = false
  listeners.clear()
}
