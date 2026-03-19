import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Mock benchmark modules early to prevent import chain issues with buildingData
vi.mock('../../src/benchmark/benchmarkRunner.js', () => ({
  attachBenchmarkButton: vi.fn()
}))

vi.mock('../../src/benchmark/benchmarkScenario.js', () => ({
  setupBenchmarkScenario: vi.fn(),
  teardownBenchmarkScenario: vi.fn()
}))

// Mock buildings module to ensure buildingData is properly defined
vi.mock('../../src/data/buildingData.js', () => ({
  buildingData: {
    constructionYard: { width: 3, height: 3, cost: 5000, health: 300 },
    powerPlant: { width: 3, height: 3, cost: 2000, health: 200 },
    vehicleFactory: { width: 3, height: 2, cost: 3000, health: 200 },
    rocketTurret: { fireRange: 16, width: 2, height: 2, cost: 1500, health: 150 }
  }
}))

vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    constructionYard: { width: 3, height: 3, cost: 5000, health: 300 },
    powerPlant: { width: 3, height: 3, cost: 2000, health: 200 },
    vehicleFactory: { width: 3, height: 2, cost: 3000, health: 200 },
    rocketTurret: { fireRange: 16, width: 2, height: 2, cost: 1500, health: 150 }
  },
  canPlaceBuilding: vi.fn(() => true),
  createBuilding: vi.fn((type, x, y) => ({ id: 'test', type, x, y, health: 100 })),
  placeBuilding: vi.fn(),
  updatePowerSupply: vi.fn()
}))

// Mock units.js to provide spawnUnit and unitCosts
vi.mock('../../src/units.js', () => ({
  spawnUnit: vi.fn((factory, unitType) => ({
    id: `unit-${Date.now()}`,
    type: unitType,
    owner: factory.owner,
    x: (factory.x + factory.width) * 32,
    y: factory.y * 32,
    health: 100,
    maxHealth: 100
  })),
  unitCosts: {
    tank_v1: 800,
    apache: 1200,
    harvester: 1000
  }
}))

// Mock enemyBuilding.js to prevent import chain issues
vi.mock('../../src/ai/enemyBuilding.js', () => ({
  findBuildingPosition: vi.fn(() => null)
}))

import { TILE_SIZE } from '../../src/config.js'
import { gameState } from '../../src/gameState.js'
import { applyGameTickOutput, computeAvailableUnitTypes } from '../../src/ai-api/applier.js'
import { validateGameTickInput, validateGameTickOutput } from '../../src/ai-api/validate.js'
import { exportGameTickInput } from '../../src/ai-api/exporter.js'
import { resetTransitions, recordDamage } from '../../src/ai-api/transitionCollector.js'
import { createTestMapGrid, resetGameState, createTestFactory, createTestBuilding } from '../testUtils.js'

// Use fileURLToPath and dirname to resolve paths correctly in test environment
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '../../')

const earlyGameInput = JSON.parse(
  readFileSync(join(projectRoot, 'src/ai-api/examples/early-game-input.json'))
)
const earlyGameOutput = JSON.parse(
  readFileSync(join(projectRoot, 'src/ai-api/examples/early-game-output.json'))
)
const combatInput = JSON.parse(
  readFileSync(join(projectRoot, 'src/ai-api/examples/combat-input.json'))
)
const combatOutput = JSON.parse(
  readFileSync(join(projectRoot, 'src/ai-api/examples/combat-output.json'))
)

describe('LLM Control API validation', () => {
  it('accepts the example payloads', () => {
    const results = {
      earlyInput: validateGameTickInput(earlyGameInput),
      earlyOutput: validateGameTickOutput(earlyGameOutput),
      combatInput: validateGameTickInput(combatInput),
      combatOutput: validateGameTickOutput(combatOutput)
    }

    expect(results.earlyInput.ok).toBe(true)
    expect(results.earlyOutput.ok).toBe(true)
    expect(results.combatInput.ok).toBe(true)
    expect(results.combatOutput.ok).toBe(true)
    expect(results).toMatchSnapshot()
  })
})

describe('LLM Control API applier', () => {


  it('requires artillery turret before howitzer is available', () => {
    const owner = 'player1'
    const baseBuildings = [
      { type: 'vehicleFactory', owner, health: 100 },
      { type: 'radarStation', owner, health: 100 }
    ]

    const withoutArtilleryTurret = computeAvailableUnitTypes(baseBuildings, [], owner)
    expect(withoutArtilleryTurret.has('tank-v2')).toBe(true)
    expect(withoutArtilleryTurret.has('howitzer')).toBe(false)

    const withArtilleryTurret = computeAvailableUnitTypes(
      [...baseBuildings, { type: 'artilleryTurret', owner, health: 100 }],
      [],
      owner
    )
    expect(withArtilleryTurret.has('howitzer')).toBe(true)
  })
  it('applies building placement and unit production actions', () => {
    const state = resetGameState()
    const mapGrid = createTestMapGrid(24, 24)
    const occupancyMap = Array.from({ length: mapGrid.length }, () => Array(mapGrid[0].length).fill(0))
    const units = []
    const buildings = []
    const factories = []

    state.mapGrid = mapGrid
    state.occupancyMap = occupancyMap
    state.money = 50000

    const constructionYard = createTestFactory(2, 2, 'player1', mapGrid)
    const vehicleFactory = createTestBuilding('vehicleFactory', 12, 2, 'player1', mapGrid)

    factories.push(constructionYard)
    buildings.push(vehicleFactory)

    const output = {
      protocolVersion: '1.0',
      tick: state.frameCount,
      actions: [
        {
          actionId: 'act-build-pp',
          type: 'build_place',
          buildingType: 'powerPlant',
          tilePosition: { x: 6, y: 2, space: 'tile' }
        },
        {
          actionId: 'act-queue-tank',
          type: 'build_queue',
          factoryId: vehicleFactory.id,
          unitType: 'tank_v1',
          count: 1,
          priority: 'normal',
          rallyPoint: { x: 10, y: 8, space: 'tile' }
        }
      ]
    }

    const result = applyGameTickOutput(state, output, {
      units,
      buildings,
      factories,
      mapGrid,
      playerId: 'player1'
    })

    // Both actions should be accepted and queued for sequential construction/production
    expect(result.rejected).toHaveLength(0)
    expect(result.accepted.map(entry => entry.type)).toEqual(['build_place', 'build_queue'])
    // Buildings and units are now queued (not placed/spawned instantly)
    expect(result.accepted[0].queued).toBe(true)
    expect(result.accepted[1].queued).toBe(true)
    // Verify queues were populated
    expect(state.llmStrategic.buildQueuesByPlayer['player1']).toHaveLength(1)
    expect(state.llmStrategic.unitQueuesByPlayer['player1']).toHaveLength(1)
  })

  it('applies move and attack commands', () => {
    resetGameState()
    const mapGrid = createTestMapGrid(20, 20)
    const units = [
      {
        id: 'unit_1',
        owner: 'player1',
        x: TILE_SIZE * 5,
        y: TILE_SIZE * 5,
        moveTarget: null,
        target: null,
        guardMode: false,
        guardTarget: null
      },
      {
        id: 'enemy_1',
        owner: 'enemy',
        x: TILE_SIZE * 9,
        y: TILE_SIZE * 5
      }
    ]

    const output = {
      protocolVersion: '1.0',
      tick: gameState.frameCount,
      actions: [
        {
          actionId: 'act-move-1',
          type: 'unit_command',
          unitIds: ['unit_1'],
          command: 'move',
          targetPos: { x: 8, y: 8, space: 'tile' },
          queueMode: 'replace'
        },
        {
          actionId: 'act-attack-1',
          type: 'unit_command',
          unitIds: ['unit_1'],
          command: 'attack',
          targetId: 'enemy_1',
          queueMode: 'replace'
        }
      ]
    }

    const result = applyGameTickOutput(gameState, output, {
      units,
      buildings: [],
      factories: [],
      mapGrid,
      playerId: 'player1'
    })

    const unit = units.find(entry => entry.id === 'unit_1')

    expect(result.rejected).toHaveLength(0)
    expect(unit.moveTarget).toBeNull()
    expect(unit.target).toBe(units[1])
  })
})

describe('LLM exporter compact output', () => {
  it('omits world-pixel position and null/default fields from unit snapshots', () => {
    const state = resetGameState()
    state.mapTilesX = 20
    state.mapTilesY = 20
    const units = [
      {
        id: 'u1',
        type: 'tank_v1',
        owner: 'player1',
        x: 5 * TILE_SIZE,
        y: 3 * TILE_SIZE,
        health: 80,
        maxHealth: 100,
        ammo: 20,
        gas: 1000,
        isAirUnit: false,
        moveTarget: null,
        target: null
      },
      {
        id: 'u2',
        type: 'apache',
        owner: 'player1',
        x: 8 * TILE_SIZE,
        y: 4 * TILE_SIZE,
        health: 100,
        maxHealth: 100,
        ammo: 15,
        gas: undefined,
        isAirUnit: true,
        moveTarget: { x: 10, y: 10 },
        target: { id: 'enemy1' }
      }
    ]

    const result = exportGameTickInput(state, 0, {
      units,
      buildings: [],
      factories: [],
      mapGrid: [],
      playerId: 'player1',
      pruneTransitions: false
    })

    const tank = result.snapshot.units.find(u => u.id === 'u1')
    const apache = result.snapshot.units.find(u => u.id === 'u2')

    // World-pixel position must not appear
    expect(tank).not.toHaveProperty('position')
    expect(apache).not.toHaveProperty('position')

    // tilePosition must be present and use tile space
    expect(tank.tilePosition).toEqual({ x: 5, y: 3, space: 'tile' })
    expect(apache.tilePosition).toEqual({ x: 8, y: 4, space: 'tile' })

    // isAirUnit: false should be omitted; isAirUnit: true should be present
    expect(tank.status?.isAirUnit).toBeUndefined()
    expect(apache.status?.isAirUnit).toBe(true)

    // Null orders should be omitted entirely
    expect(tank.orders).toBeUndefined()

    // Active orders should be included
    expect(apache.orders?.moveTarget).toBeDefined()
    expect(apache.orders?.targetId).toBe('enemy1')
  })

  it('omits null rallyPoint from building snapshots', () => {
    const state = resetGameState()
    const buildings = [
      { id: 'b1', type: 'constructionYard', owner: 'player1', health: 300, maxHealth: 300, x: 5, y: 5, width: 3, height: 3, constructionFinished: true, rallyPoint: null },
      { id: 'b2', type: 'vehicleFactory', owner: 'player1', health: 200, maxHealth: 200, x: 10, y: 5, width: 3, height: 2, constructionFinished: true, rallyPoint: { x: 320, y: 192 } }
    ]

    const result = exportGameTickInput(state, 0, {
      units: [],
      buildings,
      factories: [],
      mapGrid: [],
      playerId: 'player1',
      pruneTransitions: false
    })

    const cy = result.snapshot.buildings.find(b => b.id === 'b1')
    const vf = result.snapshot.buildings.find(b => b.id === 'b2')

    expect(cy).not.toHaveProperty('rallyPoint')
    expect(vf.rallyPoint).toBeDefined()
  })

  it('aggregates multiple damage events for the same target into one entry', () => {
    resetTransitions()
    // Simulate three hits on the same target
    recordDamage({ attackerId: 'a1', targetId: 'u1', targetKind: 'unit', amount: 10, tick: 1, timeSeconds: 0.1 })
    recordDamage({ attackerId: 'a1', targetId: 'u1', targetKind: 'unit', amount: 15, tick: 2, timeSeconds: 0.2 })
    recordDamage({ attackerId: 'a2', targetId: 'u2', targetKind: 'unit', amount: 20, tick: 3, timeSeconds: 0.3 })

    const state = resetGameState()
    const result = exportGameTickInput(state, 0, {
      units: [],
      buildings: [],
      factories: [],
      mapGrid: [],
      playerId: 'player1',
      pruneTransitions: false
    })

    const damageEvents = result.transitions.events.filter(e => e.type === 'damage')
    // Three raw events → two aggregated entries (one per target)
    expect(damageEvents).toHaveLength(2)
    const u1Event = damageEvents.find(e => e.targetId === 'u1')
    expect(u1Event.amount).toBe(25) // 10 + 15
    const u2Event = damageEvents.find(e => e.targetId === 'u2')
    expect(u2Event.amount).toBe(20)
    resetTransitions()
  })
})
