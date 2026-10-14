import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMapPanning } from '../../src/input/mapPanning.js'
import { gameState } from '../../src/gameState.js'
import { notifyMapEditorWheel } from '../../src/ui/mapEditorControls.js'
import { suspendRemoteControlAutoFocus } from '../../src/game/remoteControl.js'

vi.mock('../../src/config.js', () => ({ TILE_SIZE: 32 }))
vi.mock('../../src/gameState.js', () => ({ gameState: {} }))
vi.mock('../../src/game/remoteControl.js', () => ({ suspendRemoteControlAutoFocus: vi.fn() }))
vi.mock('../../src/benchmark/benchmarkTracker.js', () => ({ notifyBenchmarkManualCameraControl: vi.fn() }))
vi.mock('../../src/ui/mapEditorControls.js', () => ({ notifyMapEditorWheel: vi.fn() }))
vi.mock('../../src/utils/layoutMetrics.js', () => ({
  getPlayableViewportWidth: () => 640,
  getPlayableViewportHeight: () => 480
}))

describe('map wheel panning', () => {
  let canvas
  let render
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = '<button id="mapPanBtn"></button><canvas id="gameCanvas"></canvas>'
    canvas = document.getElementById('gameCanvas')
    Object.assign(gameState, {
      mapGrid: Array.from({ length: 64 }, () => Array(64).fill(null)),
      scrollOffset: { x: 100, y: 200 }, dragVelocity: { x: 8, y: -6 },
      smoothScroll: { active: true }, mapEditMode: false, benchmarkActive: false
    })
    render = vi.fn()
    setupMapPanning(canvas, gameState.mapGrid, render)
  })

  const wheel = (canvas, options) => {
    const event = new window.WheelEvent('wheel', { cancelable: true, bubbles: true, ...options })
    canvas.dispatchEvent(event)
    return event
  }

  it('preserves fractional diagonal deltas, cancels camera inertia and consumes the map event', () => {
    const velocity = gameState.dragVelocity
    const outside = vi.fn()
    document.addEventListener('wheel', outside, { once: true })
    expect(wheel(canvas, { deltaX: 2.5, deltaY: -4.25 }).defaultPrevented).toBe(true)
    expect(gameState.scrollOffset).toEqual({ x: 102.5, y: 195.75 })
    expect(gameState.dragVelocity).toBe(velocity)
    expect(velocity).toEqual({ x: 0, y: 0 })
    expect(gameState.smoothScroll.active).toBe(false)
    expect(suspendRemoteControlAutoFocus).toHaveBeenCalledOnce()
    expect(render).toHaveBeenCalledOnce()
    expect(outside).not.toHaveBeenCalled()
    const outsideEvent = wheel(document.body, { deltaY: 5 })
    expect(outsideEvent.defaultPrevented).toBe(false)
    expect(outside).toHaveBeenCalledOnce()
  })

  it('normalizes line/page units and supplies Shift-wheel horizontal fallback', () => {
    wheel(canvas, { deltaX: 2, deltaY: 1, deltaMode: 1 })
    expect(gameState.scrollOffset).toEqual({ x: 132, y: 216 })
    wheel(canvas, { deltaX: 0.5, deltaY: 0.5, deltaMode: 2 })
    expect(gameState.scrollOffset).toEqual({ x: 452, y: 456 })
    wheel(canvas, { deltaY: -10, shiftKey: true })
    expect(gameState.scrollOffset).toEqual({ x: 442, y: 456 })
    wheel(canvas, { deltaX: 3, deltaY: 7, shiftKey: true })
    expect(gameState.scrollOffset).toEqual({ x: 445, y: 463 })
  })

  it('consumes outward gestures at all bounds, including maps smaller than the viewport', () => {
    expect(wheel(canvas, { deltaX: -10000, deltaY: -10000 }).defaultPrevented).toBe(true)
    expect(gameState.scrollOffset).toEqual({ x: 0, y: 0 })
    wheel(canvas, { deltaX: 10000, deltaY: 10000 })
    expect(gameState.scrollOffset).toEqual({ x: 1408, y: 1568 })
    gameState.mapGrid = [[null]]
    wheel(canvas, { deltaX: 10000, deltaY: 10000 })
    expect(gameState.scrollOffset).toEqual({ x: 0, y: 0 })
  })

  it('preserves map-editor wheel behavior and ignores pinch movement', () => {
    gameState.mapEditMode = true
    wheel(canvas, { deltaY: 9 })
    expect(notifyMapEditorWheel).toHaveBeenCalledWith(9)
    expect(gameState.scrollOffset).toEqual({ x: 100, y: 200 })
    gameState.mapEditMode = false
    expect(wheel(canvas, { deltaX: 30, deltaY: 90, ctrlKey: true }).defaultPrevented).toBe(true)
    expect(gameState.scrollOffset).toEqual({ x: 100, y: 200 })
  })
})
