import {
  GAMEPAD_PROFILE_VERSION,
  GAMEPAD_STORAGE_KEY,
  defaultBindingsForSlot,
  sanitizeBindings
} from './gamepadBinding.js'

export function createGamepadProfileStore() {
  return { version: GAMEPAD_PROFILE_VERSION, assignments: [], libraries: {} }
}

function libraryFor(store, instanceKey) {
  if (!store.libraries || typeof store.libraries !== 'object') store.libraries = {}
  const existing = store.libraries[instanceKey]
  if (!existing || !Array.isArray(existing.profiles) || existing.profiles.length === 0) {
    store.libraries[instanceKey] = {
      activeProfileId: 'default',
      nextId: 1,
      profiles: [{ id: 'default', name: 'Standard', builtin: true, bindings: null }]
    }
  }
  const library = store.libraries[instanceKey]
  if (!Number.isInteger(library.nextId)) library.nextId = library.profiles.length
  return library
}

export function loadGamepadProfileStore(storage) {
  if (!storage || typeof storage.getItem !== 'function') return createGamepadProfileStore()
  try {
    const raw = storage.getItem(GAMEPAD_STORAGE_KEY)
    if (!raw) return createGamepadProfileStore()
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== GAMEPAD_PROFILE_VERSION || typeof parsed.libraries !== 'object' || !parsed.libraries) {
      return createGamepadProfileStore()
    }
    if (!Array.isArray(parsed.assignments)) parsed.assignments = []
    return parsed
  } catch {
    return createGamepadProfileStore()
  }
}

export function saveGamepadProfileStore(storage, store) {
  if (!storage || typeof storage.setItem !== 'function') return false
  try {
    storage.setItem(GAMEPAD_STORAGE_KEY, JSON.stringify(store))
    return true
  } catch {
    return false
  }
}

export function listGamepadProfiles(store, instanceKey) {
  const library = libraryFor(store, instanceKey)
  return library.profiles.map(profile => ({
    id: profile.id,
    name: profile.name,
    builtin: Boolean(profile.builtin)
  }))
}

export function getActiveProfileId(store, instanceKey) {
  return libraryFor(store, instanceKey).activeProfileId || 'default'
}

export function getActiveBindings(store, instanceKey, slot) {
  const library = libraryFor(store, instanceKey)
  const profile = library.profiles.find(item => item.id === library.activeProfileId) || library.profiles[0]
  if (!profile || !profile.bindings) return defaultBindingsForSlot(slot)
  return profile.bindings
}

export function rememberGamepadAssignments(store, slots) {
  const assignments = []
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    if (!slot || !slot.id || !slot.instanceKey) continue
    assignments.push({
      slot: slot.slot,
      id: slot.id,
      index: slot.index,
      instanceKey: slot.instanceKey
    })
  }
  store.assignments = assignments
  return store
}

export function setActiveGamepadProfile(store, instanceKey, profileId) {
  const library = libraryFor(store, instanceKey)
  const profile = library.profiles.find(item => item.id === profileId)
  if (!profile) return false
  library.activeProfileId = profile.id
  return true
}

export function saveActiveGamepadProfile(store, instanceKey, slot, bindings) {
  const library = libraryFor(store, instanceKey)
  const profile = library.profiles.find(item => item.id === library.activeProfileId)
  if (!profile) return null
  profile.bindings = sanitizeBindings(bindings, slot)
  return profile
}

export function createGamepadProfile(store, instanceKey, slot, name, bindings) {
  const library = libraryFor(store, instanceKey)
  const trimmed = String(name || '').trim()
  if (!trimmed) return null
  const id = `p${library.nextId}`
  library.nextId += 1
  const profile = {
    id,
    name: trimmed,
    builtin: false,
    bindings: sanitizeBindings(bindings, slot)
  }
  library.profiles.push(profile)
  library.activeProfileId = id
  return profile
}

export function renameGamepadProfile(store, instanceKey, profileId, name) {
  const library = libraryFor(store, instanceKey)
  const profile = library.profiles.find(item => item.id === profileId)
  const trimmed = String(name || '').trim()
  if (!profile || !trimmed) return false
  profile.name = trimmed
  return true
}

export function deleteGamepadProfile(store, instanceKey, profileId) {
  const library = libraryFor(store, instanceKey)
  const profile = library.profiles.find(item => item.id === profileId)
  if (!profile || profile.builtin) return false
  library.profiles = library.profiles.filter(item => item.id !== profileId)
  if (library.activeProfileId === profileId) library.activeProfileId = 'default'
  return true
}

export function resetGamepadProfile(store, instanceKey, profileId) {
  const library = libraryFor(store, instanceKey)
  const profile = library.profiles.find(item => item.id === profileId)
  if (!profile) return false
  profile.bindings = null
  return true
}

export function knownGamepadInstanceKeys(store) {
  return Object.keys(store.libraries || {})
}
