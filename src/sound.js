import { MUSIC_TRACKS, MUSIC_SKIP_ORDER, MUSIC_TRACK_TITLES, getNextSkipTrack, resetMusicDirector } from './audio/musicDirector.js'
// sound.js
import { MASTER_VOLUME } from './config.js'
import { videoOverlay } from './ui/videoOverlay.js'
import { gameState } from './gameState.js'
import { gameRandom } from './utils/gameRandom.js'
import { isHeadlessAudioMuted } from './utils/headlessAudioMute.js'
import { configureAudioElement } from './pwa/audioElementPolicy.js'
import { getStoredItem, setStoredItem } from './storage/indexedDbStorage.js'

const suppressAudioForAutomation = isHeadlessAudioMuted()

let audioContext = null
if (!suppressAudioForAutomation) {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  } catch {
    console.error('Web Audio API is not supported.')
  }
}

// Master volume control with IndexedDB persistence
const VOLUME_STORAGE_KEY = 'rts-game-master-volume'

function loadVolumeFromStorage() {
  try {
    const storedVolume = getStoredItem(VOLUME_STORAGE_KEY)
    if (storedVolume !== null) {
      const parsedVolume = parseFloat(storedVolume)
      if (!isNaN(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1) {
        return parsedVolume
      }
    }
  } catch (e) {
    window.logger.warn('Failed to load volume from IndexedDB:', e)
  }
  return MASTER_VOLUME // Fall back to default
}

function saveVolumeToStorage(volume) {
  try {
    setStoredItem(VOLUME_STORAGE_KEY, volume.toString())
  } catch (e) {
    window.logger.warn('Failed to save volume to IndexedDB:', e)
  }
}

let masterVolume = loadVolumeFromStorage()

// Sound effects / music balance (0 = effects only, 50 = equal, 100 = music
// only). Scales music against effects + narration; both stay under the master
// volume slider.
export const MIX_BALANCE_STORAGE_KEY = 'cfb-audio-mix-balance'
// 25 = Music 50% / SFX 100% (music scale = balance / 50, capped at 1).
export const DEFAULT_MIX_BALANCE = 25

function loadMixBalance() {
  try {
    const stored = Number.parseFloat(getStoredItem(MIX_BALANCE_STORAGE_KEY))
    if (Number.isFinite(stored)) return Math.max(0, Math.min(100, stored))
  } catch {
    // Storage unavailable: fall back to the default balance.
  }
  return DEFAULT_MIX_BALANCE
}

let mixBalance = loadMixBalance()
const audioVolumeListeners = new Set()

export function musicMixScale(balance = mixBalance) {
  return Math.max(0, Math.min(1, balance / 50))
}

export function effectsMixScale(balance = mixBalance) {
  return Math.max(0, Math.min(1, (100 - balance) / 50))
}

export function getMixBalance() {
  return mixBalance
}

// Effective level for sound effects and narration (master x balance).
export function getEffectsVolume() {
  return masterVolume * effectsMixScale()
}

export function getMusicVolume() {
  return masterVolume * musicMixScale()
}

export function onAudioVolumeChange(listener) {
  audioVolumeListeners.add(listener)
  return () => audioVolumeListeners.delete(listener)
}

function notifyAudioVolume() {
  audioVolumeListeners.forEach(listener => {
    try { listener() } catch (error) { window.logger?.warn?.('Volume listener failed:', error) }
  })
}

export function reloadMasterVolumeFromStorage() {
  masterVolume = loadVolumeFromStorage()
  return masterVolume
}

const soundFiles = {
  // Original sound categories
  explosion: ['explosion01.mp3', 'explosion02.mp3', 'explosion03.mp3', 'explosion04.mp3'],
  tankShot: ['tankShot01.mp3', 'tankShot02.mp3', 'tankShot03.mp3'],
  tankShot03: ['tankShot03.mp3'], // Specific sound for turretGunV3
  tankMove: ['tankEngineStart01.mp3', 'confirmed.mp3', 'onMyWay.mp3'],
  confirmed: ['confirmed.mp3'], // Direct mapping for confirmed sound
  unitReady: ['unitReady01.mp3', 'unitReady02.mp3', 'unitReady03.mp3'],
  unitReady01: ['unitReady01.mp3'],
  unitReady02: ['unitReady02.mp3'],
  unitReady03: ['unitReady03.mp3'],
  unit_is_being_repaired: ['unit_is_being_repaired.mp3'],
  bulletHit: ['bulletHit01.mp3'],
  deposit: ['deposit.mp3'],
  unitSelection: ['yesSir01.mp3'],
  patriotMissile: ['patriotMissile01.mp3', 'patriotMissile02.mp3'],
  repairStarted: ['repairStarted.mp3', 'repairing.mp3'],
  repairFinished: ['repairFinished.mp3'],
  repairPaused: ['repairPaused.mp3'],
  repairCancelled: ['repairCancelled.mp3'],
  constructionStarted: ['construction_started.mp3', 'building.mp3'],
  constructionComplete: ['constructionComplete.mp3'],
  constructionPaused: ['construction_paused.mp3'],
  constructionCancelled: ['construction_cancelled.mp3'],
  constructionObstructed: ['construction_obstructed.mp3'], // alias for constructionObstructed
  building: ['building.mp3'],
  buildingPlaced: ['buildingPlaced.mp3'],
  harvest: ['harvest.mp3'],
  AllMinesOnTheFieldAreDisarmed: ['AllMinesOnTheFieldAreDisarmed.mp3'],
  The_mine_field_has_been_deployed_and_armed: ['The_mine_field_has_been_deployed_and_armed.mp3'],
  unitLost: ['unit_lost.mp3'],
  attacking: ['attacking.mp3'],
  enemyUnitDestroyed: ['enemy_unit_destroyed.mp3'],
  enemyBuildingDestroyed: ['enemy_building_destroyed.mp3'],
  teslacoil_loading: ['teslacoil_loading.mp3'],
  teslacoil_firing: ['teslacoil_firing.mp3'],
  criticalDamage: ['critical_damage.mp3'],
  Repair_impossible_when_under_attack: ['Repair_impossible_when_under_attack.mp3'],
  battleWon: ['battleWon.mp3'],
  battleLost: ['battleLost.mp3'],
  playerBlueDefeated: ['playerBlueDefeated.mp3'],
  playerGreenDefeated: ['playerGreenDefeated.mp3'],
  playerRedDefeated: ['playerRedDefeated.mp3'],
  playerYellowDefeated: ['playerYellowDefeated.mp3'],
  new_units_types_available: ['new_units_types_available.mp3'],
  new_building_types_available: ['new_building_types_available.mp3'],
  new_production_options: ['new_production_options.mp3'],
  ourLoaderIsOut: ['ourLoaderIsOut.mp3'],
  ourDriverIsOut: ['ourDriverIsOut.mp3'],
  ourCommanderIsOut: ['ourCommanderIsOut.mp3'],
  ourGunnerIsOut: ['ourGunnerIsOut.mp3'],
  outOfGas: ['IAmOutOfGas.mp3'],
  unitRefules: ['unitRefules.mp3'],
  i_am_out_of_ammo: ['i_am_out_of_ammo.mp3'],

  // New waypoint and attack notification sounds
  movingAlongThePath: ['movingAlongThePath.mp3'],
  ourBaseIsUnderAttack: ['ourBaseIsUnderAttack.mp3'],
  ourHarvestersAreUnderAttack: ['ourHarvestersAreUnderAttack.mp3'],
  ourBattleshipGotAttacked: ['ourBattleshipGotAttacked.mp3'],
  ourSubmarineGotAttacked: ['ourSubmarineGotAttacked.mp3'],
  ourCarrierGotAttacked: ['ourCarrierGotAttacked.mp3'],
  ourHovercraftGotAttacked: ['ourHovercraftGotAttacked.mp3'],
  ourShipsGotAttacked: ['ourShipsGotAttacked.mp3'],
  chainOfCommandsReceived: ['chainOfCommandsReceived.mp3'],

  // Looping tank drive sound
  tankDriveLoop: ['tankDrive4sLoop.mp3'],

  // Naval movement loops (same playLoop path as tankDriveLoop / apache_fly)
  battleshipCruise: ['battleshipCruise.mp3'],
  hovercraftMoving: ['hovercraftMoving.mp3'],

  // Naval one-shots. battleshipFire picks one variant per playback via gameRandom.
  submarineSurfacing: ['submarineSurfacing.mp3'],
  submarineDiving: ['submarineDiving.mp3'],
  submarineTorpedo: ['submarineTorpedo.mp3'],
  battleshipFire: ['battleshipFire1.mp3', 'battleshipFire2.mp3', 'battleshipFire3.mp3'],
  shipSinking: ['shipSinking.mp3'],

  // Apache helicopter flight loop
  apache_fly: ['apache_fly.mp3'],

  // F22 sounds
  f22Flight: ['F22Flight.mp3'],
  f22Landing: ['F22Landing.mp3'],
  f22Takeoff: ['F22TakeOff_1.mp3', 'F22TakeOff_2.mp3'],
  f22CrashImpact: ['explosion04.mp3'],
  f35Takeoff: ['F35TakeOff.mp3'],
  f35Landing: ['F35Landing.mp3'],
  f35BombDrop: ['F35BombDrop.mp3'],
  f35BombImpact: ['F35BombDetonation.mp3'],

  // Game event aliases (previously in soundMapping)
  movement: ['tankEngineStart01.mp3', 'confirmed.mp3', 'onMyWay.mp3'], // alias for tankMove
  shoot: ['tankShot01.mp3', 'tankShot02.mp3', 'tankShot03.mp3'], // alias for tankShot
  shoot_rocket: ['patriotMissile01.mp3', 'patriotMissile02.mp3'], // alias for patriotMissile
  shoot_heavy: ['tankShot03.mp3'], // alias for tankShot03

  // Direct file access (for legacy compatibility)
  yesSir01: ['yesSir01.mp3'],

  // Missing sound placeholders (will use fallback beep)
  error: [], // No error.mp3 file exists - will use fallback
  cancel: [] // No cancel.mp3 file exists - will use fallback
}

const activeAudioElements = new Map()
const soundThrottleTimestamps = new Map() // Track last play time for throttled sounds

// Background music files (played as a random playlist; add more files as needed)
const backgroundMusicFiles = ['music01.mp3', 'music02.mp3']

// Cache audio buffers using Web Audio API for true zero-network caching
const audioBufferCache = new Map()
const loadingPromises = new Map() // Track files currently being loaded

async function getCachedAudioBuffer(soundPath) {
  // Check if already cached
  let buffer = audioBufferCache.get(soundPath)
  if (buffer) {
    return buffer
  }

  // Check if currently loading
  let loadPromise = loadingPromises.get(soundPath)
  if (loadPromise) {
    return await loadPromise
  }

  // Start loading
  loadPromise = loadAudioBuffer(soundPath)
  loadingPromises.set(soundPath, loadPromise)

  try {
    buffer = await loadPromise
    audioBufferCache.set(soundPath, buffer)
    loadingPromises.delete(soundPath)
    return buffer
  } catch (error) {
    loadingPromises.delete(soundPath)
    throw error
  }
}

async function loadAudioBuffer(soundPath) {
  if (!audioContext) {
    throw new Error('AudioContext not available')
  }

  try {
    const response = await fetch(soundPath)
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    return audioBuffer
  } catch (error) {
    console.error(`Error loading audio buffer for ${soundPath}:`, error)
    throw error
  }
}

function playAudioBuffer(audioBuffer, volume = 1.0, onEnded, options = {}) {
  const { pan = 0, loop = false } = options
  if (!audioContext || !audioBuffer) {
    if (onEnded) setTimeout(onEnded, 0)
    return null
  }

  try {
    const source = audioContext.createBufferSource()
    const gainNode = audioContext.createGain()
    let panner = null

    source.buffer = audioBuffer
    source.loop = loop
    if (typeof audioContext.createStereoPanner === 'function') {
      panner = audioContext.createStereoPanner()
      panner.pan.value = pan
      source.connect(panner)
      panner.connect(gainNode)
    } else {
      source.connect(gainNode)
    }
    gainNode.connect(audioContext.destination)
    gainNode.gain.value = volume * getEffectsVolume()

    // Handle ended event
    if (onEnded) {
      source.addEventListener('ended', onEnded, { once: true })
    }

    source.start()
    return { source, gainNode, panner }
  } catch (error) {
    console.error('Error playing audio buffer:', error)
    if (onEnded) setTimeout(onEnded, 0)
    return null
  }
}

// Fallback function for legacy Audio elements (background music)
function _getCachedAudioElement(soundPath) {
  let element = soundElementCache.get(soundPath)
  if (!element) {
    element = new Audio(soundPath)
    configureAudioElement(element, soundPath, window.location.origin)
    element.preload = 'auto'

    // Ensure the audio is fully loaded before caching
    const loadPromise = new Promise((resolve, reject) => {
      const onLoad = () => {
        element.removeEventListener('canplaythrough', onLoad)
        element.removeEventListener('error', onError)
        resolve(element)
      }
      const onError = (e) => {
        element.removeEventListener('canplaythrough', onLoad)
        element.removeEventListener('error', onError)
        // Don't cache failed loads
        soundElementCache.delete(soundPath)
        reject(e)
      }

      element.addEventListener('canplaythrough', onLoad, { once: true })
      element.addEventListener('error', onError, { once: true })
    })

    loadingPromises.set(soundPath + '_element', loadPromise)
    element.load()
    soundElementCache.set(soundPath, element)
  }

  // Clone so multiple sounds can play simultaneously while sharing cached data
  return element.cloneNode(true)
}

// Keep legacy element cache for background music
const soundElementCache = new Map()

function calculatePositionalAudio(x, y) {
  const canvas = document.getElementById('gameCanvas')
  if (!canvas) {
    return { pan: 0, volumeFactor: 1 }
  }
  const centerX = gameState.scrollOffset.x + canvas.width / 2
  const centerY = gameState.scrollOffset.y + canvas.height / 2
  const dx = x - centerX
  const dy = y - centerY
  const distance = Math.hypot(dx, dy)
  // Increase positional sound range by 50%
  const maxDistance = Math.max(canvas.width, canvas.height) * 1.125
  const volumeFactor = Math.max(0, 1 - distance / maxDistance)
  const pan = Math.max(-1, Math.min(1, dx / maxDistance))
  return { pan, volumeFactor }
}

// Queue for narrated (stackable) sounds
const narratedSoundQueue = []
let isNarratedPlaying = false
const MAX_NARRATED_STACK = 3

async function playAssetSound(eventName, volume = 1.0, onEnded, options = {}) {
  const files = soundFiles[eventName]
  if (files && files.length > 0) {
    const file = files[Math.floor(gameRandom() * files.length)]
    const soundPath = 'sound/' + file

    try {
      // Use Web Audio API buffer for zero-network cached playback
      const audioBuffer = await getCachedAudioBuffer(soundPath)

      // Track this audio instance
      const audioId = soundPath + '_' + Date.now() + '_' + gameRandom()

      const cleanup = () => {
        activeAudioElements.delete(audioId)
        if (onEnded) onEnded()
      }

      const nodes = playAudioBuffer(audioBuffer, volume, cleanup, { ...options, loop: options.playLoop })
      if (nodes) {
        activeAudioElements.set(audioId, nodes.source)
        return nodes
      }
    } catch (error) {
      console.error('Error playing cached audio buffer:', soundPath, error)
      if (onEnded) onEnded()
    }
  }
  // Return null if no files available (will trigger fallback beep)
  return null
}

function playImmediate(eventName, volume = 1.0, throttleSeconds = 0, onEnded, options = {}) {
  if (!audioContext) {
    if (onEnded) setTimeout(onEnded, 0)
    return Promise.resolve(null)
  }
  if (audioContext.state === 'suspended') {
    if (onEnded) setTimeout(onEnded, 0)
    return Promise.resolve(null)
  }

  // Check throttling if throttleSeconds > 0
  if (throttleSeconds > 0) {
    const now = Date.now()
    const lastPlayTime = soundThrottleTimestamps.get(eventName)
    if (lastPlayTime && (now - lastPlayTime) < (throttleSeconds * 1000)) {
      // Sound is throttled, don't play
      if (onEnded) setTimeout(onEnded, 0)
      return
    }
    // Update timestamp for this sound
    soundThrottleTimestamps.set(eventName, now)
  }

  // Use eventName directly with soundFiles instead of mapping
  if (soundFiles[eventName]) {
    return playAssetSound(eventName, volume, onEnded, options).catch(e => {
      console.error('Error in playAssetSound:', e)
      if (onEnded) onEnded()
      return null
    })
  } else {
    window.logger.warn(`No sound files found for event: ${eventName}`)
  }

  // Fallback beep sound.
  try {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    oscillator.frequency.value = 500
    oscillator.type = 'sine'
    gainNode.gain.value = volume * getEffectsVolume() // Apply master volume and balance

    // Use a more reliable callback mechanism for the fallback beep
    const duration = 0.3 // Slightly longer beep for better audio feedback
    oscillator.start()
    oscillator.stop(audioContext.currentTime + duration)

    // Ensure callback is only called once
    if (onEnded) {
      let callbackCalled = false
      const callOnce = () => {
        if (!callbackCalled) {
          callbackCalled = true
          onEnded()
        }
      }
      oscillator.addEventListener('ended', callOnce, { once: true })
      // Also set a timeout as backup
      setTimeout(callOnce, duration * 1000 + 50) // Add 50ms buffer
    }
    return { source: oscillator, gainNode }
  } catch (e) {
    console.error('AudioContext error:', e)
    if (onEnded) setTimeout(onEnded, 0)
    return null
  }
}

function playNextNarrated() {
  if (narratedSoundQueue.length === 0) {
    isNarratedPlaying = false
    return
  }
  isNarratedPlaying = true
  const { eventName, volume, throttleSeconds, options } = narratedSoundQueue.shift()
  playImmediate(eventName, volume, throttleSeconds, () => {
    playNextNarrated()
  }, options)
}

export function playSound(eventName, volume = 1.0, throttleSeconds = 0, stackable = false, options = {}) {
  if (suppressAudioForAutomation) {
    return Promise.resolve(null)
  }

  if (stackable) {
    if (narratedSoundQueue.length + (isNarratedPlaying ? 1 : 0) >= MAX_NARRATED_STACK) {
      return
    }
    narratedSoundQueue.push({ eventName, volume, throttleSeconds, options })
    if (!isNarratedPlaying) {
      playNextNarrated()
    }
    return
  }

  return playImmediate(eventName, volume, throttleSeconds, undefined, options)
}

export function playPositionalSound(eventName, x, y, volume = 1.0, throttleSeconds = 0, stackable = false, options = {}) {
  if (suppressAudioForAutomation) return Promise.resolve(null)

  const { pan, volumeFactor } = calculatePositionalAudio(x, y)
  const finalVolume = volume * volumeFactor
  if (finalVolume <= 0) return Promise.resolve(null)
  options = { ...options, pan }
  return playSound(eventName, finalVolume, throttleSeconds, stackable, options)
}

// Test function for narrated sound stacking (can be called from browser console)
export function testNarratedSounds() {
  window.logger('Testing narrated sound stacking...')
  playSound('constructionStarted', 1.0, 0, true)
  playSound('constructionComplete', 1.0, 0, true)
  playSound('unitReady01', 1.0, 0, true)
  window.logger('Queued 3 narrated sounds. They should play one after another.')
}

// --- Background Music Functionality ---
export let bgMusicAudio = null
let backgroundMusicInitialized = false
let backgroundMusicLoading = false
let currentBackgroundMusicFile = null
let nextBackgroundMusicFile = null
const backgroundMusicLoadPromises = new Map()

let musicEnabled = false
let musicPaused = false
let directedState = 'normal'
let musicRequest = 0
let fadingAudio = null
let fadeTimer = null
let fadeProgress = 1
let fadeElapsed = 0
let fadeLastTick = 0
let playlistFadePending = false
let pendingMusic = null
// A manually skipped-to track plays once to its end (no loop), then the
// director's current mood resumes; a mood change replaces it earlier.
let manualTrack = false
export const MUSIC_FADE_OUT_MS = 3000
const FADE_TICK_MS = 40
const musicTrackListeners = new Set()

// Perceptually even fade-out curve. A linear amplitude ramp sounds almost
// unchanged for most of its duration and then drops off at the very end;
// ramping in decibels (to -30 dB) and tapering to true silence spreads the
// audible change across the whole fade.
export function musicFadeGain(progress) {
  const t = Math.min(1, Math.max(0, progress))
  if (t >= 1) return 0
  return Math.pow(10, (-30 * t) / 20) * (1 - t * t * t)
}

// iOS/iPadOS Safari ignores HTMLMediaElement.volume (read-only), so a volume
// ramp there is silent: the old track kept full volume and was then cut hard.
// Route music through a Web Audio GainNode when available so fades and the
// master volume work on every platform.
const musicGainNodes = new WeakMap()
function getMusicGain(element) {
  if (!audioContext || !element || typeof audioContext.createMediaElementSource !== 'function') return null
  let node = musicGainNodes.get(element)
  if (node === undefined) {
    try {
      const source = audioContext.createMediaElementSource(element)
      const gain = audioContext.createGain()
      // Start silent; setMusicLevel ramps to the real level (no full-volume blip).
      gain.gain.value = 0
      source.connect(gain)
      gain.connect(audioContext.destination)
      element.volume = 1
      node = gain
    } catch (error) {
      window.logger.warn('Music gain routing unavailable, using element volume:', error)
      node = null
    }
    musicGainNodes.set(element, node)
  }
  return node
}

// Narration (story intro) ducks the music instead of stopping it.
let musicDuck = 1

let duckRampTimer = null

function stopDuckRamp() {
  clearInterval(duckRampTimer)
  duckRampTimer = null
}

export function setMusicDuck(factor = 1) {
  stopDuckRamp()
  const next = Number.isFinite(factor) ? Math.max(0, Math.min(1, factor)) : 1
  if (next === musicDuck) return
  musicDuck = next
  applyMusicVolumes()
}

// Smoothly moves the duck to `target` over `durationMs` (smoothstep curve),
// following live master/balance changes because each step re-applies levels.
export function rampMusicDuck(target = 1, durationMs = 7000, now = () => Date.now()) {
  stopDuckRamp()
  const from = musicDuck
  const to = Number.isFinite(target) ? Math.max(0, Math.min(1, target)) : 1
  const start = now()
  if (!(durationMs > 0)) {
    musicDuck = to
    applyMusicVolumes()
    return
  }
  duckRampTimer = setInterval(() => {
    const t = Math.min(1, (now() - start) / durationMs)
    const eased = t * t * (3 - 2 * t)
    musicDuck = from + (to - from) * eased
    applyMusicVolumes()
    if (t >= 1) stopDuckRamp()
  }, 50)
}

export function getMusicDuck() {
  return musicDuck
}

function setMusicLevel(element, level) {
  if (!element) return
  const value = Math.max(0, Math.min(1, level * getMusicVolume() * musicDuck))
  const gain = getMusicGain(element)
  if (gain) {
    const now = audioContext.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setTargetAtTime(value, now, 0.015)
    element.volume = 1
  } else {
    element.volume = value
  }
}

function resumeMusicContext() {
  if (audioContext && audioContext.state === 'suspended' && !musicPaused) {
    audioContext.resume().catch(() => {})
  }
}

function notifyMusicTrack() {
  musicTrackListeners.forEach(listener => {
    try { listener() } catch (error) { window.logger.warn('Music track listener failed:', error) }
  })
}

export function onMusicTrackChange(listener) {
  musicTrackListeners.add(listener)
  return () => musicTrackListeners.delete(listener)
}

export function isMusicEnabled() {
  return musicEnabled
}

export function getMusicTrackTitle(file) {
  return MUSIC_TRACK_TITLES[file] || (file ? file.replace(/\.mp3$/, '') : '')
}

export function getCurrentMusicTitle() {
  return getMusicTrackTitle(currentBackgroundMusicFile || pickBackgroundMusicFile(backgroundMusicFiles, null))
}

// Text for the custom tooltip on the sidebar music buttons.
export function getMusicTooltipText(kind = 'toggle') {
  const playingFile = pendingMusic?.file || currentBackgroundMusicFile
  if (kind === 'next') {
    const next = getMusicTrackTitle(getNextSkipTrack(playingFile))
    return musicEnabled && playingFile
      ? `Now playing: ${getMusicTrackTitle(playingFile)} · Next: ${next}`
      : `Play next song: ${next}`
  }
  return musicEnabled && playingFile
    ? `Now playing: ${getMusicTrackTitle(playingFile)}`
    : 'Music off'
}

function stopMusicFade() {
  clearInterval(fadeTimer)
  fadeTimer = null
  fadingAudio = null
  pendingMusic = null
  fadeProgress = 1
  applyMusicVolumes()
}

function applyMusicVolumes() {
  // Only one music element is ever audible: the outgoing track while it fades
  // out, otherwise the current track at full (master) volume.
  if (bgMusicAudio) setMusicLevel(bgMusicAudio, fadingAudio === bgMusicAudio ? fadeProgress : 1)
}

// Sequential transition: the outgoing track fades out completely and stops;
// only then does the incoming track start, at full volume with no fade-in.
function finishMusicFade() {
  const outgoing = fadingAudio
  const next = pendingMusic
  clearInterval(fadeTimer)
  fadeTimer = null
  fadingAudio = null
  pendingMusic = null
  fadeProgress = 1
  if (outgoing) outgoing.pause()
  if (!next || !musicEnabled || musicPaused) {
    applyMusicVolumes()
    return
  }
  const { element, file, state, manual } = next
  if (outgoing && outgoing !== element) setMusicLevel(outgoing, 1)
  element.currentTime = 0
  manualTrack = Boolean(manual)
  element.loop = !manualTrack && state !== 'normal'
  bgMusicAudio = element
  currentBackgroundMusicFile = file
  applyMusicVolumes()
  resumeMusicContext()
  element.play().catch(error => window.logger.warn('Situational music unavailable:', error))
  if (state === 'normal' && !manualTrack) preloadNextBackgroundMusic()
  notifyMusicTrack()
}

function tickMusicFade() {
  const now = Date.now()
  const dt = Math.min(250, Math.max(0, now - fadeLastTick))
  fadeLastTick = now
  if (musicPaused || !musicEnabled) return
  fadeElapsed += dt
  fadeProgress = musicFadeGain(fadeElapsed / MUSIC_FADE_OUT_MS)
  applyMusicVolumes()
  if (fadeElapsed >= MUSIC_FADE_OUT_MS) finishMusicFade()
}

function startMusicFadeOut() {
  fadingAudio = bgMusicAudio
  fadeProgress = 1
  fadeElapsed = 0
  fadeLastTick = Date.now()
  applyMusicVolumes()
  // Audio-only wall-clock ramp over the full MUSIC_FADE_OUT_MS; the clock
  // freezes while the game is paused. Selection uses simulation time.
  fadeTimer = setInterval(tickMusicFade, FADE_TICK_MS)
}

// Queue `file` as the next track: fade the audible one out first, or start
// straight away when nothing is playing.
function queueMusicTransition(element, file, state, manual) {
  pendingMusic = { element, file, state, manual }
  // A fade already in progress keeps going; only its successor is replaced.
  if (fadeTimer) return
  if (bgMusicAudio && !bgMusicAudio.paused) startMusicFadeOut()
  else finishMusicFade()
}

export async function updateDirectedMusic(state, advancePlaylist = false) {
  if (suppressAudioForAutomation || !musicEnabled || musicPaused || !bgMusicAudio || (state === directedState && !advancePlaylist)) return
  const request = ++musicRequest
  const file = MUSIC_TRACKS[state] || pickBackgroundMusicFile(backgroundMusicFiles, currentBackgroundMusicFile)
  try {
    const element = await loadBackgroundMusicElement(file)
    if (request !== musicRequest || !musicEnabled || musicPaused) return
    directedState = state
    queueMusicTransition(element, file, state, false)
  } catch (error) {
    window.logger.warn('Situational music unavailable:', error)
  }
}

// Manual "next song": walks MUSIC_SKIP_ORDER deterministically, independent of
// the game mood. Turns music on if it was off. Uses the same full fade-out.
export async function skipToNextMusic() {
  if (suppressAudioForAutomation) return null
  if (!backgroundMusicInitialized && !backgroundMusicLoading) await initBackgroundMusic()
  const file = getNextSkipTrack(pendingMusic?.file || currentBackgroundMusicFile)
  if (!musicEnabled) {
    musicEnabled = true
    rememberMusicUserChoice(false)
    if (bgMusicAudio && !bgMusicAudio.paused) bgMusicAudio.pause()
  }
  resumeMusicContext()
  const request = ++musicRequest
  try {
    const element = await loadBackgroundMusicElement(file)
    if (request !== musicRequest || !musicEnabled || musicPaused) return file
    queueMusicTransition(element, file, directedState, true)
  } catch (error) {
    window.logger.warn('Next music track unavailable:', error)
  }
  notifyMusicTrack()
  return file
}

export { MUSIC_SKIP_ORDER }

// --- Shared audio unlock (story intro narration) ---
// Browsers (iOS Safari above all) only allow audio after a user gesture, and
// iOS checks that per HTMLAudioElement. Narration therefore plays as decoded
// AudioBuffers through the one shared AudioContext: once that context has been
// resumed inside a gesture, every later clip plays without another gesture.
const narrationBufferCache = new Map()

export function getSharedAudioContext() {
  return audioContext
}

// True once the page has had a user gesture (or when the browser cannot tell).
export function hasUserActivation() {
  const activation = typeof navigator !== 'undefined' ? navigator.userActivation : null
  if (!activation) return audioContext ? audioContext.state === 'running' : false
  return Boolean(activation.hasBeenActive)
}

// Narration (Web Audio buffers) can play once the shared context runs, or will
// run as soon as resume() settles after an earlier gesture.
export function isAudioUnlocked() {
  if (!audioContext) return false
  return audioContext.state === 'running' || hasUserActivation()
}

// Call synchronously from a gesture handler (pointerdown/keydown/click).
// Resumes the context and plays one silent sample, which is what WebKit needs
// to treat the context as user-unlocked.
export function unlockAudioContext() {
  if (!audioContext) return Promise.resolve(false)
  let resumed = Promise.resolve()
  try {
    if (audioContext.state !== 'running') resumed = audioContext.resume()
    const silent = audioContext.createBuffer(1, 1, Math.max(8000, audioContext.sampleRate || 22050))
    const source = audioContext.createBufferSource()
    source.buffer = silent
    source.connect(audioContext.destination)
    source.start(0)
  } catch {
    // An unlock attempt outside a gesture may throw on old engines; harmless.
  }
  return Promise.resolve(resumed)
    .then(() => audioContext.state === 'running')
    .catch(() => false)
}

export function loadNarrationBuffer(url) {
  if (!audioContext || !url) return Promise.resolve(null)
  if (!narrationBufferCache.has(url)) {
    const promise = loadAudioBuffer(url).catch(error => {
      narrationBufferCache.delete(url)
      window.logger?.warn?.('Narration clip unavailable:', error)
      return null
    })
    narrationBufferCache.set(url, promise)
  }
  return narrationBufferCache.get(url)
}

// Plays a decoded narration clip at `volume` (already including master volume)
// from `offsetSeconds`. Returns a handle with stop(), or null when it cannot play.
// `volume` is relative (narration gain); the master volume and the effects
// side of the balance are applied here and follow live slider changes.
const liveNarration = new Set()
function narrationGainValue(entry) {
  return Math.max(0, Math.min(1, entry.volume * getEffectsVolume()))
}

// One narration gain chain for every narrator (story intro and tutorial):
// AudioContext gain = NARRATION_GAIN x master x effects side of the balance,
// applied live. iOS ignores HTMLMediaElement.volume, so element-based clips
// are routed through the same Web Audio gain when the context runs.
export const NARRATION_GAIN = 1

export function getNarrationVolume(relative = NARRATION_GAIN) {
  return Math.max(0, Math.min(1, relative * getEffectsVolume()))
}

const routedNarrationElements = new WeakMap()
export function routeNarrationElement(element, relative = NARRATION_GAIN) {
  if (!element) return false
  const existing = routedNarrationElements.get(element)
  if (existing) {
    existing.volume = relative
    existing.gain.gain.value = narrationGainValue(existing)
    liveNarration.add(existing)
    return true
  }
  if (!audioContext || audioContext.state !== 'running' || typeof audioContext.createMediaElementSource !== 'function') {
    element.volume = getNarrationVolume(relative)
    return false
  }
  try {
    const source = audioContext.createMediaElementSource(element)
    const gain = audioContext.createGain()
    source.connect(gain)
    gain.connect(audioContext.destination)
    element.volume = 1
    const entry = { gain, volume: relative }
    gain.gain.value = narrationGainValue(entry)
    routedNarrationElements.set(element, entry)
    liveNarration.add(entry)
    const release = () => liveNarration.delete(entry)
    element.addEventListener?.('ended', release)
    element.addEventListener?.('pause', release)
    return true
  } catch {
    element.volume = getNarrationVolume(relative)
    return false
  }
}

export function playNarrationBuffer(buffer, { volume = 1, offsetSeconds = 0, onEnded } = {}) {
  if (!audioContext || !buffer || audioContext.state !== 'running') return null
  try {
    const source = audioContext.createBufferSource()
    const gain = audioContext.createGain()
    source.buffer = buffer
    const entry = { gain, volume }
    liveNarration.add(entry)
    source.addEventListener('ended', () => liveNarration.delete(entry), { once: true })
    gain.gain.value = narrationGainValue(entry)
    source.connect(gain)
    gain.connect(audioContext.destination)
    if (onEnded) source.addEventListener('ended', onEnded, { once: true })
    const offset = Math.max(0, Math.min(offsetSeconds, Math.max(0, buffer.duration - 0.05)))
    source.start(0, offset)
    return {
      source,
      gain,
      stop() {
        liveNarration.delete(entry)
        try { source.stop() } catch { /* already stopped */ }
        try { gain.disconnect() } catch { /* ignore */ }
      }
    }
  } catch (error) {
    window.logger?.warn?.('Narration playback failed:', error)
    return null
  }
}

function applyNarrationVolumes() {
  liveNarration.forEach(entry => {
    try { entry.gain.gain.value = narrationGainValue(entry) } catch { /* node gone */ }
  })
}

export function getMusicDebugState() {
  return {
    mixBalance,
    musicVolume: getMusicVolume(),
    effectsVolume: getEffectsVolume(),
    enabled: musicEnabled,
    paused: musicPaused,
    pauseExempt: musicPauseExempt,
    file: currentBackgroundMusicFile,
    elementPaused: bgMusicAudio ? bgMusicAudio.paused : null,
    duck: musicDuck,
    masterVolume,
    gain: bgMusicAudio && musicGainNodes.get(bgMusicAudio) ? musicGainNodes.get(bgMusicAudio).gain.value : null,
    contextState: audioContext ? audioContext.state : 'none'
  }
}

// --- Story cues (first-launch intro and first gameplay) ---
// The user's explicit "music off" choice is remembered so automatic cues never
// override it; everything else about playback (master volume, narration duck,
// Web Audio gain, 3 s sequential fade-out) goes through the normal path.
export const MUSIC_USER_OFF_STORAGE_KEY = 'cfb-music-user-off'
export const FIRST_GAMEPLAY_MUSIC_STORAGE_KEY = 'cfb-first-gameplay-music-v1'
export const STORY_INTRO_MUSIC_FILE = MUSIC_TRACKS.firstAttack
export const FIRST_GAMEPLAY_MUSIC_FILE = 'music02.mp3'
let musicPauseExempt = false

export function isMusicUserDisabled() {
  try {
    return getStoredItem(MUSIC_USER_OFF_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function rememberMusicUserChoice(off) {
  try {
    setStoredItem(MUSIC_USER_OFF_STORAGE_KEY, off ? 'true' : 'false')
  } catch {
    // Storage unavailable: the choice only lasts for this session.
  }
}

// While the story intro holds the game paused, the pause handler must not
// silence its background music (or suspend the audio context it plays through).
export function setMusicPauseExempt(exempt) {
  musicPauseExempt = Boolean(exempt)
  if (musicPauseExempt && musicPaused) {
    musicPaused = false
    resumeMusicContext()
  }
}

// Queue a specific track as a one-off cue: it plays once to its end (or until a
// mood change), after which the director's current mood resumes. Turns music
// on unless the user explicitly switched it off.
export async function playMusicCue(file) {
  if (suppressAudioForAutomation || !file) return false
  if (isMusicUserDisabled()) return false
  // The cue itself becomes the current track, so there is no need to wait for
  // a random playlist track first (on iOS that wait never ends before a
  // gesture, because media elements do not preload until then).
  if (!backgroundMusicInitialized && !backgroundMusicLoading) backgroundMusicInitialized = true
  if (!musicEnabled) {
    musicEnabled = true
    if (bgMusicAudio && !bgMusicAudio.paused) bgMusicAudio.pause()
  }
  resumeMusicContext()
  const request = ++musicRequest
  try {
    const element = await loadBackgroundMusicElement(file)
    if (request !== musicRequest || !musicEnabled || musicPaused) return false
    queueMusicTransition(element, file, directedState, true)
    notifyMusicTrack()
    return true
  } catch (error) {
    window.logger.warn('Music cue unavailable:', error)
    return false
  }
}

// Call synchronously inside a user gesture. iOS only lets an HTMLAudioElement
// play later (outside a gesture) once play() was called on it during one, and it
// does not even preload media before that. Plays the cue element muted and
// pauses it again straight away, so the real cue can start whenever it is due.
const primedMusicElements = new WeakSet()
export function primeMusicElementInGesture(file) {
  if (suppressAudioForAutomation || !file || isMusicUserDisabled()) return false
  const musicPath = 'sound/music/' + file
  let element = soundElementCache.get(musicPath)
  if (!element) {
    loadBackgroundMusicElement(file).catch(() => {})
    element = soundElementCache.get(musicPath) || backgroundMusicLoadPromises.get(musicPath)?.element
  }
  if (!element || !element.paused || primedMusicElements.has(element)) return false
  primedMusicElements.add(element)
  try {
    const wasMuted = element.muted
    element.muted = true
    const playing = element.play()
    const restore = () => {
      if (element !== bgMusicAudio || !musicEnabled) element.pause()
      element.muted = wasMuted
    }
    if (playing && typeof playing.then === 'function') playing.then(restore, () => {
      element.muted = wasMuted
      primedMusicElements.delete(element)
    })
    else restore()
    return true
  } catch {
    return false
  }
}

export function isMusicFilePlaying(file) {
  if (pendingMusic) return pendingMusic.file === file
  return Boolean(musicEnabled && bgMusicAudio && !bgMusicAudio.paused && currentBackgroundMusicFile === file)
}

export function hasPlayedFirstGameplayMusic() {
  try {
    return getStoredItem(FIRST_GAMEPLAY_MUSIC_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

// Battle Track 02 opens the very first gameplay session, once per device.
export async function playFirstGameplayMusic() {
  if (hasPlayedFirstGameplayMusic()) return false
  const started = await playMusicCue(FIRST_GAMEPLAY_MUSIC_FILE)
  if (started) {
    try {
      setStoredItem(FIRST_GAMEPLAY_MUSIC_STORAGE_KEY, 'true')
    } catch {
      // Without storage it may play again next launch; harmless.
    }
  }
  return started
}

// Called from the first gesture of each session, including return visits.
export async function playDefaultGameplayMusic() {
  if (suppressAudioForAutomation || isMusicUserDisabled() || musicEnabled) return false
  const firstSession = !hasPlayedFirstGameplayMusic()
  const file = firstSession ? FIRST_GAMEPLAY_MUSIC_FILE : pickBackgroundMusicFile(backgroundMusicFiles)
  primeMusicElementInGesture(file)
  return firstSession ? playFirstGameplayMusic() : playMusicCue(file)
}


// Pick a random track, avoiding an immediate repeat when more than one exists.
// Music is local presentation only, so it uses Math.random and never advances
// the lockstep game PRNG (track changes happen at different times per peer).
export function pickBackgroundMusicFile(files, previousFile = null, random = Math.random) {
  if (!Array.isArray(files) || files.length === 0) return null
  const candidates = files.length > 1 ? files.filter(file => file !== previousFile) : files
  const pool = candidates.length > 0 ? candidates : files
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
}

// Load (once) and cache the Audio element for a music file
function loadBackgroundMusicElement(file) {
  const musicPath = 'sound/music/' + file
  const cached = soundElementCache.get(musicPath)
  if (cached) return Promise.resolve(cached)
  const pending = backgroundMusicLoadPromises.get(musicPath)
  if (pending) return pending

  const element = new Audio(musicPath)
  configureAudioElement(element, musicPath, window.location.origin)
  element.preload = 'auto'
  element.loop = false // the playlist picks the next track on 'ended'
  element.volume = getMusicVolume()

  const loadPromise = new Promise((resolve, reject) => {
    const onLoad = () => {
      element.removeEventListener('canplaythrough', onLoad)
      element.removeEventListener('error', onError)
      resolve()
    }
    const onError = (e) => {
      element.removeEventListener('canplaythrough', onLoad)
      element.removeEventListener('error', onError)
      reject(e)
    }

    element.addEventListener('canplaythrough', onLoad, { once: true })
    element.addEventListener('error', onError, { once: true })
    element.load() // Only load once here
  }).then(() => {
    element.addEventListener('ended', handleBackgroundMusicEnded)
    element.addEventListener('timeupdate', () => {
      if (element !== bgMusicAudio || (directedState !== 'normal' && !manualTrack) || element.loop ||
          !musicEnabled || musicPaused || fadeTimer || playlistFadePending ||
          !Number.isFinite(element.duration) ||
          element.duration - element.currentTime > MUSIC_FADE_OUT_MS / 1000 + 0.25 ||
          element.duration <= element.currentTime) return
      // Start the fade early enough that it completes before the track ends.
      playlistFadePending = true
      updateDirectedMusic(directedState, true).finally(() => { playlistFadePending = false })
    })
    soundElementCache.set(musicPath, element)
    window.logger(`Background music ${file} loaded and cached`)
    return element
  }).finally(() => {
    backgroundMusicLoadPromises.delete(musicPath)
  })
  loadPromise.element = element

  backgroundMusicLoadPromises.set(musicPath, loadPromise)
  return loadPromise
}

// Choose the following track now and warm its cache so the switch is gapless
function preloadNextBackgroundMusic() {
  nextBackgroundMusicFile = pickBackgroundMusicFile(backgroundMusicFiles, currentBackgroundMusicFile)
  if (!nextBackgroundMusicFile || nextBackgroundMusicFile === currentBackgroundMusicFile) return
  loadBackgroundMusicElement(nextBackgroundMusicFile).catch(e => {
    window.logger.warn('Error preloading next background music:', e)
  })
}

async function handleBackgroundMusicEnded(event) {
  const endedElement = event?.target
  if (endedElement && endedElement === fadingAudio) {
    finishMusicFade()
    return
  }
  if (endedElement && endedElement === bgMusicAudio && manualTrack && musicEnabled && !musicPaused) {
    // Manual pick finished: hand control back to the director's current mood.
    manualTrack = false
    updateDirectedMusic(directedState, true)
    return
  }
  if (suppressAudioForAutomation || !musicEnabled || musicPaused || directedState !== 'normal' || !endedElement || endedElement !== bgMusicAudio) return

  const file = nextBackgroundMusicFile || pickBackgroundMusicFile(backgroundMusicFiles, currentBackgroundMusicFile)
  let element = endedElement
  try {
    if (file && file !== currentBackgroundMusicFile) {
      element = await loadBackgroundMusicElement(file)
    }
  } catch (e) {
    window.logger.warn('Error loading next background music, replaying current track:', e)
    element = endedElement
  }

  // Music was reset or replaced while the next track loaded
  if (bgMusicAudio !== endedElement || !musicEnabled || musicPaused) return

  if (element !== endedElement && !endedElement.paused) {
    endedElement.pause()
  }
  element.currentTime = 0
  bgMusicAudio = element
  setMusicLevel(element, 1)
  if (element !== endedElement) currentBackgroundMusicFile = file
  preloadNextBackgroundMusic()
  notifyMusicTrack()

  try {
    await element.play()
    window.logger(`Background music playing next track: ${currentBackgroundMusicFile}`)
  } catch (e) {
    console.error('Error playing next background music track:', e)
  }
}

export async function initBackgroundMusic() {
  if (suppressAudioForAutomation) return

  if (bgMusicAudio && backgroundMusicInitialized) return
  if (backgroundMusicLoading) {
    // Already loading, wait for it to complete
    while (backgroundMusicLoading) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return
  }
  if (!backgroundMusicFiles || backgroundMusicFiles.length === 0) return

  backgroundMusicLoading = true
  window.logger('Loading background music on demand...')

  const file = pickBackgroundMusicFile(backgroundMusicFiles, currentBackgroundMusicFile)

  try {
    // Use the cached element directly (no cloning for background music)
    bgMusicAudio = await loadBackgroundMusicElement(file)
    currentBackgroundMusicFile = file
    setMusicLevel(bgMusicAudio, 1) // Ensure volume is correct
    preloadNextBackgroundMusic()
  } catch (e) {
    console.error('Error loading background music:', e)
  } finally {
    backgroundMusicLoading = false
    backgroundMusicInitialized = true
  }
}

export async function toggleBackgroundMusic() {
  if (suppressAudioForAutomation) return

  // Initialize music on first toggle (loads from server once)
  if (!bgMusicAudio && !backgroundMusicLoading) {
    await initBackgroundMusic()
  }

  if (bgMusicAudio) {
    if (!musicEnabled) {
      musicEnabled = true
      rememberMusicUserChoice(false)
      resumeMusicContext()
      try {
        if (!musicPaused) {
          await bgMusicAudio.play()
        }
        window.logger('Background music resumed from cache')
      } catch (e) {
        console.error('Error resuming background music:', e)
      }
    } else {
      musicEnabled = false
      rememberMusicUserChoice(true)
      musicRequest++
      stopMusicFade()
      bgMusicAudio.pause()
      window.logger('Background music paused')
    }
  }
  notifyMusicTrack()
}

// --- Game Pause/Resume Helpers ---
// Immediately stop all active audio sources from the current session.
export function terminateAllSounds() {
  musicEnabled = false
  musicRequest++
  stopMusicFade()
  manualTrack = false
  directedState = 'normal'
  resetMusicDirector()
  backgroundMusicInitialized = false
  bgMusicAudio?.pause()
  if (bgMusicAudio) bgMusicAudio.currentTime = 0
  activeAudioElements.forEach(source => {
    if (!source) return
    try {
      source.stop()
    } catch (e) {
      window.logger.warn('Error stopping active sound source:', e)
    }
  })
  activeAudioElements.clear()

  narratedSoundQueue.length = 0
  isNarratedPlaying = false

  if (bgMusicAudio) {
    try {
      bgMusicAudio.pause()
      bgMusicAudio.currentTime = 0
    } catch (e) {
      window.logger.warn('Error terminating background music:', e)
    }
  }

  if (videoOverlay) {
    try {
      if (typeof videoOverlay.stopCurrentVideo === 'function') {
        videoOverlay.stopCurrentVideo()
      }
      if (typeof videoOverlay.clearQueue === 'function') {
        videoOverlay.clearQueue()
      }
    } catch (e) {
      window.logger.warn('Error terminating video overlay audio:', e)
    }
  }
}

// Pause all currently playing audio including background music and looped sounds
export function pauseAllSounds() {
  // The story intro pauses the simulation but keeps its music playing.
  if (musicPauseExempt) return
  musicPaused = true
  musicRequest++
  if (bgMusicAudio && !bgMusicAudio.paused) {
    try {
      bgMusicAudio.pause()
    } catch (e) {
      window.logger.warn('Error pausing background music:', e)
    }
  }

  if (audioContext && audioContext.state === 'running') {
    audioContext.suspend().catch(e => {
      window.logger.warn('Failed to suspend audio context:', e)
    })
  }
}

// Resume playback after game unpause
export function resumeAllSounds() {
  musicPaused = false
  if (suppressAudioForAutomation) return

  if (musicEnabled && bgMusicAudio && bgMusicAudio.paused) {
    bgMusicAudio.play().catch(e => {
      window.logger.warn('Error resuming background music:', e)
    })
  }

  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(e => {
      window.logger.warn('Failed to resume audio context:', e)
    })
  }
}

// --- Master Volume Control Functions ---
export function setMasterVolume(volume) {
  masterVolume = Math.max(0, Math.min(1, volume)) // Clamp between 0 and 1

  // Save to browser storage
  saveVolumeToStorage(masterVolume)

  // Update background music volume if it exists
  if (bgMusicAudio) {
    applyMusicVolumes()
  }

  // Update video audio volume if video overlay is available
  if (videoOverlay && typeof videoOverlay.updateAudioVolume === 'function') {
    videoOverlay.updateAudioVolume()
  }
  applyNarrationVolumes()
  notifyAudioVolume()
}

export function setMixBalance(balance) {
  const next = Number(balance)
  mixBalance = Number.isFinite(next) ? Math.max(0, Math.min(100, next)) : DEFAULT_MIX_BALANCE
  try {
    setStoredItem(MIX_BALANCE_STORAGE_KEY, String(mixBalance))
  } catch {
    // Storage unavailable: the balance lasts for this session.
  }
  if (bgMusicAudio) applyMusicVolumes()
  applyNarrationVolumes()
  if (videoOverlay && typeof videoOverlay.updateAudioVolume === 'function') {
    videoOverlay.updateAudioVolume()
  }
  notifyAudioVolume()
  return mixBalance
}

export function getMasterVolume() {
  return masterVolume
}

// Keep API compatibility while enforcing lazy-loading behavior.
// All sounds are fetched only when first played.
export async function preloadSounds() {
  window.logger('Skipping sound preloading; all audio assets load on demand')
}

// Get cache status for debugging
export function getSoundCacheStatus() {
  const bufferCacheSize = audioBufferCache.size
  const elementCacheSize = soundElementCache.size
  const loadingCount = loadingPromises.size
  const cachedBuffers = Array.from(audioBufferCache.keys())
  const cachedElements = Array.from(soundElementCache.keys())

  window.logger('Sound cache status:')
  window.logger(`- Audio buffers cached: ${bufferCacheSize} (sound effects)`)
  window.logger(`- Audio elements cached: ${elementCacheSize} (background music)`)
  window.logger(`- Background music initialized: ${backgroundMusicInitialized}`)
  window.logger(`- Background music loading: ${backgroundMusicLoading}`)
  window.logger(`- Currently loading: ${loadingCount}`)
  window.logger('- Buffer cache contents:', cachedBuffers)
  window.logger('- Element cache contents:', cachedElements)

  return {
    bufferCacheSize,
    elementCacheSize,
    loadingCount,
    cachedBuffers,
    cachedElements,
    backgroundMusicInitialized,
    backgroundMusicLoading
  }
}

// Clear cache (for testing/debugging)
export function clearSoundCache() {
  musicEnabled = false
  musicPaused = false
  musicRequest++
  stopMusicFade()
  manualTrack = false
  directedState = 'normal'
  resetMusicDirector()
  window.logger(`Clearing sound cache (${audioBufferCache.size} buffers, ${soundElementCache.size} elements)...`)
  audioBufferCache.clear()
  soundElementCache.clear()
  loadingPromises.clear()

  // Reset background music state
  backgroundMusicInitialized = false
  backgroundMusicLoading = false
  currentBackgroundMusicFile = null
  nextBackgroundMusicFile = null
  if (bgMusicAudio) {
    bgMusicAudio.pause()
    bgMusicAudio = null
  }

  window.logger('Sound cache cleared, background music reset')
}

// Export the audio context for other modules that need direct access
// Pause/resume helpers are already exported above with their function
// declarations, so exporting them again would cause a duplicate export error.
export { audioContext }
