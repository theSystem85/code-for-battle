import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyMapAction, mapActionOptions } from '../../src/ui/mapActions/mapActionCommands.js'
import { availableSupply, buildingActionOptions, groundSelection, retreatBasePoint } from '../../src/ui/mapActions/groundActions.js'
import { gameState } from '../../src/gameState.js'
import { updateRetreatBehavior } from '../../src/behaviours/retreat.js'
import { processCommandQueues } from '../../src/game/commandQueue.js'

vi.mock('../../src/replaySystem.js', () => ({
  createReplayEntityReference: unit => ({ id: unit.id }), createReplayUnitReferences: ids => ids.map(id => ({ id })), recordReplayCommand: vi.fn()
}))

const unit = (id, type = 'tank', owner = 'player1') => ({ id, type, owner, health: 100, x: 64, y: 64, tileX: 2, tileY: 2 })
function setup() {
  const tank = unit('tank')
  const context = {
    units: [tank], buildings: [], mapGrid: Array.from({ length: 30 }, () => Array.from({ length: 30 }, () => ({ type: 'grass' }))),
    commands: {
      handleMovementCommand: vi.fn((units, x, y) => units.forEach(u => { u.path = [{ x: Math.floor(x / 32), y: Math.floor(y / 32) }]; u.moveTarget = { x, y }; u.target = null; u.commandQueue = []; u.currentCommand = null })),
      handleServiceProviderRequest: vi.fn(() => true), canTankerProvideFuel: () => true, isUtilityTargetValid: (_mode, provider, target) => provider.id !== target.id && target.type === 'tank'
    }
  }
  return { tank, context, order: (action, extras = {}) => applyMapAction({ action, x: 320, y: 320, entityIds: ['tank'], ...extras }, 'player1', context) }
}

beforeEach(() => { gameState.humanPlayer = 'player1' })
describe('ground context commands', () => {
  it('[U07361] offers ground actions to support vehicles and excludes aircraft, ships and embarked units', () => {
    for (const type of ['harvester', 'tankerTruck', 'ambulance', 'recoveryTank', 'mineLayer']) expect(mapActionOptions([unit(type, type)], 'player1')).toContain('retreatTo')
    expect(groundSelection([unit('air', 'apache'), unit('sea', 'destroyer'), { ...unit('cargo'), embarkedOnId: 'ferry' }, unit('enemy', 'tank', 'player2')], 'player1')).toEqual([])
  })
  it('[U07362] retreats backwards with its original target and calculated path, excluding other owners', () => {
    const { tank, context, order } = setup()
    const target = { id: 'enemy', health: 50 }
    tank.target = target
    context.units.push(unit('enemy', 'tank', 'player2'), unit('support', 'tankerTruck'))
    expect(order('retreatTo', { entityIds: ['tank', 'enemy', 'support'] })).toBe(true)
    expect(tank).toMatchObject({ isRetreating: true, isMovingBackwards: true, retreatUsesPath: true, target, retreatOriginalTarget: target })
    expect(context.units[1].isRetreating).toBeUndefined()
    expect(context.units[2].isRetreating).toBe(true)
    expect(tank.path).toEqual([{ x: 10, y: 10 }])
  })
  it('[U07377] steers reverse retreat along each path segment while preserving path identity', () => {
    const { tank, order } = setup()
    expect(order('retreatTo')).toBe(true)
    const path = [{ x: 2, y: 3 }, { x: 3, y: 3 }, { x: 10, y: 10 }]
    tank.path = path
    tank.direction = 0
    updateRetreatBehavior(tank, 100, [], [])
    expect(tank.targetDirection).toBeCloseTo(-Math.PI / 2)
    expect(tank.canAccelerate).toBe(false)
    tank.direction = -Math.PI / 2
    updateRetreatBehavior(tank, 120, [], [])
    expect(tank.canAccelerate).toBe(true)
    expect(tank.path).toBe(path)
  })
  it('[U07363] prefers a workshop and uses the rear side of the base without a workshop', () => {
    const { tank, context } = setup()
    const base = { id: 'base', type: 'constructionYard', owner: 'player1', x: 8, y: 8, width: 3, height: 3, health: 100 }
    const workshop = { ...base, id: 'workshop', type: 'vehicleWorkshop', x: 20, y: 20 }
    context.buildings = [base, workshop, { ...base, id: 'enemy', owner: 'player2', x: 25, y: 8 }]
    const point = retreatBasePoint(tank, 'player1', context)
    expect(point.x).toBeGreaterThan(17 * 32)
    context.buildings.splice(1, 1)
    const rear = retreatBasePoint(tank, 'player1', context)
    expect(rear.x).toBeLessThan(base.x * 32)
  })
  it('[U07364] validates all route points before changing orders, then follows the queued sequence', () => {
    const { tank, context, order } = setup()
    expect(order('planPath', { points: [{ x: 100, y: 100 }, { x: NaN, y: 100 }] })).toBe(false)
    expect(context.commands.handleMovementCommand).not.toHaveBeenCalled()
    const points = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }]
    expect(order('planPath', { points })).toBe(true)
    expect(tank.currentCommand).toMatchObject(points[0])
    tank.path = []
    tank.moveTarget = null
    processCommandQueues([tank], context.mapGrid, context.commands)
    processCommandQueues([tank], context.mapGrid, context.commands)
    expect(context.commands.handleMovementCommand).toHaveBeenLastCalledWith([tank], 200, 100, context.mapGrid, true)
  })
  it('[U07365] calls the closest eligible friendly supplier and rejects unavailable service', () => {
    const { tank, context, order } = setup()
    const near = { ...unit('near', 'tankerTruck'), x: 96 }
    context.units.push({ ...unit('far', 'tankerTruck'), x: 700 }, near, unit('enemy', 'tankerTruck', 'player2'))
    expect(availableSupply([tank], 'player1', context, 'supplyGas')).toHaveLength(2)
    tank.crew = { commander: false, driver: true }
    expect(order('supplyGas')).toBe(true)
    expect(context.commands.handleServiceProviderRequest).toHaveBeenCalledWith(near, [tank], context.mapGrid)
    expect(order('supplyAmmo')).toBe(false)
  })
  it.each([['hospital', 'crewAtBuilding'], ['gasStation', 'fuelAtBuilding'], ['ammunitionFactory', 'ammoAtBuilding'], ['vehicleWorkshop', 'repairAtBuilding']])('[U07366] offers appropriate interactions at %s and rejects hostile buildings', (type, action) => {
    const { tank, context, order } = setup()
    const building = { id: 'building', type, owner: 'player1', health: 100, x: 5, y: 5, width: 3, height: 3 }
    context.buildings = [building]
    expect(buildingActionOptions([tank], building, 'player1')).toEqual(['defendBuilding', action])
    expect(order('defendBuilding', { targetId: building.id })).toBe(true)
    expect(tank.guardTarget).toBe(building)
    building.owner = 'player2'
    expect(order(action, { targetId: building.id })).toBe(false)
  })
})
