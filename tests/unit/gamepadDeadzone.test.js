import { describe, expect, it } from 'vitest'
import { STICK_DEADZONE, applyDeadzone, axisMagnitude } from '../../src/input/gamepad/deadzone.js'

describe('applyDeadzone', () => {
  it('returns 0 at and inside the deadzone', () => {
    expect(applyDeadzone(0)).toBe(0)
    expect(applyDeadzone(STICK_DEADZONE)).toBe(0)
    expect(applyDeadzone(-STICK_DEADZONE)).toBe(0)
    expect(applyDeadzone(0.1)).toBe(0)
  })

  it('reaches ±1 at the ends of the stick', () => {
    expect(applyDeadzone(1)).toBe(1)
    expect(applyDeadzone(-1)).toBe(-1)
  })

  it('scales the range past the deadzone', () => {
    const mid = STICK_DEADZONE + (1 - STICK_DEADZONE) / 2
    expect(applyDeadzone(mid)).toBeCloseTo(0.5, 6)
    expect(applyDeadzone(-mid)).toBeCloseTo(-0.5, 6)
  })

  it('rejects non-finite values and a deadzone that consumes the whole range', () => {
    expect(applyDeadzone(Number.NaN)).toBe(0)
    expect(applyDeadzone(0.9, 1)).toBe(0)
  })

  it('reports magnitude without sign', () => {
    expect(axisMagnitude(-1)).toBe(1)
    expect(axisMagnitude(0.05)).toBe(0)
  })
})
