import {
  GAMEPAD_PROFILE_VERSION,
  GAMEPAD_PROFILE_VERSION_V1,
  GAMEPAD_STORAGE_KEY,
  assignBinding,
  controllerTypeFromId,
  defaultBindingsForSlot,
  emptyBindingMap,
  findBindingConflict,
  isStandardLogicalInput,
  sanitizeBindings,
  sanitizeSparseBindings
} from './gamepadBinding.js'

export function createGamepadProfileStore() {
  return {
    version: GAMEPAD_PROFILE_VERSION,
    assignments: [],
    libraries: {},
    typeLibraries: {},
    playerProfiles: emptyPlayerCatalog()
  }
}

function emptyPlayerCatalog() {
  return {
    nextId: 1,
    slots: ['default', 'default'],
    profiles: [{ id: 'default', name: 'Standard', builtin: true, bindings: null }]
  }
}

function ensureLibrary(map, key) {
  const existing = map[key]
  if (!existing || !Array.isArray(existing.profiles) || existing.profiles.length === 0) {
    map[key] = {
      activeProfileId: 'default',
      nextId: 1,
      profiles: [{ id: 'default', name: 'Standard', builtin: true, bindings: null }]
    }
  }
  const library = map[key]
  if (!Number.isInteger(library.nextId)) library.nextId = library.profiles.length
  return library
}

function libraryMap(store, field) {
  if (!store[field] || typeof store[field] !== 'object') store[field] = {}
  return store[field]
}

function libraryFor(store, instanceKey) {
  return ensureLibrary(libraryMap(store, 'libraries'), instanceKey)
}

function ensurePlayerProfiles(store) {
  const existing = store.playerProfiles
  if (!existing || !Array.isArray(existing.profiles) || existing.profiles.length === 0) {
    store.playerProfiles = emptyPlayerCatalog()
  }
  const players = store.playerProfiles
  if (!Array.isArray(players.slots) || players.slots.length < 2) players.slots = ['default', 'default']
  if (players.slots[0] == null) players.slots[0] = 'default'
  if (players.slots[1] == null) players.slots[1] = 'default'
  if (!Number.isInteger(players.nextId)) players.nextId = players.profiles.length
  return players
}

function typeKey(typeOrId) {
  if (typeOrId === 'xbox' || typeOrId === 'playstation' || typeOrId === 'generic') return typeOrId
  return controllerTypeFromId(typeOrId)
}

function typeLibrary(store, typeOrId) {
  return ensureLibrary(libraryMap(store, 'typeLibraries'), typeKey(typeOrId))
}

function profileById(library, profileId) {
  return library.profiles.find(item => item.id === profileId) || null
}

function activeProfile(library) {
  return profileById(library, library.activeProfileId) || library.profiles[0]
}

export function loadGamepadProfileStore(storage) {
  if (!storage || typeof storage.getItem !== 'function') return createGamepadProfileStore()
  try {
    const raw = storage.getItem(GAMEPAD_STORAGE_KEY)
    if (!raw) return createGamepadProfileStore()
    const parsed = JSON.parse(raw)
    const knownVersion = parsed && (parsed.version === GAMEPAD_PROFILE_VERSION || parsed.version === GAMEPAD_PROFILE_VERSION_V1)
    if (!knownVersion || typeof parsed.libraries !== 'object' || !parsed.libraries) {
      return createGamepadProfileStore()
    }
    if (!Array.isArray(parsed.assignments)) parsed.assignments = []
    parsed.version = GAMEPAD_PROFILE_VERSION
    ensurePlayerProfiles(parsed)
    if (!parsed.typeLibraries || typeof parsed.typeLibraries !== 'object') parsed.typeLibraries = {}
    return parsed
  } catch {
    return createGamepadProfileStore()
  }
}

export function saveGamepadProfileStore(storage, store) {
  if (!storage || typeof storage.setItem !== 'function') return false
  try {
    store.version = GAMEPAD_PROFILE_VERSION
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
  const profile = activeProfile(libraryFor(store, instanceKey))
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
  const profile = profileById(library, profileId)
  if (!profile) return false
  library.activeProfileId = profile.id
  return true
}

export function saveActiveGamepadProfile(store, instanceKey, slot, bindings) {
  const library = libraryFor(store, instanceKey)
  const profile = activeProfile(library)
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
  const profile = profileById(library, profileId)
  const trimmed = String(name || '').trim()
  if (!profile || !trimmed) return false
  profile.name = trimmed
  return true
}

export function deleteGamepadProfile(store, instanceKey, profileId) {
  const library = libraryFor(store, instanceKey)
  const profile = profileById(library, profileId)
  if (!profile || profile.builtin) return false
  library.profiles = library.profiles.filter(item => item.id !== profileId)
  if (library.activeProfileId === profileId) library.activeProfileId = 'default'
  return true
}

export function resetGamepadProfile(store, instanceKey, profileId) {
  const library = libraryFor(store, instanceKey)
  const profile = profileById(library, profileId)
  if (!profile) return false
  profile.bindings = null
  return true
}

export function knownGamepadInstanceKeys(store) {
  return Object.keys(store.libraries || {})
}

export function listPlayerProfiles(store) {
  const players = ensurePlayerProfiles(store)
  return players.profiles.map(profile => ({
    id: profile.id,
    name: profile.name,
    builtin: Boolean(profile.builtin)
  }))
}

export function getSlotPlayerProfileId(store, slot) {
  const players = ensurePlayerProfiles(store)
  return players.slots[slot === 1 ? 1 : 0] || 'default'
}

export function getPlayerProfileBindings(store, profileId) {
  const players = ensurePlayerProfiles(store)
  const profile = players.profiles.find(item => item.id === profileId)
  if (!profile || !profile.bindings) return null
  return { ...profile.bindings }
}

export function setSlotPlayerProfile(store, slot, profileId) {
  const players = ensurePlayerProfiles(store)
  const profile = players.profiles.find(item => item.id === profileId)
  if (!profile) return false
  players.slots[slot === 1 ? 1 : 0] = profile.id
  return true
}

export function createPlayerProfile(store, name, slot, bindings) {
  const players = ensurePlayerProfiles(store)
  const trimmed = String(name || '').trim()
  if (!trimmed) return null
  const id = `player${players.nextId}`
  players.nextId += 1
  const profile = {
    id,
    name: trimmed,
    builtin: false,
    bindings: bindings ? sanitizeSparseBindings(bindings) : null
  }
  players.profiles.push(profile)
  if (slot === 0 || slot === 1) players.slots[slot] = id
  return profile
}

export function renamePlayerProfile(store, profileId, name) {
  const players = ensurePlayerProfiles(store)
  const profile = players.profiles.find(item => item.id === profileId)
  const trimmed = String(name || '').trim()
  if (!profile || !trimmed) return false
  profile.name = trimmed
  return true
}

export function deletePlayerProfile(store, profileId) {
  const players = ensurePlayerProfiles(store)
  const profile = players.profiles.find(item => item.id === profileId)
  if (!profile || profile.builtin) return false
  players.profiles = players.profiles.filter(item => item.id !== profileId)
  if (players.slots[0] === profileId) players.slots[0] = 'default'
  if (players.slots[1] === profileId) players.slots[1] = 'default'
  return true
}

export function resetPlayerProfile(store, profileId) {
  const players = ensurePlayerProfiles(store)
  const profile = players.profiles.find(item => item.id === profileId)
  if (!profile) return false
  profile.bindings = null
  return true
}

export function listControllerTypeProfiles(store, typeOrId) {
  const library = typeLibrary(store, typeOrId)
  return library.profiles.map(profile => ({
    id: profile.id,
    name: profile.name,
    builtin: Boolean(profile.builtin)
  }))
}

export function getActiveControllerTypeProfileId(store, typeOrId) {
  return typeLibrary(store, typeOrId).activeProfileId || 'default'
}

export function setActiveControllerTypeProfile(store, typeOrId, profileId) {
  const library = typeLibrary(store, typeOrId)
  const profile = profileById(library, profileId)
  if (!profile) return false
  library.activeProfileId = profile.id
  return true
}

export function createControllerTypeProfile(store, typeOrId, name, bindings) {
  const library = typeLibrary(store, typeOrId)
  const trimmed = String(name || '').trim()
  if (!trimmed) return null
  const id = `t${library.nextId}`
  library.nextId += 1
  const profile = {
    id,
    name: trimmed,
    builtin: false,
    bindings: bindings ? sanitizeSparseBindings(bindings) : null
  }
  library.profiles.push(profile)
  library.activeProfileId = id
  return profile
}

export function renameControllerTypeProfile(store, typeOrId, profileId, name) {
  const library = typeLibrary(store, typeOrId)
  const profile = profileById(library, profileId)
  const trimmed = String(name || '').trim()
  if (!profile || !trimmed) return false
  profile.name = trimmed
  return true
}

export function deleteControllerTypeProfile(store, typeOrId, profileId) {
  const library = typeLibrary(store, typeOrId)
  const profile = profileById(library, profileId)
  if (!profile || profile.builtin) return false
  library.profiles = library.profiles.filter(item => item.id !== profileId)
  if (library.activeProfileId === profileId) library.activeProfileId = 'default'
  return true
}

export function resetControllerTypeProfile(store, typeOrId, profileId) {
  const library = typeLibrary(store, typeOrId)
  const profile = profileById(library, profileId)
  if (!profile) return false
  profile.bindings = null
  return true
}

function playerBindings(store, slot) {
  const players = ensurePlayerProfiles(store)
  const id = players.slots[slot === 1 ? 1 : 0] || 'default'
  const profile = players.profiles.find(item => item.id === id) || players.profiles[0]
  if (!profile || !profile.bindings || typeof profile.bindings !== 'object') return null
  return profile.bindings
}

function typeBindings(store, gamepadId) {
  if (!gamepadId) return null
  const profile = activeProfile(typeLibrary(store, gamepadId))
  if (!profile || !profile.bindings || typeof profile.bindings !== 'object') return null
  return profile.bindings
}

function deviceBindings(store, instanceKey) {
  if (!instanceKey || !store.libraries || !store.libraries[instanceKey]) return null
  const profile = activeProfile(libraryFor(store, instanceKey))
  if (!profile || !profile.bindings || typeof profile.bindings !== 'object') return null
  return profile.bindings
}

function writeSparse(profile, commandId, input) {
  if (!profile || !commandId) return
  if (!profile.bindings || typeof profile.bindings !== 'object') profile.bindings = {}
  if (!input) {
    profile.bindings[commandId] = null
    return
  }
  const clean = sanitizeSparseBindings({ [commandId]: input })[commandId]
  profile.bindings[commandId] = clean || null
}

export function resolveGamepadBindings(store, { slot = 0, instanceKey = '', gamepadId = '' } = {}) {
  const resolvedSlot = slot === 1 ? 1 : 0
  const defaults = emptyBindingMap(resolvedSlot)
  const player = playerBindings(store, resolvedSlot)
  const type = typeBindings(store, gamepadId)
  const device = deviceBindings(store, instanceKey)
  const bindings = {}
  const sources = {}
  const commandIds = Object.keys(defaults)
  for (let i = 0; i < commandIds.length; i++) {
    const commandId = commandIds[i]
    if (player && Object.prototype.hasOwnProperty.call(player, commandId)) {
      bindings[commandId] = player[commandId]
      sources[commandId] = 'player'
    } else if (type && Object.prototype.hasOwnProperty.call(type, commandId)) {
      bindings[commandId] = type[commandId]
      sources[commandId] = 'type'
    } else if (device && Object.prototype.hasOwnProperty.call(device, commandId)) {
      bindings[commandId] = device[commandId]
      sources[commandId] = 'device'
    } else {
      bindings[commandId] = defaults[commandId]
      sources[commandId] = 'default'
    }
  }
  return { bindings, sources }
}

function playerProfileForSlot(store, slot) {
  const players = ensurePlayerProfiles(store)
  const id = players.slots[slot === 1 ? 1 : 0] || 'default'
  return players.profiles.find(item => item.id === id) || players.profiles[0]
}

function clearResolvedCommand(store, source, { slot, instanceKey, gamepadId, commandId }) {
  if (source === 'type' && gamepadId) {
    writeSparse(activeProfile(typeLibrary(store, gamepadId)), commandId, null)
    return
  }
  if (source === 'device' && instanceKey) {
    const current = getActiveBindings(store, instanceKey, slot)
    saveActiveGamepadProfile(store, instanceKey, slot, assignBinding(current, commandId, null).bindings)
    return
  }
  writeSparse(playerProfileForSlot(store, slot), commandId, null)
}

export function placeGamepadBinding(store, { slot = 0, instanceKey = '', gamepadId = '', commandId, input }) {
  const resolved = resolveGamepadBindings(store, { slot, instanceKey, gamepadId })
  const conflict = input ? findBindingConflict(resolved.bindings, commandId, input) : null
  if (conflict) {
    clearResolvedCommand(store, resolved.sources[conflict], {
      slot,
      instanceKey,
      gamepadId,
      commandId: conflict
    })
  }
  const useType = Boolean(input) && !isStandardLogicalInput(input)
  if (useType) {
    const id = gamepadId || 'generic'
    writeSparse(activeProfile(typeLibrary(store, id)), commandId, input)
  } else {
    writeSparse(playerProfileForSlot(store, slot), commandId, input)
  }
  return { conflict, layer: useType ? 'type' : 'player' }
}
