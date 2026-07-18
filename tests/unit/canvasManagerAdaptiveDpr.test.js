import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasManager } from '../../src/rendering/canvasManager.js'

function createAdaptiveManager(cap = 3) {
  const manager = Object.create(CanvasManager.prototype)
  manager.isTouchLayout = () => true
  manager.adaptivePixelRatioCap = cap
  manager.lastAdaptivePixelRatioCheck = 0
  manager.lastAdaptivePixelRatioChange = 0
  manager.stableCameraSince = 0
  manager.resizeCanvases = vi.fn()
  return manager
}

describe('CanvasManager adaptive DPR', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.className = ''
    document.body.innerHTML = ''
  })

  it('drops immediately to 1x while the camera is moving', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    const manager = createAdaptiveManager()

    expect(manager.updateAdaptivePixelRatio(60, 1000, true)).toBe(true)
    expect(manager.adaptivePixelRatioCap).toBe(1)
    expect(manager.resizeCanvases).toHaveBeenCalledTimes(1)
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
