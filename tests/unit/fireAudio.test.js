import { beforeEach, describe, expect, it, vi } from 'vitest'

const audio = vi.hoisted(() => ({
  playFixedPositionalSound: vi.fn(async() => ({
    source: { stop: vi.fn() },
    gainNode: { gain: { value: 1 } },
    panner: { pan: { value: 0 } }
  })),
  playFixedSound: vi.fn(),
  updateFixedPositionalGain: vi.fn(),
  stopFixedSound: vi.fn(),
  resetters: []
}))

vi.mock('../../src/sound.js', () => ({
  playFixedPositionalSound: audio.playFixedPositionalSound,
  playFixedSound: audio.playFixedSound,
  updateFixedPositionalGain: audio.updateFixedPositionalGain,
  stopFixedSound: audio.stopFixedSound,
  onAudioSessionReset: listener => {
    audio.resetters.push(listener)
    return () => {}
  }
}))

vi.mock('../../src/utils/headlessAudioMute.js', () => ({
  isHeadlessAudioMuted: () => false
}))

const gameRandom = vi.hoisted(() => vi.fn(() => 0.2))
vi.mock('../../src/utils/gameRandom.js', () => ({ gameRandom }))

import { playFireEngineReady, resetFireAudio, syncFireAudio } from '../../src/audio/fireAudio.js'

function fire(x, y) {
  return { x, y, age: 1 }
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await new Promise(resolve => setTimeout(resolve, 0))
}

beforeEach(async() => {
  await import('../../src/sound.js')
  audio.playFixedPositionalSound.mockClear()
  audio.playFixedSound.mockClear()
  audio.updateFixedPositionalGain.mockClear()
  audio.stopFixedSound.mockClear()
  gameRandom.mockClear()
  resetFireAudio()
})

describe('Fire audio', () => {
  it('[U07237] keeps the nearest fires and hoses and never reads simulation randomness', async() => {
    const fires = [fire(0, 0), fire(2, 0), fire(30, 30), fire(1, 1), fire(3, 0)]
    const engines = [
      { id: 'near', type: 'fireEngine', health: 40, extinguishing: { x: 1, y: 1 }, x: 32, y: 32, owner: 'player1' },
      { id: 'mid', type: 'fireEngine', health: 40, extinguishing: { x: 2, y: 1 }, x: 96, y: 32, owner: 'player1' },
      { id: 'far', type: 'fireEngine', health: 40, extinguishing: { x: 8, y: 8 }, x: 800, y: 800, owner: 'player1' }
    ]
    const state = { fires, scrollOffset: { x: 0, y: 0 }, shadowOfWarEnabled: false, humanPlayer: 'player1' }
    syncFireAudio(engines, state, [])
    await flush()
    const started = audio.playFixedPositionalSound.mock.calls.map(call => call[0])
    expect(started.filter(name => name === 'fireLoop')).toHaveLength(4)
    expect(started.filter(name => name === 'fireHoseLoop')).toHaveLength(2)
    expect(started).not.toContain(undefined)
    expect(gameRandom).not.toHaveBeenCalled()
    syncFireAudio(engines, state, [])
    await flush()
    expect(audio.playFixedPositionalSound).toHaveBeenCalledTimes(6)
    expect(audio.updateFixedPositionalGain).toHaveBeenCalled()
  })

  it('[U07238] silences an enemy fire hidden by the fog of war', async() => {
    const state = {
      fires: [fire(1, 1)],
      scrollOffset: { x: 0, y: 0 },
      shadowOfWarEnabled: true,
      humanPlayer: 'player1',
      visibilityMap: [[{ visible: false }, { visible: false }], [{ visible: false }, { visible: false }]],
      mapGrid: [[{}, {}], [{}, {}]]
    }
    const grid = [[{}, { building: { owner: 'enemy1' } }], [{}, {}]]
    syncFireAudio([], state, grid)
    await flush()
    expect(audio.playFixedPositionalSound).not.toHaveBeenCalled()
  })

  it('[U07239] plays the ready line once inside its cooldown', async() => {
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(1000)
    playFireEngineReady()
    playFireEngineReady()
    await flush()
    now.mockReturnValue(6000)
    playFireEngineReady()
    await flush()
    expect(audio.playFixedSound).toHaveBeenCalledTimes(2)
    expect(audio.playFixedSound).toHaveBeenCalledWith('fireEngineReady', 0.85)
    expect(gameRandom).not.toHaveBeenCalled()
    now.mockRestore()
  })
})
