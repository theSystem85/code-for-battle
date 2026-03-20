import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  TILE_LENGTH_METERS: 1
}))

vi.mock('../../src/units.js', () => ({
  removeUnitOccupancy: vi.fn()
}))

const soundMock = vi.hoisted(() => {
  const playPositionalSound = vi.fn()
  const gainNode = {
    gain: {
      value: 0.25,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn()
    }
  }

  return {
    playPositionalSound,
    audioContext: { currentTime: 12 },
    getMasterVolume: vi.fn(() => 1),
    gainNode
  }
})

vi.mock('../../src/sound.js', () => ({
  playPositionalSound: soundMock.playPositionalSound,
  audioContext: soundMock.audioContext,
  getMasterVolume: soundMock.getMasterVolume
}))

vi.mock('../../src/game/movementHelpers.js', () => ({
  calculatePositionalAudio: vi.fn(() => ({ pan: 0, volumeFactor: 1 })),
  consumeUnitGas: vi.fn()
}))

vi.mock('../../src/game/movementConstants.js', () => ({
  BASE_FRAME_SECONDS: 1 / 60,
  MOVEMENT_CONFIG: { MAX_SPEED: 1 }
}))

vi.mock('../../src/game/f35Behavior.js', () => ({
  canF35StartLanding: vi.fn(() => false)
}))

import { updateApacheFlightState } from '../../src/game/movementApache.js'

function createApache(overrides = {}) {
  return {
    id: 'apache-1',
    type: 'apache',
    x: 128,
    y: 160,
    tileX: 4,
    tileY: 5,
    altitude: 50,
    maxAltitude: 100,
    flightState: 'airborne',
    health: 100,
    destroyed: false,
    path: [],
    moveTarget: null,
    airCruiseSpeed: 1,
    speed: 1,
    gas: 0,
    autoHoldAltitude: true,
    ...overrides
  }
}

describe('updateApacheFlightState rotor loop lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stops a pending rotor loop if the apache lands before audio resolves', async() => {
    let resolveSound
    soundMock.playPositionalSound.mockReturnValue(new Promise(resolve => {
      resolveSound = resolve
    }))

    const apache = createApache()

    updateApacheFlightState(apache, { isMoving: true, currentSpeed: 1 }, [[0]], 1000)
    expect(apache.rotorSoundLoading).toBe(true)

    apache.flightState = 'grounded'
    apache.altitude = 0
    apache.autoHoldAltitude = false
    updateApacheFlightState(apache, { isMoving: false, currentSpeed: 0 }, [[0]], 1016)

    const stop = vi.fn()
    resolveSound({
      source: { stop },
      gainNode: soundMock.gainNode,
      panner: { pan: { value: 0 } }
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(stop).toHaveBeenCalledTimes(1)
    expect(apache.rotorSound).toBeNull()
    expect(apache.rotorSoundLoading).toBe(false)
  })

  it('fades and stops an active rotor loop when the apache is destroyed', () => {
    const stop = vi.fn()
    const apache = createApache({
      rotorSound: {
        source: { stop },
        gainNode: soundMock.gainNode,
        panner: { pan: { value: 0 } },
        baseVolume: 0.25
      }
    })

    apache.destroyed = true
    apache.health = 0

    updateApacheFlightState(apache, { isMoving: false, currentSpeed: 0 }, [[0]], 1000)

    expect(soundMock.gainNode.gain.cancelScheduledValues).toHaveBeenCalledWith(12)
    expect(soundMock.gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 12.05)
    expect(stop).toHaveBeenCalledWith(12.05)
    expect(apache.rotorSound).toBeNull()
    expect(apache.rotorSoundLoading).toBe(false)
  })
})
