import { uiText } from '../ui/uiText.js'
import { formatOfflineCacheTooltip, resolveOfflineCacheBytes } from './offlineCacheSize.js'
import {
  getOfflineSnapshot,
  isEffectivelyOffline,
  probeConnectivity,
  readForcedOffline,
  setOfflineSnapshot,
  writeForcedOffline
} from './offlineState.js'

const UPDATE_RELOAD_GUARD = 'cfb-sw-update-reload'
const PROBE_INTERVAL_MS = 30000
const FONT_STYLESHEET = 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap'

function fillTemplate(template, values) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    String(template)
  )
}

export function offlineModeCopy(locale) {
  return {
    onlineLabel: uiText('offline.online', locale),
    offlineLabel: uiText('offline.offline', locale),
    toggleLabel: uiText('offline.toggleLabel', locale),
    multiplayerHint: uiText('offline.multiplayerDisabled', locale),
    updateLabel: uiText('offline.updateAvailable', locale),
    preparingTemplate: uiText('offline.preparing', locale),
    readyTemplate: uiText('offline.ready', locale)
  }
}

export function applyOfflineModeDom(elements, view) {
  const button = elements?.button
  const sidebar = elements?.sidebar
  const shield = elements?.shield
  const multiplayer = elements?.multiplayer
  const updatePrompt = elements?.updatePrompt
  const offline = view?.effective === true

  if (button) {
    button.classList.toggle('offline-mode-button--offline', offline)
    button.setAttribute('aria-pressed', offline ? 'true' : 'false')
    button.setAttribute('aria-label', view.toggleLabel || (offline ? view.offlineLabel : view.onlineLabel))
    button.dataset.forced = view.forced ? 'true' : 'false'
    button.dataset.offlineCache = view.cacheReady ? 'ready' : 'preparing'
    const label = button.querySelector('[data-offline-label]')
    if (label) label.textContent = offline ? view.offlineLabel : view.onlineLabel
    const tooltip = view.tooltip || ''
    button.title = tooltip
    const tip = elements.tip || button.querySelector('#offlineModeTip')
    if (tip) tip.textContent = tooltip
  }

  if (sidebar) {
    sidebar.hidden = !offline
    const sideLabel = sidebar.querySelector('[data-offline-sidebar-label]')
    if (sideLabel) sideLabel.textContent = view.offlineLabel || ''
  }

  if (multiplayer) {
    multiplayer.classList.toggle('multiplayer-settings--offline', offline)
    const controls = multiplayer.querySelectorAll('button, input, select, textarea')
    controls.forEach(control => {
      if (control === shield) return
      if (offline) {
        if (control.dataset.offlineLocked == null) {
          control.dataset.offlineLocked = control.disabled ? 'was-disabled' : 'locked'
        }
        control.disabled = true
        control.setAttribute('title', view.multiplayerHint || '')
      } else if (control.dataset.offlineLocked === 'locked') {
        control.disabled = false
        control.removeAttribute('title')
        delete control.dataset.offlineLocked
      } else if (control.dataset.offlineLocked) {
        delete control.dataset.offlineLocked
      }
    })
    if (offline) {
      const content = elements.multiplayerContent || multiplayer.querySelector('#multiplayerContent')
      const toggle = elements.multiplayerToggle || multiplayer.querySelector('#multiplayerToggle')
      if (content) content.classList.remove('is-open')
      if (toggle) toggle.setAttribute('aria-expanded', 'false')
    }
  }

  if (shield) {
    shield.hidden = !offline
    if (offline) shield.title = view.multiplayerHint || ''
    else shield.removeAttribute('title')
    const hint = shield.querySelector('[data-offline-multiplayer-hint]')
    if (hint) hint.textContent = view.multiplayerHint || ''
  }

  if (updatePrompt) {
    updatePrompt.hidden = !view.updateAvailable
    const updateText = updatePrompt.querySelector('[data-offline-update-label]')
    if (updateText && view.updateLabel) updateText.textContent = view.updateLabel
  }
}

function battleInProgress() {
  const state = typeof window !== 'undefined' ? window.gameState : null
  return Boolean(state && state.gameStarted && !state.gameOver)
}

async function warmRuntimeFonts(fetchImpl) {
  try {
    const cssResponse = await fetchImpl(FONT_STYLESHEET, { mode: 'cors', cache: 'no-store' })
    if (!cssResponse?.ok) return
    const css = await cssResponse.text()
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)]
      .map(match => match[1].replace(/["']/g, ''))
    await Promise.all(urls.map(url => fetchImpl(url, { mode: 'cors' }).catch(() => null)))
  } catch {
    // The game font stack already falls back to Arial Narrow.
  }
}

function legacyCacheName(name) {
  return name.startsWith('code-for-battle-cache-')
    || name.startsWith('workbox-')
    || name.startsWith('cfb-')
}

export function startOfflineMode(options = {}) {
  const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  const fetchImpl = options.fetchImpl || fetch
  const win = options.window || (typeof window !== 'undefined' ? window : null)
  if (!win) return { stop() {} }

  let forced = readForcedOffline(storage)
  let navigatorOnLine = win.navigator ? win.navigator.onLine !== false : true
  let probeFailed = false
  let cacheReady = !import.meta.env.PROD
  let precachePercent = cacheReady ? 100 : 0
  let cacheBytes = null
  let updateRegistration = null
  let applyingUpdate = false
  let stopped = false
  let tipTimer = null
  let probeTimer = null

  const elements = () => ({
    button: win.document.getElementById('offlineModeButton'),
    tip: win.document.getElementById('offlineModeTip'),
    sidebar: win.document.getElementById('offlineSidebarStatus'),
    multiplayer: win.document.getElementById('multiplayerSettings'),
    multiplayerContent: win.document.getElementById('multiplayerContent'),
    multiplayerToggle: win.document.getElementById('multiplayerToggle'),
    shield: win.document.getElementById('multiplayerOfflineShield'),
    updatePrompt: win.document.getElementById('offlineUpdatePrompt')
  })

  function publish() {
    const next = setOfflineSnapshot({
      forced,
      navigatorOnLine,
      probeFailed
    })
    const copy = offlineModeCopy()
    const view = {
      ...next,
      ...copy,
      cacheReady,
      tooltip: formatOfflineCacheTooltip({
        ready: cacheReady,
        percent: precachePercent,
        bytes: cacheBytes ?? 0,
        preparingTemplate: copy.preparingTemplate,
        readyTemplate: copy.readyTemplate
      }),
      updateAvailable: Boolean(updateRegistration?.waiting) && Boolean(win.navigator.serviceWorker?.controller) && !applyingUpdate
    }
    applyOfflineModeDom(elements(), view)
    return view
  }

  async function refreshBytes() {
    const resolved = await resolveOfflineCacheBytes({
      cacheStorage: typeof caches !== 'undefined' ? caches : null
    })
    cacheBytes = resolved.bytes
    if (!stopped) publish()
    return resolved
  }

  async function refreshProbe() {
    if (!navigatorOnLine) {
      probeFailed = true
      publish()
      return false
    }
    const ok = await probeConnectivity(fetchImpl)
    if (stopped) return ok
    probeFailed = !ok
    publish()
    return ok
  }

  function toggleForced() {
    forced = !forced
    writeForcedOffline(storage, forced)
    publish()
  }

  function onOnline() {
    navigatorOnLine = true
    refreshProbe()
  }

  function onOffline() {
    navigatorOnLine = false
    probeFailed = true
    publish()
  }

  function bindUi() {
    const { button, shield, updatePrompt } = elements()
    if (button && button.dataset.offlineBound !== 'true') {
      button.dataset.offlineBound = 'true'
      button.addEventListener('click', toggleForced)
      button.addEventListener('pointerenter', () => {
        refreshBytes()
      })
      button.addEventListener('focus', () => {
        refreshBytes()
      })
      button.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return
        button.classList.add('is-touch-tip')
        if (tipTimer) clearTimeout(tipTimer)
        tipTimer = setTimeout(() => button.classList.remove('is-touch-tip'), 2500)
      })
    }
    if (shield && shield.dataset.offlineBound !== 'true') {
      shield.dataset.offlineBound = 'true'
      shield.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return
        shield.classList.toggle('is-touch-tip')
      })
    }
    const reload = updatePrompt?.querySelector('#offlineUpdateReload')
    if (reload && reload.dataset.offlineBound !== 'true') {
      reload.dataset.offlineBound = 'true'
      reload.addEventListener('click', () => {
        if (updateRegistration) applyWaitingWorker(updateRegistration, { userAccepted: true })
      })
    }
    publish()
  }

  function applyWaitingWorker(registration, { userAccepted = false } = {}) {
    const waiting = registration?.waiting
    if (!waiting || applyingUpdate) return
    if (!userAccepted && battleInProgress()) {
      updateRegistration = registration
      publish()
      return
    }
    applyingUpdate = true
    try {
      win.sessionStorage?.setItem(UPDATE_RELOAD_GUARD, '1')
    } catch {
      // The reload still proceeds. The guard only stops a second automatic reload.
    }
    const reloadOnce = () => {
      win.location.reload()
    }
    win.navigator.serviceWorker?.addEventListener('controllerchange', reloadOnce, { once: true })
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }

  async function registerServiceWorker() {
    if (!import.meta.env.PROD || !win.navigator.serviceWorker) {
      if (win.navigator.serviceWorker) {
        const registrations = await win.navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map(registration => registration.unregister().catch(() => {})))
      }
      if (typeof caches !== 'undefined' && caches?.keys) {
        const names = await caches.keys()
        await Promise.all(names.filter(legacyCacheName).map(name => caches.delete(name).catch(() => {})))
      }
      cacheReady = true
      precachePercent = 100
      publish()
      return
    }

    const registration = await win.navigator.serviceWorker.register('/sw.js', { scope: '/' })
    updateRegistration = registration

    win.navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data
      if (!data || data.type !== 'OFFLINE_PRECACHE') return
      if (Number.isFinite(data.percent)) precachePercent = data.percent
      if (data.ready) {
        cacheReady = true
        refreshBytes()
      }
      publish()
    })

    const guard = win.sessionStorage?.getItem(UPDATE_RELOAD_GUARD) === '1'
    if (guard) {
      try {
        win.sessionStorage.removeItem(UPDATE_RELOAD_GUARD)
      } catch {
        // Ignore storage cleanup failures.
      }
    }

    if (registration.waiting && win.navigator.serviceWorker.controller && !guard && !battleInProgress()) {
      applyWaitingWorker(registration)
    } else if (registration.waiting && win.navigator.serviceWorker.controller) {
      publish()
    }

    const watch = (worker) => {
      if (!worker) return
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && win.navigator.serviceWorker.controller && registration.waiting) {
          updateRegistration = registration
          publish()
        }
      })
    }
    watch(registration.installing)
    registration.addEventListener('updatefound', () => watch(registration.installing))

    win.navigator.serviceWorker.ready.then(() => {
      if (stopped) return
      cacheReady = true
      precachePercent = 100
      publish()
      refreshBytes()
      if (navigatorOnLine && !isEffectivelyOffline()) warmRuntimeFonts(fetchImpl)
    }).catch(() => {})

    win.document.addEventListener('visibilitychange', () => {
      if (win.document.visibilityState !== 'visible') return
      registration.update().catch(() => {})
    })
  }

  if (win.document.readyState === 'loading') {
    win.document.addEventListener('DOMContentLoaded', bindUi, { once: true })
  } else {
    bindUi()
  }

  win.addEventListener('online', onOnline)
  win.addEventListener('offline', onOffline)
  publish()
  refreshProbe()
  probeTimer = setInterval(refreshProbe, PROBE_INTERVAL_MS)
  registerServiceWorker().catch(err => {
    win.logger?.warn?.('Service worker registration failed', err)
    cacheReady = true
    publish()
  })

  return {
    stop() {
      stopped = true
      if (probeTimer) clearInterval(probeTimer)
      if (tipTimer) clearTimeout(tipTimer)
      win.removeEventListener('online', onOnline)
      win.removeEventListener('offline', onOffline)
    },
    getSnapshot: getOfflineSnapshot,
    toggleForced,
    refreshProbe,
    refreshBytes
  }
}

export function offlineStringsForTest(locale) {
  const copy = offlineModeCopy(locale)
  return {
    ...copy,
    readyExample: fillTemplate(copy.readyTemplate, { size: '42.3 MB' }),
    preparingExample: fillTemplate(copy.preparingTemplate, { percent: '40' })
  }
}
