import { describe, it, expect } from 'vitest'
import {
  observeUnitCommandSignals,
  getUnitCommandHistory,
  clearUnitCommandHistory
} from '../../src/game/unitCommandHistory.js'

describe('unitCommandHistory', () => {
  it('tracks move, attack, and retreat command signals and caps history', () => {
    const unit = {
      id: 'u1',
      owner: 'player1',
      moveTarget: null,
      target: null,
      isRetreating: false
    }

    const gameState = { humanPlayer: 'player1', partyStates: [] }

    observeUnitCommandSignals(unit, 1000, gameState)
    unit.moveTarget = { x: 10, y: 12 }
    observeUnitCommandSignals(unit, 1010, gameState)
    unit.target = { id: 'enemy-1' }
    observeUnitCommandSignals(unit, 1020, gameState)
    unit.isRetreating = true
    observeUnitCommandSignals(unit, 1030, gameState)

    const history = getUnitCommandHistory(unit.id)
    expect(history.some(entry => entry.type === 'move')).toBe(true)
    expect(history.some(entry => entry.type === 'attack')).toBe(true)
    expect(history.some(entry => entry.type === 'retreat_start')).toBe(true)

    clearUnitCommandHistory(unit.id)
    expect(getUnitCommandHistory(unit.id)).toEqual([])
  })
})
