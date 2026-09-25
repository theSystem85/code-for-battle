import { describe, expect, it } from 'vitest'
import { writeGamepadEdgeScroll } from '../../src/input/gamepad/gamepadEdgeScroll.js'
import { nextRemoteStickToggle } from '../../src/input/gamepad/remoteStickToggle.js'
import { formatSignedAxis } from '../../src/input/gamepad/axisReadout.js'

describe('gamepad edge scroll', () => {
  const out = { x: 0, y: 0 }

  it('is zero at the 20px margin and full at the edge, including corners', () => {
    writeGamepadEdgeScroll(out, 20, 100, 800, 600)
    expect(out).toEqual({ x: 0, y: 0 })
    writeGamepadEdgeScroll(out, 0, 300, 800, 600)
    expect(out.x).toBe(-1)
    expect(out.y).toBe(0)
    writeGamepadEdgeScroll(out, 10, 590, 800, 600)
    expect(out.x).toBeCloseTo(-0.5)
    expect(out.y).toBeCloseTo(0.5)
    writeGamepadEdgeScroll(out, 800, 600, 800, 600)
    expect(out).toEqual({ x: 1, y: 1 })
    writeGamepadEdgeScroll(out, 790, 10, 800, 600)
    expect(out.x).toBeCloseTo(0.5)
    expect(out.y).toBeCloseTo(-0.5)
  })

  it('stays inside the map when the view is smaller than both margins', () => {
    writeGamepadEdgeScroll(out, 0, 0, 30, 30)
    expect(out).toEqual({ x: 0, y: 0 })
  })
})

describe('remote stick toggle', () => {
  it('toggles only while a target is alive and drops when the target is gone', () => {
    expect(nextRemoteStickToggle(false, true, true)).toBe(true)
    expect(nextRemoteStickToggle(true, false, true)).toBe(true)
    expect(nextRemoteStickToggle(true, true, true)).toBe(false)
    expect(nextRemoteStickToggle(false, true, false)).toBe(false)
    expect(nextRemoteStickToggle(true, false, false)).toBe(false)
  })
})

describe('signed axis readout', () => {
  it('prints the sign and two decimals', () => {
    expect(formatSignedAxis(-0.734)).toBe('-0.73')
    expect(formatSignedAxis(0.416)).toBe('+0.42')
    expect(formatSignedAxis(0)).toBe('0.00')
    expect(formatSignedAxis(4)).toBe('+1.00')
  })
})
