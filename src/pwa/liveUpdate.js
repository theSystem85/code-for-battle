// Live updates for the dev branch deploy (and `npm run dev`).
//
// The page polls /build-info.json (written by scripts/liveUpdateBuildInfo.mjs).
// - Same jsSignature, different commit: only stylesheets (or release-note data)
//   changed. Swap the changed <link> stylesheets in place, no reload.
// - Different jsSignature: save the running game into the lastGame checkpoint,
//   mark it for auto-resume, activate the new service worker and reload. The
//   boot path (maybeResumeLastPausedGame) restores the save.
// Enabled only when the build sets __LIVE_UPDATE__ (dev branch deploy or
// CFB_LIVE_UPDATE=1); production builds never start it. See AGENTS.md, Deployment.
import { APP_VERSION } from '../version.js'
import versionInfo from '../version.json' with { type: 'json' }
import { UPDATE_RELOAD_GUARD } from './startupUpdate.js'

export const BUILD_INFO_URL = '/build-info.json'
export const LIVE_UPDATE_INTERVAL_MS = 20000
export const LIVE_UPDATE_APPLIED_KEY = 'cfb-live-update-applied'
export const LIVE_UPDATE_ATTEMPT_KEY = 'cfb-live-update-attempt'

function assetPath(href, base) {
  try {
    return new URL(href, base).pathname
  } catch {
    return String(href || '')
  }
}

// Old stylesheet path -> new path, for every stylesheet whose key changed.
export function planStylesheetSwaps(previous, next) {
  const swaps = new Map()
  const before = previous?.css || {}
  const after = next?.css || {}
  for (const [key, oldPath] of Object.entries(before)) {
    const newPath = after[key]
    if (!newPath || newPath === oldPath || swaps.has(oldPath)) continue
    swaps.set(oldPath, newPath)
  }
  return swaps
}

export function classifyBuildChange(previous, next) {
  if (!next || !previous) return 'none'
  if (next.commit === previous.commit && next.jsSignature === previous.jsSignature
    && JSON.stringify(next.css) === JSON.stringify(previous.css)) return 'none'
  return next.jsSignature === previous.jsSignature ? 'css' : 'js'
}

// Replace each changed <link rel="stylesheet">: the new link is inserted next to
// the old one and the old one is removed only after the new sheet loaded, so
// the page never renders unstyled.
export function swapStylesheets(doc, swaps, { timeoutMs = 10000 } = {}) {
  const links = [...doc.querySelectorAll('link[rel="stylesheet"]')]
  const jobs = []
  for (const link of links) {
    const path = assetPath(link.getAttribute('href'), doc.baseURI)
    const target = swaps.get(path)
    if (!target) continue
    const fresh = doc.createElement('link')
    fresh.rel = 'stylesheet'
    if (link.crossOrigin !== null && link.crossOrigin !== undefined) fresh.crossOrigin = link.crossOrigin
    fresh.href = target
    fresh.dataset.liveUpdate = 'true'
    jobs.push(new Promise(resolve => {
      let done = false
      const finish = ok => {
        if (done) return
        done = true
        if (ok) link.remove()
        else fresh.remove()
        resolve(ok)
      }
      fresh.addEventListener('load', () => finish(true), { once: true })
      fresh.addEventListener('error', () => finish(false), { once: true })
      setTimeout(() => finish(false), timeoutMs)
    }))
    link.after(fresh)
  }
  return Promise.all(jobs).then(results => results.filter(Boolean).length)
}

// A reload would drop a running multiplayer match: the joined client
// (isRemote), a pending/connected WebRTC session, or a host with a remote human
// in another party.
export function isMultiplayerActive(state) {
  const session = state?.multiplayerSession
  if (session?.isRemote) return true
  if (session?.status === 'connected' || session?.status === 'pending') return true
  const parties = Array.isArray(state?.partyStates) ? state.partyStates : []
  return parties.some(party => party && party.partyId !== state.humanPlayer
    && party.aiActive === false && Boolean(party.lastConnectedAt))
}

export function updateVersionLabels(doc, info) {
  if (!info) return
  const version = doc.getElementById('appVersion')
  if (version) version.textContent = `${info.version} (${info.commit})`
  const message = doc.getElementById('appCommitMessage')
  if (message) {
    message.textContent = info.message || ''
    message.style.display = message.textContent ? 'block' : 'none'
  }
  const loading = doc.getElementById('loadingScreenVersion')
  if (loading) loading.textContent = `v${info.version}`
}

async function activateWaitingServiceWorker(win, timeoutMs = 8000) {
  const serviceWorker = win.navigator?.serviceWorker
  if (!serviceWorker?.getRegistration) return
  const registration = await serviceWorker.getRegistration().catch(() => null)
  if (!registration) return
  await Promise.race([registration.update().catch(() => {}), new Promise(resolve => setTimeout(resolve, timeoutMs))])
  const installing = registration.installing
  if (installing) {
    await new Promise(resolve => {
      const timer = setTimeout(resolve, timeoutMs)
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' || installing.state === 'redundant') {
          clearTimeout(timer)
          resolve()
        }
      })
    })
  }
  const waiting = registration.waiting
  if (!waiting || !serviceWorker.controller) return
  await new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs)
    serviceWorker.addEventListener('controllerchange', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
    waiting.postMessage({ type: 'SKIP_WAITING' })
  })
}

export function createLiveUpdater({
  win = window,
  doc = document,
  fetchImpl = (...args) => win.fetch(...args),
  getGameState = () => null,
  notify = () => {},
  prepareReload = async() => {},
  reload = () => win.location.reload(),
  activateServiceWorker = () => activateWaitingServiceWorker(win),
  running = { version: APP_VERSION, commit: versionInfo?.commit || 'unknown' }
} = {}) {
  let baseline = null
  let busy = false
  let deferredNotified = false

  async function fetchInfo() {
    const response = await fetchImpl(`${BUILD_INFO_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (!response?.ok) return null
    return response.json()
  }

  async function applyJsUpdate(info) {
    if (isMultiplayerActive(getGameState())) {
      if (!deferredNotified) notify(`Update v${info.version} (${info.commit}) is ready. It loads after this match, on your next reload.`)
      deferredNotified = true
      return 'deferred'
    }
    let attempt = null
    try { attempt = win.sessionStorage?.getItem(LIVE_UPDATE_ATTEMPT_KEY) } catch { /* optional */ }
    // A reload for this commit already happened and the old code came back: stop.
    if (attempt === info.commit) return 'stuck'
    notify(`Updating to v${info.version} (${info.commit}). Your game is saved and comes right back.`)
    await prepareReload()
    await activateServiceWorker()
    try {
      win.sessionStorage?.setItem(LIVE_UPDATE_ATTEMPT_KEY, info.commit)
      win.sessionStorage?.setItem(LIVE_UPDATE_APPLIED_KEY, JSON.stringify({ version: info.version, commit: info.commit }))
      // The new worker is already active; the startup check must not reload again.
      win.sessionStorage?.setItem(UPDATE_RELOAD_GUARD, '1')
    } catch { /* optional */ }
    reload()
    return 'reload'
  }

  async function check() {
    if (busy) return 'busy'
    busy = true
    try {
      const info = await fetchInfo().catch(() => null)
      if (!info) return 'offline'
      if (!baseline) {
        if (info.commit === running.commit) {
          baseline = info
          return 'baseline'
        }
        // A deploy landed before the first poll, so the running build's
        // stylesheet map is unknown. Reload to be safe.
        return applyJsUpdate(info)
      }
      const change = classifyBuildChange(baseline, info)
      if (change === 'none') return 'none'
      if (change === 'css') {
        const swapped = await swapStylesheets(doc, planStylesheetSwaps(baseline, info))
        updateVersionLabels(doc, info)
        baseline = info
        notify(`Live update ${info.commit}: ${swapped ? 'styles refreshed' : 'no visible changes'}, no reload.`)
        return 'css'
      }
      return applyJsUpdate(info)
    } finally {
      busy = false
    }
  }

  return { check, getBaseline: () => baseline }
}

export function announceAppliedUpdate({ win = window, notify = () => {}, running = { commit: versionInfo?.commit } } = {}) {
  let applied = null
  try {
    applied = JSON.parse(win.sessionStorage?.getItem(LIVE_UPDATE_APPLIED_KEY) || 'null')
    win.sessionStorage?.removeItem(LIVE_UPDATE_APPLIED_KEY)
    if (applied?.commit === running.commit) win.sessionStorage?.removeItem(LIVE_UPDATE_ATTEMPT_KEY)
  } catch { /* optional */ }
  if (applied?.commit && applied.commit === running.commit) {
    notify(`Updated to v${applied.version} (${applied.commit}). Your game was restored.`)
    return true
  }
  return false
}

export async function startLiveUpdate({ intervalMs = LIVE_UPDATE_INTERVAL_MS } = {}) {
  const [{ showNotification }, { gameState }, { prepareForLiveUpdateReload }] = await Promise.all([
    import('../ui/notifications.js'),
    import('../gameState.js'),
    import('../saveGame.js')
  ])
  const notify = message => showNotification(message, 4000)

  if (import.meta.hot) {
    // `npm run dev`: Vite swaps CSS itself; before a full reload for a JS
    // change, keep the running game so the boot restores it.
    import.meta.hot.on('vite:beforeFullReload', () => { void prepareForLiveUpdateReload() })
    return null
  }

  setTimeout(() => announceAppliedUpdate({ notify }), 1500)
  const updater = createLiveUpdater({
    getGameState: () => gameState,
    notify,
    prepareReload: () => prepareForLiveUpdateReload()
  })
  void updater.check()
  setInterval(() => { void updater.check() }, intervalMs)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void updater.check()
  })
  return updater
}
