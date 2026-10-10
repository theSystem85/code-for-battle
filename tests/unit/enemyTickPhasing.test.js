import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/config.js', () => ({ AI_UPDATE_FRAME_SKIP: 3 }))
vi.mock('../../src/gameState.js', () => ({ gameState: {} }))
vi.mock('../../src/performanceUtils.js', () => ({ logPerformance: fn => fn }))
vi.mock('../../src/ai/enemyAIPlayer.js', () => ({ updateAIPlayer: vi.fn() }))
vi.mock('../../src/ai/enemyStrategies.js', () => ({ computeLeastDangerAttackPoint: vi.fn(() => null) }))
vi.mock('../../src/ai/enemySpawner.js', () => ({ spawnEnemyUnit: vi.fn() }))
vi.mock('../../src/ai/llmStrategicController.js', () => ({ updateLlmStrategicAI: vi.fn() }))
vi.mock('../../src/network/gameCommandSync.js', () => ({ isHost: vi.fn(() => true) }))
vi.mock('../../src/replaySystem.js', () => ({ isReplayModeActive: vi.fn(() => false) }))

import { updateEnemyAI } from '../../src/enemy.js'
import { updateAIPlayer } from '../../src/ai/enemyAIPlayer.js'
import { updateLlmStrategicAI } from '../../src/ai/llmStrategicController.js'
import { isHost } from '../../src/network/gameCommandSync.js'
import { isReplayModeActive } from '../../src/replaySystem.js'

function state() {
  return {
    playerCount: 4,
    simulationStepMs: 1000 / 60,
    simulationTime: 0,
    partyStates: [1, 2, 3, 4].map(id => ({ partyId: `player${id}`, aiActive: id !== 1 }))
  }
}

function tick(game, index) {
  game.simulationTime = index * game.simulationStepMs
  updateEnemyAI([], [], [], [], game)
}

describe('deterministic AI player phases', () => {
  beforeEach(() => vi.clearAllMocks())

  it('spreads three enemies across ticks without reducing any player cadence', () => {
    const game = state()
    const calls = []
    for (let index = 1; index <= 60; index++) {
      const before = updateAIPlayer.mock.calls.length
      tick(game, index)
      calls.push(updateAIPlayer.mock.calls.length - before)
    }
    expect(calls).toEqual(Array(60).fill(1))
    for (const owner of ['player2', 'player3', 'player4']) {
      expect(updateAIPlayer.mock.calls.filter(args => args[0] === owner)).toHaveLength(20)
    }
    expect(updateLlmStrategicAI).toHaveBeenCalledTimes(20)
  })

  it('restores the same phase and decisions after a save, independent of other games and render calls', () => {
    const original = state()
    tick(original, 100)
    const saved = JSON.parse(JSON.stringify(original))
    vi.clearAllMocks()
    for (let index = 101; index <= 120; index++) tick(original, index)
    const expected = updateAIPlayer.mock.calls.map(args => [args[0], args[7]])
    for (let index = 1; index <= 17; index++) tick(state(), index)
    vi.clearAllMocks()
    for (let index = 101; index <= 120; index++) tick(saved, index)
    expect(updateAIPlayer.mock.calls.map(args => [args[0], args[7]])).toEqual(expected)
  })

  it('never runs authoritative AI on clients or during replay', () => {
    isHost.mockReturnValueOnce(false)
    tick(state(), 1)
    isReplayModeActive.mockReturnValueOnce(true)
    tick(state(), 2)
    expect(updateAIPlayer).not.toHaveBeenCalled()
    expect(updateLlmStrategicAI).not.toHaveBeenCalled()
  })
})
