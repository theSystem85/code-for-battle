// mouseHandler.js
import {
  isRallyPointTileBlocked,
  isUtilityUnit,
  shouldStartUtilityQueueMode,
  createSyntheticMouseEvent,
  createSyntheticMouseEventFromCoords,
  getTouchCenter,
  handleContextMenu,
  findEnemyTarget,
  selectWreck,
  isOverRecoveryTankAt,
  isOverDamagedUnitAt,
  updateAGFCapability
} from './mouseHelpers.js'
import { AttackGroupHandler } from './attackGroupHandler.js'
import { handleRightMouseDown, handleRightDragScrolling, handleRightMouseUp } from './mouseRightClick.js'
import { setupMouseEvents } from './mouseEventSetup.js'
import { setupTouchEvents } from './mouseTouch.js'
import {
  processUtilityQueueSelection,
  handleLeftMouseDown,
  updateSelectionRectangle,
  handleLeftMouseUp,
  updateEnemyHover
} from './mouseSelection.js'
import {
  handleForceAttackCommand,
  handleGuardCommand,
  handleStandardCommands,
  handleServiceProviderClick,
  handleFallbackCommand
} from './mouseCommands.js'
import { gameState } from '../gameState.js'

export class MouseHandler {
  constructor() {
    this.isSelecting = false
    this.wasDragging = false
    this.rightWasDragging = false
    this.selectionStart = { x: 0, y: 0 }
    this.selectionEnd = { x: 0, y: 0 }
    this.rightDragStart = { x: 0, y: 0 }
    this.gameFactories = []
    this.mouseDownTime = 0
    this.isDraggingThreshold = 150
    this.attackGroupHandler = new AttackGroupHandler()
    this.forceAttackClick = false
    this.guardClick = false
    this.requestRenderFrame = null
    this.activeTouchPointers = new Map()
    this.twoFingerPan = null
    this.longPressDuration = 450
    this.utilityQueueCandidate = false
    this.gameUnits = []
    this.selectionManager = null
  }

  setRenderScheduler(callback) {
    this.requestRenderFrame = callback
  }

  setupMouseEvents(gameCanvas, units, factories, mapGrid, selectedUnits, selectionManager, unitCommands, cursorManager) {
    setupMouseEvents(this, gameCanvas, units, factories, mapGrid, selectedUnits, selectionManager, unitCommands, cursorManager)
  }

  setupTouchEvents(gameCanvas, units, factories, mapGrid, selectedUnits, selectionManager, unitCommands, cursorManager) {
    setupTouchEvents(this, gameCanvas, units, factories, mapGrid, selectedUnits, selectionManager, unitCommands, cursorManager)
  }

  handleRightMouseDown(e, worldX, worldY, gameCanvas, cursorManager) {
    handleRightMouseDown(this, e, worldX, worldY, gameCanvas, cursorManager)
  }

  handleRightDragScrolling(e, mapGrid, gameCanvas) {
    handleRightDragScrolling(this, e, mapGrid, gameCanvas)
  }

  handleRightMouseUp(e, units, factories, selectedUnits, selectionManager, cursorManager) {
    handleRightMouseUp(this, e, units, factories, selectedUnits, selectionManager, cursorManager)
  }

  handleLeftMouseDown(e, worldX, worldY, gameCanvas, selectedUnits, cursorManager) {
    handleLeftMouseDown(this, e, worldX, worldY, gameCanvas, selectedUnits, cursorManager)
  }

  handleLeftMouseUp(e, units, factories, mapGrid, selectedUnits, selectionManager, unitCommands, cursorManager) {
    handleLeftMouseUp(this, e, units, factories, mapGrid, selectedUnits, selectionManager, unitCommands, cursorManager)
  }

  updateEnemyHover(worldX, worldY, units, factories, selectedUnits, cursorManager) {
    updateEnemyHover(this, worldX, worldY, units, factories, selectedUnits, cursorManager)
  }

  updateSelectionRectangle(worldX, worldY, cursorManager) {
    updateSelectionRectangle(this, worldX, worldY, cursorManager)
  }

  processUtilityQueueSelection(units, mapGrid, selectedUnits, selectionManager, unitCommands) {
    return processUtilityQueueSelection(this, units, mapGrid, selectedUnits, selectionManager, unitCommands)
  }

  handleForceAttackCommand(worldX, worldY, units, selectedUnits, unitCommands, mapGrid, selectionManager) {
    return handleForceAttackCommand(this, worldX, worldY, units, selectedUnits, unitCommands, mapGrid, selectionManager)
  }

  handleGuardCommand(worldX, worldY, units, selectedUnits, unitCommands, selectionManager, mapGrid) {
    return handleGuardCommand(this, worldX, worldY, units, selectedUnits, unitCommands, selectionManager, mapGrid)
  }

  handleStandardCommands(worldX, worldY, selectedUnits, unitCommands, mapGrid, altPressed = false) {
    return handleStandardCommands(this, worldX, worldY, selectedUnits, unitCommands, mapGrid, altPressed)
  }

  handleServiceProviderClick(provider, selectedUnits, unitCommands, mapGrid) {
    return handleServiceProviderClick(this, provider, selectedUnits, unitCommands, mapGrid)
  }

  handleFallbackCommand(worldX, worldY, selectedUnits, unitCommands, mapGrid, e, units = [], factories = []) {
    return handleFallbackCommand(this, worldX, worldY, selectedUnits, unitCommands, mapGrid, e, units, factories)
  }

  handleContextMenu(e, gameCanvas) {
    return handleContextMenu(e, gameCanvas)
  }

  updateAGFCapability(selectedUnits) {
    return updateAGFCapability(this, selectedUnits)
  }

  resetAttackGroupState() {
    this.attackGroupHandler.isAttackGroupSelecting = false
    this.attackGroupHandler.attackGroupWasDragging = false
    gameState.attackGroupMode = false
    gameState.attackGroupStart = { x: 0, y: 0 }
    gameState.attackGroupEnd = { x: 0, y: 0 }
    gameState.disableAGFRendering = false
  }
}

export {
  isRallyPointTileBlocked,
  isUtilityUnit,
  shouldStartUtilityQueueMode,
  createSyntheticMouseEvent,
  createSyntheticMouseEventFromCoords,
  getTouchCenter,
  handleContextMenu,
  findEnemyTarget,
  selectWreck,
  isOverRecoveryTankAt,
  isOverDamagedUnitAt,
  updateAGFCapability
}
