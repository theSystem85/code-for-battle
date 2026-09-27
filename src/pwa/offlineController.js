import { uiText } from '../ui/uiText.js'
import {
  applyOfflineCacheSettings,
  applyOfflineClearDialog,
  clearOfflineAppCache,
  createOfflineLongPress,
  formatOfflineByteSize,
  formatOfflineSettingsSize,
  offlineClearCopy
} from './offlineCacheClear.js'
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

const MULTIPLAYER_HINT_ID = 'multiplayerOfflineTip'

export function placeFloatingTip(anchor, tip) {
  if (!anchor || !tip || typeof anchor.getBoundingClientRect !== 'function') return
  const margin = 8
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0
  tip.hidden = false
  tip.style.position = 'fixed'
  const anchorBounds = anchor.getBoundingClientRect()
  const bounds = tip.getBoundingClientRect()
  let left = anchorBounds.left
  let top = anchorBounds.bottom + margin
  const maxLeft = Math.max(margin, viewportWidth - bounds.width - margin)
  if (left > maxLeft) left = maxLeft
  if (left < margin) left = margin
  if (viewportHeight > 0 && top + bounds.height > viewportHeight - margin) {
    top = Math.max(margin, anchorBounds.top - bounds.height - margin)
  }
  tip.style.left = `${Math.round(left)}px`
  tip.style.top = `${Math.round(top)}px`
}

function forgetNativeTitle(node) {
  if (node?.hasAttribute?.('title')) node.removeAttribute('title')
}

export function applyOfflineModeDom(elements, view) {
  const button = elements?.button
  const shield = elements?.shield
  const multiplayer = elements?.multiplayer
  const updatePrompt = elements?.updatePrompt
  const offline = view?.effective === true

  if (button) {
    button.hidden = false
    button.classList.toggle('offline-mode-button--offline', offline)
    button.setAttribute('aria-pressed', offline ? 'true' : 'false')
    button.setAttribute('aria-label', view.toggleLabel || (offline ? view.offlineLabel : view.onlineLabel))
    button.dataset.forced = view.forced ? 'true' : 'false'
    button.dataset.offlineCache = view.cacheReady ? 'ready' : 'preparing'
    forgetNativeTitle(button)
    const label = button.querySelector('[data-offline-label]')
    if (label) label.textContent = offline ? view.offlineLabel : view.onlineLabel
    const tip = elements.tip || button.ownerDocument?.getElementById('offlineModeTip')
    if (tip) {
      tip.textContent = view.tooltip || ''
      if (!tip.hidden) placeFloatingTip(button, tip)
    }
  }

  if (multiplayer) {
    multiplayer.classList.toggle('multiplayer-settings--offline', offline)
    const controls = multiplayer.querySelectorAll('button, input, select, textarea')
    controls.forEach(control => {
      if (control === shield) return
      if (offline) {
        if (control.dataset.offlineTitleSaved !== '1') {
          control.dataset.offlineTitleSaved = '1'
          if (control.hasAttribute('title')) control.dataset.offlineTitle = control.getAttribute('title')
        }
        forgetNativeTitle(control)
        if (control.dataset.offlineLocked == null) {
          control.dataset.offlineLocked = control.disabled ? 'was-disabled' : 'locked'
        }
        control.disabled = true
        control.setAttribute('aria-describedby', MULTIPLAYER_HINT_ID)
      } else if (control.dataset.offlineLocked) {
        if (control.dataset.offlineLocked === 'locked') control.disabled = false
        if (control.getAttribute('aria-describedby') === MULTIPLAYER_HINT_ID) {
          control.removeAttribute('aria-describedby')
        }
        if (control.dataset.offlineTitleSaved === '1') {
          if (control.dataset.offlineTitle) control.setAttribute('title', control.dataset.offlineTitle)
          delete control.dataset.offlineTitle
          delete control.dataset.offlineTitleSaved
        }
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
    forgetNativeTitle(shield)
    shield.setAttribute('aria-describedby', MULTIPLAYER_HINT_ID)
    const hint = elements.multiplayerHint || shield.ownerDocument?.getElementById(MULTIPLAYER_HINT_ID)
    if (hint) {
      hint.textContent = view.multiplayerHint || ''
      if (!hint.hidden) placeFloatingTip(shield, hint)
    }
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
  let cacheCleared = false
  let dialogPhase = null
  let clearingCache = false
  let updateRegistration = null
  let applyingUpdate = false
  let stopped = false
  let tipTimer = null
  let probeTimer = null
  let lastPointerType = 'mouse'

  const elements = () => ({
    button: win.document.getElementById('offlineModeButton'),
    tip: win.document.getElementById('offlineModeTip'),
    multiplayerHint: win.document.getElementById('multiplayerOfflineTip'),
    multiplayer: win.document.getElementById('multiplayerSettings'),
    multiplayerContent: win.document.getElementById('multiplayerContent'),
    multiplayerToggle: win.document.getElementById('multiplayerToggle'),
    shield: win.document.getElementById('multiplayerOfflineShield'),
    updatePrompt: win.document.getElementById('offlineUpdatePrompt'),
    sectionTitle: win.document.querySelector('[data-offline-clear-title]'),
    hint: win.document.querySelector('[data-offline-clear-hint]'),
    size: win.document.getElementById('offlineCacheSizeText'),
    clearButton: win.document.getElementById('offlineClearCacheButton'),
    dialog: win.document.getElementById('offlineClearDialog'),
    title: win.document.getElementById('offlineClearDialogTitle'),
    body: win.document.getElementById('offlineClearDialogBody'),
    warning: win.document.getElementById('offlineClearDialogWarning'),
    confirm: win.document.getElementById('offlineClearConfirm'),
    cancel: win.document.getElementById('offlineClearCancel'),
    reload: win.document.getElementById('offlineClearReload')
  })

  function cacheTooltip(copy, clearCopy) {
    if (!cacheReady && !cacheCleared) {
      return formatOfflineCacheTooltip({
        ready: false,
        percent: precachePercent,
        preparingTemplate: copy.preparingTemplate,
        readyTemplate: copy.readyTemplate
      })
    }
    if (cacheBytes === 0 || (cacheCleared && !(cacheBytes > 0))) {
      return String(clearCopy.emptyTooltip || '').replaceAll('{size}', formatOfflineByteSize(cacheBytes))
    }
    if (cacheBytes == null) {
      return formatOfflineCacheTooltip({
        ready: false,
        percent: precachePercent,
        preparingTemplate: copy.preparingTemplate,
        readyTemplate: copy.readyTemplate
      })
    }
    return formatOfflineCacheTooltip({
      ready: true,
      bytes: cacheBytes,
      preparingTemplate: copy.preparingTemplate,
      readyTemplate: copy.readyTemplate
    })
  }

  function publish() {
    const next = setOfflineSnapshot({
      forced,
      navigatorOnLine,
      probeFailed
    })
    const copy = offlineModeCopy()
    const clearCopy = offlineClearCopy()
    const view = {
      ...next,
      ...copy,
      cacheReady,
      tooltip: cacheTooltip(copy, clearCopy),
      updateAvailable: Boolean(updateRegistration?.waiting) && Boolean(win.navigator.serviceWorker?.controller) && !applyingUpdate
    }
    applyOfflineModeDom(elements(), view)
    const sizeText = formatOfflineSettingsSize({
      bytes: cacheBytes,
      ready: cacheReady,
      cleared: cacheCleared,
      preparingText: view.tooltip,
      copy: clearCopy
    })
    applyOfflineCacheSettings(elements(), {
      ...clearCopy,
      sizeText
    })
    const clearedSize = formatOfflineByteSize(cacheBytes)
    applyOfflineClearDialog(elements(), {
      ...clearCopy,
      phase: dialogPhase,
      offline: next.effective === true,
      clearing: clearingCache,
      clearedBody: String(clearCopy.clearedBody || '').replaceAll('{size}', clearedSize)
    })
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

  function showFloatingTip(anchor, tip) {
    if (!anchor || !tip) return
    tip.hidden = false
    placeFloatingTip(anchor, tip)
  }

  function hideFloatingTip(tip) {
    if (tip) tip.hidden = true
  }

  function openClearConfirm() {
    if (dialogPhase === 'confirm' || clearingCache) return
    hideFloatingTip(elements().tip)
    dialogPhase = 'confirm'
    publish()
    elements().cancel?.focus()
  }

  async function confirmClear() {
    if (clearingCache || dialogPhase !== 'confirm') return
    clearingCache = true
    publish()
    try {
      await clearOfflineAppCache({
        cacheStorage: typeof caches !== 'undefined' ? caches : null,
        serviceWorker: win.navigator?.serviceWorker
      })
      cacheCleared = true
      cacheReady = true
      precachePercent = 100
      updateRegistration = null
      dialogPhase = 'cleared'
      await refreshBytes()
      if (cacheBytes > 0) cacheCleared = false
    } finally {
      clearingCache = false
      if (!stopped) publish()
    }
  }

  function closeClearDialog() {
    dialogPhase = null
    publish()
  }

  function holdFloatingTip(anchor, tip, duration = 2500) {
    showFloatingTip(anchor, tip)
    if (tipTimer) clearTimeout(tipTimer)
    tipTimer = setTimeout(() => hideFloatingTip(tip), duration)
  }

  function bindUi() {
    const { button, tip, shield, multiplayerHint, updatePrompt, clearButton, dialog, confirm, cancel, reload } = elements()
    const longPress = createOfflineLongPress(() => {
      if (lastPointerType !== 'mouse') {
        holdFloatingTip(button, tip, 4000)
        return
      }
      openClearConfirm()
    })
    if (button && button.dataset.offlineBound !== 'true') {
      button.dataset.offlineBound = 'true'
      button.addEventListener('click', (event) => {
        if (longPress.consumeClick()) {
          event.preventDefault()
          return
        }
        toggleForced()
      })
      button.addEventListener('pointerenter', (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return
        showFloatingTip(button, tip)
        refreshBytes()
      })
      button.addEventListener('pointerleave', (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return
        hideFloatingTip(tip)
      })
      button.addEventListener('focus', () => {
        showFloatingTip(button, tip)
        refreshBytes()
      })
      button.addEventListener('blur', () => hideFloatingTip(tip))
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        if (lastPointerType !== 'mouse') {
          holdFloatingTip(button, tip, 4000)
          refreshBytes()
          return
        }
        openClearConfirm()
      })
      button.addEventListener('pointerdown', (event) => {
        lastPointerType = event.pointerType || 'mouse'
        if (event.button != null && event.button !== 0) return
        longPress.pointerDown(event)
        if (event.pointerType === 'mouse') return
        holdFloatingTip(button, tip)
        refreshBytes()
      })
      button.addEventListener('pointermove', (event) => longPress.pointerMove(event))
      button.addEventListener('pointerup', () => longPress.pointerUp())
      button.addEventListener('pointercancel', () => longPress.pointerUp())
    }
    if (clearButton && clearButton.dataset.offlineBound !== 'true') {
      clearButton.dataset.offlineBound = 'true'
      clearButton.addEventListener('click', () => openClearConfirm())
    }
    if (confirm && confirm.dataset.offlineBound !== 'true') {
      confirm.dataset.offlineBound = 'true'
      confirm.addEventListener('click', () => {
        confirmClear()
      })
    }
    if (cancel && cancel.dataset.offlineBound !== 'true') {
      cancel.dataset.offlineBound = 'true'
      cancel.addEventListener('click', closeClearDialog)
    }
    if (reload && reload.dataset.offlineBound !== 'true') {
      reload.dataset.offlineBound = 'true'
      reload.addEventListener('click', () => {
        win.location.reload()
      })
    }
    if (dialog && dialog.dataset.offlineBound !== 'true') {
      dialog.dataset.offlineBound = 'true'
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeClearDialog()
      })
    }
    if (win.document.documentElement.dataset.offlineClearKeys !== 'true') {
      win.document.documentElement.dataset.offlineClearKeys = 'true'
      win.document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !dialogPhase) return
        event.preventDefault()
        closeClearDialog()
      })
    }
    if (shield && shield.dataset.offlineBound !== 'true') {
      shield.dataset.offlineBound = 'true'
      shield.addEventListener('pointerenter', (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return
        showFloatingTip(shield, multiplayerHint)
      })
      shield.addEventListener('pointerleave', (event) => {
        if (event.pointerType && event.pointerType !== 'mouse') return
        hideFloatingTip(multiplayerHint)
      })
      shield.addEventListener('focus', () => showFloatingTip(shield, multiplayerHint))
      shield.addEventListener('blur', () => hideFloatingTip(multiplayerHint))
      shield.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return
        holdFloatingTip(shield, multiplayerHint)
      })
      shield.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        holdFloatingTip(shield, multiplayerHint, 4000)
      })
    }
    const updateReload = updatePrompt?.querySelector('#offlineUpdateReload')
    if (updateReload && updateReload.dataset.offlineBound !== 'true') {
      updateReload.dataset.offlineBound = 'true'
      updateReload.addEventListener('click', () => {
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
