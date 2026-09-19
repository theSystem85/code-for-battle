import { gameState } from '../gameState.js'
import { renderDiagnostics } from './renderDiagnostics.js'
import { renderProfiler } from './renderProfiler.js'

const SLOW_FRAME_MS = 1000 / 75
const HEAP_SAMPLE_INTERVAL_MS = 1000
const MAX_HEAP_SAMPLES = 120

function isFiniteNumber(value) {
  return Number.isFinite(value)
}

function round(value, digits = 2) {
  if (!isFiniteNumber(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function createMetric() {
  return { count: 0, total: 0, min: Infinity, max: -Infinity, slowFrames: 0 }
}

function addMetric(metric, value, slowThreshold = SLOW_FRAME_MS) {
  if (!isFiniteNumber(value) || value < 0) return
  metric.count++
  metric.total += value
  metric.min = Math.min(metric.min, value)
  metric.max = Math.max(metric.max, value)
  if (value >= slowThreshold) metric.slowFrames++
}

function summarizeMetric(metric) {
  if (!metric.count) return { samples: 0, averageMs: 0, minMs: 0, maxMs: 0, slowFrames: 0 }
  return {
    samples: metric.count,
    averageMs: round(metric.total / metric.count),
    minMs: round(metric.min),
    maxMs: round(metric.max),
    slowFrames: metric.slowFrames
  }
}

function getQueryMonitorEnabled() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('monitor')
}

function defaultNow() {
  return performance.now()
}

function readHeapBytes() {
  return typeof performance !== 'undefined' ? performance.memory?.usedJSHeapSize : null
}

export const isPerformanceMonitorEnabled = getQueryMonitorEnabled()

export class PerformanceMonitor {
  constructor({ now = defaultNow, heapBytes = readHeapBytes } = {}) {
    this.now = now
    this.readHeapBytes = heapBytes
    this.recording = false
    this.startedAt = 0
    this.endedAt = 0
    this.metrics = this.createMetrics()
    this.lastRendererPhases = null
    this.schedulerSources = this.createSchedulerSources()
    this.report = null
    this.heapSamples = []
    this.nextHeapSampleAt = 0
    this.counterBaseline = renderDiagnostics.getCounterTotals()
  }

  createMetrics() {
    return {
      frameInterval: createMetric(),
      update: createMetric(),
      render: createMetric(),
      minimap: createMetric(),
      frameWork: createMetric(),
      unattributedWait: createMetric(),
      schedulerDelay: createMetric(),
      terrain: createMetric(),
      entities: createMetric(),
      effects: createMetric(),
      ui: createMetric()
    }
  }

  createSchedulerSources() {
    return { raf: 0, watchdog: 0, timeout: 0, unknown: 0 }
  }

  start() {
    this.recording = true
    this.startedAt = this.now()
    this.endedAt = 0
    this.metrics = this.createMetrics()
    this.lastRendererPhases = null
    this.schedulerSources = this.createSchedulerSources()
    this.report = null
    this.heapSamples = []
    this.nextHeapSampleAt = this.startedAt
    this.counterBaseline = renderDiagnostics.getCounterTotals()
    this.sampleHeap(this.startedAt)
    return this.getStatus()
  }

  stop() {
    if (!this.recording) return this.report
    this.endedAt = this.now()
    this.sampleHeap(this.endedAt)
    this.recording = false
    this.report = this.buildReport()
    return this.report
  }

  recordRendererPhases(phases) {
    if (!this.recording || !phases) return
    this.lastRendererPhases = phases
  }

  recordDiagnosticCounter(id, amount = 1) {
    return renderDiagnostics.addCounter(id, amount)
  }

  recordDiagnostics(snapshot) {
    if (!snapshot) return
    renderDiagnostics.addCounters(snapshot.counters)
    if (snapshot.backend || snapshot.devicePixelRatio || snapshot.refreshRateHz || snapshot.gpuTiming) {
      renderDiagnostics.setCapabilities(snapshot)
    }
    for (const [owner, bytes] of Object.entries(snapshot.byteUsage || {})) {
      renderDiagnostics.setByteUsage(owner, bytes)
    }
  }

  sampleHeap(now = this.now()) {
    if (!this.recording || now < this.nextHeapSampleAt) return
    this.nextHeapSampleAt = now + HEAP_SAMPLE_INTERVAL_MS
    const bytes = this.readHeapBytes()
    if (!isFiniteNumber(bytes)) return
    if (this.heapSamples.length >= MAX_HEAP_SAMPLES) this.heapSamples.shift()
    this.heapSamples.push({ atMs: Math.max(0, now - this.startedAt), usedBytes: bytes })
  }

  recordFrame(frame) {
    renderProfiler.recordFrameTiming(frame?.frameInterval)
    if (!this.recording) return
    const {
      frameInterval,
      updateMs,
      renderMs,
      minimapMs,
      frameWorkMs,
      compositorWaitMs,
      unattributedWaitMs,
      schedulerSource,
      schedulerDelayMs
    } = frame || {}
    addMetric(this.metrics.frameInterval, frameInterval)
    addMetric(this.metrics.update, updateMs)
    addMetric(this.metrics.render, renderMs)
    addMetric(this.metrics.minimap, minimapMs)
    addMetric(this.metrics.frameWork, frameWorkMs)
    addMetric(this.metrics.unattributedWait, unattributedWaitMs ?? compositorWaitMs)
    addMetric(this.metrics.schedulerDelay, schedulerDelayMs)
    const source = Object.hasOwn(this.schedulerSources, schedulerSource) ? schedulerSource : 'unknown'
    this.schedulerSources[source]++
    if (this.lastRendererPhases) {
      addMetric(this.metrics.terrain, this.lastRendererPhases.terrainMs)
      addMetric(this.metrics.entities, this.lastRendererPhases.entitiesMs)
      addMetric(this.metrics.effects, this.lastRendererPhases.effectsMs)
      addMetric(this.metrics.ui, this.lastRendererPhases.uiMs)
    }
    this.sampleHeap()
  }

  getStatus() {
    return {
      recording: this.recording,
      durationMs: this.recording ? this.now() - this.startedAt : Math.max(0, this.endedAt - this.startedAt)
    }
  }

  buildReport() {
    const map = gameState.mapGrid || []
    const gameCanvas = document.getElementById('gameCanvas')
    const gameGlCanvas = document.getElementById('gameCanvasGL')
    const gameGpuCanvas = document.getElementById('gameCanvasGPU')
    const metrics = Object.fromEntries(Object.entries(this.metrics).map(([name, metric]) => [name, summarizeMetric(metric)]))
    const durationMs = Math.max(0, this.endedAt - this.startedAt)
    const frameAverage = metrics.frameInterval.averageMs
    const renderStats = gameState.renderStats || {}
    const diagnostics = renderDiagnostics.snapshot()

    return {
      version: 2,
      kind: 'code-for-battle-performance-monitor',
      recordedAt: new Date().toISOString(),
      durationMs: round(durationMs),
      averageFps: frameAverage > 0 ? round(1000 / frameAverage) : 0,
      device: {
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        screen: { width: window.screen?.width || 0, height: window.screen?.height || 0 },
        nativeDevicePixelRatio: window.devicePixelRatio || 1,
        touchPoints: navigator.maxTouchPoints || 0
      },
      map: {
        widthTiles: map[0]?.length || 0,
        heightTiles: map.length,
        seed: gameState.mapSeed,
        players: gameState.playerCount,
        oreFields: gameState.mapOreFieldCount,
        oreTotalValue: gameState.mapOreTotalValue,
        waterPercent: gameState.mapWaterPercent,
        rockPercent: gameState.mapRockPercent,
        shoreNorth: Boolean(gameState.mapShoreNorth),
        shoreWest: Boolean(gameState.mapShoreWest),
        shoreEast: Boolean(gameState.mapShoreEast),
        shoreSouth: Boolean(gameState.mapShoreSouth),
        centerLake: Boolean(gameState.mapCenterLake),
        biome: gameState.activeSpriteSheetBiomeTag,
        biomeRegions: gameState.mapBiomeRegionCount,
        biomeDistribution: gameState.mapBiomeDistribution,
        biomeWeights: { ...gameState.mapBiomeWeights },
        snowOnPlateaus: Boolean(gameState.mapSnowOnPlateaus),
        scrollOffset: { x: round(gameState.scrollOffset?.x || 0), y: round(gameState.scrollOffset?.y || 0) }
      },
      game: {
        speedMultiplier: gameState.speedMultiplier,
        gameTime: round(gameState.gameTime),
        paused: gameState.gamePaused,
        frameLimiterEnabled: gameState.frameLimiterEnabled !== false,
        integratedSpriteSheetMode: Boolean(gameState.useIntegratedSpriteSheetMode),
        entities: {
          units: gameState.units?.length || 0,
          buildings: gameState.buildings?.length || 0,
          factories: gameState.factories?.length || 0,
          bullets: gameState.bullets?.length || 0,
          explosions: gameState.explosions?.length || 0,
          smokeParticles: gameState.smokeParticles?.length || 0
        }
      },
      canvases: {
        game: getCanvasSnapshot(gameCanvas),
        webgl: getCanvasSnapshot(gameGlCanvas),
        webgpu: getCanvasSnapshot(gameGpuCanvas),
        configuredCanvasPixelRatio: Number.isFinite(gameState.canvasPixelRatio)
          ? round(gameState.canvasPixelRatio)
          : null,
        overlayCanvasPixelRatio: Number.isFinite(gameState.overlayCanvasPixelRatio)
          ? round(gameState.overlayCanvasPixelRatio)
          : null
      },
      renderer: {
        gpuTerrain: renderStats.gpuTerrain || null,
        mapChunks: renderStats.mapChunks || null,
        gpuTiming: normalizeGpuTiming(renderStats.gpuTiming || diagnostics.gpuTiming),
        gpuMemory: { available: false, reason: 'browser API unavailable', bytes: null },
        heap: summarizeHeap(this.heapSamples),
        byteUsage: diagnostics.byteUsage
      },
      timingMs: metrics,
      profiler: renderProfiler.exportReport(),
      diagnostics: {
        schemaVersion: diagnostics.schemaVersion,
        backend: diagnostics.backend,
        devicePixelRatio: diagnostics.devicePixelRatio,
        refreshRateHz: diagnostics.refreshRateHz,
        recordingCounterTotals: renderDiagnostics.getCounterDelta(this.counterBaseline),
        lifetimeCounterTotals: diagnostics.counters
      },
      scheduler: {
        sources: { ...this.schedulerSources },
        watchdogShare: round(
          this.schedulerSources.watchdog /
          Math.max(1, Object.values(this.schedulerSources).reduce((sum, count) => sum + count, 0))
        )
      }
    }
  }
}

function getCanvasSnapshot(canvas) {
  if (!canvas) return null
  const width = canvas.clientWidth || 0
  return {
    cssWidth: width,
    cssHeight: canvas.clientHeight || 0,
    backingWidth: canvas.width || 0,
    backingHeight: canvas.height || 0,
    pixelRatio: width > 0 ? round(canvas.width / width) : null
  }
}

function normalizeGpuTiming(timing) {
  if (timing?.available === true && isFiniteNumber(timing.milliseconds)) {
    return { available: true, reason: null, milliseconds: round(timing.milliseconds) }
  }
  return {
    available: false,
    reason: timing?.reason || 'GPU timer query unavailable or not instrumented',
    milliseconds: null
  }
}

function summarizeHeap(samples) {
  if (!samples.length) {
    return {
      available: false,
      reason: 'performance.memory unavailable',
      usedBytes: null,
      trend: null
    }
  }
  let minimum = Infinity
  let maximum = -Infinity
  let suspectedDrops = 0
  for (let index = 0; index < samples.length; index++) {
    const value = samples[index].usedBytes
    minimum = Math.min(minimum, value)
    maximum = Math.max(maximum, value)
    if (index > 0 && value < samples[index - 1].usedBytes) suspectedDrops++
  }
  const first = samples[0].usedBytes
  const last = samples[samples.length - 1].usedBytes
  return {
    available: true,
    reason: null,
    usedBytes: last,
    trend: {
      samples: samples.length,
      firstBytes: first,
      lastBytes: last,
      minBytes: minimum,
      maxBytes: maximum,
      deltaBytes: last - first,
      suspectedCollectionDrops: suspectedDrops,
      note: 'Heap drops are suspected collections unless confirmed by a trace'
    }
  }
}

export const performanceMonitor = new PerformanceMonitor()

function setButtonState(button, recording) {
  button.classList.toggle('recording', recording)
  button.setAttribute('aria-pressed', String(recording))
  button.title = recording ? 'Stop performance recording' : 'Record performance snapshot'
  button.setAttribute('aria-label', button.title)
}

function showReport(report) {
  const dialog = document.getElementById('performanceMonitorDialog')
  const output = document.getElementById('performanceMonitorOutput')
  if (!dialog || !output) return
  output.value = JSON.stringify(report, null, 2)
  dialog.hidden = false
  output.focus({ preventScroll: true })
  output.select()
}

async function copyReport() {
  const output = document.getElementById('performanceMonitorOutput')
  if (!output) return false
  output.select()
  try {
    await navigator.clipboard.writeText(output.value)
    return true
  } catch {
    return Boolean(document.execCommand?.('copy'))
  }
}

export function initializePerformanceMonitor() {
  if (!isPerformanceMonitorEnabled || typeof document === 'undefined' || document.getElementById('performanceMonitorButton')) return
  const actions = document.getElementById('actions')
  if (!actions) return

  const button = document.createElement('button')
  button.id = 'performanceMonitorButton'
  button.type = 'button'
  button.className = 'action-button icon-button performance-monitor-button'
  button.innerHTML = '<span class="button-icon" aria-hidden="true">●</span>'
  setButtonState(button, false)
  button.addEventListener('click', () => {
    if (performanceMonitor.recording) {
      const report = performanceMonitor.stop()
      setButtonState(button, false)
      showReport(report)
      return
    }
    performanceMonitor.start()
    setButtonState(button, true)
  })
  actions.appendChild(button)

  const dialog = document.createElement('div')
  dialog.id = 'performanceMonitorDialog'
  dialog.className = 'performance-monitor-dialog'
  dialog.hidden = true
  dialog.innerHTML = '<div class="performance-monitor-dialog__panel" role="dialog" aria-modal="true" aria-label="Performance snapshot"><div class="performance-monitor-dialog__actions"><button type="button" id="performanceMonitorCopy">Copy</button><button type="button" id="performanceMonitorClose" aria-label="Close performance snapshot">X</button></div><textarea id="performanceMonitorOutput" readonly aria-label="Performance snapshot JSON"></textarea></div>'
  document.body.appendChild(dialog)
  dialog.querySelector('#performanceMonitorCopy').addEventListener('click', async(event) => {
    const copied = await copyReport()
    event.currentTarget.textContent = copied ? 'Copied' : 'Select all'
  })
  dialog.querySelector('#performanceMonitorClose').addEventListener('click', () => { dialog.hidden = true })
  window.getPerformanceMonitorReport = () => performanceMonitor.report
}
