import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const output = process.argv[2]
if (!output) throw new Error('Usage: node scripts/performance/benchmark-canvas-control.mjs OUTPUT_DIRECTORY')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: false, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] })
try {
  const session = await browser.newBrowserCDPSession()
  const { gpu } = await session.send('SystemInfo.getInfo')
  const adapter = gpu.devices[0]
  if (!/Apple|NVIDIA|AMD|Intel|Adreno|Mali/i.test(JSON.stringify(adapter)) ||
      /swiftshader|llvmpipe|software|basic render|lavapipe/i.test(JSON.stringify(adapter)) ||
      gpu.featureStatus.rasterization !== 'enabled') {
    throw new Error('Hardware rasterization was not verified')
  }
  const page = await browser.newPage({ viewport: null })
  await page.bringToFront()
  const complete = new Promise(resolve => session.once('Tracing.tracingComplete', resolve))
  await session.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    traceConfig: { includedCategories: ['benchmark', 'blink.user_timing', 'cc', 'viz', 'gpu', 'renderer.scheduler'] }
  })
  const result = await page.evaluate(async() => {
    const canvas = document.createElement('canvas')
    canvas.width = 800 * devicePixelRatio
    canvas.height = 600 * devicePixelRatio
    canvas.style.width = '800px'
    canvas.style.height = '600px'
    document.body.append(canvas)
    const ctx = canvas.getContext('2d')
    const frames = []
    return new Promise(resolve => {
      let start
      function frame(now) {
        if (start === undefined) {
          start = now
          performance.mark('cfb-benchmark-start')
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#1680c0'
        ctx.fillRect((now / 4) % (canvas.width - 30), 20, 30, 30)
        frames.push(now)
        if (now - start < 15000) requestAnimationFrame(frame)
        else {
          performance.mark('cfb-benchmark-end')
          resolve({ frames, dpr: devicePixelRatio, visible: document.visibilityState, focused: document.hasFocus() })
        }
      }
      requestAnimationFrame(frame)
    })
  })
  await session.send('Tracing.end')
  const { stream } = await complete
  let contents = ''
  let eof = false
  while (!eof) {
    const chunk = await session.send('IO.read', { handle: stream, size: 1024 * 1024 })
    contents += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString('utf8') : chunk.data
    eof = chunk.eof
  }
  await session.send('IO.close', { handle: stream })
  await writeFile(join(output, 'compositor.json'), contents)
  await writeFile(join(output, 'result.json'), JSON.stringify({ ...result, gpu, browser: await browser.version() }))
  console.log(JSON.stringify({ fps: (result.frames.length - 1) * 1000 / (result.frames.at(-1) - result.frames[0]), ...{ dpr: result.dpr, visible: result.visible, focused: result.focused } }))
} finally {
  await browser.close()
}
