import { describe, expect, it } from 'vitest'
import {
  assignBinding,
  detectBindingCandidate,
  emptyBindingMap,
  findBindingConflict,
  inputKey,
  inputsConflict,
  readBinding,
  sanitizeBindings
} from '../../src/input/gamepad/gamepadBinding.js'
import { allocateInstanceKey, reconcileGamepadSlots } from '../../src/input/gamepad/gamepadIdentity.js'

describe('gamepad binding', () => {
  it('ignores noise and binds a rising edge past the threshold', () => {
    const quiet = detectBindingCandidate([], [], [0.2], [0.2], 'button')
    expect(quiet).toBeNull()

    const pressed = detectBindingCandidate([0], [0], [0.7], [0], 'button')
    expect(pressed).toEqual({ type: 'button', index: 0 })

    const held = detectBindingCandidate([0.7], [0], [0.9], [0], 'button')
    expect(held).toBeNull()
  })

  it('binds a whole axis for an axis command and a signed axis for a button command', () => {
    expect(detectBindingCandidate([0], [0], [0], [0.8], 'axis')).toEqual({ type: 'axis', index: 0 })
    expect(detectBindingCandidate([0], [0], [0], [-0.8], 'button')).toEqual({
      type: 'axis',
      index: 0,
      sign: -1
    })
  })

  it('treats a whole axis as overlapping either signed half', () => {
    const whole = { type: 'axis', index: 0 }
    const positive = { type: 'axis', index: 0, sign: 1 }
    const negative = { type: 'axis', index: 0, sign: -1 }
    expect(inputsConflict(whole, positive)).toBe(true)
    expect(inputsConflict(whole, negative)).toBe(true)
    expect(inputsConflict(positive, negative)).toBe(false)
    expect(inputKey(whole)).toBe('a:0')
    expect(inputKey(negative)).toBe('a:0:-1')
  })

  it('steals the conflicting command when a binding is assigned', () => {
    const bindings = emptyBindingMap(0)
    expect(findBindingConflict(bindings, 'leftClick', bindings.leftClick)).toBeNull()
    const stolen = assignBinding(bindings, 'rightClick', { type: 'button', index: 0 })
    expect(stolen.conflict).toBe('leftClick')
    expect(stolen.bindings.leftClick).toBeNull()
    expect(stolen.bindings.rightClick).toEqual({ type: 'button', index: 0 })
  })

  it('reads buttons and signed axes through the play thresholds', () => {
    expect(readBinding({ type: 'button', index: 0 }, [0.2], [])).toBe(0)
    expect(readBinding({ type: 'button', index: 0 }, [0.5], [])).toBe(0.5)
    expect(readBinding({ type: 'axis', index: 0, sign: 1 }, [], [0.5])).toBeGreaterThan(0)
    expect(readBinding({ type: 'axis', index: 0, sign: -1 }, [], [0.5])).toBe(0)
    expect(readBinding({ type: 'axis', index: 0, sign: -1 }, [], [-0.5])).toBeGreaterThan(0)
  })

  it('drops illegal inputs while keeping the slot command set', () => {
    const clean = sanitizeBindings({ cursorX: { type: 'axis', index: 99 }, fire: { type: 'nope', index: 1 } }, 0)
    expect(clean.cursorX).toBeNull()
    expect(clean.fire).toBeNull()
    expect(clean.leftClick).toEqual({ type: 'button', index: 0 })
    expect(clean.claimUnit).toBeUndefined()
  })
})

describe('gamepad identity', () => {
  const xbox = (index) => ({ id: 'Xbox', index, connected: true })
  const ps = (index) => ({ id: 'PlayStation', index, connected: true })

  it('gives the first two pads separate slots and ignores a third', () => {
    const first = reconcileGamepadSlots([], [xbox(0)])
    expect(first.slots[0].instanceKey).toBe('Xbox#0')
    const second = reconcileGamepadSlots(first.slots, [xbox(0), ps(1)])
    expect(second.slots[1].id).toBe('PlayStation')
    expect(second.slots[1].instanceKey).toBe('PlayStation#0')
    const third = reconcileGamepadSlots(second.slots, [xbox(0), ps(1), { id: 'Generic', index: 2, connected: true }])
    expect(third.ignored).toBe(1)
    expect(third.slots[0].id).toBe('Xbox')
    expect(third.slots[1].id).toBe('PlayStation')
  })

  it('keeps the slot and instance key when a pad returns at a new index', () => {
    const paired = reconcileGamepadSlots([], [xbox(0), ps(1)])
    const psKey = paired.slots[1].instanceKey
    const returned = reconcileGamepadSlots(paired.slots, [xbox(0), ps(3)])
    expect(returned.slots[1].index).toBe(3)
    expect(returned.slots[1].instanceKey).toBe(psKey)
    expect(returned.slots[1].connected).toBe(true)
  })

  it('distinguishes two pads that share an id', () => {
    const one = reconcileGamepadSlots([], [xbox(0)])
    const two = reconcileGamepadSlots(one.slots, [xbox(0), xbox(1)])
    expect(two.slots[0].instanceKey).toBe('Xbox#0')
    expect(two.slots[1].instanceKey).toBe('Xbox#1')
    expect(allocateInstanceKey('Xbox', ['Xbox#0', 'Xbox#1'], new Set(['Xbox#0']))).toBe('Xbox#1')
  })

  it('replaces a disconnected slot with a new id and leaves the old key out of that slot', () => {
    const paired = reconcileGamepadSlots([], [xbox(0), ps(1)])
    const oldKey = paired.slots[1].instanceKey
    const replaced = reconcileGamepadSlots(paired.slots, [xbox(0), { id: 'Generic', index: 2, connected: true }], [oldKey])
    expect(replaced.slots[1].id).toBe('Generic')
    expect(replaced.slots[1].instanceKey).toBe('Generic#0')
    expect(replaced.slots[1].instanceKey).not.toBe(oldKey)
  })
})
