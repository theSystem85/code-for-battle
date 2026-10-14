import { TILE_SIZE, INVERT_TOUCH_MAP_SCROLL } from '../config.js'
import { gameState } from '../gameState.js'
import { suspendRemoteControlAutoFocus } from '../game/remoteControl.js'
import { notifyBenchmarkManualCameraControl } from '../benchmark/benchmarkTracker.js'
import { getPlayableViewportHeight, getPlayableViewportWidth } from '../utils/layoutMetrics.js'
import { notifyMapEditorWheel } from '../ui/mapEditorControls.js'

// Input-event work only: constant cost, independent of unit count and canvas DPR.
// Pixel wheel deltas already include the OS's natural-scroll direction and momentum.
export function setupMapPanning(canvas, mapGrid, requestRenderFrame) {
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
    const direction = INVERT_TOUCH_MAP_SCROLL ? -1 : 1
    pan(direction * (horizontalFallback ? event.deltaY * scaleX : event.deltaX * scaleX),
      direction * (horizontalFallback ? 0 : event.deltaY * scaleY))
  }, { passive: false })

}
