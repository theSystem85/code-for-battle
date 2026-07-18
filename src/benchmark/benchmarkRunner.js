import { setupBenchmarkScenario, teardownBenchmarkScenario } from './benchmarkScenario.js'
import { startBenchmarkSession, isBenchmarkRunning } from './benchmarkTracker.js'
import {
  hideBenchmarkCountdown,
  initializeBenchmarkModal,
  openBenchmarkModal,
  setBenchmarkRunningState,
  showBenchmarkCountdownMessage,
  showBenchmarkResults,
  showBenchmarkStatus,
  startBenchmarkCountdown
} from '../ui/benchmarkModal.js'
import { gameState } from '../gameState.js'

const BENCHMARK_DURATION_MS = 60_000
const AUTO_IOS_BENCHMARK_PARAM = 'e2eIosBenchmark'
const AUTO_IOS_BENCHMARK_REPORT_URL_PARAM = 'benchmarkReportUrl'
const AUTO_IOS_BENCHMARK_DURATION_PARAM = 'benchmarkDurationMs'
const AUTO_IOS_BENCHMARK_HEARTBEAT_PARAM = 'benchmarkHeartbeatMs'
const AUTO_IOS_BENCHMARK_SCROLL_PARAM = 'benchmarkScroll'
const AUTO_IOS_BENCHMARK_SCROLL_PIXELS_PARAM = 'benchmarkScrollPixelsPerFrame'

let buttonInitialized = false
let autoBenchmarkStarted = false

function waitForAnimationFrames(count = 1) {
  return new Promise(resolve => {
    const step = (remaining) => {
      if (remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => step(remaining - 1))
    }
    step(count)
  })
}

function getBenchmarkDuration(durationMs = BENCHMARK_DURATION_MS) {
  const numericDuration = Number(durationMs)
  return Number.isFinite(numericDuration) && numericDuration > 0
    ? numericDuration
    : BENCHMARK_DURATION_MS
}

async function reportAutoBenchmarkResult(reportUrl, payload) {
  if (!reportUrl) {
    return
  }

  try {
    await fetch(reportUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      keepalive: true
    })
  } catch (err) {
    console.error('Failed to report iOS benchmark result:', err)
  }
}

function getAutoBenchmarkCanvasSample() {
  const canvas = document.getElementById('gameCanvas')
  const ctx = canvas?.getContext?.('2d')
  const map = window.gameInstance?.mapGrid || gameState?.mapGrid
  if (!canvas || !ctx || !Array.isArray(map) || !map.length) {
    return { sampled: false, reason: 'missing-runtime' }
  }

  const tileSize = 32
  const pixelRatio = canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : (window.devicePixelRatio || 1)
  const startX = Math.max(0, Math.floor((gameState.scrollOffset?.x || 0) / tileSize))
  const startY = Math.max(0, Math.floor((gameState.scrollOffset?.y || 0) / tileSize))
  const endX = Math.min(map[0]?.length || 0, startX + Math.ceil((canvas.clientWidth || 800) / tileSize))
  const endY = Math.min(map.length, startY + Math.ceil((canvas.clientHeight || 600) / tileSize))
  const stepX = Math.max(1, Math.ceil((endX - startX) / 8))
  const stepY = Math.max(1, Math.ceil((endY - startY) / 8))
  let sampledCount = 0
  let blackCount = 0
  let whiteTerrainCount = 0
  let streetSampleCount = 0
  let whiteStreetCount = 0

  for (let y = startY; y < endY; y += stepY) {
    for (let x = startX; x < endX; x += stepX) {
      const tile = map[y]?.[x]
      if (!tile) continue
      const screenX = Math.round((x * tileSize - (gameState.scrollOffset?.x || 0) + tileSize / 2) * pixelRatio)
      const screenY = Math.round((y * tileSize - (gameState.scrollOffset?.y || 0) + tileSize / 2) * pixelRatio)
      if (screenX < 0 || screenY < 0 || screenX >= canvas.width || screenY >= canvas.height) continue

      const [r, g, b, a] = ctx.getImageData(screenX, screenY, 1, 1).data
      if (a <= 16) continue
      sampledCount += 1
      const isBlack = r + g + b < 24
      const isWhite = r > 235 && g > 235 && b > 235
      if (isBlack) blackCount += 1
      if (isWhite) whiteTerrainCount += 1
      if (tile.type === 'street') {
        streetSampleCount += 1
        if (isWhite) whiteStreetCount += 1
      }
    }
  }

  return {
    sampled: sampledCount > 0,
    sampledCount,
    blackCount,
    whiteTerrainCount,
    streetSampleCount,
    whiteStreetCount,
    blackRatio: sampledCount ? blackCount / sampledCount : 0,
    whiteTerrainRatio: sampledCount ? whiteTerrainCount / sampledCount : 0,
    whiteStreetRatio: streetSampleCount ? whiteStreetCount / streetSampleCount : 0,
    scrollOffset: {
      x: gameState.scrollOffset?.x || 0,
      y: gameState.scrollOffset?.y || 0
    },
    canvas: {
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
      pixelRatio
    }
  }
}

function getAutoBenchmarkDiagnostics(startedAt, runId = null) {
  return {
    runId,
    elapsedMs: performance.now() - startedAt,
    visualSample: getAutoBenchmarkCanvasSample(),
    renderStats: gameState.renderStats || null,
    canvasPixelRatio: gameState.canvasPixelRatio || null,
    overlayCanvasPixelRatio: gameState.overlayCanvasPixelRatio || null,
    rawCanvasPixelRatio: gameState.rawCanvasPixelRatio || null,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    },
    map: {
      width: gameState.mapTilesX || gameState.mapGrid?.[0]?.length || 0,
      height: gameState.mapTilesY || gameState.mapGrid?.length || 0
    }
  }
}

function startAutoBenchmarkHeartbeats(config, startedAt, runId) {
  if (!config.reportUrl || !Number.isFinite(config.heartbeatMs) || config.heartbeatMs <= 0) {
    return () => {}
  }

  const sendHeartbeat = () => {
    void reportAutoBenchmarkResult(config.reportUrl, {
      event: 'heartbeat',
      ok: true,
      ...getAutoBenchmarkDiagnostics(startedAt, runId)
    })
  }
  sendHeartbeat()
  const intervalId = window.setInterval(sendHeartbeat, config.heartbeatMs)
  return () => window.clearInterval(intervalId)
}

function startAutoBenchmarkScroll(pixelsPerFrame = 48) {
  const canvas = document.getElementById('gameCanvas')
  const map = window.gameInstance?.mapGrid || gameState?.mapGrid
  if (!canvas || !Array.isArray(map) || !map.length) {
    return () => {}
  }

  const tileSize = 32
  const mapWidthPx = (map[0]?.length || 0) * tileSize
  const mapHeightPx = map.length * tileSize
  const maxScrollX = Math.max(0, mapWidthPx - (canvas.clientWidth || 800))
  const maxScrollY = Math.max(0, mapHeightPx - (canvas.clientHeight || 600))
  const bandStep = Math.max(1, Math.floor((canvas.clientHeight || 600) * 0.75))
  const route = [{ x: 0, y: 0 }]
  let y = 0
  let rightward = true
  while (y < maxScrollY) {
    route.push({ x: rightward ? maxScrollX : 0, y })
    y = Math.min(maxScrollY, y + bandStep)
    route.push({ x: rightward ? maxScrollX : 0, y })
    rightward = !rightward
  }
  route.push({ x: rightward ? maxScrollX : 0, y: maxScrollY })

  let routeIndex = 1
  let cancelled = false
  const speed = Math.max(1, Number(pixelsPerFrame) || 48)
  gameState.scrollOffset.x = route[0].x
  gameState.scrollOffset.y = route[0].y

  function step() {
    if (cancelled) return
    const target = route[routeIndex]
    if (!target) {
      routeIndex = 1
      requestAnimationFrame(step)
      return
    }

    const dx = target.x - gameState.scrollOffset.x
    const dy = target.y - gameState.scrollOffset.y
    const distance = Math.hypot(dx, dy)
    if (distance <= speed) {
      gameState.scrollOffset.x = target.x
      gameState.scrollOffset.y = target.y
      routeIndex += 1
    } else {
      const ratio = speed / distance
      gameState.scrollOffset.x += dx * ratio
      gameState.scrollOffset.y += dy * ratio
    }
    window.gameInstance?.gameLoop?.requestRender?.()
    requestAnimationFrame(step)
  }

  requestAnimationFrame(step)
  return () => {
    cancelled = true
  }
}

function readAutoBenchmarkConfig() {
  const params = new URLSearchParams(window.location.search)
  if (params.get(AUTO_IOS_BENCHMARK_PARAM) !== '1') {
    return null
  }

  return {
    reportUrl: params.get(AUTO_IOS_BENCHMARK_REPORT_URL_PARAM),
    durationMs: getBenchmarkDuration(params.get(AUTO_IOS_BENCHMARK_DURATION_PARAM)),
    heartbeatMs: Number.parseInt(params.get(AUTO_IOS_BENCHMARK_HEARTBEAT_PARAM) || '0', 10),
    autoScroll: params.get(AUTO_IOS_BENCHMARK_SCROLL_PARAM) === '1',
    scrollPixelsPerFrame: Number.parseFloat(params.get(AUTO_IOS_BENCHMARK_SCROLL_PIXELS_PARAM) || '48')
  }
}

async function maybeRunAutoIosBenchmark() {
  if (autoBenchmarkStarted) {
    return
  }

  const config = readAutoBenchmarkConfig()
  if (!config) {
    return
  }

  autoBenchmarkStarted = true
  const startedAt = performance.now()
  const runId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
  const stopHeartbeats = startAutoBenchmarkHeartbeats(config, startedAt, runId)
  let stopScroll = null

  try {
    const result = await runBenchmarkInternal(config.durationMs, {
      onScenarioReady: () => {
        if (config.autoScroll) {
          stopScroll = startAutoBenchmarkScroll(config.scrollPixelsPerFrame)
        }
      }
    })
    window.__iosBenchmarkResult = result
    await reportAutoBenchmarkResult(config.reportUrl, {
      event: 'result',
      ok: Boolean(result),
      result,
      elapsedMs: performance.now() - startedAt,
      ...getAutoBenchmarkDiagnostics(startedAt, runId),
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      }
    })
  } catch (err) {
    window.__iosBenchmarkError = err?.message || String(err)
    await reportAutoBenchmarkResult(config.reportUrl, {
      event: 'result',
      ok: false,
      error: window.__iosBenchmarkError,
      elapsedMs: performance.now() - startedAt,
      ...getAutoBenchmarkDiagnostics(startedAt, runId)
    })
  } finally {
    stopScroll?.()
    stopHeartbeats()
  }
}

async function runBenchmarkInternal(durationMs = BENCHMARK_DURATION_MS, options = {}) {
  if (isBenchmarkRunning()) {
    return null
  }

  const benchmarkDurationMs = getBenchmarkDuration(durationMs)

  const button = document.getElementById('runBenchmarkBtn')
  if (button) {
    button.disabled = true
  }

  let scenarioInitialized = false
  let stopCountdown = null

  try {
    setBenchmarkRunningState(true)
    showBenchmarkStatus('Preparing benchmark scenario…')
    showBenchmarkCountdownMessage('Benchmark: preparing scenario…')

    setupBenchmarkScenario()
    scenarioInitialized = true
    await waitForAnimationFrames(2)
    options.onScenarioReady?.()

    showBenchmarkStatus(`Running benchmark (${Math.round(benchmarkDurationMs / 1000)}s)…`)
    stopCountdown = startBenchmarkCountdown(benchmarkDurationMs)

    const resultPromise = startBenchmarkSession(benchmarkDurationMs)
    if (!resultPromise) {
      throw new Error('Benchmark session already running')
    }

    const result = await resultPromise

    if (stopCountdown) {
      stopCountdown()
      stopCountdown = null
    }
    hideBenchmarkCountdown()
    showBenchmarkResults(result)
    setBenchmarkRunningState(false)
    openBenchmarkModal()

    return result
  } catch (err) {
    console.error('Benchmark run failed:', err)
    if (stopCountdown) {
      stopCountdown()
      stopCountdown = null
    } else {
      hideBenchmarkCountdown()
    }
    showBenchmarkStatus('Benchmark failed. Check console for details.')
    setBenchmarkRunningState(false)
    openBenchmarkModal()
    return null
  } finally {
    if (scenarioInitialized) {
      teardownBenchmarkScenario()
    }
    if (button) {
      button.disabled = false
    }
    gameState.benchmarkActive = false
    hideBenchmarkCountdown()
  }
}

export function attachBenchmarkButton() {
  if (buttonInitialized) {
    maybeRunAutoIosBenchmark()
    return
  }

  const button = document.getElementById('runBenchmarkBtn')
  if (!button) {
    return
  }

  initializeBenchmarkModal({
    onRunAgain: () => runBenchmarkInternal(),
    onClose: () => {
      if (button) {
        button.disabled = false
      }
    }
  })

  button.addEventListener('click', () => {
    runBenchmarkInternal()
  })

  buttonInitialized = true
  maybeRunAutoIosBenchmark()
}

export async function runBenchmark(durationMs = BENCHMARK_DURATION_MS) {
  return runBenchmarkInternal(durationMs)
}
