import { APP_VERSION } from '../version.js'

const state = {
  visible: true,
  phase: 'boot',
  kicker: 'THEATER COMMAND',
  detail: 'Establishing uplink',
  progress: 0.04
}

let activeSession = 0
let taskQueue = Promise.resolve()
const MIN_RELOAD_VISIBLE_MS = 500

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function clampProgress(progress) {
  if (progress == null || progress === '') return null
  const value = Number(progress)
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(1, value))
}

function ensureRoot() {
  const existing = document.getElementById('loadingScreen')
  if (existing) return existing

  const root = document.createElement('div')
  root.id = 'loadingScreen'
  root.className = 'loading-screen'
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'off')
  root.setAttribute('aria-busy', 'true')
  root.setAttribute('aria-label', 'Loading Code for Battle')
  root.innerHTML = `
    <div class="loading-screen__panel">
      <p class="loading-screen__kicker" id="loadingScreenKicker"></p>
      <h1 class="loading-screen__title" id="loadingScreenTitle">Code for Battle</h1>
      <p class="loading-screen__detail" id="loadingScreenDetail" aria-live="polite"></p>
      <div class="loading-screen__track" id="loadingScreenTrack" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="Loading progress">
        <div class="loading-screen__bar" id="loadingScreenBar"></div>
      </div>
      <div class="loading-screen__meta">
        <p class="loading-screen__percent" id="loadingScreenPercent"></p>
        <p class="loading-screen__version" id="loadingScreenVersion"></p>
      </div>
    </div>
  `
  document.body.appendChild(root)
  return root
}

function render() {
  const root = ensureRoot()
  const kicker = document.getElementById('loadingScreenKicker')
  const detail = document.getElementById('loadingScreenDetail')
  const track = document.getElementById('loadingScreenTrack')
  const bar = document.getElementById('loadingScreenBar')
  const percent = document.getElementById('loadingScreenPercent')
  const version = document.getElementById('loadingScreenVersion')

  root.classList.toggle('loading-screen--hidden', !state.visible)
  root.setAttribute('aria-hidden', state.visible ? 'false' : 'true')
  root.setAttribute('aria-busy', state.visible ? 'true' : 'false')
  root.dataset.phase = state.phase || 'loading'
  if (state.visible) {
    root.removeAttribute('inert')
    document.body.classList.add('game-loading')
  } else {
    root.setAttribute('inert', '')
    document.body.classList.remove('game-loading')
  }

  if (kicker) kicker.textContent = state.kicker || 'THEATER COMMAND'
  if (detail) detail.textContent = state.detail || 'Preparing the battlefield'
  if (version) version.textContent = `v${APP_VERSION}`

  const progress = clampProgress(state.progress)
  const indeterminate = progress == null
  if (bar) {
    bar.classList.toggle('is-indeterminate', indeterminate)
    bar.style.width = indeterminate ? '' : `${Math.round(progress * 1000) / 10}%`
  }
  if (track) {
    if (indeterminate) {
      track.removeAttribute('aria-valuenow')
      track.setAttribute('aria-valuetext', 'Loading')
    } else {
      const percentValue = Math.round(progress * 100)
      track.setAttribute('aria-valuenow', String(percentValue))
      track.setAttribute('aria-valuetext', `${percentValue} percent`)
    }
  }
  if (percent) {
    percent.textContent = indeterminate ? 'STANDBY' : `${Math.round(progress * 100)}%`
  }
}

export function getLoadingScreenState() {
  return {
    visible: state.visible,
    phase: state.phase,
    kicker: state.kicker,
    detail: state.detail,
    progress: state.progress,
    session: activeSession
  }
}

export function showLoadingScreen(options = {}) {
  activeSession += 1
  state.visible = true
  state.phase = options.phase || 'loading'
  state.kicker = options.kicker || 'THEATER COMMAND'
  state.detail = options.detail || 'Preparing the battlefield'
  state.progress = Object.prototype.hasOwnProperty.call(options, 'progress') ? options.progress : null
  render()
  return activeSession
}

export function updateLoadingScreen(patch = {}, sessionId = null) {
  if (sessionId != null && sessionId !== activeSession) return
  if (patch.phase != null) state.phase = patch.phase
  if (patch.kicker != null) state.kicker = patch.kicker
  if (patch.detail != null) state.detail = patch.detail
  if (Object.prototype.hasOwnProperty.call(patch, 'progress')) state.progress = patch.progress
  if (state.visible) render()
}

export function hideLoadingScreen(sessionId = null) {
  if (sessionId != null && sessionId !== activeSession) return
  state.visible = false
  render()
}

export function waitForLoadingPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

async function performLoadingTask(task, options) {
  const session = showLoadingScreen(options)
  const startedAt = performance.now()
  try {
    await waitForLoadingPaint()
    return await task((patch) => updateLoadingScreen(patch, session))
  } finally {
    const elapsed = performance.now() - startedAt
    const remaining = MIN_RELOAD_VISIBLE_MS - elapsed
    if (remaining > 0) {
      await wait(remaining)
    }
    hideLoadingScreen(session)
  }
}

export function runWithLoadingScreen(task, options = {}) {
  const run = taskQueue.then(() => performLoadingTask(task, options))
  taskQueue = run.then(() => {}, () => {})
  return run
}
