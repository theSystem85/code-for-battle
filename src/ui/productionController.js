// productionController.js
// Handle production button setup and state management

import {
  updateVehicleButtonStates as updateVehicleButtonStatesImpl,
  updateBuildingButtonStates as updateBuildingButtonStatesImpl
} from './productionControllerButtonStates.js'
import {
  setupAllProductionButtons as setupAllProductionButtonsImpl,
  setupUnitButtons as setupUnitButtonsImpl,
  setupBuildingButtons as setupBuildingButtonsImpl
} from './productionControllerButtonSetup.js'
import {
  unlockUnitType as unlockUnitTypeImpl,
  unlockBuildingType as unlockBuildingTypeImpl,
  unlockMultipleTypes as unlockMultipleTypesImpl,
  forceUnlockUnitType as forceUnlockUnitTypeImpl,
  forceUnlockBuildingType as forceUnlockBuildingTypeImpl,
  syncTechTreeWithBuildings as syncTechTreeWithBuildingsImpl
} from './productionControllerTechTree.js'
import {
  getUnitProductionCount as getUnitProductionCountImpl,
  removeQueuedUnit as removeQueuedUnitImpl,
  getBuildingProductionCount as getBuildingProductionCountImpl,
  removeQueuedBuilding as removeQueuedBuildingImpl
} from './productionControllerQueue.js'
import {
  ensureMobileToggle as ensureMobileToggleImpl,
  handleMobileCategoryToggle as handleMobileCategoryToggleImpl,
  scrollTabIntoView as scrollTabIntoViewImpl,
  forceLoadTabImages as forceLoadTabImagesImpl,
  activateTab as activateTabImpl,
  updateMobileCategoryToggle as updateMobileCategoryToggleImpl,
  initProductionTabs as initProductionTabsImpl,
  updateTabStates as updateTabStatesImpl
} from './productionControllerTabs.js'
import {
  attachMobileDragHandlers as attachMobileDragHandlersImpl,
  isUpperHalfClick as isUpperHalfClickImpl,
  showStackDirectionIndicator as showStackDirectionIndicatorImpl,
  updateMobileDragHover as updateMobileDragHoverImpl,
  applyMobileEdgeScroll as applyMobileEdgeScrollImpl
} from './productionControllerInteractions.js'

export class ProductionController {
  constructor() {
    this.vehicleUnitTypes = ['tank', 'tank-v2', 'tank-v3', 'rocketTank', 'howitzer', 'ambulance', 'tankerTruck', 'recoveryTank', 'mineLayer', 'mineSweeper']
    this.unitButtons = new Map()
    this.buildingButtons = new Map()
    this.isSetup = false // Flag to prevent duplicate event listeners
    this.mobileDragState = null
    this.suppressNextClick = false
    this.lastMobileEdgeScrollTime = null
    this.mobileCategoryToggle = document.getElementById('mobileCategoryToggle')
    this.mobileCategoryToggleListenerAdded = false

    document.addEventListener('mobile-landscape-layout-changed', (event) => {
      this.ensureMobileToggle()
      this.updateMobileCategoryToggle()
      if (event?.detail?.enabled && this.isSetup) {
        const activeButton = document.querySelector('.tab-button.active[data-tab]')
        const tabName = activeButton ? activeButton.getAttribute('data-tab') : null
        if (tabName) {
          this.activateTab(tabName, { scrollIntoView: false })
        }
      }
    })

    this.ensureMobileToggle()
  }

  // Function to update the enabled/disabled state of vehicle production buttons
  updateVehicleButtonStates() {
    return updateVehicleButtonStatesImpl(this)
  }

  // Update enabled/disabled state of building production buttons
  updateBuildingButtonStates() {
    return updateBuildingButtonStatesImpl(this)
  }

  ensureMobileToggle() {
    return ensureMobileToggleImpl(this)
  }

  handleMobileCategoryToggle() {
    return handleMobileCategoryToggleImpl(this)
  }

  scrollTabIntoView(tabContent) {
    return scrollTabIntoViewImpl(this, tabContent)
  }

  forceLoadTabImages(tabContent) {
    return forceLoadTabImagesImpl(this, tabContent)
  }

  activateTab(tabName, options = {}) {
    return activateTabImpl(this, tabName, options)
  }

  updateMobileCategoryToggle(activeTabName) {
    return updateMobileCategoryToggleImpl(this, activeTabName)
  }

  // Combined production button setup function that handles both unit and building buttons
  setupAllProductionButtons() {
    return setupAllProductionButtonsImpl(this)
  }

  setupUnitButtons() {
    return setupUnitButtonsImpl(this)
  }

  setupBuildingButtons() {
    return setupBuildingButtonsImpl(this)
  }

  unlockUnitType(type, skipSound = false) {
    return unlockUnitTypeImpl(this, type, skipSound)
  }

  unlockBuildingType(type, skipSound = false) {
    return unlockBuildingTypeImpl(this, type, skipSound)
  }

  /**
   * Unlock multiple units and buildings at once with appropriate sound
   */
  unlockMultipleTypes(unitTypes = [], buildingTypes = []) {
    return unlockMultipleTypesImpl(this, unitTypes, buildingTypes)
  }

  // Force-unlock a unit type without triggering sounds or "new" labels
  forceUnlockUnitType(type) {
    return forceUnlockUnitTypeImpl(this, type)
  }

  // Force-unlock a building type without triggering sounds or "new" labels
  forceUnlockBuildingType(type) {
    return forceUnlockBuildingTypeImpl(this, type)
  }

  // Sync tech tree unlocks based on existing player buildings
  syncTechTreeWithBuildings() {
    return syncTechTreeWithBuildingsImpl(this)
  }

  // Initialize production tabs without setting up buttons again
  initProductionTabs() {
    return initProductionTabsImpl(this)
  }

  /**
   * Update tab states based on available production options
   */
  updateTabStates() {
    return updateTabStatesImpl(this)
  }

  attachMobileDragHandlers(button, detail) {
    return attachMobileDragHandlersImpl(this, button, detail)
  }

  getUnitProductionCount(button) {
    return getUnitProductionCountImpl(this, button)
  }

  removeQueuedUnit(button) {
    return removeQueuedUnitImpl(this, button)
  }

  getBuildingProductionCount(button) {
    return getBuildingProductionCountImpl(this, button)
  }

  removeQueuedBuilding(button) {
    return removeQueuedBuildingImpl(this, button)
  }

  isUpperHalfClick(event, button) {
    return isUpperHalfClickImpl(this, event, button)
  }

  showStackDirectionIndicator(button, direction) {
    return showStackDirectionIndicatorImpl(this, button, direction)
  }

  updateMobileDragHover(event, detail) {
    return updateMobileDragHoverImpl(this, event, detail)
  }

  applyMobileEdgeScroll(event, gameCanvas, rect) {
    return applyMobileEdgeScrollImpl(this, event, gameCanvas, rect)
  }
}
