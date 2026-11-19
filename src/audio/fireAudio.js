import { TILE_SIZE } from '../config.js'
import { isHeadlessAudioMuted } from '../utils/headlessAudioMute.js'
import { isPositionVisibleToPlayer } from '../game/shadowOfWar.js'

const MAX_FIRE_VOICES = 4
const MAX_HOSE_VOICES = 2
const FIRE_VOLUME = 0.32
const HOSE_VOLUME = 0.4
const READY_VOLUME = 0.85
const READY_COOLDOWN_MS = 4500

function createCandidate() {
  return { key: 0, x: 0, y: 0, dist: 0 }
}

function createSlot() {
  return { key: 0, x: 0, y: 0, handle: null, token: 0, keep: false }
}

const fireBest = Array.from({ length: MAX_FIRE_VOICES }, createCandidate)
const hoseBest = Array.from({ length: MAX_HOSE_VOICES }, createCandidate)
const fireSlots = Array.from({ length: MAX_FIRE_VOICES }, createSlot)
const hoseSlots = Array.from({ length: MAX_HOSE_VOICES }, createSlot)
const fireCount = { value: 0 }
const hoseCount = { value: 0 }
const hoseKeys = new WeakMap()
let nextHoseKey = 1

let readyAt = 0
let soundApi = null
let soundApiPromise = null
let resetRegistered = false

function loadSoundApi() {
  if (soundApi) return Promise.resolve(soundApi)
  if (!soundApiPromise) {
    soundApiPromise = import('../sound.js').then(api => {
      soundApi = api
      if (!resetRegistered && typeof api.onAudioSessionReset === 'function') {
        api.onAudioSessionReset(resetFireAudio)
        resetRegistered = true
      }
      return api
    }).catch(() => null)
  }
  return soundApiPromise
}

function stopHandle(handle) {
  if (!handle) return
  if (soundApi && typeof soundApi.stopFixedSound === 'function') {
    soundApi.stopFixedSound(handle)
    return
  }
  try { handle.source?.stop() } catch { /* already stopped */ }
}

function clearSlot(slot) {
  slot.token += 1
  slot.key = 0
  slot.keep = false
  slot.pending = false
  const handle = slot.handle
  slot.handle = null
  stopHandle(handle)
}

function stopVoices() {
  for (const slot of fireSlots) if (slot.key || slot.handle || slot.pending) clearSlot(slot)
  for (const slot of hoseSlots) if (slot.key || slot.handle || slot.pending) clearSlot(slot)
}

export function resetFireAudio() {
  readyAt = 0
  stopVoices()
}

function consider(best, count, limit, key, x, y, cameraX, cameraY) {
  const dx = x - cameraX
  const dy = y - cameraY
  const dist = dx * dx + dy * dy
  let index = count.value
  if (index < limit) {
    count.value = index + 1
  } else if (dist >= best[limit - 1].dist) {
    return
  } else {
    index = limit - 1
  }
  const slot = best[index]
  slot.key = key
  slot.x = x
  slot.y = y
  slot.dist = dist
  while (index > 0 && best[index].dist < best[index - 1].dist) {
    const swap = best[index]
    best[index] = best[index - 1]
    best[index - 1] = swap
    index -= 1
  }
}

function cameraCenter(state) {
  const canvas = globalThis.document?.getElementById?.('gameCanvas')
  return {
    x: (state.scrollOffset?.x || 0) + (canvas?.width || 0) / 2,
    y: (state.scrollOffset?.y || 0) + (canvas?.height || 0) / 2
  }
}

function isFriendly(state, owner) {
  if (!owner) return false
  const human = state.humanPlayer || 'player1'
  return owner === human || owner === 'player' || (human === 'player1' && owner === 'player')
}

function isAudible(state, grid, x, y, owner) {
  if (!state.shadowOfWarEnabled || isFriendly(state, owner)) return true
  return isPositionVisibleToPlayer(state, grid, x, y)
}

function assignSlots(slots, best, count, eventName, volume) {
  for (const slot of slots) slot.keep = false
  for (let index = 0; index < count; index += 1) {
    const item = best[index]
    let slot = null
    for (const candidate of slots) {
      if (candidate.key === item.key) {
        slot = candidate
        break
      }
    }
    if (!slot) {
      for (const candidate of slots) {
        if (!candidate.keep) {
          slot = candidate
          break
        }
      }
    }
    if (!slot) continue
    const replaced = slot.key !== item.key
    slot.keep = true
    slot.key = item.key
    slot.x = item.x
    slot.y = item.y
    if (replaced || (!slot.handle && !slot.pending)) startSlot(slot, eventName, volume)
    else if (slot.handle) updateSlot(slot, volume)
  }
  for (const slot of slots) {
    if (!slot.keep && (slot.key || slot.handle)) clearSlot(slot)
  }
}

function startSlot(slot, eventName, volume) {
  const token = slot.token + 1
  slot.token = token
  slot.pending = true
  const previous = slot.handle
  slot.handle = null
  stopHandle(previous)
  const x = slot.x
  const y = slot.y
  loadSoundApi().then(api => {
    if (!api || token !== slot.token || typeof api.playFixedPositionalSound !== 'function') return null
    return api.playFixedPositionalSound(eventName, x, y, volume, { playLoop: true })
  }).then(handle => {
    if (!handle || token !== slot.token) {
      stopHandle(handle)
      if (token === slot.token) slot.pending = false
      return
    }
    slot.pending = false
    slot.handle = handle
    updateSlot(slot, volume)
  }).catch(() => {
    if (token === slot.token) {
      slot.pending = false
      slot.key = 0
    }
  })
}

function updateSlot(slot, volume) {
  if (!soundApi || typeof soundApi.updateFixedPositionalGain !== 'function' || !slot.handle) return
  soundApi.updateFixedPositionalGain(slot.handle, slot.x, slot.y, volume)
}

export function syncFireAudio(units, state, grid) {
  if (isHeadlessAudioMuted() || !state) return
  if (state.gamePaused) {
    stopVoices()
    return
  }
  const camera = cameraCenter(state)
  fireCount.value = 0
  const fires = state.fires
  if (fires) {
    for (const fire of fires) {
      const x = (fire.x + 0.5) * TILE_SIZE
      const y = (fire.y + 0.5) * TILE_SIZE
      const owner = grid?.[fire.y]?.[fire.x]?.building?.owner || grid?.[fire.y]?.[fire.x]?.cityBuilding?.owner
      if (!isAudible(state, grid, x, y, owner)) continue
      consider(fireBest, fireCount, MAX_FIRE_VOICES, fire.x + fire.y * 1024, x, y, camera.x, camera.y)
    }
  }
  hoseCount.value = 0
  if (units) {
    for (const unit of units) {
      if (unit?.type !== 'fireEngine' || !(unit.health > 0) || !unit.extinguishing) continue
      const x = unit.x + TILE_SIZE / 2
      const y = unit.y + TILE_SIZE / 2
      if (!isAudible(state, grid, x, y, unit.owner)) continue
      let key = hoseKeys.get(unit)
      if (!key) {
        key = nextHoseKey
        nextHoseKey += 1
        hoseKeys.set(unit, key)
      }
      consider(hoseBest, hoseCount, MAX_HOSE_VOICES, key, x, y, camera.x, camera.y)
    }
  }
  if (!fireCount.value && !hoseCount.value) {
    stopVoices()
    return
  }
  assignSlots(fireSlots, fireBest, fireCount.value, 'fireLoop', FIRE_VOLUME)
  assignSlots(hoseSlots, hoseBest, hoseCount.value, 'fireHoseLoop', HOSE_VOLUME)
}

export function playFireEngineReady() {
  if (isHeadlessAudioMuted()) return
  const now = globalThis.performance?.now?.() || Date.now()
  if (now < readyAt) return
  readyAt = now + READY_COOLDOWN_MS
  loadSoundApi().then(api => {
    if (typeof api?.playFixedSound === 'function') api.playFixedSound('fireEngineReady', READY_VOLUME)
  }).catch(() => {})
}
