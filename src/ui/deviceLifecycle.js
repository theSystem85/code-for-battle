// Device and orientation lifecycle helpers
import { applyMobileSidebarLayout } from './mobileLayout.js'

let lastIsTouchState = null
let lastMobileLayoutMode = null
let portraitQuery = null
let coarsePointerQuery = null
let standaloneQuery = null
let getGameInstance = () => null
let requestRenderAfterResize = () => {}
let listenersInitialized = false

export function initDeviceLifecycle({ getGameInstanceAccessor, requestRender }) {
  getGameInstance = typeof getGameInstanceAccessor === 'function' ? getGameInstanceAccessor : () => null
  requestRenderAfterResize = typeof requestRender === 'function' ? requestRender : () => {}

  coarsePointerQuery = window.matchMedia('(pointer: coarse)')
  standaloneQuery = window.matchMedia('(display-mode: standalone)')
  portraitQuery = window.matchMedia('(orientation: portrait)')

  updateTouchClass()
  updateStandaloneClass()
  scheduleSafeAreaInsetSync()
  updateMobileLayoutClasses()

  if (!listenersInitialized) {
    bindListeners()
    listenersInitialized = true
  }
}


function readSafeAreaInsetPixels() {
  if (typeof document === 'undefined' || !document.body) {
    return null
  }

  const probe = document.createElement('div')
  probe.style.position = 'fixed'
  probe.style.left = '0'
  probe.style.top = '0'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  probe.style.paddingTop = 'env(safe-area-inset-top, 0px)'
  probe.style.paddingRight = 'env(safe-area-inset-right, 0px)'
  probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)'
  probe.style.paddingLeft = 'env(safe-area-inset-left, 0px)'
  document.body.appendChild(probe)

  const style = window.getComputedStyle(probe)
  const insets = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0
  }

  probe.remove()
  return insets
}

function syncSafeAreaInsets() {
  if (!document.body || !document.body.classList.contains('is-touch')) {
    return
  }

  const insets = readSafeAreaInsetPixels()
  if (!insets) {
    return
  }

  document.body.style.setProperty('--safe-area-top', `${insets.top}px`)
  document.body.style.setProperty('--safe-area-right', `${insets.right}px`)
  document.body.style.setProperty('--safe-area-bottom', `${insets.bottom}px`)
  document.body.style.setProperty('--safe-area-left', `${insets.left}px`)
}

function scheduleSafeAreaInsetSync() {
  syncSafeAreaInsets()
  if (typeof window === 'undefined') {
    return
  }

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => syncSafeAreaInsets())
  }
  window.setTimeout(() => syncSafeAreaInsets(), 140)
}

function bindListeners() {
  if (typeof coarsePointerQuery?.addEventListener === 'function') {
    coarsePointerQuery.addEventListener('change', updateTouchClass)
  } else if (typeof coarsePointerQuery?.addListener === 'function') {
    coarsePointerQuery.addListener(updateTouchClass)
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('canvas-resized', requestRenderAfterResize)
  }

  if (typeof standaloneQuery?.addEventListener === 'function') {
    standaloneQuery.addEventListener('change', updateStandaloneClass)
  } else if (typeof standaloneQuery?.addListener === 'function') {
    standaloneQuery.addListener(updateStandaloneClass)
  }

  if (typeof portraitQuery?.addEventListener === 'function') {
    portraitQuery.addEventListener('change', updateMobileLayoutClasses)
  } else if (typeof portraitQuery?.addListener === 'function') {
    portraitQuery.addListener(updateMobileLayoutClasses)
  }

  window.addEventListener('resize', updateMobileLayoutClasses)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateMobileLayoutClasses)
  }
}

export function updateMobileLayoutClasses() {
  if (!document.body) {
    return
  }

  const isTouch = document.body.classList.contains('is-touch') || !!lastIsTouchState
  const isPortrait = portraitQuery ? portraitQuery.matches : window.matchMedia('(orientation: portrait)').matches
  const mobileMode = isTouch ? (isPortrait ? 'portrait' : 'landscape') : null

  if (document.body.classList.contains('mobile-sidebar-right')) {
    document.body.classList.remove('mobile-sidebar-right')
  }

  document.body.classList.toggle('mobile-landscape', mobileMode === 'landscape')
  document.body.classList.toggle('mobile-portrait', mobileMode === 'portrait')

  applyMobileSidebarLayout(mobileMode)
  scheduleSafeAreaInsetSync()

  if (lastMobileLayoutMode !== mobileMode) {
    lastMobileLayoutMode = mobileMode
    const canvasManager = getGameInstance()?.canvasManager
    if (canvasManager && typeof canvasManager.resizeCanvases === 'function') {
      canvasManager.resizeCanvases()
    }
  }

  document.dispatchEvent(new CustomEvent('mobile-landscape-layout-changed', {
    detail: { enabled: mobileMode === 'landscape', mode: mobileMode }
  }))
}

export function updateTouchClass() {
  const isTouch = window.matchMedia('(pointer: coarse)').matches
  if (document.body) {
    const previous = lastIsTouchState
    document.body.classList.toggle('is-touch', isTouch)
    lastIsTouchState = isTouch
    updateMobileLayoutClasses()
    if (previous !== null && previous !== isTouch) {
      const canvasManager = getGameInstance()?.canvasManager
      if (canvasManager && typeof canvasManager.resizeCanvases === 'function') {
        canvasManager.resizeCanvases()
      }
    }
  } else {
    lastIsTouchState = isTouch
  }
}

export function updateStandaloneClass() {
  if (!document.body) {
    return
  }
  const standaloneMatch = typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false
  const isStandalone = standaloneMatch || window.navigator.standalone === true
  document.body.classList.toggle('pwa-standalone', isStandalone)
}

export function setupDoubleTapPrevention() {
  let lastTouchEnd = 0

  if (document.documentElement) {
    document.documentElement.style.touchAction = 'manipulation'
  }
  if (document.body) {
    document.body.style.touchAction = 'manipulation'
  }

  document.addEventListener('touchstart', (event) => {
    if (event.touches && event.touches.length > 1) {
      event.preventDefault()
    }
  }, { passive: false })

  document.addEventListener('touchend', (event) => {
    if (event.touches && event.touches.length > 0) {
      lastTouchEnd = Date.now()
      return
    }

    const target = event.target
    if (target && typeof target.closest === 'function' && target.closest('input, textarea, select, [contenteditable="true"]')) {
      lastTouchEnd = Date.now()
      return
    }

    const now = Date.now()
    if (now - lastTouchEnd <= 300) {
      event.preventDefault()
    }
    lastTouchEnd = now
  }, { passive: false })
}

export function setRequestRenderAfterResize(fn) {
  requestRenderAfterResize = typeof fn === 'function' ? fn : () => {}
}
