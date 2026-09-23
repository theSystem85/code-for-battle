import { gameState } from '../gameState.js'
import { generateRandomId } from './multiplayerStore.js'
import { emitMultiplayerSessionChange } from './multiplayerSessionEvents.js'
import { updateNetworkStats } from './gameCommandSync.js'
import {
  postOffer,
  postCandidate,
  fetchSessionStatus
} from './signalling.js'
import {
  buildJoinFailureHint,
  buildPeerConnectionConfig,
  emptyCandidateStats,
  formatIceProgress,
  isBenignIceError,
  recordCandidateStat,
  resolveIceServers,
  summarizeIceServers,
  waitForIceGathering
} from './iceConfig.js'

const DEFAULT_POLL_INTERVAL_MS = 1000
const HANDSHAKE_TIMEOUT_MS = 25000

export const RemoteConnectionStatus = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  FAILED: 'failed',
  DISCONNECTED: 'disconnected'
}

let activeRemoteConnection = null

function normalizeAlias(alias = '') {
  const trimmed = alias.trim()
  if (!trimmed) {
    throw new Error('Remote alias is required')
  }
  return trimmed
}

function updateSessionState(updates) {
  gameState.multiplayerSession = {
    ...gameState.multiplayerSession,
    ...updates
  }
  emitMultiplayerSessionChange()
}

class RemoteConnection {
  constructor({ inviteToken, alias, rtcConfig = {}, pollInterval = DEFAULT_POLL_INTERVAL_MS, onStatusChange, onDataChannelOpen, onDataChannelMessage, onDataChannelClose }) {
    if (!inviteToken) {
      throw new Error('Invite token is required for remote connection')
    }

    this.inviteToken = inviteToken
    this.alias = normalizeAlias(alias)
    this.pollInterval = pollInterval
    this.onStatusChange = typeof onStatusChange === 'function' ? onStatusChange : () => {}
    this.onDataChannelOpen = typeof onDataChannelOpen === 'function' ? onDataChannelOpen : () => {}
    this.onDataChannelMessage = typeof onDataChannelMessage === 'function' ? onDataChannelMessage : () => {}
    this.onDataChannelClose = typeof onDataChannelClose === 'function' ? onDataChannelClose : () => {}
    this._explicitIceServers = Boolean(rtcConfig?.iceServers)
    this.rtcConfig = rtcConfig?.iceServers
      ? buildPeerConnectionConfig(rtcConfig.iceServers)
      : buildPeerConnectionConfig()
    this.turnConfigured = Boolean(rtcConfig?.turnConfigured)
    this.credentialMode = rtcConfig?.credentialMode || 'none'

    this.connectionState = RemoteConnectionStatus.IDLE
    this.peerId = null
    this.pc = null
    this.dataChannel = null
    this.pollHandle = null
    this.handshakeTimer = null
    this.pollActive = false
    this.remoteCandidateIndex = 0
    this.pendingRemoteCandidates = []
    this.answerApplied = false
    this.appliedAnswerRevision = null
    this.offerRevision = 0
    this.iceRestartCount = 0
    this._restarting = false
    this.failureHint = null
    this.transportDetail = null
    this.candidateStats = emptyCandidateStats()
    this.pollErrorCount = 0
    this._onVisibility = null
  }

  async start() {
    if (this.connectionState !== RemoteConnectionStatus.IDLE) {
      return this
    }

    if (!this._explicitIceServers) {
      const ice = await resolveIceServers()
      this.turnConfigured = Boolean(ice.turnConfigured)
      this.credentialMode = ice.credentialMode || 'none'
      this.rtcConfig = buildPeerConnectionConfig(ice.iceServers)
      window.logger('[webrtc] client ice config', {
        source: ice.source,
        turnConfigured: this.turnConfigured,
        credentialMode: this.credentialMode,
        servers: summarizeIceServers(this.rtcConfig.iceServers)
      })
    }

    this.peerId = generateRandomId('peer')
    this.offerRevision = 1
    this.pc = new RTCPeerConnection(this.rtcConfig)
    this._preconfigurePeerConnection()
    this._updateStatus(RemoteConnectionStatus.CONNECTING)
    this._attachDataChannel()
    this._watchVisibility()

    await this._publishOffer()
    this._beginPolling()
    return this
  }

  async stop() {
    this._stopPolling()
    this._unwatchVisibility()
    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }
    this._updateStatus(RemoteConnectionStatus.DISCONNECTED)
    updateSessionState({ isRemote: false, inviteToken: null, alias: null, connectedAt: null })
    activeRemoteConnection = null
  }

  send(data) {
    window.logger('[RemoteConnection] send() called, dataChannel state:', this.dataChannel?.readyState)
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        const payload = typeof data === 'string' ? data : JSON.stringify(data)
        this.dataChannel.send(payload)
        // Track bytes sent for network stats
        updateNetworkStats(payload.length, 0)
        window.logger('[RemoteConnection] Data sent successfully')
      } catch (err) {
        window.logger.warn('Failed to send remote data:', err)
      }
    } else {
      window.logger.warn('[RemoteConnection] Cannot send - dataChannel not open:', this.dataChannel?.readyState)
    }
  }

  _preconfigurePeerConnection() {
    if (!this.pc) {
      return
    }

    this.pc.addEventListener('icecandidate', (event) => {
      if (!event.candidate) {
        window.logger('[webrtc] client gathering complete', {
          stats: this.candidateStats,
          turnConfigured: this.turnConfigured
        })
        return
      }
      const summary = recordCandidateStat(this.candidateStats, event.candidate)
      window.logger('[webrtc] client local candidate', {
        type: summary.type,
        protocol: summary.protocol,
        mdns: summary.mdns,
        privateOrLoopback: summary.privateOrLoopback
      })
      postCandidate({
        inviteToken: this.inviteToken,
        peerId: this.peerId,
        origin: 'peer',
        alias: this.alias,
        candidate: JSON.stringify(event.candidate)
      }).catch((err) => {
        window.logger.warn('Failed to send ICE candidate to STUN helper:', err)
      })
    })

    const onTransport = () => this._handleTransportState()
    this.pc.addEventListener('connectionstatechange', onTransport)
    this.pc.addEventListener('iceconnectionstatechange', onTransport)
  }

  _handleTransportState() {
    if (!this.pc) {
      return
    }
    const connectionState = this.pc.connectionState
    const iceConnectionState = this.pc.iceConnectionState
    this.transportDetail = formatIceProgress({
      connectionState,
      iceConnectionState,
      iceGatheringState: this.pc.iceGatheringState
    })
    window.logger('[webrtc] client transport', {
      connectionState,
      iceConnectionState,
      turnConfigured: this.turnConfigured,
      stats: this.candidateStats
    })
    if (connectionState === 'failed' || iceConnectionState === 'failed') {
      this._handleIceFailure()
      return
    }
    if (connectionState === 'connected' || iceConnectionState === 'connected' || iceConnectionState === 'completed') {
      this._updateStatus(RemoteConnectionStatus.CONNECTED)
      updateSessionState({ connectedAt: Date.now() })
      return
    }
    if (connectionState === 'disconnected' || connectionState === 'closed') {
      if (this.connectionState === RemoteConnectionStatus.CONNECTED) {
        this._updateStatus(RemoteConnectionStatus.DISCONNECTED)
      }
      this._stopPolling()
    }
    if (this.connectionState === RemoteConnectionStatus.CONNECTING) {
      this.onStatusChange(this.connectionState)
    }
  }

  _failJoin() {
    const reason = buildJoinFailureHint({
      turnConfigured: this.turnConfigured,
      stats: this.candidateStats
    })
    this.failureHint = this.transportDetail ? `${reason} (${this.transportDetail})` : reason
    window.logger('[webrtc] join failed', {
      turnConfigured: Boolean(this.turnConfigured),
      stats: this.candidateStats,
      ice: this.transportDetail,
      hint: this.failureHint
    })
    this._updateStatus(RemoteConnectionStatus.FAILED)
  }

  _handleIceFailure() {
    if (this._restarting || this.connectionState === RemoteConnectionStatus.FAILED) {
      return
    }
    const canRestart = this.iceRestartCount < 1
      && this.answerApplied
      && this.pc
      && typeof this.pc.restartIce === 'function'
    if (!canRestart) {
      this._failJoin()
      return
    }
    this._restarting = true
    this.iceRestartCount += 1
    this._restartIce().then((restarted) => {
      if (!restarted) this._failJoin()
    }).catch((err) => {
      window.logger.warn('[webrtc] ICE restart failed', err?.message || 'unknown')
      this._failJoin()
    }).finally(() => {
      this._restarting = false
    })
  }

  async _restartIce() {
    if (!this.pc || !this.answerApplied || typeof this.pc.restartIce !== 'function') {
      return false
    }
    this.offerRevision += 1
    this.answerApplied = false
    this.pc.restartIce()
    const offer = await this.pc.createOffer({ iceRestart: true })
    await this.pc.setLocalDescription(offer)
    await waitForIceGathering(this.pc)
    const local = this.pc.localDescription || offer
    await postOffer({
      inviteToken: this.inviteToken,
      alias: this.alias,
      peerId: this.peerId,
      offer: JSON.stringify(local),
      offerRevision: this.offerRevision
    })
    window.logger('[webrtc] ICE restart posted', {
      offerRevision: this.offerRevision,
      turnConfigured: Boolean(this.turnConfigured)
    })
    return true
  }

  _attachDataChannel() {
    if (!this.pc) {
      return
    }

    this.dataChannel = this.pc.createDataChannel('remote-control')
    this.dataChannel.addEventListener('open', () => {
      this._updateStatus(RemoteConnectionStatus.CONNECTED)
      updateSessionState({ connectedAt: Date.now() })
      this.onDataChannelOpen()
    })
    this.dataChannel.addEventListener('message', (event) => {
      // Track bytes received for network stats
      const dataSize = typeof event.data === 'string' ? event.data.length : (event.data?.byteLength || 0)
      updateNetworkStats(0, dataSize)
      this.onDataChannelMessage(event.data)
    })
    this.dataChannel.addEventListener('close', () => {
      this.onDataChannelClose()
    })
  }

  async _publishOffer() {
    if (!this.pc) {
      throw new Error('Peer connection unavailable when publishing offer')
    }

    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    await waitForIceGathering(this.pc)
    const local = this.pc.localDescription || offer
    await postOffer({
      inviteToken: this.inviteToken,
      alias: this.alias,
      peerId: this.peerId,
      offer: JSON.stringify(local),
      offerRevision: this.offerRevision
    })

    updateSessionState({
      isRemote: true,
      alias: this.alias,
      inviteToken: this.inviteToken,
      status: RemoteConnectionStatus.CONNECTING,
      connectedAt: null,
      localRole: 'client'
    })
  }

  _beginPolling() {
    this.pollActive = true
    const tick = async() => {
      if (!this.pollActive) {
        return
      }

      try {
        await this._synchronizeSession()
        this.pollErrorCount = 0
      } catch (err) {
        this.pollErrorCount += 1
        window.logger.warn('Remote session polling failed:', err)
        if (this.pollErrorCount >= 3) {
          this.failureHint = 'Could not reach the signalling server. Check that this device can open the invite page, then try again.'
          this._updateStatus(RemoteConnectionStatus.FAILED)
          this._stopPolling()
          return
        }
      }

      if (this.pollActive) {
        this.pollHandle = setTimeout(tick, this.pollInterval)
      }
    }

    tick()
    this.handshakeTimer = setTimeout(() => {
      if (this.connectionState === RemoteConnectionStatus.CONNECTING) {
        const reason = buildJoinFailureHint({
          turnConfigured: this.turnConfigured,
          stats: this.candidateStats
        })
        this.failureHint = this.transportDetail ? `${reason} (${this.transportDetail})` : reason
        window.logger('[webrtc] join timed out', {
          turnConfigured: Boolean(this.turnConfigured),
          stats: this.candidateStats,
          ice: this.transportDetail
        })
        this._updateStatus(RemoteConnectionStatus.FAILED)
        this._stopPolling()
      }
    }, HANDSHAKE_TIMEOUT_MS)
  }

  _stopPolling() {
    this.pollActive = false
    if (this.pollHandle) {
      clearTimeout(this.pollHandle)
      this.pollHandle = null
    }
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
  }

  _watchVisibility() {
    if (typeof document === 'undefined' || this._onVisibility) {
      return
    }
    this._onVisibility = () => {
      if (!this.pollActive) return
      if (document.visibilityState && document.visibilityState !== 'visible') return
      this._synchronizeSession().catch((err) => {
        window.logger.warn('Remote session refresh after visibility change failed:', err)
      })
    }
    document.addEventListener('visibilitychange', this._onVisibility)
    document.addEventListener('pageshow', this._onVisibility)
  }

  _unwatchVisibility() {
    if (typeof document === 'undefined' || !this._onVisibility) {
      return
    }
    document.removeEventListener('visibilitychange', this._onVisibility)
    document.removeEventListener('pageshow', this._onVisibility)
    this._onVisibility = null
  }

  async _synchronizeSession() {
    if (!this.peerId) {
      return
    }

    const payload = await fetchSessionStatus(this.inviteToken, this.peerId)

    const answerRevision = payload.answerRevision || null
    const revisionMatches = answerRevision == null || answerRevision === this.offerRevision
    const revisionIsNew = answerRevision == null
      ? !this.answerApplied
      : answerRevision !== this.appliedAnswerRevision
    if (payload.answer && revisionMatches && revisionIsNew) {
      try {
        const answer = typeof payload.answer === 'string' ? JSON.parse(payload.answer) : payload.answer
        if (answer) {
          await this.pc.setRemoteDescription(answer)
          this.answerApplied = true
          this.appliedAnswerRevision = answerRevision
          this._processPendingCandidates()
        }
      } catch (err) {
        window.logger.warn('Failed to apply remote answer:', err)
      }
    }

    const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
    for (let i = this.remoteCandidateIndex; i < candidates.length; i += 1) {
      const candidateValue = candidates[i]

      // Skip our own candidates - only process candidates from the host
      if (candidateValue.origin === 'peer') {
        this.remoteCandidateIndex += 1
        continue
      }

      // candidateValue is an object like {candidate: "...", origin: "host", timestamp: ...}
      // The actual ICE candidate is in the .candidate field as a JSON string
      let parsed
      if (typeof candidateValue === 'object' && candidateValue !== null && candidateValue.candidate) {
        parsed = typeof candidateValue.candidate === 'string'
          ? JSON.parse(candidateValue.candidate)
          : candidateValue.candidate
      } else if (typeof candidateValue === 'string') {
        parsed = JSON.parse(candidateValue)
      } else {
        parsed = candidateValue
      }
      this.remoteCandidateIndex += 1
      await this._safeAddRemoteCandidate(parsed)
    }
  }

  async _safeAddRemoteCandidate(candidate) {
    if (!candidate || !this.pc) {
      return
    }

    if (!candidate.sdpMid && candidate.sdpMLineIndex == null) {
      window.logger.warn('Skipping ICE candidate without sdpMid/mLineIndex', candidate)
      return
    }

    await this._addRemoteCandidate(candidate)
  }

  async _addRemoteCandidate(candidate) {
    if (!candidate || !this.pc) {
      return
    }

    if (!this.answerApplied) {
      this.pendingRemoteCandidates.push(candidate)
      return
    }

    try {
      await this.pc.addIceCandidate(candidate)
    } catch (err) {
      if (!isBenignIceError(err)) {
        window.logger.warn('Failed to add ICE candidate to peer connection:', err?.message || 'unknown')
      }
    }
  }

  _processPendingCandidates() {
    if (!this.pendingRemoteCandidates.length) {
      return
    }

    this.pendingRemoteCandidates.forEach((candidate) => {
      if (!candidate.sdpMid && candidate.sdpMLineIndex == null) {
        window.logger.warn('Skipping queued ICE candidate without sdpMid/mLineIndex', candidate)
        return
      }
      this.pc.addIceCandidate(candidate).catch((err) => {
        if (!isBenignIceError(err)) {
          window.logger.warn('Failed to add queued ICE candidate:', err?.message || 'unknown')
        }
      })
    })
    this.pendingRemoteCandidates = []
  }

  _updateStatus(status) {
    if (this.connectionState === status) {
      return
    }
    this.connectionState = status
    if (status === RemoteConnectionStatus.CONNECTED && this.handshakeTimer) {
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
    }
    this.onStatusChange(status)
    updateSessionState({ status })
  }
}

export function createRemoteConnection(options) {
  if (activeRemoteConnection) {
    activeRemoteConnection.stop()
  }
  activeRemoteConnection = new RemoteConnection(options)
  return activeRemoteConnection
}

export function getActiveRemoteConnection() {
  return activeRemoteConnection
}
