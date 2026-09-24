import { test, expect } from '@playwright/test'
import { classifyRefreshCapability, createTimedRoute, summarizeFrameIntervals, routeDistance } from '../../scripts/performance/benchmarkMetrics.js'
import { createResizeAuditScript, summarizeAssetMetadata } from '../../scripts/performance/resizeAssetAudit.js'
import { startCpuSampling, stopCpuSampling } from '../../scripts/performance/cdpSampling.mjs'

const RUN_BENCHMARK = process.env.PERF_RENDERING_PIPELINE === '1'
const ENFORCE_ACCEPTANCE = process.env.PERF_RENDERING_PIPELINE_ACCEPT === '1'
const DURATION_MS = Number.parseInt(process.env.PERF_RENDERING_DURATION_MS || '12000', 10)
const SPEED_PX_PER_FRAME = Number.parseFloat(process.env.PERF_RENDERING_SCROLL_PX || '256')

async function waitForReadyGame(page) {
  await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 45000 })
  await page.waitForFunction(() => Boolean(window.gameState?.gameStarted && window.gameInstance?.gameLoop), { timeout: 45000 })
}

async function collectRouteEvidence(page, route, speedPxPerFrame, durationMs) {
  return page.evaluate(async({ route, speedPxPerFrame, durationMs }) => {
    const gameState = window.gameState
    const canvas = document.getElementById('gameCanvas')
    const intervals = []
    const windows = []
    let previousTimestamp = null
    let routeIndex = 1
    let completed = false
    let windowStart = null
    let windowFrames = []
    const startedAt = performance.now()

    await new Promise(resolve => {
      const step = timestamp => {
        if (previousTimestamp !== null) {
          const interval = timestamp - previousTimestamp
          intervals.push(interval)
          if (windowStart === null) windowStart = timestamp - interval
          windowFrames.push(interval)
          if (timestamp - windowStart >= 1000) {
            windows.push({ startMs: windowStart - startedAt, ...windowSummary(windowFrames) })
            windowStart = timestamp
            windowFrames = []
          }
        }
        previousTimestamp = timestamp
        const target = route[routeIndex]
        if (target && gameState?.scrollOffset) {
          const dx = target.x - gameState.scrollOffset.x
          const dy = target.y - gameState.scrollOffset.y
          const distance = Math.hypot(dx, dy)
          if (distance <= speedPxPerFrame) {
            gameState.scrollOffset.x = target.x
            gameState.scrollOffset.y = target.y
            routeIndex += 1
            if (routeIndex >= route.length) completed = true
          } else {
            gameState.scrollOffset.x += dx * speedPxPerFrame / distance
            gameState.scrollOffset.y += dy * speedPxPerFrame / distance
          }
          window.gameInstance?.gameLoop?.requestRender?.()
        }
        if (timestamp - startedAt >= durationMs || (completed && timestamp - startedAt >= 1000)) {
          resolve()
        } else {
          requestAnimationFrame(step)
        }
      }
      requestAnimationFrame(step)
    })

    if (windowFrames.length) windows.push({ startMs: windowStart - startedAt, ...windowSummary(windowFrames) })
    function windowSummary(values) {
      const total = values.reduce((sum, value) => sum + value, 0)
      return { frameCount: values.length, fps: total ? values.length * 1000 / total : 0, maxFrameMs: Math.max(...values) }
    }
    const resources = performance.getEntriesByType('resource').map(entry => ({
      name: entry.name,
      decodedBodySize: entry.decodedBodySize,
      transferSize: entry.transferSize,
      durationMs: entry.duration
    }))
    const glCanvas = document.getElementById('gameCanvasGL')
    const gl = glCanvas?.getContext?.('webgl2') || glCanvas?.getContext?.('webgl')
    const activeBackend = window.gameState?.renderStats?.gpuTerrain?.backend
    const backend = activeBackend && activeBackend !== 'cpu'
      ? activeBackend
      : (gl ? 'webgl' : 'canvas-2d')
    const refreshRateHz = Number.isFinite(window.screen?.refreshRate) ? window.screen.refreshRate : null
    return {
      intervals,
      windows,
      completed,
      routeIndex,
      routeLength: route.length,
      resources,
      backend,
      refreshRateHz,
      devicePixelRatio: window.devicePixelRatio || 1,
      canvas: canvas ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight } : null,
      headlessHint: navigator.webdriver === true
    }
  }, { route, speedPxPerFrame, durationMs })
}

test.describe('Rendering pipeline strict 75 FPS diagnostics', () => {
  test.skip(!RUN_BENCHMARK, 'Set PERF_RENDERING_PIPELINE=1 to run the opt-in rendering pipeline benchmark.')

  test('captures cold traversal, repeat route, tails, capabilities and resize evidence', async({ browser, baseURL }, testInfo) => {
    testInfo.setTimeout(Math.max(180000, DURATION_MS * 20))
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    const startupCapture = await startCpuSampling(context, { label: 'startup-cold' })
    let resizeCleanup = null
    try {
      await page.goto(`${baseURL || 'http://localhost:5173'}/?seed=4&size=200&players=4&monitor=1`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await waitForReadyGame(page)
      resizeCleanup = await page.evaluateHandle(createResizeAuditScript())
      const canvas = await page.locator('#gameCanvas').boundingBox()
      const route = createTimedRoute({ width: 200 * 32, height: 200 * 32, viewportWidth: canvas?.width || 1440, viewportHeight: canvas?.height || 1000, laps: 2 })
      const coldProfile = await stopCpuSampling(startupCapture)
      const steadyCapture = await startCpuSampling(context, { label: 'steady-repeat-laps' })
      const evidence = await collectRouteEvidence(page, route, SPEED_PX_PER_FRAME, DURATION_MS)
      const steadyProfile = await stopCpuSampling(steadyCapture)
      const resizeAudit = await resizeCleanup.evaluate(cleanup => cleanup())
      const metrics = summarizeFrameIntervals(evidence.intervals)
      const capability = classifyRefreshCapability({ refreshRateHz: evidence.refreshRateHz, observedFrameRate: metrics.fps, backend: evidence.backend, headless: evidence.headlessHint })
      const report = {
        schemaVersion: 1,
        acceptance: { enforced: ENFORCE_ACCEPTANCE, deadlineMs: metrics.deadlineMs, rule: '75 FPS means no frame interval may exceed 13.333 ms.' },
        route: { points: route.length, distancePx: routeDistance(route), speedPxPerFrame: SPEED_PX_PER_FRAME, laps: 2, completed: evidence.completed },
        cold: { profilingOverhead: coldProfile.profilingOverhead, profileDurationMs: coldProfile.durationMs },
        steady: { ...metrics, windows: evidence.windows, profilingOverhead: steadyProfile.profilingOverhead },
        capability,
        canvas: evidence.canvas,
        resizeAudit: { resizeEvents: resizeAudit.resizeEvents.length, transformedDraws: resizeAudit.transformedDraws.length },
        assets: summarizeAssetMetadata(evidence.resources),
        pageErrors
      }
      console.log(`RENDERING_PIPELINE_75FPS_REPORT ${JSON.stringify(report, null, 2)}`)
      await testInfo.attach('rendering-pipeline-75fps.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
      await testInfo.attach('rendering-pipeline-cdp-startup.json', { body: JSON.stringify(coldProfile), contentType: 'application/json' })
      await testInfo.attach('rendering-pipeline-cdp-steady.json', { body: JSON.stringify(steadyProfile), contentType: 'application/json' })

      expect(pageErrors, 'rendering route page errors').toHaveLength(0)
      expect(evidence.completed, 'timed route completed').toBe(true)
      expect(metrics.frameCount, 'benchmark collected animation frames').toBeGreaterThan(0)
      if (ENFORCE_ACCEPTANCE) {
        expect(capability.displayEligible, '75 FPS certification requires a real >=75Hz display and non-headless run').toBe(true)
        expect(metrics.missedDeadlineFrames, 'application-caused frames over the 75 FPS deadline').toBe(0)
      }
    } finally {
      await resizeCleanup?.evaluate(cleanup => cleanup()).catch(() => {})
      await context.close()
    }
  })
})
