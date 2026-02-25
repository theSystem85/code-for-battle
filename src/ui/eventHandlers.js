// eventHandlers.js
// Handle game control and building placement event handlers

import { gameState } from '../gameState.js'
import { productionQueue } from '../productionQueue.js'
import { toggleBackgroundMusic, bgMusicAudio, setMasterVolume, getMasterVolume } from '../sound.js'
import { buildingRepairHandler } from '../buildingRepairHandler.js'
import { buildingSellHandler } from '../buildingSellHandler.js'
import { showNotification } from './notifications.js'
import { milestoneSystem } from '../game/milestoneSystem.js'
import { isInputFieldFocused } from '../utils/inputUtils.js'
import { getCurrentGame } from '../main.js'
import { broadcastBuildingPlace } from '../network/gameCommandSync.js'
import {
  canPlaceBuilding,
  createBuilding,
  placeBuilding,
  updatePowerSupply,
  buildingData,
  isTileValid
} from '../buildings.js'
import { updateDangerZoneMaps } from '../game/dangerZoneMap.js'
import { playSound } from '../sound.js'
import { savePlayerBuildPatterns } from '../savePlayerBuildPatterns.js'
import { TILE_SIZE, MAX_BUILDING_GAP_TILES } from '../config.js'
import { GAME_DEFAULT_CURSOR } from '../input/cursorStyles.js'
import { endMapEditOnPlay } from './mapEditorControls.js'
import { getPlayableViewportHeight, getPlayableViewportWidth } from '../utils/layoutMetrics.js'
import { mapBlueprintsToFootprints } from '../planning/blueprintPlanning.js'

export class EventHandlers {
  constructor(canvasManager, factories, units, mapGrid, moneyEl, gameInstance = null) {
    this.canvasManager = canvasManager
    this.factories = factories
    this.units = units
    this.mapGrid = mapGrid
    this.moneyEl = moneyEl
    this.gameInstance = gameInstance
    this.mobileChainBuildGesture = null
    this.mobileTwoFingerCancelGesture = null
    this.mobileChainBuildSuppressClickUntil = 0
    this.mobilePlanLastTapTime = 0
    this.mobilePlanLastTapPos = null

    this.setupGameControls()
    this.setupBuildingPlacement()
    this.setupRepairAndSellModes()
    this.setupVolumeControl()
    this.setupMobileDropListeners()
  }

  setupGameControls() {
    const pauseBtn = document.getElementById('pauseBtn')
    const restartBtn = document.getElementById('restartBtn')
    const musicControlButton = document.getElementById('musicControl')

    // Pause/resume functionality
    pauseBtn.addEventListener('click', () => {
      if (gameState.mapEditMode) {
        endMapEditOnPlay()
      }
      gameState.gamePaused = !gameState.gamePaused

      // Update button icon based on game state
      const playPauseIcon = pauseBtn.querySelector('.play-pause-icon')
      if (playPauseIcon) {
        playPauseIcon.textContent = gameState.gamePaused ? '▶' : '⏸'
      }

      // If the game was just unpaused, resume any pending productions
      if (!gameState.gamePaused) {
        productionQueue.resumeProductionAfterUnpause()

        if (this.gameInstance && this.gameInstance.gameLoop && typeof this.gameInstance.gameLoop.resumeFromPause === 'function') {
          this.gameInstance.gameLoop.resumeFromPause()
        }
      }
    })

    // Note: Initial button state is set in main.js setupUI() after gameState is initialized

    // Restart functionality
    restartBtn.addEventListener('click', async() => {
      try {
        // Use the stored game instance first, fallback to dynamic import, then window
        let gameInstance = this.gameInstance

        if (!gameInstance) {
          // Fallback 1: Get the current game instance via static import
          gameInstance = getCurrentGame()
        }

        if (!gameInstance) {
          // Fallback 2: Try window.gameInstance
          gameInstance = window.gameInstance
        }

        if (gameInstance && typeof gameInstance.resetGame === 'function') {
          await gameInstance.resetGame()
          showNotification('Game restarted while preserving win/loss statistics')
        } else {
          window.logger.warn('Game instance not found or resetGame method missing, falling back to page reload')
          window.location.reload()
        }
      } catch (err) {
        console.error('Error in restart handler, falling back to page reload:', err)
        window.location.reload()
      }
    })

    // Background music initialization and control
    if (musicControlButton) {
      musicControlButton.addEventListener('click', async() => {
        await toggleBackgroundMusic()

        // Toggle music icon
        const musicIcon = musicControlButton.querySelector('.music-icon')
        if (musicIcon) {
          // If background music is available and we can check its state
          if (typeof bgMusicAudio !== 'undefined' && bgMusicAudio) {
            musicIcon.textContent = bgMusicAudio.paused ? '♪' : '🔇'
          } else {
            // Toggle based on previous state if audio object isn't available
            musicIcon.textContent = musicIcon.textContent === '♪' ? '🔇' : '♪'
          }
        }
      })
    }

    // Handle escape key to exit building placement mode (without canceling the building)
    document.addEventListener('keydown', (e) => {
      // Don't handle keyboard shortcuts if an input field is focused
      if (isInputFieldFocused()) {
        return
      }

      if (e.key === 'Escape' && gameState.buildingPlacementMode) {
        e.preventDefault()
        e.stopPropagation()
        productionQueue.exitBuildingPlacementMode()
      }
    })
  }

  setupBuildingPlacement() {
    const gameCanvas = this.canvasManager.getGameCanvas()

    this.setupMobileChainBuildGesture(gameCanvas)

    // Add building placement handling to the canvas click event
    gameCanvas.addEventListener('click', (e) => {
      if (gameState.mapEditMode) return
      if (performance.now() < this.mobileChainBuildSuppressClickUntil) {
        return
      }
      if (gameState.chainBuildMode) {
        this.handleChainBuildingPlacement(e)
      } else {
        this.handleBuildingPlacement(e)
      }
    })

    // Add mousemove event to show building placement overlay
    gameCanvas.addEventListener('mousemove', (e) => {
      if (gameState.mapEditMode) return
      if (gameState.chainBuildMode) {
        this.handleChainBuildingOverlay(e)
      } else {
        this.handleBuildingPlacementOverlay(e)
      }
    })

    // Drag and drop placement
    gameCanvas.addEventListener('dragover', (e) => {
      if (gameState.mapEditMode) return
      if (gameState.draggedBuildingType) {
        e.preventDefault()
        gameState.buildingPlacementMode = true
        gameState.currentBuildingType = gameState.draggedBuildingType
        this.handleBuildingPlacementOverlay(e)
      } else if (gameState.draggedUnitType) {
        e.preventDefault()
      }
    })

    gameCanvas.addEventListener('dragleave', () => {
      if (gameState.mapEditMode) return
      if (gameState.draggedBuildingType) {
        gameState.buildingPlacementMode = false
      }
    })

    gameCanvas.addEventListener('drop', (e) => {
      if (gameState.mapEditMode) return
      if (gameState.draggedBuildingType) {
        e.preventDefault()
        this.handleDragDropPlacement({
          kind: 'building',
          type: gameState.draggedBuildingType,
          button: gameState.draggedBuildingButton,
          clientX: e.clientX,
          clientY: e.clientY
        })
      } else if (gameState.draggedUnitType) {
        e.preventDefault()
        this.handleDragDropPlacement({
          kind: 'unit',
          type: gameState.draggedUnitType,
          button: gameState.draggedUnitButton,
          clientX: e.clientX,
          clientY: e.clientY
        })
      }
    })

    // Add building repair handling to the canvas click event
    gameCanvas.addEventListener('click', (e) => {
      if (gameState.mapEditMode) return
      buildingRepairHandler(e, gameState, gameCanvas, gameState.mapGrid, this.units, this.factories, productionQueue, this.moneyEl)
    })

    // Add building sell handling to the canvas click event
    gameCanvas.addEventListener('click', (e) => {
      if (gameState.mapEditMode) return
      const sold = buildingSellHandler(e, gameState, gameCanvas, this.mapGrid, this.units, this.factories, this.moneyEl)
      // If a building was successfully sold, update button states
      if (sold && this.productionController) {
        this.productionController.updateVehicleButtonStates()
        this.productionController.updateBuildingButtonStates()
      }
    })
  }

  setupMobileChainBuildGesture(gameCanvas) {
    if (!window.PointerEvent) {
      return
    }

    const HOLD_DELAY_MS = 220
    const EDGE_THRESHOLD = 28
    const EDGE_SCROLL_SPEED = 4

    const resetGestureState = () => {
      if (this.mobileChainBuildGesture?.holdTimer) {
        clearTimeout(this.mobileChainBuildGesture.holdTimer)
      }
      this.mobileChainBuildGesture = null
    }

    const clearMobilePaintMode = () => {
      gameState.mobileBuildPaintMode = false
      gameState.mobileBuildPaintType = null
      gameState.mobileBuildPaintButton = null
      gameState.mobileBuildPaintTiles = []
    }

    const clearSelections = () => {
      this.units.forEach(unit => {
        if (unit) unit.selected = false
      })
      this.factories.forEach(factory => {
        if (factory) factory.selected = false
      })
      if (Array.isArray(gameState.buildings)) {
        gameState.buildings.forEach(building => {
          if (building) building.selected = false
        })
      }
      gameState.selectionActive = false
      gameState.selectionStart = { x: 0, y: 0 }
      gameState.selectionEnd = { x: 0, y: 0 }
    }

    const cancelMobilePlanningAndPlacement = () => {
      clearMobilePaintMode()
      resetGestureState()
      gameState.buildingPlacementMode = false
      gameState.currentBuildingType = null
      gameState.chainBuildMode = false
      gameState.chainBuildingType = null
      gameState.chainBuildingButton = null
      gameState.chainBuildPrimed = false
      clearSelections()
    }

    const toWorld = (event) => {
      const gameRect = gameCanvas.getBoundingClientRect()
      return {
        worldX: event.clientX - gameRect.left + gameState.scrollOffset.x,
        worldY: event.clientY - gameRect.top + gameState.scrollOffset.y
      }
    }

    const addPaintTile = (tileX, tileY) => {
      if (!gameState.mobileBuildPaintMode) {
        return
      }
      const tiles = gameState.mobileBuildPaintTiles
      const lastTile = tiles[tiles.length - 1]
      if (lastTile && lastTile.x === tileX && lastTile.y === tileY) {
        return
      }
      if (!tiles.some(tile => tile.x === tileX && tile.y === tileY)) {
        tiles.push({ x: tileX, y: tileY })
      }
    }

    const addPaintPath = (fromX, fromY, toX, toY) => {
      let x = fromX
      let y = fromY
      const dx = Math.abs(toX - fromX)
      const dy = Math.abs(toY - fromY)
      const sx = fromX < toX ? 1 : -1
      const sy = fromY < toY ? 1 : -1
      let err = dx - dy

      while (true) {
        addPaintTile(x, y)
        if (x === toX && y === toY) break
        const e2 = err * 2
        if (e2 > -dy) {
          err -= dy
          x += sx
        }
        if (e2 < dx) {
          err += dx
          y += sy
        }
      }
    }

    const applyMobilePlanningEdgeScroll = (event, rect, gesture) => {
      const mapGrid = gameState.mapGrid
      if (!Array.isArray(mapGrid) || mapGrid.length === 0 || !Array.isArray(mapGrid[0])) {
        return
      }
      const viewportWidth = getPlayableViewportWidth(gameCanvas)
      const viewportHeight = getPlayableViewportHeight(gameCanvas)
      const maxScrollX = Math.max(0, mapGrid[0].length * TILE_SIZE - viewportWidth)
      const maxScrollY = Math.max(0, mapGrid.length * TILE_SIZE - viewportHeight)

      let deltaX = 0
      let deltaY = 0
      if (event.clientX <= rect.left + EDGE_THRESHOLD) {
        deltaX = -EDGE_SCROLL_SPEED
      } else if (event.clientX >= rect.right - EDGE_THRESHOLD) {
        deltaX = EDGE_SCROLL_SPEED
      }
      if (event.clientY <= rect.top + EDGE_THRESHOLD) {
        deltaY = -EDGE_SCROLL_SPEED
      } else if (event.clientY >= rect.bottom - EDGE_THRESHOLD) {
        deltaY = EDGE_SCROLL_SPEED
      }

      if (deltaX !== 0 || deltaY !== 0) {
        gameState.scrollOffset.x = Math.max(0, Math.min(maxScrollX, gameState.scrollOffset.x + deltaX))
        gameState.scrollOffset.y = Math.max(0, Math.min(maxScrollY, gameState.scrollOffset.y + deltaY))
        gesture.lastClientX = event.clientX
        gesture.lastClientY = event.clientY
      }
    }

    const getBlueprintOccupiedTiles = () => {
      const occupiedTiles = new Set()
      ;(gameState.blueprints || []).forEach(bp => {
        const info = buildingData[bp.type]
        if (!info) {
          return
        }
        for (let y = 0; y < info.height; y++) {
          for (let x = 0; x < info.width; x++) {
            occupiedTiles.add(`${bp.x + x},${bp.y + y}`)
          }
        }
      })
      return occupiedTiles
    }

    const canPlaceWithoutBlueprintOverlap = (type, tileX, tileY, occupiedTiles, plannedTiles = []) => {
      const info = buildingData[type]
      if (!info) {
        return false
      }

      const planningBuildings = plannedTiles.map(tile => ({
        type,
        x: tile.x,
        y: tile.y,
        width: info.width,
        height: info.height,
        owner: gameState.humanPlayer
      }))

      if (!canPlaceBuilding(
        type,
        tileX,
        tileY,
        gameState.mapGrid || this.mapGrid,
        this.units,
        [...(gameState.buildings || []), ...planningBuildings],
        this.factories,
        gameState.humanPlayer
      )) {
        return false
      }

      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          if (occupiedTiles.has(`${tileX + x},${tileY + y}`)) {
            return false
          }
        }
      }

      return true
    }

    const addFootprintToOccupiedTiles = (type, tileX, tileY, occupiedTiles) => {
      const info = buildingData[type]
      if (!info) {
        return
      }

      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          occupiedTiles.add(`${tileX + x},${tileY + y}`)
        }
      }
    }

    const isWithinPlannedTileGap = (fromTile, toTile) => {
      if (!fromTile || !toTile) {
        return true
      }

      const deltaX = Math.abs(toTile.x - fromTile.x)
      const deltaY = Math.abs(toTile.y - fromTile.y)
      return Math.max(deltaX, deltaY) <= MAX_BUILDING_GAP_TILES
    }

    const queueMobilePaintedBuildings = () => {
      const buildingType = gameState.mobileBuildPaintType
      const button = gameState.mobileBuildPaintButton
      if (!buildingType || !button || !Array.isArray(gameState.mobileBuildPaintTiles) || gameState.mobileBuildPaintTiles.length === 0) {
        return
      }

      const occupiedTiles = getBlueprintOccupiedTiles()
      let lastQueuedTile = null
      const acceptedPlanningTiles = []

      gameState.mobileBuildPaintTiles.forEach(pos => {
        if (!isWithinPlannedTileGap(lastQueuedTile, pos)) {
          return
        }

        if (!canPlaceWithoutBlueprintOverlap(buildingType, pos.x, pos.y, occupiedTiles, acceptedPlanningTiles)) {
          return
        }

        const bp = { type: buildingType, x: pos.x, y: pos.y }
        gameState.blueprints.push(bp)
        productionQueue.addItem(buildingType, button, true, bp)
        addFootprintToOccupiedTiles(buildingType, pos.x, pos.y, occupiedTiles)
        acceptedPlanningTiles.push(pos)
        lastQueuedTile = pos
      })
    }

    gameCanvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') {
        return
      }
      if (!gameState.buildingPlacementMode || !gameState.currentBuildingType) {
        return
      }

      const now = performance.now()
      const isDoubleTap = this.mobilePlanLastTapPos &&
        now - this.mobilePlanLastTapTime <= 320 &&
        Math.hypot(event.clientX - this.mobilePlanLastTapPos.x, event.clientY - this.mobilePlanLastTapPos.y) <= 24

      this.mobilePlanLastTapTime = now
      this.mobilePlanLastTapPos = { x: event.clientX, y: event.clientY }

      if (isDoubleTap) {
        cancelMobilePlanningAndPlacement()
        this.mobileChainBuildSuppressClickUntil = now + 250
        return
      }

      const { worldX, worldY } = toWorld(event)
      const tileX = Math.floor(worldX / TILE_SIZE)
      const tileY = Math.floor(worldY / TILE_SIZE)

      this.mobileChainBuildGesture = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        startTileX: tileX,
        startTileY: tileY,
        lastTileX: tileX,
        lastTileY: tileY,
        holdTimer: null,
        active: false
      }

      this.mobileChainBuildGesture.holdTimer = window.setTimeout(() => {
        if (!this.mobileChainBuildGesture || this.mobileChainBuildGesture.pointerId !== event.pointerId) {
          return
        }
        const currentType = gameState.currentBuildingType
        if (!currentType) {
          resetGestureState()
          return
        }
        const buttonRef = productionQueue.completedBuildings.find(building => building.type === currentType)?.button || null
        if (!buttonRef) {
          resetGestureState()
          return
        }

        const occupiedTiles = getBlueprintOccupiedTiles()
        if (!canPlaceWithoutBlueprintOverlap(currentType, this.mobileChainBuildGesture.startTileX, this.mobileChainBuildGesture.startTileY, occupiedTiles, [])) {
          resetGestureState()
          return
        }

        this.mobileChainBuildGesture.active = true
        gameState.mobileBuildPaintMode = true
        gameState.mobileBuildPaintType = currentType
        gameState.mobileBuildPaintButton = buttonRef
        gameState.mobileBuildPaintTiles = []
        addPaintTile(this.mobileChainBuildGesture.startTileX, this.mobileChainBuildGesture.startTileY)

        gameState.selectionActive = false
        gameState.selectionStart = { x: 0, y: 0 }
        gameState.selectionEnd = { x: 0, y: 0 }
      }, HOLD_DELAY_MS)
    }, { passive: true })

    gameCanvas.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'touch' || !this.mobileChainBuildGesture || this.mobileChainBuildGesture.pointerId !== event.pointerId) {
        return
      }

      const gesture = this.mobileChainBuildGesture
      const moveDistance = Math.hypot(
        event.clientX - gesture.startClientX,
        event.clientY - gesture.startClientY
      )

      if (!gesture.active && moveDistance > 10) {
        resetGestureState()
        return
      }

      if (gesture.active) {
        const gameRect = gameCanvas.getBoundingClientRect()
        applyMobilePlanningEdgeScroll(event, gameRect, gesture)

        const worldX = event.clientX - gameRect.left + gameState.scrollOffset.x
        const worldY = event.clientY - gameRect.top + gameState.scrollOffset.y
        const tileX = Math.floor(worldX / TILE_SIZE)
        const tileY = Math.floor(worldY / TILE_SIZE)

        addPaintPath(gesture.lastTileX, gesture.lastTileY, tileX, tileY)
        gesture.lastTileX = tileX
        gesture.lastTileY = tileY

        gameState.selectionActive = false
        gameState.selectionStart = { x: 0, y: 0 }
        gameState.selectionEnd = { x: 0, y: 0 }
      }
    }, { passive: true })

    const finalizeMobileChainGesture = (event) => {
      if (event.pointerType !== 'touch' || !this.mobileChainBuildGesture || this.mobileChainBuildGesture.pointerId !== event.pointerId) {
        return
      }

      const gestureWasActive = this.mobileChainBuildGesture.active
      resetGestureState()

      if (!gestureWasActive) {
        return
      }

      this.mobileChainBuildSuppressClickUntil = performance.now() + 250
      queueMobilePaintedBuildings()
      clearMobilePaintMode()
      gameState.chainBuildMode = false
      gameState.chainBuildingType = null
      gameState.chainBuildingButton = null
      gameState.chainBuildPrimed = false
    }

    gameCanvas.addEventListener('pointerup', finalizeMobileChainGesture, { passive: true })
    gameCanvas.addEventListener('pointercancel', finalizeMobileChainGesture, { passive: true })

    const resetTwoFingerCancelGesture = () => {
      this.mobileTwoFingerCancelGesture = null
    }

    const isMobileConstructionInteractionActive = () => (
      gameState.mobileBuildPaintMode || (gameState.buildingPlacementMode && Boolean(gameState.currentBuildingType))
    )

    gameCanvas.addEventListener('touchstart', (event) => {
      if (!isMobileConstructionInteractionActive()) {
        resetTwoFingerCancelGesture()
        return
      }

      if (event.touches.length !== 2) {
        if (event.touches.length > 2) {
          resetTwoFingerCancelGesture()
        }
        return
      }

      const [firstTouch, secondTouch] = event.touches
      this.mobileTwoFingerCancelGesture = {
        startedAt: performance.now(),
        firstTouchId: firstTouch.identifier,
        secondTouchId: secondTouch.identifier,
        firstStartX: firstTouch.clientX,
        firstStartY: firstTouch.clientY,
        secondStartX: secondTouch.clientX,
        secondStartY: secondTouch.clientY,
        moved: false
      }
    }, { passive: true })

    gameCanvas.addEventListener('touchmove', (event) => {
      const gesture = this.mobileTwoFingerCancelGesture
      if (!gesture || event.touches.length !== 2 || gesture.moved) {
        return
      }

      const firstTouch = Array.from(event.touches).find(touch => touch.identifier === gesture.firstTouchId)
      const secondTouch = Array.from(event.touches).find(touch => touch.identifier === gesture.secondTouchId)
      if (!firstTouch || !secondTouch) {
        gesture.moved = true
        return
      }

      const firstDistance = Math.hypot(firstTouch.clientX - gesture.firstStartX, firstTouch.clientY - gesture.firstStartY)
      const secondDistance = Math.hypot(secondTouch.clientX - gesture.secondStartX, secondTouch.clientY - gesture.secondStartY)
      if (firstDistance > 14 || secondDistance > 14) {
        gesture.moved = true
      }
    }, { passive: true })

    gameCanvas.addEventListener('touchend', () => {
      const gesture = this.mobileTwoFingerCancelGesture
      if (!gesture) {
        return
      }

      if (!isMobileConstructionInteractionActive()) {
        resetTwoFingerCancelGesture()
        return
      }

      const elapsedMs = performance.now() - gesture.startedAt
      if (!gesture.moved && elapsedMs <= 320) {
        cancelMobilePlanningAndPlacement()
        this.mobileChainBuildSuppressClickUntil = performance.now() + 250
      }

      resetTwoFingerCancelGesture()
    }, { passive: true })

    gameCanvas.addEventListener('touchcancel', resetTwoFingerCancelGesture, { passive: true })
  }

  setupMobileDropListeners() {
    document.addEventListener('mobile-production-drop', (event) => {
      if (!event || !event.detail) {
        return
      }
      this.handleDragDropPlacement(event.detail)
    })
  }

  handleDragDropPlacement(detail) {
    if (!detail || !detail.type || !detail.button) {
      return
    }

    const { kind, type, button, clientX, clientY } = detail
    const gameCanvas = this.canvasManager.getGameCanvas()
    if (!gameCanvas) {
      return
    }

    const rect = gameCanvas.getBoundingClientRect()
    const insideCanvas = clientX >= rect.left && clientX <= rect.right &&
      clientY >= rect.top && clientY <= rect.bottom

    if (!insideCanvas) {
      return
    }

    const mouseX = clientX - rect.left + gameState.scrollOffset.x
    const mouseY = clientY - rect.top + gameState.scrollOffset.y
    const tileX = Math.floor(mouseX / TILE_SIZE)
    const tileY = Math.floor(mouseY / TILE_SIZE)

    if (kind === 'building') {
      const planningBuildings = mapBlueprintsToFootprints(gameState.blueprints || [], gameState.humanPlayer)
      if (canPlaceBuilding(type, tileX, tileY, gameState.mapGrid, this.units, [...gameState.buildings, ...planningBuildings], this.factories, gameState.humanPlayer)) {
        const blueprint = { type, x: tileX, y: tileY }
        if (!gameState.blueprints) {
          gameState.blueprints = []
        }
        gameState.blueprints.push(blueprint)
        productionQueue.addItem(type, button, true, blueprint)
        showNotification(`Blueprint placed for ${buildingData[type].displayName}`)

        if (gameState.chainBuildPrimed && gameState.shiftKeyDown) {
          gameState.chainBuildMode = true
          gameState.chainStartX = tileX
          gameState.chainStartY = tileY
          gameState.chainBuildingType = type
          gameState.chainBuildingButton = button
          gameState.chainBuildPrimed = false
        }
      } else {
        showNotification('Invalid blueprint location')
      }

      gameState.buildingPlacementMode = false
      gameState.currentBuildingType = null
      gameState.draggedBuildingType = null
      gameState.draggedBuildingButton = null
      gameState.chainBuildPrimed = false
    } else if (kind === 'unit') {
      productionQueue.addItem(type, button, false, null, { x: tileX, y: tileY })
      showNotification(`Queued ${type} with rally point`)
      gameState.draggedUnitType = null
      gameState.draggedUnitButton = null
    }
  }

  handleBuildingPlacement(e) {
    const gameCanvas = this.canvasManager.getGameCanvas()

    if (gameState.buildingPlacementMode && gameState.currentBuildingType) {
      const mouseX = e.clientX - gameCanvas.getBoundingClientRect().left + gameState.scrollOffset.x
      const mouseY = e.clientY - gameCanvas.getBoundingClientRect().top + gameState.scrollOffset.y

      // Convert to tile coordinates
      const tileX = Math.floor(mouseX / TILE_SIZE)
      const tileY = Math.floor(mouseY / TILE_SIZE)

      // Get building data
      const buildingType = gameState.currentBuildingType

      try {
        // Check if placement is valid - pass buildings and factories arrays
        const planningBuildings = mapBlueprintsToFootprints(gameState.blueprints || [], gameState.humanPlayer)
        if (canPlaceBuilding(buildingType, tileX, tileY, gameState.mapGrid, this.units, [...gameState.buildings, ...planningBuildings], this.factories, gameState.humanPlayer)) {
          // Create and place the building
          const newBuilding = createBuilding(buildingType, tileX, tileY)

          // Add owner property to the building
          newBuilding.owner = gameState.humanPlayer

          // Add the building to gameState.buildings
          if (!gameState.buildings) {
            gameState.buildings = []
          }
          gameState.buildings.push(newBuilding)
          updateDangerZoneMaps(gameState)

          // Mark building tiles in the map grid
          placeBuilding(newBuilding, this.mapGrid)

          // Update power supply
          updatePowerSupply(gameState.buildings, gameState)

          // Broadcast building placement to other players in multiplayer
          broadcastBuildingPlace(buildingType, tileX, tileY, gameState.humanPlayer)

          // Exit placement mode
          gameState.buildingPlacementMode = false
          gameState.currentBuildingType = null

          // Remove ready-for-placement class from the button
          document.querySelectorAll('.ready-for-placement').forEach(button => {
            button.classList.remove('ready-for-placement')
          })          // Remove the placed building from the completed buildings array
          const completedBuildingIndex = productionQueue.completedBuildings.findIndex(
            building => building.type === buildingType
          )
          let placedBuildingButton = null
          if (completedBuildingIndex !== -1) {
            placedBuildingButton = productionQueue.completedBuildings[completedBuildingIndex].button
            productionQueue.completedBuildings.splice(completedBuildingIndex, 1)
          }

          // Update the ready counter for the button that had a building placed
          if (placedBuildingButton) {
            productionQueue.updateReadyBuildingCounter(placedBuildingButton)
          }

          // Restore ready-for-placement class for buttons that still have completed buildings
          productionQueue.completedBuildings.forEach(building => {
            if (!building.button.classList.contains('ready-for-placement')) {
              building.button.classList.add('ready-for-placement')
            }
            // Update ready building counter for remaining buildings
            productionQueue.updateReadyBuildingCounter(building.button)
          })

          // Play placement sound
          playSound('buildingPlaced')

          // Show notification
          showNotification(`${buildingData[buildingType].displayName} constructed`)

          // Check for milestones after building placement
          milestoneSystem.checkMilestones(gameState)

          // Save player building patterns
          savePlayerBuildPatterns(buildingType)

          // UPDATE: Update button states after successful placement
          if (this.productionController) {
            this.productionController.updateVehicleButtonStates()
            this.productionController.updateBuildingButtonStates()
            // Sync tech tree to unlock new units based on new buildings
            this.productionController.syncTechTreeWithBuildings()
          }
        } else {
          // Play error sound for invalid placement
          playSound('constructionObstructed', 1.0, 0, true)
        }
      } catch (error) {
        console.error('Error during building placement:', error)
        showNotification('Error placing building: ' + error.message, 5000)
        playSound('error')
      }
    }
  }

  handleBuildingPlacementOverlay(e) {
    const gameCanvas = this.canvasManager.getGameCanvas()

    if (gameState.buildingPlacementMode && gameState.currentBuildingType) {
      const mouseX = e.clientX - gameCanvas.getBoundingClientRect().left + gameState.scrollOffset.x
      const mouseY = e.clientY - gameCanvas.getBoundingClientRect().top + gameState.scrollOffset.y

      // Update cursor position for the overlay renderer
      gameState.cursorX = mouseX
      gameState.cursorY = mouseY

      // Force a redraw to show the overlay - this will be handled by the game loop
      // No need to manually trigger rendering here as the game loop handles it
    }
  }

  computeChainPositions(startX, startY, endX, endY, info) {
    const dx = endX - startX
    const dy = endY - startY
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const stepX = horizontal ? (dx >= 0 ? info.width : -info.width) : 0
    const stepY = horizontal ? 0 : (dy >= 0 ? info.height : -info.height)
    const count = horizontal
      ? Math.floor(Math.abs(dx) / info.width)
      : Math.floor(Math.abs(dy) / info.height)
    const positions = []
    for (let i = 1; i <= count; i++) {
      positions.push({ x: startX + stepX * i, y: startY + stepY * i })
    }
    return positions
  }


  handleChainBuildingPlacement(e) {
    const gameCanvas = this.canvasManager.getGameCanvas()

    if (!gameState.chainBuildMode || !gameState.chainBuildingType) return

    const mouseX =
      e.clientX - gameCanvas.getBoundingClientRect().left + gameState.scrollOffset.x
    const mouseY =
      e.clientY - gameCanvas.getBoundingClientRect().top + gameState.scrollOffset.y

    const tileX = Math.floor(mouseX / TILE_SIZE)
    const tileY = Math.floor(mouseY / TILE_SIZE)

    const info = buildingData[gameState.chainBuildingType]
    const positions = this.computeChainPositions(
      gameState.chainStartX,
      gameState.chainStartY,
      tileX,
      tileY,
      info
    )

    const occ = new Set()
    gameState.blueprints.forEach(bp => {
      const bi = buildingData[bp.type]
      for (let y = 0; y < bi.height; y++) {
        for (let x = 0; x < bi.width; x++) {
          occ.add(`${bp.x + x},${bp.y + y}`)
        }
      }
    })

    const validPositions = []
    for (const pos of positions) {
      let valid = true
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const tx = pos.x + x
          const ty = pos.y + y
          if (!isTileValid(tx, ty, this.mapGrid, this.units, [], [], gameState.chainBuildingType) || occ.has(`${tx},${ty}`)) {
            valid = false
            break
          }
        }
        if (!valid) break
      }
      if (!valid) break
      validPositions.push(pos)
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          occ.add(`${pos.x + x},${pos.y + y}`)
        }
      }
    }

    validPositions.forEach(p => {
      const bp = { type: gameState.chainBuildingType, x: p.x, y: p.y }
      gameState.blueprints.push(bp)
      productionQueue.addItem(gameState.chainBuildingType, gameState.chainBuildingButton, true, bp)
    })

    if (validPositions.length > 0) {
      const last = validPositions[validPositions.length - 1]
      gameState.chainStartX = last.x
      gameState.chainStartY = last.y
    }
  }

  handleChainBuildingOverlay(e) {
    const gameCanvas = this.canvasManager.getGameCanvas()

    if (gameState.chainBuildMode && gameState.chainBuildingType) {
      const mouseX =
        e.clientX - gameCanvas.getBoundingClientRect().left + gameState.scrollOffset.x
      const mouseY =
        e.clientY - gameCanvas.getBoundingClientRect().top + gameState.scrollOffset.y

      gameState.cursorX = mouseX
      gameState.cursorY = mouseY
    }
  }

  setupRepairAndSellModes() {
    const gameCanvas = this.canvasManager.getGameCanvas()

    // Add repair button functionality
    document.getElementById('repairBtn').addEventListener('click', () => {
      gameState.repairMode = !gameState.repairMode
      // Update button appearance
      const repairBtn = document.getElementById('repairBtn')
      if (gameState.repairMode) {
        repairBtn.classList.add('active')
        showNotification('Repair mode activated. Click on a building to repair it.')

        // Turn off sell mode if it's active
        if (gameState.sellMode) {
          gameState.sellMode = false
          document.getElementById('sellBtn').classList.remove('active')
        }

        // Use CSS class for cursor
        gameCanvas.classList.add('repair-mode')
      } else {
        repairBtn.classList.remove('active')
        showNotification('Repair mode deactivated.')

        // Remove CSS cursor class
        gameCanvas.classList.remove('repair-mode', 'repair-blocked-mode')

        // Reset cursor to default
        gameCanvas.style.cursor = GAME_DEFAULT_CURSOR
      }
      // Exit building placement mode if active (don't cancel the building)
      if (gameState.buildingPlacementMode) {
        productionQueue.exitBuildingPlacementMode()
      }
    })

    // Add sell button functionality
    document.getElementById('sellBtn').addEventListener('click', () => {
      gameState.sellMode = !gameState.sellMode
      // Update button appearance
      const sellBtn = document.getElementById('sellBtn')
      if (gameState.sellMode) {
        gameState.sellPlanCancellationPreview = null
        sellBtn.classList.add('active')
        showNotification('Sell mode activated. Click on a building to sell it for 70% of build price.')

        // Turn off repair mode if it's active
        if (gameState.repairMode) {
          gameState.repairMode = false
          document.getElementById('repairBtn').classList.remove('active')
        }

        // Use CSS class for cursor
        gameCanvas.classList.add('sell-mode')
      } else {
        sellBtn.classList.remove('active')
        gameState.sellPlanCancellationPreview = null
        showNotification('Sell mode deactivated.')

        // Remove CSS cursor class
        gameCanvas.classList.remove('sell-mode', 'sell-blocked-mode')

        // Reset cursor to default
        gameCanvas.style.cursor = GAME_DEFAULT_CURSOR
      }
      // Exit building placement mode if active (don't cancel the building)
      if (gameState.buildingPlacementMode) {
        productionQueue.exitBuildingPlacementMode()
      }
    })
  }

  setProductionController(productionController) {
    this.productionController = productionController
  }

  setupVolumeControl() {
    const volumeSlider = document.getElementById('masterVolumeSlider')
    const volumeValue = document.getElementById('volumeValue')

    if (volumeSlider && volumeValue) {
      // Set initial values based on current master volume
      const currentVolume = Math.round(getMasterVolume() * 100)
      volumeSlider.value = currentVolume
      volumeValue.textContent = currentVolume + '%'

      // Handle volume changes
      volumeSlider.addEventListener('input', (e) => {
        const volumePercent = parseInt(e.target.value)
        const volumeDecimal = volumePercent / 100

        // Update master volume
        setMasterVolume(volumeDecimal)

        // Update display
        volumeValue.textContent = volumePercent + '%'

        // Play a brief test sound to give feedback
        if (volumePercent > 0) {
          playSound('confirmed', 0.3)
        }
      })
    }
  }
}
