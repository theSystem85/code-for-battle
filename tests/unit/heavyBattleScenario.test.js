import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main.js', () => ({
  factories: [
    { id: 'cy1', owner: 'player1', x: 4, y: 4, width: 3, height: 3, budget: 0 },
    { id: 'cy2', owner: 'player2', x: 70, y: 4, width: 3, height: 3, budget: 0 },
    { id: 'cy3', owner: 'player3', x: 4, y: 70, width: 3, height: 3, budget: 0 },
    { id: 'cy4', owner: 'player4', x: 70, y: 70, width: 3, height: 3, budget: 0 }
  ],
  mapGrid: Array.from({ length: 80 }, (_, y) =>
    Array.from({ length: 80 }, (_, x) => ({ type: 'grass', x, y, building: null, seedCrystal: false }))
  ),
  units: [],
  getCurrentGame: vi.fn(() => ({ resetGame: vi.fn() }))
}))

vi.mock('../../src/units.js', () => ({
  initializeOccupancyMap: vi.fn(() => ({})),
  createUnit: vi.fn((factory, type, x, y) => ({
    id: `unit_${factory.owner}_${type}_${x}_${y}`,
    type,
    owner: factory.owner,
    x: x * 32,
    y: y * 32,
    tileX: x,
    tileY: y,
    health: 100,
    maxHealth: 100,
    direction: 0,
    target: null,
    moveTarget: null
  }))
}))

vi.mock('../../src/rendering.js', () => ({
  getTextureManager: vi.fn(() => ({}))
}))

vi.mock('../../src/game/dangerZoneMap.js', () => ({
  updateDangerZoneMaps: vi.fn()
}))

vi.mock('../../src/utils/smokeUtils.js', () => ({
  emitSmokeParticles: vi.fn((state) => {
    state.smokeParticles.push({ x: 0, y: 0, size: 8, alpha: 1, startTime: 0, duration: 1000 })
  })
}))

import { gameState } from '../../src/gameState.js'
import { units } from '../../src/main.js'
import {
  clampHeavyBattleUnitCount,
  heavyBattleScrollX,
  setupHeavyBattleScenario,
  teardownHeavyBattleScenario
} from '../../src/benchmark/heavyBattleScenario.js'

describe('heavy battle scenario', () => {
  beforeEach(() => {
    units.length = 0
    gameState.buildings = []
    gameState.smokeParticles = []
    gameState.smokeParticlePool = []
    gameState.dustParticles = []
    gameState.explosions = []
    gameState.heavyBattleBenchmark = false
    gameState.shadowOfWarEnabled = false
    gameState.scrollOffset = gameState.scrollOffset || { x: 0, y: 0 }
  })

  it('clamps the requested army size', () => {
    expect(clampHeavyBattleUnitCount('nope')).toBe(320)
    expect(clampHeavyBattleUnitCount(10)).toBe(40)
    expect(clampHeavyBattleUnitCount(9000)).toBe(800)
    expect(clampHeavyBattleUnitCount(240)).toBe(240)
  })

  it('sweeps the camera back and forth over a fixed span', () => {
    expect(heavyBattleScrollX(0, 100, 700, 600)).toBe(100)
    expect(heavyBattleScrollX(500, 100, 700, 600)).toBe(400)
    expect(heavyBattleScrollX(1000, 100, 700, 600)).toBe(700)
    expect(heavyBattleScrollX(1500, 100, 700, 600)).toBe(400)
    expect(heavyBattleScrollX(2000, 100, 700, 600)).toBe(100)
  })

  it('spawns a deterministic multi-player battle with fog, smoke, dust, and explosions', () => {
    const first = setupHeavyBattleScenario({ unitCount: 80, seed: '11' })
    const firstIds = units.map(unit => `${unit.owner}:${unit.tileX},${unit.tileY}:${unit.target?.id || ''}`)
    expect(first.unitCount).toBe(80)
    expect(units.filter(unit => unit.owner === 'player1')).toHaveLength(20)
    expect(units.every(unit => unit.target && unit.target.owner !== unit.owner)).toBe(true)
    expect(units.some(unit => unit.moveTarget)).toBe(true)
    expect(units.some(unit => unit.health < unit.maxHealth)).toBe(true)
    expect(gameState.shadowOfWarEnabled).toBe(true)
    expect(gameState.visibilityMap?.length).toBe(80)
    expect(gameState.heavyBattleBenchmark).toBe(true)
    expect(first.smoke).toBeGreaterThan(0)
    expect(first.dust).toBe(80)
    expect(first.explosions).toBe(12)
    expect(gameState.explosions.every(explosion => explosion.loop)).toBe(true)

    units.length = 0
    const second = setupHeavyBattleScenario({ unitCount: 80, seed: '11' })
    const secondIds = units.map(unit => `${unit.owner}:${unit.tileX},${unit.tileY}:${unit.target?.id || ''}`)
    expect(second.unitCount).toBe(first.unitCount)
    expect(secondIds).toEqual(firstIds)
    teardownHeavyBattleScenario()
    expect(gameState.heavyBattleBenchmark).toBe(false)
  })
})
