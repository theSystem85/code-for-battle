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
import { GAME_STATE_SCHEMA_VERSION } from '../gameStateSchema.js'
import { UPDATE_RELOAD_GUARD } from './startupUpdate.js'
import { createLiveSwapScheduler, setActiveLiveSwapScheduler } from './liveSwapScheduler.js'
import { getLiveModule } from './liveModuleRegistry.js'

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

// 'safe': only stylesheets or release-note data changed, applied live.
// 'breaking': JS changed, the state schema changed or the deploy's commit
// trailer says "Live-Update: breaking". Needs the player's consent and a reload
// (module hot-swap and live state migration are not built yet).
export function classifyBuildChange(previous, next, runningSchema = GAME_STATE_SCHEMA_VERSION) {
  if (!next || !previous) return 'none'
  if (next.commit === previous.commit && next.jsSignature === previous.jsSignature
    && JSON.stringify(next.css) === JSON.stringify(previous.css)) return 'none'
  if (next.update?.kind === 'breaking') return 'breaking'
  if (next.jsSignature !== previous.jsSignature) {
    const hasModuleManifest = next.modules && previous.modules
    if (next.update?.kind === 'safe' && hasModuleManifest && next.coreJsSignature === previous.coreJsSignature) return 'hot'
    return 'breaking'
  }
  if (Number.isFinite(next.stateSchemaVersion) && next.stateSchemaVersion !== runningSchema) return 'breaking'
  return 'safe'
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

// Live updates are single-player only, where single-player means "no other
// human connected over the network". A local game against any number of AI
// enemies (the HUD shows "You (Host)") is in scope. Skipped only while this
// browser joined someone else's game (isRemote), a WebRTC peer is connected,
// or a remote human controls another party.
export function isMultiplayerActive(state) {
  const session = state?.multiplayerSession
  if (session?.isRemote) return true
  if (session?.status === 'connected') return true
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

function makeButton(doc, label, onClick, className) {
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = className
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}

// Default notice UI: a small bubble at the top of the screen plus a status
// line under the version in the left sidebar. Every update is announced.
export function createUpdateNoticeUi(doc = document) {
  let bubble = null
  let hideTimer = null

  function ensureBubble() {
    if (bubble?.isConnected) return bubble
    bubble = doc.createElement('div')
    bubble.id = 'liveUpdateBubble'
    bubble.className = 'live-update-bubble'
    bubble.setAttribute('role', 'status')
    doc.body.appendChild(bubble)
    return bubble
  }

  function sidebarStatus(text, action) {
    const anchor = doc.getElementById('sidebarFooterVersion')
    if (!anchor) return
    let line = doc.getElementById('liveUpdateStatus')
    if (!line) {
      line = doc.createElement('div')
      line.id = 'liveUpdateStatus'
      line.className = 'live-update-status'
      const row = anchor.querySelector('.sidebar-version__row')
      if (row) row.after(line)
      else anchor.prepend(line)
    }
    line.textContent = ''
    if (action) line.appendChild(action)
    const label = doc.createElement('span')
    label.className = 'live-update-status__text'
    label.textContent = text
    line.appendChild(label)
  }

  function render(text, buttons, { kind, autoHideMs = 0 }) {
    const el = ensureBubble()
    clearTimeout(hideTimer)
    el.dataset.kind = kind
    el.textContent = ''
    const label = doc.createElement('span')
    label.className = 'live-update-bubble__text'
    label.textContent = text
    if (buttons.length) {
      const actions = doc.createElement('div')
      actions.className = 'live-update-bubble__actions'
      buttons.forEach(button => actions.appendChild(button))
      el.appendChild(actions)
    }
    el.appendChild(label)
    el.hidden = false
    if (autoHideMs) hideTimer = setTimeout(() => { el.hidden = true }, autoHideMs)
  }

  return {
    showSafe(info, swapped, modules = 0) {
      render(getLiveModule('update-notice').safeUpdateText(info, swapped, modules), [], { kind: 'safe', autoHideMs: 6000 })
      sidebarStatus(`Live update ${info.commit} applied, no reload needed`)
    },
    showDeferred(info, change) {
      const reload = change === 'breaking' ? 'It needs a reload.' : 'It loads live, no reload needed.'
      render(`Update v${info.version} (${info.commit}) is available. ${reload} Other players are connected, so it waits until the network match is over.`, [
        makeButton(doc, 'OK', () => { ensureBubble().hidden = true }, 'live-update-bubble__button')
      ], { kind: change })
      sidebarStatus(`Update ${info.commit} waits for the network match to end (${change === 'breaking' ? 'needs a reload' : 'no reload'})`)
    },
    showBreaking(info, { multiplayer, onReload }) {
      if (multiplayer) {
        this.showDeferred(info, 'breaking')
        return
      }
      render(`Update v${info.version} (${info.commit}) is ready. It needs a reload: your game is saved and comes right back.`, [
        makeButton(doc, 'Reload now', onReload, 'live-update-bubble__button live-update-bubble__button--primary'),
        makeButton(doc, 'Later', () => { ensureBubble().hidden = true }, 'live-update-bubble__button')
      ], { kind: 'breaking' })
      sidebarStatus(`Update ${info.commit} ready, needs a reload `, makeButton(doc, 'Load', onReload, 'live-update-status__button'))
    },
    showApplied(applied) {
      render(`Updated to v${applied.version} (${applied.commit}). Your game was restored.`, [], { kind: 'safe', autoHideMs: 6000 })
    }
  }
}

export function createLiveUpdater({
  win = window,
  doc = document,
  fetchImpl = (...args) => win.fetch(...args),
  getGameState = () => null,
  ui = createUpdateNoticeUi(doc),
  prepareReload = async() => {},
  reload = () => win.location.reload(),
  activateServiceWorker = () => activateWaitingServiceWorker(win),
  running = { version: APP_VERSION, commit: versionInfo?.commit || 'unknown' },
  runningSchema = GAME_STATE_SCHEMA_VERSION,
  swapScheduler = createLiveSwapScheduler()
} = {}) {
  let baseline = null
  let busy = false
  let announcedBreaking = null
  let pendingBreaking = null
  let deferredNotice = null

  async function fetchInfo() {
    const response = await fetchImpl(`${BUILD_INFO_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (!response?.ok) return null
    return response.json()
  }

  // Runs only after the player chose "Reload now" / "Load".
  async function applyBreakingUpdate(info = pendingBreaking) {
    if (!info) return 'none'
    if (isMultiplayerActive(getGameState())) return 'deferred'
    let attempt = null
    try { attempt = win.sessionStorage?.getItem(LIVE_UPDATE_ATTEMPT_KEY) } catch { /* optional */ }
    // A reload for this commit already happened and the old code came back: stop.
    if (attempt === info.commit) return 'stuck'
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

  function announceBreaking(info) {
    pendingBreaking = info
    if (announcedBreaking === info.commit) return 'breaking'
    announcedBreaking = info.commit
    ui.showBreaking(info, {
      multiplayer: isMultiplayerActive(getGameState()),
      onReload: () => { void applyBreakingUpdate(info) }
    })
    return 'breaking'
  }

  swapScheduler.setFallback?.(info => announceBreaking(info))

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
        // stylesheet map is unknown: offer it as a reload update.
        return announceBreaking(info)
      }
      const change = classifyBuildChange(baseline, info, runningSchema)
      if (change === 'none') return 'none'
      if (isMultiplayerActive(getGameState())) {
        // Network match: tell the player once per commit, apply nothing.
        // The baseline stays, so the next poll after the match applies it.
        if (deferredNotice !== info.commit) {
          deferredNotice = info.commit
          ui.showDeferred(info, change)
        }
        return 'deferred'
      }
      if ((change === 'safe' || change === 'hot') && !pendingBreaking) {
        let changedModules = []
        if (change === 'hot') {
          try {
            changedModules = await swapScheduler.stage(baseline, info)
          } catch {
            return announceBreaking(info)
          }
        }
        const swapped = await swapStylesheets(doc, planStylesheetSwaps(baseline, info))
        updateVersionLabels(doc, info)
        baseline = info
        ui.showSafe(info, swapped, changedModules.length)
        return change
      }
      // Breaking, or a safe deploy on top of a pending breaking one (the
      // running page is already behind, so the reload covers both).
      return announceBreaking(info)
    } finally {
      busy = false
    }
  }

  return { check, applyBreakingUpdate, swapScheduler, getBaseline: () => baseline, getPending: () => pendingBreaking }
}

export function announceAppliedUpdate({ win = window, ui = null, running = { commit: versionInfo?.commit } } = {}) {
  let applied = null
  try {
    applied = JSON.parse(win.sessionStorage?.getItem(LIVE_UPDATE_APPLIED_KEY) || 'null')
    win.sessionStorage?.removeItem(LIVE_UPDATE_APPLIED_KEY)
    if (applied?.commit === running.commit) win.sessionStorage?.removeItem(LIVE_UPDATE_ATTEMPT_KEY)
  } catch { /* optional */ }
  if (applied?.commit && applied.commit === running.commit) {
    ui?.showApplied(applied)
    return true
  }
  return false
}

export async function startLiveUpdate({ intervalMs = LIVE_UPDATE_INTERVAL_MS } = {}) {
  const [{ gameState }, { prepareForLiveUpdateReload }] = await Promise.all([
    import('../gameState.js'),
    import('../saveGame.js'),
    import('./liveUpdate.css')
  ])

  if (import.meta.hot) {
    // `npm run dev`: Vite swaps CSS itself; before a full reload for a JS
    // change, keep the running game so the boot restores it.
    import.meta.hot.on('vite:beforeFullReload', () => { void prepareForLiveUpdateReload() })
    return null
  }

  const ui = createUpdateNoticeUi(document)
  setTimeout(() => announceAppliedUpdate({ ui }), 1500)
  const updater = createLiveUpdater({
    getGameState: () => gameState,
    ui,
    prepareReload: () => prepareForLiveUpdateReload()
  })
  setActiveLiveSwapScheduler(updater.swapScheduler)
  void updater.check()
  setInterval(() => { void updater.check() }, intervalMs)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void updater.check()
  })
  return updater
}
