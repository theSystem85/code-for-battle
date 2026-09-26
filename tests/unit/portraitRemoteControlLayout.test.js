import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main.js', () => ({
  buildingCosts: {},
  unitCosts: {},
  factories: [],
  units: [],
  mapGrid: [],
  bullets: [],
  getCurrentGame: () => null
}))

vi.mock('../../src/replaySystem.js', () => ({
  createReplayUnitReferences: (units) => (Array.isArray(units) ? units.slice() : []),
  recordReplayCommand: () => {}
}))

import { gameState } from '../../src/gameState.js'
import { getRemoteControlAbsolute, getRemoteControlActionState } from '../../src/input/remoteControlState.js'
import { applyMobileSidebarLayout, mobileLayoutState } from '../../src/ui/mobileLayout.js'
import {
  handleMobileJoystickLayoutChange,
  initializeJoysticks,
  vectorFromJoystickCenter
} from '../../src/ui/mobileJoysticks.js'
import {
  computePortraitRemoteJoystickLayout,
  PORTRAIT_REMOTE_JOYSTICK_LIMITS
} from '../../src/ui/portraitRemoteControlLayout.js'

const IPHONE_PORTRAIT = {
  viewportWidth: 390,
  viewportHeight: 844,
  safeArea: { top: 47, right: 0, bottom: 34, left: 0 }
}

function rectsOverlap(a, b) {
  const aRight = a.left + a.width
  const bRight = b.left + b.width
  const horizontal = a.left < bRight && b.left < aRight
  const aTop = a.bottom + a.height
  const bTop = b.bottom + b.height
  const vertical = a.bottom < bTop && b.bottom < aTop
  return horizontal && vertical
}

function mountJoystickDom() {
  document.body.innerHTML = `
    <div id="mobileJoystickContainer" aria-hidden="false">
      <div class="mobile-joystick" data-joystick="left">
        <div class="joystick-base"><div class="joystick-thumb"></div></div>
      </div>
      <div class="mobile-joystick" data-joystick="right">
        <div class="joystick-base"><div class="joystick-thumb"></div></div>
      </div>
    </div>
  `
  initializeJoysticks()
  return document.getElementById('mobileJoystickContainer')
}

function mockBaseRect(side, rect) {
  const base = document.querySelector(`[data-joystick="${side}"] .joystick-base`)
  base.getBoundingClientRect = () => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON() { return rect }
  })
  return base
}

function pointer(type, pointerId, clientX, clientY) {
  return new window.PointerEvent(type, {
    pointerId,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true
  })
}

describe('portrait remote-control joystick layout', () => {
  it('places both sticks above the action buttons and the build bar on a phone', () => {
    const layout = computePortraitRemoteJoystickLayout({
      ...IPHONE_PORTRAIT,
      sidebarMode: 'condensed'
    })
    const actionTop = layout.actionRowBottom + PORTRAIT_REMOTE_JOYSTICK_LIMITS.actionSize
    const buildBarTop = layout.buildBarHeight + layout.safeBottom

    expect(layout.stack).toBe('horizontal')
    expect(layout.bottom).toBeGreaterThanOrEqual(actionTop + PORTRAIT_REMOTE_JOYSTICK_LIMITS.joystickGap)
    expect(layout.bottom).toBeGreaterThanOrEqual(buildBarTop)
    expect(layout.joysticks).toHaveLength(2)
    expect(rectsOverlap(layout.joysticks[0], layout.joysticks[1])).toBe(false)
    layout.joysticks.forEach((stick) => {
      expect(stick.left).toBeGreaterThanOrEqual(IPHONE_PORTRAIT.safeArea.left)
      expect(stick.left + stick.width).toBeLessThanOrEqual(
        IPHONE_PORTRAIT.viewportWidth - IPHONE_PORTRAIT.safeArea.right
      )
      expect(stick.bottom).toBe(layout.bottom)
    })
  })

  it('drops the build bar offset when the portrait sidebar is collapsed', () => {
    const condensed = computePortraitRemoteJoystickLayout({
      ...IPHONE_PORTRAIT,
      sidebarMode: 'condensed'
    })
    const collapsed = computePortraitRemoteJoystickLayout({
      ...IPHONE_PORTRAIT,
      sidebarMode: 'collapsed'
    })

    expect(collapsed.buildBarHeight).toBe(0)
    expect(collapsed.bottom).toBe(IPHONE_PORTRAIT.safeArea.bottom + 12 + 48 + 12)
    expect(collapsed.bottom).toBeLessThan(condensed.bottom)
    expect(collapsed.bottom).toBeGreaterThanOrEqual(
      collapsed.actionRowBottom + PORTRAIT_REMOTE_JOYSTICK_LIMITS.actionSize
    )
  })

  it('keeps side-by-side sticks inside safe-area insets without overlapping', () => {
    const layout = computePortraitRemoteJoystickLayout({
      viewportWidth: 390,
      viewportHeight: 844,
      safeArea: { top: 0, right: 16, bottom: 20, left: 28 },
      sidebarMode: 'condensed'
    })
    const [left, right] = layout.joysticks

    expect(left.side).toBe('left')
    expect(right.side).toBe('right')
    expect(left.left).toBeGreaterThanOrEqual(28)
    expect(right.left + right.width).toBeLessThanOrEqual(390 - 16)
    expect(left.left + left.width).toBeLessThanOrEqual(right.left)
  })

  it('shrinks sticks that would otherwise overlap on a narrow portrait width', () => {
    const layout = computePortraitRemoteJoystickLayout({
      viewportWidth: 200,
      viewportHeight: 400,
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      sidebarMode: 'condensed',
      limits: {
        maxJoystickSize: 90,
        joystickViewportCap: 1000,
        joystickViewportRatio: 1,
        joystickScale: 1
      }
    })
    const [left, right] = layout.joysticks

    expect(layout.joystickSize).toBe(80)
    expect(left.left + left.width).toBeLessThanOrEqual(right.left)
    expect(rectsOverlap(left, right)).toBe(false)
  })

  it('stacks sticks in the map strip when the expanded portrait sidebar leaves no room', () => {
    const layout = computePortraitRemoteJoystickLayout({
      viewportWidth: 390,
      viewportHeight: 844,
      safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
      sidebarMode: 'expanded'
    })
    const sidebarWidth = Math.min(320, Math.max(220, 390 * 0.74))

    expect(layout.stack).toBe('vertical')
    expect(layout.bottom).toBe(34 + 12)
    layout.joysticks.forEach((stick) => {
      expect(stick.left).toBeGreaterThanOrEqual(sidebarWidth)
      expect(stick.left + stick.width).toBeLessThanOrEqual(390)
    })
    expect(rectsOverlap(layout.joysticks[0], layout.joysticks[1])).toBe(false)
    const lower = layout.joysticks[0]
    const upper = layout.joysticks[1]
    expect(upper.bottom).toBeGreaterThanOrEqual(lower.bottom + lower.height)
  })

  it('keeps sticks below the top safe area when the viewport is short', () => {
    const safeTop = 50
    const layout = computePortraitRemoteJoystickLayout({
      viewportWidth: 390,
      viewportHeight: 280,
      safeArea: { top: safeTop, right: 0, bottom: 34, left: 0 },
      sidebarMode: 'condensed'
    })
    const stickTopFromTop = 280 - (layout.bottom + layout.joystickSize)

    expect(stickTopFromTop).toBeGreaterThanOrEqual(safeTop + PORTRAIT_REMOTE_JOYSTICK_LIMITS.topClearance)
  })

  it('maps a touch to the same vector in portrait and landscape positions', () => {
    const portrait = vectorFromJoystickCenter(
      { left: 16, top: 620, width: 80, height: 80 },
      16,
      620
    )
    const landscape = vectorFromJoystickCenter(
      { left: 48, top: 250, width: 80, height: 80 },
      48,
      250
    )

    expect(portrait.normalizedX).toBe(landscape.normalizedX)
    expect(portrait.normalizedY).toBe(landscape.normalizedY)
    expect(portrait.normalizedY).toBeLessThan(0)
    expect(portrait.normalizedX).toBeLessThan(0)
  })
})

describe('portrait remote-control joystick input', () => {
  beforeEach(() => {
    vi.useRealTimers()
    document.body.className = ''
    document.body.innerHTML = ''
    gameState.humanPlayer = 'player1'
    window.debugGetSelectedUnits = () => []
    mountJoystickDom()
    handleMobileJoystickLayoutChange(null)
  })

  afterEach(() => {
    handleMobileJoystickLayoutChange(null)
    vi.useRealTimers()
  })

  function select(unit) {
    window.debugGetSelectedUnits = () => [unit]
  }

  it('keeps sticks active when rotating from landscape to portrait and back', () => {
    select({ id: 'tank-1', type: 'tank', owner: 'player1', movement: { speed: 1 } })
    const container = document.getElementById('mobileJoystickContainer')

    handleMobileJoystickLayoutChange({ mode: 'landscape', enabled: true })
    expect(container.getAttribute('data-selection-active')).toBe('true')

    const right = mockBaseRect('right', { left: 280, top: 300, width: 80, height: 80 })
    right.dispatchEvent(pointer('pointerdown', 4, 320, 300))
    expect(right.querySelector('.joystick-thumb').classList.contains('active')).toBe(true)

    handleMobileJoystickLayoutChange({ mode: 'portrait', enabled: false })
    expect(container.getAttribute('data-selection-active')).toBe('true')
    expect(right.querySelector('.joystick-thumb').classList.contains('active')).toBe(false)
    expect(getRemoteControlAbsolute().wagonSpeed).toBe(0)

    const portraitRight = mockBaseRect('right', { left: 280, top: 640, width: 80, height: 80 })
    portraitRight.dispatchEvent(pointer('pointerdown', 5, 320, 640))
    portraitRight.dispatchEvent(pointer('pointermove', 5, 320, 600))
    expect(getRemoteControlAbsolute().wagonSpeed).toBeGreaterThan(0)

    portraitRight.dispatchEvent(pointer('pointerup', 5, 320, 600))
    expect(getRemoteControlAbsolute().wagonSpeed).toBe(0)

    handleMobileJoystickLayoutChange({ mode: 'landscape', enabled: true })
    expect(container.getAttribute('data-selection-active')).toBe('true')
  })

  it('fires from a portrait left-stick tap and clears fire when the tap ends', () => {
    vi.useFakeTimers()
    select({ id: 'tank-1', type: 'tank', owner: 'player1', movement: { speed: 1 } })
    handleMobileJoystickLayoutChange({ mode: 'portrait', enabled: false })
    const left = mockBaseRect('left', { left: 16, top: 640, width: 80, height: 80 })

    left.dispatchEvent(pointer('pointerdown', 2, 56, 680))
    left.dispatchEvent(pointer('pointerup', 2, 56, 680))
    expect(getRemoteControlActionState('fire')).toBe(1)

    vi.advanceTimersByTime(150)
    expect(getRemoteControlActionState('fire')).toBe(0)
  })

  it('drives a vehicle forward from the portrait left stick', () => {
    select({ id: 'hv-1', type: 'harvester', owner: 'player1', movement: { speed: 1 } })
    handleMobileJoystickLayoutChange({ mode: 'portrait', enabled: false })
    const left = mockBaseRect('left', { left: 16, top: 640, width: 80, height: 80 })

    left.dispatchEvent(pointer('pointerdown', 3, 56, 640))
    left.dispatchEvent(pointer('pointermove', 3, 56, 600))
    expect(getRemoteControlActionState('forward')).toBeGreaterThan(0)

    left.dispatchEvent(pointer('pointerup', 3, 56, 600))
    expect(getRemoteControlActionState('forward')).toBe(0)
  })

  it('turns portrait joysticks off outside mobile layouts', () => {
    select({ id: 'tank-1', type: 'tank', owner: 'player1', movement: { speed: 1 } })
    const container = document.getElementById('mobileJoystickContainer')
    handleMobileJoystickLayoutChange({ mode: 'portrait', enabled: false })
    expect(container.getAttribute('data-selection-active')).toBe('true')

    handleMobileJoystickLayoutChange({ mode: null, enabled: false })
    expect(container.getAttribute('data-selection-active')).toBe('false')
  })
})

describe('applyMobileSidebarLayout joystick visibility', () => {
  beforeEach(() => {
    document.body.className = 'is-touch'
    document.body.style.cssText = ''
    document.body.innerHTML = `
      <div id="sidebar">
        <div id="productionArea"></div>
        <div id="actions"></div>
      </div>
      <div id="mobileBuildMenuContainer" aria-hidden="true"></div>
      <div id="mobileJoystickContainer" aria-hidden="true"></div>
      <div id="mobileSidebarControls" aria-hidden="true"></div>
      <div id="mobilePortraitHud" aria-hidden="true"></div>
      <div id="mobilePortraitActions"><div id="mobilePortraitActionsLeft"></div></div>
    `
    mobileLayoutState.productionArea = null
    mobileLayoutState.originalParent = null
    mobileLayoutState.originalNextSibling = null
    mobileLayoutState.mobileContainer = null
    mobileLayoutState.actions = null
    mobileLayoutState.actionsOriginalParent = null
    mobileLayoutState.actionsOriginalNextSibling = null
    mobileLayoutState.mobileJoystickContainer = null
    mobileLayoutState.mobileControls = null
    mobileLayoutState.portraitHud = null
    mobileLayoutState.portraitActionsContainer = null
    mobileLayoutState.portraitActionsLeft = null
    mobileLayoutState.hasPortraitStateBeenSynced = false
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: null })
  })

  it('enables portrait placement and leaves landscape on the stylesheet defaults', () => {
    document.body.classList.add('mobile-portrait', 'sidebar-condensed')
    document.body.style.setProperty('--safe-area-bottom', '34px')
    document.body.style.setProperty('--safe-area-top', '47px')

    applyMobileSidebarLayout('portrait')

    const joystick = document.getElementById('mobileJoystickContainer')
    const expected = computePortraitRemoteJoystickLayout({
      viewportWidth: 390,
      viewportHeight: 844,
      safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
      sidebarMode: 'condensed'
    })

    expect(joystick.getAttribute('aria-hidden')).toBe('false')
    expect(joystick.getAttribute('data-orientation')).toBe('portrait')
    expect(joystick.style.getPropertyValue('--portrait-joystick-bottom')).toBe(`${expected.bottom}px`)
    expect(joystick.getAttribute('data-joystick-stack')).toBe('horizontal')

    document.body.classList.remove('mobile-portrait')
    document.body.classList.add('mobile-landscape')
    applyMobileSidebarLayout('landscape')

    expect(joystick.getAttribute('aria-hidden')).toBe('false')
    expect(joystick.getAttribute('data-orientation')).toBe('landscape')
    expect(joystick.style.getPropertyValue('--portrait-joystick-bottom')).toBe('')
    expect(joystick.hasAttribute('data-joystick-stack')).toBe(false)

    applyMobileSidebarLayout(null)
    expect(joystick.getAttribute('aria-hidden')).toBe('true')
  })
})
