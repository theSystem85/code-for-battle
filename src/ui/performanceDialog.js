import { gameState } from '../gameState.js'
import { isFunctionTimingEnabled, setFunctionTimingEnabled } from '../performance/functionTiming.js'

class PerformanceDialog {
  constructor() {
    this.container = document.getElementById('performanceDialog')
    this.sortMode = 'duration'
    this.intervalId = null
    if (this.container) {
      this.container.innerHTML = `
        <div class="perf-controls">
          <label><input type="checkbox" id="perfFunctionTimings"> Function timings</label>
          <button id="perfSortName">Name</button>
          <button id="perfSortDuration">Avg</button>
          <button id="perfReset">Reset</button>
        </div>
        <div id="perfContent"></div>
      `
      this.contentEl = document.getElementById('perfContent')
      this.functionTimingsEl = document.getElementById('perfFunctionTimings')
      this.functionTimingsEl.checked = isFunctionTimingEnabled()
      this.functionTimingsEl.addEventListener('change', event => {
        setFunctionTimingEnabled(event.currentTarget.checked)
        if (!event.currentTarget.checked) this.resetStatistics()
        else this.render()
      })
      document.getElementById('perfSortName').addEventListener('click', () => {
        this.sortMode = 'name'
        this.render()
      })
      document.getElementById('perfSortDuration').addEventListener('click', () => {
        this.sortMode = 'duration'
        this.render()
      })
      document.getElementById('perfReset').addEventListener('click', () => {
        this.resetStatistics()
      })
    }
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
    this.render()
    this.intervalId = setInterval(() => this.render(), 2000)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  resetStatistics() {
    // Clear all performance statistics
    window.performanceStatistics = {}
    // Immediately update the display
    this.render()
  }

  render() {
    if (!this.contentEl) return
    const stats = window.performanceStatistics || {}
    const entries = Object.entries(stats)
    if (this.sortMode === 'duration') {
      entries.sort((a, b) => b[1].durationAvg - a[1].durationAvg)
    } else {
      entries.sort((a, b) => a[0].localeCompare(b[0]))
    }
    this.contentEl.innerHTML = `
      <h3>avg (ms) / max (ms) / calls</h3>
    `
    entries.forEach(([name, data]) => {
      const div1 = document.createElement('div')
      div1.textContent = name
      this.contentEl.appendChild(div1)

      const div2 = document.createElement('div')
      div2.textContent = `${data.durationAvg.toFixed(2)} / ${data.durationMax.toFixed(2)} / ${data.callCount}`
      this.contentEl.appendChild(div2)
    })
  }
}

export const performanceDialog = new PerformanceDialog()
