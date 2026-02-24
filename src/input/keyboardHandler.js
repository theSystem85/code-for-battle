// keyboardHandler.js
import { gameState } from '../gameState.js'
import { TILE_SIZE } from '../config.js'
import { findPathForOwner } from '../units.js'
import { playSound, playPositionalSound } from '../sound.js'
import { HelpSystem } from './helpSystem.js'
import { CheatSystem } from './cheatSystem.js'
import { isInputFieldFocused } from '../utils/inputUtils.js'
import { toggleUnitLogging } from '../utils/logger.js'
import { cancelUnitMovement } from '../game/unifiedMovement.js'
import { handleAltKeyRelease, resetWaypointTracking } from '../game/waypointSounds.js'
import { performanceDialog } from '../ui/performanceDialog.js'
import { runtimeConfigDialog } from '../ui/runtimeConfigDialog.js'
import { GAME_DEFAULT_CURSOR } from './cursorStyles.js'
import { setRemoteControlAction, getRemoteControlActionState } from './remoteControlState.js'
import { broadcastUnitStop } from '../network/gameCommandSync.js'
import { keybindingManager, KEYBINDING_CONTEXTS } from './keybindings.js'
import {
  getPlayableViewportHeight,
  getPlayableViewportWidth
} from '../utils/layoutMetrics.js'
import { notifyBenchmarkManualCameraControl } from '../benchmark/benchmarkTracker.js'
import { gameRandom } from '../utils/gameRandom.js'
import { hasBlockingBuilding } from '../utils/buildingPassability.js'

export class KeyboardHandler {
  constructor() {
    this.controlGroups = {}
    this.lastGroupKeyPressed = null
    this.lastGroupKeyPressTime = 0
    this.doublePressThreshold = 500 // 500ms threshold for double press
    this.groupFormationMode = false
    this.helpSystem = new HelpSystem()
    this.playerFactory = null
    this.cheatSystem = new CheatSystem()
    this.unitCommands = null
    this.requestRenderFrame = null
  }

  setPlayerFactory(factory) {
    this.playerFactory = factory
  }

  setUnitCommands(unitCommands) {
    this.unitCommands = unitCommands
  }

  setRenderScheduler(callback) {
    this.requestRenderFrame = callback
  }

  setupKeyboardEvents(units, selectedUnits, mapGrid, factories) {
    // Store references for use in other methods
    this.selectedUnits = selectedUnits
    this.cheatSystem.setSelectedUnitsRef(selectedUnits)
    this.units = units
    this.mapGrid = mapGrid
    this.factories = factories

    // Track Shift and Alt/Option key states globally
    document.addEventListener('keydown', e => {
      if (e.key === 'Shift') {
        gameState.shiftKeyDown = true
      }
      if (e.key === 'Alt') {
        gameState.altKeyDown = true
        resetWaypointTracking() // Reset tracking when Alt is pressed
      }

      // Enhanced keydown event listener
      // Check if an input field is currently focused
      if (isInputFieldFocused()) {
        // Allow input field events to process normally, don't handle game shortcuts
        return
      }

      const kbContext = this.getKeybindingContext()

      // Some keys should work even when paused
      if (keybindingManager.matchesKeyboardAction(e, 'toggle-help', kbContext)) {
        e.preventDefault()
        e.stopPropagation()
        this.helpSystem.showControlsHelp()
        return
      }

      if (keybindingManager.matchesKeyboardAction(e, 'open-cheats', kbContext) && !gameState.cheatDialogOpen) {
        e.preventDefault()
        e.stopPropagation()
        this.cheatSystem.openDialog()
        return
      }

      if (keybindingManager.matchesKeyboardAction(e, 'open-runtime-config', kbContext) && !gameState.runtimeConfigDialogOpen) {
        e.preventDefault()
        e.stopPropagation()
        runtimeConfigDialog.openDialog()
        return
      }

      // Don't process other inputs if game is paused, cheat dialog is open, or runtime config dialog is open
      if (gameState.paused || gameState.cheatDialogOpen || gameState.runtimeConfigDialogOpen || gameState.helpDialogOpen) return

      // Block game commands in spectator mode, when locally defeated, or when host has paused
      // (allow view-only commands like grid toggle, FPS toggle, camera movement)
      const isSpectatorOrDefeated = gameState.isSpectator || gameState.localPlayerDefeated || gameState.hostPausedByRemote

      // ESC key to cancel attack group mode
      if (keybindingManager.matchesKeyboardAction(e, 'escape', kbContext)) {
        e.preventDefault()
        e.stopPropagation()
        this.handleEscapeKey()
        return
      }

      // View-only commands that work in spectator mode
      if (keybindingManager.matchesKeyboardAction(e, 'toggle-grid', kbContext)) {
        e.preventDefault()
        this.handleGridToggle()
        return
      }
      if (keybindingManager.matchesKeyboardAction(e, 'toggle-occupancy', kbContext)) {
        e.preventDefault()
        this.handleOccupancyMapToggle()
        return
      }
      if (keybindingManager.matchesKeyboardAction(e, 'toggle-dzm', kbContext)) {
        e.preventDefault()
        this.handleDzmToggle()
        return
      }
      if (keybindingManager.matchesKeyboardAction(e, 'toggle-tanks', kbContext)) {
        e.preventDefault()
        this.handleTankImageToggle()
        return
      }
      if (keybindingManager.matchesKeyboardAction(e, 'toggle-fps', kbContext)) {
        e.preventDefault()
        this.handleFpsDisplayToggle()
        return
      }
      if (keybindingManager.matchesKeyboardAction(e, 'toggle-performance', kbContext)) {
        e.preventDefault()
        this.handleFpsDisplayToggle()
        return
      }
      if (keybindingManager.matchesKeyboardAction(e, 'toggle-waypoints', kbContext)) {
        e.preventDefault()
        this.handleWaypointToggle()
        return
      }
      if (keybindingManager.matchesKeyboardAction(e, 'map-edit-toggle', kbContext)) {
        e.preventDefault()
        gameState.mapEditMode = !gameState.mapEditMode
        this.showNotification(`Map edit mode ${gameState.mapEditMode ? 'ON' : 'OFF'}`)
        return
      }

      // Block all game action commands for spectators
      if (isSpectatorOrDefeated) return

      // A key for alert mode
      if (keybindingManager.matchesKeyboardAction(e, 'toggle-alert', kbContext)) {
        e.preventDefault()
        this.handleAlertMode(selectedUnits)
      }
      // S key for sell mode or stop attacking
      else if (keybindingManager.matchesKeyboardAction(e, 'toggle-sell', kbContext)) {
        e.preventDefault()
        this.handleSellMode()
      }
      // R key to toggle repair mode
      else if (keybindingManager.matchesKeyboardAction(e, 'toggle-repair', kbContext)) {
        e.preventDefault()
        this.handleRepairMode()
      }
      // W key to send damaged units to workshop
      else if (keybindingManager.matchesKeyboardAction(e, 'repair-to-workshop', kbContext)) {
        e.preventDefault()
        const queue = e.altKey
        if (this.unitCommands) {
          this.unitCommands.handleWorkshopRepairHotkey(selectedUnits, mapGrid, queue, false)
        }
        if (queue && this.markWaypointsAdded) this.markWaypointsAdded()
      }
      // X key for dodge
      else if (keybindingManager.matchesKeyboardAction(e, 'dodge', kbContext)) {
        e.preventDefault()
        this.handleDodgeCommand(selectedUnits, units, mapGrid)
      }
      // H key to focus on factory
      else if (keybindingManager.matchesKeyboardAction(e, 'focus-factory', kbContext)) {
        e.preventDefault()
        this.handleFactoryFocus(mapGrid)
      }
      // E key to focus on selected unit(s)
      else if (keybindingManager.matchesKeyboardAction(e, 'focus-selection', kbContext)) {
        e.preventDefault()
        if (e.shiftKey || gameState.shiftKeyDown) {
          this.toggleAutoFocus(selectedUnits, mapGrid)
        } else {
          this.handleSelectedUnitFocus(selectedUnits, mapGrid)
        }
      }
      // Control group assignment (ctrl+number)
      else if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        this.handleControlGroupAssignment(e.key, selectedUnits)
      }
      // Control group selection (just number keys 1-9)
      else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        this.handleControlGroupSelection(e.key, units, selectedUnits, mapGrid)
      }
      // F key to toggle formation mode
      else if (keybindingManager.matchesKeyboardAction(e, 'formation', kbContext)) {
        e.preventDefault()
        this.handleFormationToggle(selectedUnits)
      }
      // L key to toggle logging for selected units
      else if (keybindingManager.matchesKeyboardAction(e, 'logging', kbContext)) {
        e.preventDefault()
        this.handleLoggingToggle(selectedUnits)
      }
      // Arrow keys and Space for remote control or map scrolling
      else if (keybindingManager.matchesKeyboardAction(e, 'remote-forward', kbContext)) {
        e.preventDefault()
        if (this.selectedUnits && this.selectedUnits.length > 0) {
          if (!getRemoteControlActionState('forward')) {
            window.logger('Remote control: up key down')
          }
          setRemoteControlAction('forward', 'keyboard', true)
        } else {
          if (gameState.smoothScroll) {
            gameState.smoothScroll.active = false
          }
          gameState.keyScroll.up = true
          if (gameState.benchmarkActive) {
            notifyBenchmarkManualCameraControl()
          }
          if (this.requestRenderFrame) {
            this.requestRenderFrame()
          }
        }
      } else if (keybindingManager.matchesKeyboardAction(e, 'remote-backward', kbContext)) {
        e.preventDefault()
        if (this.selectedUnits && this.selectedUnits.length > 0) {
          if (!getRemoteControlActionState('backward')) {
            window.logger('Remote control: down key down')
          }
          setRemoteControlAction('backward', 'keyboard', true)
        } else {
          if (gameState.smoothScroll) {
            gameState.smoothScroll.active = false
          }
          gameState.keyScroll.down = true
          if (gameState.benchmarkActive) {
            notifyBenchmarkManualCameraControl()
          }
          if (this.requestRenderFrame) {
            this.requestRenderFrame()
          }
        }
      } else if (keybindingManager.matchesKeyboardAction(e, 'remote-left', kbContext)) {
        e.preventDefault()
        if (this.selectedUnits && this.selectedUnits.length > 0) {
          if (gameState.shiftKeyDown) {
            if (!getRemoteControlActionState('turretLeft')) {
              window.logger('Remote control: turret left key down')
            }
            setRemoteControlAction('turretLeft', 'keyboard', true)
          } else {
            if (!getRemoteControlActionState('turnLeft')) {
              window.logger('Remote control: left key down')
            }
            setRemoteControlAction('turnLeft', 'keyboard', true)
          }
        } else {
          if (gameState.smoothScroll) {
            gameState.smoothScroll.active = false
          }
          gameState.keyScroll.left = true
          if (gameState.benchmarkActive) {
            notifyBenchmarkManualCameraControl()
          }
          if (this.requestRenderFrame) {
            this.requestRenderFrame()
          }
        }
      } else if (keybindingManager.matchesKeyboardAction(e, 'remote-right', kbContext)) {
        e.preventDefault()
        if (this.selectedUnits && this.selectedUnits.length > 0) {
          if (gameState.shiftKeyDown) {
            if (!getRemoteControlActionState('turretRight')) {
              window.logger('Remote control: turret right key down')
            }
            setRemoteControlAction('turretRight', 'keyboard', true)
          } else {
            if (!getRemoteControlActionState('turnRight')) {
              window.logger('Remote control: right key down')
            }
            setRemoteControlAction('turnRight', 'keyboard', true)
          }
        } else {
          if (gameState.smoothScroll) {
            gameState.smoothScroll.active = false
          }
          gameState.keyScroll.right = true
          if (gameState.benchmarkActive) {
            notifyBenchmarkManualCameraControl()
          }
          if (this.requestRenderFrame) {
            this.requestRenderFrame()
          }
        }
      } else if (keybindingManager.matchesKeyboardAction(e, 'remote-fire', kbContext)) {
        e.preventDefault()
        const shiftActive = e.shiftKey || gameState.shiftKeyDown
        if (shiftActive && !e.repeat) {
          const handled = this.handleApacheShiftSpace(this.selectedUnits)
          if (handled) {
            return
          }
        }
        if (!getRemoteControlActionState('fire')) {
          window.logger('Remote control: space pressed')
        }
        setRemoteControlAction('fire', 'keyboard', true)
      }
    })

    document.addEventListener('keyup', e => {
      if (e.key === 'Shift') {
        gameState.shiftKeyDown = false
        // Exit chain build mode when shift released
        if (gameState.chainBuildMode) {
          gameState.chainBuildMode = false
          gameState.chainBuildPrimed = false
        }
      }
      if (e.key === 'Alt') {
        gameState.altKeyDown = false
        handleAltKeyRelease() // Check if waypoints were added and play sound
      }
      const kbContext = this.getKeybindingContext()
      if (keybindingManager.matchesKeyboardAction(e, 'remote-forward', kbContext)) {
        if (this.selectedUnits && this.selectedUnits.length > 0) {
          if (getRemoteControlActionState('forward')) {
            window.logger('Remote control: up key up')
          }
          setRemoteControlAction('forward', 'keyboard', false)
        } else {
          gameState.keyScroll.up = false
          if (this.requestRenderFrame) {
            this.requestRenderFrame()
          }
        }
      } else if (keybindingManager.matchesKeyboardAction(e, 'remote-backward', kbContext)) {
        if (this.selectedUnits && this.selectedUnits.length > 0) {
          if (getRemoteControlActionState('backward')) {
            window.logger('Remote control: down key up')
          }
          setRemoteControlAction('backward', 'keyboard', false)
        } else {
          gameState.keyScroll.down = false
          if (this.requestRenderFrame) {
            this.requestRenderFrame()
          }
        }
      } else if (keybindingManager.matchesKeyboardAction(e, 'remote-left', kbContext)) {
        if (this.selectedUnits && this.selectedUnits.length > 0) {
          if (getRemoteControlActionState('turnLeft') || getRemoteControlActionState('turretLeft')) {
            window.logger('Remote control: left key up')
          }
          setRemoteControlAction('turnLeft', 'keyboard', false)
          setRemoteControlAction('turretLeft', 'keyboard', false)
        } else {
          gameState.keyScroll.left = false
          if (this.requestRenderFrame) {
            this.requestRenderFrame()
          }
        }
      } else if (keybindingManager.matchesKeyboardAction(e, 'remote-right', kbContext)) {
        if (this.selectedUnits && this.selectedUnits.length > 0) {
          if (getRemoteControlActionState('turnRight') || getRemoteControlActionState('turretRight')) {
            window.logger('Remote control: right key up')
          }
          setRemoteControlAction('turnRight', 'keyboard', false)
          setRemoteControlAction('turretRight', 'keyboard', false)
        } else {
          gameState.keyScroll.right = false
          if (this.requestRenderFrame) {
            this.requestRenderFrame()
          }
        }
      } else if (keybindingManager.matchesKeyboardAction(e, 'remote-fire', kbContext)) {
        if (getRemoteControlActionState('fire')) {
          window.logger('Remote control: space released')
        }
        setRemoteControlAction('fire', 'keyboard', false)
      }
    })

    // Bind help button
    const helpBtn = document.getElementById('helpBtn')
    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        this.helpSystem.showControlsHelp()
      })
    }

    // Bind performance widget toggle button
    const performanceWidgetBtn = document.getElementById('performanceWidgetBtn')
    if (performanceWidgetBtn) {
      performanceWidgetBtn.addEventListener('click', () => {
        this.handleFpsDisplayToggle()
      })
    }
  }

  setMouseHandler(mouseHandler) {
    this.mouseHandler = mouseHandler
  }

  getKeybindingContext() {
    if (gameState.mapEditMode) return KEYBINDING_CONTEXTS.MAP_EDIT_ON
    return KEYBINDING_CONTEXTS.MAP_EDIT_OFF
  }

  handleEscapeKey() {
    let modeWasCanceled = false

    // Cancel attack group mode if active
    if (gameState.attackGroupMode && this.mouseHandler) {
      this.mouseHandler.resetAttackGroupState()
      modeWasCanceled = true
    }

    // Cancel any other active modes
    if (gameState.buildingPlacementMode) {
      gameState.buildingPlacementMode = false
      gameState.selectedBuilding = null
      modeWasCanceled = true
    }

    if (gameState.repairMode) {
      gameState.repairMode = false
      const repairBtn = document.getElementById('repairBtn')
      if (repairBtn) repairBtn.classList.remove('active')
      modeWasCanceled = true
    }

    if (gameState.sellMode) {
      gameState.sellMode = false
      const sellBtn = document.getElementById('sellBtn')
      if (sellBtn) sellBtn.classList.remove('active')
      modeWasCanceled = true
    }

    // Deselect any selected factories or buildings (clear all selections)
    let hadSelections = false
    if (this.selectedUnits && this.selectedUnits.length > 0) {
      hadSelections = true
      // Clear unit selections
      if (this.units) {
        this.units.forEach(unit => { if (unit.owner === gameState.humanPlayer) unit.selected = false })
      }

      // Clear factory selections
      if (this.factories) {
        this.factories.forEach(factory => factory.selected = false)
      }

      // Clear building selections
      if (gameState.buildings) {
        gameState.buildings.forEach(building => { if (building.owner === gameState.humanPlayer) building.selected = false })
      }

      // Clear selectedUnits array
      this.selectedUnits.length = 0

      // Update AGF capability after clearing selections
      if (this.mouseHandler) {
        this.mouseHandler.updateAGFCapability(this.selectedUnits)
      }

      modeWasCanceled = true
    }

    if (modeWasCanceled) {
      const message = hadSelections ? 'Selection cleared' : 'Mode cancelled'
      this.showNotification(message, 1000)
    }
  }

  handleAlertMode(selectedUnits) {
    // Toggle alert mode on selected units that support it.
    const alertEligibleTypes = new Set(['tank-v2', 'ambulance', 'tankerTruck', 'recoveryTank'])
    let eligibleCount = 0
    let toggledCount = 0
    let newStatus = null

    selectedUnits.forEach(unit => {
      if (alertEligibleTypes.has(unit.type)) {
        eligibleCount++
        unit.alertMode = !unit.alertMode
        toggledCount++
        newStatus = unit.alertMode
      }
    })

    if (eligibleCount === 0) {
      this.showNotification('Alert mode is available for Tank V2, Ambulance, Tanker Truck and Recovery Tank units.', 2000)
      return
    }

    if (toggledCount > 0 && newStatus !== null) {
      const modeStatus = newStatus ? 'ON' : 'OFF'
      this.showNotification(`Alert mode ${modeStatus} for ${toggledCount} unit(s)`, 2000)
      playSound('unitSelection')
    }
  }

  handleSellMode() {
    // If units are selected, stop their attacks instead of toggling sell mode
    if (this.selectedUnits && this.selectedUnits.length > 0) {
      this.handleStopAttacking()
      return
    }

    const gameCanvas = document.getElementById('gameCanvas')

    // If not in sell mode, toggle it
    if (!gameState.sellMode) {
      // Toggle sell mode
      gameState.sellMode = !gameState.sellMode

      // Deactivate repair mode if it's on
      if (gameState.repairMode) {
        gameState.repairMode = false
        const repairBtn = document.getElementById('repairBtn')
        if (repairBtn) {
          repairBtn.classList.remove('active')
        }
      }

      // Update the sell button UI
      const sellBtn = document.getElementById('sellBtn')
      if (sellBtn) {
        sellBtn.classList.add('active')
        gameState.sellMode = true

        // Use CSS class for sell cursor - this ensures consistent usage of sell.svg
        gameCanvas.style.cursor = GAME_DEFAULT_CURSOR
        gameCanvas.classList.add('sell-mode')

        // Show notification
        this.showNotification('Sell mode activated - Click on a building to sell it for 70% of build price', 3000)
      }
    } else {
      // Turn off sell mode
      gameState.sellMode = false
      const sellBtn = document.getElementById('sellBtn')
      if (sellBtn) {
        sellBtn.classList.remove('active')
      }

      // Reset cursor and remove sell mode classes
      gameCanvas.style.cursor = GAME_DEFAULT_CURSOR
      gameCanvas.classList.remove('sell-mode', 'sell-blocked-mode')

      // Show notification
      this.showNotification('Sell mode deactivated', 2000)
    }
  }

  handleRepairMode() {
    const gameCanvas = document.getElementById('gameCanvas')
    const repairBtn = document.getElementById('repairBtn')

    if (!gameState.repairMode) {
      gameState.repairMode = true

      // Deactivate sell mode if it's active
      if (gameState.sellMode) {
        gameState.sellMode = false
        const sellBtn = document.getElementById('sellBtn')
        if (sellBtn) sellBtn.classList.remove('active')
        gameCanvas.classList.remove('sell-mode', 'sell-blocked-mode')
      }

      if (repairBtn) repairBtn.classList.add('active')
      this.showNotification('Repair mode activated. Click on a building to repair it.')
      gameCanvas.classList.add('repair-mode')
    } else {
      gameState.repairMode = false
      if (repairBtn) repairBtn.classList.remove('active')
      gameCanvas.classList.remove('repair-mode', 'repair-blocked-mode')
      gameCanvas.style.cursor = GAME_DEFAULT_CURSOR
      this.showNotification('Repair mode deactivated.')
    }
  }

  handleApacheShiftSpace(selectedUnits) {
    if (!Array.isArray(selectedUnits) || selectedUnits.length === 0) {
      return false
    }

    const apaches = selectedUnits.filter(unit => unit && unit.type === 'apache')
    if (apaches.length === 0) {
      return false
    }

    let toggled = false
    apaches.forEach(unit => {
      if (!unit) return
      toggled = true
      unit.path = []
      unit.moveTarget = null
      unit.flightPlan = null
      unit.helipadLandingRequested = false
      unit.remoteControlActive = true
      if (unit.flightState === 'grounded') {
        unit.manualFlightState = 'takeoff'
        unit.manualFlightHoverRequested = true
        unit.autoHoldAltitude = true
      } else {
        unit.manualFlightState = 'land'
        unit.manualFlightHoverRequested = false
        unit.autoHoldAltitude = false
      }
    })

    if (toggled) {
      const avgX = apaches.reduce((sum, unit) => sum + (unit?.x || 0), 0) / apaches.length
      const avgY = apaches.reduce((sum, unit) => sum + (unit?.y || 0), 0) / apaches.length
      playPositionalSound('movement', avgX, avgY, 0.5)
    }

    return toggled
  }

  handleDodgeCommand(selectedUnits, units, mapGrid) {
    if (selectedUnits.length === 0) {
      this.showNotification('No units selected for dodge command', 2000)
      return
    }

    let dodgeSuccessCount = 0

    // Make all selected units try to dodge by moving one tile forward or backward
    selectedUnits.forEach(unit => {
      // Get current tile coordinates
      const tileX = Math.floor(unit.x / TILE_SIZE)
      const tileY = Math.floor(unit.y / TILE_SIZE)

      // Determine unit's facing direction (use movement direction if available, otherwise use last direction)
      let facingAngle = 0

      // Use movement direction if unit is moving
      if (unit.movement && unit.movement.isMoving && (unit.movement.velocity.x !== 0 || unit.movement.velocity.y !== 0)) {
        facingAngle = Math.atan2(unit.movement.velocity.y, unit.movement.velocity.x)
      }
      // Use target rotation if available
      else if (unit.movement && unit.movement.targetRotation !== undefined) {
        facingAngle = unit.movement.targetRotation
      }
      // Use stored rotation if available
      else if (unit.rotation !== undefined) {
        facingAngle = unit.rotation
      }
      // Use path direction if unit has a path
      else if (unit.path && unit.path.length > 0) {
        const nextTile = unit.path[0]
        const dx = nextTile.x * TILE_SIZE - unit.x
        const dy = nextTile.y * TILE_SIZE - unit.y
        facingAngle = Math.atan2(dy, dx)
      }

      // Calculate forward and backward positions (one tile away)
      const forwardX = Math.round(tileX + Math.cos(facingAngle))
      const forwardY = Math.round(tileY + Math.sin(facingAngle))
      const backwardX = Math.round(tileX - Math.cos(facingAngle))
      const backwardY = Math.round(tileY - Math.sin(facingAngle))

      // Check if forward position is valid
      const isForwardValid = this.isValidDodgePosition(forwardX, forwardY, mapGrid, units)

      // Check if backward position is valid
      const isBackwardValid = this.isValidDodgePosition(backwardX, backwardY, mapGrid, units)

      let dodgeTarget = null

      // Apply dodge logic based on requirements
      if (isForwardValid && isBackwardValid) {
        // Both are free - random decision
        dodgeTarget = gameRandom() < 0.5
          ? { x: forwardX, y: forwardY }
          : { x: backwardX, y: backwardY }
      } else if (isForwardValid && !isBackwardValid) {
        // Only forward is free
        dodgeTarget = { x: forwardX, y: forwardY }
      } else if (!isForwardValid && isBackwardValid) {
        // Only backward is free
        dodgeTarget = { x: backwardX, y: backwardY }
      }
      // If both are blocked, do not dodge (dodgeTarget remains null)

      if (dodgeTarget) {
        // Store current path and target for restoration after dodge
        unit.originalPath = unit.path ? [...unit.path] : []
        unit.originalTarget = unit.target
        unit.isDodging = true
        unit.dodgeEndTime = performance.now() + 3000 // Dodge lasts up to 3 seconds

        // Compute a new path to the dodge destination
        const newPath = findPathForOwner(
          { x: tileX, y: tileY },
          dodgeTarget,
          mapGrid,
          null,
          unit.owner
        )
        if (newPath.length > 1) {
          unit.path = newPath.slice(1)
          dodgeSuccessCount++
        }
      }
    })

    // Show feedback to user
    if (dodgeSuccessCount > 0) {
      const message = dodgeSuccessCount === 1
        ? 'Unit dodging!'
        : `${dodgeSuccessCount} units dodging!`
      this.showNotification(message, 1500)
      const avgX = selectedUnits.reduce((sum, u) => sum + u.x, 0) / selectedUnits.length
      const avgY = selectedUnits.reduce((sum, u) => sum + u.y, 0) / selectedUnits.length
      playPositionalSound('movement', avgX, avgY, 0.3)
    } else {
      this.showNotification('Unable to dodge - no clear path available', 2000)
    }
  }

  // Helper method to check if a position is valid for dodging
  isValidDodgePosition(x, y, mapGrid, units) {
    // Check boundaries
    if (x < 0 || x >= mapGrid[0].length || y < 0 || y >= mapGrid.length) {
      return false
    }

    // Check tile type and buildings
    const tile = mapGrid[y][x]
    if (tile.type === 'water' || tile.type === 'rock' || tile.seedCrystal || hasBlockingBuilding(tile)) {
      return false
    }

    // Check if any unit occupies this tile
    const occupied = units.some(u =>
      Math.floor(u.x / TILE_SIZE) === x && Math.floor(u.y / TILE_SIZE) === y
    )

    return !occupied
  }

  handleFactoryFocus(mapGrid) {
    if (this.playerFactory) {
      const gameCanvas = document.getElementById('gameCanvas')
      // Calculate factory center
      const factoryX = (this.playerFactory.x + this.playerFactory.width / 2) * TILE_SIZE
      const factoryY = (this.playerFactory.y + this.playerFactory.height / 2) * TILE_SIZE

      // Center the view on the factory
      const viewportWidth = getPlayableViewportWidth(gameCanvas)
      const viewportHeight = getPlayableViewportHeight(gameCanvas)
      gameState.scrollOffset.x = Math.max(0, Math.min(factoryX - viewportWidth / 2,
        mapGrid[0].length * TILE_SIZE - viewportWidth))
      gameState.scrollOffset.y = Math.max(0, Math.min(factoryY - viewportHeight / 2,
        mapGrid.length * TILE_SIZE - viewportHeight))
      gameState.dragVelocity = { x: 0, y: 0 }
      playSound('unitSelection')
      if (this.requestRenderFrame) {
        this.requestRenderFrame()
      }
    }
  }

  handleSelectedUnitFocus(selectedUnits, mapGrid) {
    if (!selectedUnits || selectedUnits.length === 0) return

    const gameCanvas = document.getElementById('gameCanvas')

    // Get device pixel ratio to account for Retina displays
    const logicalCanvasWidth = getPlayableViewportWidth(gameCanvas)
    const logicalCanvasHeight = getPlayableViewportHeight(gameCanvas)

    let focusX, focusY

    if (selectedUnits.length === 1) {
      focusX = selectedUnits[0].x
      focusY = selectedUnits[0].y
    } else {
      // Average position of all selected units
      focusX = selectedUnits.reduce((sum, u) => sum + u.x, 0) / selectedUnits.length
      focusY = selectedUnits.reduce((sum, u) => sum + u.y, 0) / selectedUnits.length
    }

    gameState.scrollOffset.x = Math.max(0, Math.min(
      focusX - logicalCanvasWidth / 2,
      mapGrid[0].length * TILE_SIZE - logicalCanvasWidth
    ))

    gameState.scrollOffset.y = Math.max(0, Math.min(
      focusY - logicalCanvasHeight / 2,
      mapGrid.length * TILE_SIZE - logicalCanvasHeight
    ))

    gameState.dragVelocity = { x: 0, y: 0 }

    playSound('confirmed')
    if (this.requestRenderFrame) {
      this.requestRenderFrame()
    }
  }

  toggleAutoFocus(selectedUnits, mapGrid) {
    if (
      gameState.cameraFollowUnitId &&
      selectedUnits.length === 1 &&
      selectedUnits[0].id === gameState.cameraFollowUnitId
    ) {
      gameState.cameraFollowUnitId = null
      return
    }

    if (selectedUnits.length === 1) {
      gameState.cameraFollowUnitId = selectedUnits[0].id
      this.handleSelectedUnitFocus(selectedUnits, mapGrid)
    } else {
      gameState.cameraFollowUnitId = null
    }
  }

  handleControlGroupAssignment(groupNum, selectedUnits) {

    if (selectedUnits.length > 0) {
      // Only store units, not factories
      const onlyUnits = selectedUnits.filter(unit => unit.type !== 'factory' && unit.owner === gameState.humanPlayer)

      if (onlyUnits.length > 0) {
        // Store references to the units and assign group number to each
        this.controlGroups[groupNum] = [...onlyUnits]
        onlyUnits.forEach(unit => {
          unit.groupNumber = groupNum
        })
        playSound('unitSelection')

        // Visual feedback
        this.showNotification(`Group ${groupNum} assigned`, 2000)
      }
    }
  }

  handleControlGroupSelection(groupNum, units, selectedUnits, mapGrid) {

    // Check if we have units in this control group
    if (this.controlGroups[groupNum] && Array.isArray(this.controlGroups[groupNum]) && this.controlGroups[groupNum].length > 0) {

      // Clear current selection
      units.forEach(u => { if (u.owner === gameState.humanPlayer) u.selected = false })
      const factories = gameState.factories || []
      factories.forEach(f => f.selected = false)
      selectedUnits.length = 0

      // Select all units in the control group that are still alive
      const aliveUnits = this.controlGroups[groupNum].filter(unit =>
        unit && // unit exists
        typeof unit === 'object' && // is an object
        units.includes(unit) && // is in the game units array
        unit.health > 0 && // is alive
        unit.owner === gameState.humanPlayer // belongs to player (safety check)
      )

      // Update the control group to only include alive units
      this.controlGroups[groupNum] = aliveUnits

      if (aliveUnits.length > 0) {
        aliveUnits.forEach(unit => {
          unit.selected = true
          selectedUnits.push(unit)
        })

        // Check if this is a double press of the same key within the threshold time
        const currentTime = performance.now()
        const isDoublePress = this.lastGroupKeyPressed === groupNum &&
                             (currentTime - this.lastGroupKeyPressTime) < this.doublePressThreshold

        // Only center view on double press, not on single press
        if (isDoublePress) {
          // Center view on the middle unit of the group with fix for Retina displays
          const middleUnit = aliveUnits[Math.floor(aliveUnits.length / 2)]
          const gameCanvas = document.getElementById('gameCanvas')

          // Get device pixel ratio to account for Retina displays
          const logicalCanvasWidth = getPlayableViewportWidth(gameCanvas)
          const logicalCanvasHeight = getPlayableViewportHeight(gameCanvas)

          // Center properly accounting for the device pixel ratio
          gameState.scrollOffset.x = Math.max(0, Math.min(
            middleUnit.x - (logicalCanvasWidth / 2),
            mapGrid[0].length * TILE_SIZE - logicalCanvasWidth
          ))

          gameState.scrollOffset.y = Math.max(0, Math.min(
            middleUnit.y - (logicalCanvasHeight / 2),
            mapGrid.length * TILE_SIZE - logicalCanvasHeight
          ))

          // Play a sound for feedback on focus action
          playSound('confirmed')
          if (this.requestRenderFrame) {
            this.requestRenderFrame()
          }
        }

        // Update the last key press time and key
        this.lastGroupKeyPressed = groupNum
        this.lastGroupKeyPressTime = currentTime

        // Play selection sounds
        playSound('unitSelection')
      }
    }
  }

  handleFormationToggle(selectedUnits) {
    this.groupFormationMode = !this.groupFormationMode

    // Toggle formationActive for selected units with a group number
    const groupedUnits = selectedUnits.filter(unit => unit.groupNumber)
    if (groupedUnits.length > 0) {
      // Find the center of the formation
      const centerX = groupedUnits.reduce((sum, unit) => sum + unit.x, 0) / groupedUnits.length
      const centerY = groupedUnits.reduce((sum, unit) => sum + unit.y, 0) / groupedUnits.length

      // Store relative positions for each unit
      groupedUnits.forEach(unit => {
        unit.formationActive = this.groupFormationMode
        if (this.groupFormationMode) {
          // Store the relative position from center when formation is activated
          unit.formationOffset = {
            x: unit.x - centerX,
            y: unit.y - centerY
          }
        } else {
          // Clear formation data when deactivated
          unit.formationOffset = null
        }
      })
    }
  }

  handleGridToggle() {
    // Toggle grid visibility
    gameState.gridVisible = !gameState.gridVisible
    // Play a sound for feedback
    playSound('confirmed', 0.5)
  }

  handleOccupancyMapToggle() {
    const modes = this.getOccupancyViewModes()
    if (modes.length === 0) return

    const nextIndex = (gameState.occupancyMapViewIndex + 1) % modes.length
    const mode = modes[nextIndex]
    gameState.occupancyMapViewIndex = nextIndex
    gameState.occupancyMapViewMode = mode
    const enabled = mode !== 'off'
    gameState.occupancyVisible = enabled

    const label = this.formatOccupancyModeLabel(mode)
    this.showNotification(`Occupancy map: ${label}`, 2000)
    playSound('confirmed', 0.5)
  }

  getOccupancyViewModes() {
    const configuredPlayers = Math.max(1, gameState.playerCount || 1)
    const playerIds = ['player1', 'player2', 'player3', 'player4'].slice(0, Math.min(4, configuredPlayers))
    return ['off', 'players', ...playerIds]
  }

  formatOccupancyModeLabel(mode) {
    if (mode === 'off') return 'OFF'
    if (mode === 'players') return 'Players'
    if (mode && mode.startsWith('player')) {
      const number = mode.replace('player', '')
      return `Player ${number || 'Unknown'}`
    }
    return mode
  }

  handleDzmToggle() {
    const ids = Object.keys(gameState.dangerZoneMaps || {})
    if (ids.length === 0) return
    if (gameState.dzmOverlayIndex === -1) {
      gameState.dzmOverlayIndex = 0
    } else {
      gameState.dzmOverlayIndex++
      if (gameState.dzmOverlayIndex >= ids.length) {
        gameState.dzmOverlayIndex = -1
        this.showNotification('Danger zone map: OFF', 2000)
        playSound('confirmed', 0.5)
        return
      }
    }
    const pid = ids[gameState.dzmOverlayIndex]
    this.showNotification(`Danger zone map: ${pid}`, 2000)
    playSound('confirmed', 0.5)
  }

  handleTankImageToggle() {
    // Toggle tank image rendering
    gameState.useTankImages = !gameState.useTankImages

    // Show notification to user
    const status = gameState.useTankImages ? 'ON' : 'OFF'
    this.showNotification(`Tank image rendering: ${status}`, 2000)

    // Play a sound for feedback
    playSound('confirmed', 0.5)
  }

  handleTurretImageToggle() {
    // Toggle turret image rendering
    gameState.useTurretImages = !gameState.useTurretImages

    // Show notification to user
    const status = gameState.useTurretImages ? 'ON' : 'OFF'
    this.showNotification(`Turret image rendering: ${status}`, 2000)

    // Play a sound for feedback
    playSound('confirmed', 0.5)
  }

  handleFpsDisplayToggle() {
    // Toggle FPS display visibility
    gameState.fpsVisible = !gameState.fpsVisible

    // Update the display immediately
    const fpsElement = document.getElementById('fpsDisplay')
    if (fpsElement) {
      if (gameState.fpsVisible) {
        fpsElement.classList.add('visible')
      } else {
        fpsElement.classList.remove('visible')
      }
    }

    // Show notification to user
    const status = gameState.fpsVisible ? 'ON' : 'OFF'
    this.showNotification(`FPS display: ${status}`, 2000)

    // Play a sound for feedback
    playSound('confirmed', 0.5)
  }

  handlePerformanceToggle() {
    performanceDialog.toggle()
    const status = gameState.performanceVisible ? 'ON' : 'OFF'
    this.showNotification(`Performance stats: ${status}`, 2000)
    playSound('confirmed', 0.5)
  }

  handleWaypointToggle() {
    gameState.moveWaypointsVisible = !gameState.moveWaypointsVisible
    const status = gameState.moveWaypointsVisible ? 'ON' : 'OFF'
    this.showNotification(`Movement waypoints: ${status}`, 2000)
    playSound('confirmed', 0.5)
  }

  handleLoggingToggle(selectedUnits) {
    if (!selectedUnits || selectedUnits.length === 0) return

    selectedUnits.forEach(unit => {
      toggleUnitLogging(unit)
    })

    const status = selectedUnits[0].loggingEnabled ? 'ON' : 'OFF'
    this.showNotification(`Unit logging: ${status}`, 2000)
    playSound('confirmed', 0.5)
  }

  // Add method to access cheat system for damage prevention
  getCheatSystem() {
    return this.cheatSystem
  }

  // Method to update new units with god mode if enabled
  updateNewUnitForCheat(unit) {
    this.cheatSystem.updateNewUnit(unit)
  }

  // Method to clean up destroyed units from cheat tracking
  cleanupDestroyedUnitFromCheat(unitId) {
    this.cheatSystem.cleanupDestroyedUnit(unitId)
  }

  // Rebuild control groups from units after loading a save game
  rebuildControlGroupsFromUnits(units) {
    this.controlGroups = {}
    if (!Array.isArray(units)) return
    units.forEach(unit => {
      if (unit && unit.groupNumber) {
        if (!this.controlGroups[unit.groupNumber]) {
          this.controlGroups[unit.groupNumber] = []
        }
        this.controlGroups[unit.groupNumber].push(unit)
      }
    })
  }

  handleStopAttacking() {
    if (!this.selectedUnits || this.selectedUnits.length === 0) {
      this.showNotification('No units selected to stop attacking', 2000)
      return
    }

    let stoppedCount = 0
    const unitsToStop = []

    // Stop attacking for all selected units or buildings
    this.selectedUnits.forEach(unit => {
      if (unit.isBuilding) {
        unit.forcedAttackTarget = null
        unit.forcedAttackQueue = []
        unit.forcedAttack = false
        unit.holdFire = true
        stoppedCount++
        return
      }
      // Clear current attack target
      if (unit.target) {
        unit.target = null
        stoppedCount++
      }

      // End any dodge behaviour
      if (unit.isDodging) {
        unit.isDodging = false
        unit.dodgeEndTime = null
        unit.originalPath = null
        unit.originalTarget = null
      }

      // Stop ongoing movement but allow natural deceleration
      cancelUnitMovement(unit)

      // Clear attack queue if it exists
      if (unit.attackQueue) {
        unit.attackQueue = []
      }

      // Clear any attack group targets
      if (unit.attackGroupTargets) {
        unit.attackGroupTargets = []
      }

      // Track units owned by this player for network sync
      if (unit.owner === gameState.humanPlayer) {
        unitsToStop.push(unit)
      }
    })

    // Broadcast stop command to host in multiplayer
    if (unitsToStop.length > 0) {
      broadcastUnitStop(unitsToStop)
    }

    if (stoppedCount > 0) {
      this.showNotification(`${stoppedCount} unit${stoppedCount > 1 ? 's' : ''} stopped attacking`, 2000)
    } else {
      this.showNotification('Selected units were not attacking', 2000)
    }
  }

  showNotification(message, duration = 2000) {
    const notificationDiv = document.createElement('div')
    notificationDiv.textContent = message
    notificationDiv.style.position = 'absolute'
    notificationDiv.style.left = '50%'
    notificationDiv.style.bottom = '10%'
    notificationDiv.style.transform = 'translateX(-50%)'
    notificationDiv.style.backgroundColor = 'rgba(0,0,0,0.7)'
    notificationDiv.style.color = 'white'
    notificationDiv.style.padding = '8px 16px'
    notificationDiv.style.borderRadius = '4px'
    notificationDiv.style.zIndex = '1000'
    document.body.appendChild(notificationDiv)

    // Remove the message after specified duration
    setTimeout(() => {
      if (document.body.contains(notificationDiv)) {
        document.body.removeChild(notificationDiv)
      }
    }, duration)
  }
}
