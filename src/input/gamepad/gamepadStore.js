import { loadGamepadProfileStore, saveGamepadProfileStore } from './gamepadProfiles.js'

let store = null

function storage() {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

export function getGamepadStore() {
  if (!store) store = loadGamepadProfileStore(storage())
  return store
}

export function persistGamepadStore() {
  saveGamepadProfileStore(storage(), getGamepadStore())
}

export function replaceGamepadStore(next) {
  store = next
  persistGamepadStore()
  return store
}
