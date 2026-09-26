import { gameState } from '../gameState.js'

// Avoid importing `selectedUnits` directly to prevent circular import TDZ issues.
// Use `window.debugGetSelectedUnits()` if available, otherwise fall back to an empty array.
function getSelectedUnits() {
  if (typeof window !== 'undefined' && typeof window.debugGetSelectedUnits === 'function') {
    try {
      return window.debugGetSelectedUnits() || []
    } catch {
      return []
    }
  }
  return []
}
import { getMobileJoystickMapping, isTurretTankUnitType } from '../config.js'
import {
  setRemoteControlAction,
  clearRemoteControlSource,
  setRemoteControlAbsolute,
  clearRemoteControlAbsoluteSource
} from '../input/remoteControlState.js'

const JOYSTICK_SIDES = ['left', 'right']
const TAP_SOURCES = {
  left: 'leftJoystickTap',
  right: 'rightJoystickTap'
}
const HOLD_SOURCES = {
  left: 'leftJoystick',
  right: 'rightJoystick'
}
const TANK_ABSOLUTE_SOURCE = 'mobileTankJoysticks'
const APACHE_ABSOLUTE_SOURCE = 'mobileApacheJoysticks'
const TAP_PULSE_DURATION = 150

const AXES = ['up', 'down', 'left', 'right']
const MOVEMENT_DEADZONE = 0.25

function createAxisState() {
  return {
    up: 0,
    down: 0,
    left: 0,
    right: 0
  }
}

const joystickState = {
  left: {
    element: null,
    base: null,
    thumb: null,
    pointerId: null,
    startTime: 0,
    moved: false,
    axisIntensities: createAxisState(),
    activeActions: new Map(),
    normalizedX: 0,
    normalizedY: 0,
    distance: 0,
    reloadIndicator: null,
    reloadVisible: false,
    reloadProgress: 1
  },
  right: {
    element: null,
    base: null,
    thumb: null,
    pointerId: null,
    startTime: 0,
    moved: false,
    axisIntensities: createAxisState(),
    activeActions: new Map(),
    normalizedX: 0,
    normalizedY: 0,
    distance: 0,
    reloadIndicator: null,
    reloadVisible: false,
    reloadProgress: 1
  }
}

const tapState = {
  left: null,
  right: null
}

let container = null
let initialized = false
let profileWatcherHandle = null
let lastProfile = null

function isFriendlyUnit(unit) {
  if (!unit) {
    return false
  }

  const humanPlayer = gameState.humanPlayer || 'player1'
  if (!unit.owner) {
    return false
  }

  if (unit.owner === humanPlayer) {
    return true
  }

  if (humanPlayer === 'player1' && unit.owner === 'player') {
    return true
  }

  return false
}

function determineCurrentProfile() {
  const selectedUnits = getSelectedUnits()
  if (!selectedUnits || selectedUnits.length !== 1) {
    return null
  }

  const [unit] = selectedUnits
  if (!unit || !unit.movement || !isFriendlyUnit(unit)) {
    return null
  }

  if (unit.type === 'apache') {
    return 'apache'
  }

  return isTurretTankUnitType(unit.type) ? 'tank' : 'vehicle'
}

function getSelectedTankUnit() {
  const selectedUnits = getSelectedUnits()
  if (!selectedUnits || selectedUnits.length !== 1) {
    return null
  }

  const [unit] = selectedUnits
  if (!unit || !unit.movement || !isFriendlyUnit(unit)) {
    return null
  }

  return isTurretTankUnitType(unit.type) ? unit : null
}

function isContainerActive() {
  return !!(container && container.getAttribute('aria-hidden') !== 'true')
}

function isJoystickEnabled() {
  if (!isContainerActive()) {
    return false
  }

  return container.getAttribute('data-selection-active') === 'true'
}

function getTankReloadCooldown(unit) {
  if (!unit) {
    return 0
  }

  const baseRate = unit.type === 'rocketTank' ? 12000 : 4000

  if (unit.level >= 3) {
    const multiplier = unit.fireRateMultiplier || 1.33
    if (multiplier > 0) {
      return baseRate / multiplier
    }
  }

  return baseRate
}

function computeTankReloadState(unit) {
  const cooldown = getTankReloadCooldown(unit)
  if (cooldown <= 0) {
    return { progress: 1, reloading: false }
  }

  const lastShotTime = typeof unit.lastShotTime === 'number' ? unit.lastShotTime : null
  if (!lastShotTime || lastShotTime <= 0 || typeof performance === 'undefined') {
    return { progress: 1, reloading: false }
  }

  const now = performance.now()
  const elapsed = now - lastShotTime
  if (!Number.isFinite(elapsed) || elapsed >= cooldown) {
    return { progress: 1, reloading: false }
  }

  const progress = Math.max(0, Math.min(elapsed / cooldown, 1))
  return { progress, reloading: progress < 0.999 }
}

function updateTankReloadIndicator(profileOverride = null) {
  const state = joystickState.left
  const indicator = state.reloadIndicator
  if (!indicator) {
    return
  }

  const profile = profileOverride !== null ? profileOverride : determineCurrentProfile()
  const shouldShow = profile === 'tank' && isJoystickEnabled()

  if (!shouldShow) {
    if (state.reloadVisible) {
      indicator.classList.remove('visible')
      indicator.classList.remove('reloading')
      indicator.style.setProperty('--progress', '1')
    }
    state.reloadVisible = false
    state.reloadProgress = 1
    return
  }

  const unit = getSelectedTankUnit()
  if (!unit) {
    if (state.reloadVisible) {
      indicator.classList.remove('visible')
      indicator.classList.remove('reloading')
      indicator.style.setProperty('--progress', '1')
    }
    state.reloadVisible = false
    state.reloadProgress = 1
    return
  }

  const { progress, reloading } = computeTankReloadState(unit)
  const clampedProgress = Number.isFinite(progress) ? Math.max(0, Math.min(progress, 1)) : 1
  const wasVisible = state.reloadVisible

  if (!wasVisible) {
    indicator.classList.add('visible')
  }

  if (!wasVisible || Math.abs(clampedProgress - state.reloadProgress) > 0.01) {
    indicator.style.setProperty('--progress', clampedProgress.toFixed(3))
    state.reloadProgress = clampedProgress
  }

  indicator.classList.toggle('reloading', reloading)
  state.reloadVisible = true
}

function updateThumbPosition(side, dx = 0, dy = 0, radius = 0, active = false) {
  const state = joystickState[side]
  const thumb = state.thumb
  if (!thumb) {
    return
  }

  if (!active || !radius) {
    thumb.style.transform = 'translate(-50%, -50%)'
    thumb.classList.remove('active')
    return
  }

  const distance = Math.hypot(dx, dy) || 1
  const maxRadius = radius * 0.85
  const clampedDistance = Math.min(distance, maxRadius)
  const scale = clampedDistance / distance
  const finalX = dx * scale
  const finalY = dy * scale
  thumb.style.transform = `translate(calc(-50% + ${finalX}px), calc(-50% + ${finalY}px))`
  thumb.classList.add('active')
}

function computeRadialIntensity(distance) {
  if (distance <= MOVEMENT_DEADZONE) {
    return 0
  }
  const scaled = (distance - MOVEMENT_DEADZONE) / (1 - MOVEMENT_DEADZONE)
  return Math.max(0, Math.min(scaled, 1))
}

function updateAbsoluteControls(profileOverride = null) {
  const profile = profileOverride !== null ? profileOverride : determineCurrentProfile()
  const joystickActive = isJoystickEnabled()

  if (profile === 'tank' && joystickActive) {
    const right = joystickState.right
    const left = joystickState.left

    const wagonSpeed = computeRadialIntensity(right.distance)
    const wagonDirection = wagonSpeed > 0 ? Math.atan2(right.normalizedY, right.normalizedX) : null

    const turretTurnFactor = computeRadialIntensity(left.distance)
    const turretDirection =
      turretTurnFactor > 0 ? Math.atan2(left.normalizedY, left.normalizedX) : null

    setRemoteControlAbsolute(TANK_ABSOLUTE_SOURCE, {
      wagonDirection,
      wagonSpeed,
      turretDirection,
      turretTurnFactor
    })
  } else {
    clearRemoteControlAbsoluteSource(TANK_ABSOLUTE_SOURCE)
  }

  if (profile === 'apache' && joystickActive) {
    const right = joystickState.right
    const movementSpeed = computeRadialIntensity(right.distance)
    const movementDirection =
      movementSpeed > 0 ? Math.atan2(right.normalizedY, right.normalizedX) : null

    if (movementDirection !== null) {
      setRemoteControlAbsolute(APACHE_ABSOLUTE_SOURCE, {
        wagonDirection: movementDirection,
        wagonSpeed: movementSpeed,
        turretDirection: null,
        turretTurnFactor: 0
      })
    } else {
      clearRemoteControlAbsoluteSource(APACHE_ABSOLUTE_SOURCE)
    }
  } else {
    clearRemoteControlAbsoluteSource(APACHE_ABSOLUTE_SOURCE)
  }
}

function applyMappingForSide(side, mapping) {
  const state = joystickState[side]
  const previousActions = state.activeActions
  const nextActions = new Map()
  const source = HOLD_SOURCES[side]

  if (mapping) {
    const sideMapping = mapping[side] || {}
    AXES.forEach((axis) => {
      const intensity = state.axisIntensities[axis] || 0
      if (!intensity) {
        return
      }
      const actions = sideMapping[axis]
      if (!Array.isArray(actions) || actions.length === 0) {
        return
      }
      actions.forEach((action) => {
        const existing = nextActions.get(action) || 0
        if (intensity > existing) {
          nextActions.set(action, intensity)
        }
      })
    })
  }

  nextActions.forEach((intensity, action) => {
    const previousIntensity = previousActions.get(action) || 0
    if (Math.abs(previousIntensity - intensity) > 0.001) {
      setRemoteControlAction(action, source, true, intensity)
    }
  })

  previousActions.forEach((previousIntensity, action) => {
    if (!nextActions.has(action)) {
      setRemoteControlAction(action, source, false, 0)
    }
  })

  state.activeActions = nextActions
}

function updateContainerSelectionVisibility(profile) {
  if (!container) {
    return
  }

  const shouldDisplay = !!profile
  const currentlyDisplayed = container.getAttribute('data-selection-active') === 'true'

  if (shouldDisplay !== currentlyDisplayed) {
    container.setAttribute('data-selection-active', shouldDisplay ? 'true' : 'false')
    if (!shouldDisplay) {
      JOYSTICK_SIDES.forEach((side) => {
        resetJoystick(side)
      })
    }
  }
}

function applyJoystickMappings(force = false, profileOverride = null) {
  const profile = profileOverride !== null ? profileOverride : determineCurrentProfile()
  updateContainerSelectionVisibility(profile)
  updateTankReloadIndicator(profile)
  updateAbsoluteControls(profile)

  if (!force && profile === lastProfile) {
    return
  }

  lastProfile = profile
  if (profile === 'tank') {
    applyMappingForSide('left', null)
    applyMappingForSide('right', null)
    return
  }

  const mapping = profile ? getMobileJoystickMapping(profile) : null
  applyMappingForSide('left', mapping)
  applyMappingForSide('right', mapping)
}

function clearTapState(side) {
  const state = tapState[side]
  if (!state) {
    return
  }

  clearTimeout(state.timeoutId)
  state.actions.forEach(action => {
    setRemoteControlAction(action, TAP_SOURCES[side], false)
  })
  tapState[side] = null
}

function triggerTapActions(side) {
  const profile = determineCurrentProfile()
  if (!profile) {
    return
  }

  if (profile === 'tank' && side === 'left') {
    clearTapState(side)
    const source = TAP_SOURCES[side]
    setRemoteControlAction('fire', source, true, 1)

    const timeoutId = window.setTimeout(() => {
      setRemoteControlAction('fire', source, false)
      tapState[side] = null
    }, TAP_PULSE_DURATION)

    tapState[side] = { timeoutId, actions: ['fire'] }
    return
  }

  const mapping = getMobileJoystickMapping(profile)
  if (!mapping || !mapping[side]) {
    return
  }

  const actions = mapping[side].tap || []
  if (!actions.length) {
    return
  }

  clearTapState(side)
  const source = TAP_SOURCES[side]
  actions.forEach(action => setRemoteControlAction(action, source, true, 1))

  const timeoutId = window.setTimeout(() => {
    actions.forEach(action => setRemoteControlAction(action, source, false))
    tapState[side] = null
  }, TAP_PULSE_DURATION)

  tapState[side] = { timeoutId, actions }
}

function resetJoystick(side) {
  const state = joystickState[side]
  if (state.pointerId !== null && state.base) {
    try {
      state.base.releasePointerCapture(state.pointerId)
    } catch {
      // ignore release errors
    }
  }
  state.pointerId = null
  state.startTime = 0
  state.moved = false
  state.axisIntensities = createAxisState()
  state.activeActions = new Map()
  state.normalizedX = 0
  state.normalizedY = 0
  state.distance = 0
  updateThumbPosition(side, 0, 0, 0, false)
  clearRemoteControlSource(HOLD_SOURCES[side])
  clearTapState(side)
  clearRemoteControlSource(TAP_SOURCES[side])
  updateAbsoluteControls()
}

function startProfileWatcher() {
  if (profileWatcherHandle !== null || typeof window === 'undefined') {
    return
  }

  const tick = () => {
    profileWatcherHandle = null
    const profile = determineCurrentProfile()
    applyJoystickMappings(false, profile)
    if (isContainerActive()) {
      profileWatcherHandle = window.setTimeout(tick, 150)
    } else {
      lastProfile = null
    }
  }

  profileWatcherHandle = window.setTimeout(tick, 150)
}

function stopProfileWatcher() {
  if (profileWatcherHandle !== null && typeof window !== 'undefined') {
    window.clearTimeout(profileWatcherHandle)
    profileWatcherHandle = null
  }
}

function handlePointerDown(side, event) {
  if (!isJoystickEnabled()) {
    return
  }

  const state = joystickState[side]
  if (!state.base || state.pointerId !== null) {
    return
  }

  event.preventDefault()
  state.pointerId = event.pointerId
  state.startTime = performance.now()
  state.moved = false

  try {
    state.base.setPointerCapture(event.pointerId)
  } catch {
    // Ignore pointer capture failures
  }

  handlePointerMove(side, event, true)
  startProfileWatcher()
}

export function vectorFromJoystickCenter(rect, clientX, clientY) {
  const width = Number(rect?.width) || 0
  const height = Number(rect?.height) || 0
  const left = Number(rect?.left) || 0
  const top = Number(rect?.top) || 0
  const centerX = left + width / 2
  const centerY = top + height / 2
  const dx = clientX - centerX
  const dy = clientY - centerY
  const radius = width / 2
  const normalizedX = radius ? Math.max(-1, Math.min(dx / radius, 1)) : 0
  const normalizedY = radius ? Math.max(-1, Math.min(dy / radius, 1)) : 0
  const distance = Math.min(Math.hypot(normalizedX, normalizedY), 1)
  return { dx, dy, radius, normalizedX, normalizedY, distance }
}

function handlePointerMove(side, event, fromDown = false) {
  const state = joystickState[side]
  if (state.pointerId !== event.pointerId) {
    return
  }

  event.preventDefault()
  if (!state.base) {
    return
  }

  const rect = state.base.getBoundingClientRect()
  const { dx, dy, radius, normalizedX, normalizedY, distance } = vectorFromJoystickCenter(
    rect,
    event.clientX,
    event.clientY
  )

  state.normalizedX = normalizedX
  state.normalizedY = normalizedY
  state.distance = distance

  const axisIntensities = createAxisState()
  const computeDirectionalIntensity = (value) => {
    if (value <= 0) {
      return 0
    }
    if (value <= MOVEMENT_DEADZONE) {
      return 0
    }
    const scaled = (value - MOVEMENT_DEADZONE) / (1 - MOVEMENT_DEADZONE)
    return Math.max(0, Math.min(scaled, 1))
  }

  axisIntensities.up = computeDirectionalIntensity(Math.max(0, -normalizedY))
  axisIntensities.down = computeDirectionalIntensity(Math.max(0, normalizedY))
  axisIntensities.left = computeDirectionalIntensity(Math.max(0, -normalizedX))
  axisIntensities.right = computeDirectionalIntensity(Math.max(0, normalizedX))

  state.axisIntensities = axisIntensities
  if (distance > MOVEMENT_DEADZONE + 0.02) {
    state.moved = true
  }

  const isActive = axisIntensities.up || axisIntensities.down || axisIntensities.left || axisIntensities.right
  updateThumbPosition(side, dx, dy, radius, !!isActive)
  if (isActive || state.activeActions.size || fromDown) {
    applyJoystickMappings(true)
  } else {
    updateAbsoluteControls()
  }
}

function handlePointerEnd(side, event) {
  const state = joystickState[side]
  if (state.pointerId !== event.pointerId) {
    return
  }

  event.preventDefault()
  const isTap = !state.moved && performance.now() - state.startTime < 250

  resetJoystick(side)
  applyJoystickMappings(true)

  if (isTap) {
    triggerTapActions(side)
  }
}

function attachJoystickEvents(side) {
  const state = joystickState[side]
  if (!state.base) {
    return
  }

  const handleMove = (event) => handlePointerMove(side, event)
  const handleEnd = (event) => handlePointerEnd(side, event)

  state.base.addEventListener('pointerdown', (event) => handlePointerDown(side, event))
  state.base.addEventListener('pointermove', handleMove)
  state.base.addEventListener('pointerup', handleEnd)
  state.base.addEventListener('pointercancel', handleEnd)
}

export function resolveMobileJoystickMode(detail) {
  if (!detail || typeof detail !== 'object') {
    return null
  }
  if (detail.mode === 'portrait' || detail.mode === 'landscape') {
    return detail.mode
  }
  if (detail.enabled === true) {
    return 'landscape'
  }
  return null
}

let activeJoystickLayoutMode = null

export function handleMobileJoystickLayoutChange(detail) {
  const mode = resolveMobileJoystickMode(detail)
  if (!mode) {
    stopProfileWatcher()
    JOYSTICK_SIDES.forEach((side) => {
      resetJoystick(side)
    })
    if (container) {
      container.setAttribute('data-selection-active', 'false')
    }
    lastProfile = null
    activeJoystickLayoutMode = null
    updateTankReloadIndicator(null)
    return
  }

  const orientationChanged = activeJoystickLayoutMode !== null && activeJoystickLayoutMode !== mode
  activeJoystickLayoutMode = mode
  if (orientationChanged) {
    JOYSTICK_SIDES.forEach((side) => {
      if (joystickState[side].pointerId !== null) {
        resetJoystick(side)
      }
    })
  }
  startProfileWatcher()
  applyJoystickMappings(true)
}

export function initializeJoysticks() {
  if (typeof document === 'undefined') {
    return
  }

  const nextContainer = document.getElementById('mobileJoystickContainer')
  if (initialized && container && container.isConnected && container === nextContainer) {
    return
  }

  initialized = false
  container = nextContainer
  if (!container) {
    return
  }

  if (!container.hasAttribute('data-selection-active')) {
    container.setAttribute('data-selection-active', 'false')
  }

  JOYSTICK_SIDES.forEach((side) => {
    const state = joystickState[side]
    state.element = container.querySelector(`[data-joystick="${side}"]`)
    state.base = state.element ? state.element.querySelector('.joystick-base') : null
    state.thumb = state.element ? state.element.querySelector('.joystick-thumb') : null
    state.pointerId = null
    state.startTime = 0
    state.moved = false
    state.axisIntensities = createAxisState()
    state.activeActions = new Map()
    if (side === 'left' && state.base) {
      let indicator = state.base.querySelector('.joystick-reload-ring')
      if (!indicator) {
        indicator = document.createElement('div')
        indicator.className = 'joystick-reload-ring'
        indicator.style.setProperty('--progress', '1')
        state.base.appendChild(indicator)
      }
      state.reloadIndicator = indicator
      state.reloadVisible = false
      state.reloadProgress = 1
      indicator.classList.remove('visible')
      indicator.classList.remove('reloading')
      indicator.style.setProperty('--progress', '1')
    }
    updateThumbPosition(side, 0, 0, 0, false)
    attachJoystickEvents(side)
  })

  initialized = true

  if (isContainerActive()) {
    startProfileWatcher()
  }

  updateTankReloadIndicator()
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initializeJoysticks())
  } else {
    initializeJoysticks()
  }

  document.addEventListener('mobile-landscape-layout-changed', (event) => {
    handleMobileJoystickLayoutChange(event && event.detail)
  })
}
