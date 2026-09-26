// Portrait remote-control joystick placement.
// Landscape positioning stays in CSS. This module only answers where the two
// sticks sit on a phone in portrait so they clear the build bar, the action
// buttons, each other, and the safe-area insets.

export const PORTRAIT_REMOTE_JOYSTICK_LIMITS = {
  actionSize: 48,
  actionGap: 12,
  joystickGap: 12,
  buildBarHeight: 96,
  sidePadding: 12,
  maxJoystickSize: 96,
  joystickViewportCap: 180,
  joystickViewportRatio: 0.32,
  joystickScale: 0.42,
  minGap: 16,
  topClearance: 8,
  sidebarMin: 220,
  sidebarMax: 320,
  sidebarRatio: 0.74
}

function roundPx(value) {
  return Math.round(value * 100) / 100
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function computeMobileJoystickDiameter(viewportWidth, limits = PORTRAIT_REMOTE_JOYSTICK_LIMITS) {
  const width = Math.max(0, viewportWidth || 0)
  const capped = Math.min(width * limits.joystickViewportRatio, limits.joystickViewportCap)
  const scaled = capped * limits.joystickScale
  return roundPx(Math.min(limits.maxJoystickSize, Math.max(0, scaled)))
}

export function resolvePortraitSidebarWidth(viewportWidth, limits = PORTRAIT_REMOTE_JOYSTICK_LIMITS) {
  const preferred = Math.max(0, viewportWidth || 0) * limits.sidebarRatio
  return roundPx(clamp(preferred, limits.sidebarMin, limits.sidebarMax))
}

function horizontalJoystickRects({ viewportWidth, left, right, paddingLeft, paddingRight, bottom, size }) {
  const innerLeft = left + paddingLeft
  const innerRight = viewportWidth - right - paddingRight
  return [
    { side: 'left', left: roundPx(innerLeft), width: size, height: size, bottom },
    { side: 'right', left: roundPx(innerRight - size), width: size, height: size, bottom }
  ]
}

function verticalJoystickRects({ left, bottom, size, gap }) {
  return [
    { side: 'right', left: roundPx(left), width: size, height: size, bottom },
    { side: 'left', left: roundPx(left), width: size, height: size, bottom: roundPx(bottom + size + gap) }
  ]
}

export function computePortraitRemoteJoystickLayout(input = {}) {
  const limits = { ...PORTRAIT_REMOTE_JOYSTICK_LIMITS, ...(input.limits || {}) }
  const viewportWidth = Math.max(0, input.viewportWidth || 0)
  const viewportHeight = Math.max(0, input.viewportHeight || 0)
  const safe = input.safeArea || {}
  const safeLeft = Math.max(0, safe.left || 0)
  const safeRight = Math.max(0, safe.right || 0)
  const safeBottom = Math.max(0, safe.bottom || 0)
  const safeTop = Math.max(0, safe.top || 0)
  const sidebarMode = input.sidebarMode === 'collapsed' || input.sidebarMode === 'expanded'
    ? input.sidebarMode
    : 'condensed'
  const buildBarHeight = sidebarMode === 'condensed' ? limits.buildBarHeight : 0
  const actionRowBottom = sidebarMode === 'expanded'
    ? null
    : roundPx(safeBottom + buildBarHeight + limits.actionGap)

  let bottom
  let left
  let right
  let stack
  let paddingLeft
  let paddingRight
  let joystickSize = computeMobileJoystickDiameter(viewportWidth, limits)
  const gap = limits.minGap
  let width = null
  let mapLeft = safeLeft
  let mapWidth = viewportWidth

  if (sidebarMode === 'expanded') {
    const sidebarWidth = Number.isFinite(input.sidebarWidth)
      ? Math.max(0, input.sidebarWidth)
      : resolvePortraitSidebarWidth(viewportWidth, limits)
    mapLeft = Math.max(safeLeft, sidebarWidth)
    mapWidth = Math.max(0, viewportWidth - mapLeft - safeRight)
    const needed = joystickSize * 2 + limits.minGap + limits.sidePadding * 2
    bottom = roundPx(safeBottom + limits.joystickGap)
    if (mapWidth >= needed && joystickSize > 0) {
      stack = 'horizontal'
      left = mapLeft
      right = safeRight
      paddingLeft = limits.sidePadding
      paddingRight = limits.sidePadding
    } else {
      stack = 'vertical'
      const available = Math.max(0, mapWidth - limits.sidePadding * 2)
      joystickSize = roundPx(Math.min(joystickSize, available))
      width = joystickSize
      left = roundPx(mapLeft + Math.max(0, (mapWidth - joystickSize) / 2))
      right = roundPx(Math.max(0, viewportWidth - (left + joystickSize)))
      paddingLeft = 0
      paddingRight = 0
    }
  } else {
    stack = 'horizontal'
    bottom = roundPx(actionRowBottom + limits.actionSize + limits.joystickGap)
    left = safeLeft
    right = safeRight
    paddingLeft = limits.sidePadding
    paddingRight = limits.sidePadding
    const inner = Math.max(0, viewportWidth - safeLeft - safeRight - paddingLeft - paddingRight)
    if (joystickSize * 2 + gap > inner) {
      joystickSize = roundPx(Math.max(0, (inner - gap) / 2))
    }
  }

  if (viewportHeight > 0) {
    const room = viewportHeight - safeTop - limits.topClearance - bottom
    if (stack === 'vertical') {
      if (joystickSize * 2 + gap > room) {
        joystickSize = roundPx(Math.max(0, (room - gap) / 2))
        width = joystickSize
        left = roundPx(mapLeft + Math.max(0, (mapWidth - joystickSize) / 2))
        right = roundPx(Math.max(0, viewportWidth - (left + joystickSize)))
      }
    } else if (joystickSize > room) {
      joystickSize = roundPx(Math.max(0, room))
    }
  }

  const joysticks = stack === 'vertical'
    ? verticalJoystickRects({ left, bottom, size: joystickSize, gap })
    : horizontalJoystickRects({
      viewportWidth,
      left,
      right,
      paddingLeft,
      paddingRight,
      bottom,
      size: joystickSize
    })

  return {
    bottom,
    left: roundPx(left),
    right: roundPx(right),
    paddingLeft,
    paddingRight,
    stack,
    joystickSize,
    gap,
    width,
    actionRowBottom,
    buildBarHeight,
    safeBottom,
    joysticks
  }
}

const PORTRAIT_JOYSTICK_VARS = [
  '--portrait-joystick-bottom',
  '--portrait-joystick-left',
  '--portrait-joystick-right',
  '--portrait-joystick-pad-left',
  '--portrait-joystick-pad-right',
  '--portrait-joystick-size',
  '--portrait-joystick-gap',
  '--portrait-joystick-width'
]

export function applyPortraitRemoteJoystickLayout(element, metrics) {
  if (!element) {
    return null
  }
  const layout = computePortraitRemoteJoystickLayout(metrics)
  element.style.setProperty('--portrait-joystick-bottom', `${layout.bottom}px`)
  element.style.setProperty('--portrait-joystick-left', `${layout.left}px`)
  element.style.setProperty('--portrait-joystick-right', `${layout.right}px`)
  element.style.setProperty('--portrait-joystick-pad-left', `${layout.paddingLeft}px`)
  element.style.setProperty('--portrait-joystick-pad-right', `${layout.paddingRight}px`)
  element.style.setProperty('--portrait-joystick-size', `${layout.joystickSize}px`)
  element.style.setProperty('--portrait-joystick-gap', `${layout.gap}px`)
  element.setAttribute('data-joystick-stack', layout.stack)
  if (layout.width != null) {
    element.style.setProperty('--portrait-joystick-width', `${layout.width}px`)
  } else {
    element.style.removeProperty('--portrait-joystick-width')
  }
  return layout
}

export function clearPortraitRemoteJoystickLayout(element) {
  if (!element) {
    return
  }
  PORTRAIT_JOYSTICK_VARS.forEach((name) => {
    element.style.removeProperty(name)
  })
  element.removeAttribute('data-joystick-stack')
}

function readCssPx(style, name) {
  const parsed = parseFloat(style.getPropertyValue(name))
  return Number.isFinite(parsed) ? parsed : 0
}

export function readPortraitJoystickMetrics(doc = document) {
  const body = doc.body
  const view = doc.defaultView || window
  const style = view.getComputedStyle(body)
  const viewportWidth = Number.isFinite(view.visualViewport?.width) ? view.visualViewport.width : (view.innerWidth || 0)
  const viewportHeight = Number.isFinite(view.visualViewport?.height) ? view.visualViewport.height : (view.innerHeight || 0)
  let sidebarMode = 'expanded'
  if (body.classList.contains('sidebar-collapsed')) {
    sidebarMode = 'collapsed'
  } else if (body.classList.contains('sidebar-condensed')) {
    sidebarMode = 'condensed'
  }
  return {
    viewportWidth,
    viewportHeight,
    safeArea: {
      top: readCssPx(style, '--safe-area-top'),
      right: readCssPx(style, '--safe-area-right'),
      bottom: readCssPx(style, '--safe-area-bottom'),
      left: readCssPx(style, '--safe-area-left')
    },
    sidebarMode
  }
}
