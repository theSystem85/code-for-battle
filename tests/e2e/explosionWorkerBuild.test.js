import { expect, test } from '@playwright/test'

test.use({ deviceScaleFactor: 2 })

// Uses runtime behavior only, so the same test verifies development and the
// actual production bundle (including Vite's emitted worker chunk).
test('bundled explosion worker completes before combat and death animations render', async({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('tutorial-settings', JSON.stringify({ showTutorial: false, speechEnabled: false }))
    localStorage.setItem('tutorial-progress', JSON.stringify({ completed: true, stepIndex: 0 }))
    const observations = { jobs: 0, width: 0, height: 0, readyBeforePlay: false, gameplayReadbacks: 0 }
    window.explosionWorkerBuildTest = observations
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options)
        if (!String(url).includes('explosionPreparation.worker')) return
        observations.jobs++
        this.addEventListener('message', ({ data }) => {
          if (!data.texture) return
          observations.width = data.texture.width
          observations.height = data.texture.height
          observations.readyBeforePlay = !window.gameInstance?.gameLoop?.running
        })
      }
    }
    const read = window.CanvasRenderingContext2D.prototype.getImageData
    window.CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      if (window.gameInstance?.gameLoop?.running && args[2] * args[3] >= 1024 * 1024) observations.gameplayReadbacks++
      return read.apply(this, args)
    }
  })
  await page.goto('/?seed=11&size=100&players=4&heavyBattle=1&battleUnits=80&benchmarkDurationMs=60000&heavyBattleWarmupMs=0')
  await page.waitForFunction(() => window.gameState?.heavyBattleBenchmark && window.gameInstance?.gameLoop?.running)
  await page.waitForFunction(() => window.gameState.explosions.some(explosion => explosion.type === 'spriteSheet' && !explosion.loop), null, { timeout: 30000 })
  expect(await page.evaluate(() => window.explosionWorkerBuildTest)).toEqual({ jobs: 1, width: 1024, height: 1024, readyBeforePlay: true, gameplayReadbacks: 0 })
  expect(errors).toEqual([])
})

test('a missing required explosion sheet fails loading instead of starting incomplete gameplay', async({ page }) => {
  await page.route('**/images/map/animations/explosion.webp', route => route.abort())
  await page.goto('/?seed=11&size=100&players=4&heavyBattle=1&battleUnits=40&heavyBattleWarmupMs=0')
  await expect(page.getByText('Startup failed. Reload the page to try again.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => Boolean(window.gameInstance?.gameLoop?.running))).toBe(false)
})
