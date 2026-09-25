import { describe, expect, it, vi } from 'vitest'
import { pulseGamepad, pulseGamepadHaptic } from '../../src/input/gamepad/gamepadHaptics.js'

describe('gamepad haptics', () => {
  it('plays a dual-rumble pulse scaled by intensity', () => {
    const playEffect = vi.fn(() => Promise.resolve())
    const pad = { vibrationActuator: { playEffect } }
    expect(pulseGamepadHaptic(pad, 'fire', 0.5)).toBe(true)
    const effect = playEffect.mock.calls[0]
    expect(effect[0]).toBe('dual-rumble')
    expect(effect[1].startDelay).toBe(0)
    expect(effect[1].duration).toBe(70)
    expect(effect[1].weakMagnitude).toBeCloseTo(0.35)
    expect(effect[1].strongMagnitude).toBeCloseTo(0.225)
  })

  it('uses the Firefox pulse actuator when dual-rumble is missing', () => {
    const pulse = vi.fn(() => Promise.resolve())
    expect(pulseGamepadHaptic({ hapticActuators: [{ pulse }] }, 'damage', 1)).toBe(true)
    expect(pulse).toHaveBeenCalledWith(0.85, 120)
  })

  it('returns false when the pad cannot vibrate', () => {
    expect(pulseGamepadHaptic({}, 'menu', 1)).toBe(false)
    expect(pulseGamepadHaptic(null, 'menu', 1)).toBe(false)
  })

  it('does not touch the actuator when vibration is off or intensity is 0', () => {
    const playEffect = vi.fn()
    const pad = { vibrationActuator: { playEffect } }
    expect(pulseGamepad(pad, 'fire', { enabled: false, intensity: 1 })).toBe(false)
    expect(pulseGamepad(pad, 'fire', { enabled: true, intensity: 0 })).toBe(false)
    expect(playEffect).not.toHaveBeenCalled()
  })

  it('swallows a rejected vibration promise', async() => {
    const playEffect = () => Promise.reject(new Error('unsupported'))
    expect(pulseGamepadHaptic({ vibrationActuator: { playEffect } }, 'menu', 0.5)).toBe(true)
    await Promise.resolve()
  })
})
