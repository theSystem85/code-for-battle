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
    // Default mobile terrain cap is 2x (map ground stays sharp on retina phones).
    expect(manager.getGameGlCanvas().width).toBe(300)
    expect(manager.getGameGpuCanvas().width).toBe(300)
    expect(manager.getMinimapCanvas().width).toBe(460)
    expect(manager.pixelRatio).toBe(2)
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

  it('does not raise DPR until the camera and frame rate have stayed stable', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    const manager = createAdaptiveManager(1)
    manager.stableCameraSince = 1000
    manager.lastAdaptivePixelRatioChange = 1000

    expect(manager.updateAdaptivePixelRatio(60, 4500, false)).toBe(false)
    expect(manager.adaptivePixelRatioCap).toBe(1)
    // Stable for >= 4 s and >= 5 s since the last change: raise one step toward the 2x cap.
    expect(manager.updateAdaptivePixelRatio(60, 6500, false)).toBe(true)
    expect(manager.adaptivePixelRatioCap).toBe(1.25)
  })

  describe('terrain density governor (step-down only)', () => {
    function createGovernorManager(cap = 2) {
      const manager = createAdaptiveManager(cap)
      manager.automaticDensityAdjustmentEnabled = false
      manager.resetTerrainDensityGovernor()
      return manager
    }

    it('keeps 2x while the frame rate meets the display-limited target', () => {
      vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
      const manager = createGovernorManager()
      for (let t = 1000; t <= 10000; t += 1000) {
        expect(manager.updateTerrainDensityGovernor(59, t)).toBe(false)
      }
      expect(manager.adaptivePixelRatioCap).toBe(2)
    })

    it('steps down by 0.5 after three consecutive low samples and never below 1x', () => {
      vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
      const manager = createGovernorManager()
      manager.updateTerrainDensityGovernor(120, 1000) // display can present 120 Hz -> target 75
      expect(manager.updateTerrainDensityGovernor(60, 2000)).toBe(false)
      expect(manager.updateTerrainDensityGovernor(60, 3000)).toBe(false)
      expect(manager.updateTerrainDensityGovernor(60, 4000)).toBe(true)
      expect(manager.adaptivePixelRatioCap).toBe(1.5)
      for (let t = 5000; t <= 20000; t += 1000) manager.updateTerrainDensityGovernor(40, t)
      expect(manager.adaptivePixelRatioCap).toBe(1)
      expect(manager.resizeCanvases).toHaveBeenCalledTimes(2)
    })

    it('does nothing on desktop layouts', () => {
      vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
      const manager = createGovernorManager()
      manager.isTouchLayout = () => false
      for (let t = 1000; t <= 10000; t += 1000) manager.updateTerrainDensityGovernor(20, t)
      expect(manager.adaptivePixelRatioCap).toBe(2)
    })
  })
})
