import { beforeEach, describe, expect, it, vi } from 'vitest'

import '../setup.js'

const findPathMock = vi.fn(() => [{ x: 0, y: 0 }, { x: 1, y: 1 }])
const createFormationOffsetsMock = vi.fn()
const getUnitCommandsHandlerMock = vi.fn()
const assignAmbulanceToHealUnitMock = vi.fn(() => true)
const calculateRepairCostMock = vi.fn(() => 100)
const gameRandomMock = vi.fn(() => 0)

vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  TANK_FIRE_RANGE: 6,
  HOWITZER_FIRE_RANGE: 9,
  HOWITZER_FIREPOWER: 80,
  HOWITZER_FIRE_COOLDOWN: 4000
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1',
    playerCount: 2,
    buildings: [],
    dangerZoneMaps: {},
    occupancyMap: null,
    mapGrid: []
  }
}))

vi.mock('../../src/units.js', () => ({
  findPath: (...args) => findPathMock(...args)
}))

vi.mock('../../src/game/pathfinding.js', () => ({
  createFormationOffsets: (...args) => createFormationOffsetsMock(...args),
  getCachedPath: (...args) => findPathMock(...args)
}))

vi.mock('../../src/inputHandler.js', () => ({
  getUnitCommandsHandler: (...args) => getUnitCommandsHandlerMock(...args)
}))

vi.mock('../../src/game/ambulanceSystem.js', () => ({
  assignAmbulanceToHealUnit: (...args) => assignAmbulanceToHealUnitMock(...args)
}))

vi.mock('../../src/buildings.js', () => ({
  calculateRepairCost: (...args) => calculateRepairCostMock(...args)
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: (...args) => gameRandomMock(...args)
}))

import {
  applyEnemyStrategies,
  assignAttackDirection,
  calculateApproachPosition,
  computeLeastDangerAttackPoint,
  getAttackDirectionStats,
  handleAICrewLossEvent,
  handleHarvesterRetreat,
  handleMultiDirectionalAttack,
  handleRetreatToBase,
  manageAIAmmunitionMonitoring,
  manageAIAmmunitionTrucks,
  manageAICrewHealing,
  manageAIRecoveryTanks,
  manageAIRepairs,
  manageAITankerTrucks,
  resetAttackDirections,
  shouldAIStartAttacking,
  shouldConductGroupAttack,
  shouldHarvesterSeekProtection,
  shouldRetreatLowHealth,
  shouldStopRetreating
} from '../../src/ai/enemyStrategies.js'
import { gameState } from '../../src/gameState.js'

const createMapGrid = (width, height, type = 'land') => (
  Array.from({ length: height }, () => Array.from({ length: width }, () => ({ type })))
)

const createBuilding = (overrides = {}) => ({
  id: overrides.id || 'building-1',
  x: overrides.x ?? 4,
  y: overrides.y ?? 4,
  width: overrides.width ?? 2,
  height: overrides.height ?? 2,
  type: overrides.type ?? 'powerPlant',
  owner: overrides.owner ?? 'enemy',
  health: overrides.health ?? 100,
  maxHealth: overrides.maxHealth ?? 200
})

const createUnit = (overrides = {}) => ({
  id: overrides.id || 'unit-1',
  owner: overrides.owner ?? 'enemy',
  type: overrides.type ?? 'tank',
  health: overrides.health ?? 100,
  maxHealth: overrides.maxHealth ?? 100,
  x: overrides.x ?? 160,
  y: overrides.y ?? 160,
  tileX: overrides.tileX ?? 5,
  tileY: overrides.tileY ?? 5,
  crew: overrides.crew ?? { driver: true, commander: true, loader: true },
  ...overrides
})

beforeEach(() => {
  gameState.humanPlayer = 'player1'
  gameState.playerCount = 2
  gameState.buildings = []
  gameState.dangerZoneMaps = {}
  gameState.occupancyMap = null
  gameState.mapGrid = []
  gameState.buildingsAwaitingRepair = []
  gameState.buildingsUnderRepair = []
  gameState.unitWrecks = []
  gameState.globalAttackPoint = null
  findPathMock.mockClear()
  createFormationOffsetsMock.mockClear()
  getUnitCommandsHandlerMock.mockReset()
  assignAmbulanceToHealUnitMock.mockClear()
  calculateRepairCostMock.mockClear()
  gameRandomMock.mockClear()
})

describe('enemyStrategies manageAIRepairs', () => {
  it('queues critical repairs when budget is low', () => {
    const now = 50000
    const critical = createBuilding({ id: 'b1', type: 'vehicleFactory', health: 80, maxHealth: 200 })
    const nonCritical = createBuilding({ id: 'b2', type: 'barracks', health: 50, maxHealth: 200 })
    gameState.buildings = [critical, nonCritical]

    manageAIRepairs('enemy', { health: 100, budget: 1000 }, gameState, now)

    expect(gameState.buildingsAwaitingRepair).toHaveLength(1)
    expect(gameState.buildingsAwaitingRepair[0].building).toBe(critical)
    expect(gameState.buildingsAwaitingRepair[0].initiatedByAI).toBe(true)
    expect(gameState.buildingsAwaitingRepair[0].lastAttackedTime).toBeLessThanOrEqual(now)
  })

  it('skips buildings already awaiting repair', () => {
    const building = createBuilding({ id: 'b3', type: 'powerPlant', health: 100, maxHealth: 200 })
    gameState.buildings = [building]
    gameState.buildingsAwaitingRepair = [{ building }]

    manageAIRepairs('enemy', { health: 100, budget: 9999 }, gameState, 30000)

    expect(gameState.buildingsAwaitingRepair).toHaveLength(1)
  })

  it('skips repairs when repair cost is invalid', () => {
    const building = createBuilding({ id: 'b4', type: 'powerPlant', health: 120, maxHealth: 200 })
    gameState.buildings = [building]
    calculateRepairCostMock.mockReturnValueOnce(0)

    manageAIRepairs('enemy', { health: 100, budget: 9999 }, gameState, 45000)

    expect(gameState.buildingsAwaitingRepair).toHaveLength(0)
  })
})

describe('enemyStrategies shouldConductGroupAttack', () => {
  it('blocks attacks until AI has core infrastructure', () => {
    const unit = createUnit({ owner: 'enemy' })
    const target = { owner: 'player1', type: 'powerPlant', tileX: 10, tileY: 10, x: 10, y: 10, width: 2, height: 2 }

    expect(shouldConductGroupAttack(unit, [unit], gameState, target)).toBe(false)
  })

  it('allows harvester strikes even with small group', () => {
    gameState.buildings = [
      createBuilding({ owner: 'enemy', type: 'hospital' }),
      createBuilding({ owner: 'enemy', type: 'vehicleFactory' }),
      createBuilding({ owner: 'enemy', type: 'oreRefinery' })
    ]
    const unit = createUnit({ owner: 'enemy' })
    const target = { owner: 'player1', type: 'harvester', tileX: 10, tileY: 10, x: 10, y: 10 }

    expect(shouldConductGroupAttack(unit, [unit], gameState, target)).toBe(true)
  })

  it('requires group size when danger is high', () => {
    gameState.buildings = [
      createBuilding({ owner: 'enemy', type: 'hospital' }),
      createBuilding({ owner: 'enemy', type: 'vehicleFactory' }),
      createBuilding({ owner: 'enemy', type: 'oreRefinery' })
    ]
    gameState.dangerZoneMaps = {
      enemy: Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 999))
    }

    const unit = createUnit({ owner: 'enemy' })
    const target = { owner: 'player1', type: 'powerPlant', tileX: 5, tileY: 5, x: 5, y: 5, width: 2, height: 2 }

    expect(shouldConductGroupAttack(unit, [unit], gameState, target)).toBe(false)
  })

  it('allows attack when unit is in player base', () => {
    gameState.buildings = [
      createBuilding({ owner: 'enemy', type: 'hospital' }),
      createBuilding({ owner: 'enemy', type: 'vehicleFactory' }),
      createBuilding({ owner: 'enemy', type: 'oreRefinery' }),
      createBuilding({ owner: 'player1', type: 'powerPlant', x: 4, y: 4 })
    ]

    const unit = createUnit({ owner: 'enemy', x: 4 * 32, y: 4 * 32 })
    const target = { owner: 'player1', type: 'powerPlant', tileX: 4, tileY: 4, x: 4, y: 4, width: 2, height: 2 }

    expect(shouldConductGroupAttack(unit, [unit], gameState, target)).toBe(true)
  })

  it('allows attacks when already in firing range', () => {
    gameState.buildings = [
      createBuilding({ owner: 'enemy', type: 'hospital' }),
      createBuilding({ owner: 'enemy', type: 'vehicleFactory' }),
      createBuilding({ owner: 'enemy', type: 'oreRefinery' })
    ]

    const unit = createUnit({ owner: 'enemy', type: 'howitzer', x: 8 * 32, y: 8 * 32 })
    const target = {
      owner: 'player1',
      type: 'powerPlant',
      tileX: 8,
      tileY: 8,
      x: 8 * 32,
      y: 8 * 32,
      width: 2,
      height: 2
    }

    expect(shouldConductGroupAttack(unit, [unit], gameState, target)).toBe(true)
  })
})

describe('enemyStrategies retreat behaviors', () => {
  it('identifies low health retreat threshold', () => {
    expect(shouldRetreatLowHealth(createUnit({ health: 20, maxHealth: 100 }))).toBe(true)
    expect(shouldRetreatLowHealth(createUnit({ health: 80, maxHealth: 100 }))).toBe(false)
  })

  it('routes retreating units to base', () => {
    const unit = createUnit({ tileX: 6, tileY: 6 })
    const mapGrid = createMapGrid(12, 12)
    gameState.buildings = [createBuilding({ owner: 'enemy', type: 'turretGunV1', x: 2, y: 2, width: 2, height: 2 })]

    const result = handleRetreatToBase(unit, gameState, mapGrid)

    expect(result).toBe(true)
    expect(unit.isRetreating).toBe(true)
    expect(unit.retreatTarget).toBeTruthy()
    expect(unit.path).toEqual([{ x: 1, y: 1 }])
  })

  it('routes harvester retreat and clears harvest state', () => {
    const harvester = createUnit({ type: 'harvester', tileX: 7, tileY: 7, oreField: { id: 'ore' }, harvesting: true })
    const mapGrid = createMapGrid(12, 12)
    gameState.buildings = [createBuilding({ owner: 'enemy', type: 'turretGunV1', x: 2, y: 2, width: 2, height: 2 })]

    const result = handleHarvesterRetreat(harvester, gameState, mapGrid)

    expect(result).toBe(true)
    expect(harvester.isRetreating).toBe(true)
    expect(harvester.oreField).toBeNull()
    expect(harvester.harvesting).toBe(false)
  })

  it('stops retreating when safe near base', () => {
    const unit = createUnit({ isRetreating: true, health: 60, maxHealth: 100 })
    gameState.buildings = [createBuilding({ owner: 'enemy', x: 5, y: 5 })]

    expect(shouldStopRetreating(unit, gameState)).toBe(true)
  })
})

describe('enemyStrategies harvester protection', () => {
  it('detects nearby threats or recent damage', () => {
    const harvester = createUnit({ type: 'harvester', x: 100, y: 100, lastDamageTime: performance.now() - 5000 })
    const threats = [createUnit({ owner: 'player1', type: 'tank', x: 110, y: 110 })]

    expect(shouldHarvesterSeekProtection(harvester, threats)).toBe(true)
  })

  it('ignores harvesters with no nearby threats', () => {
    const harvester = createUnit({ type: 'harvester', x: 50, y: 50, lastDamageTime: null })
    const threats = [createUnit({ owner: 'player1', type: 'tank', x: 400, y: 400 })]

    expect(shouldHarvesterSeekProtection(harvester, threats)).toBeFalsy()
  })
})

describe('enemyStrategies applyEnemyStrategies', () => {
  it('sends retreating units to workshop when safe', () => {
    const unit = createUnit({
      isRetreating: true,
      needsWorkshopRepair: true,
      health: 60,
      maxHealth: 100,
      tileX: 6,
      tileY: 6
    })
    const workshop = createBuilding({ owner: 'enemy', type: 'vehicleWorkshop', x: 4, y: 4 })
    gameState.buildings = [workshop]
    const mapGrid = createMapGrid(12, 12)

    applyEnemyStrategies(unit, [unit], gameState, mapGrid, 10000)

    expect(unit.returningToWorkshop).toBe(true)
    expect(unit.targetWorkshop).toBe(workshop)
  })
})

describe('enemyStrategies attack coordination', () => {
  it('assigns rotating directions for solo units', () => {
    resetAttackDirections()
    const unit = createUnit({ id: 'solo', owner: 'enemy' })
    gameState.buildings = [createBuilding({ owner: 'player1', type: 'constructionYard', id: 'base' })]

    const direction = assignAttackDirection(unit, [unit], gameState)

    expect(direction.name).toBe('north')
  })

  it('calculates approach positions on valid tiles', () => {
    const mapGrid = createMapGrid(20, 20)
    mapGrid[5][13].type = 'water'
    gameState.buildings = [createBuilding({ owner: 'player1', type: 'turretGunV2', x: 5, y: 5 })]

    const position = calculateApproachPosition(
      createUnit({ type: 'rocketTank' }),
      { tileX: 5, tileY: 5, x: 5, y: 5 },
      { x: 1, y: 0, name: 'east' },
      gameState,
      mapGrid
    )

    expect(position.direction).toBe('east')
    expect(mapGrid[position.y][position.x].type).not.toBe('water')
  })

  it('clears approach positions when reached', () => {
    const unit = createUnit({
      allowedToAttack: true,
      approachPosition: { x: 5, y: 5 },
      approachDirection: 'north',
      tileX: 5,
      tileY: 5
    })
    const mapGrid = createMapGrid(12, 12)

    const result = handleMultiDirectionalAttack(unit, [unit], gameState, mapGrid, 20000)

    expect(result).toBe(false)
    expect(unit.approachPosition).toBeNull()
    expect(unit.approachDirection).toBeNull()
  })

  it('recalculates paths while approaching attack positions', () => {
    const unit = createUnit({
      allowedToAttack: true,
      approachPosition: { x: 8, y: 8 },
      approachDirection: 'north',
      tileX: 2,
      tileY: 2,
      lastAttackPathCalcTime: 0
    })
    const mapGrid = createMapGrid(12, 12)

    const result = handleMultiDirectionalAttack(unit, [unit], gameState, mapGrid, 12000)

    expect(result).toBe(true)
    expect(unit.path).toEqual([{ x: 1, y: 1 }])
    expect(unit.lastAttackPathCalcTime).toBe(12000)
  })

  it('uses global attack points when set', () => {
    const unit = createUnit({ allowedToAttack: true, tileX: 2, tileY: 2 })
    const mapGrid = createMapGrid(12, 12)
    gameState.globalAttackPoint = { x: 8, y: 8 }
    gameState.buildings = [createBuilding({ owner: 'player1', type: 'constructionYard', x: 15, y: 15 })]

    const result = handleMultiDirectionalAttack(unit, [unit], gameState, mapGrid, 40000)

    expect(result).toBe(true)
    expect(unit.approachDirection).toBe('global')
    expect(unit.path).toEqual([{ x: 1, y: 1 }])
  })
})

describe('enemyStrategies attack direction state', () => {
  it('resets attack direction tracking', () => {
    resetAttackDirections()

    const stats = getAttackDirectionStats()

    expect(stats.activeDirections).toBe(0)
    expect(stats.currentRotation).toBe(0)
  })
})

describe('enemyStrategies crew management', () => {
  it('requests ambulance support for missing crew', () => {
    const unit = createUnit({ owner: 'player2', crew: { driver: true, commander: true, loader: false } })
    const ambulance = createUnit({ owner: 'player2', type: 'ambulance', medics: 4 })
    gameState.buildings = [createBuilding({ owner: 'player2', type: 'hospital' })]

    manageAICrewHealing([unit, ambulance], gameState, 5000)

    expect(assignAmbulanceToHealUnitMock).toHaveBeenCalled()
    expect(ambulance.criticalHealing).toBe(true)
  })

  it('refills ambulances at hospitals', () => {
    const unit = createUnit({ owner: 'player2', crew: { driver: true, commander: true, loader: false } })
    const ambulance = createUnit({ owner: 'player2', type: 'ambulance', medics: 2, tileX: 2, tileY: 2 })
    const hospital = createBuilding({ owner: 'player2', type: 'hospital', x: 4, y: 4 })
    const mapGrid = createMapGrid(12, 12)
    gameState.mapGrid = mapGrid
    gameState.buildings = [hospital]

    manageAICrewHealing([unit, ambulance], gameState, 12000)

    expect(ambulance.refillingTarget).toBe(hospital)
    expect(ambulance.moveTarget).toEqual({ x: 5 * 32, y: 7 * 32 })
  })

  it('queues ambulance support when all ambulances are busy', () => {
    const unit = createUnit({ owner: 'player2', id: 'unit-queued', crew: { driver: true, commander: true, loader: false } })
    const ambulance = createUnit({ owner: 'player2', type: 'ambulance', medics: 4 })
    ambulance.healingTarget = { id: 'someone-else' }
    gameState.buildings = [createBuilding({ owner: 'player2', type: 'hospital' })]

    manageAICrewHealing([unit, ambulance], gameState, 20000)

    expect(ambulance.pendingHealQueue).toEqual([
      { unitId: 'unit-queued', requestedAt: expect.any(Number) }
    ])
  })

  it('responds to crew loss events', () => {
    const unit = createUnit({ owner: 'player2', crew: { driver: true, commander: true, loader: false } })
    const ambulance = createUnit({ owner: 'player2', type: 'ambulance', medics: 4 })

    handleAICrewLossEvent(unit, [unit, ambulance], gameState, createMapGrid(12, 12))

    expect(assignAmbulanceToHealUnitMock).toHaveBeenCalled()
  })
})

describe('enemyStrategies recovery and logistics', () => {
  it('assigns recovery tanks to closest wrecks', () => {
    const recoveryTank = createUnit({ id: 'tank-1', type: 'recoveryTank', owner: 'player2', tileX: 2, tileY: 2 })
    const wreck = { id: 'wreck-1', tileX: 3, tileY: 3 }
    gameState.unitWrecks = [wreck]

    getUnitCommandsHandlerMock.mockReturnValue({
      setUtilityQueue: (tank) => {
        tank.recoveryTask = { wreckId: wreck.id }
        return { started: true }
      }
    })

    manageAIRecoveryTanks([recoveryTank], gameState, createMapGrid(12, 12), 20000)

    expect(recoveryTank.lastRecoveryCommandTime).toBe(20000)
    expect(recoveryTank.recoveryTask.wreckId).toBe('wreck-1')
  })

  it('skips recovery commands when handler is unavailable', () => {
    const recoveryTank = createUnit({ id: 'tank-2', type: 'recoveryTank', owner: 'player2', tileX: 2, tileY: 2 })
    getUnitCommandsHandlerMock.mockReturnValue(null)

    manageAIRecoveryTanks([recoveryTank], gameState, createMapGrid(12, 12), 15000)

    expect(recoveryTank.lastRecoveryCommandTime).toBeUndefined()
  })

  it('sends tankers to gas stations when low on fuel', () => {
    const tanker = createUnit({ type: 'tankerTruck', owner: 'player2', tileX: 2, tileY: 2, gas: 5, maxGas: 100 })
    const gasStation = createBuilding({ owner: 'player2', type: 'gasStation', x: 4, y: 4, width: 2, height: 2 })
    gameState.buildings = [gasStation]

    getUnitCommandsHandlerMock.mockReturnValue(null)

    manageAITankerTrucks([tanker], gameState, createMapGrid(12, 12))

    expect(tanker.moveTarget).toEqual({ x: 5, y: 7 })
    expect(tanker.guardTarget).toBeNull()
  })

  it('dispatches tankers to critical units immediately', () => {
    const tanker = createUnit({ type: 'tankerTruck', owner: 'player2', tileX: 2, tileY: 2, gas: 80, maxGas: 100 })
    const criticalUnit = createUnit({ id: 'critical-1', owner: 'player2', type: 'tank', tileX: 4, tileY: 4, gas: 0, maxGas: 100 })
    const unitCommands = {
      cancelCurrentUtilityTask: vi.fn(),
      clearUtilityQueueState: vi.fn(),
      setUtilityQueue: vi.fn()
    }
    getUnitCommandsHandlerMock.mockReturnValue(unitCommands)

    manageAITankerTrucks([tanker, criticalUnit], gameState, createMapGrid(12, 12))

    expect(unitCommands.cancelCurrentUtilityTask).toHaveBeenCalledWith(tanker)
    expect(tanker.emergencyTarget).toBe(criticalUnit)
    expect(tanker.emergencyMode).toBe(true)
    expect(tanker.refuelTarget).toBe(criticalUnit)
  })

  it('routes ammo trucks back to factory when low', () => {
    const truck = createUnit({ type: 'ammunitionTruck', owner: 'player2', tileX: 2, tileY: 2, ammoCargo: 1, maxAmmoCargo: 100 })
    const factory = createBuilding({ owner: 'player2', type: 'ammunitionFactory', x: 4, y: 4, width: 2, height: 2 })
    gameState.buildings = [factory]

    manageAIAmmunitionTrucks([truck], gameState, createMapGrid(12, 12))

    expect(truck.moveTarget).toEqual({ x: 5, y: 7 })
  })

  it('triggers ammo retreats when ammunition is low', () => {
    const unit = createUnit({ owner: 'player2', type: 'tank', tileX: 2, tileY: 2, ammunition: 1, maxAmmunition: 100 })
    const factory = createBuilding({ owner: 'player2', type: 'ammunitionFactory', x: 4, y: 4, width: 2, height: 2 })
    gameState.buildings = [factory]

    manageAIAmmunitionMonitoring([unit], gameState, createMapGrid(12, 12))

    expect(unit.retreatingForAmmo).toBe(true)
    expect(unit.moveTarget).toEqual({ x: 5, y: 7 })
  })

  it('clears retreat state after ammo refills', () => {
    const unit = createUnit({ owner: 'player2', type: 'tank', ammunition: 90, maxAmmunition: 100, retreatingForAmmo: true })

    manageAIAmmunitionMonitoring([unit], gameState, createMapGrid(12, 12))

    expect(unit.retreatingForAmmo).toBe(false)
  })
})

describe('enemyStrategies targeting helpers', () => {
  it('validates AI attack readiness based on buildings', () => {
    gameState.buildings = [
      createBuilding({ owner: 'enemy', type: 'hospital' }),
      createBuilding({ owner: 'enemy', type: 'vehicleFactory' }),
      createBuilding({ owner: 'enemy', type: 'oreRefinery' })
    ]

    expect(shouldAIStartAttacking('enemy', gameState)).toBe(true)
  })

  it('selects least dangerous attack point near player base', () => {
    const map = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 10))
    map[2][2] = 1
    gameState.dangerZoneMaps = { player2: map }
    gameState.buildings = [createBuilding({ owner: 'player1', x: 2, y: 2, width: 1, height: 1, health: 100 })]

    expect(computeLeastDangerAttackPoint(gameState, 'player2')).toEqual({ x: 2, y: 2 })
  })

  it('returns null when danger map data is missing', () => {
    gameState.dangerZoneMaps = {}
    gameState.buildings = [createBuilding({ owner: 'player1' })]

    expect(computeLeastDangerAttackPoint(gameState)).toBeNull()
  })
})
