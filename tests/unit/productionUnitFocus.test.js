import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../src/game/attackNotifications.js', () => ({ focusAndSelectUnit: vi.fn() }))
import { focusAndSelectUnit } from '../../src/game/attackNotifications.js'
import { gameState } from '../../src/gameState.js'
import { focusProducedUnit } from '../../src/ui/productionUnitFocus.js'

describe('produced unit tab focus', () => {
  beforeEach(() => { vi.clearAllMocks(); gameState.humanPlayer = 'player' })
  it('[U05427] visits newest first, skips dead/foreign/starting units, wraps and resets after production', () => {
    const older = { id: 'older', owner: 'player', health: 100, productionCompletedAt: 10 }
    const newer = { id: 'newer', owner: 'player', health: 100, productionCompletedAt: 20 }
    gameState.units = [older, newer,
      { id: 'dead', owner: 'player', health: 0, productionCompletedAt: 30 },
      { id: 'enemy', owner: 'enemy', health: 100, productionCompletedAt: 40 },
      { id: 'starting', owner: 'player', health: 100 }]
    const controller = {}
    focusProducedUnit(controller)
    focusProducedUnit(controller)
    focusProducedUnit(controller)
    expect(focusAndSelectUnit.mock.calls.map(([unit]) => unit.id)).toEqual(['newer', 'older', 'newer'])
    const latest = { id: 'latest', owner: 'player', health: 100, productionCompletedAt: 50 }
    gameState.units.push(latest)
    focusProducedUnit(controller)
    expect(focusAndSelectUnit).toHaveBeenLastCalledWith(latest)
  })
  it('[U05428] does nothing when no produced units survive', () => {
    gameState.units = []
    expect(focusProducedUnit({})).toBe(false)
    expect(focusAndSelectUnit).not.toHaveBeenCalled()
  })
})
