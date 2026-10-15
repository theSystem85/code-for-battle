import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { prepareRegressionScenario } from './helpers/regressionScenario.js'

for (const density of [1, 3]) {
  test.describe(`factory exit at DPR ${density}`, () => {
    test.use({ deviceScaleFactor: density, viewport: { width: 1280, height: 900 } })
    test('captures a produced tank leaving the garage', async({ page }) => {
      test.skip(process.env.FACTORY_EXIT_CAPTURE !== '1', 'Opt-in visual capture')
      await prepareRegressionScenario(page, 211)
      await page.waitForFunction(() => document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'), null, { timeout: 30000 })
      await page.evaluate(async() => {
        const { productionQueue } = await import('/src/productionQueue.js')
        const { prepareRuntimeSprites } = await import('/src/rendering/prepared/renderingPipeline.js')
        await prepareRuntimeSprites({ density: window.devicePixelRatio })
        const r = window.__regression
        const factory = r.building('vehicleFactory', r.human, 25, 24)
        factory.constructionFinished = true
        const button = document.createElement('button')
        const item = { type: 'tank_v1', button, factoryId: factory.id, rallyPoint: { x: 21, y: 29 } }
        productionQueue.unitItems = [item]
        productionQueue.currentUnit = item
        productionQueue.completeCurrentUnitProduction()
        r.exitTank = window.gameInstance.units.find(unit => unit.factoryExit?.factoryId === factory.id)
        if (!r.exitTank) throw new Error('Production did not create an exiting tank')
        r.exitFactory = factory
        // An idle friendly tank parks on the rally point so the exit must pick the nearest free tile.
        r.unit('tank_v1', r.human, 21, 29)
        r.captureTime = 0
      })
      const directory = process.env.FACTORY_EXIT_SHOTS_DIR || 'output/factory-exit-shots'
      await mkdir(directory, { recursive: true })
      const frameStep = 1000 / 30
      const keyShots = new Map([[0, '0'], [1000, '1000'], [2000, '2000'], [3000, '3000'], [3800, '3800'], [5000, 'done']])
      const timestamps = [...new Set([...Array.from({ length: 151 }, (_, i) => Math.round(i * frameStep)), ...keyShots.keys()])].sort((a, b) => a - b)
      await mkdir(path.join(directory, `frames-dpr${density}`), { recursive: true })
      for (const timestamp of timestamps) {
        // Step the deterministic simulation while paused, then force one paused frame.
        await page.evaluate(async target => {
          const { updateGame } = await import('/src/updateGame.js')
          const { advanceSimulationTime } = await import('/src/game/time.js')
          const gs = window.gameState
          const r = window.__regression
          while (r.captureTime < target) {
            const delta = Math.min(1000 / 60, target - r.captureTime)
            gs.gamePaused = false
            advanceSimulationTime(delta, gs)
            updateGame(delta, gs.mapGrid, gs.factories, window.gameInstance.units, window.gameInstance.bullets || [], gs)
            gs.gamePaused = true
            r.captureTime += delta
          }
          window.gameInstance.gameLoop.requestRender()
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        }, timestamp)
        const clip = await page.evaluate(() => {
          const gs = window.gameState
          const f = window.__regression.exitFactory
          const bounds = document.getElementById('gameCanvas').getBoundingClientRect()
          return { x: bounds.x + f.x * 32 - gs.scrollOffset.x - 64,
            y: bounds.y + f.y * 32 - gs.scrollOffset.y - 32, width: 224, height: 224 }
        })
        const screenshot = await page.screenshot({ clip })
        if (keyShots.has(timestamp)) await sharp(screenshot).webp({ quality: 90 }).toFile(path.join(directory, `factory-dpr${density}-${keyShots.get(timestamp)}.webp`))
        if (Math.abs(timestamp - Math.round(Math.round(timestamp / frameStep) * frameStep)) < 1) await sharp(screenshot).png().toFile(path.join(directory, `frames-dpr${density}`, `f${String(Math.round(timestamp / frameStep)).padStart(4, '0')}.png`))
      }
      const full = await page.screenshot()
      await sharp(full).webp({ quality: 85 }).toFile(path.join(directory, `factory-dpr${density}-full.webp`))
      expect(await page.evaluate(() => Boolean(window.__regression.exitTank.factoryExit))).toBe(false)
    })
  })
}
