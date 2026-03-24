import { productionQueue } from '../productionQueue.js'

export function getUnitProductionCount(_controller, button) {
  if (!button) return 0

  let count = productionQueue.unitItems.filter(item => item.button === button).length
  if (productionQueue.currentUnit && productionQueue.currentUnit.button === button) {
    count += 1
  }

  return count
}

export function removeQueuedUnit(controller, button) {
  if (!button) return false

  if (productionQueue.removeQueuedUnitByButton(button)) {
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
