import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import '../setup.js'

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: (fn) => fn
}))

vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    oreRefinery: { cost: 2000, width: 3, height: 3, power: -30 },
    powerPlant: { cost: 500, width: 2, height: 2, power: 100 },
    vehicleFactory: { cost: 1500, width: 3, height: 3, power: -40 },
    turretGunV1: { cost: 1000, width: 1, height: 1, power: -5 },
    constructionYard: { cost: 3000, width: 3, height: 3, power: 50 },
    helipad: { cost: 1200, width: 2, height: 2, power: -15 },
    hospital: { cost: 800, width: 2, height: 2, power: -10 },
    gasStation: { cost: 600, width: 2, height: 2, power: -5 }
  },
  createBuilding: vi.fn((type, x, y) => ({ type, x, y, health: 100 })),
  canPlaceBuilding: vi.fn(),
  placeBuilding: vi.fn(),
  updatePowerSupply: vi.fn()
}))

vi.mock('../../src/ai/enemySpawner.js', () => ({
  spawnEnemyUnit: vi.fn()
}))

vi.mock('../../src/ai/enemyStrategies.js', () => ({
  resetAttackDirections: vi.fn(),
  manageAICrewHealing: vi.fn(),
  manageAITankerTrucks: vi.fn(),
  manageAIRecoveryTanks: vi.fn(),
  manageAIAmmunitionTrucks: vi.fn(),
  manageAIAmmunitionMonitoring: vi.fn(),
  manageAIRepairs: vi.fn()
}))

vi.mock('../../src/utils.js', () => ({
  getUnitCost: vi.fn()
}))

vi.mock('../../src/ai/enemyUnitBehavior.js', () => ({
  updateAIUnit: vi.fn()
}))

vi.mock('../../src/ai/enemyBuilding.js', () => ({
  findBuildingPosition: vi.fn()
}))

vi.mock('../../src/game/dangerZoneMap.js', () => ({
  updateDangerZoneMaps: vi.fn()
}))

vi.mock('../../src/game/harvesterLogic.js', () => ({
  handleStuckHarvester: vi.fn()
}))

vi.mock('../../src/config.js', async(importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    RECOVERY_TANK_RATIO: 3,
    UNIT_COSTS: { harvester: 1500 },
    MASTER_VOLUME: 0.25
  }
})

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1',
    remoteControl: {
      forward: 0,
      backward: 0,
      turnLeft: 0,
      turnRight: 0,
      turretLeft: 0,
      turretRight: 0,
      fire: 0,
      ascend: 0,
      descend: 0,
      strafeLeft: 0,
      strafeRight: 0
    },
    remoteControlSources: {},
    remoteControlAbsolute: {
      wagonDirection: null,
      wagonSpeed: 0,
      turretDirection: null,
      turretTurnFactor: 0
    },
    remoteControlAbsoluteSources: {}
  }
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn()
}))

import {
  buildingData,
  createBuilding,
  canPlaceBuilding,
  placeBuilding,
  updatePowerSupply
} from '../../src/buildings.js'
import {
  manageAICrewHealing,
  manageAITankerTrucks,
  manageAIRecoveryTanks,
  manageAIAmmunitionTrucks,
  manageAIAmmunitionMonitoring,
  manageAIRepairs
} from '../../src/ai/enemyStrategies.js'
import { updateAIUnit } from '../../src/ai/enemyUnitBehavior.js'
import { updateDangerZoneMaps } from '../../src/game/dangerZoneMap.js'
import { getUnitCost } from '../../src/utils.js'
import { gameRandom } from '../../src/utils/gameRandom.js'
import { findBuildingPosition } from '../../src/ai/enemyBuilding.js'
import { handleStuckHarvester } from '../../src/game/harvesterLogic.js'

const createMapGrid = (width, height) =>
  Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: 'land' }))
  )

let updateAIPlayer

beforeAll(async() => {
  ;({ updateAIPlayer } = await import('../../src/ai/enemyAIPlayer.js'))
})

beforeEach(() => {
  vi.clearAllMocks()
  getUnitCost.mockImplementation((type) => {
    const costs = {
      harvester: 200,
      apache: 500,
      tankerTruck: 200,
      ammunitionTruck: 200,
      ambulance: 200,
      tank_v1: 300,
      'tank-v2': 500,
      'tank-v3': 800,
      rocketTank: 700,
      recoveryTank: 400,
      f22Raptor: 600,
      f35: 300
    }
    return costs[type] ?? 0
  })
  gameRandom.mockReturnValue(0.5)
})

describe('enemyAIPlayer updateAIPlayer', () => {
  it('sells non-protected buildings to recover refinery funds', () => {
    const aiPlayerId = 'ai1'
    const aiFactory = {
      id: aiPlayerId,
      owner: aiPlayerId,
      health: 100,
      budget: 100
    }
    const constructionYard = {
      type: 'constructionYard',
      owner: aiPlayerId,
      health: 100,
      isBeingSold: false
    }
    const turretGun = {
      type: 'turretGunV1',
      owner: aiPlayerId,
      health: 100,
      isBeingSold: false
    }
    const gameState = {
      buildings: [constructionYard, turretGun],
      enemyPowerSupply: 0,
      enemyBuildSpeedModifier: 1,
      speedMultiplier: 1
    }

    updateAIPlayer(
      aiPlayerId,
      [],
      [aiFactory],
      [],
      createMapGrid(5, 5),
      gameState,
      null,
      0,
      []
    )

    expect(turretGun.isBeingSold).toBe(true)
    expect(aiFactory.budget).toBe(100 + Math.floor(buildingData.turretGunV1.cost * 0.7))
    expect(constructionYard.isBeingSold).toBe(false)
    expect(manageAIRepairs).toHaveBeenCalled()
  })

  it('places completed buildings and updates power and danger zones', () => {
    const aiPlayerId = 'ai1'
    const aiFactory = {
      id: aiPlayerId,
      owner: aiPlayerId,
      health: 100,
      budget: 0,
      currentlyBuilding: 'powerPlant',
      buildStartTime: 0,
      buildDuration: 100,
      buildingPosition: { x: 1, y: 1 }
    }
    const gameState = {
      buildings: [],
      enemyPowerSupply: 0,
      enemyBuildSpeedModifier: 1,
      speedMultiplier: 1
    }
    canPlaceBuilding.mockReturnValue(true)

    updateAIPlayer(
      aiPlayerId,
      [],
      [aiFactory],
      [],
      createMapGrid(5, 5),
      gameState,
      null,
      200,
      []
    )

    expect(createBuilding).toHaveBeenCalledWith('powerPlant', 1, 1)
    expect(gameState.buildings).toHaveLength(1)
    expect(gameState.buildings[0].owner).toBe(aiPlayerId)
    expect(placeBuilding).toHaveBeenCalled()
    expect(updatePowerSupply).toHaveBeenCalled()
    expect(updateDangerZoneMaps).toHaveBeenCalledWith(gameState)
    expect(aiFactory.currentlyBuilding).toBe(null)
    expect(aiFactory.buildingPosition).toBe(null)
  })

  it('assigns vehicle factories as spawn points for harvester production', () => {
    const aiPlayerId = 'ai1'
    const aiFactory = {
      id: aiPlayerId,
      owner: aiPlayerId,
      health: 100,
      budget: 800
    }
    const vehicleFactory = { type: 'vehicleFactory', owner: aiPlayerId, health: 100 }
    const gameState = {
      buildings: [
        { type: 'powerPlant', owner: aiPlayerId, health: 100 },
        vehicleFactory,
        { type: 'oreRefinery', owner: aiPlayerId, health: 100 }
      ],
      enemyPowerSupply: 0,
      enemyBuildSpeedModifier: 1,
      speedMultiplier: 1
    }

    updateAIPlayer(
      aiPlayerId,
      [],
      [aiFactory],
      [],
      createMapGrid(6, 6),
      gameState,
      null,
      10000,
      []
    )

    expect(aiFactory.currentlyProducingUnit).toBe('harvester')
    expect(aiFactory.unitSpawnBuilding).toBe(vehicleFactory)
    expect(aiFactory.unitBuildStartTime).toBe(10000)
    expect(gameState.nextai1VehicleFactoryIndex).toBe(1)
  })

  it('spawns apache production from helipads when capacity exists', () => {
    const aiPlayerId = 'ai1'
    const aiFactory = {
      id: aiPlayerId,
      owner: aiPlayerId,
      health: 100,
      budget: 2000
    }
    const helipad = { type: 'helipad', owner: aiPlayerId, health: 100 }
    const units = [
      { owner: aiPlayerId, type: 'harvester', health: 100 },
      { owner: aiPlayerId, type: 'harvester', health: 100 },
      { owner: aiPlayerId, type: 'harvester', health: 100 },
      { owner: aiPlayerId, type: 'harvester', health: 100 },
      { owner: aiPlayerId, type: 'tankerTruck', health: 100 },
      { owner: aiPlayerId, type: 'ambulance', health: 100 },
      { owner: aiPlayerId, type: 'tank_v1', health: 100, harvesterHunter: true }
    ]
    const gameState = {
      buildings: [
        { type: 'powerPlant', owner: aiPlayerId, health: 100 },
        { type: 'vehicleFactory', owner: aiPlayerId, health: 100 },
        { type: 'oreRefinery', owner: aiPlayerId, health: 100 },
        { type: 'hospital', owner: aiPlayerId, health: 100 },
        helipad
      ],
      enemyPowerSupply: 0,
      enemyBuildSpeedModifier: 1,
      speedMultiplier: 1
    }

    updateAIPlayer(
      aiPlayerId,
      units,
      [aiFactory],
      [],
      createMapGrid(6, 6),
      gameState,
      null,
      10000,
      []
    )

    expect(aiFactory.currentlyProducingUnit).toBe('apache')
    expect(aiFactory.unitSpawnBuilding).toBe(helipad)
    expect(gameState.nextai1HelipadIndex).toBe(1)
    expect(updateAIUnit).toHaveBeenCalled()
    expect(manageAICrewHealing).toHaveBeenCalled()
    expect(manageAITankerTrucks).toHaveBeenCalled()
    expect(manageAIRecoveryTanks).toHaveBeenCalled()
    expect(manageAIAmmunitionTrucks).toHaveBeenCalled()
    expect(manageAIAmmunitionMonitoring).toHaveBeenCalled()
  })


  it('pairs each planned F22 with an F35 on available airstrips', () => {
    const aiPlayerId = 'ai1'
    const aiFactory = {
      id: aiPlayerId,
      owner: aiPlayerId,
      health: 100,
      budget: 5000
    }
    const airstrip = { type: 'airstrip', owner: aiPlayerId, health: 100 }
    const units = [
      { owner: aiPlayerId, type: 'harvester', health: 100 },
      { owner: aiPlayerId, type: 'harvester', health: 100 },
      { owner: aiPlayerId, type: 'harvester', health: 100 },
      { owner: aiPlayerId, type: 'harvester', health: 100 },
      { owner: aiPlayerId, type: 'tankerTruck', health: 100 },
      { owner: aiPlayerId, type: 'ambulance', health: 100 },
      { owner: aiPlayerId, type: 'tank_v1', health: 100, harvesterHunter: true },
      { owner: aiPlayerId, type: 'f22Raptor', health: 100 }
    ]
    const gameState = {
      buildings: [
        { type: 'powerPlant', owner: aiPlayerId, health: 100 },
        { type: 'vehicleFactory', owner: aiPlayerId, health: 100 },
        { type: 'oreRefinery', owner: aiPlayerId, health: 100 },
        { type: 'hospital', owner: aiPlayerId, health: 100 },
        { type: 'rocketTurret', owner: aiPlayerId, health: 100 },
        { type: 'teslaCoil', owner: aiPlayerId, health: 100 },
        { type: 'artilleryTurret', owner: aiPlayerId, health: 100 },
        airstrip
      ],
      enemyPowerSupply: 0,
      enemyBuildSpeedModifier: 1,
      speedMultiplier: 1
    }

    updateAIPlayer(
      aiPlayerId,
      units,
      [aiFactory],
      [],
      createMapGrid(6, 6),
      gameState,
      null,
      10000,
      []
    )

    expect(aiFactory.currentlyProducingUnit).toBe('f35')
    expect(aiFactory.unitSpawnBuilding).toBe(airstrip)
  })

  it('falls back to simple placement when advanced placement fails', () => {
    const aiPlayerId = 'ai1'
    const aiFactory = {
      id: aiPlayerId,
      owner: aiPlayerId,
      health: 100,
      budget: 2000,
      x: 5,
      y: 5,
      width: 3,
      height: 3
    }
    const playerFactory = {
      id: 'player1',
      owner: 'player1',
      health: 100,
      x: 1,
      y: 1,
      width: 3,
      height: 3
    }
    const mapGrid = createMapGrid(20, 20)
    const gameState = {
      buildings: [],
      enemyPowerSupply: 0,
      enemyBuildSpeedModifier: 1,
      speedMultiplier: 1
    }

    findBuildingPosition.mockReturnValue(null)

    updateAIPlayer(
      aiPlayerId,
      [],
      [aiFactory, playerFactory],
      [],
      mapGrid,
      gameState,
      null,
      7000,
      []
    )

    expect(findBuildingPosition).toHaveBeenCalled()
    expect(aiFactory.currentlyBuilding).toBe('powerPlant')
    expect(aiFactory.buildingPosition).toBeTruthy()
  })

  it('avoids selling the last vehicle factory when recovering economy', () => {
    const aiPlayerId = 'ai1'
    const aiFactory = {
      id: aiPlayerId,
      owner: aiPlayerId,
      health: 100,
      budget: 0
    }
    const vehicleFactory = {
      type: 'vehicleFactory',
      owner: aiPlayerId,
      health: 100,
      isBeingSold: false
    }
    const powerPlantA = {
      type: 'powerPlant',
      owner: aiPlayerId,
      health: 100,
      isBeingSold: false
    }
    const powerPlantB = {
      type: 'powerPlant',
      owner: aiPlayerId,
      health: 100,
      isBeingSold: false
    }
    const gameState = {
      buildings: [vehicleFactory, powerPlantA, powerPlantB],
      enemyPowerSupply: 0,
      enemyBuildSpeedModifier: 1,
      speedMultiplier: 1
    }

    updateAIPlayer(
      aiPlayerId,
      [],
      [aiFactory],
      [],
      createMapGrid(8, 8),
      gameState,
      null,
      0,
      []
    )

    expect(vehicleFactory.isBeingSold).toBe(false)
    expect(powerPlantA.isBeingSold || powerPlantB.isBeingSold).toBe(true)
  })

  it('rescans AI harvester paths every 60s and reassigns stuck ore targets', () => {
    const aiPlayerId = 'ai1'
    const aiFactory = {
      id: aiPlayerId,
      owner: aiPlayerId,
      health: 100,
      budget: 0
    }
    const mapGrid = createMapGrid(12, 12)
    mapGrid[2][2].ore = true

    const stuckHarvester = {
      id: 'h-ai-1',
      owner: aiPlayerId,
      type: 'harvester',
      health: 100,
      x: 64,
      y: 64,
      tileX: 2,
      tileY: 2,
      oreCarried: 0,
      harvesting: false,
      unloadingAtRefinery: false,
      oreField: { x: 2, y: 2 },
      moveTarget: null,
      path: []
    }

    const gameState = {
      buildings: [{ type: 'oreRefinery', owner: aiPlayerId, health: 100, x: 5, y: 5, width: 2, height: 2 }],
      enemyPowerSupply: 0,
      enemyBuildSpeedModifier: 1,
      speedMultiplier: 1,
      targetedOreTiles: { '2,2': stuckHarvester.id }
    }

    updateAIPlayer(
      aiPlayerId,
      [stuckHarvester],
      [aiFactory],
      [],
      mapGrid,
      gameState,
      null,
      1000,
      gameState.targetedOreTiles
    )

    expect(handleStuckHarvester).not.toHaveBeenCalled()

    updateAIPlayer(
      aiPlayerId,
      [stuckHarvester],
      [aiFactory],
      [],
      mapGrid,
      gameState,
      null,
      62050,
      gameState.targetedOreTiles
    )

    updateAIPlayer(
      aiPlayerId,
      [stuckHarvester],
      [aiFactory],
      [],
      mapGrid,
      gameState,
      null,
      123100,
      gameState.targetedOreTiles
    )

    expect(handleStuckHarvester).toHaveBeenCalled()
  })


  it('does not retarget stuck harvesters when they are out of fuel or missing crew', () => {
    const aiPlayerId = 'ai1'
    const aiFactory = {
      id: aiPlayerId,
      owner: aiPlayerId,
      health: 100,
      budget: 0
    }
    const mapGrid = createMapGrid(12, 12)

    const outOfFuelHarvester = {
      id: 'h-fuel',
      owner: aiPlayerId,
      type: 'harvester',
      health: 100,
      x: 64,
      y: 64,
      tileX: 2,
      tileY: 2,
      oreCarried: 0,
      harvesting: false,
      unloadingAtRefinery: false,
      oreField: { x: 2, y: 2 },
      gas: 0,
      maxGas: 100,
      lastEnemyAiHarvesterStuckSample: { x: 64, y: 64, time: 1000 }
    }

    const missingCrewHarvester = {
      id: 'h-crew',
      owner: aiPlayerId,
      type: 'harvester',
      health: 100,
      x: 96,
      y: 96,
      tileX: 3,
      tileY: 3,
      oreCarried: 0,
      harvesting: false,
      unloadingAtRefinery: false,
      oreField: { x: 3, y: 3 },
      crew: { commander: true, driver: false, gunner: true, loader: true },
      lastEnemyAiHarvesterStuckSample: { x: 96, y: 96, time: 1000 }
    }

    const gameState = {
      buildings: [{ type: 'oreRefinery', owner: aiPlayerId, health: 100, x: 5, y: 5, width: 2, height: 2 }],
      enemyPowerSupply: 0,
      enemyBuildSpeedModifier: 1,
      speedMultiplier: 1,
      targetedOreTiles: {
        '2,2': outOfFuelHarvester.id,
        '3,3': missingCrewHarvester.id
      }
    }

    updateAIPlayer(
      aiPlayerId,
      [outOfFuelHarvester, missingCrewHarvester],
      [aiFactory],
      [],
      mapGrid,
      gameState,
      null,
      1000,
      gameState.targetedOreTiles
    )

    updateAIPlayer(
      aiPlayerId,
      [outOfFuelHarvester, missingCrewHarvester],
      [aiFactory],
      [],
      mapGrid,
      gameState,
      null,
      62050,
      gameState.targetedOreTiles
    )

    expect(handleStuckHarvester).not.toHaveBeenCalled()
  })

})
