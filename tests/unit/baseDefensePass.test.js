import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/game/pathfinding.js', () => ({ getCachedPath: vi.fn() }))
vi.mock('../../src/game/unitCombat/combatHelpers.js', () => ({ getEffectiveFireRange: vi.fn() }))
vi.mock('../../src/ai/enemyStrategies.js', () => ({ shouldConductGroupAttack: vi.fn() }))
vi.mock('../../src/ai/enemyAirBehavior.js', () => ({
  findNearestAIBuildingTile: vi.fn(), findNearestPlayerDefense: vi.fn(),
  findPlayerBaseCenter: vi.fn(), findRemotePlayerHarvesters: vi.fn(), isNearPlayerDefense: vi.fn()
}))

import {
  beginBaseDefensePass, beginBaseDefenseUnit, finishBaseDefenseUnit, endBaseDefensePass,
  checkBaseDefenseNeeded, findBaseDefenseTarget
} from '../../src/ai/enemySupportBehavior.js'
import { TILE_SIZE } from '../../src/config.js'

const makeUnit = (id, owner, x, type = 'tank_v1') => ({ id, owner, x: x * TILE_SIZE, y: 5 * TILE_SIZE, health: 100, type })
const makeState = () => ({ buildings: [{ owner: 'player2', x: 5, y: 5, width: 1, height: 1, health: 100 }] })

afterEach(endBaseDefensePass)

describe('AI base defense player pass', () => {
  it('[U00329] fills only the required defenders as decisions change within the same pass', () => {
    const threat = makeUnit('threat', 'player1', 6)
    const defenders = Array.from({ length: 4 }, (_, index) => makeUnit(`d${index}`, 'player2', 7 + index))
    const units = [threat, ...defenders]
    const state = makeState()
    beginBaseDefensePass(units, state, 'player2')
    for (const [index, defender] of defenders.entries()) {
      beginBaseDefenseUnit(defender)
      expect(checkBaseDefenseNeeded(defender, units, state, 'player2')).toBe(index < 2)
      if (index < 2) defender.defendingBase = true
      finishBaseDefenseUnit(defender)
    }
    expect(defenders.filter(unit => unit.defendingBase)).toHaveLength(2)
  })

  it('[U00330] separates airborne threats by the defending weapon and keeps target tie order', () => {
    const tank = makeUnit('tank', 'player2', 5)
    const rocket = makeUnit('rocket', 'player2', 5, 'rocketTank')
    const apache = { ...makeUnit('air', 'player1', 6, 'apache'), flightState: 'airborne' }
    const state = makeState()
    const units = [tank, rocket, apache]
    beginBaseDefensePass(units, state, 'player2')
    expect(checkBaseDefenseNeeded(tank, units, state, 'player2')).toBe(false)
    expect(findBaseDefenseTarget(tank, units, state, 'player2')).toBeNull()
    expect(checkBaseDefenseNeeded(rocket, units, state, 'player2')).toBe(true)
    expect(findBaseDefenseTarget(rocket, units, state, 'player2')).toBe(apache)
    endBaseDefensePass()
    const first = makeUnit('first', 'player1', 4)
    const second = makeUnit('second', 'player1', 6)
    const tiedUnits = [tank, first, second]
    beginBaseDefensePass(tiedUnits, state, 'player2')
    expect(findBaseDefenseTarget(tank, tiedUnits, state, 'player2')).toBe(first)
  })

  it('[U00331] refreshes moved threats and destroyed buildings on the next pass', () => {
    const tank = makeUnit('tank', 'player2', 5)
    const threat = makeUnit('threat', 'player1', 6)
    const units = [tank, threat]
    const state = makeState()
    beginBaseDefensePass(units, state, 'player2')
    expect(checkBaseDefenseNeeded(tank, units, state, 'player2')).toBe(true)
    endBaseDefensePass()
    threat.x = 50 * TILE_SIZE
    beginBaseDefensePass(units, state, 'player2')
    expect(checkBaseDefenseNeeded(tank, units, state, 'player2')).toBe(false)
    endBaseDefensePass()
    threat.x = 6 * TILE_SIZE
    state.buildings[0].health = 0
    beginBaseDefensePass(units, state, 'player2')
    expect(findBaseDefenseTarget(tank, units, state, 'player2')).toBeNull()
  })

  it('[U00332] does not scan buildings or all units again for each defender', () => {
    const tank = makeUnit('tank', 'player2', 5)
    const threat = makeUnit('threat', 'player1', 6)
    const units = [tank, threat]
    const state = makeState()
    beginBaseDefensePass(units, state, 'player2')
    const scanUnits = vi.spyOn(units, Symbol.iterator)
    const scanBuildings = vi.spyOn(state.buildings, Symbol.iterator)
    for (let index = 0; index < 100; index++) {
      expect(checkBaseDefenseNeeded(tank, units, state, 'player2')).toBe(true)
      expect(findBaseDefenseTarget(tank, units, state, 'player2')).toBe(threat)
    }
    expect(scanUnits).not.toHaveBeenCalled()
    expect(scanBuildings).not.toHaveBeenCalled()
  })
})
