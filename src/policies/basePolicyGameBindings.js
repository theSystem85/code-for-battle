// Connects the base policy engine to the running game.
// Kept apart from basePolicyEngine.js so the engine and its tests never import
// the production queue, the sidebar or fog-of-war modules.
//
// Construction goes through the same pieces a player uses: the sidebar build
// button (tech unlock), a blueprint, and productionQueue.addItem. The engine
// still pays for the building while it is produced and still refuses to place
// it where canPlaceBuilding says no.

import { gameState } from '../gameState.js'
import { buildingData, canPlaceBuilding } from '../buildings.js'
import { findBuildingPosition } from '../ai/enemyBuilding.js'
import { mapBlueprintsToFootprints } from '../planning/blueprintPlanning.js'
import { productionQueue } from '../productionQueue.js'
import { isPositionVisibleToPlayer } from '../game/shadowOfWar.js'
import { isLocalPartyAutomationLocked } from '../network/multiplayerStore.js'
import { isReplayInteractionLocked, isReplayModeActive } from '../replaySystem.js'
import { showNotification } from '../ui/notifications.js'

function partyState(owner) {
  const parties = gameState.partyStates
  if (!Array.isArray(parties)) return null
  for (let i = 0; i < parties.length; i++) {
    if (parties[i].partyId === owner) return parties[i]
  }
  return null
}

function getMoney(owner) {
  if (owner !== gameState.humanPlayer) {
    const party = partyState(owner)
    return party && Number.isFinite(party.money) ? party.money : undefined
  }
  return Number(gameState.money) || 0
}

function getPower(owner) {
  return owner === gameState.humanPlayer ? gameState.playerPowerSupply || 0 : undefined
}

function getMoneyEarned(owner) {
  return owner === gameState.humanPlayer && typeof gameState.totalMoneyEarned === 'number' ? gameState.totalMoneyEarned : undefined
}

function findButton(type) {
  if (typeof document === 'undefined') return null
  return document.querySelector(`.production-button[data-building-type="${type}"]`)
}

function createBuildAdapter(context) {
  return {
    lockReason() {
      if (gameState.gamePaused) return 'the game is paused'
      if (isReplayModeActive() || isReplayInteractionLocked()) return 'a replay is running'
      if (isLocalPartyAutomationLocked()) return 'an AI controls this party'
      return null
    },
    hasConstructionYard(owner) {
      const buildings = context.buildings || []
      for (let i = 0; i < buildings.length; i++) {
        const building = buildings[i]
        if (building && building.type === 'constructionYard' && building.owner === owner && building.health > 0) return true
      }
      return false
    },
    isAvailable(type) {
      const button = findButton(type)
      return Boolean(button) && !button.classList.contains('disabled')
    },
    isQueueBusy() {
      return Boolean(
        productionQueue.currentBuilding ||
        productionQueue.buildingItems.length > 0 ||
        productionQueue.completedBuildings.length > 0 ||
        gameState.buildingPlacementMode
      )
    },
    getCost(type) {
      const data = buildingData[type]
      return data && typeof data.cost === 'number' ? data.cost : null
    },
    findPlacement(type, owner) {
      const planning = mapBlueprintsToFootprints(gameState.blueprints || [], owner)
      const all = [...(context.buildings || []), ...planning]
      // Reject candidates with the player validator during the search, rather
      // than giving up when the AI's first choice fails player placement rules.
      return findBuildingPosition(type, context.mapGrid, context.units || [], all, context.factories || [], owner,
        (x, y) => canPlaceBuilding(type, x, y, context.mapGrid, context.units || [], all, context.factories || [], owner))
    },
    queue(type, placement) {
      const button = findButton(type)
      if (!button) return false
      const blueprint = { type, x: placement.x, y: placement.y }
      if (!Array.isArray(gameState.blueprints)) gameState.blueprints = []
      gameState.blueprints.push(blueprint)
      productionQueue.addItem(type, button, true, blueprint)
      const queued = productionQueue.buildingItems.some(item => item.blueprint === blueprint)
      if (!queued) {
        gameState.blueprints = gameState.blueprints.filter(item => item !== blueprint)
        return false
      }
      showNotification(`Base automation queued: ${buildingData[type].displayName}`)
      return true
    }
  }
}

/** Install the game helpers on the shared base policy context (once). */
export function installBasePolicyGameBindings(context) {
  context.getMoney = getMoney
  context.getPower = getPower
  context.getMoneyEarned = getMoneyEarned
  context.isPositionVisible = (owner, px, py) => isPositionVisibleToPlayer(gameState, context.mapGrid, px, py)
  context.build = createBuildAdapter(context)
  return context
}
