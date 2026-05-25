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

function readAutoBenchmarkConfig() {
  const params = new URLSearchParams(window.location.search)
  if (params.get(AUTO_IOS_BENCHMARK_PARAM) !== '1') {
    return null
  }

  return {
    reportUrl: params.get(AUTO_IOS_BENCHMARK_REPORT_URL_PARAM),
    durationMs: getBenchmarkDuration(params.get(AUTO_IOS_BENCHMARK_DURATION_PARAM))
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

  try {
    const result = await runBenchmarkInternal(config.durationMs)
    window.__iosBenchmarkResult = result
    await reportAutoBenchmarkResult(config.reportUrl, {
      ok: Boolean(result),
      result,
      elapsedMs: performance.now() - startedAt,
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
      ok: false,
      error: window.__iosBenchmarkError,
      elapsedMs: performance.now() - startedAt
    })
  }
}

async function runBenchmarkInternal(durationMs = BENCHMARK_DURATION_MS) {
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
