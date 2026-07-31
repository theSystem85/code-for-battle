/**
 * Lockstep Synchronization Module
 * Handles deterministic lockstep synchronization for multiplayer games (Spec 015)
 * Includes input buffering, hash verification, and desync recovery
 */

import { gameState } from '../gameState.js'
import { units as mainUnits } from '../main.js'
import { lockstepManager, LOCKSTEP_CONFIG, MS_PER_TICK } from './lockstepManager.js'
import { deterministicRNG, initializeSessionRNG, syncRNGForTick } from './deterministicRandom.js'
import { InputBuffer, LOCKSTEP_INPUT_TYPES, createLockstepInput } from './inputBuffer.js'
import { computeStateHash, compareHashes } from './stateHash.js'
import { broadcastGameCommand, isHost, createGameStateSnapshot, applyGameStateSnapshot, COMMAND_TYPES } from './gameCommandSync.js'
import { clearBattleshipFireControl } from '../game/battleshipTurrets.js'
import { cancelTransportOperations } from '../game/transportOperationCancellation.js'

// Lockstep state management
const localInputBuffer = new InputBuffer()
const pendingHashes = new Map() // tick -> { localHash, peerHashes: Map<peerId, hash> }

/**
 * Check if lockstep synchronization is enabled
 * @returns {boolean} True if lockstep is enabled
 */
export function isLockstepEnabled() {
  return gameState.lockstep?.enabled === true
}

/**
 * Initialize lockstep session (host only)
 * Generates a shared seed and broadcasts it to all peers
 * @returns {number} The session seed
 */
export function initializeLockstepSession() {
  if (!isHost()) {
    window.logger.warn('[Lockstep] Only host can initialize lockstep session')
    return null
  }

  // Generate a random seed for this session (use Math.random for true randomness)
  const sessionSeed = Math.floor(Math.random() * 2147483647) + 1

  // Initialize local lockstep state
  gameState.lockstep.enabled = true
  gameState.lockstep.sessionSeed = sessionSeed
  gameState.lockstep.currentTick = 0
  gameState.lockstep.desyncDetected = false
  gameState.lockstep.desyncTick = null
  gameState.lockstep.pendingResync = false
  gameState.lockstep.tickAccumulator = 0
  gameState.lockstep.lastTickTime = performance.now()

  // Initialize the deterministic RNG
  initializeSessionRNG(sessionSeed)

  // Initialize the lockstep manager
  lockstepManager.initialize(sessionSeed, true)

  // Broadcast init message to all peers
  broadcastGameCommand(
    COMMAND_TYPES.LOCKSTEP_INIT,
    {
      sessionSeed,
      tickRate: LOCKSTEP_CONFIG.TICK_RATE,
      inputDelay: LOCKSTEP_CONFIG.INPUT_DELAY_TICKS,
      hashInterval: LOCKSTEP_CONFIG.HASH_INTERVAL_TICKS
    },
    gameState.humanPlayer
  )

  window.logger('[Lockstep] Session initialized with seed:', sessionSeed)
  return sessionSeed
}

/**
 * Handle lockstep initialization from host (client only)
 * @param {Object} payload - Init payload from host
 */
function handleLockstepInit(payload) {
  if (isHost()) return

  const { sessionSeed, tickRate, inputDelay, hashInterval } = payload

  // Initialize local lockstep state
  gameState.lockstep.enabled = true
  gameState.lockstep.sessionSeed = sessionSeed
  gameState.lockstep.currentTick = 0
  gameState.lockstep.inputDelay = inputDelay || LOCKSTEP_CONFIG.INPUT_DELAY_TICKS
  gameState.lockstep.hashInterval = hashInterval || LOCKSTEP_CONFIG.HASH_INTERVAL_TICKS
  gameState.lockstep.desyncDetected = false
  gameState.lockstep.pendingResync = false
  gameState.lockstep.tickAccumulator = 0
  gameState.lockstep.lastTickTime = performance.now()

  // Initialize the deterministic RNG with the shared seed
  initializeSessionRNG(sessionSeed)

  // Initialize the lockstep manager
  lockstepManager.initialize(sessionSeed, false)

  window.logger('[Lockstep] Client initialized with seed:', sessionSeed, 'tickRate:', tickRate)
}

/**
 * Queue a lockstep input for the specified tick
 * @param {string} inputType - Type from LOCKSTEP_INPUT_TYPES
 * @param {Object} data - Input data
 * @returns {Object} The created input command
 */
export function queueLockstepInput(inputType, data) {
  if (!isLockstepEnabled()) {
    window.logger.warn('[Lockstep] Cannot queue input - lockstep not enabled')
    return null
  }

  // Calculate the target tick (current tick + input delay)
  const targetTick = gameState.lockstep.currentTick + gameState.lockstep.inputDelay

  // Create the input command
  const input = createLockstepInput(inputType, data, targetTick, gameState.humanPlayer)

  // Add to local buffer
  localInputBuffer.addInput(targetTick, input)

  // Broadcast to all peers
  broadcastGameCommand(
    COMMAND_TYPES.LOCKSTEP_INPUT,
    input,
    gameState.humanPlayer
  )

  return input
}

/**
 * Handle received lockstep input from a peer
 * @param {Object} command - The received command
 */
function handleLockstepInput(command) {
  if (!isLockstepEnabled()) return

  const input = command.payload
  if (!input || !input.tick) return

  // Add to the lockstep manager's input queue
  lockstepManager.receiveInput(input)

  // If host, acknowledge receipt
  if (isHost()) {
    broadcastGameCommand(
      COMMAND_TYPES.LOCKSTEP_INPUT_ACK,
      { tick: input.tick, inputId: input.id, peerId: command.sourcePartyId },
      gameState.humanPlayer
    )
  }
}

/**
 * Handle lockstep input acknowledgement
 * @param {Object} payload - Ack payload
 */
function handleLockstepInputAck(payload) {
  if (!isLockstepEnabled()) return

  const { tick } = payload
  localInputBuffer.confirmTick(tick)
}

/**
 * Broadcast state hash for verification (called at hash interval)
 * @param {number} tick - The tick this hash is for
 */
export function broadcastStateHash(tick) {
  if (!isLockstepEnabled()) return

  const hash = computeStateHash(gameState, mainUnits)

  // Store locally for comparison
  if (!pendingHashes.has(tick)) {
    pendingHashes.set(tick, { localHash: hash, peerHashes: new Map() })
  } else {
    pendingHashes.get(tick).localHash = hash
  }

  // Broadcast to peers
  broadcastGameCommand(
    COMMAND_TYPES.LOCKSTEP_HASH,
    { tick, hash },
    gameState.humanPlayer
  )

  // Clean up old pending hashes (keep last 10)
  if (pendingHashes.size > 10) {
    const oldestTick = Math.min(...pendingHashes.keys())
    pendingHashes.delete(oldestTick)
  }
}

/**
 * Handle received state hash from a peer
 * @param {Object} command - The received command
 */
function handleLockstepHash(command) {
  if (!isLockstepEnabled()) return

  const { tick, hash } = command.payload
  const peerId = command.sourcePartyId

  // Store peer hash
  if (!pendingHashes.has(tick)) {
    pendingHashes.set(tick, { localHash: null, peerHashes: new Map() })
  }
  pendingHashes.get(tick).peerHashes.set(peerId, hash)

  // Check for mismatch if we have our local hash
  const tickData = pendingHashes.get(tick)
  if (tickData.localHash && tickData.peerHashes.size > 0) {
    verifyHashes(tick, tickData)
  }
}

/**
 * Verify hashes match for a given tick
 * @param {number} tick - The tick to verify
 * @param {Object} tickData - The hash data for this tick
 */
function verifyHashes(tick, tickData) {
  const { localHash, peerHashes } = tickData

  for (const [peerId, peerHash] of peerHashes) {
    if (!compareHashes(localHash, peerHash)) {
      window.logger.warn(`[Lockstep] DESYNC DETECTED at tick ${tick}! Local: ${localHash}, Peer ${peerId}: ${peerHash}`)

      // Mark desync
      gameState.lockstep.desyncDetected = true
      gameState.lockstep.desyncTick = tick

      // If host, initiate resync
      if (isHost()) {
        initiateResync(tick)
      } else {
        // Client waits for resync from host
        gameState.lockstep.pendingResync = true
      }

      // Broadcast mismatch notification
      broadcastGameCommand(
        COMMAND_TYPES.LOCKSTEP_HASH_MISMATCH,
        { tick, localHash, peerId, peerHash },
        gameState.humanPlayer
      )

      return
    }
  }

  window.logger(`[Lockstep] Hashes verified for tick ${tick}`)
}

/**
 * Initiate resync after desync detection (host only)
 * @param {number} desyncTick - The tick where desync was detected
 */
function initiateResync(desyncTick) {
  if (!isHost()) return

  window.logger('[Lockstep] Initiating resync from tick:', desyncTick)

  // Create a full state snapshot for resync
  const snapshot = createGameStateSnapshot()

  // Broadcast resync message
  broadcastGameCommand(
    COMMAND_TYPES.LOCKSTEP_RESYNC,
    {
      tick: gameState.lockstep.currentTick,
      snapshot,
      desyncTick
    },
    gameState.humanPlayer
  )

  // Clear desync state
  gameState.lockstep.desyncDetected = false
  gameState.lockstep.desyncTick = null
}

/**
 * Handle resync message from host (client only)
 * @param {Object} payload - Resync payload
 */
function handleLockstepResync(payload) {
  if (isHost()) return

  const { tick, snapshot, desyncTick } = payload

  window.logger('[Lockstep] Applying resync from host, tick:', tick, 'desync was at:', desyncTick)

  // Apply the snapshot
  applyGameStateSnapshot(snapshot)

  // Update lockstep state
  gameState.lockstep.currentTick = tick
  gameState.lockstep.desyncDetected = false
  gameState.lockstep.desyncTick = null
  gameState.lockstep.pendingResync = false

  // Re-sync the RNG to the current tick
  deterministicRNG.syncToTick(tick)

  window.logger('[Lockstep] Resync complete, now at tick:', tick)
}

/**
 * Process a single lockstep tick
 * Called by the game loop when it's time to advance the simulation
 * @param {Function} updateFn - The game update function to call
 */
export function processLockstepTick(updateFn) {
  if (!isLockstepEnabled()) return false

  const tick = gameState.lockstep.currentTick

  // Get all inputs for this tick
  const inputs = lockstepManager.getInputsForTick(tick)

  // Sync RNG to this tick for determinism
  syncRNGForTick(tick)

  // Apply inputs (these modify gameState before the update)
  applyLockstepInputs(inputs)

  // Run the game update
  if (typeof updateFn === 'function') {
    updateFn(MS_PER_TICK)
  }

  // Broadcast hash at intervals
  if (tick % gameState.lockstep.hashInterval === 0) {
    broadcastStateHash(tick)
  }

  // Advance tick counter
  gameState.lockstep.currentTick++
  lockstepManager.advanceTick()

  return true
}

/**
 * Apply lockstep inputs to the game state
 * @param {Array} inputs - Array of input commands to apply
 */
function applyLockstepInputs(inputs) {
  if (!inputs || inputs.length === 0) return

  for (const input of inputs) {
    switch (input.type) {
      case LOCKSTEP_INPUT_TYPES.UNIT_MOVE:
        // Apply move command - find units and set their move targets
        applyMoveInput(input)
        break

      case LOCKSTEP_INPUT_TYPES.UNIT_ATTACK:
        // Apply attack command
        applyAttackInput(input)
        break

      case LOCKSTEP_INPUT_TYPES.UNIT_STOP:
        // Apply stop command
        applyStopInput(input)
        break

      case LOCKSTEP_INPUT_TYPES.BUILD_PLACE:
        // Apply building placement
        applyBuildInput(input)
        break

      case LOCKSTEP_INPUT_TYPES.PRODUCTION_START:
        // Apply production start
        applyProductionInput(input)
        break

      default:
        window.logger.warn('[Lockstep] Unknown input type:', input.type)
    }
  }
}

/**
 * Apply a move input command
 * @param {Object} input - The move input
 */
function applyMoveInput(input) {
  const { unitIds, targetX, targetY } = input.data
  if (!unitIds || !Array.isArray(unitIds)) return

  for (const unitId of unitIds) {
    const unit = mainUnits.find(u => u.id === unitId)
    if (unit) {
      unit.moveTarget = { x: targetX, y: targetY }
      unit.attackTarget = null
      unit.path = null
      unit.pathIndex = 0
    }
  }
}

/**
 * Apply an attack input command
 * @param {Object} input - The attack input
 */
function applyAttackInput(input) {
  const { unitIds, targetId, targetType } = input.data
  if (!unitIds || !Array.isArray(unitIds)) return

  // Find the target
  let target = null
  if (targetType === 'unit') {
    target = mainUnits.find(u => u.id === targetId)
  } else if (targetType === 'building') {
    target = gameState.buildings.find(b => b.id === targetId)
  }

  if (!target) return

  for (const unitId of unitIds) {
    const unit = mainUnits.find(u => u.id === unitId)
    if (unit) {
      unit.attackTarget = target
      unit.moveTarget = null
    }
  }
}

/**
 * Apply a stop input command
 * @param {Object} input - The stop input
 */
function applyStopInput(input) {
  const { unitIds } = input.data
  if (!unitIds || !Array.isArray(unitIds)) return

  const stoppedUnits = unitIds.map(unitId => mainUnits.find(unit => unit.id === unitId)).filter(Boolean)
  cancelTransportOperations(stoppedUnits, mainUnits, gameState.occupancyMap)

  for (const unitId of unitIds) {
    const unit = mainUnits.find(u => u.id === unitId)
    if (unit) {
      clearBattleshipFireControl(unit)
      unit.moveTarget = null
      unit.attackTarget = null
      unit.path = null
      unit.pathIndex = 0
      unit.vx = 0
      unit.vy = 0
    }
  }
}

/**
 * Apply a build input command
 * @param {Object} input - The build input
 */
function applyBuildInput(input) {
  const { buildingType, x, y, owner } = input.data

  // This would call the building placement logic
  // For now, queue it for the regular building system
  window.logger('[Lockstep] Build input:', buildingType, 'at', x, y, 'for', owner)
}

/**
 * Apply a production input command
 * @param {Object} input - The production input
 */
function applyProductionInput(input) {
  const { productionType, itemType, factoryId } = input.data

  // This would call the production system
  window.logger('[Lockstep] Production input:', productionType, itemType, 'from', factoryId)
}

/**
 * Disable lockstep mode and return to snapshot sync
 */
export function disableLockstep() {
  if (!gameState.lockstep) return

  gameState.lockstep.enabled = false
  deterministicRNG.disable()
  lockstepManager.reset()
  localInputBuffer.clear()
  pendingHashes.clear()

  window.logger('[Lockstep] Disabled, returning to snapshot sync')
}

/**
 * Extended command handler for lockstep messages
 * Should be called from handleReceivedCommand for lockstep-specific commands
 * @param {Object} command - The received command
 * @returns {boolean} True if handled, false otherwise
 */
export function handleLockstepCommand(command) {
  switch (command.commandType) {
    case COMMAND_TYPES.LOCKSTEP_INIT:
      handleLockstepInit(command.payload)
      return true

    case COMMAND_TYPES.LOCKSTEP_INPUT:
      handleLockstepInput(command)
      return true

    case COMMAND_TYPES.LOCKSTEP_INPUT_ACK:
      handleLockstepInputAck(command.payload)
      return true

    case COMMAND_TYPES.LOCKSTEP_HASH:
      handleLockstepHash(command)
      return true

    case COMMAND_TYPES.LOCKSTEP_HASH_MISMATCH:
      window.logger.warn('[Lockstep] Hash mismatch notification received:', command.payload)
      return true

    case COMMAND_TYPES.LOCKSTEP_RESYNC:
      handleLockstepResync(command.payload)
      return true

    default:
      return false
  }
}
