const VIEWPORT_META_SELECTOR = 'meta[name="viewport"]'
const LOCKED_VIEWPORT_CONTENT = [
  'width=device-width',
  'initial-scale=1.0',
  'minimum-scale=1.0',
  'maximum-scale=1.0',
  'user-scalable=no',
  'viewport-fit=cover'
].join(', ')

let initialized = false
let viewportMeta = null
let pendingReset = null
let lastTouchEnd = 0

function getViewportMeta() {
  if (viewportMeta && viewportMeta.isConnected) {
    return viewportMeta
  }

  viewportMeta = typeof document !== 'undefined'
    ? document.querySelector(VIEWPORT_META_SELECTOR)
    : null

  return viewportMeta
}

function applyViewportLock() {
  const meta = getViewportMeta()
  if (!meta) {
    return
  }

  const currentContent = meta.getAttribute('content') || ''
  if (currentContent === LOCKED_VIEWPORT_CONTENT) {
    return
  }

  meta.setAttribute('content', LOCKED_VIEWPORT_CONTENT)
}

function scheduleViewportReset() {
  if (pendingReset !== null) {
    return
  }

  const run = () => {
    pendingReset = null
    applyViewportLock()
  }

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    pendingReset = window.requestAnimationFrame(run)
  } else {
    pendingReset = setTimeout(run, 16)
  }
}

function handleOrientationChange() {
  scheduleViewportReset()
  // Run a few additional resets after the orientation settles because some browsers
  // adjust their viewport metrics asynchronously.
  setTimeout(scheduleViewportReset, 150)
  setTimeout(scheduleViewportReset, 350)
}

function handleTouchEnd(event) {
  if (event.touches?.length) {
    return
  }

  const target = event.target
  if (target && typeof target.closest === 'function') {
    const interactive = target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], .graphics-tuner-info')
    if (interactive) {
      return
    }
  }

  const now = performance.now()
  if (now - lastTouchEnd <= 350) {
    event.preventDefault()
    scheduleViewportReset()
  }

  lastTouchEnd = now
}

export function initializeMobileViewportLock() {
  if (initialized) {
    return
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const hasNavigator = typeof navigator !== 'undefined'
  const hasTouchSupport = ('ontouchstart' in window) || (hasNavigator && navigator.maxTouchPoints > 0)

  // Only apply the lock on touch-capable devices.
  if (!hasTouchSupport) {
    return
  }

  initialized = true

  applyViewportLock()

  window.addEventListener('orientationchange', handleOrientationChange)

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleViewportReset)
  } else {
    window.addEventListener('resize', scheduleViewportReset)
  }

  document.addEventListener('gesturestart', event => {
    event.preventDefault()
    scheduleViewportReset()
  }, { passive: false })

  document.addEventListener('touchend', handleTouchEnd, { passive: false })
}
