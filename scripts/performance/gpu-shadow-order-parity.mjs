import { chromium } from 'playwright'
import { installGpuShadowBatch } from './gpu-shadow-batch.js'

const browser = await chromium.launch({ channel: 'chrome', headless: false, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] })
try {
  const session = await browser.newBrowserCDPSession()
  const { gpu } = await session.send('SystemInfo.getInfo')
  const adapter = JSON.stringify(gpu.devices[0])
  if (!/Apple|NVIDIA|AMD|Intel|Adreno|Mali/i.test(adapter) ||
      /swiftshader|llvmpipe|software|basic render|lavapipe/i.test(adapter) ||
      gpu.featureStatus.rasterization !== 'enabled') throw new Error('Hardware rasterization was not verified')

  const page = await browser.newPage({ viewport: null })
  await page.bringToFront()
  await page.evaluate(`window.installGpuShadowBatch = ${installGpuShadowBatch.toString()}`)
  const comparison = await page.evaluate(() => {
    const makeCanvas = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 192
      canvas.height = 192
      document.body.append(canvas)
      return canvas
    }
    const shadow = new OffscreenCanvas(276, 276)
    const mask = shadow.getContext('2d')
    mask.fillStyle = 'rgba(0, 0, 0, 0.5)'
    mask.fillRect(10, 10, 20, 20)
    const results = []
    for (const shadowFirst of [true, false]) {
      const original = makeCanvas().getContext('2d')
      const foreground = makeCanvas().getContext('2d')
      const prototype = window.installGpuShadowBatch(foreground)
      const render = ctx => {
        ctx.scale(2, 2)
        const drawShadow = () => ctx.drawImage(shadow, 8, 8, 24, 24, 30, 30, 24, 24)
        if (shadowFirst) drawShadow()
        ctx.fillStyle = '#c86432'
        ctx.fillRect(36, 36, 20, 20)
        if (!shadowFirst) drawShadow()
      }
      render(original)
      render(foreground)
      prototype.draw()
      const composed = makeCanvas().getContext('2d')
      composed.drawImage(foreground.canvas.previousElementSibling, 0, 0)
      composed.drawImage(foreground.canvas, 0, 0)
      const expected = original.getImageData(80, 80, 1, 1).data
      const actual = composed.getImageData(80, 80, 1, 1).data
      const expectedClear = original.getImageData(68, 68, 1, 1).data
      const actualClear = composed.getImageData(68, 68, 1, 1).data
      results.push({
        shadowFirst,
        overlap: { expected: [...expected], actual: [...actual] },
        exposed: { expected: [...expectedClear], actual: [...actualClear] },
        ...prototype.stats()
      })
      prototype.close()
    }
    return results
  })
  console.log(JSON.stringify(comparison, null, 2))
} finally {
  await browser.close()
}
