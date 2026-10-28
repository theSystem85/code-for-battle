import { beforeEach, describe, expect, it, vi } from 'vitest'
import { unitActionOptions, applyUnitAction } from '../../src/ui/mapActions/unitActions.js'
import { canSupplyShipServe } from '../../src/game/shipyardServiceLogic.js'
import { updateGuardBehavior } from '../../src/behaviours/guard.js'
import { migrations } from '../../src/gameStateMigrations.js'
import { findPath } from '../../src/units.js'

vi.mock('../../src/game/unitCombat/combatHelpers.js', () => ({ getEffectiveFireRange: () => 0 }))
vi.mock('../../src/units.js', () => ({ findPath: vi.fn(() => [{ x: 1, y: 1 }, { x: 2, y: 1 }]) }))
vi.mock('../../src/game/navalFleetSystem.js', () => ({
  AIRCRAFT_SLOT_WEIGHT: { apache: 2, f35: 2, f22Raptor: 1 },
  requestCarrierLanding: vi.fn(() => true), requestTransportLoadGroup: vi.fn(() => true),
  isTransportableGroundUnit: unit => !unit.isNaval && !unit.isAirUnit
}))
vi.mock('../../src/replaySystem.js', () => ({ recordReplayCommand: vi.fn(), createReplayEntityReference: unit => ({ id: unit.id }), createReplayUnitReferences: () => [] }))

describe('unit context orders', () => {
  let unit, target, context
  beforeEach(() => {
    vi.clearAllMocks()
    unit = { id: 'follower', type: 'tank_v1', owner: 'player1', health: 100, x: 32, y: 32, tileX: 1, tileY: 1, path: [] }
    target = { id: 'target', type: 'tank_v1', owner: 'player2', health: 100, x: 320, y: 32, tileX: 10, tileY: 1 }
    context = { units: [unit, target], buildings: [], mapGrid: [], commands: { handleMovementCommand: vi.fn(), handleAttackCommand: vi.fn(), handleServiceProviderRequest: vi.fn() } }
  })
  it('[U07021] offers friendly actions, enemy follow and contextual boarding', () => {
    expect(unitActionOptions([unit], target, 'player1')).toEqual(['attackUnit', 'followUnit'])
    target.owner = 'player1'
    target.type = 'vehicleFerry'
    expect(unitActionOptions([unit], target, 'player1')).toEqual(['forceAttackUnit', 'guardUnit', 'serveUnit', 'followUnit', 'embarkUnit'])
    unit.type = 'apache'; unit.isAirUnit = true; target.type = 'aircraftCarrier'
    expect(unitActionOptions([unit], target, 'player1')).toContain('landOnUnit')
  })
  it('[U07022] follows an enemy, updates the route as it moves, and stops when it dies', () => {
    expect(applyUnitAction({ action: 'followUnit', targetId: target.id, entityIds: [unit.id] }, 'player1', context)).toBe(true)
    expect(unit.guardOrderMode).toBe('follow')
    expect(unit.target).toBeNull()
    updateGuardBehavior(unit, [], [], 1000)
    expect(findPath).toHaveBeenLastCalledWith(expect.anything(), { x: 10, y: 1 }, [], [], undefined, expect.anything())
    target.x = 480
    updateGuardBehavior(unit, [], [], 1300)
    expect(findPath).toHaveBeenLastCalledWith(expect.anything(), { x: 15, y: 1 }, [], [], undefined, expect.anything())
    target.health = 0
    updateGuardBehavior(unit, [], [], 1600)
    expect(unit.guardTarget).toBeNull()
    expect(unit.path).toEqual([])
    expect(unit.guardOrderMode).toBeNull()
  })
  it('[U07023] rejects unauthorized commands and friendly-only actions against enemies', () => {
    expect(applyUnitAction({ action: 'followUnit', targetId: target.id, entityIds: [unit.id] }, 'player2', context)).toBe(false)
    expect(applyUnitAction({ action: 'guardUnit', targetId: target.id, entityIds: [unit.id] }, 'player1', context)).toBe(false)
  })
  it('[U07024] serves a naval recipient with available cargo and required infrastructure', () => {
    Object.assign(unit, { type: 'supplyShip', isNaval: true, supplyFuel: 100 })
    Object.assign(target, { owner: 'player1', type: 'destroyer', isNaval: true, gas: 0, maxGas: 100 })
    context.buildings = [{ type: 'gasStation', owner: 'player1', health: 100 }]
    expect(canSupplyShipServe(unit, target, context.buildings)).toBe(true)
    expect(applyUnitAction({ action: 'serveUnit', targetId: target.id, entityIds: [unit.id] }, 'player1', context)).toBe(true)
    expect(unit.guardOrderMode).toBe('serve')
    expect(unit.guardTarget).toBe(target)
    unit.supplyFuel = 0
    expect(canSupplyShipServe(unit, target, context.buildings)).toBe(false)
  })
  it('[U07030] preserves a new move order after cancelling follow', () => {
    unit.guardOrderMode = 'follow'
    unit.guardTarget = null
    unit.guardTargets = null
    unit.path = [{ x: 5, y: 5 }]
    unit.moveTarget = { x: 5, y: 5 }
    updateGuardBehavior(unit, [], [], 1000)
    expect(unit.path).toEqual([{ x: 5, y: 5 }])
    expect(unit.moveTarget).toEqual({ x: 5, y: 5 })
    expect(unit.guardOrderMode).toBeNull()
  })
  it('[U07025] migrates old saves without modifying the original units', () => {
    const old = { gameState: {}, units: [Object.freeze({ id: 'old' })] }
    const migrated = migrations[6](old)
    expect(migrated.units[0]).toEqual({ id: 'old', guardOrderMode: null, guardTargetIds: [] })
    expect(old.units[0]).toEqual({ id: 'old' })
  })
})
