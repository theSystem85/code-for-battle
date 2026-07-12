import { gameState } from './gameState.js'
import { getStoredItem, setStoredItem } from './storage/indexedDbStorage.js'

function readHistoryFromStorage() {
  try {
    const savedHistory = getStoredItem('playerBuildHistory')
    const parsedHistory = savedHistory ? JSON.parse(savedHistory) : []
    return Array.isArray(parsedHistory) ? parsedHistory : []
  } catch (error) {
    window.logger.warn('Failed to parse playerBuildHistory from storage:', error)
    return []
  }
}

export function ensurePlayerBuildHistoryLoaded() {
  if (!Array.isArray(gameState.playerBuildHistory)) {
    gameState.playerBuildHistory = readHistoryFromStorage()
  }

  if (!Array.isArray(gameState.playerBuildHistory)) {
    gameState.playerBuildHistory = []
  }

  return gameState.playerBuildHistory
}

function ensureSessionId() {
  if (!gameState.currentSessionId) {
    gameState.currentSessionId = Date.now().toString()
  }
  return gameState.currentSessionId
}

export function savePlayerBuildPatterns(buildingType) {
  try {
    const history = ensurePlayerBuildHistoryLoaded()
    const sessionId = ensureSessionId()

    let currentSession = history.find(session => session.id === sessionId)

    if (!currentSession) {
      currentSession = {
        id: sessionId,
        buildings: []
      }
      history.push(currentSession)
    }

    currentSession.buildings.push(buildingType)

    if (history.length > 20) {
      gameState.playerBuildHistory = history.slice(-20)
    }

    setStoredItem('playerBuildHistory', JSON.stringify(gameState.playerBuildHistory))
  } catch (error) {
    console.error('Error saving player build patterns:', error)
  }
}
