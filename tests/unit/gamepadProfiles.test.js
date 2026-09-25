import { describe, expect, it } from 'vitest'
import {
  createGamepadProfile,
  deleteGamepadProfile,
  getActiveBindings,
  listGamepadProfiles,
  loadGamepadProfileStore,
  renameGamepadProfile,
  resetGamepadProfile,
  saveActiveGamepadProfile,
  saveGamepadProfileStore,
  setActiveGamepadProfile
} from '../../src/input/gamepad/gamepadProfiles.js'
import { GAMEPAD_STORAGE_KEY } from '../../src/input/gamepad/gamepadBinding.js'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    },
    dump: () => data
  }
}

describe('gamepad profiles', () => {
  it('round-trips save, load, rename, and delete, and refuses to delete the builtin profile', () => {
    const storage = memoryStorage()
    const store = loadGamepadProfileStore(storage)
    const created = createGamepadProfile(store, 'pad#0', 0, 'Tank', { fire: { type: 'button', index: 7 } })
    expect(created.id).toBe('p1')
    expect(saveGamepadProfileStore(storage, store)).toBe(true)

    const loaded = loadGamepadProfileStore(storage)
    expect(listGamepadProfiles(loaded, 'pad#0').map(profile => profile.name)).toEqual(['Standard', 'Tank'])
    expect(renameGamepadProfile(loaded, 'pad#0', 'p1', 'Artillery')).toBe(true)
    expect(setActiveGamepadProfile(loaded, 'pad#0', 'p1')).toBe(true)
    expect(getActiveBindings(loaded, 'pad#0', 0).fire).toEqual({ type: 'button', index: 7 })
    expect(deleteGamepadProfile(loaded, 'pad#0', 'default')).toBe(false)
    expect(deleteGamepadProfile(loaded, 'pad#0', 'p1')).toBe(true)
    expect(listGamepadProfiles(loaded, 'pad#0')).toEqual([{ id: 'default', name: 'Standard', builtin: true }])
  })

  it('treats null bindings as the defaults for the current slot and isolates libraries', () => {
    const store = loadGamepadProfileStore(memoryStorage())
    expect(getActiveBindings(store, 'a#0', 0).cursorX).toEqual({ type: 'axis', index: 0 })
    expect(getActiveBindings(store, 'b#0', 1).remoteMoveX).toEqual({ type: 'axis', index: 0 })
    expect(getActiveBindings(store, 'b#0', 1).cursorX).toBeUndefined()
    resetGamepadProfile(store, 'a#0', 'default')
    expect(getActiveBindings(store, 'a#0', 1).claimUnit).toEqual({ type: 'button', index: 11 })
  })

  it('saves sanitized bindings onto the active profile', () => {
    const store = loadGamepadProfileStore(memoryStorage())
    saveActiveGamepadProfile(store, 'pad#0', 0, { leftClick: { type: 'button', index: 4 }, nope: { type: 'button', index: 1 } })
    expect(getActiveBindings(store, 'pad#0', 0).leftClick).toEqual({ type: 'button', index: 4 })
    expect(getActiveBindings(store, 'pad#0', 0).nope).toBeUndefined()
  })

  it('returns an empty store for corrupt JSON', () => {
    const storage = memoryStorage({ [GAMEPAD_STORAGE_KEY]: '{not json' })
    const store = loadGamepadProfileStore(storage)
    expect(store.version).toBe(2)
    expect(store.libraries).toEqual({})
    expect(storage.dump()[GAMEPAD_STORAGE_KEY]).toBe('{not json')
  })
})
