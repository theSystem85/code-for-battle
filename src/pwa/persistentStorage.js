const PERSIST_CALL_TIMEOUT_MS = 4000

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('persistent storage timed out')), ms)
    Promise.resolve(promise).then(value => {
      clearTimeout(timer)
      resolve(value)
    }, error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

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

export async function requestPersistentStorage(storage, { standalone = true, force = false, timeoutMs = PERSIST_CALL_TIMEOUT_MS } = {}) {
  if (!storage || typeof storage.persist !== 'function') {
    return { supported: false, persisted: false, called: false }
  }
  let already = false
  if (typeof storage.persisted === 'function') {
    try {
      already = await withTimeout(storage.persisted(), timeoutMs) === true
    } catch {
      already = false
    }
  }
  if (already) return { supported: true, persisted: true, called: false }
  if (standalone !== true && force !== true) {
    return { supported: true, persisted: false, called: false }
  }
  try {
    const granted = await withTimeout(storage.persist(), timeoutMs)
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
