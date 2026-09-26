import { gameState } from '../gameState.js'
import {
  PARTY_COLORS,
  MULTIPLAYER_PARTY_IDS,
  MAX_MULTIPLAYER_PARTIES,
  INVITE_TOKEN_TTL_MS
} from '../config.js'
import { composeInviteToken, buildInviteUrl, humanReadablePartyLabel } from './invites.js'
import {
  createMemoryInviteCodeStorage,
  issueStoredInviteCode,
  normalizeShortCode,
  releaseStoredInviteCode
} from './inviteCodes.js'
import { showHostNotification } from './hostNotifications.js'
import { STUN_HOST } from './signalling.js'
import { gameRandom } from '../utils/gameRandom.js'
import { getStoredItem } from '../storage/indexedDbStorage.js'

const inviteRecords = new Map()
const hostInviteCodes = createMemoryInviteCodeStorage()
const HOST_ALIAS_STORAGE_KEY = 'rts-player-alias'

function signallingBase() {
  return STUN_HOST === '' ? '/api' : STUN_HOST
}

function normalizePartyId(partyId) {
  return partyId === 'player' ? 'player1' : partyId
}

// Event type for party ownership changes
export const PARTY_OWNERSHIP_CHANGED_EVENT = 'partyOwnershipChanged'

/**
 * Emit a party ownership change event so UI components can update
 * @param {string} partyId - The party whose ownership changed
 * @param {string} newOwner - The new owner (alias or 'AI')
 * @param {boolean} aiActive - Whether AI is now controlling the party
 */
function emitPartyOwnershipChange(partyId, newOwner, aiActive) {
  if (typeof document === 'undefined') {
    return
  }
  document.dispatchEvent(new CustomEvent(PARTY_OWNERSHIP_CHANGED_EVENT, {
    detail: { partyId, owner: newOwner, aiActive, timestamp: Date.now() }
  }))
}

/**
 * Subscribe to party ownership change events
 * @param {Function} handler - Callback function receiving the event
 * @returns {Function} Cleanup function to unsubscribe
 */
export function observePartyOwnershipChange(handler) {
  if (typeof document === 'undefined' || typeof handler !== 'function') {
    return () => {}
  }
  document.addEventListener(PARTY_OWNERSHIP_CHANGED_EVENT, handler)
  return () => document.removeEventListener(PARTY_OWNERSHIP_CHANGED_EVENT, handler)
}

export function generateRandomId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${prefix}-${Date.now()}-${Math.floor(gameRandom() * 1e6)}`
}

function ensurePartyStates() {
  const partyCount = Math.max(2, Math.min(gameState.playerCount || 2, MAX_MULTIPLAYER_PARTIES))
  const localPartyId = normalizePartyId(gameState.humanPlayer || 'player1')
  const isRemoteClient = Boolean(gameState.multiplayerSession?.isRemote && gameState.multiplayerSession?.localRole === 'client')

  if (!Array.isArray(gameState.partyStates) || gameState.partyStates.length === 0 || gameState.partyStates.length !== partyCount) {
    gameState.partyStates = MULTIPLAYER_PARTY_IDS.slice(0, partyCount).map((partyId) => {
      const isHost = partyId === localPartyId
      return {
        partyId,
        color: PARTY_COLORS[partyId] || PARTY_COLORS.player1,
        owner: isHost ? getHostAliasLabel() : 'AI',
        inviteToken: null,
        shortCode: null,
        aiActive: !isHost,
        localAutomationEnabled: false,
        llmControlled: false,
        llmModelKey: null,
        lastConnectedAt: null,
        unresponsiveSince: null
      }
    })
  }

  const localPartyState = gameState.partyStates.find(state => normalizePartyId(state.partyId) === localPartyId)
  if (!isRemoteClient && localPartyState) {
    localPartyState.partyId = localPartyId
    localPartyState.color = localPartyState.color || PARTY_COLORS[localPartyId] || PARTY_COLORS.player1
    localPartyState.owner = getHostAliasLabel(localPartyState.owner === 'AI' ? '' : localPartyState.owner)
    localPartyState.localAutomationEnabled = localPartyState.localAutomationEnabled === true
    localPartyState.aiActive = localPartyState.localAutomationEnabled ? true : false
    if (localPartyState.aiActive !== true) {
      localPartyState.llmControlled = false
      localPartyState.llmModelKey = null
    }
    localPartyState.unresponsiveSince = null
  }

  return gameState.partyStates
}

function getHostAliasLabel(alias) {
  const normalizedAlias = typeof alias === 'string' ? alias.trim() : ''
  if (normalizedAlias) {
    return normalizedAlias
  }

  try {
    const storedAlias = getStoredItem(HOST_ALIAS_STORAGE_KEY)
    if (storedAlias && storedAlias.trim()) {
      return storedAlias.trim()
    }
  } catch (err) {
    window.logger.warn('Failed to read host alias from IndexedDB:', err)
  }

  return 'You (Host)'
}

function getInviteStatusStorage() {
  ensureMultiplayerState()
  if (!gameState.hostInviteStatus || typeof gameState.hostInviteStatus !== 'object') {
    gameState.hostInviteStatus = {}
  }
  return gameState.hostInviteStatus
}

function ensureGameInstanceId() {
  if (!gameState.gameInstanceId) {
    gameState.gameInstanceId = generateRandomId('game-instance')
  }
  return gameState.gameInstanceId
}

function ensureHostId() {
  if (!gameState.hostId) {
    gameState.hostId = generateRandomId('host')
  }
  return gameState.hostId
}

function purgeExpiredInvites() {
  const now = Date.now()
  inviteRecords.forEach((record, token) => {
    if (record.expiresAt && record.expiresAt <= now) {
      inviteRecords.delete(token)
    }
  })
}

export function ensureMultiplayerState() {
  ensureGameInstanceId()
  ensureHostId()
  ensurePartyStates()
  return gameState.partyStates
}

export function getGameInstanceId() {
  return ensureGameInstanceId()
}

export function getHostId() {
  return ensureHostId()
}

export function getPartyState(partyId) {
  ensureMultiplayerState()
  const normalizedPartyId = normalizePartyId(partyId)
  return gameState.partyStates.find((state) => state.partyId === normalizedPartyId) || null
}

export function listPartyStates() {
  return ensurePartyStates()
}

async function requestServerInvite(partyId) {
  const instanceId = ensureGameInstanceId()
  if (!instanceId || typeof fetch !== 'function') {
    return null
  }

  try {
    const response = await fetch(
      `${signallingBase()}/game-instance/${encodeURIComponent(instanceId)}/invite-regenerate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyId })
      }
    )

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`)
    }

    const payload = await response.json()
    if (!payload?.inviteToken) return null
    return payload
  } catch (err) {
    window.logger.warn('Could not sync invite token with STUN helper:', err)
    return null
  }
}

function releaseServerInviteCode(instanceId, partyId) {
  if (!instanceId || !partyId || typeof fetch !== 'function') return
  fetch(`${signallingBase()}/signalling/invite-code`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instanceId, partyId })
  }).catch(() => {})
}

async function issueHostShortCode(partyId, inviteToken) {
  const record = await issueStoredInviteCode(hostInviteCodes, {
    instanceId: gameState.gameInstanceId,
    partyId,
    inviteToken,
    ttlMs: INVITE_TOKEN_TTL_MS
  })
  return record
}

export async function generateInviteForParty(partyId) {
  ensureMultiplayerState()
  const party = getPartyState(partyId)
  if (!party) {
    throw new Error(`Unknown party: ${partyId}`)
  }

  const payload = await requestServerInvite(partyId)
  const token = payload?.inviteToken || composeInviteToken(gameState.gameInstanceId, partyId)
  const serverCode = normalizeShortCode(payload?.shortCode || '')
  const shortRecord = serverCode
    ? null
    : await issueHostShortCode(partyId, token)
  const shortCode = serverCode || shortRecord.shortCode
  const expiresAt = Number(payload?.expiresAt) || shortRecord?.expiresAt || (Date.now() + INVITE_TOKEN_TTL_MS)
  inviteRecords.set(token, {
    token,
    shortCode,
    partyId,
    gameInstanceId: gameState.gameInstanceId,
    expiresAt,
    createdAt: Date.now(),
    hostId: gameState.hostId
  })

  party.inviteToken = token
  party.shortCode = shortCode
  showHostNotification(`Invite ready for ${humanReadablePartyLabel(party.color, party.owner)}`)

  return {
    token,
    shortCode,
    url: buildInviteUrl(token),
    expiresAt
  }
}

export async function ensureInviteShortCode(partyId) {
  const party = getPartyState(partyId)
  if (!party?.inviteToken) return null
  const existing = normalizeShortCode(party.shortCode || '')
  if (existing) return existing
  const record = await issueHostShortCode(party.partyId, party.inviteToken)
  party.shortCode = record.shortCode
  const stored = inviteRecords.get(party.inviteToken)
  if (stored) stored.shortCode = record.shortCode
  return record.shortCode
}

export function regenerateInviteToken(partyId) {
  return generateInviteForParty(partyId)
}

/**
 * Invalidate an existing invite token for a party
 * @param {string} partyId - The party whose token should be invalidated
 */
export function invalidateInviteToken(partyId) {
  const party = getPartyState(partyId)
  if (!party || !party.inviteToken) {
    return
  }

  const instanceId = party.gameInstanceId || gameState.gameInstanceId
  releaseStoredInviteCode(hostInviteCodes, instanceId, party.partyId).catch(() => {})
  releaseServerInviteCode(instanceId, party.partyId)
  inviteRecords.delete(party.inviteToken)
  party.inviteToken = null
  party.shortCode = null
}

/**
 * T017: Regenerate all invite tokens for the current game instance
 * Called when a save is loaded to refresh tokens and establish new host
 * @returns {Promise<void>}
 */
export async function regenerateAllInviteTokens() {
  const parties = ensureMultiplayerState()

  // Generate a new game instance ID for the freshly loaded save
  gameState.gameInstanceId = generateRandomId('game-instance')
  gameState.hostId = generateRandomId('host')

  // Set the local session as the new host
  gameState.multiplayerSession = {
    ...gameState.multiplayerSession,
    isRemote: false,
    localRole: 'host',
    status: 'idle',
    alias: null,
    inviteToken: null,
    connectedAt: null
  }

  // Regenerate tokens for all non-host parties
  const regenerationPromises = parties
    .filter(party => party.partyId !== gameState.humanPlayer)
    .map(async(party) => {
      // Reset party to AI control initially
      party.owner = 'AI'
      party.aiActive = true
      party.lastConnectedAt = null
      party.unresponsiveSince = null
      party.inviteToken = null
      party.shortCode = null

      // Generate new invite token
      try {
        await generateInviteForParty(party.partyId)
      } catch (err) {
        window.logger.warn(`Failed to regenerate invite token for party ${party.partyId}:`, err)
      }
    })

  await Promise.all(regenerationPromises)

  showHostNotification('Multiplayer tokens regenerated - you are now the host')
}

/**
 * Check if the current session is the host
 * @returns {boolean}
 */
export function isHost() {
  return gameState.multiplayerSession?.localRole === 'host' || !gameState.multiplayerSession?.isRemote
}

export function validateInviteToken(token) {
  purgeExpiredInvites()
  return inviteRecords.get(token) || null
}

export function markPartyControlledByHuman(partyId, alias) {
  const party = getPartyState(partyId)
  if (!party) {
    return null
  }

  party.owner = alias || 'Human'
  party.aiActive = false
  party.localAutomationEnabled = false
  party.lastConnectedAt = Date.now()
  party.unresponsiveSince = null
  showHostNotification(`Party ${partyId} taken over by ${party.owner}`)

  // Emit event so UI components can update
  emitPartyOwnershipChange(partyId, party.owner, false)

  return party
}

export function updateHostPartyAlias(alias) {
  const party = getPartyState(normalizePartyId(gameState.humanPlayer))
  if (!party) {
    return null
  }

  const nextAlias = getHostAliasLabel(alias)
  if (party.owner === nextAlias) {
    return party
  }

  party.owner = nextAlias
  emitPartyOwnershipChange(party.partyId, party.owner, party.aiActive !== false)
  return party
}

export function setHostPartyAutomationMode(mode = 'manual', llmModelKey = null) {
  const party = getPartyState(normalizePartyId(gameState.humanPlayer || 'player1'))
  if (!party) {
    return null
  }

  party.owner = getHostAliasLabel(party.owner === 'AI' ? '' : party.owner)
  party.unresponsiveSince = null

  if (mode === 'manual') {
    party.aiActive = false
    party.localAutomationEnabled = false
    party.llmControlled = false
    party.llmModelKey = null
    showHostNotification('You took back direct control of your party')
  } else {
    party.aiActive = true
    party.localAutomationEnabled = true
    if (mode === 'llm' && llmModelKey) {
      party.llmControlled = true
      party.llmModelKey = llmModelKey
      showHostNotification('LLM now controls your host party')
    } else {
      party.llmControlled = false
      party.llmModelKey = null
      showHostNotification('Local AI now controls your host party')
    }
  }

  emitPartyOwnershipChange(party.partyId, party.owner, party.aiActive !== false)
  return party
}

export function markPartyControlledByAi(partyId) {
  const party = getPartyState(partyId)
  if (!party) {
    return null
  }

  party.owner = 'AI'
  party.aiActive = true
  party.localAutomationEnabled = false
  party.llmControlled = false
  party.llmModelKey = null
  party.lastConnectedAt = null
  party.unresponsiveSince = null
  showHostNotification(`Party ${partyId} returned to AI control`)

  // Emit event so UI components can update
  emitPartyOwnershipChange(partyId, 'AI', true)

  return party
}


export function setPartyUnresponsiveState(partyId, unresponsiveSince = null) {
  const party = getPartyState(partyId)
  if (!party) {
    return null
  }

  party.unresponsiveSince = unresponsiveSince || null
  emitPartyOwnershipChange(partyId, party.owner, party.aiActive !== false)
  return party
}

export function getInviteRecords() {
  purgeExpiredInvites()
  return Array.from(inviteRecords.values())
}

export function isLocalPartyAutomationLocked() {
  if (!isHost()) {
    return false
  }

  const party = getPartyState(normalizePartyId(gameState.humanPlayer || 'player1'))
  return Boolean(party?.localAutomationEnabled && party?.aiActive === true)
}

export function getHostInviteStatus(partyId) {
  const storage = getInviteStatusStorage()
  return storage[partyId] || 'idle'
}

export function setHostInviteStatus(partyId, status) {
  const storage = getInviteStatusStorage()
  storage[partyId] = status
  return storage[partyId]
}
