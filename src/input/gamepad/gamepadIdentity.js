import { MAX_GAMEPAD_SLOTS } from './gamepadBinding.js'

export function allocateInstanceKey(id, knownKeys, usedKeys) {
  const prefix = `${id}#`
  const known = []
  const keys = knownKeys || []
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (typeof key === 'string' && key.startsWith(prefix) && !usedKeys.has(key)) known.push(key)
  }
  if (known.length) {
    known.sort()
    return known[0]
  }
  let ordinal = 0
  let key = `${id}#${ordinal}`
  while (usedKeys.has(key)) {
    ordinal += 1
    key = `${id}#${ordinal}`
  }
  return key
}

function copyAssignment(assignment, connected) {
  return {
    slot: assignment.slot,
    id: assignment.id,
    index: assignment.index,
    instanceKey: assignment.instanceKey,
    connected
  }
}

function claim(slots, used, pad, slotIndex, instanceKey) {
  slots[slotIndex] = {
    slot: slotIndex,
    id: pad.id,
    index: pad.index,
    instanceKey,
    connected: true
  }
  used.add(pad)
}

export function reconcileGamepadSlots(previousAssignments, gamepads, knownInstanceKeys = []) {
  const pads = []
  const seenIndexes = new Set()
  const list = gamepads || []
  for (let i = 0; i < list.length; i++) {
    const pad = list[i]
    if (!pad || pad.connected === false || !pad.id || !Number.isInteger(pad.index)) continue
    if (seenIndexes.has(pad.index)) continue
    seenIndexes.add(pad.index)
    pads.push(pad)
  }
  pads.sort((left, right) => left.index - right.index)

  const slots = new Array(MAX_GAMEPAD_SLOTS).fill(null)
  const previous = previousAssignments || []
  for (let i = 0; i < previous.length; i++) {
    const assignment = previous[i]
    if (!assignment || !assignment.id || !assignment.instanceKey) continue
    if (assignment.slot !== 0 && assignment.slot !== 1) continue
    if (!slots[assignment.slot]) slots[assignment.slot] = copyAssignment(assignment, false)
  }

  const used = new Set()

  for (let p = 0; p < pads.length; p++) {
    const pad = pads[p]
    for (let s = 0; s < MAX_GAMEPAD_SLOTS; s++) {
      const slot = slots[s]
      if (!slot || slot.connected || slot.id !== pad.id || slot.index !== pad.index) continue
      claim(slots, used, pad, s, slot.instanceKey)
      break
    }
  }

  for (let p = 0; p < pads.length; p++) {
    const pad = pads[p]
    if (used.has(pad)) continue
    for (let s = 0; s < MAX_GAMEPAD_SLOTS; s++) {
      const slot = slots[s]
      if (!slot || slot.connected || slot.id !== pad.id) continue
      claim(slots, used, pad, s, slot.instanceKey)
      break
    }
  }

  for (let p = 0; p < pads.length; p++) {
    const pad = pads[p]
    if (used.has(pad)) continue
    let dest = -1
    for (let s = 0; s < MAX_GAMEPAD_SLOTS; s++) {
      if (!slots[s] || !slots[s].connected) {
        dest = s
        break
      }
    }
    if (dest < 0) continue
    const usedKeys = new Set()
    for (let s = 0; s < MAX_GAMEPAD_SLOTS; s++) {
      if (slots[s] && slots[s].connected && slots[s].instanceKey) usedKeys.add(slots[s].instanceKey)
    }
    claim(slots, used, pad, dest, allocateInstanceKey(pad.id, knownInstanceKeys, usedKeys))
  }

  let ignored = 0
  for (let p = 0; p < pads.length; p++) {
    if (!used.has(pads[p])) ignored += 1
  }
  return { slots, ignored }
}
