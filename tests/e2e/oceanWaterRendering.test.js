import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { openOceanWaterFixture } from './helpers/oceanWaterFixture.js'
import { summarizeFrameIntervals } from '../../scripts/performance/benchmarkMetrics.js'

for (const backend of ['webgl', 'webgpu']) {
  test(`[E00201] ocean water animates with stable world coordinates and color controls (${backend})`, async({ page }, testInfo) => {
    const setup = await openOceanWaterFixture(page, backend)
    test.skip(Boolean(setup.unavailable), setup.unavailable)
    const result = await page.evaluate(() => {
      const f = window.waterFixture
      const first = f.render()
      const later = f.render({ time: 2200 })
      const panned = f.render({ x: 144, y: 144 })
      const gray = f.render({ saturation: 0 })
      const blue = f.render({ tone: -1, saturation: 1 })
      const green = f.render({ tone: 1, saturation: 1 })
      const zoomed = f.render({ zoom: 1 })
      const tiny = f.render({ zoom: 0.001 })
      let animation = 0
      let panError = 0
      let grayError = 0
      let toneDelta = 0
      let zoomDelta = 0
      let minAlpha = 255
      let tinyMin = 255
      let tinyMax = 0
      for (let y = 20; y < 170; y++) {
        for (let x = 20; x < 230; x++) {
          const i = (y * 256 + x) * 4
          const j = ((y - 16) * 256 + x - 16) * 4
          for (let c = 0; c < 3; c++) {
            animation += Math.abs(first[i + c] - later[i + c])
            panError = Math.max(panError, Math.abs(first[i + c] - panned[j + c]))
            toneDelta += Math.abs(blue[i + c] - green[i + c])
            zoomDelta += Math.abs(first[i + c] - zoomed[i + c])
          }
          grayError = Math.max(grayError, Math.abs(gray[i] - gray[i + 1]), Math.abs(gray[i + 1] - gray[i + 2]))
          minAlpha = Math.min(minAlpha, first[i + 3], later[i + 3], tiny[i + 3])
          tinyMin = Math.min(tinyMin, tiny[i])
          tinyMax = Math.max(tinyMax, tiny[i])
        }
      }
      f.render()
      return { animation, panError, grayError, toneDelta, zoomDelta, minAlpha, tinyRange: tinyMax - tinyMin,
        image: f.canvas.toDataURL('image/webp', 0.85), stats: f.renderer.stats, failure: f.renderer.failureReason }
    })
    expect(result.failure).toBeFalsy()
    expect(result.minAlpha).toBe(255)
    expect(result.animation).toBeGreaterThan(50000)
    expect(result.panError).toBeLessThanOrEqual(1)
    expect(result.grayError).toBeLessThanOrEqual(1)
    expect(result.toneDelta).toBeGreaterThan(50000)
    expect(result.zoomDelta).toBeGreaterThan(50000)
    expect(result.tinyRange).toBeLessThanOrEqual(1)
    expect(result.stats.topologyBuilds).toBe(1)
    await testInfo.attach(`${backend}-ocean.webp`, { body: Buffer.from(result.image.split(',')[1], 'base64'), contentType: 'image/webp' })
  })

  test(`[E00202] ocean water preserves display density, tile seams and clipped shoreline coverage (${backend})`, async({ page }) => {
    const setup = await openOceanWaterFixture(page, backend)
    test.skip(Boolean(setup.unavailable), setup.unavailable)
    const result = await page.evaluate(() => {
      const f = window.waterFixture
      const first = f.render()
      f.resize(3)
      const high = f.render()
      let densityError = 0
      // DPR 3 pixel centres coincide with DPR 1: x*3+1, y*3+1.
      for (let y = 16; y < 176; y++) {
        for (let x = 16; x < 240; x++) {
          const i = (y * 256 + x) * 4
          const j = ((y * 3 + 1) * 768 + x * 3 + 1) * 4
          for (let c = 0; c < 4; c++) densityError = Math.max(densityError, Math.abs(first[i + c] - high[j + c]))
        }
      }
      f.resize(1)
      f.map[6][6].type = 'land'
      f.sotMask[6] = []
      f.sotMask[6][6] = { type: 'water', orientation: 'top-left' }
      f.options.topologyRevision++
      const clipped = f.render()
      // Land cell is at screen (64,64); its top-left water SOT keeps the same phase.
      const inside = f.pixel(clipped, 68, 68)
      const expected = f.pixel(first, 68, 68)
      const outside = f.pixel(clipped, 90, 90)
      const neighbor = f.pixel(clipped, 100, 80)
      return { densityError, inside, expected, outside, neighbor }
    })
    expect(result.densityError).toBeLessThanOrEqual(2)
    expect(result.inside).toEqual(result.expected)
    expect(result.outside[3]).toBe(0)
    expect(result.neighbor[3]).toBe(255)
  })
}

test('[E00203] WebGL and WebGPU ocean shading agree on rendered pixels', async({ page }) => {
  await openOceanWaterFixture(page, 'webgl')
  const gl = await page.evaluate(() => Array.from(window.waterFixture.render()))
  const setup = await openOceanWaterFixture(page, 'webgpu')
  test.skip(Boolean(setup.unavailable), setup.unavailable)
  const gpu = await page.evaluate(() => Array.from(window.waterFixture.render()))
  let total = 0
  let maximum = 0
  for (let i = 0; i < gl.length; i++) {
    const delta = Math.abs(gl[i] - gpu[i])
    total += delta
    maximum = Math.max(maximum, delta)
  }
  expect(total / gl.length).toBeLessThan(0.5)
  expect(maximum).toBeLessThanOrEqual(3)
})

test('[E00204] records full-screen DPR 2 water scrolling cost and retained uploads', async({ page }, testInfo) => {
  test.skip(process.env.OCEAN_WATER_BENCHMARK !== '1', 'Opt in with OCEAN_WATER_BENCHMARK=1')
  await openOceanWaterFixture(page)
  const result = await page.evaluate(async() => {
    const f = window.waterFixture
    f.resize(2, 1440, 1000)
    f.render()
    const uploadsBefore = f.renderer.stats.topologyUploadBytes
    const heapBefore = performance.memory?.usedJSHeapSize ?? null
    const intervals = []
    const submitTimes = []
    let previous
    for (let i = 0; i < 120; i++) {
      await new Promise(resolve => requestAnimationFrame(timestamp => {
        if (previous !== undefined) intervals.push(timestamp - previous)
        previous = timestamp
        f.scroll.x = (i * 64) % 600
        f.scroll.y = (i * 32) % 1000
        f.options.time = i * 16.667
        const start = performance.now()
        f.renderer.render(f.map, f.scroll, f.canvas, f.options)
        submitTimes.push(performance.now() - start)
        resolve()
      }))
    }
    const gl = f.renderer.gl
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    return { intervals, submitTimes, gpu: f.renderer.gpuTiming, uploadsBefore, uploadsAfter: f.renderer.stats.topologyUploadBytes,
      heapBefore, heapAfter: performance.memory?.usedJSHeapSize ?? null, dpr: f.density,
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }
  })
  const report = { ...result, frames: summarizeFrameIntervals(result.intervals), cpuSubmit: summarizeFrameIntervals(result.submitTimes), certification: 'diagnostic-only; run the full game acceptance protocol on qualifying hardware' }
  console.log('OCEAN_WATER_BENCHMARK', JSON.stringify(report))
  await testInfo.attach('ocean-water-performance.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
  expect(result.uploadsAfter).toBe(result.uploadsBefore)
  expect(result.intervals.length).toBe(119)
})
