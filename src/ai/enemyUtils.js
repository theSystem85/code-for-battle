import { gameState } from '../gameState.js'
import { TILE_SIZE } from '../config.js'

export function normalizePartyOwner(owner) {
  if (owner === 'player') return 'player1'
  return owner
}

export function resolvePartyOwner(subject) {
  if (typeof subject === 'string') {
    return normalizePartyOwner(subject)
  }

  if (subject && typeof subject === 'object') {
    if (typeof subject.owner === 'string') {
      return normalizePartyOwner(subject.owner)
    }
    if (typeof subject.id === 'string') {
      return normalizePartyOwner(subject.id)
    }
  }

  return null
}

export function areEnemies(player1, player2) {
  const leftOwner = resolvePartyOwner(player1)
  const rightOwner = resolvePartyOwner(player2)
  if (!leftOwner || !rightOwner) {
    return false
  }
  return leftOwner !== rightOwner
}

export function isOwnedByParty(subject, partyId) {
  const owner = resolvePartyOwner(subject)
  const normalizedPartyId = resolvePartyOwner(partyId)
  if (!owner || !normalizedPartyId) {
    return false
  }
  return owner === normalizedPartyId
}

export function getAllPartyIds(state = gameState) {
  if (Array.isArray(state?.partyStates) && state.partyStates.length > 0) {
    return [...new Set(state.partyStates.map(party => resolvePartyOwner(party?.partyId)).filter(Boolean))]
  }

  const playerCount = state?.playerCount || 2
  return ['player1', 'player2', 'player3', 'player4'].slice(0, playerCount)
}

export function getActiveAIPlayers(state = gameState) {
  if (Array.isArray(state?.partyStates) && state.partyStates.length > 0) {
    const aiPlayers = state.partyStates
      .filter(party => party?.aiActive)
      .map(party => resolvePartyOwner(party?.partyId))
      .filter(Boolean)

    if (aiPlayers.length > 0) {
      return [...new Set(aiPlayers)]
    }
  }

  const humanPlayer = resolvePartyOwner(state?.humanPlayer || 'player1')
  return getAllPartyIds(state).filter(partyId => partyId !== humanPlayer)
}

export function getEnemyPlayers(playerId, state = gameState) {
  const normalizedPlayerId = resolvePartyOwner(playerId)
  if (!normalizedPlayerId) {
    return []
  }

  return getAllPartyIds(state).filter(partyId => partyId !== normalizedPlayerId)
}

export function isEnemyTo(unit, currentPlayer) {
  return areEnemies(unit, currentPlayer)
}

export function getClosestEnemyFactory(unit, factories, aiPlayerId) {
  if (!factories || !Array.isArray(factories)) {
    window.logger.warn('getClosestEnemyFactory: factories is undefined or not an array')
    return null
  }

  let closestFactory = null
  let closestDist = Infinity

  factories.forEach(factory => {
    if (areEnemies(factory.id, aiPlayerId)) {
      const factoryCenterX = (factory.x + factory.width / 2) * TILE_SIZE
      const factoryCenterY = (factory.y + factory.height / 2) * TILE_SIZE
      const dist = Math.hypot(
        factoryCenterX - (unit.x + TILE_SIZE / 2),
        factoryCenterY - (unit.y + TILE_SIZE / 2)
      )
      if (dist < closestDist) {
        closestDist = dist
        closestFactory = factory
      }
    }
  })

  return closestFactory
}

export function isPartOfFactory(x, y, factories) {
  if (!factories) return false

  for (const factory of factories) {
    if (
      x >= factory.x &&
      x < factory.x + factory.width &&
      y >= factory.y &&
      y < factory.y + factory.height
    ) {
      return true
    }
  }
  return false
}
