import { describe, expect, it } from 'vitest'
import { computeCoopCameraFocus, coopFocusToScroll } from '../../src/input/gamepad/coopCamera.js'

const view = { viewportWidth: 800, viewportHeight: 600, margin: 64 }

describe('coop camera focus', () => {
  it('frames the midpoint once player 2 is inside player 1 view', () => {
    const focus = computeCoopCameraFocus({
      ...view,
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 0 },
      previousMode: 'p1'
    })
    expect(focus.mode).toBe('both')
    expect(focus.focusX).toBe(50)
    expect(focus.focusY).toBe(0)
  })

  it('drops to player 1 when player 2 leaves the stay box', () => {
    const focus = computeCoopCameraFocus({
      ...view,
      p1: { x: 0, y: 0 },
      p2: { x: 900, y: 0 },
      previousMode: 'both'
    })
    expect(focus).toEqual({ mode: 'p1', focusX: 0, focusY: 0 })
  })

  it('uses hysteresis around the enter and stay limits', () => {
    const shared = { ...view, p1: { x: 0, y: 0 }, p2: { x: 700, y: 0 } }
    expect(computeCoopCameraFocus({ ...shared, previousMode: 'both' }).mode).toBe('both')
    expect(computeCoopCameraFocus({ ...shared, previousMode: 'p1' }).mode).toBe('p1')
  })

  it('stays on player 1 when there is no second unit', () => {
    expect(computeCoopCameraFocus({ ...view, p1: { x: 10, y: 20 }, p2: null })).toEqual({
      mode: 'p1',
      focusX: 10,
      focusY: 20
    })
    expect(computeCoopCameraFocus({ ...view, p1: null, p2: { x: 1, y: 1 } }).mode).toBe('none')
  })

  it('clamps the scroll target to the map', () => {
    expect(coopFocusToScroll(100, 100, 800, 600, 2000, 2000)).toEqual({ x: 0, y: 0 })
    expect(coopFocusToScroll(5000, 5000, 800, 600, 1000, 800)).toEqual({ x: 1000, y: 800 })
  })
})
