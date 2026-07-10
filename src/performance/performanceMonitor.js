import { gameState } from '../gameState.js'

const SLOW_FRAME_MS = 1000 / 30

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

export const isPerformanceMonitorEnabled = getQueryMonitorEnabled()

export class PerformanceMonitor {
  constructor() {
    this.recording = false
    this.startedAt = 0
    this.endedAt = 0
    this.metrics = this.createMetrics()
    this.lastRendererPhases = null
    this.report = null
  }

  createMetrics() {
    return {
      frameInterval: createMetric(),
      update: createMetric(),
      render: createMetric(),
      minimap: createMetric(),
      frameWork: createMetric(),
      compositorWait: createMetric(),
      terrain: createMetric(),
      entities: createMetric(),
      effects: createMetric(),
      ui: createMetric()
    }
  }

  start() {
    this.recording = true
    this.startedAt = performance.now()
    this.endedAt = 0
    this.metrics = this.createMetrics()
    this.lastRendererPhases = null
    this.report = null
    return this.getStatus()
  }

  stop() {
    if (!this.recording) return this.report
    this.recording = false
    this.endedAt = performance.now()
    this.report = this.buildReport()
    return this.report
  }

  recordRendererPhases(phases) {
    if (!this.recording || !phases) return
    this.lastRendererPhases = phases
  }

  recordFrame(frame) {
    if (!this.recording) return
    const { frameInterval, updateMs, renderMs, minimapMs, frameWorkMs, compositorWaitMs } = frame || {}
    addMetric(this.metrics.frameInterval, frameInterval)
    addMetric(this.metrics.update, updateMs)
    addMetric(this.metrics.render, renderMs)
    addMetric(this.metrics.minimap, minimapMs)
    addMetric(this.metrics.frameWork, frameWorkMs)
    addMetric(this.metrics.compositorWait, compositorWaitMs)
    if (this.lastRendererPhases) {
      addMetric(this.metrics.terrain, this.lastRendererPhases.terrainMs)
      addMetric(this.metrics.entities, this.lastRendererPhases.entitiesMs)
      addMetric(this.metrics.effects, this.lastRendererPhases.effectsMs)
      addMetric(this.metrics.ui, this.lastRendererPhases.uiMs)
    }
  }

  getStatus() {
    return {
      recording: this.recording,
      durationMs: this.recording ? performance.now() - this.startedAt : Math.max(0, this.endedAt - this.startedAt)
    }
  }

  buildReport() {
    const map = gameState.mapGrid || []
    const gameCanvas = document.getElementById('gameCanvas')
    const gameGlCanvas = document.getElementById('gameCanvasGL')
    const metrics = Object.fromEntries(Object.entries(this.metrics).map(([name, metric]) => [name, summarizeMetric(metric)]))
    const durationMs = Math.max(0, this.endedAt - this.startedAt)
    const frameAverage = metrics.frameInterval.averageMs
    const renderStats = gameState.renderStats || {}

    return {
      version: 1,
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
        configuredCanvasPixelRatio: gameState.canvasPixelRatio || null
      },
      renderer: {
        gpuTerrain: renderStats.gpuTerrain || null,
        mapChunks: renderStats.mapChunks || null,
        jsHeapMb: getJsHeapMb()
      },
      timingMs: metrics
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

function getJsHeapMb() {
  const bytes = typeof performance !== 'undefined' ? performance.memory?.usedJSHeapSize : null
  return isFiniteNumber(bytes) ? round(bytes / (1024 * 1024)) : null
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
