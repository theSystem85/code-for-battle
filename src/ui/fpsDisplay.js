// fpsDisplay.js - FPS overlay system using DOM element
import { gameState } from '../gameState.js'
import { notifyBenchmarkFrame } from '../benchmark/benchmarkTracker.js'
import { getNetworkStats, isLockstepEnabled } from '../network/gameCommandSync.js'
import { getLlmSettings } from '../ai/llmSettings.js'

export class FPSDisplay {
  constructor() {
    this.frameCount = 0
    this.lastTime = performance.now()
    this.fps = 0
    this.frameTimes = []
    this.maxFrameTimes = 60 // Store last 60 frame times for smooth averaging

    // Frame time tracking
    this.lastFrameTimestamp = performance.now()
    this.frameTimeSamples = []
    this.updatePhaseSamples = []
    this.renderPhaseSamples = []
    this.idlePhaseSamples = []
    this.lastFrameTimeUpdate = performance.now()
    this.avgFrameTime = 0
    this.minFrameTime = 0
    this.maxFrameTime = 0
    this.lastDomUpdate = performance.now()

    // Network stats tracking
    this.lastNetworkUpdate = performance.now()
    this.lastBytesSent = 0
    this.lastBytesReceived = 0

    // Get the DOM element
    this.fpsElement = document.getElementById('fpsDisplay')
    if (!this.fpsElement) {
      console.error('FPS display element not found!')
    }

    this.fpsValueEl = document.getElementById('fpsValue')
    this.frameTimeEl = document.getElementById('frameTimeValue')
    this.frameTimeMinEl = document.getElementById('frameTimeMin')
    this.frameTimeMaxEl = document.getElementById('frameTimeMax')
    this.fpsLlmTokensEl = document.getElementById('fpsLlmTokens')
    this.fpsLlmSpendEl = document.getElementById('fpsLlmSpend')
    this.frameBottleneckEl = document.getElementById('frameBottleneck')
    this.frameCpuUpdateEl = document.getElementById('frameCpuUpdate')
    this.frameCpuRenderEl = document.getElementById('frameCpuRender')
    this.frameGpuEstimateEl = document.getElementById('frameGpuEstimate')
    this.frameChunkStatsEl = document.getElementById('frameChunkStats')
    this.frameJsHeapEl = document.getElementById('frameJsHeap')

    // Network stats elements
    this.networkStatsContainer = document.getElementById('networkStatsContainer')
    this.networkSendRateEl = document.getElementById('networkSendRate')
    this.networkRecvRateEl = document.getElementById('networkRecvRate')
    this.networkTotalSentEl = document.getElementById('networkTotalSent')
    this.networkTotalRecvEl = document.getElementById('networkTotalRecv')

    // Lockstep stats elements
    this.lockstepStatsContainer = document.getElementById('lockstepStatsContainer')
    this.lockstepStatusEl = document.getElementById('lockstepStatus')
    this.lockstepTickEl = document.getElementById('lockstepTick')
    this.lockstepDesyncEl = document.getElementById('lockstepDesync')
  }

  updateFPS(currentTime) {
    this.frameCount++

    // Add current frame time to array
    this.frameTimes.push(currentTime)

    // Track frame time for display
    const frameTime = currentTime - this.lastFrameTimestamp
    this.lastFrameTimestamp = currentTime
    this.frameTimeSamples.push(frameTime)

    notifyBenchmarkFrame({ timestamp: currentTime, frameTime })

    // Keep only the last 60 frame times
    if (this.frameTimes.length > this.maxFrameTimes) {
      this.frameTimes.shift()
    }

    // Calculate FPS every 10 frames for better performance
    if (this.frameCount % 10 === 0 && this.frameTimes.length >= 2) {
      const timeDiff = this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0]
      const frameCount = this.frameTimes.length - 1

      if (timeDiff > 0) {
        this.fps = Math.round((frameCount * 1000) / timeDiff)
      }

      // Update gameState for consistency
      gameState.fpsCounter.fps = this.fps
      gameState.fpsCounter.frameCount = this.frameCount
      gameState.fpsCounter.lastTime = currentTime
      gameState.fpsCounter.frameTimes = [...this.frameTimes]

      // Throttle DOM updates to once per second
      if (currentTime - this.lastDomUpdate >= 1000) {
        this.updateDisplay(currentTime)
      }
    }

    // Update frame time display every second
    if (currentTime - this.lastFrameTimeUpdate >= 1000) {
      const len = this.frameTimeSamples.length
      if (len > 0) {
        const sum = this.frameTimeSamples.reduce((a, b) => a + b, 0)
        this.avgFrameTime = sum / len
        this.minFrameTime = Math.min(...this.frameTimeSamples)
        this.maxFrameTime = Math.max(...this.frameTimeSamples)

        // Update gameState for consistency
        gameState.fpsCounter.avgFrameTime = this.avgFrameTime
        gameState.fpsCounter.minFrameTime = this.minFrameTime
        gameState.fpsCounter.maxFrameTime = this.maxFrameTime
      }

      this.frameTimeSamples = []
      this.updatePhaseSamples = []
      this.renderPhaseSamples = []
      this.idlePhaseSamples = []
      this.lastFrameTimeUpdate = currentTime
      if (currentTime - this.lastDomUpdate >= 1000) {
        this.updateDisplay(currentTime)
      }
    }
  }

  reportFrameBreakdown(breakdown = {}) {
    const updateMs = Number.isFinite(breakdown.updateMs) ? Math.max(0, breakdown.updateMs) : 0
    const renderMs = Number.isFinite(breakdown.renderMs) ? Math.max(0, breakdown.renderMs) : 0
    const idleMs = Number.isFinite(breakdown.idleMs) ? Math.max(0, breakdown.idleMs) : 0
    this.updatePhaseSamples.push(updateMs)
    this.renderPhaseSamples.push(renderMs)
    this.idlePhaseSamples.push(idleMs)
  }

  getAverage(samples) {
    if (!Array.isArray(samples) || !samples.length) return 0
    const sum = samples.reduce((acc, value) => acc + value, 0)
    return sum / samples.length
  }

  getBottleneckLabel(updateAvg, renderAvg, idleAvg) {
    const dominant = Math.max(updateAvg, renderAvg, idleAvg)
    if (dominant <= 0.01) return 'Unknown'
    if (dominant === updateAvg) return 'CPU (simulation/update)'
    if (dominant === renderAvg) return 'CPU render / draw submission'
    return 'GPU/compositor/wait'
  }

  updateDisplay(currentTime = performance.now()) {
    if (currentTime - this.lastDomUpdate < 1000) {
      return
    }
    this.lastDomUpdate = currentTime
    if (!this.fpsElement) return

    if (gameState.fpsVisible) {
      if (this.fpsValueEl) {
        const modeLabel = gameState.frameLimiterEnabled !== false ? 'capped' : 'uncapped'
        this.fpsValueEl.textContent = `FPS: ${this.fps} (${modeLabel})`
      } else {
        const modeLabel = gameState.frameLimiterEnabled !== false ? 'capped' : 'uncapped'
        this.fpsElement.textContent = `FPS: ${this.fps} (${modeLabel})`
      }

      if (this.frameTimeEl) {
        this.frameTimeEl.textContent = `Frame: ${this.avgFrameTime.toFixed(1)} ms`
      }
      if (this.frameTimeMinEl) {
        this.frameTimeMinEl.textContent = `Min: ${this.minFrameTime.toFixed(1)} ms`
      }
      if (this.frameTimeMaxEl) {
        this.frameTimeMaxEl.textContent = `Max: ${this.maxFrameTime.toFixed(1)} ms`
      }

      const updateAvg = this.getAverage(this.updatePhaseSamples)
      const renderAvg = this.getAverage(this.renderPhaseSamples)
      const idleAvg = this.getAverage(this.idlePhaseSamples)
      if (this.frameBottleneckEl) {
        this.frameBottleneckEl.textContent = `Bottleneck: ${this.getBottleneckLabel(updateAvg, renderAvg, idleAvg)}`
      }
      if (this.frameCpuUpdateEl) {
        this.frameCpuUpdateEl.textContent = `CPU Update: ${updateAvg.toFixed(1)} ms`
      }
      if (this.frameCpuRenderEl) {
        this.frameCpuRenderEl.textContent = `CPU Render: ${renderAvg.toFixed(1)} ms`
      }
      if (this.frameGpuEstimateEl) {
        this.frameGpuEstimateEl.textContent = `GPU/Wait: ${idleAvg.toFixed(1)} ms`
      }
      if (this.frameChunkStatsEl) {
        const chunkStats = gameState.renderStats?.mapChunks
        this.frameChunkStatsEl.textContent = chunkStats
          ? `Chunks: ${chunkStats.chunksDrawn} drawn, ${chunkStats.chunkHits} hit, ${chunkStats.chunkMisses} miss, ${chunkStats.chunkRedraws} redraw`
          : 'Chunks: n/a'
      }
      if (this.frameJsHeapEl) {
        const heapBytes = typeof performance !== 'undefined' && performance.memory
          ? performance.memory.usedJSHeapSize
          : null
        this.frameJsHeapEl.textContent = Number.isFinite(heapBytes)
          ? `JS Heap: ${(heapBytes / (1024 * 1024)).toFixed(1)} MB`
          : 'JS Heap: n/a'
      }

      const llmSettings = getLlmSettings()
      const llmEnabled = Boolean(llmSettings?.strategic?.enabled || llmSettings?.commentary?.enabled)
      if (this.fpsLlmTokensEl) {
        this.fpsLlmTokensEl.style.display = llmEnabled ? 'block' : 'none'
      }
      if (this.fpsLlmSpendEl) {
        this.fpsLlmSpendEl.style.display = llmEnabled ? 'block' : 'none'
      }
      if (llmEnabled) {
        const llmUsage = gameState.llmUsage || { totalTokens: 0, totalCostUsd: 0 }
        if (this.fpsLlmTokensEl) {
          this.fpsLlmTokensEl.textContent = `Tokens: ${Math.round(llmUsage.totalTokens || 0)}`
        }
        if (this.fpsLlmSpendEl) {
          this.fpsLlmSpendEl.textContent = `Spend: $${(llmUsage.totalCostUsd || 0).toFixed(4)}`
        }
      }

      // Update network stats if multiplayer is active
      this.updateNetworkStats(currentTime)

      // Update lockstep stats if lockstep is enabled
      this.updateLockstepStats()

      this.fpsElement.classList.add('visible')

      // Remove old color classes
      this.fpsElement.classList.remove('fps-good', 'fps-ok', 'fps-poor', 'fps-bad')

      // Add appropriate color class based on FPS
      const colorClass = this.getFPSColorClass(this.fps)
      this.fpsElement.classList.add(colorClass)
    } else {
      this.fpsElement.classList.remove('visible')
    }
  }

  updateNetworkStats(_currentTime) {
    // Get current network stats
    const stats = getNetworkStats()

    // Only show network stats if there's any network activity
    const hasNetworkActivity = stats.bytesSent > 0 || stats.bytesReceived > 0

    if (!hasNetworkActivity || !this.networkStatsContainer) {
      if (this.networkStatsContainer) {
        this.networkStatsContainer.style.display = 'none'
      }
      return
    }

    this.networkStatsContainer.style.display = 'block'

    // Format rates (already calculated by gameCommandSync)
    if (this.networkSendRateEl) {
      this.networkSendRateEl.textContent = `↑ ${this.formatBytes(stats.sendRate)}/s`
    }
    if (this.networkRecvRateEl) {
      this.networkRecvRateEl.textContent = `↓ ${this.formatBytes(stats.receiveRate)}/s`
    }
    if (this.networkTotalSentEl) {
      this.networkTotalSentEl.textContent = `Sent: ${this.formatBytes(stats.bytesSent)}`
    }
    if (this.networkTotalRecvEl) {
      this.networkTotalRecvEl.textContent = `Recv: ${this.formatBytes(stats.bytesReceived)}`
    }
  }

  formatBytes(bytes) {
    if (bytes < 1024) {
      return `${Math.round(bytes)} B`
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    }
  }

  updateLockstepStats() {
    const lockstepEnabled = isLockstepEnabled()

    if (!lockstepEnabled || !this.lockstepStatsContainer) {
      if (this.lockstepStatsContainer) {
        this.lockstepStatsContainer.style.display = 'none'
      }
      return
    }

    this.lockstepStatsContainer.style.display = 'block'

    // Get lockstep state from gameState
    const lockstep = gameState.lockstep || {}

    // Update status
    if (this.lockstepStatusEl) {
      const role = gameState.multiplayerSession?.localRole === 'host' ? 'Host' : 'Client'
      this.lockstepStatusEl.textContent = `⚙ Lockstep: ${role}`
      this.lockstepStatusEl.style.color = lockstep.desyncDetected ? '#ff6b6b' : '#4ade80'
    }

    // Update tick counter
    if (this.lockstepTickEl) {
      this.lockstepTickEl.textContent = `Tick: ${lockstep.currentTick || 0}`
    }

    // Show/hide desync warning
    if (this.lockstepDesyncEl) {
      if (lockstep.desyncDetected) {
        this.lockstepDesyncEl.style.display = 'block'
        this.lockstepDesyncEl.textContent = `⚠ Desync at tick ${lockstep.desyncTick || '?'}!`
      } else {
        this.lockstepDesyncEl.style.display = 'none'
      }
    }
  }

  getFPSColorClass(fps) {
    // Return CSS class based on FPS performance
    if (fps >= 60) {
      return 'fps-good' // Green for good performance
    } else if (fps >= 30) {
      return 'fps-ok' // Yellow for acceptable performance
    } else if (fps >= 15) {
      return 'fps-poor' // Orange for poor performance
    } else {
      return 'fps-bad' // Red for very poor performance
    }
  }

  // Legacy render method for compatibility (now just updates display)
  render(_ctx, _canvas) {
    this.updateDisplay()
  }

  toggleVisibility() {
    gameState.fpsVisible = !gameState.fpsVisible
    this.updateDisplay()
  }

  isVisible() {
    return gameState.fpsVisible
  }
}
