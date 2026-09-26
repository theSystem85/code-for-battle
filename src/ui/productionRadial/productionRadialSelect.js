import { gameState } from '../../gameState.js'
import { productionQueue } from '../../productionQueue.js'
import { showNotification } from '../notifications.js'

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
    if (button.classList.contains('ready-for-placement') || item.ready) {
      return Boolean(productionQueue.enableBuildingPlacementMode(item.type, button))
    }
    if (gameState.buildingPlacementMode) return false
    productionQueue.addItem(item.type, button, true)
    return true
  }

  productionQueue.addItem(item.type, button, false, null, null, {
    factoryId: factory && factory.id != null ? factory.id : null
  })
  return true
}
