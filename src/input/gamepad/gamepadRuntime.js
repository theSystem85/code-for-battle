import { TILE_SIZE } from '../../config.js'
import { gameState } from '../../gameState.js'
import { showNotification } from '../../ui/notifications.js'
import { STICK_DEADZONE, TRIGGER_THRESHOLD } from './deadzone.js'
import { readBinding, stickAxisEnabled } from './gamepadBinding.js'
import { gamepadBridge } from './gamepadCommandBridge.js'
import { pulseGamepad } from './gamepadHaptics.js'
import { writeGamepadEdgeScroll } from './gamepadEdgeScroll.js'
import { knownGamepadInstanceKeys, getGamepadScrollSpeed, rememberGamepadAssignments, resolveDeadzones, resolveGamepadBindings, suggestControllerLayout } from './gamepadProfiles.js'
import { nextRemoteStickToggle } from './remoteStickToggle.js'
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
const deadzoneCache = [
  { left: STICK_DEADZONE, right: STICK_DEADZONE },
  { left: STICK_DEADZONE, right: STICK_DEADZONE }
]
const lastControlledHealth = [-1, -1]
const lastControlledId = ['', '']
const lastDamagePulseAt = [0, 0]
const remoteStickToggle = [false, false]
const edgeScroll = { x: 0, y: 0 }
let cachedScrollSpeed = 8
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
  if (viewWidth > 0 && cursorX < 0) {
    cursorX = viewWidth / 2
    cursorY = viewHeight / 2
  } else if (viewWidth > 0) {
    if (cursorX > viewWidth) cursorX = viewWidth
    if (cursorY > viewHeight) cursorY = viewHeight
    if (cursorY < 0) cursorY = 0
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
  element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
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
  const store = getGamepadStore()
  bindingCache[slot] = resolveGamepadBindings(store, {
    slot,
    instanceKey: assignment.instanceKey,
    gamepadId: assignment.id
  }).bindings
  const zones = resolveDeadzones(store, { slot, instanceKey: assignment.instanceKey })
  deadzoneCache[slot].left = zones.left
  deadzoneCache[slot].right = zones.right
  return bindingCache[slot]
}

export function refreshGamepadBindingCache() {
  bindingCache[0] = null
  bindingCache[1] = null
  cachedScrollSpeed = getGamepadScrollSpeed(getGamepadStore())
  gameState.gamepadScrollSpeed = cachedScrollSpeed
}

function livingSelectedUnit() {
  const selected = gamepadBridge.selectedUnits
  if (!selected) return false
  for (let i = 0; i < selected.length; i++) {
    const unit = selected[i]
    if (unit && !unit.isBuilding && unit.health > 0) return true
  }
  return false
}

function remoteTargetAlive(slot) {
  if (slot === 1) {
    const getCoopSlot = gamepadBridge.getCoopSlot
    if (!getCoopSlot) return false
    const coop = getCoopSlot(gameState.humanPlayer || 'player1')
    return Boolean(coop && coop.unit && coop.unit.health > 0 && coop.unit.id === coop.unitId)
  }
  return livingSelectedUnit()
}

function paintRemoteIndicator() {
  const element = typeof document !== 'undefined' ? document.getElementById('gamepadRemoteIndicator') : null
  if (!element) return
  const mode = (remoteStickToggle[0] ? 1 : 0) + (remoteStickToggle[1] ? 2 : 0)
  if (element._mode === mode) return
  element._mode = mode
  element.hidden = mode === 0
  if (!mode) return
  const label = element.querySelector('[data-gamepad-remote-label]')
  if (!label) return
  const key = mode === 2
    ? 'settings.gamepad.remoteActiveP2'
    : (mode === 3 ? 'settings.gamepad.remoteActiveBoth' : 'settings.gamepad.remoteActive')
  const fallback = mode === 2 ? 'P2 remote control' : (mode === 3 ? 'Remote control · P2' : 'Remote control')
  label.textContent = uiText(key) || fallback
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

function readSlotBinding(padSlot, binding, buttons, axes) {
  const zone = !binding || binding.type !== 'axis'
    ? STICK_DEADZONE
    : (binding.index <= 1 ? deadzoneCache[padSlot].left : deadzoneCache[padSlot].right)
  return readBinding(binding, buttons, axes, zone)
}

function pressedEdge(padSlot, binding, buttons, axes, prevButtons, prevAxes) {
  if (!binding || readSlotBinding(padSlot, binding, buttons, axes) <= 0) return false
  if (binding.type === 'button') return (prevButtons[binding.index] || 0) < TRIGGER_THRESHOLD
  const previous = prevAxes[binding.index] || 0
  if (binding.sign === -1) return previous > -TRIGGER_THRESHOLD
  if (binding.sign === 1) return previous < TRIGGER_THRESHOLD
  return Math.abs(previous) < TRIGGER_THRESHOLD
}

function axisValue(padSlot, commandId, binding, buttons, axes, aim) {
  if (!stickAxisEnabled(commandId, binding, padSlot, aim)) return 0
  return readSlotBinding(padSlot, binding, buttons, axes)
}

function placementModeActive() {
  return Boolean(
    gameState.buildingPlacementMode ||
    gameState.chainBuildMode ||
    gameState.chainBuildPrimed ||
    gameState.attackGroupMode ||
    gameState.repairMode ||
    gameState.sellMode
  )
}

function pauseAllowed() {
  if (!gameState.gameStarted || gameState.gameOver) return false
  if (typeof document !== 'undefined' && document.body && document.body.classList.contains('config-modal-open')) return false
  if (gameState.replayMode && !gameState.replay?.isApplyingReplayCommand) return false
  if (gameState.isSpectator || gameState.localPlayerDefeated || gameState.hostPausedByRemote) return false
  return true
}

function togglePause() {
  const button = typeof document !== 'undefined' ? document.getElementById('pauseBtn') : null
  if (button) button.click()
}

function applyGlobalRemote(padSlot, bindings, buttons, axes, aim) {
  const moveX = axisValue(padSlot, 'remoteMoveX', bindings.remoteMoveX, buttons, axes, aim)
  const moveY = axisValue(padSlot, 'remoteMoveY', bindings.remoteMoveY, buttons, axes, aim)
  mergedRemote.forward = Math.max(readSlotBinding(padSlot, bindings.remoteUp, buttons, axes), moveY < 0 ? -moveY : 0)
  mergedRemote.backward = Math.max(readSlotBinding(padSlot, bindings.remoteDown, buttons, axes), moveY > 0 ? moveY : 0)
  mergedRemote.turnLeft = Math.max(readSlotBinding(padSlot, bindings.remoteLeft, buttons, axes), moveX < 0 ? -moveX : 0)
  mergedRemote.turnRight = Math.max(readSlotBinding(padSlot, bindings.remoteRight, buttons, axes), moveX > 0 ? moveX : 0)
  mergedRemote.turretLeft = axisValue(padSlot, 'turretLeft', bindings.turretLeft, buttons, axes, aim)
  mergedRemote.turretRight = axisValue(padSlot, 'turretRight', bindings.turretRight, buttons, axes, aim)
  mergedRemote.fire = readSlotBinding(padSlot, bindings.fire, buttons, axes)
  const syncRemoteControlAction = gamepadBridge.syncRemoteControlAction
  if (!syncRemoteControlAction) return
  for (let i = 0; i < GLOBAL_REMOTE_ACTIONS.length; i++) {
    const action = GLOBAL_REMOTE_ACTIONS[i]
    syncRemoteControlAction(action, SOURCE[0], mergedRemote[action] > 0, mergedRemote[action])
  }
}

function applyCoopRemote(padSlot, bindings, buttons, axes, aim) {
  const getCoopSlot = gamepadBridge.getCoopSlot
  const publishCoopSlot = gamepadBridge.publishCoopSlot
  if (!getCoopSlot || !publishCoopSlot) return
  const slot = getCoopSlot(gameState.humanPlayer || 'player1')
  const actions = slot.actions
  for (let i = 0; i < COOP_ACTION_NAMES.length; i++) actions[COOP_ACTION_NAMES[i]] = 0
  for (let i = 0; i < COOP_PAIRS.length; i++) {
    const commandId = COOP_PAIRS[i][0]
    actions[COOP_PAIRS[i][1]] = axisValue(padSlot, commandId, bindings[commandId], buttons, axes, aim)
  }
  const moveX = axisValue(padSlot, 'remoteMoveX', bindings.remoteMoveX, buttons, axes, aim)
  const moveY = axisValue(padSlot, 'remoteMoveY', bindings.remoteMoveY, buttons, axes, aim)
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

function controlledUnit(slot) {
  if (slot === 1) {
    const getCoopSlot = gamepadBridge.getCoopSlot
    if (!getCoopSlot) return null
    const coop = getCoopSlot(gameState.humanPlayer || 'player1')
    if (!coop || !coop.unit || coop.unitId == null || coop.unit.id !== coop.unitId) return null
    return coop.unit
  }
  const selected = gamepadBridge.selectedUnits
  if (!selected) return null
  const stickActive = remoteWasActive[0]
  for (let i = 0; i < selected.length; i++) {
    const candidate = selected[i]
    if (!candidate || typeof candidate.health !== 'number') continue
    if (stickActive || candidate.remoteControlActive) return candidate
  }
  return null
}

function sampleControlledDamage(slot, pad, now) {
  const unit = controlledUnit(slot)
  if (!unit || typeof unit.health !== 'number') {
    lastControlledHealth[slot] = -1
    lastControlledId[slot] = ''
    return
  }
  if (lastControlledId[slot] !== unit.id) {
    lastControlledId[slot] = unit.id
    lastControlledHealth[slot] = unit.health
    return
  }
  const previous = lastControlledHealth[slot]
  lastControlledHealth[slot] = unit.health
  if (previous < 0 || unit.health >= previous) return
  if (now - lastDamagePulseAt[slot] < 100) return
  lastDamagePulseAt[slot] = now
  pulseGamepad(pad, 'damage')
}

function applySlot(slot, pad, dt, gameplay, now) {
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
  } else if (bindings) {
    if (pauseAllowed() && pressedEdge(slot, bindings.pause, buttons, axes, prevButtons, prevAxes)) togglePause()
    if (!gameplay) {
      remoteStickToggle[slot] = nextRemoteStickToggle(remoteStickToggle[slot], false, remoteTargetAlive(slot))
      remoteWasActive[slot] = false
      prevButtons.set(buttons)
      prevAxes.set(axes)
      return
    }
    const togglePressed = pressedEdge(slot, bindings.remoteStickMode, buttons, axes, prevButtons, prevAxes)
    remoteStickToggle[slot] = nextRemoteStickToggle(remoteStickToggle[slot], togglePressed, remoteTargetAlive(slot))
    const aim = remoteStickToggle[slot]
    if (slot === 0) {
      refreshRect(true)
      const stickX = axisValue(slot, 'cursorX', bindings.cursorX, buttons, axes, aim)
      const stickY = axisValue(slot, 'cursorY', bindings.cursorY, buttons, axes, aim)
      if (stickX || stickY) movePointer(stickX * CURSOR_SPEED * dt, stickY * CURSOR_SPEED * dt)
      const left = readSlotBinding(slot, bindings.leftClick, buttons, axes) > 0
      const right = readSlotBinding(slot, bindings.rightClick, buttons, axes) > 0
      const cancelModes = placementModeActive()
      if (cancelModes && pressedEdge(slot, bindings.rightClick, buttons, axes, prevButtons, prevAxes)) {
        const keyboard = gamepadBridge.getKeyboardHandler ? gamepadBridge.getKeyboardHandler() : null
        if (keyboard && keyboard.handleEscapeKey) keyboard.handleEscapeKey()
      }
      updatePointer(0, left && !right)
      updatePointer(2, right && !cancelModes)
    }
    const scrollX = axisValue(slot, 'mapScrollX', bindings.mapScrollX, buttons, axes, aim)
    const scrollY = axisValue(slot, 'mapScrollY', bindings.mapScrollY, buttons, axes, aim)
    let edgeX = 0
    let edgeY = 0
    if (slot === 0 && !aim && viewWidth > 0 && viewHeight > 0 && cursorX >= 0) {
      writeGamepadEdgeScroll(edgeScroll, cursorX, cursorY, viewWidth, viewHeight)
      edgeX = edgeScroll.x
      edgeY = edgeScroll.y
    }
    gameState.gamepadScroll.x = Math.max(-1, Math.min(1, gameState.gamepadScroll.x + scrollX + edgeX))
    gameState.gamepadScroll.y = Math.max(-1, Math.min(1, gameState.gamepadScroll.y + scrollY + edgeY))
    if (pressedEdge(slot, bindings.jumpToLastEvent, buttons, axes, prevButtons, prevAxes) && gamepadBridge.focusLastAttack) {
      gamepadBridge.focusLastAttack()
    }
    if (pressedEdge(slot, bindings.toggleRepair, buttons, axes, prevButtons, prevAxes)) {
      const keyboard = gamepadBridge.getKeyboardHandler ? gamepadBridge.getKeyboardHandler() : null
      if (keyboard) keyboard.handleRepairMode()
    }
    if (pressedEdge(slot, bindings.toggleSell, buttons, axes, prevButtons, prevAxes)) {
      const keyboard = gamepadBridge.getKeyboardHandler ? gamepadBridge.getKeyboardHandler() : null
      if (keyboard) keyboard.handleSellMode()
    }
    if (slot === 1 && pressedEdge(slot, bindings.claimUnit, buttons, axes, prevButtons, prevAxes)) claimUnit()
    if (pressedEdge(slot, bindings.fire, buttons, axes, prevButtons, prevAxes)) pulseGamepad(pad, 'fire')
    if (slot === 0) applyGlobalRemote(slot, bindings, buttons, axes, aim)
    else applyCoopRemote(slot, bindings, buttons, axes, aim)
    const remoteActive = readSlotBinding(slot, bindings.remoteUp, buttons, axes) ||
      readSlotBinding(slot, bindings.remoteDown, buttons, axes) ||
      readSlotBinding(slot, bindings.remoteLeft, buttons, axes) ||
      readSlotBinding(slot, bindings.remoteRight, buttons, axes) ||
      axisValue(slot, 'remoteMoveX', bindings.remoteMoveX, buttons, axes, aim) ||
      axisValue(slot, 'remoteMoveY', bindings.remoteMoveY, buttons, axes, aim) ||
      readSlotBinding(slot, bindings.fire, buttons, axes)
    if (slot === 1 && remoteActive > 0 && !remoteWasActive[slot] && gamepadBridge.getCoopSlot) {
      const coop = gamepadBridge.getCoopSlot(gameState.humanPlayer || 'player1')
      if (coop && !coop.unitId) claimUnit()
    }
    remoteWasActive[slot] = remoteActive > 0
    sampleControlledDamage(slot, pad, now)
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
  lastControlledHealth[slot] = -1
  lastControlledId[slot] = ''
  remoteStickToggle[slot] = false
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
    const becameConnected = !previous || !previous.connected
    if (identityChanged) bindingCache[slot] = null
    if (identityChanged || becameConnected) suggestControllerLayout(store, slot, next.id)
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
  gameState.gamepadScrollSpeed = cachedScrollSpeed
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
    applySlot(slot, pad, dt, gameplay, now)
  }
  if (!playerOne) placeCursor(false)
  else if (cursorVisible) placeCursor(true)
  paintIndicators()
  paintRemoteIndicator()
  if (isGamepadMenuOpen()) syncGamepadMenu(gamepadMonitor)
}

export function initGamepadSupport() {
  if (started || typeof window === 'undefined') return
  started = true
  cachedScrollSpeed = getGamepadScrollSpeed(getGamepadStore())
  gameState.gamepadScrollSpeed = cachedScrollSpeed
  window.addEventListener('gamepadconnected', () => pollGamepads(performance.now()))
  window.addEventListener('gamepaddisconnected', () => pollGamepads(performance.now()))
  setGamepadBindingsListener(refreshGamepadBindingCache)
  setGamepadPoller(pollGamepads)
}

export function currentGamepadAssignments() {
  return assignments
}
