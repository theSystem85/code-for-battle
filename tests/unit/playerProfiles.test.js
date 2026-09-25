import { describe, expect, it } from 'vitest'
import { GAMEPAD_PROFILE_VERSION_V1, GAMEPAD_STORAGE_KEY, controllerTypeFromId } from '../../src/input/gamepad/gamepadBinding.js'
import {
  createControllerTypeProfile,
  createGamepadProfile,
  createPlayerProfile,
  deletePlayerProfile,
  getSlotPlayerProfileId,
  loadGamepadProfileStore,
  placeGamepadBinding,
  renamePlayerProfile,
  resolveGamepadBindings,
  saveGamepadProfileStore,
  setSlotPlayerProfile
} from '../../src/input/gamepad/gamepadProfiles.js'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    }
  }
}

describe('player profiles', () => {
  it('creates, renames, deletes, and assigns a profile to each slot', () => {
    const storage = memoryStorage()
    const store = loadGamepadProfileStore(storage)
    const alex = createPlayerProfile(store, 'Alex', 0, null)
    const sam = createPlayerProfile(store, 'Sam', 1, null)
    expect(alex.id).toBe('player1')
    expect(sam.id).toBe('player2')
    expect(getSlotPlayerProfileId(store, 0)).toBe('player1')
    expect(getSlotPlayerProfileId(store, 1)).toBe('player2')
    expect(renamePlayerProfile(store, 'player1', 'Alexis')).toBe(true)
    expect(deletePlayerProfile(store, 'default')).toBe(false)
    expect(saveGamepadProfileStore(storage, store)).toBe(true)

    const loaded = loadGamepadProfileStore(storage)
    expect(loaded.playerProfiles.profiles.map(profile => profile.name)).toEqual(['Standard', 'Alexis', 'Sam'])
    expect(deletePlayerProfile(loaded, 'player1')).toBe(true)
    expect(getSlotPlayerProfileId(loaded, 0)).toBe('default')
    expect(getSlotPlayerProfileId(loaded, 1)).toBe('player2')
    expect(setSlotPlayerProfile(loaded, 0, 'player2')).toBe(true)
    expect(getSlotPlayerProfileId(loaded, 0)).toBe('player2')
  })

  it('resolves player, then controller type, then the device profile, then defaults', () => {
    const store = loadGamepadProfileStore(memoryStorage())
    createPlayerProfile(store, 'Alex', 0, { fire: { type: 'button', index: 1 } })
    createControllerTypeProfile(store, 'xbox', 'Paddles', { fire: { type: 'button', index: 7 }, jumpToLastEvent: { type: 'button', index: 17 } })
    createGamepadProfile(store, 'Xbox#0', 0, 'Device', { fire: { type: 'button', index: 5 }, toggleRepair: { type: 'button', index: 2 } })

    const first = resolveGamepadBindings(store, { slot: 0, instanceKey: 'Xbox#0', gamepadId: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)' })
    expect(first.bindings.fire).toEqual({ type: 'button', index: 1 })
    expect(first.sources.fire).toBe('player')
    expect(first.bindings.jumpToLastEvent).toEqual({ type: 'button', index: 17 })
    expect(first.sources.jumpToLastEvent).toBe('type')
    expect(first.sources.toggleRepair).toBe('device')
    expect(first.bindings.leftClick).toEqual({ type: 'button', index: 0 })
    expect(first.sources.leftClick).toBe('device')

    store.playerProfiles.profiles.find(profile => profile.id === 'player1').bindings = { fire: null }
    const unbound = resolveGamepadBindings(store, { slot: 0, instanceKey: 'Xbox#0', gamepadId: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)' })
    expect(unbound.bindings.fire).toBeNull()
    expect(unbound.sources.fire).toBe('player')
  })

  it('keeps two slots on different player profiles and classifies controller ids', () => {
    const store = loadGamepadProfileStore(memoryStorage())
    createPlayerProfile(store, 'Alex', 0, { fire: { type: 'button', index: 2 } })
    createPlayerProfile(store, 'Sam', 1, { fire: { type: 'button', index: 3 } })
    expect(resolveGamepadBindings(store, { slot: 0, gamepadId: 'Xbox' }).bindings.fire.index).toBe(2)
    expect(resolveGamepadBindings(store, { slot: 1, gamepadId: 'Wireless Controller (STANDARD GAMEPAD)' }).bindings.fire.index).toBe(3)
    expect(controllerTypeFromId('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox')
    expect(controllerTypeFromId('Wireless Controller (STANDARD GAMEPAD)')).toBe('playstation')
    expect(controllerTypeFromId('Generic USB Joystick')).toBe('generic')
  })

  it('writes a standard button to the player profile and a non-standard button to the controller type', () => {
    const store = loadGamepadProfileStore(memoryStorage())
    const standard = placeGamepadBinding(store, {
      slot: 0,
      gamepadId: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
      commandId: 'fire',
      input: { type: 'button', index: 0 }
    })
    expect(standard.layer).toBe('player')
    const extra = placeGamepadBinding(store, {
      slot: 0,
      gamepadId: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
      commandId: 'jumpToLastEvent',
      input: { type: 'button', index: 20 }
    })
    expect(extra.layer).toBe('type')
    const resolved = resolveGamepadBindings(store, { slot: 0, gamepadId: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)' })
    expect(resolved.sources.fire).toBe('player')
    expect(resolved.bindings.fire).toEqual({ type: 'button', index: 0 })
    expect(resolved.sources.jumpToLastEvent).toBe('type')
    expect(resolved.bindings.leftClick).toBeNull()
    expect(resolved.sources.leftClick).toBe('player')
  })

  it('keeps version 1 controller libraries when player profiles are added', () => {
    const raw = JSON.stringify({
      version: GAMEPAD_PROFILE_VERSION_V1,
      assignments: [],
      libraries: {
        'pad#0': {
          activeProfileId: 'default',
          nextId: 1,
          profiles: [{ id: 'default', name: 'Standard', builtin: true, bindings: { fire: { type: 'button', index: 4 } } }]
        }
      }
    })
    const store = loadGamepadProfileStore(memoryStorage({ [GAMEPAD_STORAGE_KEY]: raw }))
    expect(store.version).toBe(2)
    expect(store.libraries['pad#0'].profiles[0].bindings.fire).toEqual({ type: 'button', index: 4 })
    expect(store.playerProfiles.slots).toEqual(['default', 'default'])
  })
})
