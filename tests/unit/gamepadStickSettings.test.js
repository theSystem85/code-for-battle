import { describe, expect, it } from 'vitest'
import { STICK_DEADZONE } from '../../src/input/gamepad/deadzone.js'
import {
  createGamepadProfileStore,
  createPlayerProfile,
  dismissControllerSuggestion,
  getControllerSuggestion,
  getHapticSettings,
  resetPlayerProfile,
  resolveDeadzones,
  setDeviceDeadzones,
  setHapticSettings,
  setPlayerDeadzones,
  setSlotPlayerProfile,
  suggestControllerLayout
} from '../../src/input/gamepad/gamepadProfiles.js'

const XBOX = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)'

describe('stick deadzones', () => {
  it('uses the player profile, then the controller profile, then 0.18', () => {
    const store = createGamepadProfileStore()
    expect(resolveDeadzones(store, { slot: 0, instanceKey: 'pad#0' })).toEqual({
      left: STICK_DEADZONE,
      right: STICK_DEADZONE
    })
    setDeviceDeadzones(store, 'pad#0', { left: 0.3, right: 0.22 })
    expect(resolveDeadzones(store, { slot: 0, instanceKey: 'pad#0' })).toEqual({ left: 0.3, right: 0.22 })
    setPlayerDeadzones(store, 0, { left: 0.05, right: 0.4 })
    expect(resolveDeadzones(store, { slot: 0, instanceKey: 'pad#0' })).toEqual({ left: 0.05, right: 0.4 })
    expect(resetPlayerProfile(store, 'default')).toBe(true)
    expect(resolveDeadzones(store, { slot: 0, instanceKey: 'pad#0' })).toEqual({ left: 0.3, right: 0.22 })
  })
})

describe('haptic settings', () => {
  it('defaults to on and stores a clamped intensity', () => {
    const store = createGamepadProfileStore()
    expect(getHapticSettings(store)).toEqual({ enabled: true, intensity: 0.65 })
    expect(setHapticSettings(store, { enabled: false, intensity: 1.4 })).toEqual({ enabled: false, intensity: 1 })
    expect(getHapticSettings(store).enabled).toBe(false)
  })
})

describe('controller layout suggestion', () => {
  it('suggests the detected type and leaves an explicit player profile in place', () => {
    const store = createGamepadProfileStore()
    const suggested = suggestControllerLayout(store, 0, XBOX)
    expect(suggested).toMatchObject({ applied: true, type: 'xbox' })
    expect(getControllerSuggestion(store, 0).type).toBe('xbox')
    expect(store.playerProfiles.slots[0]).toBe('default')

    expect(setSlotPlayerProfile(store, 0, 'default')).toBe(true)
    expect(store.playerProfiles.explicit[0]).toBe(true)
    const blocked = suggestControllerLayout(store, 0, XBOX)
    expect(blocked).toEqual({ applied: false, reason: 'explicit' })
    expect(store.playerProfiles.slots[0]).toBe('default')
    expect(getControllerSuggestion(store, 0)).toBeNull()
  })

  it('does not repeat a dismissed suggestion for the same type', () => {
    const store = createGamepadProfileStore()
    suggestControllerLayout(store, 1, 'Wireless Controller (STANDARD GAMEPAD)')
    expect(dismissControllerSuggestion(store, 1)).toBe(true)
    expect(getControllerSuggestion(store, 1)).toBeNull()
    const again = suggestControllerLayout(store, 1, 'DualSense Wireless Controller')
    expect(again).toEqual({ applied: false, reason: 'dismissed' })
    expect(store.playerProfiles.slots[1]).toBe('default')
    expect(store.playerProfiles.explicit[1]).toBe(false)

    const generic = suggestControllerLayout(store, 1, 'Generic USB Joystick')
    expect(generic.applied).toBe(true)
    expect(generic.type).toBe('generic')
  })

  it('marks a newly created player profile as an explicit choice', () => {
    const store = createGamepadProfileStore()
    const created = createPlayerProfile(store, 'Alex', 0, null)
    expect(created.id).toBe('player1')
    expect(store.playerProfiles.explicit[0]).toBe(true)
    expect(suggestControllerLayout(store, 0, XBOX).reason).toBe('explicit')
    expect(store.playerProfiles.slots[0]).toBe('player1')
  })
})
