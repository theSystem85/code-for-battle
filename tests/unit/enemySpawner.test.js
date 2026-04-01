import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/units.js', () => ({
  findPath: vi.fn(() => []),
  spawnUnit: vi.fn((spawnBuilding, unitType, tileX, tileY, units, owner) => {
    const unit = {
      id: `spawned-${unitType}`,
      type: unitType,
      owner,
      tileX,
      tileY,
      x: tileX * 32,
      y: tileY * 32,
      health: 100,
      maxHealth: 100,
      path: []
    }
    if (Array.isArray(units)) {
      units.push(unit)
    }
    return unit
  })
}))

vi.mock('../../src/utils.js', () => ({
  getUniqueId: vi.fn(() => 'unit-1')
}))

vi.mock('../../src/logic.js', () => ({
  findClosestOre: vi.fn(() => null)
}))

vi.mock('../../src/game/harvesterLogic.js', () => ({
  assignHarvesterToOptimalRefinery: vi.fn()
}))

vi.mock('../../src/game/unifiedMovement.js', () => ({
  initializeUnitMovement: vi.fn()
}))

import { spawnEnemyUnit } from '../../src/ai/enemySpawner.js'
import { TILE_SIZE, UNIT_GAS_PROPERTIES, UNIT_PROPERTIES, TANKER_SUPPLY_CAPACITY } from '../../src/config.js'
import { findPath } from '../../src/units.js'
import { getUniqueId } from '../../src/utils.js'
import { findClosestOre } from '../../src/logic.js'
import { assignHarvesterToOptimalRefinery } from '../../src/game/harvesterLogic.js'
import { initializeUnitMovement } from '../../src/game/unifiedMovement.js'

const createMapGrid = (width = 12, height = 12) => {
  const mapGrid = []
  for (let y = 0; y < height; y++) {
    mapGrid[y] = []
    for (let x = 0; x < width; x++) {
      mapGrid[y][x] = {
        type: 'grass',
        building: null,
        seedCrystal: false
      }
    }
  }
  return mapGrid
}

describe('enemySpawner.js', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.window = globalThis.window || {}
    delete globalThis.window.cheatSystem
  })

  afterEach(() => {
    delete globalThis.window.cheatSystem
  })

  it('spawns at the first valid tile around the building center', () => {
    const mapGrid = createMapGrid()
    const spawnBuilding = { x: 4, y: 4, width: 2, height: 2 }

    mapGrid[4][5].type = 'water'
    mapGrid[5][6].type = 'rock'
    mapGrid[6][5].building = { id: 'blocked' }
    mapGrid[5][4].seedCrystal = true

    const unit = spawnEnemyUnit(
      spawnBuilding,
      'tank-v2',
      [],
      mapGrid,
      { occupancyMap: [], targetedOreTiles: {} },
      1000,
      'ai1'
    )

    expect(unit.tileX).toBe(6)
    expect(unit.tileY).toBe(4)
    expect(unit.x).toBe(6 * TILE_SIZE)
    expect(unit.y).toBe(4 * TILE_SIZE)
    expect(initializeUnitMovement).toHaveBeenCalledWith(unit)
  })

  it('falls back to the building center when no valid spawn tiles exist', () => {
    const mapGrid = createMapGrid(6, 6)
    for (const row of mapGrid) {
      for (const tile of row) {
        tile.type = 'water'
      }
    }
    const spawnBuilding = { x: 1, y: 1, width: 2, height: 2 }
    const occupancyMap = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => 0))

    const unit = spawnEnemyUnit(
      spawnBuilding,
      'tank-v2',
      [],
      mapGrid,
      { occupancyMap, targetedOreTiles: {} },
      1000,
      'ai1'
    )

    expect(unit.tileX).toBe(2)
    expect(unit.tileY).toBe(2)
    expect(occupancyMap[2][2]).toBe(1)
  })

  it('initializes gas, crew, and cost data for combat/support units', () => {
    const mapGrid = createMapGrid()
    const spawnBuilding = { x: 2, y: 2, width: 2, height: 2 }

    const tank = spawnEnemyUnit(
      spawnBuilding,
      'tank-v2',
      [],
      mapGrid,
      { occupancyMap: [], targetedOreTiles: {} },
      1000,
      'ai1'
    )

    expect(tank.maxGas).toBe(UNIT_GAS_PROPERTIES['tank-v2'].tankSize)
    expect(tank.gas).toBe(UNIT_GAS_PROPERTIES['tank-v2'].tankSize)
    expect(tank.gasConsumption).toBe(UNIT_GAS_PROPERTIES['tank-v2'].consumption)
    expect(tank.crew).toEqual({ driver: true, commander: true, gunner: true, loader: true })
    expect(tank.baseCost).toBe(2000)
    expect(tank.alertMode).toBe(true)

    const ambulance = spawnEnemyUnit(
      spawnBuilding,
      'ambulance',
      [],
      mapGrid,
      { occupancyMap: [], targetedOreTiles: {} },
      1000,
      'ai1'
    )

    expect(ambulance.crew).toEqual({ driver: true, commander: true, loader: true })
    expect(ambulance.medics).toBe(UNIT_PROPERTIES.ambulance.medics)
    expect(ambulance.maxMedics).toBe(UNIT_PROPERTIES.ambulance.maxMedics)
    expect(ambulance.baseCost).toBe(500)
  })

  it('sets tanker supply values and skips crew for apache', () => {
    const mapGrid = createMapGrid()
    const spawnBuilding = { x: 3, y: 3, width: 2, height: 2 }

    const tanker = spawnEnemyUnit(
      spawnBuilding,
      'tankerTruck',
      [],
      mapGrid,
      { occupancyMap: [], targetedOreTiles: {} },
      1000,
      'ai1'
    )

    expect(tanker.maxSupplyGas).toBe(TANKER_SUPPLY_CAPACITY)
    expect(tanker.supplyGas).toBe(TANKER_SUPPLY_CAPACITY)
    expect(tanker.maxGas).toBe(UNIT_GAS_PROPERTIES.tankerTruck.tankSize)

    const apache = spawnEnemyUnit(
      spawnBuilding,
      'apache',
      [],
      mapGrid,
      { occupancyMap: [], targetedOreTiles: {} },
      1000,
      'ai1'
    )

    expect(apache.crew).toBeUndefined()
  })

  it('assigns harvesters to refineries and queues ore targets', () => {
    const mapGrid = createMapGrid()
    const spawnBuilding = { x: 1, y: 1, width: 2, height: 2 }
    const targetedOreTiles = {}
    const buildings = [
      { id: 'enemy-refinery', owner: 'ai1' },
      { id: 'player-refinery', owner: 'player' }
    ]

    vi.mocked(assignHarvesterToOptimalRefinery).mockImplementation((unit) => {
      unit.assignedRefinery = { id: 'enemy-refinery' }
    })
    vi.mocked(findClosestOre).mockReturnValue({ x: 4, y: 5 })
    vi.mocked(findPath).mockReturnValue([
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 5 }
    ])

    const unit = spawnEnemyUnit(
      spawnBuilding,
      'harvester',
      [],
      mapGrid,
      { occupancyMap: [], targetedOreTiles, buildings },
      1000,
      'ai1'
    )

    expect(assignHarvesterToOptimalRefinery).toHaveBeenCalledWith(unit, {
      buildings: [{ id: 'enemy-refinery', owner: 'ai1' }]
    })
    expect(findClosestOre).toHaveBeenCalledWith(
      unit,
      mapGrid,
      targetedOreTiles,
      unit.assignedRefinery
    )
    expect(findPath).toHaveBeenCalledWith(
      { x: unit.tileX, y: unit.tileY, owner: unit.owner },
      { x: 4, y: 5 },
      mapGrid,
      null,
      undefined,
      { unitOwner: unit.owner }
    )
    expect(unit.path).toEqual([{ x: 3, y: 3 }, { x: 4, y: 5 }])
    expect(unit.oreField).toEqual({ x: 4, y: 5 })
    expect(targetedOreTiles['4,5']).toBe(unit.id)
    expect(unit.armor).toBe(3)
  })

  it('marks harvester hunter units and resets queue flags', () => {
    const mapGrid = createMapGrid()
    const spawnBuilding = { x: 1, y: 1, width: 2, height: 2 }
    const gameState = {
      occupancyMap: [],
      targetedOreTiles: {},
      ai1HarvesterHunterQueued: true
    }

    const unit = spawnEnemyUnit(
      spawnBuilding,
      'tank_v1',
      [],
      mapGrid,
      gameState,
      1000,
      'ai1'
    )

    expect(unit.harvesterHunter).toBe(true)
    expect(unit.lastSafeTile).toEqual({ x: unit.tileX, y: unit.tileY })
    expect(gameState.ai1HarvesterHunterQueued).toBe(false)
  })

  it('adds units to god mode when cheat system is active', () => {
    const mapGrid = createMapGrid()
    const spawnBuilding = { x: 1, y: 1, width: 2, height: 2 }

    globalThis.window.cheatSystem = {
      isGodModeActive: vi.fn(() => true),
      addUnitToGodMode: vi.fn()
    }

    const unit = spawnEnemyUnit(
      spawnBuilding,
      'tank-v2',
      [],
      mapGrid,
      { occupancyMap: [], targetedOreTiles: {} },
      1000,
      'ai1'
    )

    expect(globalThis.window.cheatSystem.isGodModeActive).toHaveBeenCalled()
    expect(globalThis.window.cheatSystem.addUnitToGodMode).toHaveBeenCalledWith(unit)
  })

  it('uses unique ids for spawned units', () => {
    const mapGrid = createMapGrid()
    const spawnBuilding = { x: 1, y: 1, width: 2, height: 2 }

    vi.mocked(getUniqueId).mockReturnValueOnce('unit-99')

    const unit = spawnEnemyUnit(
      spawnBuilding,
      'tank-v2',
      [],
      mapGrid,
      { occupancyMap: [], targetedOreTiles: {} },
      1000,
      'ai1'
    )

    expect(unit.id).toBe('unit-99')
  })
})
