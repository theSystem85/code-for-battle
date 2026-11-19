import { chromium } from 'playwright'

const browser = await chromium.launch({ channel: 'chrome', headless: false, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] })
try {
  const session = await browser.newBrowserCDPSession()
  const { gpu } = await session.send('SystemInfo.getInfo')
  const adapter = JSON.stringify(gpu.devices[0])
  if (!/Apple|NVIDIA|AMD|Intel/i.test(adapter) || /swiftshader|software|llvmpipe/i.test(adapter) || gpu.featureStatus.rasterization !== 'enabled') throw new Error('Hardware GPU required')
  const page = await browser.newPage()
  await page.goto(`${process.env.BENCHMARK_URL || 'http://127.0.0.1:4213'}/?tutorial=0`)
  await page.waitForFunction(() => window.gameInstance?.gameLoop)
  const result = await page.evaluate(async() => {
    window.gameInstance.gameLoop.stop()
    const { drawCachedUnitShadow } = await import('/src/rendering/unitShadow.js')
    const settings = { offset: 0.8, direction: 69, startStretch: 2, endStretch: 2.9, size: 1.8, opacity: 0.45, blur: 6.5 }
    const mask = (ctx, x, y) => { ctx.fillStyle = '#fff'; ctx.fillRect(x - 20, y - 12, 40, 24) }
    const cases = []
    for (const dpr of [1, 2]) for (const alpha of [1, 0.5]) for (const fraction of [0, 0.25, 0.5]) {
      const makeCanvas = () => { const c = document.createElement('canvas'); c.width = 256 * dpr; c.height = 160 * dpr; return c }
      const direct = makeCanvas()
      const composite = makeCanvas()
      const layer = makeCanvas()
      const drawShadows = ctx => {
        ctx.scale(dpr, dpr)
        for (let i = 0; i < 5; i++) {
          ctx.globalAlpha = alpha * (i === 0 ? 0.4 : 1)
          drawCachedUnitShadow(ctx, 'parity-tank', 70 + i * 18 + fraction, 80 + fraction, 32, mask, () => settings)
        }
      }
      drawShadows(direct.getContext('2d'))
      drawShadows(layer.getContext('2d'))
      composite.getContext('2d').drawImage(layer, 0, 0)
      const a = direct.getContext('2d').getImageData(0, 0, direct.width, direct.height).data
      const b = composite.getContext('2d').getImageData(0, 0, direct.width, direct.height).data
      let changed = 0
      let maxDelta = 0
      for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) changed++; maxDelta = Math.max(maxDelta, Math.abs(a[i] - b[i])) }
      cases.push({ dpr, alpha, fraction, changed, maxDelta })
    }
    return cases
  })
  console.log(JSON.stringify(result, null, 2))
  if (result.some(item => item.maxDelta > 1)) process.exitCode = 1
} finally {
  await browser.close()
}
