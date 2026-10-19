import { gameState } from '../gameState.js'
import { getStoredItem, setStoredItem } from '../storage/indexedDbStorage.js'
import {
  STORY_IMAGE,
  STORY_SEGMENTS,
  STORY_SEGMENT_GAP_MS,
  focusTransform
} from './storyIntroSegments.js'

export const STORY_INTRO_STORAGE_KEY = 'cfb-story-intro-v1'
// Music remains a quiet bed for the whole narration, at 27.5% of the level
// selected by the user's master and music-balance settings.
export const STORY_INTRO_MUSIC_DUCK = 0.275
// Same relative narration gain as the tutorial (NARRATION_GAIN in sound.js).
export const STORY_INTRO_VOICE_GAIN = 1
// Bring the user's normal music level back gently only after narration ends.
export const STORY_INTRO_MUSIC_RESTORE_MS = 1500
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
    rampDuck: () => {},
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

// Every gesture during the intro re-unlocks the shared context and retries the
// music if a browser dropped it (Skip and Esc only skip).
function onIntroGesture(state, event) {
  if (state.closed || state.awaitingStart) return
  const isSkipButton = event?.target?.closest?.('.story-intro__skip')
  const isEscape = event?.type === 'keydown' && event.key === 'Escape'
  if (isSkipButton || isEscape) return
  state.deps.unlockAudio()
  startMusic(state)
}

// Audio locked when the intro opens: a centered "Start intro" button waits and
// the newspaper does not move yet, so nothing is missed. Pressing it unlocks
// the shared AudioContext and starts narration and music in that same gesture.
function beginIntro(state) {
  if (state.closed || state.started) return
  state.awaitingStart = false
  const start = state.root.querySelector('.story-intro__start')
  if (start) start.remove()
  state.root.classList.remove('story-intro--awaiting-start')
  state.deps.unlockAudio()
  startAudio(state)
  startMusic(state)
  state.deps.log({ event: 'intro-started' })
  showSegment(state, 0)
}

function showStartButton(state) {
  state.awaitingStart = true
  state.root.classList.add('story-intro--awaiting-start')
  const wrap = state.doc.createElement('div')
  wrap.className = 'story-intro__start'
  wrap.innerHTML = `
    <button type="button" class="story-intro__start-btn" aria-describedby="story-intro-start-hint">Start intro</button>
    <p class="story-intro__start-hint" id="story-intro-start-hint">How the war began: narrated briefing with music</p>
  `
  const button = wrap.querySelector('button')
  button.addEventListener('click', event => {
    event.stopPropagation()
    beginIntro(state)
  })
  wrap.addEventListener('click', event => event.stopPropagation())
  state.root.appendChild(wrap)
  state.deps.log({ event: 'awaiting-start' })
  button.focus?.()
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
  state.deps.log({ event: 'intro-closed', status })
  state.closed = true
  state.deps.clearTimer(state.timer)
  stopVoice(state)
  state.deps.rampDuck(1, STORY_INTRO_MUSIC_RESTORE_MS)
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
    awaitingStart: false,
    fromGesture: Boolean(options.fromGesture),
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
  // Tapping the newspaper skips the running intro.
  state.root.querySelector('.story-intro__stage').addEventListener('click', () => {
    if (state.awaitingStart) return
    closeStoryIntro('skipped')
  })
  state.onGesture = event => onIntroGesture(state, event)
  state.gestureEvents.forEach(type => win.addEventListener(type, state.onGesture, true))
  win.addEventListener('keydown', state.onKey, true)
  win.addEventListener('resize', state.onResize)
  doc.body.appendChild(state.root)
  // Keep the shared audio context and music alive while the game is paused.
  state.deps.setAudioHold(true)
  holdGame(state)
  preloadClips(state)
  state.deps.unlockAudio()
  // The automatic first-launch intro always waits on the Start intro button:
  // lock detection is unreliable (an earlier landing-page tap marks the page
  // as activated, yet iOS still refuses media started outside a gesture), and
  // the press is the one gesture that starts narration and music together.
  // Intros opened by a click (sidebar replay) start straight away.
  if (state.fromGesture) {
    state.root.querySelector('.story-intro__skip').focus?.()
    beginIntro(state)
  } else {
    state.deps.log({ event: 'audio-locked', unlockedHint: Boolean(state.deps.isAudioUnlocked()) })
    // Frame the first section without starting the timeline.
    applyCamera(state, state.segments[0], true)
    showStartButton(state)
  }
  return true
}

export function getActiveStoryIntroIndex() {
  return active ? active.index : -1
}
