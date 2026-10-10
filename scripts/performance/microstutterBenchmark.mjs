// Diagnostic companion to the existing deterministic combat benchmark.
// Usage: node scripts/performance/microstutterBenchmark.mjs /tmp/battle-before.json
import fs from 'node:fs'
import process from 'node:process'
import console from 'node:console'
import { chromium } from 'playwright'
import { summarizeFrameIntervals, percentile, createTimedRoute, routeDistance } from './benchmarkMetrics.js'

const output = process.argv[2] || '/tmp/microstutter.json'
const durationMs = Number(process.env.PERF_DURATION_MS || 60000)
const unitCount = Number(process.env.PERF_UNITS || 320)
if (!Number.isInteger(unitCount) || unitCount <= 0) throw new Error('PERF_UNITS must be a positive integer')
const scene = process.env.PERF_SCENE || 'battle'
const production = process.env.PERF_PRODUCTION === '1'
const speedPxPerSec = Number(process.env.PERF_SCROLL_SPEED || 1800)
const baseURL = process.env.PERF_BASE_URL || 'http://127.0.0.1:5173'
const windowPosition = process.env.PERF_WINDOW_POSITION
if (windowPosition && !/^-?\d+,-?\d+$/.test(windowPosition)) throw new Error('PERF_WINDOW_POSITION must be x,y integers')
const browser = await chromium.launch({ headless: process.env.PERF_HEADED !== '1', args: windowPosition ? [`--window-position=${windowPosition}`] : [] })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: Number(process.env.PERF_DPR || 2) })
  const page = await context.newPage()
  await page.addInitScript(() => {
    const { localStorage } = globalThis
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    localStorage.setItem('rts_graphics_settings', JSON.stringify({ useProceduralWaterRendering: true, rendererBackend: 'webgl', rendererBackendChoice: 'webgl' }))
    localStorage.setItem('rts_sound_enabled', 'false')
  })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${baseURL}/?seed=11&size=100&players=4&heavyBattle=1&battleUnits=${unitCount}&benchmarkDurationMs=${durationMs + 5000}&heavyBattleWarmupMs=0${production ? '&monitor=1' : ''}`)
  await page.waitForFunction(() => globalThis.window.gameState?.heavyBattleBenchmark && globalThis.window.gameInstance?.gameLoop?.running, null, { timeout: 120000 })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.start')
  const route = scene === 'traversal' ? createTimedRoute({ width: 3200, height: 3200, viewportWidth: 1190, viewportHeight: 1000, laps: 2 }) : null
  const measurement = await page.evaluate(async({ duration, route, speedPxPerSec, production }) => {
    const { window, document, performance, requestAnimationFrame, navigator } = globalThis
    // Production builds use the existing monitor UI/report API, avoiding a
    // development-only module import or an additional game runtime API.
    const performanceMonitor = production ? {
      start() { document.getElementById('performanceMonitorButton').click() },
      stop() {
        document.getElementById('performanceMonitorButton').click()
        return window.getPerformanceMonitorReport()
      }
    } : (await import('/src/performance/performanceMonitor.js')).performanceMonitor
    performanceMonitor.start()
    const cpuFrames = { update: [], render: [], work: [] }
    const recordFrame = performanceMonitor.recordFrame
    if (!production) performanceMonitor.recordFrame = function(frame) {
      cpuFrames.update.push(frame.updateMs)
      cpuFrames.render.push(frame.renderMs)
      cpuFrames.work.push(frame.frameWorkMs)
      return recordFrame.call(this, frame)
    }
    const intervals = []
    const counts = []
    let routeIndex = 1
    let routeCycles = 0
    let travelledPx = 0
    if (route) {
      window.gameState.heavyBattleCamera = null
      Object.assign(window.gameState.scrollOffset, route[0])
      const selected = window.gameInstance.units.filter(unit => unit.owner === 'player1').slice(0, 8)
      window.selectedUnitsRef.length = 0
      for (const unit of selected) {
        unit.selected = true
        window.selectedUnitsRef.push(unit)
      }
    }
    let previous
    let start
    let nextSample = 0
    await new Promise(resolve => {
      function step(now) {
        if (start === undefined) start = now
        if (route && previous !== undefined) {
          let remaining = (now - previous) * speedPxPerSec / 1000
          while (remaining > 0 && route.length > 1) {
            const scroll = window.gameState.scrollOffset
            const target = route[routeIndex]
            const dx = target.x - scroll.x
            const dy = target.y - scroll.y
            const distance = Math.hypot(dx, dy)
            const step = Math.min(distance, remaining)
            if (distance > 0) {
              scroll.x += dx * step / distance
              scroll.y += dy * step / distance
            }
            travelledPx += step
            remaining -= step
            if (step < distance) break
            routeIndex++
            if (routeIndex === route.length) {
              routeCycles++
              routeIndex = 1
            }
          }
        }
        if (previous !== undefined) intervals.push(now - previous)
        previous = now
        if (now - start >= nextSample) {
          const gpuTiming = window.gameState.renderStats?.gpuTiming
          counts.push({ atMs: now - start, units: window.gameInstance.units.length, bullets: window.gameInstance.gameLoop.bullets.length, explosions: window.gameState.explosions.length, heapBytes: performance.memory?.usedJSHeapSize ?? null, gpuPassMs: gpuTiming?.available ? gpuTiming.milliseconds : null })
          nextSample += 1000
        }
        if (now - start >= duration) resolve()
        else requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
    const gl = document.getElementById('gameCanvasGL')?.getContext('webgl2')
    const debug = gl?.getExtension('WEBGL_debug_renderer_info')
    if (!production) performanceMonitor.recordFrame = recordFrame
    const display = { screenX: window.screenX, screenY: window.screenY, width: window.screen.width, height: window.screen.height, availWidth: window.screen.availWidth, availHeight: window.screen.availHeight, devicePixelRatio: window.devicePixelRatio, emulatedScreenSize: true }
    return { intervals, cpuFrames, counts, routeCycles, travelledPx, display, monitor: performanceMonitor.stop(), phases: window.__framePhases.snapshot(), gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, hardwareConcurrency: navigator.hardwareConcurrency }
  }, { duration: durationMs, route, speedPxPerSec, production })
  const { profile } = await cdp.send('Profiler.stop')
  const nodes = new Map(profile.nodes.map(node => [node.id, node]))
  const totals = new Map()
  for (let index = 0; index < (profile.samples?.length || 0); index++) {
    const frame = nodes.get(profile.samples[index])?.callFrame
    if (!frame) continue
    const key = `${frame.functionName || '(anonymous)'} ${frame.url}:${frame.lineNumber + 1}`
    totals.set(key, (totals.get(key) || 0) + (profile.timeDeltas?.[index] || 0) / 1000)
  }
  const cpuTails = Object.fromEntries(Object.entries(measurement.cpuFrames).map(([phase, samples]) => {
    const values = samples.filter(value => Number.isFinite(value) && value >= 0)
    return [phase, { samples: values.length, p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95), p99Ms: percentile(values, 0.99), maxMs: Math.max(0, ...values), missedDeadlines: values.filter(value => value > 1000 / 75).length }]
  }))
  // Retain each interval in exactly one bucket, including intervals spanning
  // a bucket boundary; do not discard a hitch to improve a window's FPS.
  const windows = [1000, 5000].map(windowMs => {
    const buckets = []
    let elapsedMs = 0
    for (const interval of measurement.intervals) {
      const index = Math.floor(elapsedMs / windowMs)
      buckets[index] ||= []
      buckets[index].push(interval)
      elapsedMs += interval
    }
    return { windowMs, windows: buckets.map(intervals => summarizeFrameIntervals(intervals)) }
  })
  const result = { certification: 'diagnostic-only; presented 75 FPS requires qualifying physical hardware and refresh evidence', browser: browser.version(), headless: process.env.PERF_HEADED !== '1', production, windowPosition: windowPosition || null, cpuThrottle: 1, scene, unitCount, speedPxPerSec: route ? speedPxPerSec : 600, routeLengthPx: route ? routeDistance(route) : null, durationMs, ...measurement, frames: summarizeFrameIntervals(measurement.intervals), cpuTailsAvailable: !production, cpuTails, windows, cpuSelfTime: [...totals].sort((a, b) => b[1] - a[1]).slice(0, 45), errors }
  fs.writeFileSync(output, JSON.stringify(result, null, 2))
  fs.writeFileSync(output.replace(/\.json$/, '.cpuprofile'), JSON.stringify(profile))
  console.log(JSON.stringify({ output, frames: result.frames, timingMs: result.monitor.timingMs, cpuSelfTime: result.cpuSelfTime.slice(0, 15), errors }, null, 2))
} finally {
  await browser.close()
}
