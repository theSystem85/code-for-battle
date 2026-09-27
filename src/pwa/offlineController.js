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
import {
  formatIncompleteOfflineWarning,
  formatOfflineCacheError,
  formatOfflineCacheTooltip,
  formatOfflineFileCount,
  resolveOfflineCacheBytes
} from './offlineCacheSize.js'
import {
  OFFLINE_ASSET_FILL_HEADER,
  OFFLINE_ASSETS_CACHE,
  OFFLINE_ASSETS_MANIFEST_PATH
} from './offlineAssetPlan.js'
import {
  downloadOfflineAssets,
  isOfflinePlayReady,
  measureOfflineReadiness
} from './offlineAssetDownload.js'
import {
  getOfflineSnapshot,
  isEffectivelyOffline,
  probeConnectivity,
  readForcedOffline,
  setOfflineSnapshot,
  writeForcedOffline
} from './offlineState.js'
import { formatPersistentStorageStatus, isStandaloneDisplayMode, requestPersistentStorage } from './persistentStorage.js'

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
    preparingFilesTemplate: uiText('offline.preparingFiles', locale),
    readyTemplate: uiText('offline.ready', locale),
    readyFilesTemplate: uiText('offline.readyFiles', locale),
    incompleteTemplate: uiText('offline.incompleteWarning', locale),
    cacheErrorTemplate: uiText('offline.cacheError', locale),
    retryLabel: uiText('offline.retry', locale),
    persistPersistent: uiText('offline.persistPersistent', locale),
    persistTemporary: uiText('offline.persistTemporary', locale),
    persistUnavailable: uiText('offline.persistUnavailable', locale)
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
    button.dataset.offlineReady = view.cacheReady ? 'true' : 'false'
    if (view.fileCount) button.dataset.offlineFiles = view.fileCount
    else delete button.dataset.offlineFiles
    forgetNativeTitle(button)
    const label = button.querySelector('[data-offline-label]')
    if (label) label.textContent = offline ? view.offlineLabel : view.onlineLabel
    const tip = elements.tip || button.ownerDocument?.getElementById('offlineModeTip')
    if (tip) {
      tip.textContent = view.tooltip || ''
      tip.classList.toggle('offline-mode-tip--warn', view.tooltipWarning === true)
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
  let assetDone = null
  let assetTotal = null
  let assetFailures = []
  let bootError = null
  let showIncompleteWarning = false
  let persistStatus = null
  let assetManifest = null
  let cacheCleared = false
  let dialogPhase = null
  let clearingCache = false
  let updateRegistration = null
  let applyingUpdate = false
  let stopped = false
  let tipTimer = null
  let probeTimer = null
  let measureTimer = null
  let downloadTask = null
  let downloadGeneration = 0
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
    persist: win.document.getElementById('offlineStoragePersistText'),
    incomplete: win.document.getElementById('offlineCacheIncompleteText'),
    error: win.document.getElementById('offlineCacheErrorText'),
    retry: win.document.getElementById('offlineCacheRetryButton'),
    clearButton: win.document.getElementById('offlineClearCacheButton'),
    dialog: win.document.getElementById('offlineClearDialog'),
    title: win.document.getElementById('offlineClearDialogTitle'),
    body: win.document.getElementById('offlineClearDialogBody'),
    warning: win.document.getElementById('offlineClearDialogWarning'),
    confirm: win.document.getElementById('offlineClearConfirm'),
    cancel: win.document.getElementById('offlineClearCancel'),
    reload: win.document.getElementById('offlineClearReload')
  })

  function fileCountsKnown() {
    return Number(assetTotal) > 0 && Number.isFinite(Number(assetDone))
  }

  function networkAllowsDownload() {
    return navigatorOnLine && !probeFailed && !cacheCleared && !stopped && !clearingCache
  }

  function pageVisible() {
    const state = win.document?.visibilityState
    return state == null || state === 'visible'
  }

  function downloadAllowed() {
    return networkAllowsDownload() && pageVisible()
  }

  function primaryFailure() {
    if (bootError) return bootError
    return assetFailures[0] || null
  }

  function cacheTooltip(copy, clearCopy) {
    const failure = primaryFailure()
    if (failure && !cacheReady && !cacheCleared) {
      const extra = bootError ? assetFailures.length : Math.max(0, assetFailures.length - 1)
      return formatOfflineCacheError(copy.cacheErrorTemplate, failure, extra)
    }
    const tooltipOptions = {
      ready: cacheReady,
      percent: precachePercent,
      bytes: cacheBytes || 0,
      done: assetDone,
      total: assetTotal,
      filesWord: clearCopy.filesWord,
      preparingTemplate: copy.preparingTemplate,
      preparingFilesTemplate: copy.preparingFilesTemplate,
      readyTemplate: copy.readyTemplate,
      readyFilesTemplate: copy.readyFilesTemplate
    }
    if (showIncompleteWarning && !cacheReady) {
      return formatIncompleteOfflineWarning(copy.incompleteTemplate, assetDone, assetTotal)
    }
    if (!cacheReady && !cacheCleared) {
      if (cacheBytes == null && !fileCountsKnown()) {
        return formatOfflineCacheTooltip({ ...tooltipOptions, ready: false })
      }
      return formatOfflineCacheTooltip({ ...tooltipOptions, ready: false })
    }
    if (cacheBytes === 0 || (cacheCleared && !(cacheBytes > 0))) {
      return String(clearCopy.emptyTooltip || '').replaceAll('{size}', formatOfflineByteSize(cacheBytes))
    }
    if (cacheBytes == null) {
      return formatOfflineCacheTooltip({ ...tooltipOptions, ready: false })
    }
    return formatOfflineCacheTooltip(tooltipOptions)
  }

  function publish() {
    const next = setOfflineSnapshot({
      forced,
      navigatorOnLine,
      probeFailed
    })
    const copy = offlineModeCopy()
    const clearCopy = offlineClearCopy()
    const failure = primaryFailure()
    const extraFailures = bootError ? assetFailures.length : Math.max(0, assetFailures.length - 1)
    const tooltipWarning = (showIncompleteWarning && !cacheReady) || Boolean(failure)
    const progressTooltip = formatOfflineCacheTooltip({
      ready: cacheReady && !cacheCleared,
      percent: precachePercent,
      bytes: cacheBytes || 0,
      done: assetDone,
      total: assetTotal,
      filesWord: clearCopy.filesWord,
      preparingTemplate: copy.preparingTemplate,
      preparingFilesTemplate: copy.preparingFilesTemplate,
      readyTemplate: copy.readyTemplate,
      readyFilesTemplate: copy.readyFilesTemplate
    })
    const view = {
      ...next,
      ...copy,
      cacheReady,
      tooltipWarning,
      fileCount: formatOfflineFileCount(assetDone, assetTotal, clearCopy.filesWord),
      tooltip: cacheTooltip(copy, clearCopy),
      updateAvailable: Boolean(updateRegistration?.waiting) && Boolean(win.navigator.serviceWorker?.controller) && !applyingUpdate
    }
    applyOfflineModeDom(elements(), view)
    const sizeText = formatOfflineSettingsSize({
      bytes: cacheBytes,
      ready: cacheReady,
      cleared: cacheCleared,
      preparingText: (!cacheReady && !cacheCleared) ? progressTooltip : view.tooltip,
      done: assetDone,
      total: assetTotal,
      copy: clearCopy
    })
    applyOfflineCacheSettings(elements(), {
      ...clearCopy,
      sizeText,
      persistText: formatPersistentStorageStatus(persistStatus, {
        persistent: copy.persistPersistent,
        temporary: copy.persistTemporary,
        unavailable: copy.persistUnavailable
      }),
      incompleteText: showIncompleteWarning && !cacheReady
        ? formatIncompleteOfflineWarning(copy.incompleteTemplate, assetDone, assetTotal)
        : '',
      errorText: failure ? formatOfflineCacheError(copy.cacheErrorTemplate, failure, bootError ? assetFailures.length : extraFailures) : '',
      showRetry: Boolean(failure) && !cacheCleared,
      retryLabel: copy.retryLabel
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

  function applyMeasurement(measured, { confirmed = false } = {}) {
    if (!measured) return
    assetDone = measured.done
    assetTotal = measured.total
    if (Number.isFinite(measured.bytes)) cacheBytes = measured.bytes
    const controlled = Boolean(win.navigator?.serviceWorker?.controller)
    if (confirmed) {
      cacheReady = isOfflinePlayReady({
        controlled,
        done: measured.done,
        total: measured.total,
        failures: assetFailures
      })
      if (cacheReady) showIncompleteWarning = false
    }
  }

  async function refreshBytes() {
    const cacheStorage = typeof caches !== 'undefined' ? caches : null
    if (assetManifest && cacheStorage && import.meta.env.PROD) {
      try {
        const measured = await measureOfflineReadiness(cacheStorage, assetManifest)
        applyMeasurement(measured, { confirmed: true })
        if (!stopped) publish()
        return { bytes: measured.bytes, source: 'cache', entries: measured.done }
      } catch {
        // Fall through to the storage estimate when the Cache API cannot be read.
      }
    }
    const resolved = await resolveOfflineCacheBytes({ cacheStorage })
    cacheBytes = resolved.bytes
    if (!stopped) publish()
    return resolved
  }

  async function loadAssetManifest() {
    const response = await fetchImpl(OFFLINE_ASSETS_MANIFEST_PATH, { cache: 'no-store' })
    if (!response || !response.ok) {
      throw new Error(response ? `HTTP ${response.status}` : 'empty response')
    }
    const manifest = await response.json()
    if (!manifest || !Array.isArray(manifest.assets) || !Array.isArray(manifest.boot)) {
      throw new Error('invalid offline asset manifest')
    }
    if (!manifest.cache) manifest.cache = OFFLINE_ASSETS_CACHE
    assetManifest = manifest
    return manifest
  }

  async function runAssetDownload(generation) {
    const cacheStorage = typeof caches !== 'undefined' ? caches : null
    if (!cacheStorage || !import.meta.env.PROD || cacheCleared) return
    try {
      const manifest = assetManifest || await loadAssetManifest()
      if (generation !== downloadGeneration || !downloadAllowed()) return
      const cache = await cacheStorage.open(manifest.cache || OFFLINE_ASSETS_CACHE)
      const result = await downloadOfflineAssets({
        assets: manifest.assets,
        cache,
        fetchImpl: (url) => fetchImpl(url, {
          cache: 'no-store',
          headers: { [OFFLINE_ASSET_FILL_HEADER]: '1' }
        }),
        shouldContinue: () => generation === downloadGeneration && downloadAllowed(),
        onProgress: (progress) => {
          if (generation !== downloadGeneration || stopped) return
          const bootEntries = manifest.boot || []
          const bootBytes = bootEntries.reduce((sum, entry) => sum + (Number(entry.size) || 0), 0)
          assetDone = bootEntries.length + progress.done
          assetTotal = bootEntries.length + progress.total
          cacheBytes = bootBytes + progress.bytes
          publish()
        }
      })
      if (generation !== downloadGeneration || stopped) return
      assetFailures = result.failures || []
      const measured = await measureOfflineReadiness(cacheStorage, manifest)
      assetDone = measured.done
      assetTotal = measured.total
      applyMeasurement(measured, { confirmed: true })
      if (!result.complete && result.paused && downloadAllowed() && generation === downloadGeneration) {
        // A pause that cleared before the next check resumes on the following kick.
      }
    } catch (error) {
      if (generation !== downloadGeneration || stopped) return
      bootError = {
        url: OFFLINE_ASSETS_MANIFEST_PATH,
        message: error?.message || String(error)
      }
    }
    if (!stopped) publish()
  }

  function kickAssetDownload() {
    if (!import.meta.env.PROD || stopped || cacheCleared || cacheReady || downloadTask) return
    if (!win.navigator?.serviceWorker?.controller) return
    if (!downloadAllowed()) return
    const generation = downloadGeneration
    downloadTask = runAssetDownload(generation).finally(() => {
      downloadTask = null
      if (!stopped && !cacheCleared && generation === downloadGeneration && downloadAllowed() && !cacheReady && !bootError) {
        // The loop paused because the page hid or the network dropped. The
        // visibility and online events start it again.
      }
    })
  }

  async function retryOfflineDownload() {
    bootError = null
    assetFailures = []
    cacheReady = false
    cacheCleared = false
    showIncompleteWarning = forced === true
    publish()
    try {
      if (!updateRegistration && win.navigator?.serviceWorker) {
        updateRegistration = await win.navigator.serviceWorker.register('/sw.js', { scope: '/' })
      }
      await updateRegistration?.update?.()
    } catch (error) {
      bootError = { url: '/sw.js', message: error?.message || String(error) }
      publish()
    }
    downloadGeneration += 1
    if (downloadTask) await downloadTask.catch(() => {})
    kickAssetDownload()
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
    if (ok) kickAssetDownload()
    return ok
  }

  function toggleForced() {
    forced = !forced
    writeForcedOffline(storage, forced)
    if (forced && !cacheReady) {
      showIncompleteWarning = true
      const { button, tip } = elements()
      publish()
      holdFloatingTip(button, tip, 4000)
      return
    }
    if (!forced) showIncompleteWarning = false
    publish()
  }

  function onOnline() {
    navigatorOnLine = true
    refreshProbe().then(() => {
      if (!stopped) kickAssetDownload()
    })
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
    downloadGeneration += 1
    publish()
    try {
      if (downloadTask) await downloadTask.catch(() => {})
      await clearOfflineAppCache({
        cacheStorage: typeof caches !== 'undefined' ? caches : null,
        serviceWorker: win.navigator?.serviceWorker
      })
      cacheCleared = true
      cacheReady = true
      precachePercent = 100
      assetDone = 0
      assetTotal = 0
      assetFailures = []
      bootError = null
      assetManifest = null
      showIncompleteWarning = false
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
    const { button, tip, shield, multiplayerHint, updatePrompt, clearButton, retry, dialog, confirm, cancel, reload } = elements()
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
    if (retry && retry.dataset.offlineBound !== 'true') {
      retry.dataset.offlineBound = 'true'
      retry.addEventListener('click', () => {
        retryOfflineDownload()
      })
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
      if (!data) return
      if (data.type === 'OFFLINE_BOOT_ERROR') {
        bootError = { url: data.url || '/sw.js', message: data.message || 'Service worker install failed' }
        publish()
        return
      }
      if (data.type !== 'OFFLINE_PRECACHE') return
      if (Number.isFinite(data.percent)) precachePercent = data.percent
      if (data.ready && data.boot) bootError = null
      if (data.ready) kickAssetDownload()
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
        if (worker.state === 'installed' && !win.navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' })
        }
        if (worker.state === 'redundant' && !win.navigator.serviceWorker.controller) {
          bootError = { url: '/sw.js', message: 'Service worker install failed' }
          publish()
        }
        if (worker.state === 'installed' && win.navigator.serviceWorker.controller && registration.waiting) {
          updateRegistration = registration
          publish()
        }
      })
    }
    watch(registration.installing)
    watch(registration.waiting)
    registration.addEventListener('updatefound', () => watch(registration.installing))

    if (registration.waiting && !win.navigator.serviceWorker.controller) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }

    win.navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (stopped || applyingUpdate) return
      kickAssetDownload()
    })

    win.navigator.serviceWorker.ready.then(() => {
      if (stopped) return
      precachePercent = 100
      publish()
      kickAssetDownload()
      refreshBytes()
      if (navigatorOnLine && !isEffectivelyOffline()) warmRuntimeFonts(fetchImpl)
    }).catch(() => {})

    win.document.addEventListener('visibilitychange', () => {
      if (win.document.visibilityState !== 'visible') return
      registration.update().catch(() => {})
      kickAssetDownload()
    })

    measureTimer = setInterval(() => {
      if (stopped || cacheReady || cacheCleared || !assetManifest) return
      if (!pageVisible()) return
      refreshBytes().catch(() => {})
    }, 2000)
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
    bootError = { url: '/sw.js', message: err?.message || 'Service worker registration failed' }
    publish()
  })

  const persistentStorage = win.navigator?.storage
  const standalone = isStandaloneDisplayMode(win)
  if (standalone || import.meta.env.PROD) {
    if (!persistentStorage || typeof persistentStorage.persist !== 'function') {
      persistStatus = { supported: false, persisted: false, called: false }
      publish()
    } else {
      requestPersistentStorage(persistentStorage, { standalone: true }).then(result => {
        persistStatus = result
        if (!stopped) publish()
      }).catch(() => {})
    }
  }

  return {
    stop() {
      stopped = true
      downloadGeneration += 1
      if (probeTimer) clearInterval(probeTimer)
      if (measureTimer) clearInterval(measureTimer)
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
