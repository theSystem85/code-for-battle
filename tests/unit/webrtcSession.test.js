import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    multiplayerSession: {
      status: 'disconnected',
      isRemote: false,
      alias: null,
      inviteToken: null,
      connectedAt: null
    },
    gamePaused: false,
    gameStarted: true
  }
}))

const multiplayerStore = vi.hoisted(() => ({
  markPartyControlledByHuman: vi.fn(),
  markPartyControlledByAi: vi.fn(),
  invalidateInviteToken: vi.fn(),
  generateInviteForParty: vi.fn().mockResolvedValue(undefined),
  getPartyState: vi.fn(),
  setPartyUnresponsiveState: vi.fn()
}))

vi.mock('../../src/network/multiplayerStore.js', () => multiplayerStore)

const hostNotifications = vi.hoisted(() => ({
  showHostNotification: vi.fn()
}))

vi.mock('../../src/network/hostNotifications.js', () => hostNotifications)

const remoteControlState = vi.hoisted(() => ({
  applyRemoteControlSnapshot: vi.fn(),
  releaseRemoteControlSource: vi.fn()
}))

vi.mock('../../src/input/remoteControlState.js', () => remoteControlState)

const sessionEvents = vi.hoisted(() => ({
  emitMultiplayerSessionChange: vi.fn()
}))

vi.mock('../../src/network/multiplayerSessionEvents.js', () => sessionEvents)

const signalling = vi.hoisted(() => ({
  fetchPendingSessions: vi.fn().mockResolvedValue([]),
  postAnswer: vi.fn().mockResolvedValue(undefined),
  postCandidate: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../src/network/signalling.js', () => signalling)

const commandSync = vi.hoisted(() => ({
  handleReceivedCommand: vi.fn(),
  startGameStateSync: vi.fn(),
  stopGameStateSync: vi.fn(),
  updateNetworkStats: vi.fn(),
  notifyClientConnected: vi.fn(),
  initializeLockstepSession: vi.fn(),
  isLockstepEnabled: vi.fn(),
  disableLockstep: vi.fn()
}))

vi.mock('../../src/network/gameCommandSync.js', () => commandSync)

import * as webrtcSession from '../../src/network/webrtcSession.js'
import { gameState } from '../../src/gameState.js'

const {
  AI_REACTIVATION_EVENT,
  getActiveHostMonitor,
  kickPlayer,
  observeAiReactivation,
  stopHostInvite,
  watchHostInvite
} = webrtcSession

let lastPeerConnection = null

class MockPeerConnection {
  constructor() {
    this.listeners = new Map()
    this.connectionState = 'new'
    this.addIceCandidate = vi.fn().mockResolvedValue(undefined)
    this.setRemoteDescription = vi.fn().mockResolvedValue(undefined)
    this.createAnswer = vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-answer' })
    this.setLocalDescription = vi.fn().mockResolvedValue(undefined)
    this.close = vi.fn()
  }

  addEventListener(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(handler)
  }

  dispatchEvent(event, payload) {
    const handlers = this.listeners.get(event)
    if (!handlers) {
      return
    }
    handlers.forEach((handler) => handler(payload))
  }
}

const createDataChannel = () => {
  const listeners = new Map()
  return {
    readyState: 'open',
    send: vi.fn(),
    close: vi.fn(),
    addEventListener(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, [])
      }
      listeners.get(event).push(handler)
    },
    dispatchEvent(event, payload) {
      const handlers = listeners.get(event)
      if (!handlers) {
        return
      }
      handlers.forEach((handler) => handler(payload))
    }
  }
}

beforeEach(() => {
  lastPeerConnection = null
  globalThis.RTCPeerConnection = vi.fn(function() {
    lastPeerConnection = new MockPeerConnection()
    return lastPeerConnection
  })
  multiplayerStore.getPartyState.mockReturnValue({ inviteToken: 'invite-new' })
  commandSync.isLockstepEnabled.mockReturnValue(false)
  gameState.gamePaused = false
  vi.useFakeTimers()
})

afterEach(() => {
  stopHostInvite('party-1')
  stopHostInvite('party-2')
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('AI reactivation events', () => {
  it('subscribes and unsubscribes to AI reactivation', () => {
    const handler = vi.fn()
    const cleanup = observeAiReactivation(handler)
    document.dispatchEvent(new CustomEvent(AI_REACTIVATION_EVENT, { detail: { partyId: 'party-1' } }))
    expect(handler).toHaveBeenCalledTimes(1)

    cleanup()
    document.dispatchEvent(new CustomEvent(AI_REACTIVATION_EVENT, { detail: { partyId: 'party-1' } }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('returns a no-op cleanup when handler is invalid', () => {
    const addListenerSpy = vi.spyOn(document, 'addEventListener')

    const cleanup = observeAiReactivation('not-a-function')

    expect(typeof cleanup).toBe('function')
    expect(addListenerSpy).not.toHaveBeenCalled()
    addListenerSpy.mockRestore()
  })
})

describe('Host session behavior', () => {
  it('answers offers and flushes queued ICE candidates', async() => {
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    const entry = {
      peerId: 'peer-1',
      alias: 'Remote',
      offer: { type: 'offer', sdp: 'mock-offer' },
      candidates: [{ candidate: { candidate: 'candidate-1' }, origin: 'peer' }]
    }

    monitor._processEntry(entry)

    const session = monitor.sessions.get('peer-1')
    expect(session).toBeTruthy()

    await session.answerOffer(entry.offer)

    expect(signalling.postAnswer).toHaveBeenCalledWith({
      inviteToken: 'token-1',
      peerId: 'peer-1',
      answer: JSON.stringify({ type: 'answer', sdp: 'mock-answer' })
    })
    expect(lastPeerConnection.addIceCandidate).toHaveBeenCalledWith({ candidate: 'candidate-1' })
  })

  it('answers an ICE restart with the new offer revision', async() => {
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    monitor._processEntry({
      peerId: 'peer-1',
      alias: 'galina',
      offer: { type: 'offer', sdp: 'first-offer' },
      offerRevision: 1,
      candidates: []
    })
    const session = monitor.sessions.get('peer-1')
    session.answerSent = true
    session.answeredRevision = 1
    session.lastOfferSdp = 'first-offer'
    signalling.postAnswer.mockClear()

    await session.answerOffer({ type: 'offer', sdp: 'restart-offer' }, 2)

    expect(signalling.postAnswer).toHaveBeenCalledWith(expect.objectContaining({
      inviteToken: 'token-1',
      peerId: 'peer-1',
      offerRevision: 2
    }))
  })

  it('processes and forwards data channel control messages', () => {
    const onControlMessage = vi.fn()
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    monitor._processEntry({
      peerId: 'peer-1',
      offer: { type: 'offer', sdp: 'mock-offer' },
      candidates: []
    })

    const session = getActiveHostMonitor('party-1').sessions.get('peer-1')
    const dataChannel = createDataChannel()

    session.onControlMessage = onControlMessage
    session._attachDataChannel(dataChannel)

    dataChannel.dispatchEvent('message', { data: JSON.stringify({ type: 'remote-control', input: 'payload' }) })

    expect(onControlMessage).toHaveBeenCalledWith(session, { type: 'remote-control', input: 'payload' })
    expect(commandSync.updateNetworkStats).toHaveBeenCalledWith(0, JSON.stringify({ type: 'remote-control', input: 'payload' }).length)
  })

  it('ignores non-peer or malformed ICE candidates', () => {
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    monitor._processEntry({
      peerId: 'peer-1',
      offer: { type: 'offer', sdp: 'mock-offer' },
      candidates: []
    })

    const session = monitor.sessions.get('peer-1')
    session.answerSent = true

    session.processCandidateEntries([
      { candidate: { candidate: 'host-candidate' }, origin: 'host' },
      'not-json',
      JSON.stringify({ candidate: 'peer-candidate' })
    ])

    expect(lastPeerConnection.addIceCandidate).toHaveBeenCalledTimes(1)
    expect(lastPeerConnection.addIceCandidate).toHaveBeenCalledWith({ candidate: 'peer-candidate' })
  })

  it('sends host status updates through the data channel', () => {
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    monitor._processEntry({
      peerId: 'peer-1',
      offer: { type: 'offer', sdp: 'mock-offer' },
      candidates: []
    })

    const createdSession = monitor.sessions.get('peer-1')
    createdSession.dataChannel = createDataChannel()

    createdSession.sendHostStatus({ type: 'host-status', running: true })

    const expectedPayload = JSON.stringify({ type: 'host-status', running: true })
    expect(createdSession.dataChannel.send).toHaveBeenCalledWith(expectedPayload)
    expect(commandSync.updateNetworkStats).toHaveBeenCalledWith(expectedPayload.length, 0)
  })

  it('skips host status updates when data channel is not open', () => {
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    monitor._processEntry({
      peerId: 'peer-1',
      offer: { type: 'offer', sdp: 'mock-offer' },
      candidates: []
    })

    const createdSession = monitor.sessions.get('peer-1')
    createdSession.dataChannel = { readyState: 'closed', send: vi.fn(), close: vi.fn() }
    commandSync.updateNetworkStats.mockClear()

    createdSession.sendHostStatus({ type: 'host-status', running: false })

    expect(createdSession.dataChannel.send).not.toHaveBeenCalled()
    expect(commandSync.updateNetworkStats).not.toHaveBeenCalled()
  })

  it('notifies session state on data channel close', () => {
    const onStateChange = vi.fn()
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    monitor._processEntry({
      peerId: 'peer-1',
      offer: { type: 'offer', sdp: 'mock-offer' },
      candidates: []
    })

    const session = monitor.sessions.get('peer-1')
    session.onStateChange = onStateChange
    const dataChannel = createDataChannel()

    session._attachDataChannel(dataChannel)
    dataChannel.dispatchEvent('close')

    expect(onStateChange).toHaveBeenCalledWith(session, 'disconnected')
  })
})

describe('Host invite monitoring', () => {
  it('handles client connection state changes', () => {
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    const session = {
      alias: 'Remote',
      sourceId: 'remote-party-1-peer-1',
      peerId: 'peer-1',
      dispose: vi.fn()
    }
    monitor.sessions.set('peer-1', session)

    monitor._handleSessionState(session, 'connected')

    expect(multiplayerStore.markPartyControlledByHuman).toHaveBeenCalledWith('party-1', 'Remote')
    expect(hostNotifications.showHostNotification).toHaveBeenCalledWith('Remote connected to party party-1')
    expect(sessionEvents.emitMultiplayerSessionChange).toHaveBeenCalled()
    expect(commandSync.notifyClientConnected).toHaveBeenCalled()
    expect(commandSync.initializeLockstepSession).toHaveBeenCalled()
    expect(commandSync.startGameStateSync).toHaveBeenCalled()
  })

  it('does not reinitialize lockstep when already enabled', () => {
    commandSync.isLockstepEnabled.mockReturnValue(true)
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    const session = {
      alias: 'Remote',
      sourceId: 'remote-party-1-peer-1',
      peerId: 'peer-1',
      dispose: vi.fn()
    }
    monitor.sessions.set('peer-1', session)

    monitor._handleSessionState(session, 'connected')

    expect(commandSync.initializeLockstepSession).not.toHaveBeenCalled()
  })

  it('restores AI control on disconnect and stops sync', () => {
    commandSync.isLockstepEnabled.mockReturnValue(true)
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    const session = {
      alias: 'Remote',
      sourceId: 'remote-party-1-peer-1',
      peerId: 'peer-1',
      connectionState: 'connected',
      dispose: vi.fn()
    }
    monitor.sessions.set('peer-1', session)
    monitor.activeSession = session

    const eventHandler = vi.fn()
    document.addEventListener(AI_REACTIVATION_EVENT, eventHandler)

    monitor._handleSessionState(session, 'disconnected')

    expect(remoteControlState.releaseRemoteControlSource).toHaveBeenCalledWith(session.sourceId)
    expect(multiplayerStore.markPartyControlledByAi).not.toHaveBeenCalled()
    expect(multiplayerStore.setPartyUnresponsiveState).toHaveBeenCalledWith('party-1', expect.any(Number))
    expect(eventHandler).not.toHaveBeenCalled()
    expect(hostNotifications.showHostNotification).toHaveBeenCalledWith('Connection interrupted. Waiting for reconnection...')
    expect(commandSync.stopGameStateSync).not.toHaveBeenCalled()
    expect(commandSync.disableLockstep).not.toHaveBeenCalled()
  })


  it('pauses game when client becomes unresponsive and resumes on heartbeat pong', () => {
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    const session = {
      alias: 'Remote',
      sourceId: 'remote-party-1-peer-1',
      peerId: 'peer-1',
      connectionState: 'connected',
      dispose: vi.fn(),
      sendHostStatus: vi.fn(),
      lastResponsiveAt: Date.now() - 7000,
      unresponsiveSince: null,
      aiFallbackHandle: null
    }
    monitor.sessions.set('peer-1', session)

    monitor._checkForUnresponsiveSessions()

    expect(multiplayerStore.setPartyUnresponsiveState).toHaveBeenCalledWith('party-1', expect.any(Number))

    expect(gameState.gamePaused).toBe(true)

    monitor._handleControlMessage(session, { type: 'heartbeat-pong' })

    expect(multiplayerStore.setPartyUnresponsiveState).toHaveBeenLastCalledWith('party-1', null)
    expect(gameState.gamePaused).toBe(false)
  })

  it('routes control messages to command sync and remote control handlers', () => {
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    const session = { sourceId: 'remote-party-1-peer-1' }

    monitor._handleControlMessage(session, { type: 'game-command', command: 'move' })
    monitor._handleControlMessage(session, { type: 'remote-control', payload: { axis: 'x' } })

    expect(commandSync.handleReceivedCommand).toHaveBeenCalledWith({ type: 'game-command', command: 'move' }, session.sourceId)
    expect(remoteControlState.applyRemoteControlSnapshot).toHaveBeenCalledWith(session.sourceId, { type: 'remote-control', payload: { axis: 'x' } })
  })

  it('ignores unsupported control message types', () => {
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    const session = { sourceId: 'remote-party-1-peer-1' }

    monitor._handleControlMessage(session, { type: 'unknown', payload: { test: true } })

    expect(commandSync.handleReceivedCommand).not.toHaveBeenCalled()
    expect(remoteControlState.applyRemoteControlSnapshot).not.toHaveBeenCalled()
  })

  it('clears host invite monitor when token is removed', () => {
    const monitor = watchHostInvite({ partyId: 'party-2', inviteToken: 'token-2' })
    const stopSpy = vi.spyOn(monitor, 'stop')

    const cleared = watchHostInvite({ partyId: 'party-2', inviteToken: null })

    expect(cleared).toBeNull()
    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(getActiveHostMonitor('party-2')).toBeNull()
  })
})

describe('kickPlayer', () => {
  it('returns false when there is no active session', async() => {
    const result = await kickPlayer('party-1')
    expect(result).toBe(false)
  })

  it('kicks the active player and regenerates the invite token', async() => {
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    const dataChannel = createDataChannel()
    const session = {
      alias: 'Remote',
      sourceId: 'remote-party-1-peer-1',
      peerId: 'peer-1',
      dataChannel,
      dispose: vi.fn(),
      connectionState: 'connected'
    }
    monitor.sessions.set('peer-1', session)
    monitor.activeSession = session

    const kickPromise = kickPlayer('party-1')
    vi.advanceTimersByTime(100)
    const kicked = await kickPromise

    expect(kicked).toBe(true)
    expect(dataChannel.send).toHaveBeenCalled()
    expect(multiplayerStore.invalidateInviteToken).toHaveBeenCalledWith('party-1')
    expect(multiplayerStore.generateInviteForParty).toHaveBeenCalledWith('party-1')
    expect(hostNotifications.showHostNotification).toHaveBeenCalledWith('New invite ready for party party-1')
    expect(commandSync.stopGameStateSync).toHaveBeenCalled()
  })

  it('does not mark a kicked player as reconnecting when the session closes', async() => {
    const monitor = watchHostInvite({ partyId: 'party-1', inviteToken: 'token-1' })
    const dataChannel = createDataChannel()
    const session = {
      alias: 'Remote',
      sourceId: 'remote-party-1-peer-1',
      peerId: 'peer-1',
      dataChannel,
      connectionState: 'connected',
      unresponsiveSince: null,
      aiFallbackHandle: null,
      dispose: vi.fn(() => {
        setTimeout(() => {
          monitor._handleSessionState(session, 'disconnected')
        }, 0)
      })
    }
    monitor.sessions.set('peer-1', session)
    monitor.activeSession = session
    monitor._markSessionUnresponsive(session, 'Connection interrupted. Waiting for reconnection...')
    expect(gameState.gamePaused).toBe(true)

    const kickPromise = kickPlayer('party-1')
    await vi.advanceTimersByTimeAsync(100)
    const kicked = await kickPromise
    await vi.advanceTimersByTimeAsync(0)

    expect(kicked).toBe(true)
    const unresponsiveCalls = multiplayerStore.setPartyUnresponsiveState.mock.calls
    expect(unresponsiveCalls.at(-1)).toEqual(['party-1', null])
    expect(unresponsiveCalls.filter((call) => typeof call[1] === 'number')).toHaveLength(1)
    expect(gameState.gamePaused).toBe(false)
  })
})
