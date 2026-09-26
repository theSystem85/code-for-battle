import { gameState } from '../../gameState.js'
import { productionQueue } from '../../productionQueue.js'
import { showNotification } from '../notifications.js'
import { buildingData } from '../../data/buildingData.js'
import { canPlaceBuilding } from '../../buildings.js'
import { mapBlueprintsToFootprints } from '../../planning/blueprintPlanning.js'
import { resolvePlanPointerUp } from './radialBlueprintGesture.js'

export function selectProductionRadialItem(item, factory) {
  if (!item) return false
  const button = item.button
  if (!button) return false
  if (button.classList.contains('disabled') || item.disabled) {
    const message = item.kind === 'building'
      ? `Cannot construct building: ${button.title || item.title || 'Prerequisite missing.'}`
      : 'Cannot produce unit: Required building missing.'
    showNotification(message)
    return false
  }
  if (gameState.gamePaused) {
    showNotification('Cannot build while game is paused. Press Start to begin.')
    return false
  }

  if (item.kind === 'building') {
    return enterRadialBuildingPlan(item)
  }

  productionQueue.addItem(item.type, button, false, null, null, {
    factoryId: factory && factory.id != null ? factory.id : null
  })
  return true
}

export function enterRadialBuildingPlan(item) {
  if (!item || item.kind !== 'building') return false
  const button = item.button
  if (!button) return false
  if (button.classList.contains('disabled') || item.disabled) {
    showNotification(`Cannot construct building: ${button.title || item.title || 'Prerequisite missing.'}`)
    return false
  }
  if (gameState.gamePaused) {
    showNotification('Cannot build while game is paused. Press Start to begin.')
    return false
  }

  const ready = Boolean(item.ready || button.classList.contains('ready-for-placement'))
  const plan = { type: item.type, button, ready, kind: 'building' }
  gameState.buildingPlacementMode = true
  gameState.currentBuildingType = item.type
  gameState.radialBuildingPlan = plan

  if (ready) {
    const started = Boolean(productionQueue.enableBuildingPlacementMode(item.type, button))
    if (!started) {
      gameState.buildingPlacementMode = false
      gameState.currentBuildingType = null
      gameState.radialBuildingPlan = null
      return false
    }
    return true
  }

  const name = buildingData[item.type]?.displayName || item.label || item.type
  showNotification(`Drag on the map to place your ${name}`)
  return true
}

export function canRadialPlace(plan, tileX, tileY) {
  if (!plan) return false
  const planningBuildings = mapBlueprintsToFootprints(gameState.blueprints || [], gameState.humanPlayer)
  return canPlaceBuilding(
    plan.type,
    tileX,
    tileY,
    gameState.mapGrid,
    gameState.units || [],
    [...(gameState.buildings || []), ...planningBuildings],
    gameState.factories || [],
    gameState.humanPlayer
  )
}

export function cancelRadialBuildingPlan() {
  const plan = gameState.radialBuildingPlan
  gameState.radialBuildingPlan = null
  if (plan?.ready) {
    productionQueue.exitBuildingPlacementMode()
    return true
  }
  if (gameState.buildingPlacementMode || gameState.currentBuildingType) {
    gameState.buildingPlacementMode = false
    gameState.currentBuildingType = null
    showNotification('Placement canceled')
  }
  return Boolean(plan)
}

export function finishRadialBlueprintDrag(plan, { overUi, canPlace, tileX, tileY }) {
  const decision = resolvePlanPointerUp({ overUi, canPlace })
  if (decision === 'cancel') {
    cancelRadialBuildingPlan()
    return decision
  }
  if (decision === 'invalid') {
    showNotification('Invalid blueprint location')
    return decision
  }
  if (plan.ready) return 'place-ready'

  const blueprint = { type: plan.type, x: tileX, y: tileY }
  if (!Array.isArray(gameState.blueprints)) gameState.blueprints = []
  gameState.blueprints.push(blueprint)
  productionQueue.addItem(plan.type, plan.button, true, blueprint)
  const name = buildingData[plan.type]?.displayName || plan.type
  showNotification(`Blueprint placed for ${name}`)
  gameState.buildingPlacementMode = false
  gameState.currentBuildingType = null
  gameState.radialBuildingPlan = null
  return 'place'
}
