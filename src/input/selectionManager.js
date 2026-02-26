// selectionManager.js
import { TILE_SIZE, ENABLE_ENEMY_SELECTION, ENABLE_ENEMY_CONTROL } from '../config.js'
import { gameState } from '../gameState.js'
import { playSound } from '../sound.js'
import { showNotification } from '../ui/notifications.js'
import { hideLlmQueueTooltip, updateLlmQueueTooltipForSelection } from '../ui/llmQueueTooltip.js'
import {
  getPlayableViewportHeight,
  getPlayableViewportWidth
} from '../utils/layoutMetrics.js'

export function getUnitSelectionCenter(unit) {
  const centerX = unit.x + TILE_SIZE / 2
  let centerY = unit.y + TILE_SIZE / 2

  if (unit.type === 'apache' || unit.type === 'f22Raptor') {
    const altitudeLift = (unit.altitude || 0) * 0.4
    centerY -= altitudeLift
  }

  return { centerX, centerY }
}

export class SelectionManager {
  constructor() {
    this.lastClickTime = 0
    this.lastClickedUnit = null
    this.doubleClickThreshold = 300 // milliseconds
  }

  clearWreckSelection() {
    gameState.selectedWreckId = null
  }

  // Helper method to clear attack group targets when selection changes
  clearAttackGroupTargets() {
    if (gameState.attackGroupTargets && gameState.attackGroupTargets.length > 0) {
      gameState.attackGroupTargets = []
    }
  }

  // Helper function to get the human player ID
  getHumanPlayer() {
    return gameState.humanPlayer || 'player1'
  }

  // Helper function to check if a unit belongs to the human player
  isHumanPlayerUnit(unit) {
    const humanPlayer = this.getHumanPlayer()
    return unit.owner === humanPlayer || (humanPlayer === 'player1' && unit.owner === 'player')
  }

  // Determine if a unit can be selected based on configuration
  isSelectableUnit(unit) {
    if (this.isHumanPlayerUnit(unit)) {
      return unit.health > 0
    }
    if (ENABLE_ENEMY_SELECTION || ENABLE_ENEMY_CONTROL) {
      return unit.health > 0
    }
    return false
  }

  // Determine if a unit can receive commands
  isCommandableUnit(unit) {
    return this.isHumanPlayerUnit(unit) || ENABLE_ENEMY_CONTROL
  }

  // Helper function to check if a building belongs to the human player
  isHumanPlayerBuilding(building) {
    const humanPlayer = this.getHumanPlayer()
    return building.owner === humanPlayer || (humanPlayer === 'player1' && building.owner === 'player')
  }

  handleUnitSelection(clickedUnit, e, units, factories, selectedUnits) {
    hideLlmQueueTooltip()
    this.clearWreckSelection()
    const currentTime = performance.now()
    const isDoubleClick = this.lastClickedUnit === clickedUnit &&
                          (currentTime - this.lastClickTime) < this.doubleClickThreshold

    if (e.shiftKey && !isDoubleClick) {
      // Shift+single click: Add/remove unit to/from current selection
      if (clickedUnit.selected) {
        // Remove from selection
        clickedUnit.selected = false
        const index = selectedUnits.indexOf(clickedUnit)
        if (index > -1) {
          selectedUnits.splice(index, 1)
        }
      } else {
        // Add to selection
        clickedUnit.selected = true
        selectedUnits.push(clickedUnit)
      }
      if (this.isCommandableUnit(clickedUnit)) {
        playSound('unitSelection')
      }
    } else if (e.shiftKey && isDoubleClick) {
      // Shift+double click: Add all visible units of this type (same owner) to selection
      const gameCanvas = document.getElementById('gameCanvas')
      const canvasWidth = getPlayableViewportWidth(gameCanvas)
      const canvasHeight = getPlayableViewportHeight(gameCanvas)

      // Only select units of the same type AND same owner as the clicked unit
      const visibleUnitsOfType = this.getVisibleUnitsOfType(clickedUnit.type, units, gameState.scrollOffset, canvasWidth, canvasHeight, clickedUnit.owner)

      visibleUnitsOfType.forEach(unit => {
        if (!unit.selected) {
          unit.selected = true
          selectedUnits.push(unit)
        }
      })

      if (visibleUnitsOfType.some(u => this.isCommandableUnit(u))) {
        playSound('unitSelection')
      }
      showNotification(`Added ${visibleUnitsOfType.length} ${clickedUnit.type}(s) to selection`)
    } else if (isDoubleClick) {
      // Double click: Select all visible units of this type (same owner)
      const gameCanvas = document.getElementById('gameCanvas')
      const canvasWidth = getPlayableViewportWidth(gameCanvas)
      const canvasHeight = getPlayableViewportHeight(gameCanvas)

      // Clear current selection
      units.forEach(u => { if (this.isSelectableUnit(u)) u.selected = false })
      factories.forEach(f => f.selected = false)
      selectedUnits.length = 0

      // Clear attack group targets when selection changes
      this.clearAttackGroupTargets()

      // Select all visible units of this type AND same owner as the clicked unit
      const visibleUnitsOfType = this.getVisibleUnitsOfType(clickedUnit.type, units, gameState.scrollOffset, canvasWidth, canvasHeight, clickedUnit.owner)

      visibleUnitsOfType.forEach(unit => {
        unit.selected = true
        selectedUnits.push(unit)
      })

      if (visibleUnitsOfType.some(u => this.isCommandableUnit(u))) {
        playSound('unitSelection')
      }
      showNotification(`Selected ${visibleUnitsOfType.length} ${clickedUnit.type}(s)`)
    } else {
      // Normal single click: Select only this unit
      units.forEach(u => { if (this.isSelectableUnit(u)) u.selected = false })
      factories.forEach(f => f.selected = false) // Clear factory selections too
      selectedUnits.length = 0

      // Clear attack group targets when selection changes
      this.clearAttackGroupTargets()

      clickedUnit.selected = true
      selectedUnits.push(clickedUnit)
      if (this.isCommandableUnit(clickedUnit)) {
        playSound('unitSelection')
      }
    }

    // Update double-click tracking
    this.lastClickTime = currentTime
    this.lastClickedUnit = clickedUnit
  }

  handleFactorySelection(selectedFactory, e, units, selectedUnits) {
    hideLlmQueueTooltip()
    this.clearWreckSelection()
    if (e.shiftKey) {
      // Shift+click on factory: Add/remove factory to/from current selection
      if (selectedFactory.selected) {
        // Remove from selection
        selectedFactory.selected = false
        const index = selectedUnits.indexOf(selectedFactory)
        if (index > -1) {
          selectedUnits.splice(index, 1)
        }
      } else {
        // Add to selection
        selectedFactory.selected = true
        selectedUnits.push(selectedFactory)
      }
      // No sound for building selection
    } else {
      // Normal click: Clear existing selection and select factory
      units.forEach(u => { if (this.isSelectableUnit(u)) u.selected = false })
      selectedUnits.length = 0

      // Clear factory selections
      const factories = gameState.factories || []
      factories.forEach(f => f.selected = false)

      // Clear attack group targets when selection changes
      this.clearAttackGroupTargets()

      // Select factory
      selectedFactory.selected = true
      selectedUnits.push(selectedFactory)
      // No sound for building selection
    }

    // Update LLM tooltip if enemy factory selected
    updateLlmQueueTooltipForSelection()
  }

  handleBuildingSelection(selectedBuilding, e, units, selectedUnits) {
    hideLlmQueueTooltip()
    this.clearWreckSelection()
    if (e.shiftKey) {
      // Shift+click on building: Add/remove building to/from current selection
      if (selectedBuilding.selected) {
        // Remove from selection
        selectedBuilding.selected = false
        const index = selectedUnits.indexOf(selectedBuilding)
        if (index > -1) {
          selectedUnits.splice(index, 1)
        }
      } else {
        // Add to selection
        selectedBuilding.selected = true
        selectedUnits.push(selectedBuilding)
      }
      // No sound for building selection
    } else {
      // Normal click: Clear existing selection and select building
      units.forEach(u => { if (this.isSelectableUnit(u)) u.selected = false })
      selectedUnits.length = 0

      // Clear factory selections
      const factories = gameState.factories || []
      factories.forEach(f => f.selected = false)

      // Clear any other building selections
      if (gameState.buildings) {
        gameState.buildings.forEach(b => { b.selected = false })
      }

      // Clear attack group targets when selection changes
      this.clearAttackGroupTargets()

      // Select building
      selectedBuilding.selected = true
      selectedUnits.push(selectedBuilding)
      // No sound for building selection
    }

    // Update LLM tooltip if enemy construction yard selected
    updateLlmQueueTooltipForSelection()
  }

  handleBoundingBoxSelection(units, factories, selectedUnits, selectionStart, selectionEnd) {
    try {
      this.clearWreckSelection()
      const x1 = Math.min(selectionStart.x, selectionEnd.x)
      const y1 = Math.min(selectionStart.y, selectionEnd.y)
      const x2 = Math.max(selectionStart.x, selectionEnd.x)
      const y2 = Math.max(selectionStart.y, selectionEnd.y)

      // Clear current selection first
      selectedUnits.length = 0

      // Clear attack group targets when selection changes
      this.clearAttackGroupTargets()

      // Clear any factory selections
      if (factories) {
        factories.forEach(factory => {
          factory.selected = false
        })
      }

      // Find units within selection rectangle
      let anySelected = false
      for (const unit of units) {
        if (this.isSelectableUnit(unit) && unit.health > 0) {
          const { centerX, centerY } = getUnitSelectionCenter(unit)

          if (centerX >= x1 && centerX <= x2 && centerY >= y1 && centerY <= y2) {
            unit.selected = true
            selectedUnits.push(unit)
            anySelected = true
          } else {
            unit.selected = false
          }
        }
      }

      if (anySelected && selectedUnits.some(u => this.isCommandableUnit(u))) {
        playSound('unitSelection')
      }

      // Clear building selections but don't select buildings during drag selection
      // Buildings can only be selected by direct clicking, not by drag selection
      if (gameState.buildings && gameState.buildings.length > 0) {
        for (const building of gameState.buildings) {
          building.selected = false
        }
      }
    } catch (error) {
      console.error('Error in handleBoundingBoxSelection:', error)
      // Reset selection state in case of error
      selectedUnits.length = 0
    }
  }

  // Function to get all visible units of the same type on screen (same owner)
  getVisibleUnitsOfType(unitType, units, scrollOffset, canvasWidth, canvasHeight, ownerFilter = null) {
    const visibleUnits = []

    for (const unit of units) {
      // Only select units of the same type AND same owner
      const matchesOwner = ownerFilter ? unit.owner === ownerFilter : true
      if (this.isSelectableUnit(unit) && unit.type === unitType && unit.health > 0 && matchesOwner) {
        // Check if unit is visible on screen
        const unitScreenX = unit.x - scrollOffset.x
        const unitScreenY = unit.y - scrollOffset.y

        if (unitScreenX >= -TILE_SIZE && unitScreenX <= canvasWidth + TILE_SIZE &&
            unitScreenY >= -TILE_SIZE && unitScreenY <= canvasHeight + TILE_SIZE) {
          visibleUnits.push(unit)
        }
      }
    }

    return visibleUnits
  }

  selectAllOfType(unitType, units, selectedUnits, ownerFilter = null) {
    // Clear current selection
    units.forEach(u => { if (this.isSelectableUnit(u)) u.selected = false })
    selectedUnits.length = 0

    // Select all units of this type AND same owner
    const unitsOfType = units.filter(unit =>
      this.isSelectableUnit(unit) && unit.type === unitType && unit.health > 0 &&
      (ownerFilter ? unit.owner === ownerFilter : true)
    )

    unitsOfType.forEach(unit => {
      unit.selected = true
      selectedUnits.push(unit)
    })

    return unitsOfType.length
  }

  // Safety function: Call this at the beginning of each frame update
  // to remove any destroyed units from selection
  cleanupDestroyedSelectedUnits(selectedUnits) {
    try {
      // Filter out any invalid or destroyed units
      const validSelectedUnits = selectedUnits.filter(unit =>
        unit && typeof unit === 'object' && unit.health > 0)

      // If we found units to remove, update the array
      if (validSelectedUnits.length !== selectedUnits.length) {
        selectedUnits.length = 0
        selectedUnits.push(...validSelectedUnits)
      }
    } catch (error) {
      console.error('Error in cleanupDestroyedSelectedUnits:', error)
      selectedUnits.length = 0 // Safety reset
    }
  }
}
