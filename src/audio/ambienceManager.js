import { gameState } from '../gameState.js'
import { getEffectsVolume, getSharedAudioContext, onAudioVolumeChange, playSound } from '../sound.js'

const OPEN = 'ambienceWindOpen'
const DESERT = 'ambienceWindDesert'
const SNOW = 'ambienceWindSnow'
const BED_BY_BIOME = { grass: OPEN, soil: OPEN, sand: DESERT, snow: SNOW }
const AMBIENCE_VOLUME = 0.32
const FADE_SECONDS = 0.7

let current = null
let pendingKey = null
let appliedEffects = -1
let listening = false

export function ambienceKeyForState(state = gameState) {
  const tag = state?.activeSpriteSheetBiomeTag || 'grass'
  if (tag === 'mixed') {
    const weights = state.mapBiomeWeights || {}
    let best = 'grass'
    let bestWeight = -1
    for (const name of ['grass', 'soil', 'sand', 'snow']) {
      const weight = Number(weights[name]) || 0
      if (weight > bestWeight) {
        best = name
        bestWeight = weight
      }
    }
    return BED_BY_BIOME[best] || OPEN
  }
  return BED_BY_BIOME[tag] || OPEN
}

function contextNow() {
  const context = getSharedAudioContext()
  if (!context || context.state === 'suspended') return null
  return context.currentTime
}

function fadeOut(entry) {
  if (!entry?.handle) return
  const now = contextNow()
  const gain = entry.handle.gainNode?.gain
  const source = entry.handle.source
  if (gain && now !== null && typeof gain.cancelScheduledValues === 'function') {
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(0, now + FADE_SECONDS)
  }
  if (source && now !== null) {
    try { source.stop(now + FADE_SECONDS) } catch { /* already stopped */ }
  } else if (source) {
    try { source.stop() } catch { /* already stopped */ }
  }
}

function applyLevel(entry) {
  const now = contextNow()
  const gain = entry?.handle?.gainNode?.gain
  if (!gain || now === null || typeof gain.cancelScheduledValues !== 'function') return
  const target = AMBIENCE_VOLUME * getEffectsVolume()
  gain.cancelScheduledValues(now)
  gain.setValueAtTime(Math.max(0, target), now)
}

export function stopBattlefieldAmbience() {
  fadeOut(current)
  current = null
  pendingKey = null
  appliedEffects = -1
}

function tabHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function shouldPlay(state) {
  return Boolean(state?.gameStarted) && !state.gamePaused && !state.gameOver && !tabHidden() && getEffectsVolume() > 0.001
}

export function syncBattlefieldAmbience(state = gameState) {
  installAmbienceListeners()
  if (!shouldPlay(state)) {
    if (current || pendingKey) stopBattlefieldAmbience()
    return
  }
  const key = ambienceKeyForState(state)
  if (current?.key === key) {
    const effects = getEffectsVolume()
    if (effects !== appliedEffects) {
      appliedEffects = effects
      applyLevel(current)
    }
    return
  }
  if (pendingKey === key) return
  const previous = current
  current = null
  pendingKey = key
  appliedEffects = -1
  Promise.resolve(playSound(key, 0.001, 0, false, { playLoop: true })).then(handle => {
    if (pendingKey !== key || !shouldPlay(gameState)) {
      if (handle?.source) {
        try { handle.source.stop() } catch { /* already stopped */ }
      }
      return
    }
    current = { key, handle }
    pendingKey = null
    const now = contextNow()
    const gain = handle?.gainNode?.gain
    const target = AMBIENCE_VOLUME * getEffectsVolume()
    appliedEffects = getEffectsVolume()
    if (gain && now !== null && typeof gain.cancelScheduledValues === 'function') {
      gain.cancelScheduledValues(now)
      gain.setValueAtTime(0, now)
      gain.linearRampToValueAtTime(target, now + FADE_SECONDS)
    } else if (gain) {
      gain.value = target
    }
    fadeOut(previous)
  }).catch(() => {
    if (pendingKey === key) pendingKey = null
  })
}

export function installAmbienceListeners() {
  if (listening || typeof document === 'undefined') return
  listening = true
  document.addEventListener('visibilitychange', () => {
    syncBattlefieldAmbience(gameState)
  })
  onAudioVolumeChange(() => {
    appliedEffects = -1
    if (current) syncBattlefieldAmbience(gameState)
  })
}

export function resetAmbienceForTests() {
  stopBattlefieldAmbience()
  listening = false
}
