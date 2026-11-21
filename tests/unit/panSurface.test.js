import { beforeEach, describe, expect, it } from 'vitest'
import { createPanSurface, normalizePanWheel, stepPanInertia } from '../../src/input/panSurface.js'

describe('pan surface', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  it('[U07289] normalizes wheel lines and shift-wheel horizontal panning', () => {
    expect(normalizePanWheel({ deltaMode: 1, deltaX: 2, deltaY: 3, shiftKey: false }, 100, 80)).toEqual({ x: 32, y: 48 })
    expect(normalizePanWheel({ deltaMode: 0, deltaX: 0, deltaY: 9, shiftKey: true }, 100, 80)).toEqual({ x: 9, y: 0 })
  })
  it('[U07303] decelerates inertia consistently across frame durations', () => {
    const oneFrame = stepPanInertia({ x: 1, y: -0.5 }, 1000 / 60)
    const twoFrames = stepPanInertia(stepPanInertia({ x: 1, y: -0.5 }, 1000 / 120), 1000 / 120)
    expect(oneFrame.x).toBeCloseTo(twoFrames.x, 8)
    expect(oneFrame.y).toBeCloseTo(twoFrames.y, 8)
    expect(stepPanInertia({ x: 0.01, y: 0 }, 16)).toEqual({ x: 0, y: 0 })
  })
  it('[U07290] clamps wheel, pointer and keyboard movement to the content', () => {
    const viewport = document.createElement('div'); const content = document.createElement('div')
    Object.defineProperties(viewport, { clientWidth: { value: 100 }, clientHeight: { value: 80 } })
    Object.defineProperties(content, { scrollWidth: { value: 300 }, scrollHeight: { value: 200 } })
    viewport.append(content); document.body.append(viewport)
    const pan = createPanSurface(viewport, { content })
    viewport.dispatchEvent(new window.WheelEvent('wheel', { deltaX: 500, deltaY: 500, cancelable: true }))
    expect(pan.getPosition()).toEqual({ x: 200, y: 120 })
    viewport.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', cancelable: true }))
    expect(pan.getPosition().x).toBe(136)
    pan.destroy()
  })
})
