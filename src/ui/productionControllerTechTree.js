import { visitProductionUnlocks } from '../production/techTree.js'
import { gameState } from '../gameState.js'
import { playSound } from '../sound.js'

/**
 * Lazy load an image for a production button
 * @param {HTMLElement} button - The production button
 */
function loadButtonImage(button) {
  const img = button.querySelector('img')
  if (img && img.dataset.src) {
    // Always load the image from data-src (replaces placeholder)
    img.src = img.dataset.src
    // Keep data-src for potential re-use
  }
}

export function unlockUnitType(controller, type, skipSound = false) {
  if (!gameState.availableUnitTypes.has(type)) {
    gameState.availableUnitTypes.add(type)
    gameState.newUnitTypes.add(type)
    const button = controller.unitButtons.get(type)
    if (button) {
      loadButtonImage(button)
      button.classList.add('unlocked')
      const label = button.querySelector('.new-label')
      if (label) label.style.display = 'block'
    }
    if (!skipSound) {
      playSound('new_units_types_available', 1.0, 5, true) // Throttle for 5 seconds
    }
    // Update button states to ensure unlocked units are not disabled
    controller.updateVehicleButtonStates()
    // Update tab states when units are unlocked
    controller.updateTabStates()
  }
}

export function unlockBuildingType(controller, type, skipSound = false) {
  if (!gameState.availableBuildingTypes.has(type)) {
    gameState.availableBuildingTypes.add(type)
    gameState.newBuildingTypes.add(type)
    const button = controller.buildingButtons.get(type)
    if (button) {
      loadButtonImage(button)
      button.classList.add('unlocked')
      const label = button.querySelector('.new-label')
      if (label) label.style.display = 'block'
    }
    if (!skipSound) {
      playSound('new_building_types_available', 1.0, 5, true) // Throttle for 5 seconds
    }
    // Update button states to ensure unlocked buildings are not disabled
    controller.updateBuildingButtonStates()
    // Update tab states when buildings are unlocked
    controller.updateTabStates()
  }
}

/**
 * Unlock multiple units and buildings at once with appropriate sound
 */
export function unlockMultipleTypes(controller, unitTypes = [], buildingTypes = []) {
  let unlockedUnits = 0
  let unlockedBuildings = 0

  // Unlock units (skip individual sounds and button state updates)
  unitTypes.forEach(type => {
    if (!gameState.availableUnitTypes.has(type)) {
      gameState.availableUnitTypes.add(type)
      gameState.newUnitTypes.add(type)
      const button = controller.unitButtons.get(type)
      if (button) {
        loadButtonImage(button)
        button.classList.add('unlocked')
        const label = button.querySelector('.new-label')
        if (label) label.style.display = 'block'
      }
      unlockedUnits++
    }
  })

  // Unlock buildings (skip individual sounds and button state updates)
  buildingTypes.forEach(type => {
    if (!gameState.availableBuildingTypes.has(type)) {
      gameState.availableBuildingTypes.add(type)
      gameState.newBuildingTypes.add(type)
      const button = controller.buildingButtons.get(type)
      if (button) {
        loadButtonImage(button)
        button.classList.add('unlocked')
        const label = button.querySelector('.new-label')
        if (label) label.style.display = 'block'
      }
      unlockedBuildings++
    }
  })

  // Update button states once for all unlocked items
  if (unlockedUnits > 0) {
    controller.updateVehicleButtonStates()
  }
  if (unlockedBuildings > 0) {
    controller.updateBuildingButtonStates()
  }

  // Play appropriate sound based on what was unlocked
  if (unlockedUnits > 0 && unlockedBuildings > 0) {
    // Both units and buildings unlocked
    playSound('new_production_options', 1.0, 5, true)
  } else if (unlockedUnits > 0) {
    // Only units unlocked
    playSound('new_units_types_available', 1.0, 5, true)
  } else if (unlockedBuildings > 0) {
    // Only buildings unlocked
    playSound('new_building_types_available', 1.0, 5, true)
  }

  // Update tab states after batch unlock
  if (unlockedUnits > 0 || unlockedBuildings > 0) {
    controller.updateTabStates()
  }
}

// Force-unlock a unit type without triggering sounds or "new" labels
export function forceUnlockUnitType(controller, type) {
  if (!gameState.availableUnitTypes.has(type)) {
    gameState.availableUnitTypes.add(type)
  }
  gameState.newUnitTypes.delete(type)
  const button = controller.unitButtons.get(type)
  if (button) {
    loadButtonImage(button)
    button.classList.add('unlocked')
    const label = button.querySelector('.new-label')
    if (label) label.style.display = 'none'
  }
}

// Force-unlock a building type without triggering sounds or "new" labels
export function forceUnlockBuildingType(controller, type) {
  if (!gameState.availableBuildingTypes.has(type)) {
    gameState.availableBuildingTypes.add(type)
  }
  gameState.newBuildingTypes.delete(type)
  const button = controller.buildingButtons.get(type)
  if (button) {
    loadButtonImage(button)
    button.classList.add('unlocked')
    const label = button.querySelector('.new-label')
    if (label) label.style.display = 'none'
  }
}

// Sync tech tree unlocks based on existing player buildings
export function syncTechTreeWithBuildings(controller) {
  visitProductionUnlocks(gameState.buildings, gameState.humanPlayer, controller)

  controller.updateVehicleButtonStates()
  controller.updateBuildingButtonStates()
  controller.updateTabStates()
}
