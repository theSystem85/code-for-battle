import { expect, test } from '@playwright/test'

const RUN_PERF = process.env.PERF_SAVEGAME_DESTROYERS === '1'
const SAMPLE_DURATION_MS = Number.parseInt(process.env.PERF_SAVEGAME_DESTROYERS_DURATION_MS || '5000', 10)

async function sampleRuntime(page, label) {
  return page.evaluate(async({ label, duration }) => {
    const { performanceMonitor } = await import('/src/performance/performanceMonitor.js')
    window.performanceStatistics = {}
    const heapStartBytes = performance.memory?.usedJSHeapSize ?? null
    performanceMonitor.start()
    await new Promise(resolve => setTimeout(resolve, duration))
    const report = performanceMonitor.stop()
    const heapEndBytes = performance.memory?.usedJSHeapSize ?? null
    return {
      label,
      averageFps: report.averageFps,
      timingMs: report.timingMs,
      functionTimings: window.structuredClone(window.performanceStatistics),
      heapDeltaMb: heapStartBytes === null || heapEndBytes === null
        ? null
        : (heapEndBytes - heapStartBytes) / (1024 * 1024)
    }
  }, { label, duration: SAMPLE_DURATION_MS })
}

test.describe('Loaded southeast destroyer performance', () => {
  test.skip(!RUN_PERF, 'Set PERF_SAVEGAME_DESTROYERS=1 to run this opt-in performance benchmark.')

  test('keeps the loaded southeast destroyers within the fixed update budget', async({ page }, testInfo) => {
    test.setTimeout(90_000)
    await page.goto('/?monitor')
    await page.waitForSelector('#saveLoadMenu', { state: 'visible' })
    await page.waitForFunction(async() => {
      const { factories } = await import('/src/game/gameOrchestrator.js')
      return factories.length >= 4
    })
    await page.waitForTimeout(2000)
    await page.evaluate(async() => {
      const save = await fetch('/examples/2026-08-30_15-04-26-576Z_newIssue.json').then(response => response.json())
      const { loadGameFromState } = await import('/src/saveGame.js')
      loadGameFromState(save.state, save.label)
    })
    await expect.poll(() => page.evaluate(async() => {
      const { units } = await import('/src/main.js')
      return units.length
    })).toBe(33)
    await page.waitForTimeout(2000)

    const destroyersAlive = await sampleRuntime(page, 'destroyers-alive')
    await page.evaluate(async() => {
      const { units } = await import('/src/main.js')
      units
        .filter(unit => unit.type === 'destroyer')
        .forEach(unit => { unit.health = 0 })
    })
    await page.waitForTimeout(1500)
    const destroyersDestroyed = await sampleRuntime(page, 'destroyers-destroyed')
    const result = { destroyersAlive, destroyersDestroyed }

    console.log(`SAVEGAME_DESTROYER_PERF_RESULT ${JSON.stringify(result)}`)
    await testInfo.attach('savegame-destroyer-performance.json', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json'
    })

    expect(destroyersAlive.timingMs.update.averageMs).toBeLessThan(20)
    expect(destroyersAlive.averageFps).toBeGreaterThanOrEqual(destroyersDestroyed.averageFps * 0.8)
  })
})
