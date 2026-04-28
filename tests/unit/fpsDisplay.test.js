import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    fpsVisible: true,
    frameLimiterEnabled: true,
    fpsCounter: {},
    llmUsage: {},
    lockstep: {},
    multiplayerSession: { localRole: 'host' }
  }
}))

vi.mock('../../src/benchmark/benchmarkTracker.js', () => ({
  notifyBenchmarkFrame: vi.fn()
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({
  getNetworkStats: () => ({ bytesSent: 0, bytesReceived: 0, sendRate: 0, receiveRate: 0 }),
  isLockstepEnabled: () => false
}))

vi.mock('../../src/ai/llmSettings.js', () => ({
  getLlmSettings: () => ({ strategic: { enabled: false }, commentary: { enabled: false } })
}))

import { FPSDisplay } from '../../src/ui/fpsDisplay.js'

describe('FPSDisplay bottleneck monitor', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="fpsDisplay">
        <div id="fpsValue"></div>
        <div id="frameTimeValue"></div>
        <div id="frameTimeMin"></div>
        <div id="frameTimeMax"></div>
        <div id="fpsBottleneck"></div>
        <div id="fpsLlmTokens"></div>
        <div id="fpsLlmSpend"></div>
        <div id="networkStatsContainer"></div>
        <div id="networkSendRate"></div>
        <div id="networkRecvRate"></div>
        <div id="networkTotalSent"></div>
        <div id="networkTotalRecv"></div>
        <div id="lockstepStatsContainer"></div>
        <div id="lockstepStatus"></div>
        <div id="lockstepTick"></div>
        <div id="lockstepDesync"></div>
      </div>
    `
  })

  it('reports CPU bottlenecks when frame times are high with long tasks', () => {
    const display = new FPSDisplay()
    display.avgFrameTime = 40
    display.longTaskTimeMs = 300
    display.lastBottleneckSampleAt = 1000

    display.updateBottleneckStats(2000)

    expect(display.bottleneckSnapshot.type).toBe('cpu')
    expect(display.bottleneckSnapshot.details).toContain('long-tasks')
  })

  it('reports GPU/fill-rate bottlenecks when frame times are high without long tasks', () => {
    const display = new FPSDisplay()
    display.avgFrameTime = 22
    display.longTaskTimeMs = 20
    display.lastBottleneckSampleAt = 1000

    display.updateBottleneckStats(2000)

    expect(display.bottleneckSnapshot.type).toBe('gpu/fill-rate')
  })
})
