import { gameState } from '../gameState.js'
import { getStoredItem, setStoredItem } from '../storage/indexedDbStorage.js'
import {
  STORY_IMAGE,
  STORY_SEGMENTS,
  STORY_SEGMENT_GAP_MS,
  focusTransform
} from './storyIntroSegments.js'

export const STORY_INTRO_STORAGE_KEY = 'cfb-story-intro-v1'
// Music level under the narration, relative to the normal music volume.
export const STORY_INTRO_MUSIC_DUCK = 0.35
export const STORY_INTRO_VOICE_GAIN = 0.9
export const STORY_INTRO_CLOSED_EVENT = 'story-intro-closed'
// Late clips (still decoding) join their segment mid-way, unless almost over.
const LATE_CLIP_MAX_SECONDS = 1.5

let active = null

function defaultDeps() {
  return {
    // Narration goes through one shared, gesture-unlocked AudioContext (see
    // storyIntroBoot.js). Without one the intro simply runs silently.
    loadClip: () => Promise.resolve(null),
    playClip: () => null,
    isAudioUnlocked: () => false,
    hasUserActivation: () => false,
    unlockAudio: () => Promise.resolve(false),
    getVolume: () => 1,
    setDuck: () => {},
    setAudioHold: () => {},
    startMusic: () => {},
    endMusic: () => {},
    log: () => {},
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: id => clearTimeout(id)
  }
}

export function getStoryIntroStatus() {
  try {
    return getStoredItem(STORY_INTRO_STORAGE_KEY) || null
  } catch {
    return null
  }
}

function rememberStatus(status) {
  try {
    setStoredItem(STORY_INTRO_STORAGE_KEY, status)
  } catch {
    // Storage may be unavailable (private mode); the intro just shows again.
  }
}

// Automatic first-play intro rules. Automation (Playwright, Lighthouse) and
// remote multiplayer clients never get the overlay unless it is forced with
// ?storyIntro=1, so existing E2E flows keep their first frame.
export function shouldAutoPlayStoryIntro(env = {}) {
  const search = env.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const params = new URLSearchParams(search)
  if (params.get('storyIntro') === '0') return false
  if (params.get('storyIntro') === '1') return true
  const webdriver = env.webdriver ?? (typeof navigator !== 'undefined' && navigator.webdriver)
  if (webdriver) return false
  if (env.remote ?? gameState?.multiplayerSession?.isRemote) return false
  const status = env.status !== undefined ? env.status : getStoryIntroStatus()
  return !status
}

export function isStoryIntroOpen() {
  return Boolean(active?.root?.isConnected)
}

function buildRoot(doc) {
  const root = doc.createElement('div')
  root.id = 'story-intro'
  root.className = 'story-intro'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'The Global Herald: how the war began')
  root.innerHTML = `
    <div class="story-intro__stage">
      <img class="story-intro__paper" src="${STORY_IMAGE.src}" width="${STORY_IMAGE.width}" height="${STORY_IMAGE.height}" alt="Newspaper front page: War erupts over mysterious blue crystals" draggable="false">
    </div>
    <div class="story-intro__hud">
      <p class="story-intro__caption" aria-live="polite"></p>
      <div class="story-intro__bar">
        <div class="story-intro__progress" aria-hidden="true"><span></span></div>
        <button type="button" class="story-intro__skip">Skip intro</button>
      </div>
    </div>
  `
  return root
}

function applyCamera(state, segment, instant = false) {
  const stage = state.root.querySelector('.story-intro__stage')
  const paper = state.root.querySelector('.story-intro__paper')
  const width = stage.clientWidth || state.win.innerWidth || 1280
  const height = stage.clientHeight || state.win.innerHeight || 720
  const { scale, tx, ty } = focusTransform(segment.focus, width, height)
  paper.style.transitionDuration = instant ? '0ms' : ''
  paper.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${scale.toFixed(4)})`
}

function stopVoice(state) {
  state.voiceToken += 1
  if (!state.voice) return
  try {
    state.voice.stop()
  } catch {
    // Teardown errors are irrelevant once the clip is replaced.
  }
  state.voice = null
}

// Plays the current segment's clip on the shared unlocked context. A clip that
// is still decoding starts late, offset to the time already elapsed.
function playVoice(state, segment, index) {
  stopVoice(state)
  if (!state.audioStarted) {
    state.deps.log({ event: 'segment-silent', segment: segment.id, reason: 'audio-locked' })
    return
  }
  const token = state.voiceToken
  const segmentStart = state.segmentStartedAt
  Promise.resolve(state.deps.loadClip(segment.audio)).then(clip => {
    if (state.closed || token !== state.voiceToken || state.index !== index) return
    if (!clip) {
      state.deps.log({ event: 'segment-silent', segment: segment.id, reason: 'clip-unavailable' })
      return
    }
    const offsetSeconds = Math.max(0, (state.deps.now() - segmentStart) / 1000)
    if (offsetSeconds > LATE_CLIP_MAX_SECONDS && offsetSeconds * 1000 > segment.durationMs - 1500) {
      state.deps.log({ event: 'segment-silent', segment: segment.id, reason: 'clip-too-late' })
      return
    }
    const volume = Math.max(0, Math.min(1, state.deps.getVolume() * STORY_INTRO_VOICE_GAIN))
    const handle = state.deps.playClip(clip, { volume, offsetSeconds: offsetSeconds < 0.25 ? 0 : offsetSeconds })
    state.voice = handle || null
    state.deps.log({ event: handle ? 'segment-playing' : 'segment-silent', segment: segment.id, reason: handle ? undefined : 'play-failed', offsetSeconds })
  }, () => {})
}

function preloadClips(state) {
  state.segments.forEach(segment => {
    try {
      Promise.resolve(state.deps.loadClip(segment.audio)).catch(() => {})
    } catch {
      // Preloading is best effort.
    }
  })
}

function startAudio(state) {
  if (state.audioStarted || state.closed) return
  state.audioStarted = true
  state.deps.setDuck(STORY_INTRO_MUSIC_DUCK)
  state.deps.log({ event: 'audio-started' })
}

function startMusic(state) {
  if (!state.withMusic || state.closed) return
  state.musicStarted = true
  state.deps.startMusic()
}

// Audio still locked when the intro opened: the visuals keep running, and the
// first pointerdown/keydown anywhere unlocks the shared context and starts the
// narration from the current section plus the background music. That first
// tap only unlocks; it does not skip (the Skip button and Esc always skip).
// Media elements (the music) need a real user activation even where the Web
// Audio context already runs, so the gesture is awaited for those too.
function onUnlockGesture(state, event) {
  if (state.closed) return
  const isSkipButton = event?.target?.closest?.('.story-intro__skip')
  const isEscape = event?.type === 'keydown' && event.key === 'Escape'
  state.deps.unlockAudio()
  if (isSkipButton || isEscape) return
  const firstUnlock = state.needsGesture
  state.needsGesture = false
  startMusic(state)
  if (!firstUnlock) return
  if (event?.type === 'pointerdown' || event?.type === 'touchend') state.swallowStageClick = true
  state.deps.log({ event: 'gesture-unlock', restartedSegment: !state.audioStarted })
  if (state.audioStarted) return
  startAudio(state)
  if (state.index >= 0) showSegment(state, state.index)
}

function showSegment(state, index) {
  if (state.closed) return
  if (index >= state.segments.length) {
    closeStoryIntro('seen')
    return
  }
  const segment = state.segments[index]
  state.index = index
  state.root.dataset.segment = segment.id
  state.root.querySelector('.story-intro__caption').textContent = segment.caption
  const bar = state.root.querySelector('.story-intro__progress span')
  if (bar) bar.style.width = `${Math.round(((index + 1) / state.segments.length) * 100)}%`
  applyCamera(state, segment, index === 0 && !state.started)
  state.started = true
  state.segmentStartedAt = state.deps.now()
  playVoice(state, segment, index)
  state.onSegment?.(segment, index)
  state.deps.clearTimer(state.timer)
  state.timer = state.deps.setTimer(() => showSegment(state, index + 1), segment.durationMs + state.gapMs)
}

function holdGame(state) {
  if (!gameState || gameState.gamePaused || gameState.gameOver) return
  gameState.gamePaused = true
  state.pausedGame = true
}

function releaseGame(state) {
  if (!state.pausedGame || !gameState || gameState.gameOver) return
  gameState.gamePaused = false
}

export function closeStoryIntro(status = 'skipped') {
  const state = active
  if (!state || state.closed) return false
  state.closed = true
  state.deps.clearTimer(state.timer)
  stopVoice(state)
  state.deps.setDuck(1)
  state.gestureEvents.forEach(type => state.win.removeEventListener(type, state.onGesture, true))
  try {
    state.deps.endMusic(state.withMusic, status)
    state.deps.setAudioHold(false)
  } catch {
    // Music hand-off problems must never keep the overlay open.
  }
  state.win.removeEventListener('keydown', state.onKey, true)
  state.win.removeEventListener('resize', state.onResize)
  state.root.remove()
  releaseGame(state)
  rememberStatus(status)
  active = null
  state.onClose?.(status)
  try {
    state.win.dispatchEvent(new state.win.CustomEvent(STORY_INTRO_CLOSED_EVENT, { detail: { status } }))
  } catch {
    // Older engines without CustomEvent simply miss the hand-off.
  }
  return true
}

export function playStoryIntro(options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null)
  if (!doc) return false
  if (active) closeStoryIntro('skipped')
  const win = doc.defaultView || window
  const state = {
    doc,
    win,
    deps: { ...defaultDeps(), ...(options.deps || {}) },
    segments: options.segments || STORY_SEGMENTS,
    gapMs: options.gapMs ?? STORY_SEGMENT_GAP_MS,
    onSegment: options.onSegment,
    onClose: options.onClose,
    root: buildRoot(doc),
    index: -1,
    timer: null,
    voice: null,
    voiceToken: 0,
    segmentStartedAt: 0,
    audioStarted: false,
    musicStarted: false,
    needsGesture: false,
    swallowStageClick: false,
    gestureEvents: ['pointerdown', 'keydown', 'touchend'],
    started: false,
    closed: false,
    pausedGame: false,
    withMusic: Boolean(options.withMusic)
  }
  active = state
  state.onKey = event => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    closeStoryIntro('skipped')
  }
  state.onResize = () => {
    const segment = state.segments[state.index]
    if (segment) applyCamera(state, segment, true)
  }
  state.root.querySelector('.story-intro__skip').addEventListener('click', event => {
    event.stopPropagation()
    closeStoryIntro('skipped')
  })
  // Tapping the newspaper skips the intro, except for the tap that unlocked
  // the audio (see onUnlockGesture).
  state.root.querySelector('.story-intro__stage').addEventListener('click', () => {
    if (state.swallowStageClick) {
      state.swallowStageClick = false
      return
    }
    closeStoryIntro('skipped')
  })
  state.onGesture = event => onUnlockGesture(state, event)
  state.gestureEvents.forEach(type => win.addEventListener(type, state.onGesture, true))
  win.addEventListener('keydown', state.onKey, true)
  win.addEventListener('resize', state.onResize)
  doc.body.appendChild(state.root)
  // Keep the shared audio context and music alive while the game is paused.
  state.deps.setAudioHold(true)
  holdGame(state)
  preloadClips(state)
  state.deps.unlockAudio()
  if (state.deps.isAudioUnlocked()) startAudio(state)
  if (state.deps.hasUserActivation()) {
    startMusic(state)
  } else {
    state.needsGesture = true
    state.deps.log({ event: 'audio-locked', narration: state.audioStarted })
  }
  state.root.querySelector('.story-intro__skip').focus?.()
  showSegment(state, 0)
  return true
}

export function getActiveStoryIntroIndex() {
  return active ? active.index : -1
}
