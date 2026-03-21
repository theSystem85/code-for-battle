import { describe, expect, it } from 'vitest'
import { buildCompactStrategicInput } from '../../src/ai/llmStrategicDigest.js'

describe('llmStrategicDigest', () => {
  it('replaces raw snapshot arrays with grouped strategic sections', () => {
    const rawInput = {
      protocolVersion: '1.0',
      matchId: 'local',
      playerId: 'player2',
      tick: 120,
      sinceTick: 90,
      meta: {
        tilesX: 100,
        tilesY: 100,
        fogOfWarEnabled: true
      },
      snapshot: {
        resources: {
          money: 1750,
          power: { supply: 50, production: 80, consumption: 30 }
        },
        units: [
          {
            id: 'tank-1',
            type: 'tank_v1',
            owner: 'player2',
            health: 100,
            maxHealth: 100,
            tilePosition: { x: 11, y: 13, space: 'tile' }
          },
          {
            id: 'tank-2',
            type: 'tank_v1',
            owner: 'player2',
            health: 72,
            maxHealth: 100,
            tilePosition: { x: 12, y: 14, space: 'tile' },
            orders: { targetId: 'enemy-refinery' }
          },
          {
            id: 'harv-1',
            type: 'harvester',
            owner: 'player2',
            health: 85,
            maxHealth: 100,
            tilePosition: { x: 9, y: 10, space: 'tile' },
            orders: { moveTarget: { x: 8, y: 8, space: 'tile' } }
          },
          {
            id: 'enemy-harv',
            type: 'harvester',
            owner: 'player1',
            health: 65,
            maxHealth: 100,
            tilePosition: { x: 60, y: 62, space: 'tile' }
          }
        ],
        buildings: [
          {
            id: 'yard-1',
            type: 'constructionYard',
            owner: 'player2',
            health: 900,
            maxHealth: 1000,
            tilePosition: { x: 10, y: 10, space: 'tile' },
            constructionFinished: true
          },
          {
            id: 'ref-1',
            type: 'oreRefinery',
            owner: 'player2',
            health: 780,
            maxHealth: 1000,
            tilePosition: { x: 14, y: 10, space: 'tile' },
            constructionFinished: true
          },
          {
            id: 'factory-1',
            type: 'vehicleFactory',
            owner: 'player2',
            health: 900,
            maxHealth: 1000,
            tilePosition: { x: 18, y: 10, space: 'tile' },
            constructionFinished: true
          },
          {
            id: 'enemy-refinery',
            type: 'oreRefinery',
            owner: 'player1',
            health: 500,
            maxHealth: 1000,
            tilePosition: { x: 58, y: 60, space: 'tile' },
            constructionFinished: true
          }
        ],
        llmQueue: {
          buildings: [{ buildingType: 'powerPlant', status: 'queued' }],
          units: [{ unitType: 'harvester', status: 'building' }]
        }
      },
      transitions: {
        summary: { totalDamage: 120, unitsDestroyed: 1, buildingsDestroyed: 0 },
        events: [
          { type: 'damage', tick: 110, targetId: 'enemy-refinery', amount: 120, position: { x: 58, y: 60, space: 'tile' } },
          { type: 'unit_created', tick: 112, unitId: 'tank-3', unitType: 'tank_v1', owner: 'player2' }
        ]
      },
      constraints: {
        maxActionsPerTick: 50,
        allowQueuedCommands: true,
        maxQueuedCommands: 20
      }
    }

    const digest = buildCompactStrategicInput(rawInput)

    expect(digest.inputMode).toBe('compact-strategic-v1')
    expect(digest.snapshot).toBeUndefined()
    expect(digest.transitions).toBeUndefined()
    expect(digest.baseStatus.ownedBuildings).toHaveLength(3)
    expect(digest.forceGroups.combat[0]).toMatchObject({
      type: 'tank_v1',
      count: 2,
      unitIds: ['tank-1', 'tank-2']
    })
    expect(digest.forceGroups.detailedUnits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'harv-1', type: 'harvester' }),
        expect.objectContaining({ id: 'tank-2', targetId: 'enemy-refinery' })
      ])
    )
    expect(digest.knownEnemyIntel.priorityTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'enemy-refinery', type: 'oreRefinery' }),
        expect.objectContaining({ id: 'enemy-harv', type: 'harvester' })
      ])
    )
    expect(digest.productionOptions.availableBuildings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'powerPlant', role: 'power' }),
        expect.objectContaining({ type: 'vehicleFactory', role: 'vehicle-production' })
      ])
    )
    expect(digest.productionOptions.availableUnits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tank_v1', spawnsFrom: 'vehicleFactory' }),
        expect.objectContaining({ type: 'harvester', role: 'economy' })
      ])
    )
    expect(digest.queueState.llmQueue.units[0]).toEqual({ unitType: 'harvester', status: 'building' })
    expect(digest.recentDeltas.countsByType).toEqual({ damage: 1, unit_created: 1 })
  })

  it('produces a meaningfully smaller payload than the raw strategic snapshot', () => {
    const rawInput = {
      protocolVersion: '1.0',
      matchId: 'local',
      playerId: 'player2',
      tick: 220,
      sinceTick: 180,
      meta: { tilesX: 100, tilesY: 100, fogOfWarEnabled: true },
      snapshot: {
        resources: { money: 4200, power: { supply: 40, production: 70, consumption: 30 } },
        units: Array.from({ length: 48 }, (_, index) => ({
          id: `tank-${index + 1}`,
          type: index % 3 === 0 ? 'tank_v1' : (index % 3 === 1 ? 'rocketTank' : 'harvester'),
          owner: 'player2',
          health: index % 5 === 0 ? 65 : 100,
          maxHealth: 100,
          tilePosition: { x: index, y: index + 1, space: 'tile' },
          orders: index % 4 === 0 ? { targetId: 'enemy-yard' } : undefined
        })).concat([
          {
            id: 'enemy-howitzer',
            type: 'howitzer',
            owner: 'player1',
            health: 60,
            maxHealth: 100,
            tilePosition: { x: 70, y: 70, space: 'tile' }
          }
        ]),
        buildings: [
          {
            id: 'yard-1',
            type: 'constructionYard',
            owner: 'player2',
            health: 900,
            maxHealth: 1000,
            tilePosition: { x: 10, y: 10, space: 'tile' },
            constructionFinished: true
          },
          {
            id: 'factory-1',
            type: 'vehicleFactory',
            owner: 'player2',
            health: 1000,
            maxHealth: 1000,
            tilePosition: { x: 15, y: 10, space: 'tile' },
            constructionFinished: true
          },
          {
            id: 'radar-1',
            type: 'radarStation',
            owner: 'player2',
            health: 1000,
            maxHealth: 1000,
            tilePosition: { x: 18, y: 10, space: 'tile' },
            constructionFinished: true
          },
          {
            id: 'ammo-1',
            type: 'ammunitionFactory',
            owner: 'player2',
            health: 1000,
            maxHealth: 1000,
            tilePosition: { x: 20, y: 10, space: 'tile' },
            constructionFinished: true
          },
          {
            id: 'workshop-1',
            type: 'vehicleWorkshop',
            owner: 'player2',
            health: 1000,
            maxHealth: 1000,
            tilePosition: { x: 23, y: 10, space: 'tile' },
            constructionFinished: true
          },
          {
            id: 'enemy-yard',
            type: 'constructionYard',
            owner: 'player1',
            health: 1000,
            maxHealth: 1000,
            tilePosition: { x: 80, y: 82, space: 'tile' },
            constructionFinished: true
          },
          {
            id: 'enemy-refinery',
            type: 'oreRefinery',
            owner: 'player1',
            health: 1000,
            maxHealth: 1000,
            tilePosition: { x: 82, y: 84, space: 'tile' },
            constructionFinished: true
          }
        ],
        llmQueue: { buildings: [], units: [] }
      },
      transitions: {
        summary: { totalDamage: 240, unitsDestroyed: 3, buildingsDestroyed: 1 },
        events: Array.from({ length: 14 }, (_, index) => ({
          type: index % 3 === 0 ? 'damage' : (index % 3 === 1 ? 'unit_created' : 'destroyed'),
          tick: 190 + index,
          targetId: 'enemy-yard',
          amount: index % 3 === 0 ? 20 : undefined,
          unitId: index % 3 === 1 ? `tank-${index}` : undefined,
          unitType: index % 3 === 1 ? 'tank_v1' : undefined,
          victimId: index % 3 === 2 ? `tank-${index}` : undefined,
          victimKind: index % 3 === 2 ? 'unit' : undefined
        }))
      },
      constraints: { maxActionsPerTick: 50, allowQueuedCommands: true, maxQueuedCommands: 20 }
    }

    const rawSize = JSON.stringify(rawInput).length
    const digestSize = JSON.stringify(buildCompactStrategicInput(rawInput)).length

    expect(digestSize).toBeLessThan(rawSize)
  })
})
