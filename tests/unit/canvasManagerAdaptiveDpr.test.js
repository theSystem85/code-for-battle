import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasManager } from '../../src/rendering/canvasManager.js'
import { getCanvasViewportRecord } from '../../src/rendering/prepared/canvasViewportRegistry.js'

function createAdaptiveManager(cap = 3) {
  const manager = Object.create(CanvasManager.prototype)
  manager.isTouchLayout = () => true
  manager.adaptivePixelRatioCap = cap
  manager.lastAdaptivePixelRatioCheck = 0
  manager.lastAdaptivePixelRatioChange = 0
  manager.stableCameraSince = 0
  manager.automaticDensityAdjustmentEnabled = true
  manager.resizeCanvases = vi.fn()
  return manager
}

describe('CanvasManager adaptive DPR', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.className = ''
    document.body.innerHTML = ''
    document.documentElement.style.removeProperty('--app-height')
    document.documentElement.style.removeProperty('--app-layout-width')
  })

  it('drops immediately to 1x while the camera is moving', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    const manager = createAdaptiveManager()

    expect(manager.updateAdaptivePixelRatio(60, 1000, true)).toBe(true)
    expect(manager.adaptivePixelRatioCap).toBe(1)
    expect(manager.resizeCanvases).toHaveBeenCalledTimes(1)
  })

  it('keeps density fixed during scrolling unless automatic adjustment is explicitly enabled', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    const manager = createAdaptiveManager()
    manager.automaticDensityAdjustmentEnabled = false

    expect(manager.updateAdaptivePixelRatio(30, 1000, true)).toBe(false)
    expect(manager.adaptivePixelRatioCap).toBe(3)
    expect(manager.resizeCanvases).not.toHaveBeenCalled()
  })

  it('keeps the entity and UI overlay at native DPR when terrain is capped', () => {
    const manager = createAdaptiveManager(1)

    expect(manager.resolvePixelRatio(3)).toBe(1)
    expect(manager.resolveOverlayPixelRatio(3)).toBe(3)
  })

  it('sizes terrain backing stores at the cap and the overlay at native DPR', () => {
    document.body.className = 'is-touch'
    document.body.innerHTML = `
      <canvas id="gameCanvasGPU"></canvas>
      <canvas id="gameCanvasGL"></canvas>
      <canvas id="gameCanvas"></canvas>
      <canvas id="minimap"></canvas>
    `
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(400)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    vi.spyOn(window, 'visualViewport', 'get').mockReturnValue(null)

    const manager = new CanvasManager()

    expect(manager.getGameCanvas().style.width).toBe('150px')
    expect(manager.getGameCanvas().width).toBe(450)
    expect(manager.getGameGlCanvas().width).toBe(150)
    expect(manager.getGameGpuCanvas().width).toBe(150)
    expect(manager.getMinimapCanvas().width).toBe(230)
    expect(manager.pixelRatio).toBe(1)
    expect(manager.overlayPixelRatio).toBe(3)
    manager.dispose()
  })

  it('publishes one coherent density generation after an explicit graphics change', () => {
    document.body.innerHTML = `
      <canvas id="gameCanvasGPU"></canvas>
      <canvas id="gameCanvasGL"></canvas>
      <canvas id="gameCanvas"></canvas>
      <canvas id="minimap"></canvas>
    `
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(500)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300)
    vi.spyOn(window, 'visualViewport', 'get').mockReturnValue(null)
    const densityEvents = []
    const handleDensityChange = event => densityEvents.push(event.detail)
    document.addEventListener('canvas-density-changed', handleDensityChange)

    const manager = new CanvasManager()
    expect(manager.densityGeneration).toBe(1)
    expect(densityEvents).toHaveLength(1)
    manager.resizeCanvases()
    expect(manager.densityGeneration).toBe(1)
    expect(densityEvents).toHaveLength(1)

    expect(manager.setGraphicsPixelRatioCap(1.5)).toBe(true)
    expect(manager.densityGeneration).toBe(2)
    expect(densityEvents).toHaveLength(2)
    expect(densityEvents[1]).toMatchObject({
      generation: 2,
      pixelRatio: 1.5,
      overlayPixelRatio: 3
    })
    expect(getCanvasViewportRecord(manager.getGameGlCanvas())).toMatchObject({
      densityGeneration: 2,
      viewport: {
        density: 1.5,
        logicalWidth: 250,
        logicalHeight: 300,
        backingWidth: 375,
        backingHeight: 450
      }
    })
    expect(getCanvasViewportRecord(manager.getGameCanvas())).toMatchObject({
      densityGeneration: 2,
      viewport: {
        density: 3,
        logicalWidth: 250,
        logicalHeight: 300,
        backingWidth: 750,
        backingHeight: 900
      }
    })

    manager.dispose()
    document.removeEventListener('canvas-density-changed', handleDensityChange)
  })

  it('sizes a portrait canvas from the laid-out document height instead of a stale short innerHeight', () => {
    document.body.className = 'is-touch mobile-portrait'
    document.body.innerHTML = `
      <canvas id="gameCanvasGPU"></canvas>
      <canvas id="gameCanvasGL"></canvas>
      <canvas id="gameCanvas"></canvas>
      <canvas id="minimap"></canvas>
    `
    const previousHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'clientHeight')
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 844 })
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(700)
    vi.spyOn(window, 'visualViewport', 'get').mockReturnValue(null)

    const manager = new CanvasManager()

    expect(manager.getGameCanvas().style.height).toBe('844px')
    expect(manager.getGameCanvas().height).toBe(2532)
    expect(getCanvasViewportRecord(manager.getGameCanvas()).viewport.logicalHeight).toBe(844)
    expect(manager.getGameCanvas().style.position).toBe('absolute')
    manager.dispose()
    if (previousHeight) {
      Object.defineProperty(document.documentElement, 'clientHeight', previousHeight)
    } else {
      delete document.documentElement.clientHeight
    }
  })

  it('sizes a portrait canvas from the fixed root border box when clientHeight stays short', () => {
    document.body.className = 'is-touch mobile-portrait'
    document.body.innerHTML = `
      <canvas id="gameCanvasGPU"></canvas>
      <canvas id="gameCanvasGL"></canvas>
      <canvas id="gameCanvas"></canvas>
      <canvas id="minimap"></canvas>
    `
    const previousHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'clientHeight')
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 700 })
    const rectSpy = vi.spyOn(document.documentElement, 'getBoundingClientRect').mockReturnValue({
      width: 390,
      height: 844,
      top: 0,
      left: 0,
      right: 390,
      bottom: 844,
      x: 0,
      y: 0,
      toJSON() { return {} }
    })
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(700)
    vi.spyOn(window, 'visualViewport', 'get').mockReturnValue({
      width: 390,
      height: 700,
      offsetTop: 0,
      offsetLeft: 0,
      addEventListener() {},
      removeEventListener() {}
    })

    const manager = new CanvasManager()

    expect(manager.getGameCanvas().style.height).toBe('844px')
    expect(manager.getGameCanvas().style.position).toBe('absolute')
    expect(getCanvasViewportRecord(manager.getGameCanvas()).viewport.logicalHeight).toBe(844)
    manager.dispose()
    rectSpy.mockRestore()
    if (previousHeight) {
      Object.defineProperty(document.documentElement, 'clientHeight', previousHeight)
    } else {
      delete document.documentElement.clientHeight
    }
  })

  it('does not reserve a condensed or collapsed sidebar box in the portrait canvas', () => {
    document.body.className = 'is-touch mobile-portrait sidebar-condensed'
    document.body.innerHTML = `
      <div id="sidebar"></div>
      <div id="mobileBuildMenuContainer" aria-hidden="false"></div>
      <canvas id="gameCanvasGPU"></canvas>
      <canvas id="gameCanvasGL"></canvas>
      <canvas id="gameCanvas"></canvas>
      <canvas id="minimap"></canvas>
    `
    const sidebar = document.getElementById('sidebar')
    const barHeight = 96
    vi.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue({
      width: barHeight,
      height: barHeight,
      top: 0,
      left: -barHeight,
      right: 0,
      bottom: barHeight,
      x: -barHeight,
      y: 0,
      toJSON() { return {} }
    })
    const previousHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'clientHeight')
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 748 })
    vi.spyOn(document.documentElement, 'getBoundingClientRect').mockReturnValue({
      width: 390,
      height: 844,
      top: 0,
      left: 0,
      right: 390,
      bottom: 844,
      x: 0,
      y: 0,
      toJSON() { return {} }
    })
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(748)
    vi.spyOn(window, 'visualViewport', 'get').mockReturnValue({
      width: 390,
      height: 748,
      offsetTop: 0,
      offsetLeft: 0,
      addEventListener() {},
      removeEventListener() {}
    })

    const manager = new CanvasManager()
    const canvas = manager.getGameCanvas()
    const bar = document.getElementById('mobileBuildMenuContainer')

    expect(canvas.style.height).toBe('844px')
    expect(canvas.style.width).toBe('390px')
    expect(canvas.style.left).toBe('0px')
    expect(canvas.style.position).toBe('absolute')
    expect(bar.style.position).toBe('absolute')
    expect(bar.style.bottom).toBe('0px')
    expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('')

    document.body.classList.remove('sidebar-condensed')
    manager.resizeCanvases()
    expect(canvas.style.left).toBe(`${barHeight}px`)
    expect(canvas.style.width).toBe(`${390 - barHeight}px`)
    expect(canvas.style.height).toBe('844px')
    expect(bar.style.position).toBe('')

    document.body.classList.add('sidebar-collapsed')
    manager.resizeCanvases()
    expect(canvas.style.left).toBe('0px')
    expect(canvas.style.width).toBe('390px')
    expect(canvas.style.height).toBe('844px')

    document.body.classList.remove('sidebar-collapsed')
    document.body.classList.add('sidebar-condensed')
    manager.resizeCanvases()
    expect(canvas.style.left).toBe('0px')
    expect(canvas.style.height).toBe('844px')
    expect(bar.style.bottom).toBe('0px')

    manager.dispose()
    if (previousHeight) {
      Object.defineProperty(document.documentElement, 'clientHeight', previousHeight)
    } else {
      delete document.documentElement.clientHeight
    }
  })

  it('keeps landscape full-bleed and desktop sidebar width', () => {
    document.body.className = 'is-touch mobile-landscape'
    document.body.innerHTML = `
      <div id="sidebar"></div>
      <div id="mobileBuildMenuContainer" aria-hidden="false"></div>
      <canvas id="gameCanvasGPU"></canvas>
      <canvas id="gameCanvasGL"></canvas>
      <canvas id="gameCanvas"></canvas>
      <canvas id="minimap"></canvas>
    `
    vi.spyOn(document.getElementById('sidebar'), 'getBoundingClientRect').mockReturnValue({
      width: 250,
      height: 390,
      top: 0,
      left: 0,
      right: 250,
      bottom: 390,
      x: 0,
      y: 0,
      toJSON() { return {} }
    })
    const previousHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'clientHeight')
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 390 })
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1)
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(844)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(390)
    vi.spyOn(window.screen, 'width', 'get').mockReturnValue(844)
    vi.spyOn(window.screen, 'height', 'get').mockReturnValue(390)
    vi.spyOn(window, 'visualViewport', 'get').mockReturnValue(null)

    const landscape = new CanvasManager()
    expect(landscape.getGameCanvas().style.position).toBe('fixed')
    expect(landscape.getGameCanvas().style.width).toBe('844px')
    expect(landscape.getGameCanvas().style.height).toBe('390px')
    expect(document.getElementById('mobileBuildMenuContainer').style.position).toBe('')
    landscape.dispose()

    document.body.className = ''
    const desktop = new CanvasManager()
    expect(desktop.getGameCanvas().style.position).toBe('absolute')
    expect(desktop.getGameCanvas().style.left).toBe('250px')
    expect(desktop.getGameCanvas().style.width).toBe('594px')
    desktop.dispose()

    if (previousHeight) {
      Object.defineProperty(document.documentElement, 'clientHeight', previousHeight)
    } else {
      delete document.documentElement.clientHeight
    }
  })

  it('does not raise DPR until the camera and frame rate have stayed stable', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    const manager = createAdaptiveManager(1)
    manager.stableCameraSince = 1000
    manager.lastAdaptivePixelRatioChange = 1000

    expect(manager.updateAdaptivePixelRatio(60, 4500, false)).toBe(false)
    expect(manager.updateAdaptivePixelRatio(60, 6500, false)).toBe(false)
    expect(manager.adaptivePixelRatioCap).toBe(1)
  })
})
