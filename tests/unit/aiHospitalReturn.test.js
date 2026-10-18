import { beforeEach, describe, expect, it, vi } from 'vitest'
import { manageAICrewHealing } from '../../src/ai/crewHealing.js'
import { getCachedPath } from '../../src/game/pathfinding.js'

vi.mock('../../src/game/pathfinding.js', () => ({ getCachedPath: vi.fn() }))
vi.mock('../../src/game/ambulanceSystem.js', () => ({ assignAmbulanceToHealUnit: vi.fn(() => false) }))
vi.mock('../../src/ai/enemyUtils.js', () => ({ getActiveAIPlayers: vi.fn(() => ['player2']) }))

describe('AI hospital return routing', () => {
  beforeEach(() => vi.clearAllMocks())

  function scenario(owner) {
    const hospital = { id: 'hospital', type: 'hospital', owner, health: 100, x: 5, y: 5, width: 2, height: 2 }
    const unit = {
      id: 'tank', type: 'tank_v1', owner, health: 100,
      x: 12 * 32 + 20, y: 15 * 32, tileX: 0, tileY: 0,
      crew: { driver: true, commander: true, loader: true, gunner: false }
    }
    const state = { buildings: [hospital], mapGrid: Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => ({ type: 'land' }))) }
    return { hospital, unit, state }
  }

  it('[U00096] uses the unit center for the path origin and tile coordinates for the move target', () => {
    const { hospital, unit, state } = scenario('ai-hospital-coordinates')
    const route = [{ x: 13, y: 15 }, { x: 6, y: 8 }]
    getCachedPath.mockReturnValue(route)

    manageAICrewHealing([unit], state, 6000, unit.owner)

    expect(getCachedPath).toHaveBeenCalledWith(
      { x: 13, y: 15, owner: unit.owner }, { x: 6, y: 8 }, state.mapGrid, null, { unitOwner: unit.owner }
    )
    expect(unit.path).toBe(route)
    expect(unit.moveTarget).toEqual({ x: 6, y: 8 })
    expect(unit.returningToHospital).toBe(true)
    expect(unit.hospitalTarget).toBe(hospital)
  })

  it('[U00097] retries a route that was initially unreachable instead of retaining a false return state', () => {
    const { unit, state } = scenario('ai-hospital-retry')
    getCachedPath.mockReturnValue([])
    manageAICrewHealing([unit], state, 6000, unit.owner)
    expect(unit.returningToHospital).toBe(false)

    getCachedPath.mockReturnValue([{ x: 13, y: 15 }, { x: 6, y: 8 }])
    manageAICrewHealing([unit], state, 12000, unit.owner)
    expect(unit.returningToHospital).toBe(true)
    expect(unit.moveTarget).toEqual({ x: 6, y: 8 })
  })
})
