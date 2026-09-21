import { beforeEach, describe, expect, it } from 'vitest'
import { PerformanceMonitor } from '../../src/performance/performanceMonitor.js'
import { RENDER_COUNTER_IDS, renderDiagnostics } from '../../src/performance/renderDiagnostics.js'

describe('PerformanceMonitor', () => {
  beforeEach(() => renderDiagnostics.resetForTests())

  it('keeps a fixed-size aggregate report while recording arbitrary frame counts', () => {
    const monitor = new PerformanceMonitor()
    monitor.start()

    for (let index = 0; index < 10000; index++) {
      monitor.recordRendererPhases({ terrainMs: 8, entitiesMs: 2, effectsMs: 1, uiMs: 3 })
      monitor.recordFrame({
        frameInterval: 20,
        updateMs: 4,
        renderMs: 14,
        minimapMs: index % 4 === 0 ? 2 : 0,
        frameWorkMs: 18,
        unattributedWaitMs: 2,
        schedulerSource: index % 5 === 0 ? 'watchdog' : 'raf',
        schedulerDelayMs: index % 5 === 0 ? 17 : 16
      })
    }

    const report = monitor.stop()

    expect(report.timingMs.frameInterval).toMatchObject({
      samples: 10000,
      averageMs: 20,
      minMs: 20,
      maxMs: 20
    })
    expect(report.timingMs.terrain.samples).toBe(10000)
    expect(report.timingMs.terrain.averageMs).toBe(8)
    expect(report.timingMs.schedulerDelay.averageMs).toBe(16.2)
    expect(report.timingMs.unattributedWait.averageMs).toBe(2)
    expect(report.scheduler.sources).toMatchObject({ raf: 8000, watchdog: 2000 })
    expect(report.scheduler.watchdogShare).toBe(0.2)
    expect(report.renderer.gpuTiming).toMatchObject({ available: false, milliseconds: null })
    expect(report.renderer.gpuMemory).toMatchObject({ available: false, bytes: null })
    expect(report.renderer.heap.available).toBe(false)
    expect(JSON.stringify(report).length).toBeLessThan(20000)
  })

  it('retains cumulative diagnostic counters across a recording', () => {
    const monitor = new PerformanceMonitor()
    monitor.start()
    monitor.recordDiagnosticCounter(RENDER_COUNTER_IDS.DRAW_CALLS, 4)
    monitor.recordDiagnosticCounter(RENDER_COUNTER_IDS.DRAW_CALLS, 7)
    monitor.recordDiagnosticCounter(RENDER_COUNTER_IDS.UPLOAD_BYTES, 256)
    monitor.recordDiagnosticCounter(RENDER_COUNTER_IDS.RESIZE_EVENTS, 2)

    const report = monitor.stop()

    expect(report.diagnostics.recordingCounterTotals).toMatchObject({
      DRAW_CALLS: 11,
      UPLOAD_BYTES: 256,
      RESIZE_EVENTS: 2
    })
    expect(report.diagnostics.lifetimeCounterTotals.DRAW_CALLS).toBe(11)
  })

  it('samples bounded low-rate heap trends and labels suspected drops', () => {
    let now = 0
    let heapBytes = 100
    const monitor = new PerformanceMonitor({ now: () => now, heapBytes: () => heapBytes })
    monitor.start()

    now = 500
    heapBytes = 120
    monitor.recordFrame({ frameInterval: 16 })
    now = 1000
    heapBytes = 90
    monitor.recordFrame({ frameInterval: 16 })
    now = 2000
    heapBytes = 130
    monitor.recordFrame({ frameInterval: 16 })
    now = 2500

    const report = monitor.stop()

    expect(report.renderer.heap).toMatchObject({
      available: true,
      usedBytes: 130,
      trend: {
        samples: 3,
        firstBytes: 100,
        lastBytes: 130,
        deltaBytes: 30,
        suspectedCollectionDrops: 1
      }
    })
  })
})
