import { uiText } from '../ui/uiText.js'
import { formatCachedByteSize, formatOfflineCacheDetail } from './offlineCacheSize.js'

const LONG_PRESS_MS = 650

export function isAppOfflineCacheName(name) {
  const value = String(name || '')
  return value.startsWith('workbox-')
    || value.startsWith('cfb-')
    || value.startsWith('code-for-battle-cache-')
}

export async function clearOfflineAppCache({ cacheStorage = null, serviceWorker = null } = {}) {
  const removed = []
  if (cacheStorage && typeof cacheStorage.keys === 'function' && typeof cacheStorage.delete === 'function') {
    const names = await cacheStorage.keys()
    for (const name of names) {
      if (!isAppOfflineCacheName(name)) continue
      try {
        if (await cacheStorage.delete(name)) removed.push(name)
      } catch {
        // Keep deleting the remaining app caches.
      }
    }
  }

  const unregistered = []
  if (serviceWorker && typeof serviceWorker.getRegistrations === 'function') {
    const registrations = await serviceWorker.getRegistrations()
    for (const registration of registrations) {
      if (typeof registration?.unregister !== 'function') continue
      try {
        if (await registration.unregister()) unregistered.push(registration.scope || '')
      } catch {
        // A failed unregister still leaves the other registrations to try.
      }
    }
  }

  return { removed, unregistered }
}

export function offlineClearCopy(locale) {
  const text = (key) => uiText(`offline.clear.${key}`, locale)
  return {
    sectionTitle: text('sectionTitle'),
    hint: text('hint'),
    sizeTemplate: text('size'),
    notCachedTemplate: text('notCached'),
    emptyTooltip: text('emptyTooltip'),
    filesWord: text('filesWord'),
    action: text('action'),
    confirmTitle: text('confirmTitle'),
    confirmBody: text('confirmBody'),
    confirmOfflineWarning: text('confirmOfflineWarning'),
    confirmAction: text('confirmAction'),
    cancel: text('cancel'),
    close: text('close'),
    clearedTitle: text('clearedTitle'),
    clearedBody: text('clearedBody'),
    clearedOfflineWarning: text('clearedOfflineWarning'),
    reload: text('reload')
  }
}

export function formatOfflineByteSize(bytes) {
  if (!(Number(bytes) > 0)) return '0.0 MB'
  return formatCachedByteSize(bytes)
}

export function formatOfflineSettingsSize({
  bytes = null,
  ready = false,
  cleared = false,
  preparingText = '',
  done = null,
  total = null,
  copy
} = {}) {
  if (!ready && !cleared) return preparingText
  const size = formatOfflineByteSize(bytes)
  const empty = cleared || bytes == null || !(bytes > 0)
  const detail = empty
    ? size
    : formatOfflineCacheDetail({ bytes, done, total, filesWord: copy?.filesWord || 'files' })
  const template = empty ? copy?.notCachedTemplate : copy?.sizeTemplate
  return String(template || '').replaceAll('{size}', detail)
}

export function applyOfflineCacheSettings(elements, view) {
  if (!elements) return
  if (elements.sectionTitle) elements.sectionTitle.textContent = view.sectionTitle || ''
  if (elements.hint) elements.hint.textContent = view.hint || ''
  if (elements.size) elements.size.textContent = view.sizeText || ''
  if (elements.persist) elements.persist.textContent = view.persistText || ''
  if (elements.incomplete) {
    const warning = view.incompleteText || ''
    elements.incomplete.hidden = warning.length === 0
    elements.incomplete.textContent = warning
  }
  if (elements.error) {
    const error = view.errorText || ''
    elements.error.hidden = error.length === 0
    elements.error.textContent = error
  }
  if (elements.retry) {
    const canRetry = view.showRetry === true
    elements.retry.hidden = false
    elements.retry.disabled = !canRetry
    elements.retry.setAttribute('aria-disabled', canRetry ? 'false' : 'true')
    elements.retry.textContent = view.retryLabel || 'Retry download'
  }
  if (elements.clearButton) elements.clearButton.textContent = view.action || ''
}

export function applyOfflineClearDialog(elements, view) {
  const root = elements?.dialog
  if (!root) return
  const open = view?.phase === 'confirm' || view?.phase === 'cleared'
  root.hidden = !open
  if (!open) return

  const cleared = view.phase === 'cleared'
  if (elements.title) elements.title.textContent = cleared ? view.clearedTitle : view.confirmTitle
  if (elements.body) elements.body.textContent = cleared ? view.clearedBody : view.confirmBody
  if (elements.warning) {
    const warning = cleared ? view.clearedOfflineWarning : view.confirmOfflineWarning
    elements.warning.hidden = view.offline !== true
    elements.warning.textContent = view.offline === true ? (warning || '') : ''
  }
  if (elements.confirm) {
    elements.confirm.hidden = cleared
    elements.confirm.disabled = view.clearing === true
    elements.confirm.textContent = view.confirmAction || ''
  }
  if (elements.reload) {
    elements.reload.hidden = !cleared
    elements.reload.textContent = view.reload || ''
  }
  if (elements.cancel) elements.cancel.textContent = cleared ? (view.close || '') : (view.cancel || '')
}

export function createOfflineLongPress(openConfirm, { delay = LONG_PRESS_MS } = {}) {
  let timer = null
  let originX = 0
  let originY = 0
  let fired = false

  function clearTimer() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  return {
    pointerDown(event) {
      if (event && event.button != null && event.button !== 0) return
      fired = false
      originX = event?.clientX || 0
      originY = event?.clientY || 0
      clearTimer()
      timer = setTimeout(() => {
        timer = null
        fired = true
        openConfirm()
      }, delay)
    },
    pointerMove(event) {
      if (!timer) return
      const dx = (event?.clientX || 0) - originX
      const dy = (event?.clientY || 0) - originY
      if (Math.hypot(dx, dy) > 10) clearTimer()
    },
    pointerUp() {
      clearTimer()
    },
    consumeClick() {
      if (!fired) return false
      fired = false
      return true
    }
  }
}
