import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock benchmark modules early to prevent import chain issues
vi.mock('../../src/benchmark/benchmarkRunner.js', () => ({
  attachBenchmarkButton: vi.fn()
}))

vi.mock('../../src/benchmark/benchmarkScenario.js', () => ({
  setupBenchmarkScenario: vi.fn(),
  teardownBenchmarkScenario: vi.fn()
}))

// Mock building data to prevent undefined errors in modules that import it at module load time
vi.mock('../../src/data/buildingData.js', () => ({
  buildingData: {
    constructionYard: { width: 3, height: 3, cost: 5000, health: 300 },
    rocketTurret: { fireRange: 16, width: 2, height: 2, cost: 1500, health: 150 }
  }
}))

vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    constructionYard: { width: 3, height: 3, cost: 5000, health: 300 },
    rocketTurret: { fireRange: 16, width: 2, height: 2, cost: 1500, health: 150 }
  }
}))

// We need to mock the dependencies before importing
vi.mock('../../src/ai/enemyAIPlayer.js', () => ({
  updateAIPlayer: vi.fn()
}))

vi.mock('../../src/ai/enemyStrategies.js', () => ({
  computeLeastDangerAttackPoint: vi.fn(() => ({ x: 50, y: 50 }))
}))

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: (fn) => fn
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({
  isHost: vi.fn(() => true)
}))

vi.mock('../../src/config.js', async(importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    AI_UPDATE_FRAME_SKIP: 1,
    DEFAULT_MAP_TILES_X: 100,
    DEFAULT_MAP_TILES_Y: 100
  }
})

vi.mock('../../src/ai/enemySpawner.js', () => ({
  spawnEnemyUnit: vi.fn()
}))

import { updateEnemyAI } from '../../src/enemy.js'
import { updateAIPlayer } from '../../src/ai/enemyAIPlayer.js'
import { computeLeastDangerAttackPoint } from '../../src/ai/enemyStrategies.js'
import { isHost } from '../../src/network/gameCommandSync.js'

describe('enemy.js', () => {
  let units
  let factories
  let bullets
  let mapGrid
  let gameState

  beforeEach(() => {
    vi.clearAllMocks()

    units = []
    factories = []
    bullets = []
    mapGrid = []
    gameState = {
      humanPlayer: 'player1',
      playerCount: 2,
      occupancyMap: [],
      targetedOreTiles: {},
      partyStates: []
    }
  })

  describe('updateEnemyAI', () => {
    it('does nothing when not host', () => {
      vi.mocked(isHost).mockReturnValue(false)

      updateEnemyAI(units, factories, bullets, mapGrid, gameState)

      expect(updateAIPlayer).not.toHaveBeenCalled()
    })

    it('calls updateAIPlayer for AI players when host', () => {
      vi.mocked(isHost).mockReturnValue(true)

      updateEnemyAI(units, factories, bullets, mapGrid, gameState)

      expect(updateAIPlayer).toHaveBeenCalledWith(
        'player2',
        units,
        factories,
        bullets,
        mapGrid,
        gameState,
        gameState.occupancyMap,
        expect.any(Number),
        gameState.targetedOreTiles
      )
    })

    it('updates every party when no multiplayer ownership metadata exists', () => {
      vi.mocked(isHost).mockReturnValue(true)
      gameState.playerCount = 2
      gameState.humanPlayer = 'player1'

      updateEnemyAI(units, factories, bullets, mapGrid, gameState)

      // With empty partyStates, all parties default to AI-controlled.
      expect(updateAIPlayer).toHaveBeenCalledTimes(2)
      expect(updateAIPlayer).toHaveBeenCalledWith(
        'player1',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })

    it('updates multiple AI players in 4-player game', () => {
      vi.mocked(isHost).mockReturnValue(true)
      gameState.playerCount = 4
      gameState.humanPlayer = 'player1'

      updateEnemyAI(units, factories, bullets, mapGrid, gameState)

      // With empty partyStates, all parties default to AI-controlled.
      expect(updateAIPlayer).toHaveBeenCalledTimes(4)
    })

    it('computes global attack point periodically', () => {
      vi.mocked(isHost).mockReturnValue(true)
      gameState.lastGlobalAttackDecision = undefined

      updateEnemyAI(units, factories, bullets, mapGrid, gameState)

      expect(computeLeastDangerAttackPoint).toHaveBeenCalledWith(gameState, 'player1')
      expect(gameState.globalAttackPoint).toEqual({ x: 50, y: 50 })
      expect(gameState.lastGlobalAttackDecision).toBeDefined()
    })

    it('skips global attack point if recently computed', () => {
      vi.mocked(isHost).mockReturnValue(true)
      gameState.simulationTime = 10_000
      gameState.lastGlobalAttackDecision = 9_500 // 0.5 seconds ago in simulation time

      updateEnemyAI(units, factories, bullets, mapGrid, gameState)

      // Should not recompute since it was computed 1 second ago (< 8 seconds)
      expect(computeLeastDangerAttackPoint).not.toHaveBeenCalled()
    })

    it('recomputes global attack point after 8 seconds', () => {
      vi.mocked(isHost).mockReturnValue(true)
      gameState.simulationTime = 10_000
      gameState.lastGlobalAttackDecision = 900 // 9.1 seconds ago in simulation time

      updateEnemyAI(units, factories, bullets, mapGrid, gameState)

      expect(computeLeastDangerAttackPoint).toHaveBeenCalled()
    })

    it('respects aiActive flag in partyStates', () => {
      vi.mocked(isHost).mockReturnValue(true)
      gameState.playerCount = 3
      gameState.humanPlayer = 'player1'
      gameState.partyStates = [
        { partyId: 'player1', aiActive: false },
        { partyId: 'player2', aiActive: true },
        { partyId: 'player3', aiActive: false } // Human took over
      ]

      updateEnemyAI(units, factories, bullets, mapGrid, gameState)

      // Should only update player2 (player3 has human control)
      expect(updateAIPlayer).toHaveBeenCalledTimes(1)
      expect(updateAIPlayer).toHaveBeenCalledWith(
        'player2',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })

    it('defaults to AI control when partyStates is empty', () => {
      vi.mocked(isHost).mockReturnValue(true)
      gameState.playerCount = 2
      gameState.partyStates = []

      updateEnemyAI(units, factories, bullets, mapGrid, gameState)

      expect(updateAIPlayer).toHaveBeenCalledTimes(2)
    })

    it('defaults to AI control when party not found in partyStates', () => {
      vi.mocked(isHost).mockReturnValue(true)
      gameState.playerCount = 3
      gameState.humanPlayer = 'player1'
      gameState.partyStates = [
        { partyId: 'player1', aiActive: false }
        // player2 and player3 not in array
      ]

      updateEnemyAI(units, factories, bullets, mapGrid, gameState)

      // Should update player2 and player3 (defaults to AI)
      expect(updateAIPlayer).toHaveBeenCalledTimes(2)
    })

    it('uses default values when gameState fields missing', () => {
      vi.mocked(isHost).mockReturnValue(true)
      const minimalGameState = {
        occupancyMap: []
      }

      expect(() => updateEnemyAI(units, factories, bullets, mapGrid, minimalGameState)).not.toThrow()
    })
  })
})
