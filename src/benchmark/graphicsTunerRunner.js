import { GRAPHICS_SETTINGS_STORAGE_KEY } from '../config.js'
import { gameState } from '../gameState.js'
import { getTextureManager } from '../rendering.js'
import { getStoredItem } from '../storage/indexedDbStorage.js'
import { GRAPHICS_TUNER_PARAM } from './graphicsTunerFrame.js'
import {
  buildGraphicsProfiles, rankGraphicsCosts, recommendGraphicsProfile, reachesGraphicsGoal
} from './graphicsTunerModel.js'

let running = false

export function graphicsTunerAvailable() {
  const session = gameState.multiplayerSession
  return !session?.isRemote && session?.status !== 'connected' &&
    !gameState.partyStates?.some(party => party.partyId !== gameState.humanPlayer && party.aiActive === false && party.lastConnectedAt)
}

function createStage() {
  const stage = document.createElement('section')
  stage.className = 'graphics-tuner-stage'
  stage.setAttribute('aria-label', 'Graphics tuner')
  const frame = document.createElement('iframe')
  frame.title = 'Graphics benchmark coastal battle'
  frame.tabIndex = -1
  const url = new URL(window.location.pathname, window.location.origin)
  url.searchParams.set(GRAPHICS_TUNER_PARAM, '1')
  frame.src = url.href
  const controls = document.createElement('div')
  controls.className = 'graphics-tuner-stage__controls'
  const status = document.createElement('p')
  status.setAttribute('role', 'status')
  status.textContent = 'Preparing the coastal battle…'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.textContent = 'Cancel'
  cancel.className = 'benchmark-modal__button'
  controls.append(status, cancel)
  stage.append(frame, controls)
  document.body.append(stage)
  cancel.focus()
  return { stage, frame, status, cancel }
}

function waitForSandbox(frame, signal) {
  return new Promise((resolve, reject) => {
    const started = performance.now()
    const timer = setInterval(() => {
      const create = frame.contentWindow?.createGraphicsTunerSandbox
      if (!signal.aborted && !create && performance.now() - started < 30_000) return
      clearInterval(timer)
      if (signal.aborted) reject(signal.reason)
      else if (!create) reject(new Error('The isolated battle could not load.'))
      else resolve(create)
    }, 50)
  })
}

function mergeMetrics(first, second) {
  const frames = first.frames + second.frames
  const mean = key => (first.frames * first[key] + second.frames * second[key]) / frames
  return {
    frames,
    fps: frames / (first.frames / first.fps + second.frames / second.fps),
    p95: Math.max(first.p95, second.p95),
    p99: Math.max(first.p99, second.p99),
    max: Math.max(first.max, second.max),
    missed: first.missed + second.missed,
    cadenceMisses: first.cadenceMisses + second.cadenceMisses,
    workP95: Math.max(first.workP95, second.workP95),
    update: mean('update'),
    render: mean('render')
  }
}

function mergeRuns(first, second) {
  return {
    ...first,
    backing: { ...first.backing },
    metrics: mergeMetrics(first.metrics, second.metrics),
    stationary: mergeMetrics(first.stationary, second.stationary),
    scrolling: mergeMetrics(first.scrolling, second.scrolling),
    firstTraversal: mergeMetrics(first.firstTraversal, second.firstTraversal),
    repeatedTraversal: mergeMetrics(first.repeatedTraversal, second.repeatedTraversal),
    peakProjectiles: Math.max(first.peakProjectiles, second.peakProjectiles),
    peakSmoke: Math.max(first.peakSmoke, second.peakSmoke),
    peakHeapBytes: Math.max(first.peakHeapBytes ?? 0, second.peakHeapBytes ?? 0) || null,
    peakGpuMs: Math.max(first.peakGpuMs ?? 0, second.peakGpuMs ?? 0) || null,
    backend: first.backend === second.backend ? first.backend : `${first.backend} / ${second.backend}`
  }
}

async function runComparisons(frame, status, loop, signal) {
  const createSandbox = await waitForSandbox(frame, signal)
  const sheets = getTextureManager().integratedSpriteSheets?.map(({ sheetPath, metadata }) => ({ sheetPath, metadata }))
  const deviceDensity = window.devicePixelRatio || 1
  const { measure, refreshHz, deadline } = await createSandbox({
    graphicsPreferences: getStoredItem(GRAPHICS_SETTINGS_STORAGE_KEY),
    selectionHudMode: gameState.selectionHudMode,
    selectionHudBarThickness: gameState.selectionHudBarThickness,
    minimapInterval: loop.getMinimapRenderIntervalMs(),
    sheets
  }, signal)
  const profiles = buildGraphicsProfiles(deviceDensity)
  const first = new Map()
  const second = new Map()
  let completed = 0
  for (const [pass, order] of [[first, profiles], [second, [...profiles].reverse()]]) {
    for (const profile of order) {
      status.textContent = `Comparing graphics settings (${++completed} of ${profiles.length * 2})…`
      pass.set(profile.id, await measure(profile))
    }
  }
  const results = profiles.map(({ id }) => mergeRuns(first.get(id), second.get(id)))
  const ranking = rankGraphicsCosts(results)
  status.textContent = 'Checking the recommended combination…'
  const combinations = []
  const recommendation = await recommendGraphicsProfile(results, ranking, refreshHz, async profile => {
    const result = mergeRuns(await measure(profile), await measure(profile))
    combinations.push(result)
    return result
  })
  signal.throwIfAborted()
  return {
    recordedAt: new Date().toISOString(), deviceDensity, refreshHz, deadline, ranking,
    comparisons: results, combinations, recommendation, meetsGoal: reachesGraphicsGoal(recommendation, refreshHz)
  }
}

export async function runDeviceGraphicsTuner() {
  if (running) return null
  if (!graphicsTunerAvailable()) throw new Error('Run the graphics tuner outside a connected multiplayer match.')
  const loop = window.gameInstance?.gameLoop
  if (!loop?.running) throw new Error('Wait for the game to finish loading before starting the graphics tuner.')
  running = true
  const controller = new AbortController()
  const { signal } = controller
  const previousFocus = document.activeElement
  const { stage, frame, status, cancel } = createStage()
  const stop = () => controller.abort(new DOMException('Benchmark cancelled.', 'GraphicsTunerCancelled'))
  const stopIfHidden = () => {
    if (document.hidden) controller.abort(new Error('Keep the benchmark visible until all tests finish.'))
  }
  const stopOnResize = () => controller.abort(new Error('The viewport changed. Run the benchmark again at the new size.'))
  const keydown = event => {
    if (event.key !== 'Escape') return
    event.stopImmediatePropagation()
    stop()
  }
  cancel.addEventListener('click', stop)
  document.addEventListener('visibilitychange', stopIfHidden)
  window.addEventListener('resize', stopOnResize)
  window.addEventListener('keydown', keydown, true)
  loop.stop()
  try {
    const aborted = new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
    return await Promise.race([runComparisons(frame, status, loop, signal), aborted])
  } finally {
    controller.abort()
    stage.remove()
    if (previousFocus?.isConnected) previousFocus.focus()
    document.removeEventListener('visibilitychange', stopIfHidden)
    window.removeEventListener('resize', stopOnResize)
    window.removeEventListener('keydown', keydown, true)
    if (window.gameInstance?.gameLoop === loop) loop.start()
    running = false
  }
}
