import { describe, expect, it } from 'vitest'
import { classifyRefreshCapability, createTimedRoute, routeDistance, summarizeFrameIntervals } from '../../scripts/performance/benchmarkMetrics.js'
import { summarizeAssetMetadata } from '../../scripts/performance/resizeAssetAudit.js'

describe('rendering benchmark tools', () => {
  it('reports strict 75 FPS deadline tails and misses', () => {
    const report = summarizeFrameIntervals([10, 12, 13.333, 13.334, 20])
    expect(report.deadlineMs).toBeCloseTo(13.333333, 5)
    expect(report.p95FrameMs).toBe(20)
    expect(report.p99FrameMs).toBe(20)
    expect(report.missedDeadlineFrames).toBe(2)
    expect(report.passed75Fps).toBe(false)
  })

  it('builds timed serpentine routes with reversals and measurable distance', () => {
    const route = createTimedRoute({ width: 3200, height: 2400, viewportWidth: 800, viewportHeight: 600, laps: 2 })
    expect(route[0]).toEqual({ x: 0, y: 0 })
    expect(route.some((point, index) => index > 0 && point.x < route[index - 1].x)).toBe(true)
    expect(routeDistance(route)).toBeGreaterThan(10000)
  })

  it('does not call software or unknown displays physically certified', () => {
    expect(classifyRefreshCapability({ refreshRateHz: 144, backend: 'webgl2', headless: false }).displayEligible).toBe(true)
    const software = classifyRefreshCapability({ refreshRateHz: 144, backend: 'software', headless: false })
    expect(software.backend).toBe('software-fallback')
    expect(software.displayEligible).toBe(false)
    expect(classifyRefreshCapability({ refreshRateHz: 60, backend: 'webgl2', headless: false }).certification).toBe('diagnostic-only')
  })

  it('keeps decoded and transferred asset bytes separate', () => {
    expect(summarizeAssetMetadata([
      { name: 'shore.webp', decodedBodySize: 100, transferSize: 40 },
      { name: 'unit.webp', decodedBodySize: 200, transferSize: 70 }
    ])).toMatchObject({ assetCount: 2, decodedBytes: 300, transferBytes: 110 })
  })
})
