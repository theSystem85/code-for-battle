import { gameState } from '../gameState.js'
import { unitCosts, buildingCosts } from '../main.js'
import { productionQueue } from '../productionQueue.js'
import { showNotification } from './notifications.js'
import { buildingData } from '../buildings.js'
import { applyProductionBrush } from './mapEditorControls.js'
import { attachProductionTooltipHandlers } from './productionTooltip.js'

const mobileLandscapeBuildingLabelMap = {
  vehicleFactory: 'Vehicle Fab',
  radarStation: 'Radar',
  vehicleWorkshop: 'Workshop',
  ammunitionFactory: 'Ammo Fab',
  turretGunV1: 'Turret V1',
  turretGunV2: 'Turret V2',
  turretGunV3: 'Turret V3'
}

function updateMobileLandscapeBuildingLabels(controller) {
  const isMobileLandscape = document.body.classList.contains('mobile-landscape')

  controller.buildingButtons.forEach((button, buildingType) => {
    const nameElement = button.querySelector('.building-name')
    if (!nameElement) {
      return
    }

    if (!nameElement.dataset.defaultName) {
      nameElement.dataset.defaultName = nameElement.textContent.trim()
    }

    const shortLabel = mobileLandscapeBuildingLabelMap[buildingType]

    if (isMobileLandscape) {
      nameElement.textContent = shortLabel || nameElement.dataset.defaultName
      return
    }

    nameElement.textContent = nameElement.dataset.defaultName

    if (shortLabel && nameElement.scrollWidth > nameElement.clientWidth) {
      nameElement.textContent = shortLabel
    }
  })
}

function attachMobileLandscapeLabelSync(controller) {
  if (controller.mobileLandscapeLabelSyncAttached) {
    return
  }

  const syncLabels = () => {
    updateMobileLandscapeBuildingLabels(controller)
  }

  document.addEventListener('mobile-landscape-layout-changed', syncLabels)
  window.addEventListener('resize', syncLabels)

  controller.mobileLandscapeLabelSyncAttached = true
}

function loadButtonImage(button) {
  const img = button.querySelector('img')
  if (img && img.dataset && img.dataset.src && img.src !== img.dataset.src) {
    img.src = img.dataset.src
  }
}

function loadImagesForAvailableTypes(controller) {
  // Load images for already available unit types
  gameState.availableUnitTypes.forEach(unitType => {
    const button = controller.unitButtons.get(unitType)
    if (button) {
      loadButtonImage(button)
    }
  })

  // Load images for already available building types
  gameState.availableBuildingTypes.forEach(buildingType => {
    const button = controller.buildingButtons.get(buildingType)
    if (button) {
      loadButtonImage(button)
    }
  })
}

export function setupAllProductionButtons(controller) {
  // Only setup once to prevent duplicate event listeners
  if (controller.isSetup) {
    // Just update button states if already set up
    controller.updateVehicleButtonStates()
    controller.updateBuildingButtonStates()
    controller.updateMobileCategoryToggle()
    updateMobileLandscapeBuildingLabels(controller)
    return
  }

  // Clear the button maps since we're refreshing all references
  controller.unitButtons.clear()
  controller.buildingButtons.clear()

  controller.setupUnitButtons()
  controller.setupBuildingButtons()

  // Initial update of button states when setting up
  controller.updateVehicleButtonStates()
  controller.updateBuildingButtonStates()
  controller.updateMobileCategoryToggle()
  updateMobileLandscapeBuildingLabels(controller)
  attachMobileLandscapeLabelSync(controller)

  // Load images for already unlocked buildings/units
  controller.syncTechTreeWithBuildings()
  loadImagesForAvailableTypes(controller)

  document.body.classList.remove('production-buttons-loading')
  controller.isSetup = true
}

export function setupUnitButtons(controller) {
  const unitButtons = document.querySelectorAll('.production-button[data-unit-type]')

  unitButtons.forEach(button => {
    const unitType = button.getAttribute('data-unit-type')
    controller.unitButtons.set(unitType, button)

    // Check if this unit is already unlocked and make it visible
    if (gameState.availableUnitTypes.has(unitType)) {
      button.classList.add('unlocked')
    }

    if (gameState.newUnitTypes.has(unitType)) {
      const label = button.querySelector('.new-label')
      if (label) label.style.display = 'block'
    }

    button.addEventListener('click', (event) => {
      if (controller.suppressNextClick) {
        controller.suppressNextClick = false
        return
      }

      const unitType = button.getAttribute('data-unit-type')

      const isUpperHalf = controller.isUpperHalfClick(event, button)
      controller.showStackDirectionIndicator(button, isUpperHalf ? 'increase' : 'decrease')

      if (!isUpperHalf) {
        controller.removeQueuedUnit(button)
        return
      }

      if (gameState.mapEditMode) {
        applyProductionBrush('unit', unitType)
        return
      }

      // Prevent action if game is paused or button is disabled
      if (gameState.gamePaused || button.classList.contains('disabled')) {
        // Optionally show a notification if disabled
        if (button.classList.contains('disabled')) {
          showNotification('Cannot produce unit: Required building missing.')
        }
        return
      }
      unitCosts[unitType] || 0 // Cost is used for validation but not directly referenced

      // Check requirements for the unit type
      let requirementsMet = true
      let requirementText = ''

      if (unitType === 'tankerTruck') {
        const hasVehicleFactory = gameState.buildings.some(b => b.type === 'vehicleFactory' && b.owner === gameState.humanPlayer)
        const hasGasStation = gameState.buildings.some(b => b.type === 'gasStation' && b.owner === gameState.humanPlayer)
        if (!hasVehicleFactory || !hasGasStation) {
          requirementsMet = false
          requirementText = 'Requires Vehicle Factory & Gas Station'
        }
      } else if (unitType === 'howitzer') {
        const hasVehicleFactory = gameState.buildings.some(b => b.type === 'vehicleFactory' && b.owner === gameState.humanPlayer)
        const hasRadar = gameState.buildings.some(b => b.type === 'radarStation' && b.owner === gameState.humanPlayer)
        if (!hasVehicleFactory || !hasRadar) {
          requirementsMet = false
          requirementText = 'Requires Vehicle Factory & Radar Station'
        }
      } else if (unitType === 'apache') {
        const hasHelipad = gameState.buildings.some(b => b.type === 'helipad' && b.owner === gameState.humanPlayer)
        if (!hasHelipad) {
          requirementsMet = false
          requirementText = 'Requires Helipad'
        }
      } else if (unitType === 'f22Raptor') {
        const hasAirstrip = gameState.buildings.some(b => b.type === 'airstrip' && b.owner === gameState.humanPlayer)
        if (!hasAirstrip) {
          requirementsMet = false
          requirementText = 'Requires Airstrip'
        }
      } else if (unitType === 'ammunitionTruck') {
        const hasVehicleFactory = gameState.buildings.some(b => b.type === 'vehicleFactory' && b.owner === gameState.humanPlayer)
        const hasAmmunitionFactory = gameState.buildings.some(b => b.type === 'ammunitionFactory' && b.owner === gameState.humanPlayer)
        if (!hasVehicleFactory || !hasAmmunitionFactory) {
          requirementsMet = false
          requirementText = 'Requires Vehicle Factory & Ammunition Factory'
        }
      } else if (controller.vehicleUnitTypes.includes(unitType)) {
        const hasVehicleFactory = gameState.buildings.some(b => b.type === 'vehicleFactory' && b.owner === gameState.humanPlayer)
        if (!hasVehicleFactory) {
          requirementsMet = false
          requirementText = 'Requires Vehicle Factory'
        }
      } else if (unitType === 'harvester') {
        const hasVehicleFactory = gameState.buildings.some(b => b.type === 'vehicleFactory' && b.owner === gameState.humanPlayer)
        const hasRefinery = gameState.buildings.some(b => b.type === 'oreRefinery' && b.owner === gameState.humanPlayer)
        if (!hasVehicleFactory || !hasRefinery) {
          requirementsMet = false
          requirementText = 'Requires Vehicle Factory & Ore Refinery'
        }
      }

      // If requirements are not met, disable the button and show tooltip
      if (!requirementsMet) {
        showNotification(`Cannot produce ${unitType}: ${requirementText}.`)
        button.classList.add('disabled')
        button.title = requirementText
        return // Stop processing
      }

      // Re-enable button if requirements were previously unmet but now are met
      button.classList.remove('disabled')
      button.title = '' // Clear requirement tooltip

      if (gameState.newUnitTypes.has(unitType)) {
        gameState.newUnitTypes.delete(unitType)
        const label = button.querySelector('.new-label')
        if (label) label.style.display = 'none'
      }

      // Always allow queuing
      productionQueue.addItem(unitType, button, false)
    })

    button.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      // Prevent action if game is paused
      if (gameState.gamePaused) return

      // Check if this button has the current production
      if (productionQueue.currentUnit && productionQueue.currentUnit.button === button) {
        if (!productionQueue.pausedUnit) {
          // First right-click pauses
          productionQueue.togglePauseUnit()
        } else {
          // Second right-click cancels
          productionQueue.cancelUnitProduction()
        }
      } else {
        // Find the last queued item of this type
        // Allow canceling ALL queued items, including currently producing ones
        for (let i = productionQueue.unitItems.length - 1; i >= 0; i--) {
          if (productionQueue.unitItems[i].button === button) {
            // If we're canceling the currently producing unit, cancel it properly
            if (i === 0 && productionQueue.currentUnit && productionQueue.currentUnit.button === button) {
              productionQueue.cancelUnitProduction()
              break
            } else {
              // Remove queued unit (no money refund for queued items)
              productionQueue.tryResumeProduction()
              productionQueue.unitItems.splice(i, 1)

              const remainingCount = productionQueue.unitItems.filter(
                item => item.button === button
              ).length + (productionQueue.currentUnit && productionQueue.currentUnit.button === button ? 1 : 0)

              productionQueue.updateBatchCounter(button, remainingCount)
              break
            }
          }
        }
      }
    })

    // Shift + mouse wheel to adjust queued amount
    button.addEventListener('wheel', (e) => {
      // Check both gameState.shiftKeyDown and the event's shiftKey property as fallbacks
      const isShiftPressed = gameState.shiftKeyDown || e.shiftKey

      if (!isShiftPressed) return
      e.preventDefault()
      e.stopPropagation()

      // Determine scroll direction - use deltaX as primary (some systems report scroll in deltaX)
      // then fall back to deltaY, wheelDelta, and detail
      let scrollUp = false
      let scrollDown = false

      // Method 1: deltaX (some trackpads/systems report horizontal scroll for wheel)
      if (e.deltaX < 0) {
        scrollUp = true
      } else if (e.deltaX > 0) {
        scrollDown = true
      }

      // Method 2: deltaY (most standard) - only if deltaX didn't determine direction
      if (!scrollUp && !scrollDown) {
        if (e.deltaY < 0 || Object.is(e.deltaY, -0)) {
          scrollUp = true
        } else if (e.deltaY > 0) {
          scrollDown = true
        }
      }

      // Method 3: wheelDelta (older browsers/systems) - only if neither deltaX nor deltaY worked
      if (!scrollUp && !scrollDown && e.wheelDelta !== undefined) {
        if (e.wheelDelta > 0) {
          scrollUp = true
        } else if (e.wheelDelta < 0) {
          scrollDown = true
        }
      }

      // Method 4: detail (Firefox legacy) - final fallback
      if (!scrollUp && !scrollDown && e.detail !== undefined) {
        if (e.detail < 0) {
          scrollUp = true
        } else if (e.detail > 0) {
          scrollDown = true
        }
      }

      if (scrollUp) {
        // Scroll up - queue one more unit if possible
        if (!gameState.gamePaused && !button.classList.contains('disabled')) {
          const unitType = button.getAttribute('data-unit-type')
          productionQueue.addItem(unitType, button, false)
        }
      } else if (scrollDown) {
        // Scroll down - remove last queued unit of this type
        // Allow canceling ALL blue bubbles, including currently producing ones
        for (let i = productionQueue.unitItems.length - 1; i >= 0; i--) {
          if (productionQueue.unitItems[i].button === button) {
            // If we're canceling the currently producing unit, cancel it properly
            if (i === 0 && productionQueue.currentUnit && productionQueue.currentUnit.button === button) {
              productionQueue.cancelUnitProduction()
              break
            } else {
              // Remove queued unit (no money refund for queued items)
              productionQueue.tryResumeProduction()
              productionQueue.unitItems.splice(i, 1)

              const remainingCount = productionQueue.unitItems.filter(
                item => item.button === button
              ).length + (productionQueue.currentUnit && productionQueue.currentUnit.button === button ? 1 : 0)

              productionQueue.updateBatchCounter(button, remainingCount)
              break
            }
          }
        }
      }
    }, { passive: false })

    // Drag and drop rally point placement
    button.setAttribute('draggable', 'true')

    const img = button.querySelector('img')
    if (img) {
      img.setAttribute('draggable', 'false')
      img.addEventListener('dragstart', e => {
        e.preventDefault()
        return false
      })
    }

    button.addEventListener('dragstart', (e) => {
      if (gameState.gamePaused || button.classList.contains('disabled')) {
        e.preventDefault()
        return false
      }
      gameState.draggedUnitType = unitType
      gameState.draggedUnitButton = button

      const dragImage = document.createElement('div')
      dragImage.style.width = '1px'
      dragImage.style.height = '1px'
      dragImage.style.backgroundColor = 'transparent'
      dragImage.style.position = 'absolute'
      dragImage.style.top = '-1000px'
      document.body.appendChild(dragImage)

      try {
        e.dataTransfer.setDragImage(dragImage, 0, 0)
      } catch (err) {
        window.logger.warn('Could not set custom drag image:', err)
      }

      setTimeout(() => {
        if (dragImage.parentNode) {
          document.body.removeChild(dragImage)
        }
      }, 10)
    })

    button.addEventListener('dragend', () => {
      gameState.draggedUnitType = null
      gameState.draggedUnitButton = null
    })

    controller.attachMobileDragHandlers(button, { kind: 'unit', type: unitType })
    attachProductionTooltipHandlers(button, { kind: 'unit', type: unitType }, controller)
  })
}

export function setupBuildingButtons(controller) {
  const buildingButtons = document.querySelectorAll('.production-button[data-building-type]')

  buildingButtons.forEach(button => {
    const buildingType = button.getAttribute('data-building-type')
    controller.buildingButtons.set(buildingType, button)

    // Check if this building is already unlocked and make it visible
    if (gameState.availableBuildingTypes.has(buildingType)) {
      button.classList.add('unlocked')
    }

    if (gameState.newBuildingTypes.has(buildingType)) {
      const label = button.querySelector('.new-label')
      if (label) label.style.display = 'block'
    }

    // Track double-click timing
    let lastClickTime = 0
    const DOUBLE_CLICK_THRESHOLD = 500 // 500ms for double-click

    // Drag and drop support
    button.setAttribute('draggable', 'true')

    // Disable dragging on the image inside the button to prevent it from interfering
    const img = button.querySelector('img')
    if (img) {
      img.setAttribute('draggable', 'false')
      // Also prevent default drag behavior on the image
      img.addEventListener('dragstart', (e) => {
        e.preventDefault()
        return false
      })
    }

    button.addEventListener('dragstart', (e) => {
      if (gameState.gamePaused || button.classList.contains('disabled')) {
        e.preventDefault()
        return false
      }
      gameState.draggedBuildingType = buildingType
      gameState.draggedBuildingButton = button
      gameState.chainBuildPrimed = gameState.shiftKeyDown

      // Method 1: Try using a transparent 1x1 pixel div
      const dragImage = document.createElement('div')
      dragImage.style.width = '1px'
      dragImage.style.height = '1px'
      dragImage.style.backgroundColor = 'transparent'
      dragImage.style.position = 'absolute'
      dragImage.style.top = '-1000px'
      document.body.appendChild(dragImage)

      try {
        e.dataTransfer.setDragImage(dragImage, 0, 0)
      } catch (err) {
        window.logger.warn('Could not set custom drag image:', err)
      }

      // Clean up the temporary element after a brief delay
      setTimeout(() => {
        if (dragImage.parentNode) {
          document.body.removeChild(dragImage)
        }
      }, 10)
    })
    button.addEventListener('dragend', () => {
      gameState.draggedBuildingType = null
      gameState.draggedBuildingButton = null
      gameState.chainBuildPrimed = false
      gameState.buildingPlacementMode = false
      gameState.currentBuildingType = null
    })

    controller.attachMobileDragHandlers(button, { kind: 'building', type: buildingType })
    attachProductionTooltipHandlers(button, { kind: 'building', type: buildingType }, controller)

    button.addEventListener('click', (event) => {
      if (controller.suppressNextClick) {
        controller.suppressNextClick = false
        return
      }

      const buildingType = button.getAttribute('data-building-type')
      const currentTime = performance.now()
      const hasExistingStack = controller.getBuildingProductionCount(button) > 0 ||
        button.classList.contains('ready-for-placement')
      let isUpperHalf = controller.isUpperHalfClick(event, button)

      if (!hasExistingStack) {
        isUpperHalf = true
      }

      controller.showStackDirectionIndicator(button, isUpperHalf ? 'increase' : 'decrease')

      if (!isUpperHalf) {
        controller.removeQueuedBuilding(button)
        return
      }

      if (gameState.mapEditMode) {
        applyProductionBrush('building', buildingType)
        return
      }

      // Prevent action if game is paused or button is disabled
      if (gameState.gamePaused || button.classList.contains('disabled')) {
        if (button.classList.contains('disabled')) {
          showNotification('Cannot construct building: ' + (button.title || 'Prerequisite missing.'))
        }
        return
      }

      // Handle ready-for-placement buildings
      if (button.classList.contains('ready-for-placement')) {
        // Check if this is a double-click
        const timeSinceLastClick = currentTime - lastClickTime
        lastClickTime = currentTime

        if (timeSinceLastClick <= DOUBLE_CLICK_THRESHOLD) {
          // Double-click: Queue another building of the same type (stacking)
          if (gameState.newBuildingTypes.has(buildingType)) {
            gameState.newBuildingTypes.delete(buildingType)
            const label = button.querySelector('.new-label')
            if (label) label.style.display = 'none'
          }
          productionQueue.addItem(buildingType, button, true)
          showNotification(`Queued another ${buildingData[buildingType].displayName}`)
        } else {
          // Single click: Enable placement mode
          if (productionQueue.enableBuildingPlacementMode(buildingType, button)) {
            // Placement mode enabled successfully
          } else {
            window.logger.warn('Failed to enable placement mode for building:', buildingType)
          }
        }
        return
      }

      // If a building placement is already in progress, don't queue another one
      if (gameState.buildingPlacementMode) {
        return
      }

      buildingCosts[buildingType] || 0 // Cost is used by productionQueue internally

      // Always allow queuing
      if (gameState.newBuildingTypes.has(buildingType)) {
        gameState.newBuildingTypes.delete(buildingType)
        const label = button.querySelector('.new-label')
        if (label) label.style.display = 'none'
      }

      productionQueue.addItem(buildingType, button, true)
      lastClickTime = currentTime
    })

    button.addEventListener('contextmenu', (e) => {
      e.preventDefault()

      // If this is a ready-for-placement building, handle cancellation properly
      if (button.classList.contains('ready-for-placement')) {
        // Clear any lingering pause states that might interfere
        if (productionQueue.currentBuilding === null) {
          productionQueue.pausedBuilding = false
        }

        // Check if there are stacked buildings in queue
        const stackedCount = productionQueue.buildingItems.filter(item => item.button === button).length

        if (stackedCount > 0) {
          // If there are stacked buildings, cancel the last one from the queue
          // Allow canceling ALL stacked buildings, including currently producing ones
          for (let i = productionQueue.buildingItems.length - 1; i >= 0; i--) {
            const queued = productionQueue.buildingItems[i]
            if (queued.button === button) {
              // If we're canceling the currently producing building, cancel it properly
              if (i === 0 && productionQueue.currentBuilding && productionQueue.currentBuilding.button === button) {
                productionQueue.cancelBuildingProduction()
                showNotification('Cancelled building construction')
                break
              } else {
                // Remove queued building (no money refund for stacked buildings)
                productionQueue.tryResumeProduction()
                productionQueue.buildingItems.splice(i, 1)
                productionQueue.removeBlueprint(queued)

                const remainingCount = productionQueue.buildingItems.filter(
                  item => item.button === button
                ).length

                productionQueue.updateBatchCounter(button, remainingCount)
                showNotification('Cancelled stacked building construction')
                break
              }
            }
          }
        } else {
          // No stacked buildings, cancel the ready-for-placement building
          const buildingType = button.getAttribute('data-building-type')
          productionQueue.cancelReadyBuilding(buildingType, button)
        }
        return
      }

      // Check if this button has the current production
      if (productionQueue.currentBuilding && productionQueue.currentBuilding.button === button) {
        if (!productionQueue.pausedBuilding) {
          // First right-click pauses
          productionQueue.togglePauseBuilding()
        } else {
          // Second right-click cancels
          productionQueue.cancelBuildingProduction()
        }
      } else {
        // Find the last queued item of this type
        // Allow canceling ALL queued items, including currently producing ones
        for (let i = productionQueue.buildingItems.length - 1; i >= 0; i--) {
          const queued = productionQueue.buildingItems[i]
          if (queued.button === button) {
            // If we're canceling the currently producing building, cancel it properly
            if (i === 0 && productionQueue.currentBuilding && productionQueue.currentBuilding.button === button) {
              productionQueue.cancelBuildingProduction()
              break
            } else {
              // Remove queued building (no money refund for queued items)
              productionQueue.tryResumeProduction()
              productionQueue.buildingItems.splice(i, 1)
              productionQueue.removeBlueprint(queued)

              const remainingCount = productionQueue.buildingItems.filter(
                item => item.button === button
              ).length + (productionQueue.currentBuilding && productionQueue.currentBuilding.button === button ? 1 : 0)

              productionQueue.updateBatchCounter(button, remainingCount)
              break
            }
          }
        }
      }
    })

    // Shift + mouse wheel to adjust queued amount for buildings
    button.addEventListener('wheel', (e) => {
      // Check both gameState.shiftKeyDown and the event's shiftKey property as fallbacks
      const isShiftPressed = gameState.shiftKeyDown || e.shiftKey

      if (!isShiftPressed) return
      e.preventDefault()
      e.stopPropagation()

      // Determine scroll direction - use deltaX as primary (some systems report scroll in deltaX)
      // then fall back to deltaY, wheelDelta, and detail
      let scrollUp = false
      let scrollDown = false

      // Method 1: deltaX (some trackpads/systems report horizontal scroll for wheel)
      if (e.deltaX < 0) {
        scrollUp = true
      } else if (e.deltaX > 0) {
        scrollDown = true
      }

      // Method 2: deltaY (most standard) - only if deltaX didn't determine direction
      if (!scrollUp && !scrollDown) {
        if (e.deltaY < 0 || Object.is(e.deltaY, -0)) {
          scrollUp = true
        } else if (e.deltaY > 0) {
          scrollDown = true
        }
      }

      // Method 3: wheelDelta (older browsers/systems) - only if neither deltaX nor deltaY worked
      if (!scrollUp && !scrollDown && e.wheelDelta !== undefined) {
        if (e.wheelDelta > 0) {
          scrollUp = true
        } else if (e.wheelDelta < 0) {
          scrollDown = true
        }
      }

      // Method 4: detail (Firefox legacy) - final fallback
      if (!scrollUp && !scrollDown && e.detail !== undefined) {
        if (e.detail < 0) {
          scrollUp = true
        } else if (e.detail > 0) {
          scrollDown = true
        }
      }

      if (scrollUp) {
        // Scroll up - queue one more building if possible
        if (!gameState.gamePaused && !button.classList.contains('disabled')) {
          productionQueue.addItem(buildingType, button, true)
        }
      } else if (scrollDown) {
        // Scroll down - remove last queued building of this type
        // Allow canceling ALL blue bubbles, including currently producing ones
        for (let i = productionQueue.buildingItems.length - 1; i >= 0; i--) {
          const queued = productionQueue.buildingItems[i]
          if (queued.button === button) {
            // If we're canceling the currently producing building, cancel it properly
            if (i === 0 && productionQueue.currentBuilding && productionQueue.currentBuilding.button === button) {
              productionQueue.cancelBuildingProduction()
              break
            } else {
              // Remove queued building (no money refund for queued items)
              productionQueue.tryResumeProduction()
              productionQueue.buildingItems.splice(i, 1)
              productionQueue.removeBlueprint(queued)

              const remainingCount = productionQueue.buildingItems.filter(
                item => item.button === button
              ).length + (productionQueue.currentBuilding && productionQueue.currentBuilding.button === button ? 1 : 0)

              productionQueue.updateBatchCounter(button, remainingCount)
              break
            }
          }
        }
      }
    }, { passive: false })
  })
}
