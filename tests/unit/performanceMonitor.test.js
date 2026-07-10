import { describe, expect, it } from 'vitest'
import { PerformanceMonitor } from '../../src/performance/performanceMonitor.js'

describe('PerformanceMonitor', () => {
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
        compositorWaitMs: 2
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
    expect(JSON.stringify(report).length).toBeLessThan(10000)
  })
})
