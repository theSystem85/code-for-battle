import { uiText } from './uiText.js'
import { assignBinding, commandById, defaultBindingsForSlot, detectBindingCandidate, emptyBindingMap, findBindingConflict, GAMEPAD_COMMANDS } from '../input/gamepad/gamepadBinding.js'
import {
  createGamepadProfile,
  deleteGamepadProfile,
  getActiveBindings,
  getActiveProfileId,
  listGamepadProfiles,
  renameGamepadProfile,
  resetGamepadProfile,
  saveActiveGamepadProfile,
  setActiveGamepadProfile
} from '../input/gamepad/gamepadProfiles.js'
import { gamepadMonitor, requestGamepadPoll } from '../input/gamepad/gamepadMonitor.js'
import { getGamepadStore, persistGamepadStore } from '../input/gamepad/gamepadStore.js'

let panel = null
let activeSlot = 0
let capture = null
let pendingInput = null
let bindingsListener = null
let escapeHandler = null
let menuFrame = 0

const STANDARD_BUTTON_KEYS = [
  'button0', 'button1', 'button2', 'button3', 'button4', 'button5', 'button6', 'button7',
  'button8', 'button9', 'button10', 'button11', 'button12', 'button13', 'button14', 'button15', 'button16'
]
const STANDARD_AXIS_KEYS = ['axis0', 'axis1', 'axis2', 'axis3']

function text(key, fallback) {
  return uiText(key) || fallback
}

function slotIdentity(slot) {
  const monitor = gamepadMonitor.slots[slot]
  if (monitor && monitor.instanceKey) return monitor.instanceKey
  const saved = (getGamepadStore().assignments || []).find(item => item && item.slot === slot)
  return saved ? saved.instanceKey : ''
}

function notifyBindings() {
  if (bindingsListener) bindingsListener()
}

export function setGamepadBindingsListener(listener) {
  bindingsListener = listener
}

export function isGamepadMenuOpen() {
  return Boolean(panel && !panel.hidden && panel.isConnected)
}

export function getGamepadCapture() {
  return capture
}

function inputLabel(input, standard) {
  if (!input) return text('settings.gamepad.unbound', 'Unbound')
  if (input.type === 'button') {
    const key = STANDARD_BUTTON_KEYS[input.index]
    if (standard && key) return text(`settings.gamepad.inputs.${key}`, `Button ${input.index}`)
    return `${text('settings.gamepad.button', 'Button')} ${input.index}`
  }
  const axisKey = STANDARD_AXIS_KEYS[input.index]
  const axisName = standard && axisKey
    ? text(`settings.gamepad.inputs.${axisKey}`, `Axis ${input.index}`)
    : `${text('settings.gamepad.axis', 'Axis')} ${input.index}`
  if (input.sign === 1) return `${axisName} +`
  if (input.sign === -1) return `${axisName} −`
  return axisName
}

function mutableBindings(slot) {
  const identity = slotIdentity(slot)
  if (!identity) return null
  const store = getGamepadStore()
  const current = getActiveBindings(store, identity, slot)
  if (current === defaultBindingsForSlot(slot)) {
    const copy = emptyBindingMap(slot)
    saveActiveGamepadProfile(store, identity, slot, copy)
    persistGamepadStore()
    notifyBindings()
    return getActiveBindings(store, identity, slot)
  }
  return current
}

function stopCapture() {
  capture = null
  pendingInput = null
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler, true)
    escapeHandler = null
  }
  if (!panel) return
  panel.querySelectorAll('.gamepad-command').forEach(row => {
    row.classList.remove('gamepad-command--listen')
  })
  const status = panel.querySelector('[data-gamepad-status]')
  if (status) status.textContent = ''
  const conflict = panel.querySelector('[data-gamepad-conflict]')
  if (conflict) conflict.hidden = true
}

function beginCapture(slot, commandId) {
  const command = commandById(commandId)
  if (!command || !slotIdentity(slot)) return
  stopCapture()
  capture = { slot, commandId, kind: command.kind }
  const row = panel && panel.querySelector(`[data-command="${commandId}"]`)
  if (row) row.classList.add('gamepad-command--listen')
  const status = panel && panel.querySelector('[data-gamepad-status]')
  if (status) status.textContent = text('settings.gamepad.listening', 'Press a button or move a stick. Escape cancels.')
  escapeHandler = event => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    stopCapture()
  }
  document.addEventListener('keydown', escapeHandler, true)
}

function applyBinding(slot, commandId, input) {
  const bindings = mutableBindings(slot)
  if (!bindings) return
  const assigned = assignBinding(bindings, commandId, input)
  const identity = slotIdentity(slot)
  saveActiveGamepadProfile(getGamepadStore(), identity, slot, assigned.bindings)
  persistGamepadStore()
  notifyBindings()
  stopCapture()
  renderGamepadMappingMenu(panel, slot)
}

function showConflict(commandId) {
  const conflict = panel && panel.querySelector('[data-gamepad-conflict]')
  if (!conflict || !pendingInput) return
  conflict.hidden = false
  const name = text(`settings.gamepad.commands.${commandId}`, commandId)
  const message = conflict.querySelector('[data-gamepad-conflict-text]')
  if (message) {
    message.textContent = text('settings.gamepad.conflict', 'Already used by') + ' ' + name
  }
}

export function offerCapturedInput(captureState, buttons, axes, previousButtons, previousAxes) {
  if (!capture || pendingInput || !captureState || capture.commandId !== captureState.commandId) return
  const command = commandById(capture.commandId)
  if (!command) return
  const input = detectBindingCandidate(previousButtons, previousAxes, buttons, axes, command.kind)
  if (!input) return
  const bindings = mutableBindings(capture.slot)
  if (!bindings) return
  const conflict = findBindingConflict(bindings, capture.commandId, input)
  if (!conflict) {
    applyBinding(capture.slot, capture.commandId, input)
    return
  }
  pendingInput = input
  showConflict(conflict)
}

function element(tag, className, textContent) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (textContent) node.textContent = textContent
  return node
}

function renderProfiles(host, slot) {
  const identity = slotIdentity(slot)
  host.replaceChildren()
  if (!identity) return
  const store = getGamepadStore()
  const profiles = listGamepadProfiles(store, identity)
  const activeId = getActiveProfileId(store, identity)
  const row = element('div', 'gamepad-profile-row')
  const select = document.createElement('select')
  select.className = 'config-modal__select'
  profiles.forEach(profile => {
    const option = document.createElement('option')
    option.value = profile.id
    option.textContent = profile.builtin ? text('settings.gamepad.standardProfile', 'Standard') : profile.name
    if (profile.id === activeId) option.selected = true
    select.append(option)
  })
  select.addEventListener('change', () => {
    setActiveGamepadProfile(store, identity, select.value)
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  const name = document.createElement('input')
  name.type = 'text'
  name.className = 'gamepad-profile-name'
  name.value = profiles.find(profile => profile.id === activeId)?.name || ''
  name.setAttribute('aria-label', text('settings.gamepad.profileName', 'Profile name'))
  const save = element('button', 'config-modal__button', text('settings.gamepad.save', 'Save'))
  save.type = 'button'
  save.addEventListener('click', () => {
    const bindings = mutableBindings(slot) || emptyBindingMap(slot)
    const trimmed = name.value.trim()
    const active = profiles.find(profile => profile.id === activeId)
    if (active && trimmed && trimmed !== active.name && !active.builtin) {
      renameGamepadProfile(store, identity, activeId, trimmed)
    }
    saveActiveGamepadProfile(store, identity, slot, bindings)
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  const saveAs = element('button', 'config-modal__button', text('settings.gamepad.saveAs', 'Save as new'))
  saveAs.type = 'button'
  saveAs.addEventListener('click', () => {
    const created = createGamepadProfile(store, identity, slot, name.value, mutableBindings(slot) || emptyBindingMap(slot))
    if (!created) return
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  const rename = element('button', 'config-modal__button', text('settings.gamepad.rename', 'Rename'))
  rename.type = 'button'
  rename.addEventListener('click', () => {
    if (!renameGamepadProfile(store, identity, activeId, name.value)) return
    persistGamepadStore()
    renderGamepadMappingMenu(panel, slot)
  })
  const remove = element('button', 'config-modal__button', text('settings.gamepad.delete', 'Delete'))
  remove.type = 'button'
  remove.addEventListener('click', () => {
    if (!deleteGamepadProfile(store, identity, activeId)) return
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  const reset = element('button', 'config-modal__button', text('settings.gamepad.reset', 'Reset to defaults'))
  reset.type = 'button'
  reset.addEventListener('click', () => {
    resetGamepadProfile(store, identity, activeId)
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  row.append(select, name, save, saveAs, rename, remove, reset)
  host.append(row)
}

function renderCommands(host, slot) {
  host.replaceChildren()
  const identity = slotIdentity(slot)
  const bindings = identity ? getActiveBindings(getGamepadStore(), identity, slot) : null
  const standard = gamepadMonitor.slots[slot] && gamepadMonitor.slots[slot].mapping === 'standard'
  GAMEPAD_COMMANDS.forEach(command => {
    if (command.slot !== undefined && command.slot !== slot) return
    const row = element('button', 'gamepad-command')
    row.type = 'button'
    row.dataset.command = command.id
    const label = element('span', 'gamepad-command__label', text(`settings.gamepad.commands.${command.id}`, command.id))
    const value = element('span', 'gamepad-command__binding', inputLabel(bindings && bindings[command.id], standard))
    row.append(label, value)
    row.addEventListener('click', () => beginCapture(slot, command.id))
    host.append(row)
  })
}

function renderInputs(host, slot) {
  host.replaceChildren()
  const monitor = gamepadMonitor.slots[slot]
  if (!monitor || !monitor.connected) {
    host.append(element('p', 'config-modal__hint', text('settings.gamepad.pressAny', 'Press any button on the controller. Browsers hide a gamepad until a button is pressed.')))
    return
  }
  if (monitor.mapping !== 'standard') {
    host.append(element('p', 'config-modal__hint', text('settings.gamepad.nonStandard', 'This browser did not report a standard mapping. Bind the raw buttons and axes listed here.')))
  }
  for (let i = 0; i < monitor.buttonCount; i++) {
    const row = element('div', 'gamepad-input')
    row.dataset.button = String(i)
    const name = element('span', null, inputLabel({ type: 'button', index: i }, monitor.mapping === 'standard'))
    const meter = element('span', 'gamepad-input__meter')
    row.append(name, meter)
    host.append(row)
  }
  for (let i = 0; i < monitor.axisCount; i++) {
    const row = element('div', 'gamepad-input')
    row.dataset.axis = String(i)
    const name = element('span', null, inputLabel({ type: 'axis', index: i }, monitor.mapping === 'standard'))
    const meter = element('span', 'gamepad-input__meter')
    row.append(name, meter)
    host.append(row)
  }
}

function renderSlotLights(host) {
  host.replaceChildren()
  for (let slot = 0; slot < 2; slot++) {
    const monitor = gamepadMonitor.slots[slot]
    const button = element('button', 'gamepad-slot')
    button.type = 'button'
    button.classList.toggle('gamepad-slot--active', slot === activeSlot)
    button.classList.toggle('gamepad-indicator--on', Boolean(monitor.connected))
    const light = element('i', 'gamepad-light')
    const label = element('span', null, slot === 0 ? 'P1' : 'P2')
    const name = element('span', 'gamepad-slot__name', monitor.connected ? monitor.id : text('settings.gamepad.disconnected', 'Not connected'))
    button.append(light, label, name)
    button.addEventListener('click', () => {
      activeSlot = slot
      stopCapture()
      renderGamepadMappingMenu(panel, slot)
    })
    host.append(button)
  }
}

export function renderGamepadMappingMenu(root, slot = activeSlot) {
  if (!root) return
  panel = root
  activeSlot = slot
  root.replaceChildren()
  root.append(element('p', 'config-modal__hint', text('settings.gamepad.intro', 'Each controller keeps its own profiles. Player 1 moves the cursor. Player 2 can drive a second unit of the same side.')))
  const lights = element('div', 'gamepad-slot-row')
  lights.dataset.gamepadLights = 'true'
  renderSlotLights(lights)
  root.append(lights)
  const ignored = element('p', 'config-modal__hint')
  ignored.dataset.gamepadIgnored = 'true'
  ignored.hidden = gamepadMonitor.ignored < 1
  ignored.textContent = text('settings.gamepad.ignored', 'Only two controllers can be used. Extra controllers are ignored.')
  root.append(ignored)
  const columns = element('div', 'gamepad-columns')
  const inputs = element('div', 'gamepad-column')
  inputs.append(element('h3', 'config-modal__section-title', text('settings.gamepad.liveInputs', 'Live inputs')))
  const inputList = element('div', 'gamepad-input-list')
  inputList.dataset.gamepadInputs = 'true'
  renderInputs(inputList, slot)
  inputs.append(inputList)
  const commands = element('div', 'gamepad-column')
  commands.append(element('h3', 'config-modal__section-title', text('settings.gamepad.commandsTitle', 'Commands')))
  const status = element('p', 'config-modal__hint')
  status.dataset.gamepadStatus = 'true'
  const conflict = element('div', 'gamepad-conflict')
  conflict.dataset.gamepadConflict = 'true'
  conflict.hidden = true
  conflict.append(element('p', null))
  conflict.querySelector('p').dataset.gamepadConflictText = 'true'
  const reassign = element('button', 'config-modal__button config-modal__button--primary', text('settings.gamepad.reassign', 'Reassign'))
  reassign.type = 'button'
  reassign.addEventListener('click', () => {
    if (!pendingInput || !capture) return
    applyBinding(capture.slot, capture.commandId, pendingInput)
  })
  const cancel = element('button', 'config-modal__button', text('settings.gamepad.cancel', 'Cancel'))
  cancel.type = 'button'
  cancel.addEventListener('click', stopCapture)
  conflict.append(reassign, cancel)
  const commandList = element('div', 'gamepad-command-list')
  commandList.dataset.gamepadCommands = 'true'
  renderCommands(commandList, slot)
  commands.append(status, conflict, commandList)
  columns.append(inputs, commands)
  root.append(columns)
  const profiles = element('div', 'gamepad-profiles')
  profiles.dataset.gamepadProfiles = 'true'
  renderProfiles(profiles, slot)
  root.append(profiles)
  if (!menuFrame) menuFrame = requestAnimationFrame(pumpMenu)
}

export function syncGamepadMenu(monitor) {
  if (!isGamepadMenuOpen() || !panel) return
  const ignored = panel.querySelector('[data-gamepad-ignored]')
  if (ignored) ignored.hidden = monitor.ignored < 1
  const slot = monitor.slots[activeSlot]
  if (!slot) return
  const lights = panel.querySelectorAll('.gamepad-slot')
  for (let i = 0; i < lights.length; i++) {
    const on = Boolean(monitor.slots[i] && monitor.slots[i].connected)
    lights[i].classList.toggle('gamepad-indicator--on', on)
  }
  const rows = panel.querySelectorAll('.gamepad-input')
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    let level = 0
    if (row.dataset.button !== undefined) {
      level = slot.buttons[Number(row.dataset.button)] || 0
    } else if (row.dataset.axis !== undefined) {
      level = Math.abs(slot.axes[Number(row.dataset.axis)] || 0)
    }
    const quant = (level * 20) | 0
    if (row._level === quant) continue
    row._level = quant
    row.classList.toggle('gamepad-input--active', quant > 3)
    const meter = row.querySelector('.gamepad-input__meter')
    if (meter) meter.style.transform = `scaleX(${Math.max(0.04, level)})`
  }
}

export function stopGamepadMenu() {
  stopCapture()
  if (menuFrame) {
    cancelAnimationFrame(menuFrame)
    menuFrame = 0
  }
  panel = null
}

function pumpMenu(now) {
  if (!isGamepadMenuOpen()) {
    menuFrame = 0
    return
  }
  requestGamepadPoll(now)
  menuFrame = requestAnimationFrame(pumpMenu)
}
