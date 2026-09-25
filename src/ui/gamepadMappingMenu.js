import { uiText } from './uiText.js'
import { applyDeadzone } from '../input/gamepad/deadzone.js'
import { commandById, controllerTypeFromId, defaultBindingsForSlot, detectBindingCandidate, emptyBindingMap, findBindingConflict, GAMEPAD_COMMANDS } from '../input/gamepad/gamepadBinding.js'
import { pulseGamepadIndex } from '../input/gamepad/gamepadHaptics.js'
import {
  createControllerTypeProfile,
  createGamepadProfile,
  createPlayerProfile,
  deleteControllerTypeProfile,
  deleteGamepadProfile,
  deletePlayerProfile,
  dismissControllerSuggestion,
  getActiveControllerTypeProfileId,
  getActiveBindings,
  getActiveProfileId,
  getControllerSuggestion,
  getHapticSettings,
  getPlayerProfileBindings,
  getSlotPlayerProfileId,
  listControllerTypeProfiles,
  listGamepadProfiles,
  listPlayerProfiles,
  placeGamepadBinding,
  renameControllerTypeProfile,
  renameGamepadProfile,
  renamePlayerProfile,
  resetControllerTypeProfile,
  resetGamepadProfile,
  resetPlayerProfile,
  resolveDeadzones,
  resolveGamepadBindings,
  saveActiveGamepadProfile,
  setActiveControllerTypeProfile,
  setActiveGamepadProfile,
  setHapticSettings,
  setPlayerDeadzones,
  setSlotPlayerProfile
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

function bindingContext(slot) {
  const monitor = gamepadMonitor.slots[slot]
  return {
    slot,
    instanceKey: slotIdentity(slot),
    gamepadId: (monitor && monitor.id) || ''
  }
}

function beginCapture(slot, commandId) {
  const command = commandById(commandId)
  if (!command) return
  pulseMenu()
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
  placeGamepadBinding(getGamepadStore(), { ...bindingContext(slot), commandId, input })
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
  const resolved = resolveGamepadBindings(getGamepadStore(), bindingContext(capture.slot))
  const conflict = findBindingConflict(resolved.bindings, capture.commandId, input)
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

function pulseMenu() {
  const monitor = gamepadMonitor.slots[activeSlot]
  const index = monitor && Number.isInteger(monitor.index) && monitor.index >= 0 ? monitor.index : activeSlot
  pulseGamepadIndex(index, 'menu')
}

function profileSelect(profiles, activeId, onChange) {
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
    pulseMenu()
    onChange()
  })
  return select
}

function deadzoneControl(slot, side, zones) {
  const field = element('label', 'config-modal__field gamepad-deadzone')
  field.append(element('span', null, text(side === 'left' ? 'settings.gamepad.deadzoneLeft' : 'settings.gamepad.deadzoneRight', side === 'left' ? 'Left stick deadzone' : 'Right stick deadzone')))
  const range = document.createElement('input')
  range.type = 'range'
  range.min = '0'
  range.max = '0.9'
  range.step = '0.01'
  range.value = String(zones[side])
  range.dataset.deadzone = side
  const readout = element('span', 'config-modal__range-value', Number(zones[side]).toFixed(2))
  const preview = element('span', 'gamepad-input__meter')
  preview.dataset.deadzonePreview = side
  range.addEventListener('input', () => {
    const store = getGamepadStore()
    const current = resolveDeadzones(store, { slot, instanceKey: slotIdentity(slot) })
    const next = { left: current.left, right: current.right, [side]: Number(range.value) }
    const saved = setPlayerDeadzones(store, slot, next)
    persistGamepadStore()
    notifyBindings()
    const shown = saved ? saved[side] : Number(range.value)
    readout.textContent = shown.toFixed(2)
    range.value = String(shown)
  })
  field.append(range, readout, preview)
  return field
}

function profileFields(select, name) {
  const row = element('div', 'gamepad-profile-fields')
  row.append(select, name)
  return row
}

function profileActions(buttons) {
  const row = element('div', 'gamepad-profile-actions')
  buttons.forEach(button => row.append(button))
  return row
}

function renderDeadzones(host, slot) {
  const zones = resolveDeadzones(getGamepadStore(), { slot, instanceKey: slotIdentity(slot) })
  const block = element('div', 'gamepad-deadzones')
  block.dataset.gamepadDeadzones = 'true'
  block.append(element('p', 'config-modal__hint', text('settings.gamepad.deadzoneHint', 'Motion inside the deadzone is ignored so a resting stick does not jitter.')))
  block.append(deadzoneControl(slot, 'left', zones), deadzoneControl(slot, 'right', zones))
  host.append(block)
}

function renderPlayerProfiles(host, slot) {
  const store = getGamepadStore()
  const block = element('div', 'gamepad-profile-block')
  block.append(element('h3', 'config-modal__section-title', text('settings.gamepad.playerTitle', 'Player profile')))
  block.append(element('p', 'config-modal__hint', text('settings.gamepad.playerHint', 'A player keeps this layout on any controller. Standard buttons and sticks are saved here.')))
  const profiles = listPlayerProfiles(store)
  const activeId = getSlotPlayerProfileId(store, slot)
  const name = document.createElement('input')
  name.type = 'text'
  name.className = 'gamepad-profile-name'
  name.value = profiles.find(profile => profile.id === activeId)?.name || ''
  name.setAttribute('aria-label', text('settings.gamepad.playerName', 'Player profile name'))
  const select = profileSelect(profiles, activeId, () => {
    setSlotPlayerProfile(store, slot, select.value)
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  const create = element('button', 'config-modal__button', text('settings.gamepad.saveAs', 'Save as new'))
  create.type = 'button'
  create.addEventListener('click', () => {
    const created = createPlayerProfile(store, name.value, slot, getPlayerProfileBindings(store, activeId))
    if (!created) return
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  const rename = element('button', 'config-modal__button', text('settings.gamepad.rename', 'Rename'))
  rename.type = 'button'
  rename.addEventListener('click', () => {
    if (!renamePlayerProfile(store, activeId, name.value)) return
    persistGamepadStore()
    renderGamepadMappingMenu(panel, slot)
  })
  const remove = element('button', 'config-modal__button', text('settings.gamepad.delete', 'Delete'))
  remove.type = 'button'
  remove.addEventListener('click', () => {
    if (!deletePlayerProfile(store, activeId)) return
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  const reset = element('button', 'config-modal__button', text('settings.gamepad.reset', 'Reset to defaults'))
  reset.type = 'button'
  reset.addEventListener('click', () => {
    resetPlayerProfile(store, activeId)
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  block.append(profileFields(select, name), profileActions([create, rename, remove, reset]))
  host.append(block)
}

function renderDefaultTable(host, slot) {
  const wrap = element('div', 'gamepad-defaults')
  wrap.append(element('h3', 'config-modal__section-title', text('settings.gamepad.defaultsTitle', 'Standard layout')))
  wrap.append(element('p', 'config-modal__hint', text('settings.gamepad.defaultsHint', 'Reset restores this layout. Hold the left trigger and the left stick drives the unit instead of the cursor. The right stick then turns the turret instead of dragging the map.')))
  const table = document.createElement('table')
  table.className = 'gamepad-defaults__table'
  const defaults = emptyBindingMap(slot)
  GAMEPAD_COMMANDS.forEach(command => {
    if (command.slot !== undefined && command.slot !== slot) return
    const row = document.createElement('tr')
    row.append(
      element('td', null, text(`settings.gamepad.commands.${command.id}`, command.id)),
      element('td', null, inputLabel(defaults[command.id], true))
    )
    table.append(row)
  })
  wrap.append(table)
  host.append(wrap)
}

function renderTypeProfiles(host, slot) {
  const store = getGamepadStore()
  const gamepadId = bindingContext(slot).gamepadId
  const type = controllerTypeFromId(gamepadId)
  const block = element('div', 'gamepad-profile-block')
  const typeName = text(`settings.gamepad.types.${type}`, type)
  block.append(element('h3', 'config-modal__section-title', text('settings.gamepad.typeTitle', 'Controller type') + ': ' + typeName))
  block.append(element('p', 'config-modal__hint', text('settings.gamepad.typeHint', 'Saved only for controls this controller type has no standard button or stick for.')))
  const profiles = listControllerTypeProfiles(store, type)
  const activeId = getActiveControllerTypeProfileId(store, type)
  const name = document.createElement('input')
  name.type = 'text'
  name.className = 'gamepad-profile-name'
  name.value = profiles.find(profile => profile.id === activeId)?.name || ''
  name.setAttribute('aria-label', text('settings.gamepad.typeName', 'Controller type profile name'))
  const select = profileSelect(profiles, activeId, () => {
    setActiveControllerTypeProfile(store, type, select.value)
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  const create = element('button', 'config-modal__button', text('settings.gamepad.saveAs', 'Save as new'))
  create.type = 'button'
  create.addEventListener('click', () => {
    if (!createControllerTypeProfile(store, type, name.value, null)) return
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  const rename = element('button', 'config-modal__button', text('settings.gamepad.rename', 'Rename'))
  rename.type = 'button'
  rename.addEventListener('click', () => {
    if (!renameControllerTypeProfile(store, type, activeId, name.value)) return
    persistGamepadStore()
    renderGamepadMappingMenu(panel, slot)
  })
  const remove = element('button', 'config-modal__button', text('settings.gamepad.delete', 'Delete'))
  remove.type = 'button'
  remove.addEventListener('click', () => {
    if (!deleteControllerTypeProfile(store, type, activeId)) return
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  const reset = element('button', 'config-modal__button', text('settings.gamepad.reset', 'Reset to defaults'))
  reset.type = 'button'
  reset.addEventListener('click', () => {
    resetControllerTypeProfile(store, type, activeId)
    persistGamepadStore()
    notifyBindings()
    renderGamepadMappingMenu(panel, slot)
  })
  block.append(profileFields(select, name), profileActions([create, rename, remove, reset]))
  host.append(block)
}

function renderProfiles(host, slot) {
  const identity = slotIdentity(slot)
  host.replaceChildren()
  renderPlayerProfiles(host, slot)
  renderTypeProfiles(host, slot)
  if (!identity) return
  const device = element('div', 'gamepad-profile-block')
  device.append(element('h3', 'config-modal__section-title', text('settings.gamepad.deviceTitle', 'This controller')))
  device.append(element('p', 'config-modal__hint', text('settings.gamepad.deviceHint', 'A layout stored on this controller. It is used when the player profile and the controller type leave a command unset.')))
  host.append(device)
  const store = getGamepadStore()
  const profiles = listGamepadProfiles(store, identity)
  const activeId = getActiveProfileId(store, identity)
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
    pulseMenu()
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
  device.append(profileFields(select, name), profileActions([save, saveAs, rename, remove, reset]))
}

function renderCommands(host, slot) {
  host.replaceChildren()
  const resolved = resolveGamepadBindings(getGamepadStore(), bindingContext(slot))
  const standard = !gamepadMonitor.slots[slot] || !gamepadMonitor.slots[slot].id || gamepadMonitor.slots[slot].mapping === 'standard'
  GAMEPAD_COMMANDS.forEach(command => {
    if (command.slot !== undefined && command.slot !== slot) return
    const row = element('button', 'gamepad-command')
    row.type = 'button'
    row.dataset.command = command.id
    const label = element('span', 'gamepad-command__label', text(`settings.gamepad.commands.${command.id}`, command.id))
    const sourceKey = resolved.sources[command.id] || 'default'
    const source = element('span', 'gamepad-command__source', text(`settings.gamepad.source.${sourceKey}`, sourceKey))
    const value = element('span', 'gamepad-command__binding', inputLabel(resolved.bindings[command.id], standard))
    row.append(label, source, value)
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
    const nameText = monitor.connected ? monitor.id : text('settings.gamepad.disconnected', 'Not connected')
    const name = element('span', 'gamepad-slot__name', nameText)
    if (monitor.connected) name.title = monitor.id
    button.append(light, label, name)
    button.addEventListener('click', () => {
      if (activeSlot !== slot) pulseMenu()
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
  const suggestion = element('div')
  suggestion.dataset.gamepadSuggestion = 'true'
  suggestion.hidden = true
  root.append(suggestion)
  const ignored = element('p', 'config-modal__hint')
  ignored.dataset.gamepadIgnored = 'true'
  ignored.hidden = gamepadMonitor.ignored < 1
  ignored.textContent = text('settings.gamepad.ignored', 'Only two controllers can be used. Extra controllers are ignored.')
  root.append(ignored)
  const profiles = element('div', 'gamepad-profiles')
  profiles.dataset.gamepadProfiles = 'true'
  renderProfiles(profiles, slot)
  root.append(profiles)
  root.append(renderHaptics())
  const columns = element('div', 'gamepad-columns')
  const inputs = element('div', 'gamepad-column gamepad-section')
  inputs.append(element('h3', 'config-modal__section-title', text('settings.gamepad.liveInputs', 'Live inputs')))
  const inputList = element('div', 'gamepad-input-list')
  inputList.dataset.gamepadInputs = 'true'
  renderInputs(inputList, slot)
  inputs.append(inputList)
  renderDeadzones(inputs, slot)
  const commands = element('div', 'gamepad-column gamepad-section')
  commands.append(element('h3', 'config-modal__section-title', text('settings.gamepad.commandsTitle', 'Commands')))
  commands.append(element('p', 'config-modal__hint', text('settings.gamepad.bindHint', 'A standard button or stick is saved on the player profile. A control with no standard equivalent is saved on the controller type.')))
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
  const conflictActions = element('div', 'gamepad-profile-actions')
  conflictActions.append(reassign, cancel)
  conflict.append(conflictActions)
  const commandList = element('div', 'gamepad-command-list')
  commandList.dataset.gamepadCommands = 'true'
  renderCommands(commandList, slot)
  commands.append(status, conflict, commandList)
  columns.append(inputs, commands)
  root.append(columns)
  renderDefaultTable(root, slot)
  syncSuggestion(slot)
  if (!menuFrame) menuFrame = requestAnimationFrame(pumpMenu)
}

function renderHaptics() {
  const store = getGamepadStore()
  const settings = getHapticSettings(store)
  const block = element('div', 'gamepad-profile-block')
  block.append(element('h3', 'config-modal__section-title', text('settings.gamepad.haptics', 'Vibration')))
  const row = element('div', 'gamepad-profile-row')
  const toggle = element('label', 'gamepad-deadzone')
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = settings.enabled !== false
  const intensity = document.createElement('input')
  intensity.type = 'range'
  intensity.min = '0'
  intensity.max = '1'
  intensity.step = '0.01'
  intensity.value = String(settings.intensity)
  intensity.dataset.hapticIntensity = 'true'
  intensity.setAttribute('aria-label', text('settings.gamepad.hapticsIntensity', 'Intensity'))
  const readout = element('span', 'config-modal__range-value', Number(settings.intensity).toFixed(2))
  checkbox.addEventListener('change', () => {
    setHapticSettings(store, { enabled: checkbox.checked, intensity: Number(intensity.value) })
    persistGamepadStore()
    if (checkbox.checked) pulseMenu()
  })
  intensity.addEventListener('input', () => {
    const saved = setHapticSettings(store, { intensity: Number(intensity.value) })
    persistGamepadStore()
    readout.textContent = Number(saved.intensity).toFixed(2)
  })
  toggle.append(checkbox, element('span', null, text('settings.gamepad.hapticsOn', 'Vibration on')))
  row.append(toggle, intensity, readout)
  block.append(row)
  return block
}

function syncSuggestion(slot) {
  const host = panel && panel.querySelector('[data-gamepad-suggestion]')
  if (!host) return
  const suggestion = getControllerSuggestion(getGamepadStore(), slot)
  const signature = suggestion ? `${suggestion.type}:${suggestion.profileId}` : ''
  if (host._signature === signature) return
  host._signature = signature
  host.replaceChildren()
  if (!suggestion) {
    host.hidden = true
    host.className = ''
    return
  }
  host.hidden = false
  host.className = 'gamepad-suggestion'
  const typeName = text(`settings.gamepad.types.${suggestion.type}`, suggestion.type)
  const body = text('settings.gamepad.suggestBody', 'This controller looks like {type}. The {type} layout is selected. Your player profile is unchanged.')
  host.append(element('p', null, body.split('{type}').join(typeName)))
  const dismiss = element('button', 'config-modal__button', text('settings.gamepad.dismiss', 'Dismiss'))
  dismiss.type = 'button'
  dismiss.addEventListener('click', () => {
    dismissControllerSuggestion(getGamepadStore(), slot)
    persistGamepadStore()
    pulseMenu()
    syncSuggestion(slot)
  })
  host.append(dismiss)
}

function menuSignature(slot) {
  if (!slot || !slot.connected) return 0
  return slot.buttonCount * 100 + slot.axisCount + (slot.mapping === 'standard' ? 1 : 2)
}

function refreshMenuConnection(slot) {
  const inputList = panel.querySelector('[data-gamepad-inputs]')
  if (!inputList) return
  const signature = menuSignature(slot)
  if (inputList._signature === signature) return
  inputList._signature = signature
  renderInputs(inputList, activeSlot)
  const lights = panel.querySelector('[data-gamepad-lights]')
  if (lights) renderSlotLights(lights)
  if (getGamepadCapture()) return
  const commands = panel.querySelector('[data-gamepad-commands]')
  if (commands) renderCommands(commands, activeSlot)
  const profiles = panel.querySelector('[data-gamepad-profiles]')
  if (profiles) renderProfiles(profiles, activeSlot)
}

export function syncGamepadMenu(monitor) {
  if (!isGamepadMenuOpen() || !panel) return
  const ignored = panel.querySelector('[data-gamepad-ignored]')
  if (ignored) ignored.hidden = monitor.ignored < 1
  const slot = monitor.slots[activeSlot]
  if (!slot) return
  refreshMenuConnection(slot)
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
  const previews = panel.querySelectorAll('[data-deadzone-preview]')
  for (let i = 0; i < previews.length; i++) {
    const preview = previews[i]
    const side = preview.dataset.deadzonePreview
    const slider = panel.querySelector(`[data-deadzone="${side}"]`)
    const zone = slider ? Number(slider.value) : 0
    const axisX = side === 'right' ? 2 : 0
    const magnitude = Math.hypot(
      applyDeadzone(slot.axes[axisX] || 0, zone),
      applyDeadzone(slot.axes[axisX + 1] || 0, zone)
    )
    const level = magnitude > 1 ? 1 : magnitude
    const quant = (level * 20) | 0
    if (preview._level === quant) continue
    preview._level = quant
    preview.style.transform = `scaleX(${Math.max(0.04, level)})`
  }
  syncSuggestion(activeSlot)
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
