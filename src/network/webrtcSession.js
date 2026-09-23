import { gameState } from '../gameState.js'
import { markPartyControlledByHuman, markPartyControlledByAi, invalidateInviteToken, generateInviteForParty, getPartyState, setPartyUnresponsiveState } from './multiplayerStore.js'
import { showHostNotification } from './hostNotifications.js'
import { applyRemoteControlSnapshot, releaseRemoteControlSource } from '../input/remoteControlState.js'
import { emitMultiplayerSessionChange } from './multiplayerSessionEvents.js'
import { fetchPendingSessions, postAnswer, postCandidate } from './signalling.js'
import { handleReceivedCommand, startGameStateSync, stopGameStateSync, updateNetworkStats, notifyClientConnected, initializeLockstepSession, isLockstepEnabled, disableLockstep } from './gameCommandSync.js'

const DEFAULT_POLL_INTERVAL_MS = 2000
const DEFAULT_HOST_STATUS_INTERVAL_MS = 1500
const HEARTBEAT_TIMEOUT_MS = 6000
const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]
const _AI_FALLBACK_DELAY_MS = 30000

// Event type for AI reactivation
export const AI_REACTIVATION_EVENT = 'partyAiReactivated'

const SESSION_STATES = {
  PENDING: 'pending',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed'
}

function updateGlobalSession(updates) {
  gameState.multiplayerSession = {
    ...gameState.multiplayerSession,
    ...updates
  }
  emitMultiplayerSessionChange()
}

/**
 * Emit an AI reactivation event so AI controllers can reinitialize
 * @param {string} partyId - The party that has returned to AI control
 */
function emitAiReactivation(partyId) {
  if (typeof document === 'undefined') {
    return
  }
  document.dispatchEvent(new CustomEvent(AI_REACTIVATION_EVENT, {
    detail: { partyId, timestamp: Date.now() }
  }))
}

/**
 * Subscribe to AI reactivation events
 * @param {Function} handler - Callback function receiving the event
 * @returns {Function} Cleanup function to unsubscribe
 */
export function observeAiReactivation(handler) {
  if (typeof document === 'undefined' || typeof handler !== 'function') {
    return () => {}
  }
  document.addEventListener(AI_REACTIVATION_EVENT, handler)
  return () => document.removeEventListener(AI_REACTIVATION_EVENT, handler)
}

class HostSession {
  constructor({ inviteToken, peerId, alias, partyId, rtcConfig, onStateChange, onControlMessage }) {
    this.inviteToken = inviteToken
    this.peerId = peerId
    this.alias = alias || 'Remote'
    this.partyId = partyId
    this.sourceId = `remote-${partyId}-${peerId}`
    this.connectionState = SESSION_STATES.PENDING
    this.candidateCursor = 0
    this.pendingCandidates = []
    this.answerSent = false
    this.lastResponsiveAt = Date.now()
    this.unresponsiveSince = null
    this.aiFallbackHandle = null
    this.dataChannel = null
    this.pc = new RTCPeerConnection(rtcConfig)
    this.onStateChange = onStateChange
    this.onControlMessage = onControlMessage
    this._setupPeerConnection()
  }

  async answerOffer(offerPayload) {
    if (!this.pc || this.answerSent || !offerPayload) {
      return
    }

    try {
      const offer = typeof offerPayload === 'string' ? JSON.parse(offerPayload) : offerPayload
      await this.pc.setRemoteDescription(offer)
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      await postAnswer({
        inviteToken: this.inviteToken,
        peerId: this.peerId,
        answer: JSON.stringify(answer)
      })
      this.answerSent = true
      this._flushPendingCandidates()
    } catch (err) {
      console.error('Failed to answer WebRTC offer:', err)
    }
  }

  processCandidateEntries(entries) {
    if (!Array.isArray(entries) || !this.pc) {
      return
    }
    for (let i = this.candidateCursor; i < entries.length; i += 1) {
      const entry = this._normalizeCandidateEntry(entries[i])
      this.candidateCursor = i + 1
      if (!entry || entry.origin !== 'peer') {
        continue
      }
      this._addIceCandidate(entry.candidate)
    }
  }

  sendHostStatus(payload) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return
    }
    try {
      const message = JSON.stringify(payload)
      const byteLength = message.length
      updateNetworkStats(byteLength, 0)
      this.dataChannel.send(message)
    } catch (err) {
      window.logger.warn('Failed to send host status message:', err)
    }
  }

  dispose() {
    if (this.aiFallbackHandle) {
      clearTimeout(this.aiFallbackHandle)
      this.aiFallbackHandle = null
    }
    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
  }

  _setupPeerConnection() {
    if (!this.pc) {
      return
    }

    this.pc.addEventListener('icecandidate', (event) => {
      if (!event.candidate) {
        return
      }
      postCandidate({
        inviteToken: this.inviteToken,
        peerId: this.peerId,
        candidate: JSON.stringify(event.candidate),
        origin: 'host'
      }).catch((err) => {
        window.logger.warn('Failed to post host ICE candidate:', err)
      })
    })

    this.pc.addEventListener('connectionstatechange', () => {
      if (!this.pc) {
        return
      }
      const state = this.pc.connectionState
      let normalized = SESSION_STATES.PENDING
      if (state === 'connected') {
        normalized = SESSION_STATES.CONNECTED
      } else if (state === 'disconnected') {
        normalized = SESSION_STATES.DISCONNECTED
      } else if (state === 'failed' || state === 'closed') {
        normalized = SESSION_STATES.FAILED
      }
      if (this.connectionState !== normalized) {
        this.connectionState = normalized
        this.onStateChange?.(this, normalized)
      }
    })

    this.pc.addEventListener('datachannel', (event) => {
      this._attachDataChannel(event.channel)
    })
  }

  _attachDataChannel(channel) {
    if (!channel) {
      return
    }
    this.dataChannel = channel
    this.dataChannel.addEventListener('message', (event) => {
      window.logger('[HostSession] Raw message received from client:', event.data?.substring?.(0, 200) || event.data)
      // Track bytes received
      const byteLength = typeof event.data === 'string' ? event.data.length : event.data.byteLength || 0
      updateNetworkStats(0, byteLength)

      let payload = event.data
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload)
        } catch (err) {
          window.logger.warn('[HostSession] Failed to parse message as JSON:', err)
          payload = null
        }
      }
      if (payload) {
        window.logger('[HostSession] Parsed payload type:', payload.type)
        this.onControlMessage?.(this, payload)
      }
    })
    this.dataChannel.addEventListener('close', () => {
      this.onStateChange?.(this, SESSION_STATES.DISCONNECTED)
    })
  }

  _addIceCandidate(candidate) {
    if (!candidate || !this.pc) {
      return
    }

    if (!this.answerSent) {
      this.pendingCandidates.push(candidate)
      return
    }
    this.pc.addIceCandidate(candidate).catch((err) => {
      window.logger.warn('Failed to add ICE candidate to host session:', err)
    })
  }

  _flushPendingCandidates() {
    if (!this.pendingCandidates.length || !this.pc) {
      return
    }
    this.pendingCandidates.forEach((candidate) => {
      this.pc.addIceCandidate(candidate).catch((err) => {
        window.logger.warn('Failed to add queued host ICE candidate:', err)
      })
    })
    this.pendingCandidates = []
  }

  _normalizeCandidateEntry(entry) {
    if (!entry) {
      return null
    }
    if (typeof entry === 'string') {
      try {
        return {
          candidate: JSON.parse(entry),
          origin: 'peer'
        }
      } catch {
        return null
      }
    }
    const candidatePayload = typeof entry.candidate === 'string' ? JSON.parse(entry.candidate) : entry.candidate
    return {
      candidate: candidatePayload,
      origin: entry.origin || 'peer'
    }
  }
}

class HostInviteMonitor {
  constructor({ partyId, inviteToken, rtcConfig = {}, pollInterval = DEFAULT_POLL_INTERVAL_MS }) {
    this.partyId = partyId
    this.inviteToken = inviteToken
    this.rtcConfig = {
      iceServers: rtcConfig?.iceServers || DEFAULT_ICE_SERVERS
    }
    this.pollInterval = pollInterval
    this.sessions = new Map()
    this.pollHandle = null
    this.statusHandle = null
    this.running = false
    this.activeSession = null
    this.networkPauseState = {
      forced: false,
      wasPausedBeforeForce: false,
      sessionPeerId: null
    }
  }

  start() {
    if (this.running || !this.inviteToken) {
      return
    }
    this.running = true
    this._schedulePoll()
    this._startStatusBroadcast()
  }

  stop() {
    this.running = false
    this._stopPolling()
    this._stopStatusBroadcast()
    this.sessions.forEach((session) => {
      session.dispose()
      releaseRemoteControlSource(session.sourceId)
    })
    this.sessions.clear()
    this.activeSession = null
    updateGlobalSession({ status: SESSION_STATES.DISCONNECTED, isRemote: false, alias: null })
  }

  setInviteToken(token) {
    if (this.inviteToken === token) {
      return
    }
    this.stop()
    this.inviteToken = token
    if (token) {
      this.start()
    }
  }

  _schedulePoll() {
    const tick = async() => {
      if (!this.running) {
        return
      }
      try {
        await this._pollSessions()
      } catch (err) {
        // Ensure polling continues even if there's an unexpected error
        window.logger.warn('Poll tick error:', err)
      }
      if (this.running) {
        this.pollHandle = setTimeout(tick, this.pollInterval)
      }
    }
    tick()
  }

  _stopPolling() {
    if (this.pollHandle) {
      clearTimeout(this.pollHandle)
      this.pollHandle = null
    }
  }

  async _pollSessions() {
    if (!this.inviteToken) {
      return
    }
    try {
      const entries = await fetchPendingSessions(this.inviteToken)
      entries.forEach((entry) => this._processEntry(entry))
    } catch (err) {
      window.logger.warn('Host polling failed:', err)
    }
  }

  _processEntry(entry) {
    if (!entry || !entry.peerId || !entry.offer) {
      return
    }
    let session = this.sessions.get(entry.peerId)
    if (!session) {
      session = new HostSession({
        inviteToken: this.inviteToken,
        peerId: entry.peerId,
        alias: entry.alias,
        partyId: this.partyId,
        rtcConfig: this.rtcConfig,
        onStateChange: (s, state) => this._handleSessionState(s, state),
        onControlMessage: (s, payload) => this._handleControlMessage(s, payload)
      })
      this.sessions.set(entry.peerId, session)
      session.answerOffer(entry.offer).catch((err) => {
        window.logger.warn('Failed to answer remote offer:', err)
      })
    } else if (entry.alias && entry.alias !== session.alias) {
      session.alias = entry.alias
    }
    session.processCandidateEntries(entry.candidates)
  }

  _handleSessionState(session, state) {
    if (session?.kicked) {
      session.unresponsiveSince = null
      if (session.aiFallbackHandle) {
        clearTimeout(session.aiFallbackHandle)
        session.aiFallbackHandle = null
      }
      setPartyUnresponsiveState(this.partyId, null)
      this._releaseNetworkPauseIfResolved()
      if (state === SESSION_STATES.DISCONNECTED || state === SESSION_STATES.FAILED) {
        releaseRemoteControlSource(session.sourceId)
        updateGlobalSession({ alias: null, isRemote: false, status: SESSION_STATES.DISCONNECTED })
      }
      return
    }

    if (state === SESSION_STATES.CONNECTED) {
      this.activeSession = session
      this._markSessionResponsive(session)
      setPartyUnresponsiveState(this.partyId, null)
      markPartyControlledByHuman(this.partyId, session.alias)
      showHostNotification(`${session.alias || 'Remote client'} connected to party ${this.partyId}`)
      updateGlobalSession({
        isRemote: true,
        alias: session.alias,
        inviteToken: this.inviteToken,
        status: SESSION_STATES.CONNECTED,
        connectedAt: Date.now()
      })

      // Notify that a new client connected so mapGrid will be sent in snapshots
      notifyClientConnected()

      // Initialize lockstep mode if not already enabled (host initializes when first client connects)
      if (!isLockstepEnabled()) {
        initializeLockstepSession()
        window.logger('[WebRTC] Lockstep mode initialized for multiplayer session')
      }

      // Start game state synchronization when a player connects
      startGameStateSync()
    } else if (state === SESSION_STATES.DISCONNECTED || state === SESSION_STATES.FAILED) {
      releaseRemoteControlSource(session.sourceId)
      this._markSessionUnresponsive(session, 'Connection interrupted. Waiting for reconnection...')
      updateGlobalSession({ alias: null, isRemote: false, status: SESSION_STATES.DISCONNECTED })
    }
  }

  _handleControlMessage(session, payload) {
    if (!payload) {
      return
    }

    window.logger('[Host WebRTC] Received control message:', payload.type, payload)

    if (payload.type === 'heartbeat-pong') {
      this._markSessionResponsive(session)
      return
    }

    this._markSessionResponsive(session)

    // Handle game command synchronization messages
    if (payload.type === 'game-command') {
      window.logger('[Host WebRTC] Forwarding game-command to handleReceivedCommand')
      handleReceivedCommand(payload, session.sourceId)
      return
    }

    // Handle remote control messages
    if (payload.type !== 'remote-control') {
      return
    }
    applyRemoteControlSnapshot(session.sourceId, payload)
  }

  _startStatusBroadcast() {
    this.statusHandle = setInterval(() => {
      this._checkForUnresponsiveSessions()
      const unresponsiveInfo = this._currentUnresponsiveInfo()
      const running = !gameState.gamePaused
      const payload = {
        type: 'host-status',
        running,
        paused: gameState.gamePaused,
        started: Boolean(gameState.gameStarted),
        unresponsive: unresponsiveInfo,
        timestamp: Date.now()
      }
      this.sessions.forEach((session) => {
        session.sendHostStatus(payload)
        session.sendHostStatus({ type: 'heartbeat-ping', timestamp: Date.now() })
      })
    }, DEFAULT_HOST_STATUS_INTERVAL_MS)
  }

  _stopStatusBroadcast() {
    if (this.statusHandle) {
      clearInterval(this.statusHandle)
      this.statusHandle = null
    }
  }

  _checkForUnresponsiveSessions() {
    const now = Date.now()
    this.sessions.forEach((session) => {
      if (session.connectionState !== SESSION_STATES.CONNECTED) {
        return
      }
      if (now - session.lastResponsiveAt > HEARTBEAT_TIMEOUT_MS) {
        this._markSessionUnresponsive(session, `${session.alias || 'Remote client'} is not responding. Match paused while reconnecting.`)
      }
    })
  }

  _currentUnresponsiveInfo() {
    const now = Date.now()
    const active = Array.from(this.sessions.values())
      .filter(session => session.unresponsiveSince)
      .sort((a, b) => a.unresponsiveSince - b.unresponsiveSince)[0]

    if (!active) {
      return null
    }

    return {
      active: true,
      partyId: this.partyId,
      alias: active.alias || 'Remote client',
      since: active.unresponsiveSince,
      seconds: Math.max(0, Math.floor((now - active.unresponsiveSince) / 1000))
    }
  }

  _markSessionUnresponsive(session, notificationMessage) {
    if (!session.unresponsiveSince) {
      session.unresponsiveSince = Date.now()
      setPartyUnresponsiveState(this.partyId, session.unresponsiveSince)
      showHostNotification(notificationMessage)
    }

    if (!this.networkPauseState.forced) {
      this.networkPauseState = {
        forced: true,
        wasPausedBeforeForce: Boolean(gameState.gamePaused),
        sessionPeerId: session.peerId
      }
      gameState.gamePaused = true
    }

    if (!session.aiFallbackHandle) {
      session.aiFallbackHandle = setTimeout(() => {
        if (session.unresponsiveSince) {
          this._finalizeAiTakeover(session, 'did not reconnect in time')
        }
      }, _AI_FALLBACK_DELAY_MS)
    }
  }

  _markSessionResponsive(session) {
    session.lastResponsiveAt = Date.now()
    if (!session.unresponsiveSince) {
      return
    }

    session.unresponsiveSince = null
    setPartyUnresponsiveState(this.partyId, null)
    if (session.aiFallbackHandle) {
      clearTimeout(session.aiFallbackHandle)
      session.aiFallbackHandle = null
    }

    showHostNotification(`${session.alias || 'Remote client'} reconnected. Match resumed.`)
    this._releaseNetworkPauseIfResolved()
  }

  _releaseNetworkPauseIfResolved() {
    const stillUnresponsive = Array.from(this.sessions.values()).some(session => session.unresponsiveSince)
    if (stillUnresponsive || !this.networkPauseState.forced) {
      return
    }

    const shouldResume = !this.networkPauseState.wasPausedBeforeForce
    this.networkPauseState = {
      forced: false,
      wasPausedBeforeForce: false,
      sessionPeerId: null
    }

    if (shouldResume) {
      gameState.gamePaused = false
    }
  }

  _finalizeAiTakeover(session, reason) {
    releaseRemoteControlSource(session.sourceId)
    if (this.activeSession === session) {
      this.activeSession = null
    }

    const previousAlias = session.alias || 'Remote client'
    markPartyControlledByAi(this.partyId)
    emitAiReactivation(this.partyId)
    showHostNotification(`${previousAlias} ${reason} - AI has resumed control of party ${this.partyId}`)

    session.unresponsiveSince = null
    setPartyUnresponsiveState(this.partyId, null)
    if (session.aiFallbackHandle) {
      clearTimeout(session.aiFallbackHandle)
      session.aiFallbackHandle = null
    }

    session.dispose()
    this.sessions.delete(session.peerId)
    this._releaseNetworkPauseIfResolved()

    const hasActiveSessions = Array.from(this.sessions.values()).some(
      s => s.connectionState === SESSION_STATES.CONNECTED
    )

    if (!hasActiveSessions) {
      stopGameStateSync()
      if (isLockstepEnabled()) {
        disableLockstep()
        window.logger('[WebRTC] Lockstep mode disabled - no active sessions')
      }
    }
  }
}

const inviteMonitors = new Map()

export function watchHostInvite({ partyId, inviteToken }) {
  if (!partyId) {
    return null
  }
  if (!inviteToken) {
    const existing = inviteMonitors.get(partyId)
    if (existing) {
      existing.stop()
      inviteMonitors.delete(partyId)
    }
    return null
  }

  let monitor = inviteMonitors.get(partyId)
  if (monitor) {
    monitor.setInviteToken(inviteToken)
    return monitor
  }

  monitor = new HostInviteMonitor({ partyId, inviteToken })
  inviteMonitors.set(partyId, monitor)
  monitor.start()
  return monitor
}

export function stopHostInvite(partyId) {
  const monitor = inviteMonitors.get(partyId)
  if (monitor) {
    monitor.stop()
    inviteMonitors.delete(partyId)
  }
}

/**
 * Kick a connected player from a party, returning control to AI
 * @param {string} partyId - The party to kick the player from
 * @returns {Promise<boolean>} True if a player was kicked
 */
export async function kickPlayer(partyId) {
  const monitor = inviteMonitors.get(partyId)
  if (!monitor || !monitor.activeSession) {
    return false
  }

  const session = monitor.activeSession
  const alias = session.alias || 'Remote player'

  // Send kick message to the client before disconnecting
  if (session.dataChannel && session.dataChannel.readyState === 'open') {
    try {
      const kickMessage = JSON.stringify({
        type: 'kicked',
        reason: 'You were kicked from the session by the host.',
        partyId: partyId,
        timestamp: Date.now()
      })
      session.dataChannel.send(kickMessage)
      // Small delay to ensure message is sent before disconnect
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (err) {
      window.logger.warn('Failed to send kick message:', err)
    }
  }

  // Mark the session kicked before close. Data-channel and peer-connection
  // close events are often async and would otherwise look like a drop,
  // which paints the party as reconnecting and pauses the match.
  session.kicked = true
  session.unresponsiveSince = null
  if (session.aiFallbackHandle) {
    clearTimeout(session.aiFallbackHandle)
    session.aiFallbackHandle = null
  }
  setPartyUnresponsiveState(partyId, null)

  // Dispose the session
  session.dispose()
  monitor.sessions.delete(session.peerId)
  monitor.activeSession = null
  monitor._releaseNetworkPauseIfResolved()

  // Manually trigger the state change to ensure AI takeover
  releaseRemoteControlSource(session.sourceId)
  markPartyControlledByAi(partyId)
  emitAiReactivation(partyId)

  // Invalidate old token and regenerate a new one
  invalidateInviteToken(partyId)

  showHostNotification(`${alias} was kicked from party ${partyId} - AI has resumed control`)
  updateGlobalSession({ alias: null, isRemote: false, status: SESSION_STATES.DISCONNECTED })

  // Stop game state sync if no active sessions remain
  const hasActiveSessions = Array.from(monitor.sessions.values()).some(
    s => s.connectionState === SESSION_STATES.CONNECTED
  )
  if (!hasActiveSessions) {
    stopGameStateSync()
  }

  // Generate new invite token after kick
  try {
    await generateInviteForParty(partyId)
    watchHostInvite({ partyId, inviteToken: getPartyState(partyId)?.inviteToken })
    showHostNotification(`New invite ready for party ${partyId}`)
  } catch (err) {
    window.logger.warn('Failed to generate new invite after kick:', err)
  }

  return true
}

export function getActiveHostMonitor(partyId) {
  return inviteMonitors.get(partyId) || null
}
