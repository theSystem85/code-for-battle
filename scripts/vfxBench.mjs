import { chromium } from '@playwright/test'

// Uses existing runtime hooks only, so this script also works against main.
const url = new URL(process.env.BENCH_URL || 'http://localhost:5173')
url.searchParams.set('heavyBattle', '1')
url.searchParams.set('benchmarkDurationMs', process.env.BENCH_DURATION_MS || '20000')
url.searchParams.set('heavyBattleWarmupMs', '0')
url.searchParams.set('battleUnits', process.env.BENCH_UNITS || '320')
url.searchParams.set('seed', '11')
url.searchParams.set('framePhases', '1')
if (!url.searchParams.has('size')) url.searchParams.set('size', '100')
if (!url.searchParams.has('players')) url.searchParams.set('players', '4')
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--mute-audio'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: Number(process.env.BENCH_DPR || 1) })
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    const samples = new Float64Array(30000)
    let count = 0
    let previous = 0
    window.__vfxBench = { samples, count: 0, memoryStart: null }
    const sample = now => {
      const tracker = window.__framePhases
      if (window.gameState?.benchmarkActive && tracker?.filled > 0 && !window.__heavyBattleResult) {
        if (!window.__vfxBench.memoryStart) window.__vfxBench.memoryStart = performance.memory?.usedJSHeapSize || null
        if (previous && count < samples.length) samples[count++] = now - previous
        previous = now
        window.__vfxBench.count = count
      } else previous = 0
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.goto(url.href)
  await page.waitForFunction(() => window.__heavyBattleResult || window.__heavyBattleError, null, { timeout: 180000 })
  const result = await page.evaluate(() => {
    if (window.__heavyBattleError) throw new Error(window.__heavyBattleError)
    const state = window.__vfxBench
    const samples = Array.from(state.samples.subarray(0, state.count)).sort((a, b) => a - b)
    if (!samples.length) throw new Error('No independent animation frame samples captured')
    const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length
    const percentile = p => samples[Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1)]
    const canvas = document.getElementById('gameCanvas')
    return {
      diagnosticOnly: true, certification: 'Headless cannot certify 75 presented FPS',
      frameTimeMs: { avg, p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: samples.at(-1) },
      fps: 1000 / avg, samples: samples.length,
      missedDeadlines: samples.filter(value => value > 1000 / 75).length,
      effectiveDpr: canvas.width / canvas.clientWidth,
      memory: { startBytes: state.memoryStart, endBytes: performance.memory?.usedJSHeapSize || null, gc: 'not available' },
      gpuTiming: 'not available', runtime: window.__heavyBattleResult
    }
  })
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
