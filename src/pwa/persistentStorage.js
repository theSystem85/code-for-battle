export function isStandaloneDisplayMode(target) {
  const win = target || (typeof window !== 'undefined' ? window : null)
  if (!win) return false
  try {
    if (win.matchMedia?.('(display-mode: standalone)')?.matches === true) return true
  } catch {
    // matchMedia can throw in locked-down webviews.
  }
  return win.navigator?.standalone === true
}

export async function requestPersistentStorage(storage, { standalone = true, force = false } = {}) {
  if (!storage || typeof storage.persist !== 'function') {
    return { supported: false, persisted: false, called: false }
  }
  let already = false
  if (typeof storage.persisted === 'function') {
    try {
      already = await storage.persisted() === true
    } catch {
      already = false
    }
  }
  if (already) return { supported: true, persisted: true, called: false }
  if (standalone !== true && force !== true) {
    return { supported: true, persisted: false, called: false }
  }
  try {
    const granted = await storage.persist()
    return { supported: true, persisted: granted === true, called: true }
  } catch (error) {
    return {
      supported: true,
      persisted: false,
      called: true,
      error: error?.message || String(error)
    }
  }
}

export function formatPersistentStorageStatus(result, copy = {}) {
  if (!result) return ''
  if (result.supported === false) return copy.unavailable || 'Storage: persistence unavailable'
  if (result.persisted === true) return copy.persistent || 'Storage: persistent'
  return copy.temporary || 'Storage: not persistent'
}
