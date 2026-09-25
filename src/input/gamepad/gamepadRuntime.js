import { TILE_SIZE } from '../../config.js'
import { gameState } from '../../gameState.js'
import { showNotification } from '../../ui/notifications.js'
import { TRIGGER_THRESHOLD } from './deadzone.js'
import { readBinding } from './gamepadBinding.js'
import { gamepadBridge } from './gamepadCommandBridge.js'
import { getActiveBindings, knownGamepadInstanceKeys, rememberGamepadAssignments } from './gamepadProfiles.js'
import { reconcileGamepadSlots } from './gamepadIdentity.js'
import { GAMEPAD_MONITOR_AXES, GAMEPAD_MONITOR_BUTTONS, gamepadMonitor, setGamepadPoller } from './gamepadMonitor.js'
import { getGamepadStore, persistGamepadStore } from './gamepadStore.js'
import { uiText } from '../../ui/uiText.js'
import {
  getGamepadCapture,
  isGamepadMenuOpen,
  offerCapturedInput,
  setGamepadBindingsListener,
  syncGamepadMenu
} from '../../ui/gamepadMappingMenu.js'

const CURSOR_SPEED = 820
const MAX_DT = 0.05
const SOURCE = ['gamepad:0', 'gamepad:1']
const GLOBAL_REMOTE_ACTIONS = ['forward', 'backward', 'turnLeft', 'turnRight', 'turretLeft', 'turretRight', 'fire']
const COOP_ACTION_NAMES = ['forward', 'backward', 'turnLeft', 'turnRight', 'turretLeft', 'turretRight', 'fire', 'ascend', 'descend', 'strafeLeft', 'strafeRight']
const COOP_PAIRS = [
  ['remoteUp', 'forward'],
  ['remoteDown', 'backward'],
  ['remoteLeft', 'turnLeft'],
  ['remoteRight', 'turnRight'],
  ['turretLeft', 'turretLeft'],
  ['turretRight', 'turretRight'],
  ['fire', 'fire']
]
const mergedRemote = {
  forward: 0,
  backward: 0,
  turnLeft: 0,
  turnRight: 0,
  turretLeft: 0,
  turretRight: 0,
  fire: 0
}

const previousButtons = [new Float32Array(GAMEPAD_MONITOR_BUTTONS), new Float32Array(GAMEPAD_MONITOR_BUTTONS)]
const previousAxes = [new Float32Array(GAMEPAD_MONITOR_AXES), new Float32Array(GAMEPAD_MONITOR_AXES)]
const bindingCache = [null, null]
const idCache = ['', '', '', '']
const indexCache = [-1, -1, -1, -1]
const assignments = [null, null]

let started = false
let lastPollAt = 0
const remoteWasActive = [false, false]
let cursorX = -1
let cursorY = -1
let cursorVisible = false
let rectLeft = 0
let rectTop = 0
let viewWidth = 0
let viewHeight = 0
let rectFrame = 0
let pointerButton = -1

function canvas() {
  return typeof document !== 'undefined' ? document.getElementById('gameCanvas') : null
}

function refreshRect(force) {
  rectFrame += 1
  if (!force && rectFrame % 30 !== 0 && viewWidth > 0) return
  const gameCanvas = canvas()
  if (!gameCanvas || typeof gameCanvas.getBoundingClientRect !== 'function') return
  const rect = gameCanvas.getBoundingClientRect()
  rectLeft = rect.left
  rectTop = rect.top
  viewWidth = rect.width
  viewHeight = rect.height
  if (cursorX < 0 && viewWidth > 0) {
    cursorX = viewWidth / 2
    cursorY = viewHeight / 2
  }
}

function cursorElement() {
  return typeof document !== 'undefined' ? document.getElementById('gamepadCursor') : null
}

function placeCursor(visible) {
  const element = cursorElement()
  if (!element) return
  if (!visible) {
    if (cursorVisible) {
      element.hidden = true
      cursorVisible = false
    }
    return
  }
  if (!cursorVisible) {
    element.hidden = false
    cursorVisible = true
  }
  const x = rectLeft + cursorX
  const y = rectTop + cursorY
  if (element._px === x && element._py === y) return
  element._px = x
  element._py = y
  element.style.transform = `translate3d(${x}px, ${y}px, 0)`
}

function paintIndicators() {
  for (let slot = 0; slot < 2; slot++) {
    const hud = typeof document !== 'undefined' ? document.getElementById(slot === 0 ? 'gamepadIndicatorP1' : 'gamepadIndicatorP2') : null
    const monitor = gamepadMonitor.slots[slot]
    if (!hud) continue
    const on = monitor.connected ? '1' : '0'
    if (hud.dataset.on === on) continue
    hud.dataset.on = on
    hud.classList.toggle('gamepad-indicator--on', monitor.connected)
    hud.hidden = !monitor.connected
  }
}

function readPad(pad, slot) {
  const monitor = gamepadMonitor.slots[slot]
  const buttons = monitor.buttons
  const axes = monitor.axes
  const buttonCount = Math.min(pad.buttons ? pad.buttons.length : 0, GAMEPAD_MONITOR_BUTTONS)
  const axisCount = Math.min(pad.axes ? pad.axes.length : 0, GAMEPAD_MONITOR_AXES)
  for (let i = 0; i < GAMEPAD_MONITOR_BUTTONS; i++) {
    if (i < buttonCount) {
      const button = pad.buttons[i]
      const value = button && typeof button.value === 'number' ? button.value : 0
      buttons[i] = value > 0 ? value : (button && button.pressed ? 1 : 0)
    } else {
      buttons[i] = 0
    }
  }
  for (let i = 0; i < GAMEPAD_MONITOR_AXES; i++) {
    axes[i] = i < axisCount ? (Number(pad.axes[i]) || 0) : 0
  }
  monitor.buttonCount = buttonCount
  monitor.axisCount = axisCount
  monitor.mapping = pad.mapping || ''
}

function bindingsFor(slot) {
  if (bindingCache[slot]) return bindingCache[slot]
  const assignment = assignments[slot]
  if (!assignment) return null
  bindingCache[slot] = getActiveBindings(getGamepadStore(), assignment.instanceKey, slot)
  return bindingCache[slot]
}

export function refreshGamepadBindingCache() {
  bindingCache[0] = null
  bindingCache[1] = null
}

function localPartyUnit(unit) {
  const owner = gameState.humanPlayer || 'player1'
  return unit && (unit.owner === owner || (owner === 'player1' && unit.owner === 'player'))
}

function findClaimTarget() {
  refreshRect(true)
  const worldX = cursorX + (gameState.scrollOffset ? gameState.scrollOffset.x : 0)
  const worldY = cursorY + (gameState.scrollOffset ? gameState.scrollOffset.y : 0)
  const units = gameState.units || []
  let best = null
  let bestDistance = TILE_SIZE
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]
    if (!unit || unit.health <= 0 || unit.isBuilding || !localPartyUnit(unit)) continue
    const distance = Math.hypot((unit.x + TILE_SIZE / 2) - worldX, (unit.y + TILE_SIZE / 2) - worldY)
    if (distance < bestDistance) {
      best = unit
      bestDistance = distance
    }
  }
  if (best) return best
  const selected = gamepadBridge.selectedUnits
  if (!selected) return null
  for (let i = 0; i < selected.length; i++) {
    const unit = selected[i]
    if (localPartyUnit(unit) && unit.health > 0 && !unit.isBuilding) return unit
  }
  return null
}

function claimUnit() {
  const unit = findClaimTarget()
  const getCoopSlot = gamepadBridge.getCoopSlot
  const publishCoopSlot = gamepadBridge.publishCoopSlot
  if (!unit || !getCoopSlot || !publishCoopSlot) return
  const slot = getCoopSlot(gameState.humanPlayer || 'player1')
  slot.unitId = unit.id
  slot.unit = unit
  unit.selected = false
  const selected = gamepadBridge.selectedUnits
  const index = selected ? selected.indexOf(unit) : -1
  if (index >= 0) selected.splice(index, 1)
  showNotification(uiText('settings.gamepad.claimed'), 1600)
  publishCoopSlot(gameState.humanPlayer || 'player1')
}

function dispatchPointer(type, button) {
  const gameCanvas = canvas()
  if (!gameCanvas) return
  refreshRect(true)
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: rectLeft + cursorX,
    clientY: rectTop + cursorY,
    button,
    buttons: type === 'mouseup' ? 0 : (button === 2 ? 2 : 1)
  })
  gameCanvas.dispatchEvent(event)
}

function updatePointer(button, down) {
  if (down) {
    if (pointerButton === -1) {
      pointerButton = button
      dispatchPointer('mousedown', button)
    }
    return
  }
  if (pointerButton === button) {
    dispatchPointer('mouseup', button)
    pointerButton = -1
  }
}

function movePointer(dx, dy) {
  if (!dx && !dy) return
  refreshRect(false)
  cursorX = Math.max(0, Math.min(viewWidth, cursorX + dx))
  cursorY = Math.max(0, Math.min(viewHeight, cursorY + dy))
  placeCursor(true)
  if (pointerButton !== -1) dispatchPointer('mousemove', pointerButton)
  else dispatchPointer('mousemove', 0)
}

function pressedEdge(binding, buttons, axes, prevButtons, prevAxes) {
  if (!binding || readBinding(binding, buttons, axes) <= 0) return false
  if (binding.type === 'button') return (prevButtons[binding.index] || 0) < TRIGGER_THRESHOLD
  const previous = prevAxes[binding.index] || 0
  if (binding.sign === -1) return previous > -TRIGGER_THRESHOLD
  if (binding.sign === 1) return previous < TRIGGER_THRESHOLD
  return Math.abs(previous) < TRIGGER_THRESHOLD
}

function applyGlobalRemote(bindings, buttons, axes) {
  const moveX = readBinding(bindings.remoteMoveX, buttons, axes)
  const moveY = readBinding(bindings.remoteMoveY, buttons, axes)
  mergedRemote.forward = Math.max(readBinding(bindings.remoteUp, buttons, axes), moveY < 0 ? -moveY : 0)
  mergedRemote.backward = Math.max(readBinding(bindings.remoteDown, buttons, axes), moveY > 0 ? moveY : 0)
  mergedRemote.turnLeft = Math.max(readBinding(bindings.remoteLeft, buttons, axes), moveX < 0 ? -moveX : 0)
  mergedRemote.turnRight = Math.max(readBinding(bindings.remoteRight, buttons, axes), moveX > 0 ? moveX : 0)
  mergedRemote.turretLeft = readBinding(bindings.turretLeft, buttons, axes)
  mergedRemote.turretRight = readBinding(bindings.turretRight, buttons, axes)
  mergedRemote.fire = readBinding(bindings.fire, buttons, axes)
  const syncRemoteControlAction = gamepadBridge.syncRemoteControlAction
  if (!syncRemoteControlAction) return
  for (let i = 0; i < GLOBAL_REMOTE_ACTIONS.length; i++) {
    const action = GLOBAL_REMOTE_ACTIONS[i]
    syncRemoteControlAction(action, SOURCE[0], mergedRemote[action] > 0, mergedRemote[action])
  }
}

function applyCoopRemote(bindings, buttons, axes) {
  const getCoopSlot = gamepadBridge.getCoopSlot
  const publishCoopSlot = gamepadBridge.publishCoopSlot
  if (!getCoopSlot || !publishCoopSlot) return
  const slot = getCoopSlot(gameState.humanPlayer || 'player1')
  const actions = slot.actions
  for (let i = 0; i < COOP_ACTION_NAMES.length; i++) actions[COOP_ACTION_NAMES[i]] = 0
  for (let i = 0; i < COOP_PAIRS.length; i++) {
    actions[COOP_PAIRS[i][1]] = readBinding(bindings[COOP_PAIRS[i][0]], buttons, axes)
  }
  const moveX = readBinding(bindings.remoteMoveX, buttons, axes)
  const moveY = readBinding(bindings.remoteMoveY, buttons, axes)
  const magnitude = Math.hypot(moveX, moveY)
  if (magnitude > 0) {
    slot.absolute.wagonDirection = Math.atan2(moveY, moveX)
    slot.absolute.wagonSpeed = magnitude > 1 ? 1 : magnitude
  } else {
    slot.absolute.wagonDirection = null
    slot.absolute.wagonSpeed = 0
  }
  publishCoopSlot(gameState.humanPlayer || 'player1')
}

function zeroCoopStick() {
  const getCoopSlot = gamepadBridge.getCoopSlot
  const publishCoopSlot = gamepadBridge.publishCoopSlot
  if (!getCoopSlot || !publishCoopSlot) return
  const slot = getCoopSlot(gameState.humanPlayer || 'player1')
  for (let i = 0; i < COOP_ACTION_NAMES.length; i++) slot.actions[COOP_ACTION_NAMES[i]] = 0
  slot.absolute.wagonDirection = null
  slot.absolute.wagonSpeed = 0
  slot.absolute.turretDirection = null
  slot.absolute.turretTurnFactor = 0
  publishCoopSlot(gameState.humanPlayer || 'player1')
}

function applySlot(slot, pad, dt, gameplay) {
  const monitor = gamepadMonitor.slots[slot]
  const buttons = monitor.buttons
  const axes = monitor.axes
  const prevButtons = previousButtons[slot]
  const prevAxes = previousAxes[slot]
  readPad(pad, slot)
  const bindings = bindingsFor(slot)
  const capture = getGamepadCapture()
  if (capture && capture.slot === slot && bindings) {
    offerCapturedInput(capture, buttons, axes, prevButtons, prevAxes)
  } else if (gameplay && bindings) {
    if (slot === 0) {
      const stickX = readBinding(bindings.cursorX, buttons, axes)
      const stickY = readBinding(bindings.cursorY, buttons, axes)
      if (stickX || stickY) movePointer(stickX * CURSOR_SPEED * dt, stickY * CURSOR_SPEED * dt)
      const left = readBinding(bindings.leftClick, buttons, axes) > 0
      const right = readBinding(bindings.rightClick, buttons, axes) > 0
      updatePointer(0, left && !right)
      updatePointer(2, right)
    }
    const scrollX = readBinding(bindings.mapScrollX, buttons, axes)
    const scrollY = readBinding(bindings.mapScrollY, buttons, axes)
    gameState.gamepadScroll.x = Math.max(-1, Math.min(1, gameState.gamepadScroll.x + scrollX))
    gameState.gamepadScroll.y = Math.max(-1, Math.min(1, gameState.gamepadScroll.y + scrollY))
    if (pressedEdge(bindings.jumpToLastEvent, buttons, axes, prevButtons, prevAxes) && gamepadBridge.focusLastAttack) {
      gamepadBridge.focusLastAttack()
    }
    if (pressedEdge(bindings.toggleRepair, buttons, axes, prevButtons, prevAxes)) {
      const keyboard = gamepadBridge.getKeyboardHandler ? gamepadBridge.getKeyboardHandler() : null
      if (keyboard) keyboard.handleRepairMode()
    }
    if (pressedEdge(bindings.toggleSell, buttons, axes, prevButtons, prevAxes)) {
      const keyboard = gamepadBridge.getKeyboardHandler ? gamepadBridge.getKeyboardHandler() : null
      if (keyboard) keyboard.handleSellMode()
    }
    if (slot === 1 && pressedEdge(bindings.claimUnit, buttons, axes, prevButtons, prevAxes)) claimUnit()
    if (slot === 0) applyGlobalRemote(bindings, buttons, axes)
    else applyCoopRemote(bindings, buttons, axes)
    const remoteActive = readBinding(bindings.remoteUp, buttons, axes) ||
      readBinding(bindings.remoteDown, buttons, axes) ||
      readBinding(bindings.remoteLeft, buttons, axes) ||
      readBinding(bindings.remoteRight, buttons, axes) ||
      readBinding(bindings.remoteMoveX, buttons, axes) ||
      readBinding(bindings.remoteMoveY, buttons, axes) ||
      readBinding(bindings.fire, buttons, axes)
    if (slot === 1 && remoteActive > 0 && !remoteWasActive[slot] && gamepadBridge.getCoopSlot) {
      const coop = gamepadBridge.getCoopSlot(gameState.humanPlayer || 'player1')
      if (coop && !coop.unitId) claimUnit()
    }
    remoteWasActive[slot] = remoteActive > 0
  } else {
    remoteWasActive[slot] = false
  }
  prevButtons.set(buttons)
  prevAxes.set(axes)
}

function clearSlot(slot) {
  const monitor = gamepadMonitor.slots[slot]
  if (!monitor.connected && !assignments[slot]) return
  monitor.connected = false
  monitor.buttonCount = 0
  monitor.axisCount = 0
  monitor.buttons.fill(0)
  monitor.axes.fill(0)
  previousButtons[slot].fill(0)
  previousAxes[slot].fill(0)
  if (gamepadBridge.clearRemoteControlSource) gamepadBridge.clearRemoteControlSource(SOURCE[slot])
  if (slot === 1) zeroCoopStick()
  if (slot === 0 && pointerButton !== -1) {
    dispatchPointer('mouseup', pointerButton)
    pointerButton = -1
  }
}

function reconcile(pads) {
  const connected = []
  const length = pads ? pads.length : 0
  for (let i = 0; i < length; i++) {
    const pad = pads[i]
    if (pad && pad.connected) connected.push({ id: pad.id, index: pad.index, connected: true })
  }
  const store = getGamepadStore()
  const result = reconcileGamepadSlots(
    assignments.filter(Boolean).concat(store.assignments || []),
    connected,
    knownGamepadInstanceKeys(store)
  )
  for (let slot = 0; slot < 2; slot++) {
    const next = result.slots[slot]
    const previous = assignments[slot]
    assignments[slot] = next
    const monitor = gamepadMonitor.slots[slot]
    if (!next || !next.connected) {
      if (previous && previous.connected) clearSlot(slot)
      if (next) {
        monitor.id = next.id
        monitor.index = next.index
        monitor.instanceKey = next.instanceKey
      }
      monitor.connected = false
      bindingCache[slot] = null
      continue
    }
    const identityChanged = !previous || previous.instanceKey !== next.instanceKey || previous.index !== next.index
    monitor.connected = true
    monitor.id = next.id
    monitor.index = next.index
    monitor.instanceKey = next.instanceKey
    if (identityChanged) bindingCache[slot] = null
  }
  gamepadMonitor.ignored = result.ignored
  rememberGamepadAssignments(store, result.slots)
  persistGamepadStore()
  gamepadMonitor.changed = true
}

function padsChanged(pads) {
  let changed = false
  for (let i = 0; i < idCache.length; i++) {
    const pad = pads && pads[i]
    const id = pad && pad.connected ? pad.id : ''
    const index = pad && pad.connected ? pad.index : -1
    if (idCache[i] !== id || indexCache[i] !== index) {
      idCache[i] = id
      indexCache[i] = index
      changed = true
    }
  }
  return changed
}

function gameplayAllowed() {
  if (!gameState.gameStarted || gameState.gamePaused || gameState.gameOver) return false
  if (typeof document !== 'undefined' && document.body && document.body.classList.contains('config-modal-open')) return false
  if (gameState.replayMode && !gameState.replay?.isApplyingReplayCommand) return false
  if (gameState.isSpectator || gameState.localPlayerDefeated || gameState.hostPausedByRemote) return false
  return true
}

export function pollGamepads(now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
  if (now - lastPollAt < 4) return
  const dt = lastPollAt ? Math.min(MAX_DT, (now - lastPollAt) / 1000) : 0.016
  lastPollAt = now
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null
  if (pads && padsChanged(pads)) reconcile(pads)
  if (gameState.gamepadScroll) {
    gameState.gamepadScroll.x = 0
    gameState.gamepadScroll.y = 0
  }
  const gameplay = gameplayAllowed()
  let playerOne = false
  for (let slot = 0; slot < 2; slot++) {
    const assignment = assignments[slot]
    const pad = assignment && pads ? pads[assignment.index] : null
    const live = Boolean(pad && pad.connected && pad.id === assignment.id)
    if (!live) {
      if (gamepadMonitor.slots[slot].connected) clearSlot(slot)
      continue
    }
    if (slot === 0) playerOne = true
    applySlot(slot, pad, dt, gameplay)
  }
  if (!playerOne) placeCursor(false)
  else if (cursorVisible) placeCursor(true)
  paintIndicators()
  if (isGamepadMenuOpen()) syncGamepadMenu(gamepadMonitor)
}

export function initGamepadSupport() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('gamepadconnected', () => pollGamepads(performance.now()))
  window.addEventListener('gamepaddisconnected', () => pollGamepads(performance.now()))
  setGamepadBindingsListener(refreshGamepadBindingCache)
  setGamepadPoller(pollGamepads)
}

export function currentGamepadAssignments() {
  return assignments
}
