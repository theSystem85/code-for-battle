import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { suspendRemoteControlAutoFocus } from '../game/remoteControl.js'
import { notifyBenchmarkManualCameraControl } from '../benchmark/benchmarkTracker.js'
import { getPlayableViewportHeight, getPlayableViewportWidth } from '../utils/layoutMetrics.js'
import { notifyMapEditorWheel } from '../ui/mapEditorControls.js'

// Input-event work only: constant cost, independent of unit count and canvas DPR.
// Pixel wheel deltas already include the OS's natural-scroll direction and momentum.
export function setupMapPanning(canvas, mapGrid, requestRenderFrame) {
  let drag = null
  let dragMode = false
  let suppressClickUntil = 0
  const button = document.getElementById('mapPanBtn')

  const pan = (dx, dy) => {
    const grid = gameState.mapGrid?.length ? gameState.mapGrid : mapGrid
    if (!grid?.length || !Number.isFinite(dx) || !Number.isFinite(dy)) return
    suspendRemoteControlAutoFocus()
    if (gameState.smoothScroll) gameState.smoothScroll.active = false
    if (gameState.desktopEdgeScroll) {
      gameState.desktopEdgeScroll.overCanvas = false
      gameState.desktopEdgeScroll.edgeHoverStart = null
      gameState.desktopEdgeScroll.lastAutoScrollTime = null
    }
    if (gameState.dragVelocity) {
      gameState.dragVelocity.x = 0
      gameState.dragVelocity.y = 0
    }
    const width = getPlayableViewportWidth(canvas)
    const height = getPlayableViewportHeight(canvas)
    gameState.scrollOffset.x = Math.max(0, Math.min(gameState.scrollOffset.x + dx, Math.max(0, grid[0].length * TILE_SIZE - width)))
    gameState.scrollOffset.y = Math.max(0, Math.min(gameState.scrollOffset.y + dy, Math.max(0, grid.length * TILE_SIZE - height)))
    if (gameState.benchmarkActive) notifyBenchmarkManualCameraControl()
    requestRenderFrame?.()
  }

  canvas.addEventListener('wheel', event => {
    // Consume even at map bounds: never chain a delivered map gesture to history/page scrolling.
    event.preventDefault()
    event.stopPropagation()
    if (event.ctrlKey || event.metaKey) return // Browser pinch is not a camera pan.
    if (gameState.mapEditMode) {
      notifyMapEditorWheel(event.deltaY)
      requestRenderFrame?.()
      return
    }
    const scaleX = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? getPlayableViewportWidth(canvas) : 1
    const scaleY = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? getPlayableViewportHeight(canvas) : 1
    const horizontalFallback = event.shiftKey && event.deltaX === 0
    pan(horizontalFallback ? event.deltaY * scaleX : event.deltaX * scaleX,
      horizontalFallback ? 0 : event.deltaY * scaleY)
  }, { passive: false })

  const endDrag = () => {
    if (!drag) return
    const id = drag.id
    drag = null
    suppressClickUntil = performance.now() + 500
    if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id)
  }
  const setDragMode = enabled => {
    endDrag()
    dragMode = enabled
    button?.setAttribute('aria-pressed', String(enabled))
    button?.classList.toggle('active', enabled)
    canvas.classList.toggle('map-pan-active', enabled)
  }
  button?.addEventListener('click', () => setDragMode(!dragMode))
  for (const id of ['sellBtn', 'repairBtn']) {
    document.getElementById(id)?.addEventListener('click', () => setDragMode(false))
  }

  canvas.addEventListener('pointerdown', event => {
    if (!dragMode || event.button !== 0 || drag) return
    event.preventDefault()
    event.stopImmediatePropagation()
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
    canvas.setPointerCapture?.(event.pointerId)
  }, { capture: true, passive: false })
  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return
    event.preventDefault()
    event.stopImmediatePropagation()
    pan(drag.x - event.clientX, drag.y - event.clientY)
    drag.x = event.clientX
    drag.y = event.clientY
  }, { capture: true, passive: false })
  const finish = event => {
    if (!drag || event.pointerId !== drag.id) return
    event.preventDefault()
    event.stopImmediatePropagation()
    endDrag()
  }
  canvas.addEventListener('pointerup', finish, { capture: true, passive: false })
  canvas.addEventListener('pointercancel', finish, { capture: true, passive: false })
  canvas.addEventListener('lostpointercapture', endDrag)
  window.addEventListener('blur', endDrag)
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dragMode) setDragMode(false)
  })
  // Pointer capture handles release outside the map; consume compatibility mouse
  // events so dragging cannot also select, issue commands, paint, place or sell.
  for (const type of ['mousedown', 'mousemove', 'mouseup', 'click', 'dblclick']) {
    canvas.addEventListener(type, event => {
      const primary = type === 'mousemove' ? (event.buttons & 1) !== 0 : event.button === 0
      if (dragMode && primary || type === 'click' && performance.now() < suppressClickUntil) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }, { capture: true })
  }
}
