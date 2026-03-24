import { gameState } from '../gameState.js'
import { notifyBenchmarkManualCameraControl } from '../benchmark/benchmarkTracker.js'
import { getPlayableViewportHeight, getPlayableViewportWidth } from '../utils/layoutMetrics.js'
import { TILE_SIZE } from '../config.js'
import { pipetteTile } from '../mapEditor.js'
import { GAME_DEFAULT_CURSOR } from './cursorStyles.js'

export function handleRightMouseDown(handler, e, worldX, worldY, gameCanvas, cursorManager) {
  gameState.isRightDragging = true
  if (gameState.smoothScroll) {
    gameState.smoothScroll.active = false
  }
  handler.rightDragStart = { x: e.clientX, y: e.clientY }
  handler.rightWasDragging = false
  gameState.lastDragPos = { x: e.clientX, y: e.clientY }
  if (gameState.benchmarkActive) {
    notifyBenchmarkManualCameraControl()
  }
  if (cursorManager) {
    cursorManager.applyCursor(gameCanvas, 'grabbing')
  } else {
    gameCanvas.style.cursor = 'grabbing'
  }
  if (handler.requestRenderFrame) {
    handler.requestRenderFrame()
  }

  if (gameState.mapEditMode && !e.shiftKey) {
    const tileX = Math.floor(worldX / TILE_SIZE)
    const tileY = Math.floor(worldY / TILE_SIZE)
    pipetteTile(tileX, tileY)
    if (handler.requestRenderFrame) handler.requestRenderFrame()
  }
}

export function handleRightDragScrolling(handler, e, mapGrid, gameCanvas) {
  if (gameState.benchmarkActive) {
    notifyBenchmarkManualCameraControl()
  }
  const dx = e.clientX - gameState.lastDragPos.x
  const dy = e.clientY - gameState.lastDragPos.y

  const logicalWidth = getPlayableViewportWidth(gameCanvas)
  const logicalHeight = getPlayableViewportHeight(gameCanvas)

  const isMobileLandscape = document.body?.classList?.contains('mobile-landscape')
  const scrollSpeed = isMobileLandscape ? 1.4 : 2
  gameState.scrollOffset.x = Math.max(
    0,
    Math.min(gameState.scrollOffset.x - (dx * scrollSpeed), mapGrid[0].length * TILE_SIZE - logicalWidth)
  )
  gameState.scrollOffset.y = Math.max(
    0,
    Math.min(gameState.scrollOffset.y - (dy * scrollSpeed), mapGrid.length * TILE_SIZE - logicalHeight)
  )

  gameState.dragVelocity = { x: dx * scrollSpeed, y: dy * scrollSpeed }
  gameState.lastDragPos = { x: e.clientX, y: e.clientY }

  if (handler.requestRenderFrame) {
    handler.requestRenderFrame()
  }

  if (!handler.rightWasDragging && Math.hypot(e.clientX - handler.rightDragStart.x, e.clientY - handler.rightDragStart.y) > 3) {
    handler.rightWasDragging = true
  }
}

export function handleRightMouseUp(handler, e, units, factories, selectedUnits, selectionManager, cursorManager, options = {}) {
  gameState.isRightDragging = false

  if (handler.requestRenderFrame) {
    handler.requestRenderFrame()
  }

  if (!handler.rightWasDragging && !options.preserveSelection) {
    units.forEach(u => { if (selectionManager.isSelectableUnit(u)) u.selected = false })
    factories.forEach(f => { f.selected = false })
    if (gameState.buildings) {
      gameState.buildings.forEach(b => { if (selectionManager.isHumanPlayerBuilding(b)) b.selected = false })
    }

    selectedUnits.length = 0
    handler.updateAGFCapability(selectedUnits)
  }
  handler.rightWasDragging = false

  cursorManager.updateCustomCursor(e, gameState.mapGrid || [], factories, selectedUnits, units)
}

export function resetContextMode(gameCanvas) {
  gameCanvas.style.cursor = GAME_DEFAULT_CURSOR
}
