import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import {
  getPlayableViewportHeight,
  getPlayableViewportWidth,
  getSafeAreaInset,
  getMobileActionBarWidth
} from '../utils/layoutMetrics.js'
import { isReplayModeActive } from '../replaySystem.js'

const MOBILE_EDGE_SCROLL_THRESHOLD = 20
const MOBILE_EDGE_SCROLL_SPEED_PER_MS = 0.14
const MOBILE_EDGE_SCROLL_DEFAULT_FRAME_MS = 16
const MOBILE_EDGE_SCROLL_MAX_FRAME_MS = 64

export function attachMobileDragHandlers(controller, button, detail) {
  if (!window.PointerEvent) {
    return
  }

  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') {
      return
    }
    if (isReplayModeActive() || gameState.gamePaused || button.classList.contains('disabled')) {
      return
    }

    controller.suppressNextClick = false

    const state = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      mode: null,
      detail,
      button
    }

    const lockables = []
    const sidebarScroll = document.getElementById('sidebarScroll')
    const sidebar = document.getElementById('sidebar')
    const mobileBuildMenu = document.getElementById('mobileBuildMenuContainer')
    const mobileProductionScroll = document.querySelector('#mobileBuildMenuContainer #production')

    const captureLockState = (element) => {
      if (!element) {
        return
      }
      lockables.push({
        element,
        previousTouchAction: element.style.touchAction,
        previousOverflowY: element.style.overflowY,
        previousWebkitOverflowScrolling: element.style.webkitOverflowScrolling,
        applied: false
      })
    }

    const isMobileLandscape = document.body && document.body.classList.contains('mobile-landscape')
    if (isMobileLandscape) {
      captureLockState(mobileProductionScroll)
      captureLockState(mobileBuildMenu)
    } else {
      captureLockState(sidebarScroll)
      captureLockState(sidebar)
    }

    if (lockables.length > 0) {
      state.scrollLocks = lockables
      state.applyScrollLocks = () => {
        if (state.scrollLocksApplied) {
          return
        }
        lockables.forEach(lock => {
          if (!lock.element) {
            return
          }
          lock.element.style.touchAction = 'none'
          lock.element.style.overflowY = 'hidden'
          lock.element.style.webkitOverflowScrolling = 'auto'
          lock.applied = true
        })
        state.scrollLocksApplied = true
      }
      state.releaseScrollLocks = () => {
        lockables.forEach(lock => {
          if (!lock.element || !lock.applied) {
            return
          }
          const { element, previousTouchAction, previousOverflowY, previousWebkitOverflowScrolling } = lock
          element.style.touchAction = previousTouchAction || ''
          element.style.overflowY = previousOverflowY || ''
          element.style.webkitOverflowScrolling = previousWebkitOverflowScrolling || ''
          lock.applied = false
        })
      }
    }

    state.scrollLocksApplied = false

    const primaryScrollContainer = isMobileLandscape
      ? (mobileProductionScroll || mobileBuildMenu)
      : (sidebarScroll || sidebar)

    state.interactionElement = primaryScrollContainer || button

    controller.mobileDragState = state

    const handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== state.pointerId) {
        return
      }

      const deltaX = moveEvent.clientX - state.startX
      const deltaY = moveEvent.clientY - state.startY
      const absDeltaX = Math.abs(deltaX)
      const absDeltaY = Math.abs(deltaY)
      const pointerOutsideBar = (() => {
        if (!state.interactionElement) {
          return false
        }
        const bounds = state.interactionElement.getBoundingClientRect()
        return (
          moveEvent.clientX < bounds.left ||
          moveEvent.clientX > bounds.right ||
          moveEvent.clientY < bounds.top ||
          moveEvent.clientY > bounds.bottom
        )
      })()

      const activateDrag = () => {
        if (state.mode === 'drag') {
          return
        }
        if (typeof state.applyScrollLocks === 'function') {
          state.applyScrollLocks()
        }
        state.active = true
        state.mode = 'drag'
        controller.suppressNextClick = true
        if (detail.kind === 'building') {
          gameState.draggedBuildingType = detail.type
          gameState.draggedBuildingButton = button
          gameState.buildingPlacementMode = true
          gameState.currentBuildingType = detail.type
        } else if (detail.kind === 'unit') {
          gameState.draggedUnitType = detail.type
          gameState.draggedUnitButton = button
        }
      }

      if (!state.mode) {
        if (pointerOutsideBar) {
          activateDrag()
        } else if (absDeltaX >= 8 || absDeltaY >= 8) {
          if (absDeltaY > absDeltaX) {
            state.mode = 'scroll'
          } else {
            activateDrag()
          }
        }
      } else if (state.mode === 'scroll' && pointerOutsideBar) {
        activateDrag()
      }

      if (state.active && state.mode === 'drag') {
        moveEvent.preventDefault()
        controller.updateMobileDragHover(moveEvent, detail)
      }
    }

    const handleEnd = (endEvent) => {
      if (endEvent.pointerId !== state.pointerId) {
        return
      }

      window.removeEventListener('pointermove', handleMove, true)
      window.removeEventListener('pointerup', handleEnd, true)
      window.removeEventListener('pointercancel', handleEnd, true)

      if (state.active && state.mode === 'drag') {
        document.dispatchEvent(new CustomEvent('mobile-production-drop', {
          detail: {
            kind: detail.kind,
            type: detail.type,
            button,
            clientX: endEvent.clientX,
            clientY: endEvent.clientY
          }
        }))
      } else {
        controller.suppressNextClick = false
      }

      if (detail.kind === 'building' && gameState.draggedBuildingType === detail.type) {
        gameState.draggedBuildingType = null
        gameState.draggedBuildingButton = null
        gameState.buildingPlacementMode = false
        gameState.currentBuildingType = null
      } else if (detail.kind === 'unit' && gameState.draggedUnitType === detail.type) {
        gameState.draggedUnitType = null
        gameState.draggedUnitButton = null
      }

      if (typeof state.releaseScrollLocks === 'function') {
        state.releaseScrollLocks()
      }

      state.scrollLocks = null
      state.applyScrollLocks = null
      state.releaseScrollLocks = null
      state.scrollLocksApplied = false

      controller.mobileDragState = null
      controller.lastMobileEdgeScrollTime = null
    }

    window.addEventListener('pointermove', handleMove, { passive: false, capture: true })
    window.addEventListener('pointerup', handleEnd, { passive: false, capture: true })
    window.addEventListener('pointercancel', handleEnd, { passive: false, capture: true })
  })

  button.addEventListener('click', (event) => {
    if (controller.suppressNextClick) {
      event.preventDefault()
      event.stopImmediatePropagation()
      controller.suppressNextClick = false
    }
  })
}

export function isUpperHalfClick(_controller, event, button) {
  if (!button) {
    return true
  }

  const rect = button.getBoundingClientRect()
  if (!rect || rect.height === 0) {
    return true
  }

  let clientY = typeof event?.clientY === 'number' ? event.clientY : NaN

  if (!Number.isFinite(clientY)) {
    const touch = event?.changedTouches?.[0] || event?.touches?.[0]
    if (touch && typeof touch.clientY === 'number') {
      clientY = touch.clientY
    }
  }

  if (!Number.isFinite(clientY)) {
    return true
  }

  const relativeY = clientY - rect.top
  if (!Number.isFinite(relativeY)) {
    return true
  }

  return relativeY <= rect.height / 2
}

export function showStackDirectionIndicator(_controller, button, direction) {
  if (!button) {
    return
  }

  let indicator = button.querySelector('.stack-direction-indicator')
  if (!indicator) {
    indicator = document.createElement('div')
    indicator.className = 'stack-direction-indicator align-top'
    const arrow = document.createElement('div')
    arrow.className = 'arrow-shape'
    indicator.appendChild(arrow)
    button.appendChild(indicator)
  }

  indicator.classList.remove('align-top', 'align-bottom')
  indicator.classList.add(direction === 'increase' ? 'align-top' : 'align-bottom')
  indicator.classList.add('visible')

  if (indicator._hideTimer) {
    clearTimeout(indicator._hideTimer)
  }

  indicator._hideTimer = setTimeout(() => {
    indicator.classList.remove('visible')
    indicator._hideTimer = null
  }, 500)
}

export function updateMobileDragHover(controller, event, detail) {
  const gameCanvas = document.getElementById('gameCanvas')
  if (!gameCanvas) return

  const rect = gameCanvas.getBoundingClientRect()

  // Start continuous edge scrolling when drag enters edge zone
  if (!controller.edgeScrollAnimationFrame) {
    const edgeScrollLoop = () => {
      if (!controller.mobileDragState || !controller.mobileDragState.active) {
        controller.edgeScrollAnimationFrame = null
        controller.lastMobileEdgeScrollTime = null
        return
      }

      // Use last known pointer position from drag state
      const syntheticEvent = {
        clientX: controller.mobileDragState.lastClientX || event.clientX,
        clientY: controller.mobileDragState.lastClientY || event.clientY,
        timeStamp: performance.now()
      }

      const currentRect = gameCanvas.getBoundingClientRect()
      applyMobileEdgeScroll(controller, syntheticEvent, gameCanvas, currentRect)

      controller.edgeScrollAnimationFrame = requestAnimationFrame(edgeScrollLoop)
    }

    controller.edgeScrollAnimationFrame = requestAnimationFrame(edgeScrollLoop)
  }

  // Store last pointer position for edge scroll loop
  if (controller.mobileDragState) {
    controller.mobileDragState.lastClientX = event.clientX
    controller.mobileDragState.lastClientY = event.clientY
  }

  applyMobileEdgeScroll(controller, event, gameCanvas, rect)

  const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
    event.clientY >= rect.top && event.clientY <= rect.bottom

  if (detail.kind === 'building') {
    if (inside) {
      gameState.buildingPlacementMode = true
      gameState.currentBuildingType = detail.type
      gameState.cursorX = event.clientX - rect.left + gameState.scrollOffset.x
      gameState.cursorY = event.clientY - rect.top + gameState.scrollOffset.y
    } else if (
      gameState.currentBuildingType === detail.type &&
      gameState.draggedBuildingType === detail.type
    ) {
      gameState.buildingPlacementMode = false
    }
  } else if (detail.kind === 'unit' && inside) {
    gameState.cursorX = event.clientX - rect.left + gameState.scrollOffset.x
    gameState.cursorY = event.clientY - rect.top + gameState.scrollOffset.y
  }
}

export function applyMobileEdgeScroll(controller, event, gameCanvas, rect) {
  const mapGrid = gameState.mapGrid
  if (!Array.isArray(mapGrid) || mapGrid.length === 0 || !Array.isArray(mapGrid[0])) {
    return
  }

  const viewportWidth = getPlayableViewportWidth(gameCanvas)
  const viewportHeight = getPlayableViewportHeight(gameCanvas)
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return
  }

  const maxScrollX = Math.max(0, mapGrid[0].length * TILE_SIZE - viewportWidth)
  const maxScrollY = Math.max(0, mapGrid.length * TILE_SIZE - viewportHeight)
  if (maxScrollX <= 0 && maxScrollY <= 0) {
    return
  }

  const thresholdX = Math.min(MOBILE_EDGE_SCROLL_THRESHOLD, rect.width / 2)
  const thresholdY = Math.min(MOBILE_EDGE_SCROLL_THRESHOLD, rect.height / 2)
  const hasHorizontalScroll = maxScrollX > 0 && thresholdX > 0
  const hasVerticalScroll = maxScrollY > 0 && thresholdY > 0

  if (!hasHorizontalScroll && !hasVerticalScroll) {
    return
  }

  const timestamp = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now()
  let deltaMs = MOBILE_EDGE_SCROLL_DEFAULT_FRAME_MS
  if (typeof controller.lastMobileEdgeScrollTime === 'number') {
    const elapsed = timestamp - controller.lastMobileEdgeScrollTime
    if (Number.isFinite(elapsed) && elapsed > 0) {
      deltaMs = Math.min(MOBILE_EDGE_SCROLL_MAX_FRAME_MS, elapsed)
    }
  }
  controller.lastMobileEdgeScrollTime = timestamp

  const speedPerMs = MOBILE_EDGE_SCROLL_SPEED_PER_MS
  let scrollDeltaX = 0
  let scrollDeltaY = 0

  const safeLeftInset = getSafeAreaInset('left')
  const safeTopInset = getSafeAreaInset('top')
  const safeBottomInset = getSafeAreaInset('bottom')
  const actionBarInset = getMobileActionBarWidth()
  const horizontalViewport = Math.max(0, viewportWidth - actionBarInset)

  // Calculate effective edges accounting for mobile overlays and safe areas
  const effectiveLeft = rect.left + safeLeftInset + actionBarInset
  const effectiveRight = effectiveLeft + horizontalViewport
  const effectiveTop = rect.top + safeTopInset
  const effectiveBottom = Math.max(effectiveTop, rect.bottom - safeBottomInset)

  if (hasHorizontalScroll) {
    if (event.clientX <= effectiveLeft + thresholdX) {
      const distance = Math.max(0, (effectiveLeft + thresholdX) - event.clientX)
      const ratio = Math.min(1, distance / thresholdX)
      const intensity = ratio * (1 + ratio)
      scrollDeltaX = -speedPerMs * intensity * deltaMs
    } else if (event.clientX >= effectiveRight - thresholdX) {
      const distance = Math.max(0, event.clientX - (effectiveRight - thresholdX))
      const ratio = Math.min(1, distance / thresholdX)
      const intensity = ratio * (1 + ratio)
      scrollDeltaX = speedPerMs * intensity * deltaMs
    }
  }

  if (hasVerticalScroll) {
    if (event.clientY <= effectiveTop + thresholdY) {
      const distance = Math.max(0, (effectiveTop + thresholdY) - event.clientY)
      const ratio = Math.min(1, distance / thresholdY)
      const intensity = ratio * (1 + ratio)
      scrollDeltaY = -speedPerMs * intensity * deltaMs
    } else if (event.clientY >= effectiveBottom - thresholdY) {
      const distance = Math.max(0, event.clientY - (effectiveBottom - thresholdY))
      const ratio = Math.min(1, distance / thresholdY)
      const intensity = ratio * (1 + ratio)
      scrollDeltaY = speedPerMs * intensity * deltaMs
    }
  }

  if (scrollDeltaX !== 0 || scrollDeltaY !== 0) {
    const nextScrollX = Math.max(0, Math.min(gameState.scrollOffset.x + scrollDeltaX, maxScrollX))
    const nextScrollY = Math.max(0, Math.min(gameState.scrollOffset.y + scrollDeltaY, maxScrollY))

    if (nextScrollX !== gameState.scrollOffset.x || nextScrollY !== gameState.scrollOffset.y) {
      gameState.scrollOffset.x = nextScrollX
      gameState.scrollOffset.y = nextScrollY
      gameState.dragVelocity.x = 0
      gameState.dragVelocity.y = 0
    }
  }
}
