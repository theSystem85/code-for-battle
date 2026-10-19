export async function openOceanWaterFixture(page, backend = 'webgl') {
  await page.route('**/ocean-water-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<body style="margin:0;background:#123"></body>'
  }))
  await page.goto('/ocean-water-fixture')
  const setup = await page.evaluate(async(backend) => {
    // The fixture creates its own renderer; avoid the app's concurrent auto-probe.
    localStorage.setItem('rts_graphics_settings', JSON.stringify({ rendererBackendChoice: 'webgl' }))
    const config = await import('/src/config.js')
    await config.setRendererBackend('webgl')
    const { GameWebGLRenderer } = await import('/src/rendering/webglRenderer.js')
    const { GameWebGPURenderer } = await import('/src/rendering/webgpuRenderer.js')
    const { publishCanvasViewport } = await import('/src/rendering/prepared/canvasViewportRegistry.js')
    const canvas = document.createElement('canvas')
    const copy = document.createElement('canvas')
    const ctx = copy.getContext('2d', { willReadFrequently: true })
    document.body.append(canvas)
    const gl = backend === 'webgl' ? canvas.getContext('webgl2', { preserveDrawingBuffer: true }) : null
    if (backend === 'webgl' && !gl) throw new Error('WebGL2 is required for the water shader test')
    if (backend === 'webgpu' && !navigator.gpu) return { unavailable: 'WebGPU API unavailable' }
    const map = Array.from({ length: 64 }, () => Array.from({ length: 64 }, () => ({ type: 'water' })))
    const sotMask = []
    const mapRenderer = { sotMask, isStreetWaterTransitionTile: () => false }
    const textures = { allTexturesLoaded: false }
    const renderer = backend === 'webgl'
      ? new GameWebGLRenderer(gl, textures, mapRenderer)
      : new GameWebGPURenderer(textures, mapRenderer)
    if (backend === 'webgpu') {
      try {
        await renderer.initialize(canvas)
      } catch (error) {
        if (error.message === 'No WebGPU adapter is available') return { unavailable: error.message }
        throw error
      }
    }
    let density = 1
    const scroll = { x: 128, y: 128 }
    const options = { waterOnly: true, time: 1200, topologyRevision: 1 }
    const resize = (ratio, width = 256, height = 192) => {
      density = ratio
      canvas.width = copy.width = width * ratio
      canvas.height = copy.height = height * ratio
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      publishCanvasViewport(canvas, { logicalWidth: width, logicalHeight: height, density: ratio })
    }
    resize(1)
    const render = ({ time = 1200, x = 128, y = 128, zoom = 0.2, tone = 0.35, saturation = 0.4 } = {}) => {
      config.setWaterEffectZoom(zoom)
      config.setWaterEffectTone(tone)
      config.setWaterEffectSaturation(saturation)
      scroll.x = x
      scroll.y = y
      options.time = time
      renderer.render(map, scroll, canvas, options)
      ctx.clearRect(0, 0, copy.width, copy.height)
      ctx.drawImage(canvas, 0, 0)
      return ctx.getImageData(0, 0, copy.width, copy.height).data
    }
    render()
    if (backend === 'webgpu') {
      await renderer.device.queue.onSubmittedWorkDone()
      await new Promise(resolve => setTimeout(resolve, 0))
      if (renderer.status === 'failed') throw new Error(renderer.failureReason)
    }
    window.waterFixture = { canvas, renderer, map, sotMask, options, scroll, resize, render, config,
      pixel: (pixels, x, y) => Array.from(pixels.slice((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 4)),
      get density() { return density }
    }
    return { backend }
  }, backend)
  if (backend === 'webgpu' && !setup.unavailable) {
    await page.waitForFunction(() => {
      const renderer = window.waterFixture.renderer
      if (renderer.status === 'failed') throw new Error(renderer.failureReason)
      return renderer.validationComplete
    })
  }
  return setup
}
