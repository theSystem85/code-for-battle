import { expect, test } from '@playwright/test'

const RUN_CHIMNEY_SMOKE_PERF = process.env.PERF_CHIMNEY_SMOKE === '1'

test.describe('Building chimney smoke performance', () => {
  test.skip(!RUN_CHIMNEY_SMOKE_PERF, 'Set PERF_CHIMNEY_SMOKE=1 to run this benchmark.')

  test('keeps a full smoke budget within the frame and heap budgets', async({ page, baseURL }) => {
    await page.goto(`${baseURL || 'http://localhost:5173'}?seed=41&size=64&players=2&oreFields=8`)
    await page.waitForFunction(() => Boolean(window.gameInstance?.gameLoop && window.gameState?.gameStarted), null, { timeout: 45000 })

    const sample = () => page.evaluate(() => new Promise(resolve => {
      const frameTimes = []
      const heapStart = performance.memory?.usedJSHeapSize ?? null
      const renderer = window.gameInstance.renderer.effectsRenderer
      const originalRenderSmoke = renderer.renderSmoke
      let smokeRenderCpuMs = 0

      renderer.renderSmoke = function measuredSmokeRender(...args) {
        const start = performance.now()
        const result = originalRenderSmoke.apply(this, args)
        smokeRenderCpuMs += performance.now() - start
        return result
      }

      let previous = performance.now()
      const frame = now => {
        frameTimes.push(now - previous)
        previous = now
        if (frameTimes.length < 180) return requestAnimationFrame(frame)

        renderer.renderSmoke = originalRenderSmoke
        const elapsed = frameTimes.reduce((sum, duration) => sum + duration, 0)
        const heapEnd = performance.memory?.usedJSHeapSize ?? null
        resolve({
          fps: frameTimes.length * 1000 / elapsed,
          smokeRenderCpuMs,
          heapDeltaMb: heapStart === null || heapEnd === null ? null : (heapEnd - heapStart) / 1048576
        })
      }
      requestAnimationFrame(frame)
    }))

    const baseline = await sample()
    await page.evaluate(() => {
      const now = performance.now()
      window.gameState.smokeParticles = Array.from({ length: 300 }, (_, index) => ({
        x: window.gameState.scrollOffset.x + 80 + (index % 20) * 28,
        y: window.gameState.scrollOffset.y + 80 + Math.floor(index / 20) * 28,
        vx: 0.02,
        vy: -0.65,
        size: 4,
        originalSize: 4,
        startTime: now,
        duration: 10000,
        alpha: 0.8,
        initialAlpha: 0.8,
        fireIntensity: 0,
        smokeShade: 0
      }))
    })
    const active = await sample()
    console.log(`CHIMNEY_SMOKE_PERF ${JSON.stringify({ baseline, active })}`)

    expect(active.fps).toBeGreaterThanOrEqual(50)
    expect(active.fps).toBeGreaterThanOrEqual(baseline.fps * 0.8)
    expect(active.smokeRenderCpuMs).toBeLessThan(250)
    if (active.heapDeltaMb !== null) expect(active.heapDeltaMb).toBeLessThan(12)
  })
})
