import { productionQueue } from '../productionQueue.js'

export function getUnitProductionCount(_controller, button) {
  if (!button) return 0

  const lane = productionQueue.getUnitLane(button)
  // The currently producing item remains at index 0 until completion, so it
  // is already included in unitItems and must not be counted twice.
  return lane.unitItems.filter(item => item.button === button).length
}

export function removeQueuedUnit(controller, button) {
  if (!button) return false

  const lane = productionQueue.getUnitLane(button)
  if (lane.removeQueuedUnitByButton(button)) {
    productionQueue.updateBatchCounter(button, controller.getUnitProductionCount(button))
    return true
  }

  return false
}

export function getBuildingProductionCount(_controller, button) {
  if (!button) return 0

  let count = productionQueue.buildingItems.filter(item => item.button === button).length
  if (productionQueue.currentBuilding && productionQueue.currentBuilding.button === button) {
    count += 1
  }

  return count
}

export function removeQueuedBuilding(controller, button) {
  if (!button) return false

  if (productionQueue.removeQueuedBuildingByButton(button)) {
    productionQueue.updateBatchCounter(button, controller.getBuildingProductionCount(button))
    return true
  }

  if (button.classList.contains('ready-for-placement')) {
    const buildingType = button.getAttribute('data-building-type')
    productionQueue.cancelReadyBuilding(buildingType, button)
    productionQueue.updateBatchCounter(button, controller.getBuildingProductionCount(button))
    return true
  }

  return false
}
