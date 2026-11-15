import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn(),
  playPositionalSound: vi.fn()
}))

import { playPositionalSound, playSound } from '../../src/sound.js'
import {
  playMoveOrderSound,
  playSelectionSound,
  playUnitAcknowledgement,
  resetAcknowledgementThrottle
} from '../../src/audio/unitAcknowledgements.js'

beforeEach(() => {
  playSound.mockClear()
  playPositionalSound.mockClear()
  resetAcknowledgementThrottle()
})

describe('unit acknowledgement voices', () => {
  it('[U07139] plays one ground line for a whole selected group', () => {
    const tanks = [
      { type: 'tank', health: 100 },
      { type: 'tank_v1', health: 100 },
      { type: 'lightTank', health: 100 }
    ]
    expect(playUnitAcknowledgement(tanks, 'select', { now: 1000 })).toBe('played')
    expect(playSound).toHaveBeenCalledTimes(1)
    expect(playSound).toHaveBeenCalledWith('ackSelectGround', 0.85)
  })

  it('[U07140] throttles a second acknowledgement inside the window', () => {
    playUnitAcknowledgement([{ type: 'tank', health: 100 }], 'select', { now: 1000 })
    playSound.mockClear()
    expect(playUnitAcknowledgement([{ type: 'tank', health: 100 }], 'move', { now: 1500 })).toBe('throttled')
    expect(playSound).not.toHaveBeenCalled()
  })

  it('[U07141] plays the air attack line once the throttle window has passed', () => {
    playUnitAcknowledgement([{ type: 'tank', health: 100 }], 'select', { now: 1000 })
    playSound.mockClear()
    expect(playUnitAcknowledgement([{ type: 'apache', health: 100 }], 'attack', { now: 2000 })).toBe('played')
    expect(playSound).toHaveBeenCalledTimes(1)
    expect(playSound).toHaveBeenCalledWith('ackAirAttack', 0.85)
  })

  it('[U07142] uses the naval and support lines for those classes', () => {
    expect(playUnitAcknowledgement([{ type: 'destroyer', health: 100, isNaval: true }], 'select', { now: 5000 })).toBe('played')
    expect(playSound).toHaveBeenCalledWith('ackNavalSelect', 0.85)
    playSound.mockClear()
    resetAcknowledgementThrottle()
    expect(playMoveOrderSound([{ type: 'harvester', health: 80 }])).toBe('played')
    expect(playSound).toHaveBeenCalledWith('ackSupportMove', 0.5)
  })

  it('[U07143] keeps the legacy yes-sir cue for a unit with no class', () => {
    playSelectionSound([{ health: 10 }])
    expect(playSound).toHaveBeenCalledWith('unitSelection')
  })
})
