import { test, expect } from '@playwright/test'

const RUN_PERF = process.env.PERF_SAVEGAME_AIR_COMBAT === '1'

test.describe('Loaded savegame air-combat performance', () => {
  test.skip(!RUN_PERF, 'Set PERF_SAVEGAME_AIR_COMBAT=1 to run this opt-in performance benchmark.')

  test('does not develop a delayed CPU regression', async({ page }, testInfo) => {
    test.setTimeout(150_000)
    await page.goto('/?monitor')
    await page.waitForSelector('#saveLoadMenu', { state: 'visible' })
    await page.waitForFunction(async() => {
      const { factories } = await import('/src/game/gameOrchestrator.js')
      return factories.length >= 4
    })
    await page.waitForTimeout(2000)
    await page.evaluate(async() => {
      const save = await fetch('/examples/2026-08-28_18-37-40-820Z_issue.json').then(response => response.json())
      const { loadGameFromState } = await import('/src/saveGame.js')
      loadGameFromState(save.state, save.label)
    })
    await expect.poll(() => page.evaluate(async() => {
      const { gameState } = await import('/src/gameState.js')
      return gameState.units.length
    })).toBe(57)

    const samples = await page.evaluate(async() => {
      const { performanceMonitor } = await import('/src/performance/performanceMonitor.js')
      const { gameState } = await import('/src/gameState.js')
      const wait = duration => new Promise(resolve => setTimeout(resolve, duration))
      const results = []
      const sample = async(label, delayMs) => {
        await wait(delayMs)
        const heapStartBytes = performance.memory?.usedJSHeapSize || null
        performanceMonitor.start()
        await wait(10_000)
        const report = performanceMonitor.stop()
        results.push({
          label,
          report,
          functionTimings: window.structuredClone(window.performanceStatistics || {}),
          heapDeltaMb: heapStartBytes === null ? null : (performance.memory.usedJSHeapSize - heapStartBytes) / (1024 * 1024),
          aircraft: gameState.units
            .filter(unit => ['apache', 'f22Raptor', 'f35'].includes(unit.type))
            .map(unit => ({
              id: unit.id,
              type: unit.type,
              health: unit.health,
              flightState: unit.flightState,
              f22State: unit.f22State,
              targetId: unit.targetId,
              pathLength: unit.path?.length || 0
            }))
        })
      }
      await sample('initial', 0)
      await sample('middle', 15_000)
      await sample('delayed', 15_000)
      return results
    })

    await testInfo.attach('savegame-air-combat-performance.json', {
      body: JSON.stringify(samples, null, 2),
      contentType: 'application/json'
    })
    console.log(`Savegame air-combat performance: ${JSON.stringify(samples.map(sample => ({
      label: sample.label,
      averageFps: sample.report.averageFps,
      update: sample.report.timingMs.update,
      functionTimings: sample.functionTimings
    })))}`)
    expect(samples).toHaveLength(3)
    expect(samples[2].report.averageFps).toBeGreaterThanOrEqual(samples[0].report.averageFps * 0.8)
    expect(samples[2].report.timingMs.update.averageMs).toBeLessThan(20)
    expect(samples[2].report.timingMs.update.maxMs).toBeLessThan(500)
  })
})
