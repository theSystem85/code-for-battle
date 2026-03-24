// enemy orchestrator
import { updateAIPlayer } from './ai/enemyAIPlayer.js'
import { computeLeastDangerAttackPoint } from './ai/enemyStrategies.js'
import { logPerformance } from './performanceUtils.js'
import { isHost } from './network/gameCommandSync.js'
import { AI_UPDATE_FRAME_SKIP } from './config.js'
import { updateLlmStrategicAI } from './ai/llmStrategicController.js'
import { getSimulationTime } from './game/time.js'
import { isReplayModeActive } from './replaySystem.js'
export { spawnEnemyUnit } from './ai/enemySpawner.js'

// Frame counter for AI update throttling
let aiFrameCounter = 0

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

  // Frame skip throttling - only run AI logic every N frames
  // This reduces AI CPU load while maintaining smooth gameplay
  aiFrameCounter = (aiFrameCounter + 1) % AI_UPDATE_FRAME_SKIP
  if (aiFrameCounter !== 0) {
    return // Skip this frame
  }

  const occupancyMap = gameState.occupancyMap
  const now = getSimulationTime(gameState)
  const humanPlayer = gameState.humanPlayer || 'player1'
  const playerCount = gameState.playerCount || 2
  const allPlayers = ['player1', 'player2', 'player3', 'player4'].slice(0, playerCount)

  // Filter to only players that are both non-human AND AI-controlled (not taken over via multiplayer)
  const aiPlayers = allPlayers.filter(p => p !== humanPlayer && isPartyAiControlled(p, gameState))
  const targetedOreTiles = gameState.targetedOreTiles || {}

  updateLlmStrategicAI(units, factories, bullets, mapGrid, gameState, now)

  if (!gameState.lastGlobalAttackDecision || now - gameState.lastGlobalAttackDecision > 8000) {
    const point = computeLeastDangerAttackPoint(gameState)
    if (point) {
      gameState.globalAttackPoint = point
      gameState.lastGlobalAttackDecision = now
    }
  }

  aiPlayers.forEach(aiPlayerId => {
    updateAIPlayer(aiPlayerId, units, factories, bullets, mapGrid, gameState, occupancyMap, now, targetedOreTiles)
  })
}, false)
