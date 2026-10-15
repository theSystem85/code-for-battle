import { gameState } from '../gameState.js'
import { getStoredItem, setStoredItem } from '../storage/indexedDbStorage.js'
import {
  STORY_IMAGE,
  STORY_SEGMENTS,
  STORY_SEGMENT_GAP_MS,
  focusTransform
} from './storyIntroSegments.js'

export const STORY_INTRO_STORAGE_KEY = 'cfb-story-intro-v1'
export const STORY_INTRO_MUSIC_DUCK = 0.25
export const STORY_INTRO_VOICE_GAIN = 0.95
export const STORY_INTRO_CLOSED_EVENT = 'story-intro-closed'

let active = null

function defaultDeps() {
  return {
    createAudio: src => new Audio(src),
    getVolume: () => 1,
    setDuck: () => {},
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
        <button type="button" class="story-intro__sound" hidden>Sound on</button>
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
  if (!state.voice) return
  try {
    state.voice.pause()
    state.voice.src = ''
  } catch {
    // Teardown errors are irrelevant once the intro closes.
  }
  state.voice = null
}

function playVoice(state, segment) {
  stopVoice(state)
  if (state.muted) return
  let voice
  try {
    voice = state.deps.createAudio(segment.audio)
  } catch {
    return
  }
  voice.volume = Math.max(0, Math.min(1, state.deps.getVolume() * STORY_INTRO_VOICE_GAIN))
  state.voice = voice
  const playing = voice.play?.()
  if (playing && typeof playing.catch === 'function') {
    playing.catch(error => {
      if (state.voice !== voice || state.closed) return
      // Autoplay blocked before the first user gesture: keep the pictures
      // running on the measured clip timings and offer a sound button.
      if (error?.name === 'NotAllowedError') {
        state.muted = true
        const btn = state.root.querySelector('.story-intro__sound')
        if (btn) btn.hidden = false
      }
    })
  }
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
  playVoice(state, segment)
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
    muted: false,
    started: false,
    closed: false,
    pausedGame: false
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
  state.root.querySelector('.story-intro__sound').addEventListener('click', event => {
    event.stopPropagation()
    state.muted = false
    event.currentTarget.hidden = true
    const segment = state.segments[state.index]
    if (segment) playVoice(state, segment)
  })
  // Tapping the newspaper itself skips the intro.
  state.root.querySelector('.story-intro__stage').addEventListener('click', () => closeStoryIntro('skipped'))
  win.addEventListener('keydown', state.onKey, true)
  win.addEventListener('resize', state.onResize)
  doc.body.appendChild(state.root)
  holdGame(state)
  state.deps.setDuck(STORY_INTRO_MUSIC_DUCK)
  state.root.querySelector('.story-intro__skip').focus?.()
  showSegment(state, 0)
  return true
}

export function getActiveStoryIntroIndex() {
  return active ? active.index : -1
}
