// Keeps the mobile document height aligned with the visible webview.
// Safari usually settles through dvh and resize. Chrome on iOS resizes the
// WKWebView when its toolbars collapse without firing window or
// visualViewport resize, and innerHeight can stay on the small viewport.
// The root is position:fixed; top/bottom:0, so its border box is the webview.
// ResizeObserver reports that box even when no viewport event fires.
// This module is event-driven: it must never run from the simulation frame loop.

export const APP_HEIGHT_VAR = '--app-height'
export const APP_OFFSET_TOP_VAR = '--app-viewport-offset-top'
export const VIEWPORT_SETTLE_DELAYS_MS = [120, 320, 700]

function positive(value) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function maxPositive(values) {
  let max = 0
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value > max) max = value
  }
  return max
}

function parsePx(value) {
  if (typeof value !== 'string' || value.length === 0) return 0
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function readLiveSize(win) {
  const viewport = win?.visualViewport || null
  return {
    width: maxPositive([positive(win?.innerWidth), positive(viewport?.width)]),
    height: maxPositive([positive(win?.innerHeight), positive(viewport?.height)]),
    offsetTop: Number.isFinite(viewport?.offsetTop) ? viewport.offsetTop : 0,
    offsetLeft: Number.isFinite(viewport?.offsetLeft) ? viewport.offsetLeft : 0
  }
}

function readBorderBox(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') {
    return { width: 0, height: 0 }
  }
  const rect = element.getBoundingClientRect()
  return {
    width: positive(rect?.width),
    height: positive(rect?.height)
  }
}

export function readLayoutBox(win = globalThis.window) {
  const root = win?.document?.documentElement || null
  const body = win?.document?.body || null
  const live = readLiveSize(win)
  const rootBox = readBorderBox(root)
  const bodyBox = readBorderBox(body)
  return {
    width: maxPositive([
      live.width,
      positive(root?.clientWidth),
      positive(body?.clientWidth),
      rootBox.width,
      bodyBox.width
    ]),
    height: maxPositive([
      live.height,
      positive(root?.clientHeight),
      positive(body?.clientHeight),
      rootBox.height,
      bodyBox.height
    ]),
    offsetTop: live.offsetTop,
    offsetLeft: live.offsetLeft
  }
}

function setPx(root, name, value) {
  if (!root || !Number.isFinite(value) || value < 0) return false
  const next = `${Math.round(value)}px`
  if (root.style.getPropertyValue(name) === next) return false
  root.style.setProperty(name, next)
  return true
}

/**
 * Publish a pixel height only when the live viewport is taller than the
 * laid-out document. A shorter reading must not override 100dvh: the
 * stylesheet treats --app-height as a minimum, so a stale first paint cannot
 * pin the page short. Real resize/orientation/pageshow passes may drop the
 * pixel lock so a later, smaller dynamic viewport can take over.
 */
export function syncViewportLayout(win = globalThis.window, { allowShrink = false } = {}) {
  const root = win?.document?.documentElement
  if (!root) {
    return { changed: false, ...readLayoutBox(win) }
  }

  const live = readLiveSize(win)
  const rootBox = readBorderBox(root)
  const bodyBox = readBorderBox(win.document?.body)
  const laidOutHeight = maxPositive([
    positive(root.clientHeight),
    positive(win.document?.body?.clientHeight),
    rootBox.height,
    bodyBox.height
  ])
  const appliedHeight = parsePx(root.style.getPropertyValue(APP_HEIGHT_VAR))
  let changed = false

  if (live.height > laidOutHeight + 1) {
    changed = setPx(root, APP_HEIGHT_VAR, live.height) || changed
  } else if (allowShrink && appliedHeight > live.height + 1 && live.height > 0) {
    root.style.removeProperty(APP_HEIGHT_VAR)
    changed = true
  }

  changed = setPx(root, APP_OFFSET_TOP_VAR, live.offsetTop) || changed

  const box = readLayoutBox(win)
  // readLayoutBox sees the post-sync document. Also keep a live viewport that
  // is taller than a client height which has not reflowed yet.
  box.width = maxPositive([box.width, live.width])
  box.height = maxPositive([box.height, live.height])
  box.changed = changed
  return box
}

export function createViewportLayoutController({
  win = globalThis.window,
  onChange = () => {},
  requestFrame = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : null,
  cancelFrame = win.cancelAnimationFrame ? win.cancelAnimationFrame.bind(win) : null,
  scheduleTimeout = win.setTimeout ? win.setTimeout.bind(win) : null,
  cancelTimeout = win.clearTimeout ? win.clearTimeout.bind(win) : null,
  settleDelays = VIEWPORT_SETTLE_DELAYS_MS
} = {}) {
  let disposed = false
  let frameHandle = null
  let frameQueued = false
  let pendingShrink = false
  let lastWidth = -1
  let lastHeight = -1
  const timeoutIds = []
  const cleanups = []

  function measure(allowShrink) {
    if (disposed) return null
    const box = syncViewportLayout(win, { allowShrink })
    const width = Math.round(box.width || 0)
    const height = Math.round(box.height || 0)
    if (width < 1 || height < 1) return box
    if (width === lastWidth && height === lastHeight) return box
    lastWidth = width
    lastHeight = height
    onChange({
      width,
      height,
      offsetTop: box.offsetTop,
      offsetLeft: box.offsetLeft
    })
    return box
  }

  function schedule(allowShrink) {
    if (disposed) return
    pendingShrink = pendingShrink || allowShrink === true
    if (frameQueued) return
    if (typeof requestFrame !== 'function') {
      const shrink = pendingShrink
      pendingShrink = false
      measure(shrink)
      return
    }
    frameQueued = true
    frameHandle = requestFrame(() => {
      frameQueued = false
      frameHandle = null
      if (disposed) return
      const shrink = pendingShrink
      pendingShrink = false
      measure(shrink)
    })
  }

  function settle() {
    if (disposed) return
    measure(false)
    if (typeof requestFrame === 'function') {
      requestFrame(() => {
        if (disposed) return
        requestFrame(() => {
          if (!disposed) measure(false)
        })
      })
    }
    if (typeof scheduleTimeout !== 'function') return
    settleDelays.forEach(delay => {
      const id = scheduleTimeout(() => {
        if (!disposed) measure(false)
      }, delay)
      timeoutIds.push(id)
    })
  }

  function onResize() {
    schedule(true)
  }

  function onVisualResize() {
    schedule(false)
  }

  function onOrientationOrPageShow() {
    schedule(true)
    settle()
  }

  function listen(target, type, handler) {
    if (!target || typeof target.addEventListener !== 'function') return
    target.addEventListener(type, handler)
    cleanups.push(() => target.removeEventListener(type, handler))
  }

  listen(win, 'resize', onResize)
  listen(win, 'orientationchange', onOrientationOrPageShow)
  listen(win, 'pageshow', onOrientationOrPageShow)
  listen(win, 'load', settle)
  listen(win, 'scroll', onVisualResize)
  listen(win, 'focus', onVisualResize)
  listen(win.document, 'visibilitychange', onVisualResize)
  listen(win.visualViewport, 'resize', onVisualResize)
  listen(win.visualViewport, 'scroll', onVisualResize)

  const root = win.document?.documentElement
  const body = win.document?.body
  let observer = null
  if ((root || body) && typeof win.ResizeObserver === 'function') {
    observer = new win.ResizeObserver(() => schedule(false))
    if (root) observer.observe(root)
    if (body && body !== root) observer.observe(body)
  }

  settle()

  return {
    refresh: settle,
    dispose() {
      if (disposed) return
      disposed = true
      cleanups.forEach(cleanup => cleanup())
      if (frameQueued && frameHandle != null && typeof cancelFrame === 'function') {
        cancelFrame(frameHandle)
      }
      frameQueued = false
      frameHandle = null
      if (typeof cancelTimeout === 'function') {
        timeoutIds.forEach(id => cancelTimeout(id))
      }
      timeoutIds.length = 0
      observer?.disconnect()
      observer = null
    }
  }
}
