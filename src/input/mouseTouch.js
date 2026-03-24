import { gameState } from '../gameState.js'
import { suspendRemoteControlAutoFocus } from '../game/remoteControl.js'
import { isReplayModeActive } from '../replaySystem.js'
import {
  createSyntheticMouseEvent,
  createSyntheticMouseEventFromCoords,
  getTouchCenter
} from './mouseHelpers.js'

export function setupTouchEvents(handler, gameCanvas, units, factories, mapGrid, selectedUnits, selectionManager, unitCommands, cursorManager) {
  if (!window.PointerEvent) {
    return
  }

  const activePointers = handler.activeTouchPointers
  const getWorldPosition = (evt) => {
    const rect = gameCanvas.getBoundingClientRect()
    return {
      worldX: evt.clientX - rect.left + gameState.scrollOffset.x,
      worldY: evt.clientY - rect.top + gameState.scrollOffset.y
    }
  }

  const startRightPanFromClient = (clientX, clientY, sourceEvent = null) => {
    const rect = gameCanvas.getBoundingClientRect()
    const synthetic = sourceEvent
      ? createSyntheticMouseEvent(sourceEvent, gameCanvas, 2)
      : createSyntheticMouseEventFromCoords(gameCanvas, clientX, clientY, 2)

    handler.handleRightMouseDown(
      synthetic,
      clientX - rect.left + gameState.scrollOffset.x,
      clientY - rect.top + gameState.scrollOffset.y,
      gameCanvas,
      cursorManager
    )
  }

  const startLongPress = (touchState) => {
    if (touchState.longPressTimer) {
      clearTimeout(touchState.longPressTimer)
    }
    touchState.longPressTimer = window.setTimeout(() => {
      touchState.longPressTimer = null
      touchState.longPressFired = true
      touchState.rightActive = true
      startRightPanFromClient(
        touchState.lastEvent?.clientX ?? touchState.startX,
        touchState.lastEvent?.clientY ?? touchState.startY,
        touchState.lastEvent || null
      )
    }, handler.longPressDuration)
  }

  const cancelLongPress = (touchState) => {
    if (touchState && touchState.longPressTimer) {
      clearTimeout(touchState.longPressTimer)
      touchState.longPressTimer = null
    }
  }

  const beginTwoFingerPan = () => {
    if (handler.twoFingerPan || activePointers.size < 2) {
      return
    }
    const pointerIds = Array.from(activePointers.keys()).slice(0, 2)
    const center = getTouchCenter(pointerIds, activePointers)
    handler.twoFingerPan = {
      pointerIds,
      lastCenter: center
    }
    suspendRemoteControlAutoFocus()
    pointerIds.forEach(id => {
      const state = activePointers.get(id)
      if (state) {
        state.skipTapAfterPan = true
        state.leftActive = false
      }
    })
    handler.isSelecting = false
    gameState.selectionActive = false
    handler.wasDragging = false
    handler.attackGroupHandler.isAttackGroupSelecting = false
    activePointers.forEach(cancelLongPress)
    startRightPanFromClient(center.x, center.y)
  }

  const updateTwoFingerPan = () => {
    if (!handler.twoFingerPan) return
    const { pointerIds } = handler.twoFingerPan
    if (!pointerIds.every(id => activePointers.has(id))) {
      return
    }
    const center = getTouchCenter(pointerIds, activePointers)
    handler.twoFingerPan.lastCenter = center
    const synthetic = createSyntheticMouseEventFromCoords(gameCanvas, center.x, center.y, 2)
    handler.handleRightDragScrolling(synthetic, mapGrid, gameCanvas)
  }

  const endTwoFingerPan = (event) => {
    if (!handler.twoFingerPan) return
    const synthetic = createSyntheticMouseEvent(event, gameCanvas, 2)
    handler.handleRightMouseUp(synthetic, units, factories, selectedUnits, selectionManager, cursorManager, {
      preserveSelection: isReplayModeActive()
    })
    const endedTouch = activePointers.get(event.pointerId)
    if (endedTouch) {
      endedTouch.skipTapAfterPan = true
    }
    const remainingPointerId = handler.twoFingerPan.pointerIds.find(id => id !== event.pointerId && activePointers.has(id))
    handler.twoFingerPan = null
    if (remainingPointerId) {
      const remaining = activePointers.get(remainingPointerId)
      if (remaining) {
        remaining.startX = remaining.lastEvent?.clientX ?? remaining.startX
        remaining.startY = remaining.lastEvent?.clientY ?? remaining.startY
        remaining.leftActive = false
        remaining.rightActive = false
        remaining.longPressFired = false
        remaining.skipTapAfterPan = true
        startLongPress(remaining)
      }
    }
  }

  gameCanvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') {
      return
    }
    if (gameState.buildingPlacementMode || gameState.mobileBuildPaintMode) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    const touchState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastEvent: event,
      leftActive: false,
      rightActive: false,
      longPressFired: false,
      longPressTimer: null,
      skipTapAfterPan: false
    }
    activePointers.set(event.pointerId, touchState)
    if (!isReplayModeActive()) {
      startLongPress(touchState)
    }
    if (activePointers.size >= 2) {
      beginTwoFingerPan()
    }
  }, { passive: false })

  gameCanvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'touch') {
      return
    }
    const touchState = activePointers.get(event.pointerId)
    if (gameState.buildingPlacementMode || gameState.mobileBuildPaintMode) {
      event.preventDefault()
      if (touchState) {
        cancelLongPress(touchState)
      }
      activePointers.delete(event.pointerId)
      if (handler.twoFingerPan && handler.twoFingerPan.pointerIds.includes(event.pointerId)) {
        handler.twoFingerPan = null
      }
      return
    }
    if (!touchState) {
      return
    }
    event.preventDefault()
    touchState.lastEvent = event

    if (handler.twoFingerPan && handler.twoFingerPan.pointerIds.includes(event.pointerId)) {
      updateTwoFingerPan()
      return
    }

    const movement = Math.hypot(event.clientX - touchState.startX, event.clientY - touchState.startY)
    if (!touchState.skipTapAfterPan && !touchState.longPressFired && !touchState.leftActive && movement > 8) {
      cancelLongPress(touchState)
      touchState.leftActive = true
      const { worldX, worldY } = getWorldPosition(event)
      const synthetic = createSyntheticMouseEvent(event, gameCanvas, 0)
      handler.handleLeftMouseDown(synthetic, worldX, worldY, gameCanvas, selectedUnits, cursorManager)
    }

    const { worldX, worldY } = getWorldPosition(event)
    handler.updateEnemyHover(worldX, worldY, units, factories, selectedUnits, cursorManager)

    if (touchState.leftActive) {
      handler.updateSelectionRectangle(worldX, worldY, cursorManager)
    } else if (touchState.longPressFired && gameState.isRightDragging) {
      const synthetic = createSyntheticMouseEvent(event, gameCanvas, 2)
      handler.handleRightDragScrolling(synthetic, mapGrid, gameCanvas)
    }

    cursorManager.updateCustomCursor(event, mapGrid, factories, selectedUnits, units)
  }, { passive: false })

  const handlePointerEnd = (event) => {
    if (event.pointerType !== 'touch') {
      return
    }
    const touchState = activePointers.get(event.pointerId)
    if (gameState.buildingPlacementMode || gameState.mobileBuildPaintMode) {
      event.preventDefault()
      if (touchState) {
        cancelLongPress(touchState)
      }
      activePointers.delete(event.pointerId)
      if (handler.twoFingerPan && handler.twoFingerPan.pointerIds.includes(event.pointerId)) {
        handler.twoFingerPan = null
      }
      return
    }
    if (!touchState) {
      return
    }
    event.preventDefault()
    cancelLongPress(touchState)

    const wasPanPointer = handler.twoFingerPan && handler.twoFingerPan.pointerIds.includes(event.pointerId)
    if (wasPanPointer) {
      endTwoFingerPan(event)
    } else if (touchState.longPressFired) {
      const synthetic = createSyntheticMouseEvent(event, gameCanvas, 2)
      handler.handleRightMouseUp(synthetic, units, factories, selectedUnits, selectionManager, cursorManager, {
        preserveSelection: isReplayModeActive()
      })
    } else if (!touchState.skipTapAfterPan) {
      const { worldX, worldY } = getWorldPosition(event)
      const synthetic = createSyntheticMouseEvent(event, gameCanvas, 0)
      if (!touchState.leftActive) {
        handler.handleLeftMouseDown(synthetic, worldX, worldY, gameCanvas, selectedUnits, cursorManager)
      }
      handler.handleLeftMouseUp(synthetic, units, factories, mapGrid, selectedUnits, selectionManager, unitCommands, cursorManager)
    }

    activePointers.delete(event.pointerId)
  }

  gameCanvas.addEventListener('pointerup', handlePointerEnd, { passive: false })
  gameCanvas.addEventListener('pointercancel', handlePointerEnd, { passive: false })
}
