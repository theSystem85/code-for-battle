import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const url = process.env.BENCHMARK_URL || 'http://127.0.0.1:4192'
const fixture = process.env.BENCHMARK_FIXTURE
const output = process.env.BENCHMARK_OUTPUT
if (!fixture || !output) throw new Error('Set BENCHMARK_FIXTURE and BENCHMARK_OUTPUT')
await mkdir(output, { recursive: true })
const fixtureSha256 = createHash('sha256').update(await readFile(fixture)).digest('hex')
const browser = await chromium.launch({ channel: 'chrome', headless: false, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] })
try {
  const session = await browser.newBrowserCDPSession()
  const { gpu } = await session.send('SystemInfo.getInfo')
  const adapter = gpu.devices[0]
  if (!/Apple|NVIDIA|AMD|Intel|Adreno|Mali/i.test(JSON.stringify(adapter)) ||
      /swiftshader|llvmpipe|software|basic render|lavapipe/i.test(JSON.stringify(adapter)) ||
      gpu.featureStatus.rasterization !== 'enabled') throw new Error('Hardware rasterization was not verified')
  const page = await browser.newPage({ viewport: null })
  await page.bringToFront()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${url}/?seed=11&size=200&players=4&oreFields=24&tutorial=0`)
  await page.waitForFunction(() => window.gameState?.gameStarted && window.gameInstance?.gameLoop?.allAssetsLoaded &&
    document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden') &&
    performance.getEntriesByName('startup:idle-settings-and-save:duration').length > 0, null, { timeout: 120000 })
  await page.locator('#importSaveInput').setInputFiles(fixture)
  await page.waitForFunction(() => window.gameInstance?.units?.length >= 400 &&
    document.getElementById('loadingScreen')?.classList.contains('loading-screen--hidden'), null, { timeout: 120000 })
  const result = await page.evaluate(async() => {
    const { createUnitShadowCanvas, usesUnitGroundShadow } = await import('/src/rendering/unitShadow.js')
    const config = await import('/src/config.js')
    const { gameLoop, renderer, units } = window.gameInstance
    gameLoop.stop()
    if (document.querySelector('.tutorial-overlay') || window.tutorialSystem) throw new Error('Tutorial active')
    if (document.visibilityState !== 'visible' || !document.hasFocus()) throw new Error('Page not foregrounded')
    const unitRenderer = renderer.unitRenderer
    const setup = document.createElement('canvas')
    setup.width = 512
    setup.height = 512
    const setupCtx = setup.getContext('2d')
    const types = new Set()
    for (const unit of units) {
      if (!usesUnitGroundShadow(unit) || types.has(unit.type)) continue
      types.add(unit.type)
      unitRenderer.renderUnitBase(setupCtx, unit, { x: unit.x - 240, y: unit.y - 240 }, 512, 512, true)
    }
    const defaults = {
      offset: config.UNIT_SHADOW_OFFSET, direction: config.UNIT_SHADOW_DIRECTION,
      startStretch: config.UNIT_SHADOW_START_STRETCH, endStretch: config.UNIT_SHADOW_END_STRETCH,
      size: config.UNIT_SHADOW_SIZE, opacity: config.UNIT_SHADOW_OPACITY, blur: config.UNIT_SHADOW_BLUR
    }
    const settings = [
      { name: 'default', ...defaults },
      { name: 'minimum', offset: 0, direction: 0, startStretch: 0.5, endStretch: 0.5, size: 0.5, opacity: 1, blur: 0 },
      { name: 'maximum', offset: 1.5, direction: 180, startStretch: 2, endStretch: 3, size: 2, opacity: 1, blur: 12 },
      { name: 'rotated', offset: 1.2, direction: 315, startStretch: 1, endStretch: 2, size: 1.25, opacity: 0.5, blur: 3 }
    ]
    const cases = []
    for (const [type, mask] of unitRenderer.shadowMaskDrawers) {
      for (const setting of settings) {
        const source = createUnitShadowCanvas(mask, config.TILE_SIZE, setting)
        const data = source.getContext('2d').getImageData(0, 0, source.width, source.height).data
        let minX = source.width, minY = source.height, maxX = -1, maxY = -1
        for (let y = 0; y < source.height; y++) {
          for (let x = 0; x < source.width; x++) {
            if (!data[(y * source.width + x) * 4 + 3]) continue
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
          }
        }
        if (maxX < 0) {
          cases.push({ type, setting: setting.name, empty: true })
          continue
        }
        minX = Math.max(0, minX - 2)
        minY = Math.max(0, minY - 2)
        maxX = Math.min(source.width - 1, maxX + 2)
        maxY = Math.min(source.height - 1, maxY + 2)
        const w = maxX - minX + 1, h = maxY - minY + 1
        for (const dpr of [1, 2]) {
          for (const fraction of [0, 0.25, 0.5]) {
            const size = Math.ceil((source.width + 20) * dpr)
            const original = new OffscreenCanvas(size, size)
            const cropped = new OffscreenCanvas(size, size)
            const a = original.getContext('2d'), b = cropped.getContext('2d')
            for (const ctx of [a, b]) {
              ctx.fillStyle = '#84906f'
              ctx.fillRect(0, 0, size, size)
              ctx.scale(dpr, dpr)
            }
            const pos = 8 + fraction
            a.drawImage(source, pos, pos)
            b.drawImage(source, minX, minY, w, h, pos + minX, pos + minY, w, h)
            const pixelsA = a.getImageData(0, 0, size, size).data
            const pixelsB = b.getImageData(0, 0, size, size).data
            let changedChannels = 0, maxDelta = 0
            for (let i = 0; i < pixelsA.length; i++) {
              const delta = Math.abs(pixelsA[i] - pixelsB[i])
              if (delta) changedChannels++
              maxDelta = Math.max(maxDelta, delta)
            }
            cases.push({ type, setting: setting.name, dpr, fraction, source: [source.width, source.height], bounds: [minX, minY, w, h], changedChannels, maxDelta })
          }
        }
      }
    }
    return { types: [...types], cases, visible: document.visibilityState, focused: document.hasFocus() }
  })
  const summary = { fixtureSha256, browser: await browser.version(), adapter, ...result, errors }
  await writeFile(join(output, 'result.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({ types: result.types, cases: result.cases.length, changedCases: result.cases.filter(item => item.changedChannels).length, emptyCases: result.cases.filter(item => item.empty).length, errors }))
} finally {
  await browser.close()
}
