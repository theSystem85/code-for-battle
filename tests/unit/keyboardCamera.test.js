import { afterEach, describe, expect, it } from 'vitest'
import { advanceKeyboardCameraVelocity } from '../../src/input/keyboardCamera.js'
import {
  KEYBOARD_SCROLL_SPEED, setKeyboardScrollAcceleration,
  setKeyboardScrollDeceleration, setKeyboardScrollAutoBrake
} from '../../src/config.js'
import { configRegistry } from '../../src/configRegistry.js'

afterEach(() => {
  setKeyboardScrollAcceleration(1200)
  setKeyboardScrollDeceleration(2400)
  setKeyboardScrollAutoBrake(1200)
})

describe('keyboard camera pedals', () => {
  it('[U02275] ramps to a bounded maximum and brakes to zero with the revised default', () => {
    let velocity = 0
    const first = advanceKeyboardCameraVelocity(velocity, 1, 1 / 60)
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(KEYBOARD_SCROLL_SPEED)
    for (let frame = 0; frame < 120; frame++) velocity = advanceKeyboardCameraVelocity(velocity, 1, 1 / 60)
    expect(velocity).toBe(KEYBOARD_SCROLL_SPEED)
    for (let frame = 0; frame < 100; frame++) velocity = advanceKeyboardCameraVelocity(velocity, 0, 1 / 60)
    expect(velocity).toBe(0)
  })

  it('[U02276] brakes before reversing and applies a live reversal setting', () => {
    expect(advanceKeyboardCameraVelocity(8, -1, 0.05)).toBeGreaterThan(0)
    setKeyboardScrollDeceleration(12000)
    expect(advanceKeyboardCameraVelocity(8, -1, 0.05)).toBeLessThan(0)
  })

  it('[U02277] reads live acceleration and optional lift-off coasting settings', () => {
    setKeyboardScrollAcceleration(600)
    expect(advanceKeyboardCameraVelocity(0, 1, 0.1)).toBeCloseTo(1)
    setKeyboardScrollAcceleration(1200)
    expect(advanceKeyboardCameraVelocity(0, 1, 0.1)).toBeCloseTo(2)
    setKeyboardScrollAutoBrake(0)
    expect(advanceKeyboardCameraVelocity(4, 0, 0.1)).toBe(4)
  })

  it('[U02278] produces matching speed and travel at 30, 60 and 120 Hz', () => {
    const distances = []
    for (const fps of [30, 60, 120]) {
      let velocity = 0
      let distance = 0
      for (let frame = 0; frame < fps * 3; frame++) {
        const next = advanceKeyboardCameraVelocity(velocity, frame < fps ? 1 : 0, 1 / fps)
        distance += (velocity + next) * 0.5 * 60 / fps
        velocity = next
      }
      expect(velocity).toBe(0)
      distances.push(distance)
    }
    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(1)
  })

  it('[U02279] exposes all tuning under runtime Controls', () => {
    for (const id of ['keyboardScrollSpeed', 'keyboardScrollAcceleration', 'keyboardScrollDeceleration', 'keyboardScrollAutoBrake']) {
      expect(configRegistry[id].category).toBe('Controls')
      expect(configRegistry[id].get()).toBeGreaterThan(0)
    }
  })
})
