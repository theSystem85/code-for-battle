import { describe, expect, it, vi } from 'vitest'
import {
  createPresenceScheduler,
  formatPresenceLine,
  nextHeartbeatDelay,
  presenceSnapshotFromState,
  readOrCreatePresenceSessionId,
  resolvePresenceStatus
} from '../../src/network/presenceClient.js'
import { statsEndpoint } from '../../src/network/statsApi.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    }
  }
}

function harness(overrides = {}) {
  const timers = []
  let nextId = 1
  const sent = []
  const counts = []
  const unavailable = []
  const offline = []
  const deps = {
    offline: false,
    hidden: false,
    payload: { sessionId: 'session-1234', status: 'menu', openInviteToken: null },
    sendResult: { playing: 1, onlineMultiplayer: 0 },
    failStatus: 0,
    ...overrides
  }
  const scheduler = createPresenceScheduler({
    isOffline: () => deps.offline,
    isDocumentHidden: () => deps.hidden,
    getPayload: () => deps.payload,
    send: async(payload) => {
      sent.push(payload)
      if (deps.failStatus) {
        const error = new Error('failed')
        error.status = deps.failStatus
        throw error
      }
      return deps.sendResult
    },
    nextDelay: () => 45000,
    onCounts: (value) => counts.push(value),
    onUnavailable: (error) => unavailable.push(error),
    onOffline: () => offline.push(true),
    schedule: (fn, ms) => {
      const id = nextId
      nextId += 1
      timers.push({ id, fn, ms })
      return id
    },
    cancel: (id) => {
      const index = timers.findIndex(timer => timer.id === id)
      if (index >= 0) timers.splice(index, 1)
    },
    maxFailures: 4,
    backoffBaseMs: 15000,
    maxBackoffMs: 120000
  })
  return { scheduler, timers, sent, counts, unavailable, offline, deps }
}

describe('presence client', () => {
  it('stores one anonymous session id in session and local storage', () => {
    const sessionStorage = memoryStorage()
    const localStorage = memoryStorage()
    const created = readOrCreatePresenceSessionId({ sessionStorage, localStorage }, () => 'session-created')
    expect(created).toBe('session-created')
    expect(sessionStorage.getItem('cfb-presence-session')).toBe('session-created')
    expect(localStorage.getItem('cfb-presence-session')).toBe('session-created')
    sessionStorage.setItem('cfb-presence-session', 'session-kept01')
    expect(readOrCreatePresenceSessionId({ sessionStorage, localStorage }, () => 'session-other1')).toBe('session-kept01')
  })

  it('jitters the heartbeat around 45 seconds', () => {
    expect(nextHeartbeatDelay(() => 0)).toBe(40000)
    expect(nextHeartbeatDelay(() => 0.5)).toBe(45000)
    expect(nextHeartbeatDelay(() => 1)).toBe(50000)
  })

  it('maps menu, single-player, host, client, and quick-match search', () => {
    expect(resolvePresenceStatus({ gameStarted: false })).toBe('menu')
    expect(resolvePresenceStatus({ gameStarted: true })).toBe('single-player')
    expect(resolvePresenceStatus({ gameStarted: true, gameOver: true })).toBe('menu')
    expect(resolvePresenceStatus({ isRemoteClient: true, gameStarted: true })).toBe('mp-client')
    expect(resolvePresenceStatus({ hostingOnline: true, gameStarted: true })).toBe('mp-host')
    expect(resolvePresenceStatus({ quickMatchSearching: true, hostingOnline: true })).toBe('looking-for-match')

    const open = presenceSnapshotFromState({
      gameStarted: true,
      gamePaused: true,
      humanPlayer: 'player1',
      partyStates: [
        { partyId: 'player1', owner: 'Host', aiActive: false },
        { partyId: 'player2', owner: 'AI', aiActive: true, inviteToken: 'instance-player2-1000' }
      ]
    }, {
      listing: { enabled: true, partyId: 'player2', inviteToken: 'instance-player2-1000' },
      searching: false
    })
    expect(open.status).toBe('mp-host')
    expect(open.openInviteToken).toBe('instance-player2-1000')

    const live = presenceSnapshotFromState({
      gameStarted: true,
      gamePaused: false,
      humanPlayer: 'player1',
      partyStates: [
        { partyId: 'player1', owner: 'Host', aiActive: false },
        { partyId: 'player2', owner: 'Red', aiActive: false, inviteToken: 'instance-player2-1000' }
      ]
    }, {
      listing: { enabled: true, partyId: 'player2', inviteToken: 'instance-player2-1000' }
    })
    expect(live.listingActive).toBe(false)
    expect(live.openInviteToken).toBeNull()
    expect(live.status).toBe('mp-host')
  })

  it('localizes the sidebar line', () => {
    expect(formatPresenceLine({ playing: 128, onlineMultiplayer: 14 }, 'en'))
      .toBe('128 playing now · 14 in online multiplayer')
    expect(formatPresenceLine({ playing: 128, onlineMultiplayer: 14 }, 'de'))
      .toBe('128 spielen gerade · 14 im Online-Mehrspieler')
  })

  it('posts presence to the signalling host when one is configured', () => {
    expect(statsEndpoint('/presence', '')).toBe('/api/presence')
    expect(statsEndpoint('/quick-match', 'http://localhost:3333')).toBe('http://localhost:3333/quick-match')
  })

  it('sends immediately, then on the timer, and again when the status changes', async() => {
    const { scheduler, timers, sent, counts, deps } = harness()
    scheduler.start()
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(counts).toHaveLength(1)
    expect(timers.map(timer => timer.ms)).toEqual([45000])

    deps.payload = { ...deps.payload, status: 'single-player' }
    scheduler.notifyChange()
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1].status).toBe('single-player')
    expect(timers.at(-1).ms).toBe(45000)
  })

  it('pauses while hidden and while offline', async() => {
    const hidden = harness({ hidden: true })
    hidden.scheduler.start()
    await Promise.resolve()
    expect(hidden.sent).toHaveLength(0)
    expect(hidden.timers).toHaveLength(0)
    hidden.deps.hidden = false
    hidden.scheduler.setHidden(false)
    await vi.waitFor(() => expect(hidden.sent).toHaveLength(1))

    const offline = harness({ offline: true })
    offline.scheduler.start()
    await Promise.resolve()
    expect(offline.sent).toHaveLength(0)
    expect(offline.offline).toHaveLength(1)
    offline.deps.offline = false
    offline.scheduler.setOffline(false)
    await vi.waitFor(() => expect(offline.sent).toHaveLength(1))
  })

  it('backs off and then stops on errors, and stops immediately when the route is missing', async() => {
    const failing = harness({ failStatus: 503 })
    failing.scheduler.start()
    await vi.waitFor(() => expect(failing.sent).toHaveLength(1))
    expect(failing.timers.map(timer => timer.ms)).toEqual([15000])
    await failing.timers[0].fn()
    await vi.waitFor(() => expect(failing.sent).toHaveLength(2))
    expect(failing.timers.at(-1).ms).toBe(30000)
    await failing.timers.at(-1).fn()
    await vi.waitFor(() => expect(failing.sent).toHaveLength(3))
    await failing.timers.at(-1).fn()
    await vi.waitFor(() => expect(failing.unavailable).toHaveLength(1))
    expect(failing.scheduler.isUnavailable()).toBe(true)
    expect(failing.timers).toHaveLength(0)

    const missing = harness({ failStatus: 404 })
    missing.scheduler.start()
    await vi.waitFor(() => expect(missing.unavailable).toHaveLength(1))
    expect(missing.timers).toHaveLength(0)
    expect(missing.sent).toHaveLength(1)
  })

  it('backs off on 429 without marking the endpoint unavailable', async() => {
    const limited = harness({ failStatus: 429 })
    limited.scheduler.start()
    await vi.waitFor(() => expect(limited.sent).toHaveLength(1))
    expect(limited.unavailable).toHaveLength(0)
    expect(limited.scheduler.isUnavailable()).toBe(false)
    expect(limited.timers.map(timer => timer.ms)).toEqual([15000])
  })
})
