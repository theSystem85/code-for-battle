import { TILE_SIZE } from '../config.js'
import { applyProductionCompletionAck } from '../policies/completionReceipts.js'
import { units as automationEntities } from '../main.js'
import { applyAutomationMutation, getPolicyDocument, subscribeAutomationMutations, setAutomationAuthoringGuard } from '../policies/policyStore.js'
import { recordReplayCommand } from '../replayCommandPrimitives.js'
import { applyPerkPurchase, canPurchasePerk, getPolicyLock, hasLivingCommandCenter, ownsPerk } from '../perks/perkState.js'
import { START_PERK_BY_VARIANT } from '../perks/perkCatalog.js'
import { embarkC5Vehicle, unloadC5Cargo } from '../game/c5Cargo.js'
import { startC5Mission } from '../game/c5GalaxySystem.js'

export function isAutomationEditPerkAllowed(command) {
  if (['buildOptIn', 'unitBuildOptIn'].includes(command?.operation) && command.payload?.enabled !== false) {
    const variant = command.operation === 'buildOptIn' ? 'build' : 'unitBuild'
    return hasLivingCommandCenter(command.actorId) && ownsPerk(command.actorId, START_PERK_BY_VARIANT[variant])
  }
  if (!['enable', 'apply', 'applyBuilding'].includes(command?.operation) || command.payload?.enabled === false) return true
  const policy = getPolicyDocument(command.payload?.policyId)?.policy
  return Boolean(policy) && !getPolicyLock(command.actorId, policy)
}
/**
 * Game Command Synchronization Module - Coordinator
 *
 * This module serves as a thin coordinator layer that:
 * 1. Imports specialized functionality from modular sub-systems
 * 2. Re-exports all functions for backward compatibility
 * 3. Coordinates command handling and processing
 * 4. Maintains core state (pending commands, listeners)
 *
 * Architecture:
 * - commandTypes.js: Command type definitions and payload creators
 * - networkStats.js: Network usage tracking
 * - commandBroadcast.js: Broadcasting commands to peers
 * - stateSync.js: Game state synchronization and snapshots
 * - lockstepSync.js: Deterministic lockstep synchronization
 */

import { gameState } from '../gameState.js'

// ============ IMPORT FROM SPECIALIZED MODULES ============

// Command types and payload creators
import {
  COMMAND_TYPES,
  GAME_COMMAND_MESSAGE_TYPE,
  createMoveCommand,
  createAttackCommand,
  createBuildingPlaceCommand,
  createProductionCommand
} from './commandTypes.js'

// Network statistics tracking
import {
  getNetworkStats,
  updateNetworkStats
} from './networkStats.js'

// Command broadcasting functions
import {
  isHost,
  broadcastToAllPeers,
  broadcastGameCommand,
  broadcastUnitStop,
  broadcastUnitMove,
  broadcastUnitAttack,
  broadcastBuildingPlace,
  broadcastBuildingDamage,
  broadcastBuildingSell,
  broadcastProductionStart,
  broadcastUnitSpawn,
  broadcastGamePauseState
} from './commandBroadcast.js'

// State synchronization functions
import {
  setProductionControllerRef,
  updateUnitInterpolation,
  setClientPartyId,
  getClientPartyId,
  resetClientState,
  createGameStateSnapshot,
  applyGameStateSnapshot,
  startGameStateSync,
  stopGameStateSync,
  notifyClientConnected,
  isRemoteClient
} from './stateSync.js'

// Lockstep synchronization functions
import {
  isLockstepEnabled,
  initializeLockstepSession,
  queueLockstepInput,
  broadcastStateHash,
  processLockstepTick,
  disableLockstep,
  handleLockstepCommand
} from './lockstepSync.js'

// ============ RE-EXPORT FOR BACKWARD COMPATIBILITY ============

// Command types and constants
export {
  COMMAND_TYPES,
  GAME_COMMAND_MESSAGE_TYPE
}

// Command payload creators
export {
  createMoveCommand,
  createAttackCommand,
  createBuildingPlaceCommand,
  createProductionCommand
}

// Network statistics
export {
  getNetworkStats,
  updateNetworkStats
}

// Command broadcasting
export {
  isHost,
  broadcastToAllPeers,
  broadcastGameCommand,
  broadcastUnitStop,
  broadcastUnitMove,
  broadcastUnitAttack,
  broadcastBuildingPlace,
  broadcastBuildingDamage,
  broadcastBuildingSell,
  broadcastProductionStart,
  broadcastUnitSpawn,
  broadcastGamePauseState
}

// State synchronization
export {
  setProductionControllerRef,
  updateUnitInterpolation,
  setClientPartyId,
  getClientPartyId,
  resetClientState,
  createGameStateSnapshot,
  applyGameStateSnapshot,
  startGameStateSync,
  stopGameStateSync,
  notifyClientConnected,
  isRemoteClient
}

// Lockstep synchronization
export {
  isLockstepEnabled,
  initializeLockstepSession,
  queueLockstepInput,
  broadcastStateHash,
  processLockstepTick,
  disableLockstep,
  handleLockstepCommand
}

// ============ MODULE-LEVEL STATE ============

// Queue for commands received from remote players (processed by host)
const pendingRemoteCommands = []

// Listeners for command reception
const commandListeners = new Set()
setAutomationAuthoringGuard(() => !gameState.replayMode)
subscribeAutomationMutations(edit => {
  if (gameState.replayMode) return
  const command = { ...edit, tick: gameState.frameCount || 0, languageVersion: 1 }
  recordReplayCommand({ type: 'automation-edit', payload: command })
  if (gameState.multiplayerSession) broadcastGameCommand(COMMAND_TYPES.AUTOMATION_EDIT, command, command.actorId)
})

// ============ CORE COORDINATOR FUNCTIONS ============

/**
 * Handle received game command from remote peer
 * Main entry point for processing commands from the network
 *
 * @param {Object} command - The received command
 * @param {string} _sourceId - Source peer ID (unused)
 */
export function handleReceivedCommand(command, _sourceId) {
  if (!command || command.type !== GAME_COMMAND_MESSAGE_TYPE) {
    return
  }

  // Handle lockstep-specific commands first
  if (command.commandType && command.commandType.startsWith('lockstep-')) {
    handleLockstepCommand(command)
    return
  }

  // Validate the command comes from an authorized party
  const sourceParty = command.sourcePartyId
  if (!sourceParty) {
    window.logger.warn('Received game command without source party')
    return
  }

  if (isHost()) {
    // Host validates and processes/re-broadcasts the command
    // Only accept commands from the party that the remote player controls (aiActive === false)
    const partyState = gameState.partyStates?.find(p => p.partyId === sourceParty)

    window.logger('[Host] Received command from party:', sourceParty, 'type:', command.commandType)
    window.logger('[Host] PartyState found:', partyState ? { partyId: partyState.partyId, aiActive: partyState.aiActive, owner: partyState.owner } : 'NOT FOUND')
    window.logger('[Host] All partyStates:', gameState.partyStates?.map(p => ({ partyId: p.partyId, aiActive: p.aiActive })))

    if (!partyState) {
      window.logger.warn('Received command from unknown party:', sourceParty)
      return
    }

    // Only reject if aiActive is explicitly true (AI controlled)
    // Accept if aiActive is false or undefined (human controlled)
    if (partyState.aiActive === true) {
      window.logger.warn('Received command from AI-controlled party:', sourceParty)
      return
    }

    if (command.commandType === COMMAND_TYPES.AUTOMATION_EDIT) {
      if (command.payload?.actorId !== sourceParty || command.payload?.languageVersion !== 1) return
      if (!isAutomationEditPerkAllowed(command.payload)) return
      const result = applyAutomationMutation(command.payload, [...automationEntities, ...(gameState.buildings || [])])
      if (!result.ok) return
      recordReplayCommand({ type: 'automation-edit', payload: command.payload })
      broadcastToAllPeers({ ...command, isHost: true })
      return
    }

    if (command.commandType === COMMAND_TYPES.PERK_PURCHASE) {
      const payload = command.payload || {}
      if (payload.actorId !== sourceParty || !canPurchasePerk(sourceParty, payload.perkId).ok) return
      const result = applyPerkPurchase(sourceParty, payload.perkId, payload.expectedCost)
      if (!result.ok) return
      recordReplayCommand({ type: COMMAND_TYPES.PERK_PURCHASE, payload: { ...payload } })
      broadcastToAllPeers({ ...command, isHost: true })
      return
    }

    // Queue the command for processing
    pendingRemoteCommands.push({
      ...command,
      receivedAt: Date.now()
    })
    window.logger('[Host] Command queued for processing, queue length:', pendingRemoteCommands.length)

    // Re-broadcast to other peers so they stay in sync
    broadcastToAllPeers(command)
  } else {
    // Remote client receives commands from host - apply them
    // Commands from host are authoritative
    if (command.isHost) {
      applyCommand(command)
    }
  }

  // Notify listeners
  commandListeners.forEach(listener => {
    try {
      listener(command)
    } catch (err) {
      window.logger.warn('Command listener error:', err)
    }
  })
}

/**
 * Apply a received command to the local game state
 * Called on remote clients to sync their state with the host
 *
 * @param {Object} command - The command to apply
 */
function applyCommand(command) {
  // Commands are applied based on type
  switch (command.commandType) {
    case COMMAND_TYPES.PERK_PURCHASE:
      if (command.isHost && command.payload?.actorId === command.sourcePartyId) {
        applyPerkPurchase(command.payload.actorId, command.payload.perkId, command.payload.expectedCost)
      }
      break
    case COMMAND_TYPES.AUTOMATION_COMPLETION_ACK:
      if (command.isHost) applyProductionCompletionAck(command.payload || {})
      break
    case COMMAND_TYPES.AUTOMATION_EDIT:
      if (command.payload?.actorId === command.sourcePartyId && command.payload?.languageVersion === 1) {
        applyAutomationMutation(command.payload, [...automationEntities, ...(gameState.buildings || [])])
      }
      break
    case COMMAND_TYPES.C5_LOAD: {
      const galaxy = automationEntities.find(unit => unit.id === command.payload?.galaxyId && unit.type === 'c5Galaxy')
      const vehicle = automationEntities.find(unit => unit.id === command.payload?.unitId)
      if (galaxy?.flightState === 'grounded' && vehicle) {
        const result = embarkC5Vehicle(galaxy, vehicle, automationEntities)
        if (!result.allowed) gameState.showNotification?.(result.message)
      }
      break
    }
    case COMMAND_TYPES.C5_UNLOAD: {
      const galaxy = automationEntities.find(unit => unit.id === command.payload?.galaxyId && unit.type === 'c5Galaxy')
      if (galaxy) {
        const originX = Math.floor((galaxy.x + TILE_SIZE / 2) / TILE_SIZE)
        const originY = Math.floor((galaxy.y + TILE_SIZE / 2) / TILE_SIZE)
        const used = new Set()
        const findTile = () => {
          for (let radius = 2; radius <= 8; radius++) {
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
                const tx = originX + dx; const ty = originY + dy; const key = `${tx},${ty}`
                if (tx < 0 || ty < 0 || used.has(key) || gameState.occupancyMap?.[ty]?.[tx]) continue
                used.add(key)
                return { x: tx * TILE_SIZE, y: ty * TILE_SIZE }
              }
            }
          }
          return null
        }
        unloadC5Cargo(galaxy, automationEntities, findTile)
      }
      break
    }
    case COMMAND_TYPES.C5_AIRDROP: {
      const galaxy = automationEntities.find(unit => unit.id === command.payload?.galaxyId && unit.type === 'c5Galaxy')
      if (galaxy && command.payload?.target) startC5Mission(galaxy, command.payload.target, gameState.frameCount || 0)
      break
    }
    case COMMAND_TYPES.GAME_PAUSE:
      if (!isHost()) {
        gameState.gamePaused = true
      }
      break

    case COMMAND_TYPES.GAME_RESUME:
      if (!isHost()) {
        gameState.gamePaused = false
      }
      break

    case COMMAND_TYPES.GAME_STATE_SNAPSHOT:
      applyGameStateSnapshot(command.payload)
      break

    case COMMAND_TYPES.BUILDING_SELL:
      // Apply building sell command from remote player
      if (command.payload) {
        const { buildingId, sellStartTime } = command.payload
        const building = gameState.buildings.find(b => b.id === buildingId)
        if (building && !building.isBeingSold) {
          building.isBeingSold = true
          building.sellStartTime = sellStartTime
          // Note: Money is handled by the selling party, we just sync the visual state
        }
      }
      break

    // Other command types are handled by the existing game logic
    // through the command listeners
    default:
      break
  }
}

/**
 * Process pending remote commands (called by host in game loop)
 * Returns and clears the queue of commands to process
 *
 * @returns {Array} List of commands to process
 */
export function processPendingRemoteCommands() {
  if (!isHost() || pendingRemoteCommands.length === 0) {
    return []
  }

  const commands = [...pendingRemoteCommands]
  pendingRemoteCommands.length = 0
  return commands
}

/**
 * Subscribe to game command events
 * Allows other modules to listen for incoming commands
 *
 * @param {Function} handler - Callback function
 * @returns {Function} Unsubscribe function
 */
export function subscribeToGameCommands(handler) {
  if (typeof handler !== 'function') {
    return () => {}
  }

  commandListeners.add(handler)
  return () => commandListeners.delete(handler)
}
