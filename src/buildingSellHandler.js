import { TILE_SIZE } from './config.js'
import { playSound } from './sound.js'
import { buildingCosts } from './main.js'
import { showNotification } from './ui/notifications.js'
import { productionQueue } from './productionQueue.js'
import { updateMoneyBar } from './ui/moneyBar.js'
import { broadcastBuildingSell } from './network/gameCommandSync.js'
import { buildingData } from './data/buildingData.js'
import { getCascadingBlueprintCancellation } from './planning/blueprintPlanning.js'
// No need to modify map grid immediately; building removal occurs after the sell animation

function showPlanCancellationWarning(planCount) {
  showNotification(`Warning: ${planCount} building plans would be cancelled. Click again to confirm.`, 4500, {
    renderContent: (notification, message) => {
      notification.style.display = 'flex'
      notification.style.alignItems = 'center'
      notification.style.gap = '8px'

      const text = document.createElement('span')
      text.textContent = message
      notification.appendChild(text)

      const icon = document.createElement('span')
      icon.textContent = '⚠️'
      notification.appendChild(icon)
    }
  })
}

/**
 * Handles the selling of buildings
 * Returns 70% of the original building cost back to the player
 * Restores original map tiles that were under the building
 */
export function buildingSellHandler(e, gameState, gameCanvas, mapGrid, units, factories, _moneyEl) {
  // Only process if sell mode is active
  if (!gameState.sellMode) return

  const mouseX = e.clientX - gameCanvas.getBoundingClientRect().left + gameState.scrollOffset.x
  const mouseY = e.clientY - gameCanvas.getBoundingClientRect().top + gameState.scrollOffset.y

  // Convert to tile coordinates
  const tileX = Math.floor(mouseX / TILE_SIZE)
  const tileY = Math.floor(mouseY / TILE_SIZE)

  const clickedBlueprint = (gameState.blueprints || []).find((blueprint) => {
    const info = buildingData[blueprint.type]
    if (!info) {
      return false
    }

    return tileX >= blueprint.x && tileX < blueprint.x + info.width && tileY >= blueprint.y && tileY < blueprint.y + info.height
  })

  if (clickedBlueprint) {
    const preview = gameState.sellPlanCancellationPreview
    if (preview && preview.targetBlueprint !== clickedBlueprint) {
      gameState.sellPlanCancellationPreview = null
      return false
    }

    const blueprintsToCancel = getCascadingBlueprintCancellation(
      clickedBlueprint,
      gameState.blueprints || [],
      gameState.buildings || [],
      factories || [],
      gameState.humanPlayer
    )

    if (blueprintsToCancel.length > 1 && !preview) {
      gameState.sellPlanCancellationPreview = {
        targetBlueprint: clickedBlueprint,
        blueprintsToCancel
      }
      showPlanCancellationWarning(blueprintsToCancel.length)
      playSound('error')
      return false
    }

    const cancelledCount = productionQueue.cancelBlueprintPlans(blueprintsToCancel)
    gameState.sellPlanCancellationPreview = null

    if (cancelledCount > 0) {
      playSound('constructionCancelled', 1.0, 0, true)
      showNotification(cancelledCount === 1
        ? 'Building plan cancelled.'
        : `${cancelledCount} building plans cancelled.`)
      return true
    }

    showNotification('No player building found to sell.')
    return false
  }

  // Player factory cannot be sold
  const playerFactory = factories.find(factory => factory.id === gameState.humanPlayer)
  if (playerFactory &&
      tileX >= playerFactory.x && tileX < (playerFactory.x + playerFactory.width) &&
      tileY >= playerFactory.y && tileY < (playerFactory.y + playerFactory.height)) {
    showNotification('The main factory cannot be sold.')
    playSound('error')
    return
  }

  // Check player buildings
  for (let i = 0; i < gameState.buildings.length; i++) {
    const building = gameState.buildings[i]
    if (building.owner === gameState.humanPlayer &&
        tileX >= building.x && tileX < (building.x + building.width) &&
        tileY >= building.y && tileY < (building.y + building.height)) {

      // Don't allow selling again while the sell animation runs
      if (building.isBeingSold) {
        showNotification('Building is already being sold.')
        playSound('error')
        return false
      }

      // Calculate sell value (70% of original cost)
      const buildingType = building.type
      const originalCost = buildingCosts[buildingType] || 0
      const sellValue = Math.floor(originalCost * 0.7)

      // Add money to player
      gameState.money += sellValue
      if (productionQueue && typeof productionQueue.tryResumeProduction === 'function') {
        productionQueue.tryResumeProduction()
      }
      // Update money display
      if (typeof updateMoneyBar === 'function') {
        updateMoneyBar()
      }

      // Mark the building as being sold
      building.isBeingSold = true
      building.sellStartTime = performance.now()

      // Broadcast sell action to other players
      broadcastBuildingSell(building.id, sellValue, building.sellStartTime)

      // Play selling sound and show notification
      playSound('deposit')
      showNotification(`Building sold for $${sellValue}.`)

      // Selling initiated successfully
      return true
    }
  }

  gameState.sellPlanCancellationPreview = null
  showNotification('No player building found to sell.')
  return false
}
