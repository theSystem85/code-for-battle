import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'

const RUN_VISUAL_CAPTURE = process.env.PERF_RENDERING_VISUAL === '1'

test.describe('Rendering visual golden capture', () => {
  test.skip(!RUN_VISUAL_CAPTURE, 'Set PERF_RENDERING_VISUAL=1 to capture rendering golden sequences.')

  test('captures shoreline, terrain, dynamic-water and entity states with fixed metadata', async({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/?seed=4&size=100&monitor=1', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('#gameCanvas', { state: 'visible', timeout: 45000 })
    await page.waitForFunction(() => Boolean(window.gameState?.gameStarted && window.gameInstance?.gameLoop), { timeout: 45000 })

    const states = [
      { name: 'shoreline-biomes', x: 0, y: 0 },
      { name: 'cliffs-roads', x: 960, y: 640 },
      { name: 'dynamic-entities', x: 1600, y: 1280 }
    ]
    const captures = []
    for (const state of states) {
      await page.evaluate(({ x, y }) => {
        window.gameState.scrollOffset.x = x
        window.gameState.scrollOffset.y = y
        window.gameInstance.gameLoop.requestRender()
      }, state)
      await page.waitForTimeout(250)
      const dataUrl = await page.locator('#gameCanvas').evaluate(canvas => canvas.toDataURL('image/webp', 0.85))
      const body = Buffer.from(dataUrl.split(',')[1], 'base64')
      const attachmentName = `${state.name}.webp`
      await testInfo.attach(attachmentName, { body, contentType: 'image/webp' })
      captures.push({ ...state, attachmentName, bytes: body.length, phase: await page.evaluate(() => window.gameState?.waterAnimationTime ?? null) })
    }

    await page.evaluate(() => { window.gameState.gamePaused = true; window.gameInstance.gameLoop.requestRender() })
    const repeatDataUrl = await page.locator('#gameCanvas').evaluate(canvas => canvas.toDataURL('image/webp', 0.85))
    const repeatBody = Buffer.from(repeatDataUrl.split(',')[1], 'base64')
    const repeatPath = 'repeat-stationary.webp'
    await testInfo.attach(repeatPath, { body: repeatBody, contentType: 'image/webp' })
    const report = {
      schemaVersion: 1,
      captureFormat: 'webp',
      quality: 85,
      viewport: { width: 1440, height: 1000, devicePixelRatio: await page.evaluate(() => window.devicePixelRatio) },
      dynamicWater: true,
      states: captures,
      repeatStationary: { attachmentName: repeatPath, bytes: repeatBody.length },
      note: 'Golden captures are diagnostic artifacts; compare matched camera/time/backend sequences before claiming visual parity.'
    }
    await testInfo.attach('rendering-visual-golden-manifest.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
    expect(captures).toHaveLength(3)
    expect(report.captureFormat).toBe('webp')
  })
})
