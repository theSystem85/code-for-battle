import { uiText } from './uiText.js'

const modalId = 'benchmarkModal'
const statusId = 'benchmarkModalStatus'
const resultsContainerId = 'benchmarkResultsContainer'
const minId = 'benchmarkMinFps'
const maxId = 'benchmarkMaxFps'
const avgId = 'benchmarkAvgFps'
const durationId = 'benchmarkDuration'
const chartId = 'benchmarkChart'
const runAgainId = 'benchmarkRunAgainBtn'
const closeBtnId = 'benchmarkModalCloseBtn'
const closeFooterId = 'benchmarkModalCloseFooterBtn'
const countdownId = 'benchmarkCountdown'
const countdownTextId = 'benchmarkCountdownText'

let closeHandlersBound = false
let runAgainHandler = null
let countdownAnimation = null
let countdownAverageFps = null
let countdownEndTime = null

function resetCountdownState() {
  countdownAverageFps = null
  countdownEndTime = null
}

function formatAverageFps() {
  if (!Number.isFinite(countdownAverageFps)) {
    return 'Avg FPS: --'
  }
  return `Avg FPS: ${countdownAverageFps.toFixed(1)}`
}

function getCountdownElements() {
  const countdown = document.getElementById(countdownId)
  const countdownText = countdown ? countdown.querySelector(`#${countdownTextId}`) : null

  if (!countdown || !countdownText) {
    throw new Error('Benchmark countdown element not found')
  }

  return { countdown, countdownText }
}

function getModalElements() {
  const modal = document.getElementById(modalId)
  if (!modal) {
    throw new Error('Benchmark modal element not found')
  }
  const status = modal.querySelector(`#${statusId}`)
  const results = modal.querySelector(`#${resultsContainerId}`)
  const minEl = modal.querySelector(`#${minId}`)
  const maxEl = modal.querySelector(`#${maxId}`)
  const avgEl = modal.querySelector(`#${avgId}`)
  const durationEl = modal.querySelector(`#${durationId}`)
  const chart = modal.querySelector(`#${chartId}`)
  const runAgainBtn = modal.querySelector(`#${runAgainId}`)
  const closeBtn = modal.querySelector(`#${closeBtnId}`)
  const closeFooterBtn = modal.querySelector(`#${closeFooterId}`)

  if (!status || !results || !chart || !runAgainBtn || !closeBtn || !closeFooterBtn) {
    throw new Error('Benchmark modal is missing required elements')
  }

  return {
    modal,
    status,
    results,
    minEl,
    maxEl,
    avgEl,
    durationEl,
    chart,
    runAgainBtn,
    closeBtn,
    closeFooterBtn
  }
}

function toggleBodyScroll(disabled) {
  if (disabled) {
    document.body.classList.add('benchmark-modal-open')
  } else {
    document.body.classList.remove('benchmark-modal-open')
  }
}

export function initializeBenchmarkModal({ onRunAgain, onClose } = {}) {
  const {
    modal,
    runAgainBtn,
    closeBtn,
    closeFooterBtn
  } = getModalElements()

  runAgainHandler = typeof onRunAgain === 'function' ? onRunAgain : null

  if (!closeHandlersBound) {
    const handleClose = () => {
      closeBenchmarkModal()
      if (typeof onClose === 'function') onClose()
    }

    closeBtn.addEventListener('click', handleClose)
    closeFooterBtn.addEventListener('click', handleClose)

    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        handleClose()
      }
    })

    closeHandlersBound = true
  }

  runAgainBtn.addEventListener('click', () => {
    closeBenchmarkModal()
    if (typeof onClose === 'function') onClose()
    if (runAgainHandler) {
      runAgainHandler()
    }
  })

  closeBenchmarkModal()
}

export function openBenchmarkModal() {
  const { modal } = getModalElements()
  modal.classList.remove('modal-hidden')
  modal.classList.add('benchmark-modal--open')
  modal.setAttribute('aria-hidden', 'false')
  toggleBodyScroll(true)
}

export function closeBenchmarkModal() {
  const { modal } = getModalElements()
  modal.classList.remove('benchmark-modal--open')
  modal.classList.add('modal-hidden')
  modal.setAttribute('aria-hidden', 'true')
  toggleBodyScroll(false)
}

export function setBenchmarkRunningState(isRunning) {
  const { runAgainBtn, closeBtn, closeFooterBtn } = getModalElements()
  runAgainBtn.disabled = isRunning
  closeBtn.disabled = isRunning
  closeFooterBtn.disabled = isRunning
}

export function showBenchmarkCountdownMessage(message) {
  const { countdown, countdownText } = getCountdownElements()
  if (countdownAnimation) {
    cancelAnimationFrame(countdownAnimation)
    countdownAnimation = null
  }
  resetCountdownState()
  countdown.hidden = false
  countdownText.textContent = message
}

export function startBenchmarkCountdown(durationMs) {
  const { countdown, countdownText } = getCountdownElements()
  if (countdownAnimation) {
    cancelAnimationFrame(countdownAnimation)
    countdownAnimation = null
  }

  resetCountdownState()

  const endTime = performance.now() + durationMs
  countdown.hidden = false
  countdownEndTime = endTime

  const update = () => {
    const now = performance.now()
    const remaining = Math.max(0, endTime - now)
    const seconds = (remaining / 1000).toFixed(1)
    const parts = [`Benchmark running: ${seconds}s remaining`]
    parts.push(formatAverageFps())
    countdownText.textContent = parts.join(' · ')
    if (remaining > 0) {
      countdownAnimation = requestAnimationFrame(update)
    } else {
      countdownAnimation = null
    }
  }

  if (countdownAnimation) {
    cancelAnimationFrame(countdownAnimation)
  }

  update()

  return () => {
    if (countdownAnimation) {
      cancelAnimationFrame(countdownAnimation)
      countdownAnimation = null
    }
    countdownText.textContent = ''
    countdown.hidden = true
    resetCountdownState()
  }
}

export function hideBenchmarkCountdown() {
  const { countdown, countdownText } = getCountdownElements()
  if (countdownAnimation) {
    cancelAnimationFrame(countdownAnimation)
    countdownAnimation = null
  }
  countdownText.textContent = ''
  countdown.hidden = true
  resetCountdownState()
}

export function updateBenchmarkCountdownAverage(fps) {
  countdownAverageFps = Number.isFinite(fps) ? fps : null

  if (!countdownEndTime) {
    return
  }

  const { countdown, countdownText } = getCountdownElements()
  if (countdown.hidden) {
    return
  }

  const remaining = Math.max(0, countdownEndTime - performance.now())
  const seconds = (remaining / 1000).toFixed(1)
  countdownText.textContent = [`Benchmark running: ${seconds}s remaining`, formatAverageFps()].join(' · ')
}

export function showBenchmarkStatus(message) {
  const { status, results } = getModalElements()
  status.textContent = message
  results.hidden = true
}

function formatFps(value) {
  if (!Number.isFinite(value)) return '--'
  return value.toFixed(1)
}

function drawBenchmarkChart(canvas, data, summary) {
  const context = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const displayWidth = canvas.clientWidth || 480
  const displayHeight = canvas.clientHeight || 240

  canvas.width = displayWidth * dpr
  canvas.height = displayHeight * dpr
  context.scale(dpr, dpr)

  context.clearRect(0, 0, displayWidth, displayHeight)

  if (!data || data.length === 0) {
    context.fillStyle = '#ccc'
    context.font = '14px sans-serif'
    context.textAlign = 'center'
    context.fillText('No frame data captured', displayWidth / 2, displayHeight / 2)
    return
  }

  const margin = { top: 20, right: 20, bottom: 30, left: 55 }
  const chartWidth = displayWidth - margin.left - margin.right
  const chartHeight = displayHeight - margin.top - margin.bottom

  const fpsValues = data.map(point => point.fps)
  const maxFps = Math.max(summary.maxFps || 0, ...fpsValues)
  const minFps = Math.min(summary.minFps || 0, ...fpsValues)
  const yMax = Math.max(10, Math.ceil(maxFps / 10) * 10)
  const yMin = Math.min(0, Math.floor(minFps / 10) * 10)

  const xStep = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth

  context.strokeStyle = '#444'
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(margin.left, margin.top)
  context.lineTo(margin.left, displayHeight - margin.bottom)
  context.lineTo(displayWidth - margin.right, displayHeight - margin.bottom)
  context.stroke()

  context.fillStyle = '#666'
  context.font = '12px sans-serif'
  context.textAlign = 'right'
  context.textBaseline = 'middle'

  const gridLines = 5
  for (let i = 0; i <= gridLines; i++) {
    const value = yMin + ((yMax - yMin) / gridLines) * i
    const y = displayHeight - margin.bottom - (chartHeight * (value - yMin)) / (yMax - yMin)
    context.strokeStyle = '#333'
    context.beginPath()
    context.moveTo(margin.left, y)
    context.lineTo(displayWidth - margin.right, y)
    context.stroke()
    context.fillText(`${value.toFixed(0)} FPS`, margin.left - 6, y)
  }

  context.strokeStyle = '#58a6ff'
  context.lineWidth = 2
  context.beginPath()
  data.forEach((point, index) => {
    const x = margin.left + xStep * index
    const y = displayHeight - margin.bottom - (chartHeight * (point.fps - yMin)) / (yMax - yMin)
    if (index === 0) {
      context.moveTo(x, y)
    } else {
      context.lineTo(x, y)
    }
  })
  context.stroke()

  context.fillStyle = '#58a6ff'
  data.forEach((point, index) => {
    const x = margin.left + xStep * index
    const y = displayHeight - margin.bottom - (chartHeight * (point.fps - yMin)) / (yMax - yMin)
    context.beginPath()
    context.arc(x, y, 3, 0, Math.PI * 2)
    context.fill()
  })

  context.fillStyle = '#999'
  context.textAlign = 'center'
  context.textBaseline = 'top'
  context.fillText('Time (seconds)', margin.left + chartWidth / 2, displayHeight - margin.bottom + 8)
}

export function showBenchmarkResults(result) {
  const {
    status,
    results,
    minEl,
    maxEl,
    avgEl,
    durationEl,
    chart
  } = getModalElements()

  status.textContent = 'Benchmark complete'
  results.hidden = false
  chart.hidden = false
  const phaseEl = document.getElementById('benchmarkPhaseBreakdown')
  if (phaseEl) phaseEl.hidden = true

  minEl.textContent = formatFps(result.minFps)
  maxEl.textContent = formatFps(result.maxFps)
  avgEl.textContent = formatFps(result.averageFps)
  durationEl.textContent = `${(result.durationMs / 1000).toFixed(1)}s`

  drawBenchmarkChart(chart, result.intervalAverages, result)
}

const HEAVY_BATTLE_PHASE_ROWS = [
  ['sim', 'settings.benchmark.phase.sim'],
  ['movement', 'settings.benchmark.phase.move'],
  ['combat', 'settings.benchmark.phase.combat'],
  ['pathfinding', 'settings.benchmark.phase.path'],
  ['ai', 'settings.benchmark.phase.ai'],
  ['fog', 'settings.benchmark.phase.fog'],
  ['terrain', 'settings.benchmark.phase.terrain'],
  ['entities', 'settings.benchmark.phase.units'],
  ['effects', 'settings.benchmark.phase.effects'],
  ['ui', 'settings.benchmark.phase.ui'],
  ['minimap', 'settings.benchmark.phase.minimap']
]

export function formatHeavyBattlePhases(phases) {
  return HEAVY_BATTLE_PHASE_ROWS.map(([name, key]) => {
    const phase = phases?.[name]
    const value = phase?.samples
      ? `${Number(phase.averageMs).toFixed(1)}/${Number(phase.p95Ms).toFixed(1)}`
      : '--'
    return `${uiText(key)}: ${value}`
  }).join('\n')
}

export function showHeavyBattleResults(result) {
  const {
    status,
    results,
    minEl,
    maxEl,
    avgEl,
    durationEl,
    chart
  } = getModalElements()
  const frame = result?.phases?.frame || {}
  const minFps = frame.maxMs > 0 ? 1000 / frame.maxMs : 0
  const maxFps = frame.minMs > 0 ? 1000 / frame.minMs : 0

  status.textContent = uiText('settings.benchmark.heavyComplete')
  results.hidden = false
  chart.hidden = true
  minEl.textContent = formatFps(minFps)
  maxEl.textContent = formatFps(maxFps)
  avgEl.textContent = formatFps(frame.fps)
  durationEl.textContent = `${((result?.durationMs || 0) / 1000).toFixed(1)}s`

  const phaseEl = document.getElementById('benchmarkPhaseBreakdown')
  if (phaseEl) {
    phaseEl.hidden = false
    phaseEl.textContent = `${uiText('settings.benchmark.phasesTitle')}\n${formatHeavyBattlePhases(result?.phases?.phases)}`
  }
}
