/**
 * AI Party Synchronization Module
 * T018: Ensures AI controllers reinitialize party assignments when a remote disconnect occurs
 */

import { gameState } from '../gameState.js'
import { observeAiReactivation } from './webrtcSession.js'
import { getPartyState } from './multiplayerStore.js'

/**
 * Check if a party is controlled by AI
 * @param {string} partyId - The party identifier
 * @returns {boolean}
 */
export function isPartyAiControlled(partyId) {
  const party = getPartyState(partyId)
  return party?.aiActive === true
}

/**
 * Get all AI-controlled parties
 * @returns {Array} List of party states that are AI controlled
 */
export function getAiControlledParties() {
  if (!Array.isArray(gameState.partyStates)) {
    return []
  }
  return gameState.partyStates.filter(party => party.aiActive === true)
}

/**
 * Check if a unit belongs to an AI-controlled party
 * @param {Object} unit - The unit to check
 * @returns {boolean}
 */
export function isUnitAiControlled(unit) {
  if (!unit || !unit.owner) {
    return false
  }

  return isPartyAiControlled(unit.owner)
}

/**
 * Check if a building belongs to an AI-controlled party
 * @param {Object} building - The building to check
 * @returns {boolean}
 */
export function isBuildingAiControlled(building) {
  if (!building || !building.owner) {
    return false
  }

  return isPartyAiControlled(building.owner)
}

/**
 * Force AI to take immediate control of a party's units
 * Called when a remote player disconnects
 * @param {string} partyId - The party that needs AI control
 */
export function reinitializeAiForParty(partyId) {
  if (!partyId) {
    return
  }

  const party = getPartyState(partyId)
  if (!party || !party.aiActive) {
    return
  }

  // Clear any pending human commands for units of this party
  // Units will automatically be picked up by the AI update loop
  // since they now belong to an AI-controlled party

  if (Array.isArray(gameState.units)) {
    gameState.units.forEach(unit => {
      if (unit.owner === partyId) {
        // Clear any queued commands that might have been from the disconnected player
        if (unit.commandQueue) {
          unit.commandQueue = []
        }
        unit.currentCommand = null

        // Clear utility queues
        if (unit.utilityQueue) {
          unit.utilityQueue.mode = null
          unit.utilityQueue.targets = []
          unit.utilityQueue.currentTargetId = null
        }

        // Reset any pending attack/move targets that were player-issued
        // The AI will reassign these in its next update cycle
        if (!unit.target && !unit.path?.length) {
          // Unit is idle, AI will pick it up
        }
      }
    })
  }

  window.logger(`AI reinitialized for party ${partyId}`)
}

// Set up the observer to reinitialize AI when a disconnect event occurs
let aiReactivationCleanup = null

/**
 * Initialize the AI party sync observer
 * Should be called once when the game starts
 */
export function initAiPartySync() {
  if (aiReactivationCleanup) {
    aiReactivationCleanup()
  }

  aiReactivationCleanup = observeAiReactivation((event) => {
    const partyId = event?.detail?.partyId
    if (partyId) {
      // Immediately reinitialize AI control for the disconnected party
      reinitializeAiForParty(partyId)
    }
  })

  return aiReactivationCleanup
}

/**
 * Clean up the AI party sync observer
 */
export function cleanupAiPartySync() {
  if (aiReactivationCleanup) {
    aiReactivationCleanup()
    aiReactivationCleanup = null
  }
}
