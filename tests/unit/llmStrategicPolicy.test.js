import { describe, expect, it } from 'vitest'
import { prioritizeEconomyActions } from '../../src/ai/llmStrategicPolicy.js'

function createCompactInput(overrides = {}) {
  return {
    playerId: 'player2',
    economy: {
      money: 4000,
      harvesters: { total: 0 },
      ...overrides.economy
    },
    baseStatus: {
      ownedBuildingCounts: {
        powerPlant: 1,
        oreRefinery: 1,
        vehicleFactory: 1,
        ...overrides.baseStatus?.ownedBuildingCounts
      },
      ownedBuildings: [{ id: 'yard-1', tilePosition: { x: 10, y: 12, space: 'tile' } }],
      productionAnchors: [{ id: 'yard-1', tilePosition: { x: 10, y: 12, space: 'tile' } }],
      ...overrides.baseStatus
    },
    mapIntel: {
      ownBaseCenter: { x: 12, y: 12, space: 'tile' },
      ...overrides.mapIntel
    },
    productionOptions: {
      availableBuildings: [{ type: 'powerPlant' }, { type: 'oreRefinery' }, { type: 'vehicleFactory' }],
      availableUnits: [{ type: 'harvester' }, { type: 'tank_v1' }],
      ...overrides.productionOptions
    },
    queueState: {
      llmQueue: {
        buildings: [],
        units: [],
        ...overrides.queueState?.llmQueue
      },
      ...overrides.queueState
    },
    constraints: {
      maxActionsPerTick: 10,
      ...overrides.constraints
    },
    ...overrides
  }
}

describe('llmStrategicPolicy', () => {
  it('injects a harvester before non-economy spending when the economy is unstable', () => {
    const input = createCompactInput()
    const output = {
      protocolVersion: '1.0',
      tick: 100,
      intent: 'rush',
      confidence: 0.6,
      notes: 'Queue tanks',
      actions: [
        { actionId: 'tank-1', type: 'build_queue', unitType: 'tank_v1', count: 1, factoryId: null, rallyPoint: null },
        { actionId: 'turret-1', type: 'build_place', buildingType: 'turretGunV1', tilePosition: { x: 15, y: 15, space: 'tile' }, rallyPoint: null },
        { actionId: 'move-1', type: 'unit_command', unitIds: ['u1'], command: 'move', targetPos: { x: 20, y: 20, space: 'tile' }, targetId: null }
      ]
    }

    const prioritized = prioritizeEconomyActions(output, input)

    expect(prioritized.actions[0]).toMatchObject({ type: 'build_queue', unitType: 'harvester', count: 1 })
    expect(prioritized.actions.some(action => action.actionId === 'tank-1')).toBe(false)
    expect(prioritized.actions.some(action => action.actionId === 'turret-1')).toBe(false)
    expect(prioritized.actions.some(action => action.actionId === 'move-1')).toBe(true)
  })

  it('moves an existing harvester action to the front instead of duplicating it', () => {
    const input = createCompactInput()
    const output = {
      protocolVersion: '1.0',
      tick: 100,
      intent: 'mixed',
      confidence: 0.6,
      notes: 'Mixed plan',
      actions: [
        { actionId: 'tank-1', type: 'build_queue', unitType: 'tank_v1', count: 1, factoryId: null, rallyPoint: null },
        { actionId: 'harv-1', type: 'build_queue', unitType: 'harvester', count: 1, factoryId: null, rallyPoint: null }
      ]
    }

    const prioritized = prioritizeEconomyActions(output, input)

    expect(prioritized.actions[0].actionId).toBe('harv-1')
    expect(prioritized.actions.filter(action => action.unitType === 'harvester')).toHaveLength(1)
    expect(prioritized.actions.some(action => action.actionId === 'tank-1')).toBe(false)
  })

  it('prioritizes the next missing building in the economy chain before unit production', () => {
    const input = createCompactInput({
      baseStatus: {
        ownedBuildingCounts: {
          powerPlant: 1,
          oreRefinery: 0,
          vehicleFactory: 0
        }
      },
      productionOptions: {
        availableBuildings: [{ type: 'oreRefinery' }, { type: 'vehicleFactory' }, { type: 'turretGunV1' }],
        availableUnits: [{ type: 'tank_v1' }]
      }
    })
    const output = {
      protocolVersion: '1.0',
      tick: 100,
      intent: 'attack',
      confidence: 0.6,
      notes: 'Build offense',
      actions: [
        { actionId: 'tank-1', type: 'build_queue', unitType: 'tank_v1', count: 1, factoryId: null, rallyPoint: null }
      ]
    }

    const prioritized = prioritizeEconomyActions(output, input)

    expect(prioritized.actions[0]).toMatchObject({ type: 'build_place', buildingType: 'oreRefinery' })
    expect(prioritized.actions[0].tilePosition).toEqual({ x: 12, y: 12, space: 'tile' })
    expect(prioritized.actions).toHaveLength(1)
  })

  it('leaves actions unchanged once the minimum economy is already established', () => {
    const input = createCompactInput({
      economy: { harvesters: { total: 1 } }
    })
    const output = {
      protocolVersion: '1.0',
      tick: 100,
      intent: 'attack',
      confidence: 0.6,
      notes: 'Queue offense',
      actions: [
        { actionId: 'tank-1', type: 'build_queue', unitType: 'tank_v1', count: 1, factoryId: null, rallyPoint: null }
      ]
    }

    const prioritized = prioritizeEconomyActions(output, input)

    expect(prioritized).toEqual(output)
  })
})
