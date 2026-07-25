/**
 * Command Broadcasting Module
 * Handles broadcasting game commands to multiplayer peers
 */

import { gameState } from '../gameState.js'
import { getActiveRemoteConnection } from './remoteConnection.js'
import { getActiveHostMonitor } from './webrtcSession.js'
import { COMMAND_TYPES, GAME_COMMAND_MESSAGE_TYPE, createMoveCommand, createAttackCommand, createBuildingPlaceCommand, createProductionCommand } from './commandTypes.js'

/**
 * Check if current player is host
 * @returns {boolean}
 */
export function isHost() {
  return gameState.multiplayerSession?.localRole === 'host' || !gameState.multiplayerSession?.isRemote
}

/**
 * Check if a remote session is connected
 * @returns {boolean}
 */
function hasActiveRemoteSession() {
  const isRemote = Boolean(gameState.multiplayerSession?.isRemote)
  const activeConn = getActiveConnection()
  const result = isRemote || Boolean(activeConn)
  // Debug log to understand session state
  if (!result) {
    window.logger('[hasActiveRemoteSession] No active session - isRemote:', isRemote, 'activeConn:', activeConn)
  }
  return result
}

/**
 * Get the active connection (either as host or remote client)
 * @returns {Object|null}
 */
function getActiveConnection() {
  // Check for remote client connection
  const remoteConn = getActiveRemoteConnection()
  if (remoteConn && remoteConn.connectionState === 'connected') {
    return remoteConn
  }

  // For host, check if there's an active session monitor with connected peers
  // We don't return the monitor directly but indicate we should broadcast
  return null
}

/**
 * Broadcast a message to all connected peers (host only)
 * @param {Object} message - The message to broadcast
 */
export function broadcastToAllPeers(message) {
  if (!isHost()) {
    return
  }

  // Get all party invite monitors and broadcast to their active sessions
  if (!Array.isArray(gameState.partyStates)) {
    return
  }

  gameState.partyStates.forEach(party => {
    if (party.partyId === gameState.humanPlayer) {
      return // Skip self
    }

    const monitor = getActiveHostMonitor(party.partyId)
    if (monitor && monitor.activeSession) {
      monitor.activeSession.sendHostStatus(message)
    }
  })
}

/**
 * Broadcast a game command to all connected peers
 * Host broadcasts to all remote players
 * Remote players send to host for validation and re-broadcast
 *
 * @param {string} commandType - Type of command from COMMAND_TYPES
 * @param {Object} payload - Command-specific data
 * @param {string} sourcePartyId - The party that issued the command
 */
export function broadcastGameCommand(commandType, payload, sourcePartyId) {
  if (!commandType || !payload) {
    return
  }

  const command = {
    type: GAME_COMMAND_MESSAGE_TYPE,
    commandType,
    payload,
    sourcePartyId: sourcePartyId || gameState.humanPlayer,
    timestamp: Date.now(),
    isHost: isHost()
  }

  // Only log non-snapshot commands to reduce console noise
  if (commandType !== COMMAND_TYPES.GAME_STATE_SNAPSHOT) {
    window.logger('[GameCommandSync] Broadcasting command:', commandType, 'from party:', command.sourcePartyId, 'isHost:', command.isHost)
  }

  if (isHost()) {
    // Host broadcasts to all connected peers
    broadcastToAllPeers(command)
  } else {
    // Remote client sends to host
    const remoteConn = getActiveRemoteConnection()
    window.logger('[GameCommandSync] Client sending to host, connection:', remoteConn ? 'active' : 'null')
    if (remoteConn) {
      try {
        remoteConn.send(command)
        window.logger('[GameCommandSync] Command sent successfully')
      } catch (err) {
        window.logger.warn('Failed to send game command to host:', err)
      }
    } else {
      window.logger.warn('[GameCommandSync] No active remote connection to send command')
    }
  }
}

/**
 * Broadcast a unit stop command (clears attack target and movement)
 * @param {Array} units - Units to stop
 */
export function broadcastUnitStop(units) {
  if (!hasActiveRemoteSession()) {
    return
  }

  const unitIds = units.map(u => u.id).filter(Boolean)
  if (unitIds.length === 0) {
    return
  }

  const partyId = units[0]?.owner || gameState.humanPlayer
  broadcastGameCommand(
    COMMAND_TYPES.UNIT_STOP,
    { unitIds },
    partyId
  )
}

/**
 * Broadcast a unit move command
 * @param {Array} units - Units to move
 * @param {number} targetX - Target X
 * @param {number} targetY - Target Y
 */
export function broadcastUnitMove(units, targetX, targetY) {
  if (!hasActiveRemoteSession()) {
    return
  }

  const unitIds = units.map(u => u.id).filter(Boolean)
  if (unitIds.length === 0) {
    return
  }

  const partyId = units[0]?.owner || gameState.humanPlayer
  broadcastGameCommand(
    COMMAND_TYPES.UNIT_MOVE,
    createMoveCommand(unitIds, targetX, targetY),
    partyId
  )
}

/**
 * Broadcast a unit attack command
 * @param {Array} units - Attacking units
 * @param {Object} target - Target unit or building
 */
export function broadcastUnitAttack(units, target) {
  if (!hasActiveRemoteSession()) {
    return
  }

  const unitIds = units.map(u => u.id).filter(Boolean)
  if (unitIds.length === 0 || !target?.id) {
    return
  }

  const targetType = target.isBuilding ? 'building' : 'unit'
  const partyId = units[0]?.owner || gameState.humanPlayer
  const battleshipTurretSelections = Object.fromEntries(units
    .filter(unit => unit.type === 'battleship')
    .map(unit => [unit.id, unit.selectedTurret || null]))

  broadcastGameCommand(
    COMMAND_TYPES.UNIT_ATTACK,
    createAttackCommand(unitIds, target.id, targetType, battleshipTurretSelections),
    partyId
  )
}

/**
 * Broadcast a building placement command
 * @param {string} buildingType - Type of building
 * @param {number} x - Tile X
 * @param {number} y - Tile Y
 * @param {string} partyId - Owning party
 */
export function broadcastBuildingPlace(buildingType, x, y, partyId) {
  if (!hasActiveRemoteSession()) {
    return
  }

  broadcastGameCommand(
    COMMAND_TYPES.BUILDING_PLACE,
    createBuildingPlaceCommand(buildingType, x, y),
    partyId || gameState.humanPlayer
  )
}

/**
 * Broadcast building damage from client to host
 * @param {string} buildingId - ID of damaged building
 * @param {number} damage - Amount of damage dealt
 * @param {number} newHealth - New health value after damage
 */
export function broadcastBuildingDamage(buildingId, damage, newHealth) {
  if (!hasActiveRemoteSession() || isHost()) {
    return // Only clients need to report damage to host
  }

  broadcastGameCommand(
    COMMAND_TYPES.BUILDING_DAMAGE,
    { buildingId, damage, newHealth },
    gameState.humanPlayer
  )
}

/**
 * Broadcast building sell action to other players
 * @param {string} buildingId - ID of the building being sold
 * @param {number} sellValue - Money received from selling
 * @param {number} sellStartTime - Time when sell animation started
 */
export function broadcastBuildingSell(buildingId, sellValue, sellStartTime) {
  if (!hasActiveRemoteSession()) {
    return
  }

  broadcastGameCommand(
    COMMAND_TYPES.BUILDING_SELL,
    { buildingId, sellValue, sellStartTime },
    gameState.humanPlayer
  )
}

/**
 * Broadcast a production start command
 * @param {string} productionType - 'unit' or 'building'
 * @param {string} itemType - Type of item
 * @param {string} factoryId - Factory ID
 * @param {string} partyId - Owning party
 */
export function broadcastProductionStart(productionType, itemType, factoryId, partyId) {
  if (!hasActiveRemoteSession()) {
    return
  }

  broadcastGameCommand(
    COMMAND_TYPES.PRODUCTION_START,
    createProductionCommand(productionType, itemType, factoryId),
    partyId || gameState.humanPlayer
  )
}

/**
 * Broadcast a unit spawn request (client to host)
 * @param {string} unitType - Type of unit to spawn
 * @param {string} factoryId - ID of the factory to spawn from
 * @param {Object} rallyPoint - Optional rally point {x, y}
 */
export function broadcastUnitSpawn(unitType, factoryId, rallyPoint) {
  if (!hasActiveRemoteSession()) {
    return
  }

  broadcastGameCommand(
    COMMAND_TYPES.UNIT_SPAWN,
    { unitType, factoryId, rallyPoint },
    gameState.humanPlayer
  )
}

/**
 * Broadcast a game pause/resume command (host only)
 * @param {boolean} paused - Whether the game is paused
 */
export function broadcastGamePauseState(paused) {
  if (!isHost() || !hasActiveRemoteSession()) {
    return
  }

  broadcastGameCommand(
    paused ? COMMAND_TYPES.GAME_PAUSE : COMMAND_TYPES.GAME_RESUME,
    { paused },
    gameState.humanPlayer
  )
}
