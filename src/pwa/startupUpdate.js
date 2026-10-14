// Keep this module independent of the game: no assets or world setup before preflight.
export const UPDATE_RELOAD_GUARD = 'cfb-sw-update-reload'

function bounded(promise, timeoutMs) {
  let timer
  return Promise.race([
    promise,
    new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs) })
  ]).finally(() => clearTimeout(timer))
}

function waitForInstall(registration, timeoutMs) {
  const worker = registration.installing
  if (!worker || worker.state === 'installed' || worker.state === 'redundant') return Promise.resolve()
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer)
      worker.removeEventListener('statechange', changed)
      resolve()
    }
    const changed = () => {
      if (worker.state === 'installed' || worker.state === 'redundant') finish()
    }
    const timer = setTimeout(finish, timeoutMs)
    worker.addEventListener('statechange', changed)
    changed()
  })
}

export async function checkStartupUpdate({ win = window, enabled = import.meta.env.PROD, timeoutMs = 12000, onStatus = () => {} } = {}) {
  const serviceWorker = win.navigator?.serviceWorker
  if (!enabled || !serviceWorker || win.navigator.onLine === false) return false
  try {
    if (win.localStorage?.getItem('cfb-forced-offline') === '1') return false
    // A reload already activated the update. Never cycle through repeated reloads.
    if (win.sessionStorage?.getItem(UPDATE_RELOAD_GUARD) === '1') return false
    onStatus('Checking for updates')
    const registration = await bounded(serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }), timeoutMs)
    if (!registration) return false
    // Explicitly check even when the browser would throttle its automatic check.
    await bounded(registration.update().catch(() => null), timeoutMs)
    if (registration.installing) {
      onStatus('Downloading update')
      await waitForInstall(registration, timeoutMs)
    }
    const waiting = registration.waiting
    if (!waiting || !serviceWorker.controller) return false
    onStatus('Installing update')
    // This listener must exist before SKIP_WAITING to avoid missing fast activation.
    const activated = new Promise(resolve => {
      const changed = () => {
        clearTimeout(timer)
        serviceWorker.removeEventListener('controllerchange', changed)
        resolve(true)
      }
      const timer = setTimeout(() => {
        serviceWorker.removeEventListener('controllerchange', changed)
        resolve(false)
      }, timeoutMs)
      serviceWorker.addEventListener('controllerchange', changed)
      waiting.postMessage({ type: 'SKIP_WAITING' })
    })
    if (!await activated) return false
    try { win.sessionStorage?.setItem(UPDATE_RELOAD_GUARD, '1') } catch { /* Storage is optional. */ }
    win.location.reload()
    return true
  } catch {
    // Offline or failed installs must still allow the cached game to start.
    return false
  }
}
