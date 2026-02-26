// sound.js
import { MASTER_VOLUME } from './config.js'
import { videoOverlay } from './ui/videoOverlay.js'
import { gameState } from './gameState.js'
import { gameRandom } from './utils/gameRandom.js'

let audioContext = null
try {
  audioContext = new (window.AudioContext || window.webkitAudioContext)()
} catch {
  console.error('Web Audio API is not supported.')
}

// Master volume control with localStorage persistence
const VOLUME_STORAGE_KEY = 'rts-game-master-volume'

// Load volume from localStorage or use default
function loadVolumeFromStorage() {
  try {
    const storedVolume = localStorage.getItem(VOLUME_STORAGE_KEY)
    if (storedVolume !== null) {
      const parsedVolume = parseFloat(storedVolume)
      if (!isNaN(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1) {
        return parsedVolume
      }
    }
  } catch (e) {
    window.logger.warn('Failed to load volume from localStorage:', e)
  }
  return MASTER_VOLUME // Fall back to default
}

// Save volume to localStorage
function saveVolumeToStorage(volume) {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, volume.toString())
  } catch (e) {
    window.logger.warn('Failed to save volume to localStorage:', e)
  }
}

let masterVolume = loadVolumeFromStorage()

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
  chainOfCommandsReceived: ['chainOfCommandsReceived.mp3'],

  // Looping tank drive sound
  tankDriveLoop: ['tankDrive4sLoop.mp3'],

  // Apache helicopter flight loop
  apache_fly: ['apache_fly.mp3'],

  // F22 sounds
  f22Flight: ['F22Flight.mp3'],
  f22Landing: ['F22Landing.mp3'],
  f22Takeoff: ['F22TakeOff_1.mp3', 'F22TakeOff_2.mp3'],
  f22CrashImpact: ['explosion04.mp3'],

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

// Background music files
const backgroundMusicFiles = ['music01.mp3'] // add more files as needed

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
    gainNode.gain.value = volume * masterVolume

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
    gainNode.gain.value = volume * masterVolume // Apply master volume

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

export async function initBackgroundMusic() {
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

  const file = backgroundMusicFiles[Math.floor(gameRandom() * backgroundMusicFiles.length)]
  const musicPath = 'sound/music/' + file

  try {
    // Check if already cached from a previous session
    let element = soundElementCache.get(musicPath)
    if (!element) {
      // Create and load the audio element only once
      element = new Audio(musicPath)
      element.preload = 'auto'
      element.loop = true
      element.volume = masterVolume

      // Wait for it to be ready before caching
      await new Promise((resolve, reject) => {
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
      })

      // Cache the loaded element
      soundElementCache.set(musicPath, element)
      window.logger('Background music loaded and cached successfully')
    } else {
      window.logger('Background music retrieved from cache')
    }

    // Use the cached element directly (no cloning for background music)
    bgMusicAudio = element
    bgMusicAudio.volume = masterVolume // Ensure volume is correct

  } catch (e) {
    console.error('Error loading background music:', e)
  } finally {
    backgroundMusicLoading = false
    backgroundMusicInitialized = true
  }
}

export async function toggleBackgroundMusic() {
  // Initialize music on first toggle (loads from server once)
  if (!backgroundMusicInitialized && !backgroundMusicLoading) {
    await initBackgroundMusic()
  }

  if (bgMusicAudio) {
    if (bgMusicAudio.paused) {
      try {
        await bgMusicAudio.play()
        window.logger('Background music resumed from cache')
      } catch (e) {
        console.error('Error resuming background music:', e)
      }
    } else {
      bgMusicAudio.pause()
      window.logger('Background music paused')
    }
  }
}

// --- Game Pause/Resume Helpers ---
// Pause all currently playing audio including background music and looped sounds
export function pauseAllSounds() {
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
  if (bgMusicAudio && bgMusicAudio.paused) {
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

  // Save to localStorage
  saveVolumeToStorage(masterVolume)

  // Update background music volume if it exists
  if (bgMusicAudio) {
    bgMusicAudio.volume = masterVolume
  }

  // Update video audio volume if video overlay is available
  if (videoOverlay && typeof videoOverlay.updateAudioVolume === 'function') {
    videoOverlay.updateAudioVolume()
  }
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
  window.logger(`Clearing sound cache (${audioBufferCache.size} buffers, ${soundElementCache.size} elements)...`)
  audioBufferCache.clear()
  soundElementCache.clear()
  loadingPromises.clear()

  // Reset background music state
  backgroundMusicInitialized = false
  backgroundMusicLoading = false
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
