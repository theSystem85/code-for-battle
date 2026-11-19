// minimap.js
// Handle minimap interaction and navigation

import { gameState } from '../gameState.js'
import { MAP_TILES_X, MAP_TILES_Y, TILE_SIZE } from '../config.js'
import {
  getPlayableViewportHeight,
  getPlayableViewportWidth
} from '../utils/layoutMetrics.js'

export function setupMinimapHandlers(gameCanvas, setSatelliteEnabled) {
  const minimapElement = document.getElementById('minimap')
  if (!minimapElement) {
    return
  }

  mobileMinimapState.minimapElement = minimapElement
  mobileMinimapState.gameCanvas = gameCanvas

  const satelliteToggle = document.getElementById('minimapSatelliteToggle')
  satelliteToggle?.addEventListener('click', () => {
    const enabled = satelliteToggle.getAttribute('aria-pressed') !== 'true'
    setSatelliteEnabled?.(enabled)
    satelliteToggle.setAttribute('aria-pressed', String(enabled))
    const label = enabled ? 'Switch to normal view' : 'Switch to satellite view'
    satelliteToggle.setAttribute('aria-label', label)
    satelliteToggle.title = label
  })
  const stopToggleShortcut = event => {
    if (event.key === ' ' || event.key === 'Enter') event.stopPropagation()
  }
  satelliteToggle?.addEventListener('keydown', stopToggleShortcut)
  satelliteToggle?.addEventListener('keyup', stopToggleShortcut)

  // Handle minimap dragging state
  let isMinimapDragging = false
  let activeTouchId = null

  const handlePointerNavigation = (point, options = {}) => {
    if (!point) {
      return
    }
    handleMinimapClick(
      { target: minimapElement, clientX: point.clientX, clientY: point.clientY },
      gameCanvas,
      options
    )
  }

  minimapElement.addEventListener('mousedown', (e) => {
    if (e.button === 0 || e.button === 2) {
      e.preventDefault()
      isMinimapDragging = true
      handlePointerNavigation(e, { smooth: false })
    }
  })

  minimapElement.addEventListener('mousemove', (e) => {
    if (isMinimapDragging) {
      handlePointerNavigation(e, { smooth: false })
    }
  })

  // Use mouseup on the document to ensure we catch the event even if released outside the minimap
  document.addEventListener('mouseup', (e) => {
    if (isMinimapDragging) {
      // This is important - process one last time with the final cursor position
      // when it's still in drag mode before ending the drag
      if (e.target === minimapElement) {
        handlePointerNavigation(e, { smooth: false })
      }
      isMinimapDragging = false
    }
  })

  minimapElement.addEventListener('touchstart', (e) => {
    if (!e.touches || e.touches.length === 0) {
      return
    }
    const touch = e.touches[0]
    activeTouchId = touch.identifier
    isMinimapDragging = true
    e.preventDefault()
    handlePointerNavigation(touch, { smooth: true })
  }, { passive: false })

  minimapElement.addEventListener('touchmove', (e) => {
    if (!isMinimapDragging) {
      return
    }
    const touches = Array.from(e.touches || [])
    const touch = touches.find(t => t.identifier === activeTouchId) || touches[0]
    if (touch) {
      e.preventDefault()
      handlePointerNavigation(touch, { smooth: true })
    }
  }, { passive: false })

  const endTouchDrag = (e) => {
    if (!isMinimapDragging) {
      return
    }
    const changedTouches = Array.from(e.changedTouches || [])
    const touch = changedTouches.find(t => t.identifier === activeTouchId) || changedTouches[0]
    if (touch) {
      handlePointerNavigation(touch, { smooth: true })
    }
    isMinimapDragging = false
    activeTouchId = null
    e.preventDefault()
  }

  minimapElement.addEventListener('touchend', endTouchDrag, { passive: false })
  minimapElement.addEventListener('touchcancel', endTouchDrag, { passive: false })

  // Prevent context menu on minimap
  minimapElement.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    return false
  })
}

export function handleMinimapClick(e, gameCanvas, options = {}) {
  const { smooth = false } = options
  // Get minimap dimensions
  const minimap = e.target
  if (!minimap || typeof minimap.getBoundingClientRect !== 'function') {
    return
  }
  const minimapRect = minimap.getBoundingClientRect()
  if (!minimapRect || minimapRect.width === 0 || minimapRect.height === 0) {
    return
  }
  // Device pixel ratio not needed for this calculation
  // const pixelRatio = window.devicePixelRatio || 1

  // Calculate click position relative to minimap
  // Use CSS dimensions (display size) for calculating click position
  const clickX = (e.clientX - minimapRect.left) / minimapRect.width
  const clickY = (e.clientY - minimapRect.top) / minimapRect.height

  // Use logical (CSS) dimensions for scroll calculation, not the scaled canvas dimensions
  // The actual game coordinate space should use CSS dimensions
  const logicalCanvasWidth = getPlayableViewportWidth(gameCanvas)
  const logicalCanvasHeight = getPlayableViewportHeight(gameCanvas)

  // Calculate new scroll position
  const maxScrollX = Math.max(0, MAP_TILES_X * TILE_SIZE - logicalCanvasWidth)
  const maxScrollY = Math.max(0, MAP_TILES_Y * TILE_SIZE - logicalCanvasHeight)
  const newX = clickX * maxScrollX
  const newY = clickY * maxScrollY

  const targetX = Math.max(0, Math.min(newX, maxScrollX))
  const targetY = Math.max(0, Math.min(newY, maxScrollY))

  gameState.dragVelocity.x = 0
  gameState.dragVelocity.y = 0

  if (smooth && gameState.smoothScroll) {
    gameState.smoothScroll.targetX = targetX
    gameState.smoothScroll.targetY = targetY
    gameState.smoothScroll.active = true
  } else {
    gameState.scrollOffset.x = targetX
    gameState.scrollOffset.y = targetY
    if (gameState.smoothScroll) {
      gameState.smoothScroll.active = false
    }
  }
}

const mobileMinimapState = {
  overlay: null,
  button: null,
  originalParent: null,
  originalNextSibling: null,
  holdPointerId: null,
  layoutEnabled: false,
  initialized: false,
  keyActive: false,
  positionFrame: null,
  activeDragPointerId: null,
  gameCanvas: null,
  minimapElement: null
}

function ensureMobileMinimapElements() {
  if (typeof document === 'undefined') {
    return false
  }

  if (!mobileMinimapState.overlay || !mobileMinimapState.overlay.isConnected) {
    mobileMinimapState.overlay = document.getElementById('mobileMinimapOverlay')
  }

  if (!mobileMinimapState.button || !mobileMinimapState.button.isConnected) {
    mobileMinimapState.button = document.getElementById('mobileMinimapButton')
  }

  const minimap = document.getElementById('minimap')
  if (minimap) {
    mobileMinimapState.minimapElement = minimap
  }

  return !!(mobileMinimapState.overlay && mobileMinimapState.button && mobileMinimapState.minimapElement)
}

function parseCssPixelValue(value) {
  if (!value) {
    return 0
  }

  const trimmed = `${value}`.trim()
  if (!trimmed) {
    return 0
  }

  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) ? parsed : 0
}

function getSafeAreaInsets() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
    return { left: 0, bottom: 0 }
  }

  try {
    const style = window.getComputedStyle(document.body)
    return {
      left: parseCssPixelValue(style.getPropertyValue('--safe-area-left')),
      bottom: parseCssPixelValue(style.getPropertyValue('--safe-area-bottom'))
    }
  } catch {
    return { left: 0, bottom: 0 }
  }
}

function syncMobileOverlaySize() {
  if (!ensureMobileMinimapElements()) {
    return
  }

  const { overlay, minimapElement } = mobileMinimapState
  if (!overlay || !minimapElement) {
    return
  }

  let widthValue = minimapElement.style.width
  let heightValue = minimapElement.style.height
  let minimapRect = null

  if ((!widthValue || !heightValue) && typeof minimapElement.getBoundingClientRect === 'function') {
    minimapRect = minimapElement.getBoundingClientRect()
  }

  if (!widthValue && minimapRect && minimapRect.width > 0) {
    widthValue = `${minimapRect.width}px`
  }

  if (!heightValue && minimapRect && minimapRect.height > 0) {
    heightValue = `${minimapRect.height}px`
  }

  if (widthValue) {
    overlay.style.width = widthValue
  }

  if (heightValue) {
    overlay.style.height = heightValue
  }
}

function restoreMinimapToOriginalParent() {
  if (typeof document === 'undefined') {
    return
  }

  const minimap = document.getElementById('minimap')
  const { overlay, originalParent, originalNextSibling } = mobileMinimapState
  if (!minimap) {
    return
  }

  if (overlay && overlay.contains(minimap) && originalParent) {
    if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
      originalParent.insertBefore(minimap, originalNextSibling)
    } else {
      originalParent.appendChild(minimap)
    }
  }

  mobileMinimapState.originalParent = null
  mobileMinimapState.originalNextSibling = null
}

function setMobileMinimapOverlayVisible(visible) {
  if (!ensureMobileMinimapElements()) {
    return
  }

  const minimap = mobileMinimapState.minimapElement || document.getElementById('minimap')
  if (minimap) {
    mobileMinimapState.minimapElement = minimap
  }

  const { overlay, button } = mobileMinimapState
  if (!minimap || !overlay) {
    return
  }

  if (visible) {
    if (!mobileMinimapState.layoutEnabled) {
      return
    }
    const currentParent = minimap.parentNode
    if (currentParent && currentParent !== overlay) {
      mobileMinimapState.originalParent = currentParent
      mobileMinimapState.originalNextSibling = minimap.nextSibling
    }
    if (minimap.parentNode !== overlay) {
      overlay.appendChild(minimap)
    }
    syncMobileOverlaySize()
    overlay.classList.add('visible')
    overlay.setAttribute('aria-hidden', 'false')
    if (button) {
      button.setAttribute('aria-pressed', 'true')
    }
    scheduleMobileOverlayPositionUpdate()
  } else {
    restoreMinimapToOriginalParent()
    if (overlay) {
      overlay.classList.remove('visible')
      overlay.setAttribute('aria-hidden', 'true')
      overlay.style.left = ''
      overlay.style.right = ''
      overlay.style.top = ''
      overlay.style.bottom = ''
      overlay.style.transform = ''
      overlay.style.width = ''
      overlay.style.height = ''
    }
    if (button) {
      button.setAttribute('aria-pressed', 'false')
    }
    if (mobileMinimapState.positionFrame !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(mobileMinimapState.positionFrame)
    }
    mobileMinimapState.positionFrame = null
    mobileMinimapState.activeDragPointerId = null
  }
}

function updateMobileOverlayPosition() {
  mobileMinimapState.positionFrame = null

  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return
  }

  if (!mobileMinimapState.layoutEnabled) {
    return
  }

  if (!ensureMobileMinimapElements()) {
    return
  }

  const { overlay, button } = mobileMinimapState
  if (!overlay || !button || !overlay.classList.contains('visible')) {
    return
  }

  syncMobileOverlaySize()

  const viewport = window.visualViewport
  const viewportTop = viewport ? viewport.offsetTop : 0
  const viewportLeft = viewport ? viewport.offsetLeft : 0
  const { left: safeLeft, bottom: safeBottom } = getSafeAreaInsets()

  const left = Math.max(viewportLeft + safeLeft, 0)
  const bottom = Math.max(viewportTop + safeBottom, 0)

  overlay.style.left = `${left}px`
  overlay.style.top = ''
  overlay.style.right = ''
  overlay.style.transform = ''
  overlay.style.bottom = `${bottom}px`

  if (typeof overlay.getBoundingClientRect === 'function') {
    const overlayRect = overlay.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    if (overlayRect && buttonRect && buttonRect.width > 0 && overlayRect.width > 0) {
      if (buttonRect.right > overlayRect.right) {
        const horizontalShift = buttonRect.right - overlayRect.right
        overlay.style.left = `${Math.max(left - horizontalShift, viewportLeft)}px`
      }
    }
  }
}

function scheduleMobileOverlayPositionUpdate() {
  if (typeof window === 'undefined') {
    updateMobileOverlayPosition()
    return
  }

  if (mobileMinimapState.positionFrame !== null && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(mobileMinimapState.positionFrame)
    mobileMinimapState.positionFrame = null
  }

  if (typeof window.requestAnimationFrame === 'function') {
    mobileMinimapState.positionFrame = window.requestAnimationFrame(updateMobileOverlayPosition)
  } else {
    updateMobileOverlayPosition()
  }
}

function forwardPointerToMinimap(clientX, clientY, options = {}) {
  if (!mobileMinimapState.layoutEnabled) {
    return
  }

  if (!ensureMobileMinimapElements()) {
    return
  }

  const { minimapElement, gameCanvas, overlay } = mobileMinimapState
  if (!minimapElement || !gameCanvas || !overlay || !overlay.classList.contains('visible')) {
    return
  }

  handleMinimapClick({ target: minimapElement, clientX, clientY }, gameCanvas, options)
}

function startMobileMinimapDrag(event) {
  mobileMinimapState.activeDragPointerId = event.pointerId

  const shouldSmooth = event.pointerType === 'touch' || event.pointerType === 'pen'

  const executeForwarding = () => {
    forwardPointerToMinimap(event.clientX, event.clientY, { smooth: shouldSmooth })
  }

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(executeForwarding)
  } else {
    executeForwarding()
  }
}

function handleMobileMinimapPointerMove(event) {
  if (mobileMinimapState.activeDragPointerId !== event.pointerId) {
    return
  }

  if (!mobileMinimapState.layoutEnabled) {
    return
  }

  if (!mobileMinimapState.overlay || !mobileMinimapState.overlay.classList.contains('visible')) {
    return
  }

  event.preventDefault()
  const shouldSmooth = event.pointerType === 'touch' || event.pointerType === 'pen'
  forwardPointerToMinimap(event.clientX, event.clientY, { smooth: shouldSmooth })
}

function endMobileMinimapHold(pointerId) {
  if (mobileMinimapState.holdPointerId !== pointerId) {
    return
  }
  mobileMinimapState.holdPointerId = null
  mobileMinimapState.activeDragPointerId = null
  setMobileMinimapOverlayVisible(false)
}

function handleMobileMinimapPointerDown(event) {
  // Dynamically check if layout should be enabled for portrait condensed
  if (document.body) {
    const isLandscape = document.body.classList.contains('mobile-landscape')
    const isPortraitCondensed = document.body.classList.contains('mobile-portrait') && document.body.classList.contains('sidebar-condensed')
    mobileMinimapState.layoutEnabled = isLandscape || isPortraitCondensed
  }

  if (!mobileMinimapState.layoutEnabled) {
    return
  }

  if (event.pointerType === 'mouse' && event.button !== 0) {
    return
  }

  if (!ensureMobileMinimapElements()) {
    return
  }

  mobileMinimapState.holdPointerId = event.pointerId

  if (mobileMinimapState.button && typeof mobileMinimapState.button.setPointerCapture === 'function') {
    try {
      mobileMinimapState.button.setPointerCapture(event.pointerId)
    } catch {
      // Ignore capture errors on unsupported elements
    }
  }

  event.preventDefault()

  setMobileMinimapOverlayVisible(true)
  startMobileMinimapDrag(event)
}

function handleMobileMinimapPointerUp(event) {
  if (mobileMinimapState.button && typeof mobileMinimapState.button.releasePointerCapture === 'function') {
    try {
      if (typeof mobileMinimapState.button.hasPointerCapture === 'function' && mobileMinimapState.button.hasPointerCapture(event.pointerId)) {
        mobileMinimapState.button.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Ignore release errors
    }
  }

  endMobileMinimapHold(event.pointerId)
}

function handleMobileMinimapKeyDown(event) {
  if (event.repeat) {
    return
  }
  if (!mobileMinimapState.layoutEnabled) {
    return
  }
  if (event.code !== 'Space' && event.code !== 'Enter') {
    return
  }
  mobileMinimapState.keyActive = true
  event.preventDefault()
  setMobileMinimapOverlayVisible(true)
}

function handleMobileMinimapKeyUp(event) {
  if (!mobileMinimapState.keyActive) {
    return
  }
  if (event.code !== 'Space' && event.code !== 'Enter') {
    return
  }
  mobileMinimapState.keyActive = false
  event.preventDefault()
  setMobileMinimapOverlayVisible(false)
}

function initializeMobileMinimapToggle() {
  if (mobileMinimapState.initialized || typeof document === 'undefined') {
    return
  }

  if (!ensureMobileMinimapElements()) {
    return
  }

  const { button } = mobileMinimapState
  if (!button) {
    return
  }

  button.setAttribute('aria-pressed', 'false')
  button.addEventListener('pointerdown', handleMobileMinimapPointerDown)
  button.addEventListener('pointerup', handleMobileMinimapPointerUp)
  button.addEventListener('pointercancel', handleMobileMinimapPointerUp)
  button.addEventListener('keydown', handleMobileMinimapKeyDown)
  button.addEventListener('keyup', handleMobileMinimapKeyUp)
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault()
  })

  document.addEventListener('pointerup', handleMobileMinimapPointerUp)
  document.addEventListener('pointercancel', handleMobileMinimapPointerUp)
  document.addEventListener('pointermove', handleMobileMinimapPointerMove, { passive: false })

  mobileMinimapState.initialized = true
}

function disableMobileMinimapOverlay() {
  mobileMinimapState.holdPointerId = null
  mobileMinimapState.keyActive = false
  mobileMinimapState.activeDragPointerId = null
  setMobileMinimapOverlayVisible(false)
}

if (typeof document !== 'undefined') {
  const init = () => {
    initializeMobileMinimapToggle()
    if (document.body) {
      const isLandscape = document.body.classList.contains('mobile-landscape')
      const isPortraitCondensed = document.body.classList.contains('mobile-portrait') && document.body.classList.contains('sidebar-condensed')
      mobileMinimapState.layoutEnabled = isLandscape || isPortraitCondensed
    }
    if (!mobileMinimapState.layoutEnabled) {
      setMobileMinimapOverlayVisible(false)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    init()
  }

  document.addEventListener('mobile-landscape-layout-changed', (event) => {
    const enabled = !!(event && event.detail && event.detail.enabled)
    const isPortraitCondensed = document.body && document.body.classList.contains('mobile-portrait') && document.body.classList.contains('sidebar-condensed')
    mobileMinimapState.layoutEnabled = enabled || isPortraitCondensed
    if (!mobileMinimapState.layoutEnabled) {
      disableMobileMinimapOverlay()
    } else if (mobileMinimapState.initialized) {
      // Ensure the minimap returns to its sidebar when re-entering mobile layout
      restoreMinimapToOriginalParent()
      setMobileMinimapOverlayVisible(false)
    }
    scheduleMobileOverlayPositionUpdate()
  })

  document.addEventListener('sidebar-condensed-changed', (event) => {
    const condensed = !!(event && event.detail && event.detail.condensed)
    const isPortrait = !!(event && event.detail && event.detail.isPortrait)
    if (isPortrait) {
      mobileMinimapState.layoutEnabled = condensed
      if (!condensed) {
        disableMobileMinimapOverlay()
      }
      scheduleMobileOverlayPositionUpdate()
    }
  })

  window.addEventListener('blur', () => {
    disableMobileMinimapOverlay()
  })

  window.addEventListener('resize', scheduleMobileOverlayPositionUpdate)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleMobileOverlayPositionUpdate)
    window.visualViewport.addEventListener('scroll', scheduleMobileOverlayPositionUpdate)
  }
}
