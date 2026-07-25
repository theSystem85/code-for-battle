/**
 * Command Types and Payload Creators
 * Defines all command types and factory functions for creating command payloads
 */

// Command types for synchronization
export const COMMAND_TYPES = {
  UNIT_MOVE: 'unit-move',
  UNIT_ATTACK: 'unit-attack',
  UNIT_STOP: 'unit-stop',
  UNIT_GUARD: 'unit-guard',
  BUILDING_PLACE: 'building-place',
  BUILDING_SELL: 'building-sell',
  BUILDING_DAMAGE: 'building-damage',
  PRODUCTION_START: 'production-start',
  PRODUCTION_CANCEL: 'production-cancel',
  UNIT_SPAWN: 'unit-spawn',  // Client requests host to spawn a unit
  GAME_PAUSE: 'game-pause',
  GAME_RESUME: 'game-resume',
  GAME_STATE_SNAPSHOT: 'game-state-snapshot',
  GAME_STATE_DELTA: 'game-state-delta',  // Delta updates for efficiency (future use)
  CLIENT_STATE_UPDATE: 'client-state-update',
  // Lockstep deterministic sync (spec 015)
  LOCKSTEP_INPUT: 'lockstep-input',        // Input command for a specific tick
  LOCKSTEP_INPUT_ACK: 'lockstep-input-ack', // Acknowledgement of received input
  LOCKSTEP_HASH: 'lockstep-hash',          // State hash for verification
  LOCKSTEP_HASH_MISMATCH: 'lockstep-hash-mismatch', // Desync detected
  LOCKSTEP_RESYNC: 'lockstep-resync',      // Full state for resync after desync
  LOCKSTEP_INIT: 'lockstep-init'           // Initialize lockstep session with seed
}

// Message type constant
export const GAME_COMMAND_MESSAGE_TYPE = 'game-command'

/**
 * Create a unit move command payload
 * @param {Array|string} unitIds - IDs of units to move
 * @param {number} targetX - Target X position
 * @param {number} targetY - Target Y position
 * @returns {Object}
 */
export function createMoveCommand(unitIds, targetX, targetY) {
  return {
    unitIds: Array.isArray(unitIds) ? unitIds : [unitIds],
    targetX,
    targetY
  }
}

/**
 * Create a unit attack command payload
 * @param {Array|string} unitIds - IDs of attacking units
 * @param {string} targetId - ID of the target
 * @param {string} targetType - 'unit' or 'building'
 * @returns {Object}
 */
export function createAttackCommand(unitIds, targetId, targetType, battleshipTurretSelections = {}) {
  const payload = {
    unitIds: Array.isArray(unitIds) ? unitIds : [unitIds],
    targetId,
    targetType
  }
  if (Object.keys(battleshipTurretSelections).length > 0) {
    payload.battleshipTurretSelections = battleshipTurretSelections
  }
  return payload
}

/**
 * Create a building placement command payload
 * @param {string} buildingType - Type of building
 * @param {number} x - Tile X position
 * @param {number} y - Tile Y position
 * @returns {Object}
 */
export function createBuildingPlaceCommand(buildingType, x, y) {
  return {
    buildingType,
    x,
    y
  }
}

/**
 * Create a production command payload
 * @param {string} productionType - 'unit' or 'building'
 * @param {string} itemType - Type of item to produce
 * @param {string} factoryId - ID of the producing factory
 * @returns {Object}
 */
export function createProductionCommand(productionType, itemType, factoryId) {
  return {
    productionType,
    itemType,
    factoryId
  }
}
