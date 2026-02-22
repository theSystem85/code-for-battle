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
