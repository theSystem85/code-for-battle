import { uiText } from '../ui/uiText.js'
import { PRESENCE_STATUSES } from './multiplayerStats.js'

export const PRESENCE_SESSION_KEY = 'cfb-presence-session'
export const HEARTBEAT_BASE_MS = 45_000
export const HEARTBEAT_JITTER_MS = 5_000
export const PRESENCE_BACKOFF_BASE_MS = 15_000
export const PRESENCE_MAX_BACKOFF_MS = 120_000
export const PRESENCE_MAX_FAILURES = 4

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export function isPresenceSessionId(value) {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value)
}

function readStore(store) {
  try {
    return store?.getItem(PRESENCE_SESSION_KEY) || ''
  } catch {
    return ''
  }
}

function writeStore(store, value) {
  try {
    store?.setItem(PRESENCE_SESSION_KEY, value)
  } catch {
    // Private mode still keeps the id in memory for this page.
  }
}

export function readOrCreatePresenceSessionId(stores = {}, createId) {
  const existing = [readStore(stores.sessionStorage), readStore(stores.localStorage)].find(isPresenceSessionId)
  const created = existing || (typeof createId === 'function' ? createId() : '')
  if (!isPresenceSessionId(created)) {
    throw new Error('presence session id is invalid')
  }
  writeStore(stores.sessionStorage, created)
  writeStore(stores.localStorage, created)
  return created
}

export function nextHeartbeatDelay(random = Math.random) {
  const swing = ((Number(random()) || 0) * 2 - 1) * HEARTBEAT_JITTER_MS
  return Math.round(HEARTBEAT_BASE_MS + swing)
}

export function resolvePresenceStatus(snapshot = {}) {
  if (snapshot.quickMatchSearching) return 'looking-for-match'
  if (snapshot.isRemoteClient) return 'mp-client'
  if (snapshot.hostingOnline) return 'mp-host'
  if (!snapshot.gameStarted || snapshot.gameOver) return 'menu'
  return 'single-player'
}

export function matchIsLive({ gameStarted, gamePaused, remoteHumanCount, gameOver } = {}) {
  return gameStarted === true && gamePaused !== true && Number(remoteHumanCount) > 0 && gameOver !== true
}

export function shouldPublishOpenInvite({ enabled, gameOver, slotFree, matchLive } = {}) {
  return enabled === true && gameOver !== true && slotFree === true && matchLive !== true
}

export function presenceSnapshotFromState(state = {}, { listing, searching } = {}) {
  const localId = state.humanPlayer === 'player' ? 'player1' : (state.humanPlayer || 'player1')
  const parties = Array.isArray(state.partyStates) ? state.partyStates : []
  const remoteHumanCount = parties.filter(party => party?.partyId !== localId && party?.aiActive === false).length
  const party = parties.find(entry => entry?.partyId === listing?.partyId)
  const slotFree = Boolean(
    listing?.enabled
    && party?.inviteToken
    && party.aiActive !== false
    && (party.owner === 'AI' || party.owner == null)
  )
  const gameOver = state.gameOver === true
  const matchLive = matchIsLive({
    gameStarted: state.gameStarted === true,
    gamePaused: state.gamePaused === true,
    remoteHumanCount,
    gameOver
  })
  const publish = shouldPublishOpenInvite({
    enabled: listing?.enabled === true,
    gameOver,
    slotFree,
    matchLive
  })
  const isRemoteClient = Boolean(state.multiplayerSession?.isRemote && state.multiplayerSession?.localRole === 'client')
  const status = resolvePresenceStatus({
    quickMatchSearching: searching === true,
    isRemoteClient,
    hostingOnline: publish || (!isRemoteClient && remoteHumanCount > 0),
    gameStarted: state.gameStarted === true,
    gameOver
  })
  if (!PRESENCE_STATUSES.includes(status)) {
    return { status: 'menu', openInviteToken: null, listingActive: false }
  }
  return {
    status,
    openInviteToken: publish ? party.inviteToken : null,
    listingActive: publish,
    remoteHumanCount,
    matchLive,
    gameOver
  }
}

export function formatPresenceLine(counts, locale) {
  const template = uiText('multiplayer.presenceLine', locale)
  return template
    .replaceAll('{playing}', String(Math.max(0, Number(counts?.playing) || 0)))
    .replaceAll('{online}', String(Math.max(0, Number(counts?.onlineMultiplayer) || 0)))
}

export function createPresenceScheduler(deps) {
  let timer = null
  let stopped = true
  let unavailable = false
  let failures = 0
  let inFlight = false
  let pending = false

  const clear = () => {
    if (timer != null) deps.cancel(timer)
    timer = null
  }

  const arm = (delay) => {
    clear()
    if (stopped || unavailable) return
    timer = deps.schedule(() => {
      void tick('interval')
    }, delay)
  }

  async function tick() {
    if (stopped) return
    if (deps.isOffline()) {
      clear()
      deps.onOffline()
      return
    }
    if (deps.isDocumentHidden()) {
      clear()
      return
    }
    if (inFlight) {
      pending = true
      return
    }
    inFlight = true
    try {
      const payload = deps.getPayload()
      const counts = await deps.send(payload)
      failures = 0
      unavailable = false
      deps.onCounts(counts)
      if (!stopped && !deps.isOffline() && !deps.isDocumentHidden()) {
        arm(deps.nextDelay())
      }
    } catch (error) {
      const status = Number(error?.status) || 0
      if (status === 404 || status === 501) {
        unavailable = true
        clear()
        deps.onUnavailable(error)
        return
      }
      if (status === 429) {
        arm(PRESENCE_BACKOFF_BASE_MS)
        return
      }
      failures += 1
      if (failures >= (deps.maxFailures || PRESENCE_MAX_FAILURES)) {
        unavailable = true
        clear()
        deps.onUnavailable(error)
        return
      }
      const delay = Math.min(
        deps.maxBackoffMs || PRESENCE_MAX_BACKOFF_MS,
        (deps.backoffBaseMs || PRESENCE_BACKOFF_BASE_MS) * (2 ** (failures - 1))
      )
      arm(delay)
    } finally {
      inFlight = false
      if (pending && !stopped && !unavailable) {
        pending = false
        void tick()
      }
    }
  }

  return {
    start() {
      stopped = false
      unavailable = false
      failures = 0
      void tick()
    },
    notifyChange() {
      if (stopped || unavailable) return
      void tick()
    },
    setHidden(hidden) {
      if (hidden) {
        clear()
        return
      }
      if (!stopped && !unavailable) void tick()
    },
    setOffline(offline) {
      if (offline) {
        clear()
        deps.onOffline()
        return
      }
      if (stopped) return
      unavailable = false
      failures = 0
      void tick()
    },
    stop() {
      stopped = true
      clear()
    },
    isUnavailable() {
      return unavailable
    }
  }
}
