import { gameState } from '../gameState.js'
import { getOpenHostListing, setOpenHostListing, subscribeOpenHostListing } from '../network/openHostListing.js'
import {
  createPresenceScheduler,
  formatPresenceLine,
  nextHeartbeatDelay,
  presenceSnapshotFromState,
  readOrCreatePresenceSessionId
} from '../network/presenceClient.js'
import { postStats } from '../network/statsApi.js'
import { isEffectivelyOffline, subscribeOfflineSnapshot } from '../pwa/offlineState.js'
import { placeFloatingTip } from '../pwa/offlineController.js'
import { uiText } from './uiText.js'

const REFRESH_EVENT = 'cfb-presence-refresh'
let scheduler = null
let searching = false

export function notifyPresenceChange() {
  scheduler?.notifyChange()
}

export function isQuickMatchSearching() {
  return searching
}

function sessionId() {
  return readOrCreatePresenceSessionId({
    sessionStorage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
    localStorage: typeof localStorage !== 'undefined' ? localStorage : null
  }, () => crypto.randomUUID())
}

function currentSnapshot() {
  return presenceSnapshotFromState(gameState, {
    listing: getOpenHostListing(),
    searching
  })
}

function payloadFor(id) {
  const snapshot = currentSnapshot()
  if (getOpenHostListing().enabled && !snapshot.listingActive) {
    setOpenHostListing({ enabled: false })
  }
  return {
    sessionId: id,
    status: snapshot.status,
    openInviteToken: snapshot.openInviteToken
  }
}

export function bindMultiplayerTurnTip(button) {
  bindTip(button, document.getElementById('multiplayerTurnTip'), () => uiText('multiplayer.turnTooltip'))
}

function bindTip(button, tip, text) {
  if (!button || !tip) return
  const show = () => {
    tip.textContent = text()
    placeFloatingTip(button, tip)
  }
  const hide = () => {
    tip.hidden = true
  }
  button.addEventListener('pointerenter', show)
  button.addEventListener('focus', show)
  button.addEventListener('pointerleave', hide)
  button.addEventListener('blur', hide)
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') show()
  })
}

function applyStaticCopy(elements) {
  if (elements.quickMatch) elements.quickMatch.textContent = uiText('multiplayer.quickMatch')
  if (elements.becomeHost) elements.becomeHost.textContent = uiText('multiplayer.becomeOpenHost')
  if (elements.turnButton) elements.turnButton.textContent = uiText('multiplayer.turnNote')
}

export function initMultiplayerPresenceUi() {
  const line = document.getElementById('multiplayerPresenceLine')
  const quickMatch = document.getElementById('quickMatchBtn')
  const becomeHost = document.getElementById('becomeOpenHostBtn')
  const status = document.getElementById('quickMatchStatus')
  const turnButton = document.getElementById('multiplayerTurnTipButton')
  const tip = document.getElementById('multiplayerTurnTip')
  if (!line || !quickMatch) return () => {}

  const elements = { line, quickMatch, becomeHost, status, turnButton, tip }
  applyStaticCopy(elements)
  bindTip(turnButton, tip, () => uiText('multiplayer.turnTooltip'))

  let id = ''
  try {
    id = sessionId()
  } catch {
    line.hidden = true
    return () => {}
  }

  const hideLine = () => {
    line.hidden = true
    line.textContent = ''
  }

  const showCounts = (counts) => {
    if (isEffectivelyOffline() || !counts || typeof counts.playing !== 'number') {
      hideLine()
      return
    }
    line.hidden = false
    line.textContent = formatPresenceLine(counts)
    if (counts.openSlot === 'filled' || counts.openSlot === 'closed') {
      const listing = getOpenHostListing()
      if (listing.enabled && counts.openSlot === 'filled') {
        setOpenHostListing({ enabled: false })
      }
    }
  }

  scheduler = createPresenceScheduler({
    isOffline: () => isEffectivelyOffline(),
    isDocumentHidden: () => document.visibilityState === 'hidden',
    getPayload: () => payloadFor(id),
    send: (body) => postStats('/presence', body),
    nextDelay: () => nextHeartbeatDelay(),
    onCounts: showCounts,
    onUnavailable: hideLine,
    onOffline: hideLine,
    schedule: (fn, ms) => window.setTimeout(fn, ms),
    cancel: (timer) => window.clearTimeout(timer)
  })

  const setQuickMatchEnabled = (enabled) => {
    quickMatch.disabled = !enabled || isEffectivelyOffline()
  }

  const showNone = () => {
    if (status) {
      status.textContent = uiText('multiplayer.quickMatchNone')
      status.classList.remove('error', 'success')
    }
    if (becomeHost) becomeHost.hidden = false
  }

  quickMatch.addEventListener('click', async() => {
    if (isEffectivelyOffline() || searching) return
    searching = true
    setQuickMatchEnabled(false)
    if (becomeHost) becomeHost.hidden = true
    if (status) {
      status.textContent = uiText('multiplayer.quickMatchSearching')
      status.classList.remove('error', 'success')
    }
    notifyPresenceChange()
    try {
      const result = await postStats('/quick-match', { sessionId: id })
      if (result?.inviteToken) {
        const baseUrl = `${window.location.origin}${window.location.pathname}`
        window.location.href = `${baseUrl}?invite=${encodeURIComponent(result.inviteToken)}`
        return
      }
      showNone()
    } catch {
      if (status) {
        status.textContent = uiText('multiplayer.quickMatchError')
        status.classList.add('error')
      }
    } finally {
      searching = false
      setQuickMatchEnabled(true)
      notifyPresenceChange()
    }
  })

  becomeHost?.addEventListener('click', () => {
    if (isEffectivelyOffline()) return
    document.dispatchEvent(new CustomEvent('cfb-become-open-host'))
  })

  const onRefresh = () => notifyPresenceChange()
  document.addEventListener(REFRESH_EVENT, onRefresh)
  const onVisibility = () => scheduler?.setHidden(document.visibilityState === 'hidden')
  document.addEventListener('visibilitychange', onVisibility)
  const unsubscribeOffline = subscribeOfflineSnapshot(() => {
    const offline = isEffectivelyOffline()
    setQuickMatchEnabled(!offline)
    if (offline && becomeHost) becomeHost.hidden = true
    scheduler?.setOffline(offline)
  })
  const unsubscribeListing = subscribeOpenHostListing(() => notifyPresenceChange())

  const signatureOf = () => {
    const snapshot = currentSnapshot()
    return `${snapshot.status}|${snapshot.openInviteToken || ''}|${snapshot.listingActive}`
  }
  let lastSignature = signatureOf()
  const watch = window.setInterval(() => {
    const signature = signatureOf()
    if (signature !== lastSignature) {
      lastSignature = signature
      notifyPresenceChange()
    }
  }, 1000)

  scheduler.start()
  setQuickMatchEnabled(!isEffectivelyOffline())

  return () => {
    window.clearInterval(watch)
    document.removeEventListener(REFRESH_EVENT, onRefresh)
    document.removeEventListener('visibilitychange', onVisibility)
    unsubscribeOffline()
    unsubscribeListing()
    scheduler?.stop()
    scheduler = null
  }
}
