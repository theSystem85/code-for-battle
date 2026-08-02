import { expect, test } from '@playwright/test'

const RUN_REPAIR_HUD_PERF = process.env.PERF_BUILDING_REPAIR_HUD === '1'

test.describe('Building repair countdown HUD performance', () => {
  test.skip(!RUN_REPAIR_HUD_PERF, 'Set PERF_BUILDING_REPAIR_HUD=1 to run this benchmark.')

  test('stays within the frame budget with many active countdown bars', async({ page, baseURL }) => {
    await page.goto(`${baseURL || 'http://localhost:5173'}?seed=31&size=64&players=2&oreFields=8`)
    await page.waitForFunction(() => Boolean(window.gameInstance?.gameLoop && window.gameState?.gameStarted), null, { timeout: 45000 })

    const sample = () => page.evaluate(() => new Promise(resolve => {
      const heapStart = performance.memory?.usedJSHeapSize ?? null
      const frameTimes = []
      let previous = performance.now()
      let renderCpuMs = 0
      const renderer = window.gameInstance.renderer.buildingRenderer
      const original = renderer.renderPendingRepairCountdown
      renderer.renderPendingRepairCountdown = function measuredRepairCountdown(...args) {
        const start = performance.now()
        const result = original.apply(this, args)
        renderCpuMs += performance.now() - start
        return result
      }
      const frame = now => {
        frameTimes.push(now - previous)
        previous = now
        if (frameTimes.length < 120) return requestAnimationFrame(frame)
        renderer.renderPendingRepairCountdown = original
        const elapsed = frameTimes.reduce((sum, time) => sum + time, 0)
        const heapEnd = performance.memory?.usedJSHeapSize ?? null
        resolve({
          fps: frameTimes.length * 1000 / elapsed,
          renderCpuMs,
          heapDeltaMb: heapStart === null || heapEnd === null ? null : (heapEnd - heapStart) / 1048576
        })
      }
      requestAnimationFrame(frame)
    }))

    const baseline = await sample()
    await page.evaluate(() => {
      const buildings = window.gameState.buildings.slice(0, 100)
      window.gameState.buildingsAwaitingRepair = buildings.map(building => ({
        building,
        remainingCooldown: 100
      }))
    })
    const active = await sample()
    console.log(`BUILDING_REPAIR_HUD_PERF ${JSON.stringify({ baseline, active })}`)

    expect(active.fps).toBeGreaterThanOrEqual(baseline.fps * 0.8)
    expect(active.renderCpuMs).toBeLessThan(50)
    if (active.heapDeltaMb !== null) expect(active.heapDeltaMb).toBeLessThan(8)
  })
})
