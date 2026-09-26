import { gameState } from '../gameState.js'
import { localizeMission, missionText, resolveMissionLocale } from '../missions/missionText.js'

export const MISSION_INTRO_PUBLIC_DIR = 'public/video'
export const MISSION_INTRO_LOAD_TIMEOUT_MS = 2500

let queuedMission = null
let activeRoot = null
let activeAudio = null
let introPausedTheGame = false
let onKeyDown = null

export function missionIntroAssetPath(filename) {
  const name = String(filename || '').replace(/^\/+/, '')
  return `/video/${name}`
}

function setPauseIcon(paused) {
  const icon = document.getElementById('pauseBtn')?.querySelector('.play-pause-icon')
  if (icon) icon.textContent = paused ? '▶' : '⏸'
}

function holdSimulationForIntro() {
  if (!gameState || gameState.gamePaused || gameState.gameOver) return
  gameState.gamePaused = true
  introPausedTheGame = true
  setPauseIcon(true)
}

function releaseIntroPause() {
  if (!introPausedTheGame) return
  introPausedTheGame = false
  if (gameState?.gameOver) return
  gameState.gamePaused = false
  setPauseIcon(false)
}

function waitForCanPlay(media, src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('timeout'))
    }, timeoutMs)
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('error'))
    }
    const cleanup = () => {
      clearTimeout(timer)
      media.removeEventListener('canplay', onReady)
      media.removeEventListener('error', onError)
    }
    media.addEventListener('canplay', onReady, { once: true })
    media.addEventListener('error', onError, { once: true })
    media.src = src
    media.load()
  })
}

function fillCopy(root, mission) {
  const locale = resolveMissionLocale()
  const text = localizeMission(mission, locale)
  root.querySelector('.mission-intro__kicker').textContent = missionText('missions.intro.kicker', locale)
  root.querySelector('.mission-intro__title').textContent = text.label
  root.querySelector('.mission-intro__description').textContent = text.description
  root.querySelector('.mission-intro__skip').textContent = missionText('missions.intro.skip', locale)
  root.querySelector('.mission-intro__standby').textContent = missionText('missions.intro.standby', locale)
  const list = root.querySelector('.mission-intro__objectives')
  list.replaceChildren()
  text.objectives.forEach(objective => {
    const item = document.createElement('li')
    item.textContent = objective
    list.appendChild(item)
  })
}

function ensureRoot() {
  if (activeRoot?.isConnected) return activeRoot
  const root = document.createElement('div')
  root.id = 'mission-intro'
  root.className = 'mission-intro'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'mission-intro-title')
  root.innerHTML = `
    <div class="mission-intro__panel">
      <p class="mission-intro__kicker"></p>
      <h2 id="mission-intro-title" class="mission-intro__title"></h2>
      <div class="mission-intro__body">
        <div class="mission-intro__stage">
          <video class="mission-intro__video" playsinline preload="auto"></video>
          <p class="mission-intro__standby"></p>
        </div>
        <p class="mission-intro__description"></p>
        <ol class="mission-intro__objectives"></ol>
      </div>
      <div class="mission-intro__bar">
        <button type="button" class="mission-intro__skip"></button>
      </div>
    </div>
  `
  root.querySelector('.mission-intro__skip').addEventListener('click', () => {
    dismissMissionIntro()
  })
  document.body.appendChild(root)
  activeRoot = root
  return root
}

function setPresentation(root, mode) {
  root.dataset.mode = mode
  const video = root.querySelector('.mission-intro__video')
  const standby = root.querySelector('.mission-intro__standby')
  video.hidden = mode !== 'video'
  standby.hidden = mode === 'video'
}

function stopAudio() {
  if (!activeAudio) return
  try {
    activeAudio.pause()
    activeAudio.src = ''
  } catch {
    // Closing the intro should not surface a media teardown error.
  }
  activeAudio = null
}

export function isMissionIntroOpen() {
  return Boolean(activeRoot?.isConnected && !activeRoot.hidden)
}

export function dismissMissionIntro() {
  if (onKeyDown) {
    window.removeEventListener('keydown', onKeyDown, true)
    onKeyDown = null
  }
  stopAudio()
  if (activeRoot) {
    const video = activeRoot.querySelector('.mission-intro__video')
    if (video) {
      try {
        video.pause()
        video.removeAttribute('src')
        video.load()
      } catch {
        // The element is going away with the overlay.
      }
    }
    activeRoot.remove()
    activeRoot = null
  }
  releaseIntroPause()
}

async function startPicture(video) {
  video.muted = false
  try {
    await video.play()
    return
  } catch (error) {
    if (error?.name !== 'NotAllowedError') throw error
  }
  video.muted = true
  await video.play()
}

async function startCompanionAudio(filename) {
  if (!filename) return
  const audio = new Audio(missionIntroAssetPath(filename))
  audio.volume = 0.8
  activeAudio = audio
  try {
    await audio.play()
    if (activeRoot) {
      const video = activeRoot.querySelector('.mission-intro__video')
      if (video) video.muted = true
    }
  } catch {
    if (activeAudio === audio) activeAudio = null
  }
}

export function queueMissionIntro(mission) {
  if (!mission || typeof mission.introVideo !== 'string' || mission.introVideo.length === 0) {
    queuedMission = null
    return
  }
  if (gameState?.multiplayerSession?.isRemote) {
    queuedMission = null
    return
  }
  queuedMission = mission
  holdSimulationForIntro()
}

export function flushQueuedMissionIntro(options) {
  const mission = queuedMission
  queuedMission = null
  if (!mission) return Promise.resolve(false)
  return playMissionIntro(mission, options)
}

export async function playMissionIntro(mission, options = {}) {
  if (!mission || typeof mission.introVideo !== 'string' || mission.introVideo.length === 0) {
    return false
  }
  if (typeof document === 'undefined') return false
  if (gameState?.multiplayerSession?.isRemote) return false

  dismissMissionIntro()
  holdSimulationForIntro()

  const root = ensureRoot()
  fillCopy(root, mission)
  setPresentation(root, 'briefing')
  root.hidden = false

  onKeyDown = (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    dismissMissionIntro()
  }
  window.addEventListener('keydown', onKeyDown, true)
  root.querySelector('.mission-intro__skip')?.focus()

  const video = root.querySelector('.mission-intro__video')
  const timeoutMs = Number.isFinite(options.loadTimeoutMs) ? options.loadTimeoutMs : MISSION_INTRO_LOAD_TIMEOUT_MS
  const loadVideo = options.loadVideo || ((element, src) => waitForCanPlay(element, src, timeoutMs))

  try {
    await loadVideo(video, missionIntroAssetPath(mission.introVideo))
    if (!isMissionIntroOpen()) return false
    setPresentation(root, 'video')
    await startPicture(video)
    if (mission.introAudio) void startCompanionAudio(mission.introAudio)
    video.addEventListener('ended', () => {
      if (isMissionIntroOpen()) dismissMissionIntro()
    }, { once: true })
    return true
  } catch {
    if (isMissionIntroOpen()) setPresentation(root, 'briefing')
    return false
  }
}
