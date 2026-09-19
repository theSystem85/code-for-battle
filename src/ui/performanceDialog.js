import { gameState } from '../gameState.js'
import { isFunctionTimingEnabled, setFunctionTimingEnabled } from '../performance/functionTiming.js'
import { renderProfiler } from '../performance/renderProfiler.js'
import { resetPerformanceStatistics } from '../performanceUtils.js'

const REFRESH_INTERVAL_MS = 250

function format(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.00'
}

export class PerformanceDialog {
  constructor() {
    this.container = document.getElementById('performanceDialog')
    this.sortMode = 'selfTotalMs'
    this.intervalId = null
    if (!this.container) return

    this.container.innerHTML = `
      <div class="perf-controls">
        <label class="perf-toggle"><input id="perfFunctionTimings" type="checkbox"> Function timings</label>
        <button id="perfSortSelf" type="button">Self cost</button>
        <button id="perfSortName" type="button">Name</button>
        <button id="perfReset" type="button">Reset</button>
      </div>
      <div id="perfCapabilities" class="perf-capabilities"></div>
      <div id="perfContent"></div>
    `
    this.contentEl = this.container.querySelector('#perfContent')
    this.capabilitiesEl = this.container.querySelector('#perfCapabilities')
    this.functionTimingsEl = this.container.querySelector('#perfFunctionTimings')
    this.functionTimingsEl.checked = isFunctionTimingEnabled()
    this.functionTimingsEl.addEventListener('change', event => {
      setFunctionTimingEnabled(event.currentTarget.checked)
      this.render()
    })
    this.container.querySelector('#perfSortName').addEventListener('click', () => {
      this.sortMode = 'name'
      this.render()
    })
    this.container.querySelector('#perfSortSelf').addEventListener('click', () => {
      this.sortMode = 'selfTotalMs'
      this.render()
    })
    this.container.querySelector('#perfReset').addEventListener('click', () => this.resetStatistics())
  }

  toggle() {
    if (!this.container) return
    gameState.performanceVisible = !gameState.performanceVisible
    if (gameState.performanceVisible) {
      this.container.classList.add('visible')
      this.start()
    } else {
      this.container.classList.remove('visible')
      this.stop()
    }
  }

  start() {
    if (this.intervalId) return
    this.render()
    this.intervalId = setInterval(() => this.render(), REFRESH_INTERVAL_MS)
  }

  stop() {
    if (!this.intervalId) return
    clearInterval(this.intervalId)
    this.intervalId = null
  }

  resetStatistics() {
    renderProfiler.reset()
    resetPerformanceStatistics()
    this.render()
  }

  renderCapabilities() {
    if (!this.capabilitiesEl) return
    const heapBytes = typeof performance !== 'undefined' ? performance.memory?.usedJSHeapSize : null
    const gpuTiming = gameState.renderStats?.gpuTiming
    const heapLabel = Number.isFinite(heapBytes)
      ? `JS heap ${(heapBytes / (1024 * 1024)).toFixed(1)} MiB (sampled)`
      : 'JS heap unavailable (browser API)'
    const gpuLabel = gpuTiming?.available && Number.isFinite(gpuTiming.milliseconds)
      ? `GPU ${format(gpuTiming.milliseconds)} ms (instrumented passes)`
      : `GPU timing unavailable (${gpuTiming?.reason || 'not instrumented'})`
    this.capabilitiesEl.textContent = `${heapLabel} · ${gpuLabel} · Frame residual is unattributed wait`
  }

  render() {
    if (!this.contentEl || !gameState.performanceVisible) return
    this.renderCapabilities()
    if (!isFunctionTimingEnabled()) {
      this.contentEl.textContent = 'Function timings are off. Enable them above to collect bounded live samples.'
      return
    }

    const snapshot = renderProfiler.getSnapshot({ sortBy: this.sortMode, limit: 30 })
    const table = document.createElement('table')
    table.className = 'perf-table'
    table.innerHTML = `
      <thead><tr>
        <th>Function</th><th>Self ms/s · ms/f</th><th>Incl ms/f</th><th>Calls/f · mean</th>
        <th>Call p95 · p99 · max</th><th>Frame p95 · p99 · max</th><th>Budget</th><th>Slow overlap</th>
      </tr></thead>
    `
    const body = document.createElement('tbody')
    for (const row of snapshot.rows) {
      const tr = document.createElement('tr')
      tr.classList.toggle('perf-over-budget', row.frameSelfMs.max > snapshot.slowFrameThresholdMs)
      const cells = [
        `${row.name} [${row.id}]`,
        `${format(row.selfMsPerSecond)} · ${format(row.selfMsPerFrame)}`,
        format(row.inclusiveMsPerFrame),
        `${format(row.callsPerFrame)} · ${format(row.meanSelfMsPerCall, 3)}`,
        `${format(row.callSelfMs.p95, 3)} · ${format(row.callSelfMs.p99, 3)} · ${format(row.callSelfMs.max, 3)}`,
        `${format(row.frameSelfMs.p95, 3)} · ${format(row.frameSelfMs.p99, 3)} · ${format(row.frameSelfMs.max, 3)}`,
        `${format(row.cpuBudgetPercent, 1)}%`,
        `${row.slowFrameCorrelation.overlapFrames}/${row.slowFrameCorrelation.slowFrames} (${format(row.slowFrameCorrelation.rate * 100, 0)}%)`
      ]
      for (const text of cells) {
        const cell = document.createElement('td')
        cell.textContent = text
        tr.appendChild(cell)
      }
      body.appendChild(tr)
    }
    table.appendChild(body)
    this.contentEl.replaceChildren(table)
  }
}

export const performanceDialog = new PerformanceDialog()
