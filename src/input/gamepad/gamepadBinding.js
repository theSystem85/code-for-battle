import { BIND_THRESHOLD, STICK_DEADZONE, TRIGGER_THRESHOLD, applyDeadzone } from './deadzone.js'

export const GAMEPAD_STORAGE_KEY = 'rts-gamepad-profiles'
export const GAMEPAD_PROFILE_VERSION = 1
export const MAX_GAMEPAD_SLOTS = 2

export const GAMEPAD_COMMANDS = Object.freeze([
  { id: 'cursorX', kind: 'axis', group: 'pointer', slot: 0 },
  { id: 'cursorY', kind: 'axis', group: 'pointer', slot: 0 },
  { id: 'leftClick', kind: 'button', group: 'pointer', slot: 0 },
  { id: 'rightClick', kind: 'button', group: 'pointer', slot: 0 },
  { id: 'mapScrollX', kind: 'axis', group: 'camera' },
  { id: 'mapScrollY', kind: 'axis', group: 'camera' },
  { id: 'jumpToLastEvent', kind: 'button', group: 'camera' },
  { id: 'remoteUp', kind: 'button', group: 'remote' },
  { id: 'remoteDown', kind: 'button', group: 'remote' },
  { id: 'remoteLeft', kind: 'button', group: 'remote' },
  { id: 'remoteRight', kind: 'button', group: 'remote' },
  { id: 'remoteMoveX', kind: 'axis', group: 'remote' },
  { id: 'remoteMoveY', kind: 'axis', group: 'remote' },
  { id: 'turretLeft', kind: 'button', group: 'remote' },
  { id: 'turretRight', kind: 'button', group: 'remote' },
  { id: 'fire', kind: 'button', group: 'remote' },
  { id: 'toggleRepair', kind: 'button', group: 'modes' },
  { id: 'toggleSell', kind: 'button', group: 'modes' },
  { id: 'claimUnit', kind: 'button', group: 'remote', slot: 1 }
])

const P1_DEFAULTS = Object.freeze({
  cursorX: Object.freeze({ type: 'axis', index: 0 }),
  cursorY: Object.freeze({ type: 'axis', index: 1 }),
  mapScrollX: Object.freeze({ type: 'axis', index: 2 }),
  mapScrollY: Object.freeze({ type: 'axis', index: 3 }),
  leftClick: Object.freeze({ type: 'button', index: 0 }),
  rightClick: Object.freeze({ type: 'button', index: 1 }),
  toggleRepair: Object.freeze({ type: 'button', index: 2 }),
  jumpToLastEvent: Object.freeze({ type: 'button', index: 3 }),
  turretLeft: Object.freeze({ type: 'button', index: 4 }),
  turretRight: Object.freeze({ type: 'button', index: 5 }),
  fire: Object.freeze({ type: 'button', index: 7 }),
  toggleSell: Object.freeze({ type: 'button', index: 8 }),
  remoteUp: Object.freeze({ type: 'button', index: 12 }),
  remoteDown: Object.freeze({ type: 'button', index: 13 }),
  remoteLeft: Object.freeze({ type: 'button', index: 14 }),
  remoteRight: Object.freeze({ type: 'button', index: 15 })
})

const P2_DEFAULTS = Object.freeze({
  remoteMoveX: Object.freeze({ type: 'axis', index: 0 }),
  remoteMoveY: Object.freeze({ type: 'axis', index: 1 }),
  mapScrollX: Object.freeze({ type: 'axis', index: 2 }),
  mapScrollY: Object.freeze({ type: 'axis', index: 3 }),
  toggleRepair: Object.freeze({ type: 'button', index: 2 }),
  jumpToLastEvent: Object.freeze({ type: 'button', index: 3 }),
  turretLeft: Object.freeze({ type: 'button', index: 4 }),
  turretRight: Object.freeze({ type: 'button', index: 5 }),
  fire: Object.freeze({ type: 'button', index: 7 }),
  toggleSell: Object.freeze({ type: 'button', index: 8 }),
  claimUnit: Object.freeze({ type: 'button', index: 11 }),
  remoteUp: Object.freeze({ type: 'button', index: 12 }),
  remoteDown: Object.freeze({ type: 'button', index: 13 }),
  remoteLeft: Object.freeze({ type: 'button', index: 14 }),
  remoteRight: Object.freeze({ type: 'button', index: 15 })
})

const COMMAND_BY_ID = new Map(GAMEPAD_COMMANDS.map(command => [command.id, command]))

export function commandById(commandId) {
  return COMMAND_BY_ID.get(commandId) || null
}

export function defaultBindingsForSlot(slot) {
  return slot === 1 ? P2_DEFAULTS : P1_DEFAULTS
}

export function emptyBindingMap(slot) {
  const defaults = defaultBindingsForSlot(slot)
  const map = {}
  GAMEPAD_COMMANDS.forEach(command => {
    if (command.slot !== undefined && command.slot !== slot) return
    map[command.id] = defaults[command.id] ? { ...defaults[command.id] } : null
  })
  return map
}

export function inputKey(input) {
  if (!input || (input.type !== 'button' && input.type !== 'axis')) return ''
  if (!Number.isInteger(input.index) || input.index < 0) return ''
  if (input.type === 'button') return `b:${input.index}`
  if (input.sign === 1 || input.sign === -1) return `a:${input.index}:${input.sign}`
  return `a:${input.index}`
}

export function inputsConflict(left, right) {
  if (!left || !right || left.type !== right.type) return false
  if (!Number.isInteger(left.index) || left.index !== right.index) return false
  if (left.type === 'button') return true
  const leftSigned = left.sign === 1 || left.sign === -1
  const rightSigned = right.sign === 1 || right.sign === -1
  if (!leftSigned || !rightSigned) return true
  return left.sign === right.sign
}

export function findBindingConflict(bindings, commandId, input) {
  if (!bindings || !input) return null
  const ids = Object.keys(bindings)
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    if (id === commandId) continue
    if (inputsConflict(bindings[id], input)) return id
  }
  return null
}

export function assignBinding(bindings, commandId, input) {
  const next = { ...bindings }
  const conflict = findBindingConflict(next, commandId, input)
  if (conflict) next[conflict] = null
  next[commandId] = input ? { type: input.type, index: input.index } : null
  if (input && (input.sign === 1 || input.sign === -1)) next[commandId].sign = input.sign
  return { bindings: next, conflict }
}

export function sanitizeInput(input) {
  if (!input || (input.type !== 'button' && input.type !== 'axis')) return null
  if (!Number.isInteger(input.index) || input.index < 0 || input.index > 31) return null
  const clean = { type: input.type, index: input.index }
  if (input.type === 'axis' && (input.sign === 1 || input.sign === -1)) clean.sign = input.sign
  return clean
}

export function sanitizeBindings(bindings, slot) {
  const map = emptyBindingMap(slot)
  if (!bindings || typeof bindings !== 'object') return map
  Object.keys(map).forEach(commandId => {
    if (!Object.prototype.hasOwnProperty.call(bindings, commandId)) return
    map[commandId] = sanitizeInput(bindings[commandId])
  })
  return map
}

export function readBinding(binding, buttons, axes, deadzone = STICK_DEADZONE, triggerThreshold = TRIGGER_THRESHOLD) {
  if (!binding) return 0
  if (binding.type === 'button') {
    const value = Number(buttons && buttons[binding.index]) || 0
    if (value < triggerThreshold) return 0
    return value > 1 ? 1 : value
  }
  const raw = applyDeadzone(axes && axes[binding.index], deadzone)
  if (binding.sign === 1) return raw > 0 ? raw : 0
  if (binding.sign === -1) return raw < 0 ? -raw : 0
  return raw
}

export function detectBindingCandidate(previousButtons, previousAxes, buttons, axes, commandKind, bindThreshold = BIND_THRESHOLD) {
  let best = null
  let bestMagnitude = 0
  const buttonCount = buttons ? buttons.length : 0
  for (let i = 0; i < buttonCount; i++) {
    const value = Number(buttons[i]) || 0
    const previous = Number(previousButtons && previousButtons[i]) || 0
    if (value < bindThreshold || previous >= bindThreshold) continue
    if (value > bestMagnitude) {
      bestMagnitude = value
      best = { type: 'button', index: i }
    }
  }
  const axisCount = axes ? axes.length : 0
  for (let i = 0; i < axisCount; i++) {
    const value = Number(axes[i]) || 0
    const previous = Number(previousAxes && previousAxes[i]) || 0
    const magnitude = Math.abs(value)
    if (magnitude < bindThreshold || Math.abs(previous) >= bindThreshold) continue
    if (magnitude <= bestMagnitude) continue
    bestMagnitude = magnitude
    best = commandKind === 'axis'
      ? { type: 'axis', index: i }
      : { type: 'axis', index: i, sign: value < 0 ? -1 : 1 }
  }
  return best
}
