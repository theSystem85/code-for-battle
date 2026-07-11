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
  afterEach(() => vi.restoreAllMocks())

  it('drops immediately to 1x while the camera is moving', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    const manager = createAdaptiveManager()

    expect(manager.updateAdaptivePixelRatio(60, 1000, true)).toBe(true)
    expect(manager.adaptivePixelRatioCap).toBe(1)
    expect(manager.resizeCanvases).toHaveBeenCalledTimes(1)
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
