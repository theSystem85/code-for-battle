import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TILE_SIZE, UNIT_GAS_PROPERTIES, UNIT_PROPERTIES, TANKER_SUPPLY_CAPACITY } from '../../src/config.js'

let spawnUnitIdCounter = 0

const UNIT_COSTS = {
  'tank-v2': 2000,
  tank_v1: 1500,
  harvester: 1500,
  apache: 3000,
  tankerTruck: 500,
  ambulance: 500
}

const CREW_TEMPLATES = {
  tank_v1: { driver: true, commander: true, gunner: true, loader: true },
  'tank-v2': { driver: true, commander: true, gunner: true, loader: true },
  harvester: { driver: true, commander: true, loader: true },
  ambulance: { driver: true, commander: true, loader: true },
  tankerTruck: { driver: true, commander: true, loader: true },
  recoveryTank: { driver: true, commander: true, loader: true }
}

function buildMockUnit(spawnBuilding, unitType, units, mapGrid) {
  spawnUnitIdCounter++
  const centerX = spawnBuilding.x + Math.floor(spawnBuilding.width / 2)
  const centerY = spawnBuilding.y + Math.floor(spawnBuilding.height / 2)

  // Find first valid spawn tile around center (simplified)
  let spawnTileX = centerX
  let spawnTileY = centerY
  const isValid = (tx, ty) => {
    if (!mapGrid || ty < 0 || ty >= mapGrid.length || tx < 0 || tx >= mapGrid[0].length) return false
    const tile = mapGrid[ty][tx]
    return tile.type !== 'water' && tile.type !== 'rock' && !tile.building && !tile.seedCrystal
  }
  // Search outward in rings
  let found = false
  for (let ring = 0; ring <= 4 && !found; ring++) {
    for (let dy = -ring; dy <= ring && !found; dy++) {
      for (let dx = -ring; dx <= ring && !found; dx++) {
        if (ring > 0 && Math.abs(dx) < ring && Math.abs(dy) < ring) continue
        const tx = centerX + dx
        const ty = centerY + dy
        if (isValid(tx, ty)) {
          spawnTileX = tx
          spawnTileY = ty
          found = true
        }
      }
    }
  }

  const gasProps = UNIT_GAS_PROPERTIES[unitType]
  const unitProps = UNIT_PROPERTIES[unitType] || {}

  const unit = {
    id: `unit-${spawnUnitIdCounter}`,
    type: unitType,
    tileX: spawnTileX,
    tileY: spawnTileY,
    x: spawnTileX * TILE_SIZE,
    y: spawnTileY * TILE_SIZE,
    health: unitProps.health || 100,
    maxHealth: unitProps.maxHealth || 100,
    speed: unitProps.speed || 0.3,
    path: [],
    target: null,
    selected: false
  }

  if (gasProps) {
    unit.maxGas = gasProps.tankSize
    unit.gas = gasProps.tankSize
    unit.gasConsumption = gasProps.consumption
    if (gasProps.harvestConsumption) {
      unit.harvestGasConsumption = gasProps.harvestConsumption
    }
  }

  if (CREW_TEMPLATES[unitType]) {
    unit.crew = { ...CREW_TEMPLATES[unitType] }
  }

  unit.baseCost = UNIT_COSTS[unitType] || 1000

  if (unitProps.alertMode) {
    unit.alertMode = true
  }

  if (unitProps.medics !== undefined) {
    unit.medics = unitProps.medics
    unit.maxMedics = unitProps.maxMedics
  }

  if (unitType === 'tankerTruck') {
    unit.maxSupplyGas = TANKER_SUPPLY_CAPACITY
    unit.supplyGas = TANKER_SUPPLY_CAPACITY
  }

  if (unitType === 'harvester') {
    unit.armor = unitProps.armor || 3
  }

  if (unitType === 'apache' || unitType === 'f22Raptor') {
    unit.flightState = 'grounded'
  }

  if (Array.isArray(units)) {
    units.push(unit)
  }
  return unit
}

vi.mock('../../src/units.js', () => ({
  findPath: vi.fn(() => []),
  spawnUnit: vi.fn((...args) => buildMockUnit(...args))
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

vi.mock('../../src/game/pathfinding.js', () => ({
  getCachedPath: vi.fn(() => [])
}))

vi.mock('../../src/game/time.js', () => ({
  getSimulationTime: vi.fn(() => 5000)
}))

import { spawnEnemyUnit } from '../../src/ai/enemySpawner.js'
import { spawnUnit } from '../../src/units.js'
import { findClosestOre } from '../../src/logic.js'
import { assignHarvesterToOptimalRefinery } from '../../src/game/harvesterLogic.js'
import { getCachedPath } from '../../src/game/pathfinding.js'

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
    spawnUnitIdCounter = 0
    globalThis.window = globalThis.window || {}
    delete globalThis.window.cheatSystem
  })

  afterEach(() => {
    delete globalThis.window.cheatSystem
  })

  it('passes arguments to spawnUnit and sets owner and AI properties', () => {
    const mapGrid = createMapGrid()
    const spawnBuilding = { x: 4, y: 4, width: 2, height: 2 }
    const units = []

    const unit = spawnEnemyUnit(
      spawnBuilding,
      'tank-v2',
      units,
      mapGrid,
      { occupancyMap: [], targetedOreTiles: {} },
      1000,
      'ai1'
    )

    expect(spawnUnit).toHaveBeenCalledTimes(1)
    const [
      calledSpawnBuilding,
      calledUnitType,
      calledUnits,
      calledMapGrid,
      calledTarget,
      calledOccupancyMap,
      calledOptions
    ] = vi.mocked(spawnUnit).mock.calls[0]
    expect(calledSpawnBuilding).toBe(spawnBuilding)
    expect(calledUnitType).toBe('tank-v2')
    expect(calledUnits).toBe(units)
    expect(calledMapGrid).toBe(mapGrid)
    expect(calledTarget).toBeNull()
    expect(calledOccupancyMap).toEqual([])
    expect(calledOptions).toEqual({})
    expect(unit).toBeDefined()
    expect(unit.owner).toBe('ai1')
    expect(unit.spawnedInFactory).toBe(true)
    expect(unit.holdInFactory).toBe(true)
    expect(unit.factoryBuildEndTime).toBe(6000)
    expect(unit.allowedToAttack).toBe(true)
  })

  it('returns null when spawnUnit returns null', () => {
    const mapGrid = createMapGrid(6, 6)
    const spawnBuilding = { x: 1, y: 1, width: 2, height: 2 }

    vi.mocked(spawnUnit).mockReturnValueOnce(null)

    const unit = spawnEnemyUnit(
      spawnBuilding,
      'tank-v2',
      [],
      mapGrid,
      { occupancyMap: [], targetedOreTiles: {} },
      1000,
      'ai1'
    )

    expect(unit).toBeNull()
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
    vi.mocked(getCachedPath).mockReturnValue([
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
    expect(getCachedPath).toHaveBeenCalledWith(
      { x: unit.tileX, y: unit.tileY, owner: unit.owner },
      { x: 4, y: 5 },
      mapGrid,
      null,
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

  it('preserves the unit id returned by spawnUnit', () => {
    const mapGrid = createMapGrid()
    const spawnBuilding = { x: 1, y: 1, width: 2, height: 2 }

    const unit = spawnEnemyUnit(
      spawnBuilding,
      'tank-v2',
      [],
      mapGrid,
      { occupancyMap: [], targetedOreTiles: {} },
      1000,
      'ai1'
    )

    // spawnUnit mock assigns sequential ids like unit-1, unit-2, ...
    expect(unit.id).toMatch(/^unit-\d+$/)
  })
})
