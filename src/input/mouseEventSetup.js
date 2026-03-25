import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { handlePointerDown as handleMapEditPointerDown, handlePointerMove as handleMapEditPointerMove, handlePointerUp as handleMapEditPointerUp } from '../mapEditor.js'
import { notifyMapEditorWheel } from '../ui/mapEditorControls.js'
import { hideLlmQueueTooltip } from '../ui/llmQueueTooltip.js'
import { isLocalPartyAutomationLocked } from '../network/multiplayerStore.js'
import { keybindingManager, KEYBINDING_CONTEXTS } from './keybindings.js'
import { isReplayInteractionLocked } from '../replaySystem.js'

export function setupMouseEvents(handler, gameCanvas, units, factories, mapGrid, selectedUnits, selectionManager, unitCommands, cursorManager) {
  handler.gameFactories = factories
  handler.gameUnits = units
  handler.selectionManager = selectionManager

  gameCanvas.addEventListener('contextmenu', e => e.preventDefault())

  gameCanvas.addEventListener('mousedown', e => {
    const rect = gameCanvas.getBoundingClientRect()
    const worldX = e.clientX - rect.left + gameState.scrollOffset.x
    const worldY = e.clientY - rect.top + gameState.scrollOffset.y

    if (gameState.mapEditMode && e.button === 0) {
      const tileX = Math.floor(worldX / TILE_SIZE)
      const tileY = Math.floor(worldY / TILE_SIZE)
      handleMapEditPointerDown(tileX, tileY, { button: e.button, shiftKey: e.shiftKey, metaKey: e.metaKey || e.ctrlKey })
      if (handler.requestRenderFrame) handler.requestRenderFrame()
      return
    }

    if (gameState.paused) return

    const isSpectatorOrDefeated = gameState.isSpectator || gameState.localPlayerDefeated || gameState.hostPausedByRemote
    const replayLocked = isReplayInteractionLocked() || isLocalPartyAutomationLocked()

    const pointerContext = gameState.mapEditMode ? KEYBINDING_CONTEXTS.MAP_EDIT_ON : KEYBINDING_CONTEXTS.MAP_EDIT_OFF
    const commandBinding = keybindingManager.matchesPointerAction('mouse', e, 'command', pointerContext) ||
      keybindingManager.matchesPointerAction('mouse', e, 'queue-command', pointerContext)
    const selectionBinding = keybindingManager.matchesPointerAction('mouse', e, 'select', pointerContext) ||
      keybindingManager.matchesPointerAction('mouse', e, 'select-add', pointerContext) ||
      keybindingManager.matchesPointerAction('mouse', e, 'select-type', pointerContext) ||
      keybindingManager.matchesPointerAction('mouse', e, 'force-attack', pointerContext) ||
      keybindingManager.matchesPointerAction('mouse', e, 'guard', pointerContext)

    if (e.button === 2 || (commandBinding && !replayLocked)) {
      handler.handleRightMouseDown(e, worldX, worldY, gameCanvas, cursorManager)
    } else if ((selectionBinding || e.button === 0) && !isSpectatorOrDefeated) {
      handler.handleLeftMouseDown(e, worldX, worldY, gameCanvas, selectedUnits, cursorManager)
    }
  })

  gameCanvas.addEventListener('mousemove', e => {
    const rect = gameCanvas.getBoundingClientRect()
    const worldX = e.clientX - rect.left + gameState.scrollOffset.x
    const worldY = e.clientY - rect.top + gameState.scrollOffset.y

    if (gameState.mapEditMode && (e.buttons & 1) && !(e.buttons & 2)) {
      const tileX = Math.floor(worldX / TILE_SIZE)
      const tileY = Math.floor(worldY / TILE_SIZE)
      handleMapEditPointerMove(tileX, tileY, e.buttons, e.shiftKey, e.metaKey || e.ctrlKey)
      if (handler.requestRenderFrame) handler.requestRenderFrame()
      return
    }

    if (gameState.paused) return

    handler.updateEnemyHover(worldX, worldY, units, factories, selectedUnits, cursorManager)

    if (gameState.isRightDragging) {
      handler.handleRightDragScrolling(e, mapGrid, gameCanvas)
      return
    }

    if (handler.isSelecting || handler.attackGroupHandler.isAttackGroupSelecting) {
      handler.updateSelectionRectangle(worldX, worldY, cursorManager)
    }

    cursorManager.updateCustomCursor(e, mapGrid, factories, selectedUnits, units)
  })

  gameCanvas.addEventListener('mouseup', e => {
    const rect = gameCanvas.getBoundingClientRect()
    const worldX = e.clientX - rect.left + gameState.scrollOffset.x
    const worldY = e.clientY - rect.top + gameState.scrollOffset.y
    const replayLocked = isReplayInteractionLocked() || isLocalPartyAutomationLocked()

    if (gameState.mapEditMode) {
      const tileX = Math.floor(worldX / TILE_SIZE)
      const tileY = Math.floor(worldY / TILE_SIZE)
      handleMapEditPointerUp(tileX, tileY, { button: e.button, shiftKey: e.shiftKey, metaKey: e.metaKey || e.ctrlKey })
      if (handler.requestRenderFrame) handler.requestRenderFrame()
      if (e.button !== 2) {
        return
      }
    }

    if (gameState.paused) return

    const isSpectatorOrDefeated = gameState.isSpectator || gameState.localPlayerDefeated || gameState.hostPausedByRemote
    if (e.button === 2) {
      handler.handleRightMouseUp(e, units, factories, selectedUnits, selectionManager, cursorManager, {
        preserveSelection: replayLocked
      })
    } else if (e.button === 0 && !isSpectatorOrDefeated) {
      handler.handleLeftMouseUp(e, units, factories, mapGrid, selectedUnits, selectionManager, unitCommands, cursorManager)
    }
  })

  gameCanvas.addEventListener('contextmenu', (e) => {
    handler.handleContextMenu(e, gameCanvas)
  })

  gameCanvas.addEventListener('wheel', (e) => {
    if (!gameState.mapEditMode) return
    notifyMapEditorWheel(e.deltaY)
    if (handler.requestRenderFrame) handler.requestRenderFrame()
  }, { passive: true })


  gameCanvas.addEventListener('mouseleave', () => {
    const edgeScrollState = gameState.desktopEdgeScroll
    if (edgeScrollState) {
      edgeScrollState.overCanvas = false
      edgeScrollState.edgeHoverStart = null
      edgeScrollState.lastAutoScrollTime = null
    }
  })

  gameCanvas.addEventListener('mouseleave', () => {
    // Only hide the LLM queue tooltip if no enemy building is currently selected.
    // Without this guard the tooltip disappears as soon as the pointer enters the
    // tooltip overlay (which is a sibling of the canvas, triggering mouseleave).
    const humanPlayer = gameState.humanPlayer || 'player1'
    const isEnemy = (owner) => owner !== humanPlayer && !(humanPlayer === 'player1' && owner === 'player')
    const allBuildings = [
      ...(gameState.buildings || []),
      ...(gameState.factories || [])
    ]
    const enemyBuildingSelected = allBuildings.some(b => b && isEnemy(b.owner) && b.selected)
    if (!enemyBuildingSelected) {
      hideLlmQueueTooltip()
    }
  })

  document.addEventListener('mouseup', (e) => {
    if (e.button === 2 && gameState.isRightDragging) {
      const replayLocked = isReplayInteractionLocked() || isLocalPartyAutomationLocked()
      handler.handleRightMouseUp(
        e,
        units,
        factories,
        selectedUnits,
        selectionManager,
        cursorManager,
        { preserveSelection: replayLocked }
      )
    }
  })

  handler.setupTouchEvents(
    gameCanvas,
    units,
    factories,
    mapGrid,
    selectedUnits,
    selectionManager,
    unitCommands,
    cursorManager
  )
}
