import { chromium } from 'playwright'

const browser = await chromium.launch({ channel: 'chrome', headless: false, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] })
try {
  const session = await browser.newBrowserCDPSession()
  const { gpu } = await session.send('SystemInfo.getInfo')
  const adapter = JSON.stringify(gpu.devices[0])
  if (!/Apple|NVIDIA|AMD|Intel|Adreno|Mali/i.test(adapter) ||
      /swiftshader|llvmpipe|software|basic render|lavapipe/i.test(adapter) ||
      gpu.featureStatus.rasterization !== 'enabled') throw new Error('Hardware rasterization was not verified')

  const captures = []
  for (const url of [process.env.BENCHMARK_BASELINE_URL || 'http://127.0.0.1:4197', process.env.BENCHMARK_URL || 'http://127.0.0.1:4202']) {
    const page = await browser.newPage({ viewport: null })
    await page.bringToFront()
    await page.goto(`${url}/?tutorial=0`)
    await page.waitForFunction(() => window.gameInstance?.gameLoop && window.gameInstance.renderer?.unitRenderer)
    captures.push(await page.evaluate(async() => {
      const { renderer, gameLoop } = window.gameInstance
      const unitRenderer = renderer.unitRenderer
      gameLoop.stop()
      window.gameState.selectionHudMode = 'modern-donut'
      await document.fonts.load('4px "Rajdhani"')
      const results = []
      for (const density of [1, 2]) {
        const size = 72 * density
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.scale(density, density)
        for (const fraction of [0, 0.25, 0.5, 0.333]) {
          for (const ratio of [0, 0.375, 1]) {
            ctx.fillStyle = '#7a806c'
            ctx.fillRect(0, 0, 72, 72)
            const center = 36 + fraction
            const unit = {
              type: 'tank-v2', owner: window.gameState.humanPlayer, selected: true,
              x: center - 16, y: center - 16,
              crew: { driver: true, gunner: true, loader: true, commander: true }
            }
            unitRenderer.renderDonutSelectionGlow(ctx, unit, center, center)
            const bounds = unitRenderer.getSelectedHudBounds(center, center, unit)
            unitRenderer.drawHudEdgeBar(ctx, bounds, 'top', ratio, '#00ff00')
            unitRenderer.drawHudEdgeBar(ctx, bounds, 'right', ratio, '#4A90E2')
            unitRenderer.renderCrewStatus(ctx, unit, { x: 0, y: 0 })
            results.push({ density, fraction, ratio, pixels: Array.from(ctx.getImageData(0, 0, size, size).data) })
          }
        }
      }
      return results
    }))
    await page.close()
  }
  const [baseline, candidate] = captures
  const results = baseline.map(({ pixels, ...settings }, index) => {
    let changes = 0
    let overTwoLevels = 0
    let maxDelta = 0
    for (let channel = 0; channel < pixels.length; channel++) {
      const delta = Math.abs(pixels[channel] - candidate[index].pixels[channel])
      if (delta) changes++
      if (delta > 2) overTwoLevels++
      maxDelta = Math.max(maxDelta, delta)
    }
    return { ...settings, changes, overTwoLevels, maxDelta }
  })
  console.log(JSON.stringify(results, null, 2))
  if (results.some(result => result.changes > 0)) process.exitCode = 1
} finally {
  await browser.close()
}
