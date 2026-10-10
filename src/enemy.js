// enemy orchestrator
import { updateAIPlayer } from './ai/enemyAIPlayer.js'
import { computeLeastDangerAttackPoint } from './ai/enemyStrategies.js'
import { logPerformance } from './performanceUtils.js'
import { isHost } from './network/gameCommandSync.js'
import { AI_UPDATE_FRAME_SKIP } from './config.js'
import { updateLlmStrategicAI } from './ai/llmStrategicController.js'
import { getSimulationTime, getFixedSimulationStepMs } from './game/time.js'
import { isReplayModeActive } from './replaySystem.js'
export { spawnEnemyUnit } from './ai/enemySpawner.js'

const PLAYERS = ['player1', 'player2', 'player3', 'player4']

/**
 * Check if a party is currently AI-controlled (not taken over by a human via multiplayer)
 * @param {string} partyId - The party ID to check
 * @param {Object} gameState - The game state object
 * @returns {boolean} True if the party should be controlled by AI
 */
function isPartyAiControlled(partyId, gameState) {
  // If no multiplayer party states, assume all non-human players are AI
  if (!Array.isArray(gameState.partyStates) || gameState.partyStates.length === 0) {
    return true
  }

  const partyState = gameState.partyStates.find(p => p.partyId === partyId)
  if (!partyState) {
    // Party not found in multiplayer state, assume AI control
    return true
  }

  // Return the aiActive flag - false means a human has taken over via multiplayer
  return partyState.aiActive !== false
}

export const updateEnemyAI = logPerformance(function updateEnemyAI(units, factories, bullets, mapGrid, gameState) {
  if (isReplayModeActive()) {
    return
  }

  // AI only runs on the host - clients receive state via sync
  if (!isHost()) {
    return
  }

  const occupancyMap = gameState.occupancyMap
  const now = getSimulationTime(gameState)
  // Simulation time is saved/synced. A private invocation counter or a
  // wall-clock budget would change the schedule after restore or a slow frame.
  const skip = Math.max(1, Math.floor(AI_UPDATE_FRAME_SKIP) || 1)
  const phase = Math.round(now / getFixedSimulationStepMs(gameState)) % skip
  const playerCount = gameState.playerCount || 2
  const targetedOreTiles = gameState.targetedOreTiles || {}

  if (phase === 0) {
    updateLlmStrategicAI(units, factories, bullets, mapGrid, gameState, now)

    if (!gameState.lastGlobalAttackDecision || now - gameState.lastGlobalAttackDecision > 8000) {
      let attackPointOwner = gameState.humanPlayer || 'player1'
      for (let index = 0; index < playerCount && index < PLAYERS.length; index++) {
        if (isPartyAiControlled(PLAYERS[index], gameState)) {
          attackPointOwner = PLAYERS[index]
          break
        }
      }
      const point = computeLeastDangerAttackPoint(gameState, attackPointOwner)
      if (point) {
        gameState.globalAttackPoint = point
        gameState.lastGlobalAttackDecision = now
      }
    }
  }

  // Each player retains its 20 Hz cadence at skip=3; the three enemy players
  // occupy separate ticks instead of all blocking the same frame.
  for (let index = 0; index < playerCount && index < PLAYERS.length; index++) {
    const aiPlayerId = PLAYERS[index]
    if (index % skip !== phase || !isPartyAiControlled(aiPlayerId, gameState)) continue
    updateAIPlayer(aiPlayerId, units, factories, bullets, mapGrid, gameState, occupancyMap, now, targetedOreTiles)
  }
}, false)
