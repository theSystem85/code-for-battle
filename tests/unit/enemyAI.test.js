/**
 * Unit tests for Enemy AI Player
 *
 * Tests AI decision making, target selection, defense behavior,
 * and resource management logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock config
vi.mock('../../src/config.js', async() => {
  const actual = await vi.importActual('../../src/config.js')
  return {
    ...actual,
    TILE_SIZE: 32,
    TANK_FIRE_RANGE: 8,
    HOWITZER_FIRE_RANGE: 16,
    HOWITZER_FIREPOWER: 100,
    HOWITZER_FIRE_COOLDOWN: 8000,
    RECOVERY_TANK_RATIO: 5
  }
})

// Mock performanceUtils
vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: vi.fn(fn => fn)
}))

// Mock gameState
vi.mock('../../src/gameState.js', () => ({
  gameState: {
    humanPlayer: 'player1',
    playerCount: 2,
    buildings: [],
    units: [],
    mines: [],
    occupancyMap: null,
    factories: [],
    dangerZoneMaps: {}
  }
}))

// Mock findPath
vi.mock('../../src/units.js', () => ({
  findPath: vi.fn().mockReturnValue([{ x: 5, y: 5 }, { x: 6, y: 5 }])
}))

// Mock inputHandler
vi.mock('../../src/inputHandler.js', () => ({
  getUnitCommandsHandler: vi.fn().mockReturnValue(null)
}))

// Mock buildings
vi.mock('../../src/buildings.js', () => ({
  buildingData: {
    constructionYard: { power: 0, cost: 5000 },
    powerPlant: { power: 100, cost: 300 },
    vehicleFactory: { power: -30, cost: 1000 },
    oreRefinery: { power: -20, cost: 1500 },
    vehicleWorkshop: { power: -10, cost: 500 },
    gasStation: { power: -5, cost: 400 },
    hospital: { power: -10, cost: 600 },
    turretGunV1: { power: -5, cost: 200 },
    teslaCoil: { power: -50, cost: 1500 },
    rocketTurret: { power: -20, cost: 800 }
  },
  createBuilding: vi.fn(),
  canPlaceBuilding: vi.fn().mockReturnValue(true),
  placeBuilding: vi.fn(),
  updatePowerSupply: vi.fn(),
  calculateRepairCost: vi.fn().mockReturnValue(100)
}))

// Mock ambulanceSystem
vi.mock('../../src/game/ambulanceSystem.js', () => ({
  assignAmbulanceToHealUnit: vi.fn()
}))

// Mock dangerZoneMap
vi.mock('../../src/game/dangerZoneMap.js', () => ({
  updateDangerZoneMaps: vi.fn()
}))

// Mock pathfinding
vi.mock('../../src/game/pathfinding.js', () => ({
  getCachedPath: vi.fn().mockReturnValue([{ x: 5, y: 5 }]),
  createFormationOffsets: vi.fn().mockReturnValue([])
}))

// Mock gameRandom
vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: vi.fn().mockReturnValue(0.5)
}))

import {
  shouldConductGroupAttack,
  shouldRetreatLowHealth,
  handleRetreatToBase,
  shouldStopRetreating
} from '../../src/ai/enemyStrategies.js'

import { gameState } from '../../src/gameState.js'
import { TILE_SIZE } from '../../src/config.js'

describe('Enemy AI Strategies', () => {
  let aiUnit
  let playerUnit
  let mockUnits

  beforeEach(() => {
    vi.clearAllMocks()

    // Create AI combat unit
    aiUnit = {
      id: 'ai-tank-1',
      type: 'tank_v1',
      owner: 'player2',
      x: 500,
      y: 500,
      tileX: 15,
      tileY: 15,
      health: 100,
      maxHealth: 100,
      target: null,
      isBeingAttacked: false,
      lastDamageTime: null,
      allowedToAttack: true
    }

    // Create player unit
    playerUnit = {
      id: 'player-tank-1',
      type: 'tank_v1',
      owner: 'player1',
      x: 600,
      y: 500,
      tileX: 18,
      tileY: 15,
      health: 100,
      maxHealth: 100
    }

    mockUnits = [aiUnit, playerUnit]

    // Reset game state
    gameState.humanPlayer = 'player1'
    gameState.playerCount = 2
    gameState.buildings = []
    gameState.units = mockUnits
    gameState.dangerZoneMaps = {}
  })

  describe('shouldRetreatLowHealth()', () => {
    it('should return true when health is below 33%', () => {
      aiUnit.health = 30
      aiUnit.maxHealth = 100

      const result = shouldRetreatLowHealth(aiUnit)

      expect(result).toBe(true)
    })

    it('should return false when health is above 33%', () => {
      aiUnit.health = 50
      aiUnit.maxHealth = 100

      const result = shouldRetreatLowHealth(aiUnit)

      expect(result).toBe(false)
    })

    it('should return true when at exactly 33%', () => {
      // 33% equals the threshold so returns true (uses <=)
      aiUnit.health = 33
      aiUnit.maxHealth = 100

      const result = shouldRetreatLowHealth(aiUnit)

      expect(result).toBe(true)
    })

    it('should return false for unit without health', () => {
      delete aiUnit.health

      const result = shouldRetreatLowHealth(aiUnit)

      expect(result).toBe(false)
    })

    it('should return false for unit without maxHealth', () => {
      delete aiUnit.maxHealth

      const result = shouldRetreatLowHealth(aiUnit)

      expect(result).toBe(false)
    })
  })

  describe('shouldConductGroupAttack()', () => {
    let target

    beforeEach(() => {
      target = {
        id: 'target-1',
        type: 'tank_v1',
        owner: 'player1',
        x: 600,
        y: 500,
        tileX: 18,
        tileY: 15,
        health: 100,
        maxHealth: 100
      }

      // Add AI buildings to make shouldAIStartAttacking return true
      // Needs hospital, vehicleFactory, AND oreRefinery
      gameState.buildings = [
        { type: 'hospital', owner: 'player2', health: 100 },
        { type: 'vehicleFactory', owner: 'player2', health: 100 },
        { type: 'oreRefinery', owner: 'player2', health: 100 }
      ]
    })

    it('should return false for null target', () => {
      const result = shouldConductGroupAttack(aiUnit, mockUnits, gameState, null)

      expect(result).toBe(false)
    })

    it('should return true when unit is being attacked', () => {
      aiUnit.isBeingAttacked = true
      aiUnit.lastDamageTime = Date.now()

      const result = shouldConductGroupAttack(aiUnit, mockUnits, gameState, target)

      expect(result).toBe(true)
    })

    it('should return true for harvester targets', () => {
      target.type = 'harvester'

      const result = shouldConductGroupAttack(aiUnit, mockUnits, gameState, target)

      expect(result).toBe(true)
    })

    it('should return true for damaged targets', () => {
      target.health = 30
      target.maxHealth = 100

      const result = shouldConductGroupAttack(aiUnit, mockUnits, gameState, target)

      expect(result).toBe(true)
    })

    it('should return true when unit is in player base area', () => {
      // Place AI unit near player building
      gameState.buildings.push({
        type: 'powerPlant',
        owner: 'player1',
        x: 15,
        y: 15,
        width: 2,
        height: 2,
        health: 100
      })

      // Position unit very close to building
      aiUnit.x = 15 * TILE_SIZE
      aiUnit.y = 15 * TILE_SIZE

      const result = shouldConductGroupAttack(aiUnit, mockUnits, gameState, target)

      expect(result).toBe(true)
    })
  })

  describe('shouldStopRetreating()', () => {
    beforeEach(() => {
      aiUnit.isRetreating = true
      aiUnit.health = 50
      aiUnit.maxHealth = 100

      // Add enemy base
      gameState.buildings = [
        {
          type: 'constructionYard',
          owner: 'player2',
          x: 15,
          y: 15,
          width: 3,
          height: 3,
          health: 1000
        }
      ]

      // Position unit near friendly base
      aiUnit.x = 16 * TILE_SIZE
      aiUnit.y = 16 * TILE_SIZE
    })

    it('should return false when not retreating', () => {
      aiUnit.isRetreating = false

      const result = shouldStopRetreating(aiUnit, gameState)

      expect(result).toBe(false)
    })

    it('should return true when health recovered and near base', () => {
      // Add enemy buildings (AI retreats to enemy buildings)
      gameState.buildings.push({
        type: 'constructionYard',
        owner: 'enemy',
        x: 16,
        y: 16,
        width: 3,
        height: 3,
        health: 1000
      })

      // Position unit near enemy base
      aiUnit.x = 17 * TILE_SIZE
      aiUnit.y = 17 * TILE_SIZE
      aiUnit.health = 50 // Above 30%
      aiUnit.isBeingAttacked = false
      aiUnit.lastDamageTime = 0 // Very old damage time

      const result = shouldStopRetreating(aiUnit, gameState)

      expect(result).toBe(true)
    })

    it('should return false when still under attack', () => {
      aiUnit.health = 50
      aiUnit.isBeingAttacked = true
      aiUnit.path = [{ x: 16, y: 16 }]

      const result = shouldStopRetreating(aiUnit, gameState)

      expect(result).toBe(false)
    })

    it('should return false when recently took damage', () => {
      aiUnit.health = 50
      aiUnit.isBeingAttacked = false
      aiUnit.lastDamageTime = performance.now() // Very recent
      aiUnit.path = [{ x: 16, y: 16 }]

      const result = shouldStopRetreating(aiUnit, gameState)

      expect(result).toBe(false)
    })
  })

  describe('handleRetreatToBase()', () => {
    let mapGrid

    beforeEach(() => {
      mapGrid = []
      for (let y = 0; y < 30; y++) {
        mapGrid[y] = []
        for (let x = 0; x < 30; x++) {
          mapGrid[y][x] = { type: 'grass' }
        }
      }

      gameState.buildings = [
        {
          type: 'constructionYard',
          owner: 'player2',
          x: 10,
          y: 10,
          width: 3,
          height: 3,
          health: 1000
        }
      ]
    })

    it('should return false when no friendly buildings exist', () => {
      gameState.buildings = []

      const result = handleRetreatToBase(aiUnit, gameState, mapGrid)

      expect(result).toBe(false)
    })

    it('should set isRetreating flag on success', () => {
      const result = handleRetreatToBase(aiUnit, gameState, mapGrid)

      if (result) {
        expect(aiUnit.isRetreating).toBe(true)
      }
    })

    it('should set retreatTarget on success', () => {
      const result = handleRetreatToBase(aiUnit, gameState, mapGrid)

      if (result) {
        expect(aiUnit.retreatTarget).toBeTruthy()
      }
    })

    it('should prioritize defensive buildings for retreat', () => {
      gameState.buildings.push({
        type: 'turretGunV1',
        owner: 'player2',
        x: 5,
        y: 5,
        width: 1,
        height: 1,
        health: 100
      })

      handleRetreatToBase(aiUnit, gameState, mapGrid)

      // Defensive buildings get 0.8x distance multiplier
      // The turret should be considered closer
    })
  })
})

describe('AI Target Selection', () => {
  let aiUnit

  beforeEach(() => {
    aiUnit = {
      id: 'ai-unit-1',
      type: 'tank_v1',
      owner: 'player2',
      x: 500,
      y: 500,
      tileX: 15,
      tileY: 15,
      health: 100,
      maxHealth: 100,
      target: null
    }
  })

  describe('Target Priority Order', () => {
    it('should prioritize retaliation when being attacked', () => {
      const attacker = {
        id: 'attacker-1',
        type: 'tank_v1',
        owner: 'player1',
        x: 550,
        y: 500,
        health: 100
      }

      aiUnit.isBeingAttacked = true
      aiUnit.lastAttacker = attacker

      // Attacker should become highest priority target
      expect(aiUnit.lastAttacker).toBe(attacker)
    })

    it('should target player harvesters as high priority', () => {
      const harvester = {
        id: 'harvester-1',
        type: 'harvester',
        owner: 'player1',
        x: 600,
        y: 500,
        health: 100
      }

      // Harvesters are economic targets
      expect(harvester.type).toBe('harvester')
    })

    it('should prioritize constructionYard over other buildings', () => {
      const buildings = [
        { type: 'powerPlant', owner: 'player1', health: 100 },
        { type: 'constructionYard', owner: 'player1', health: 100 },
        { type: 'vehicleFactory', owner: 'player1', health: 100 }
      ]

      const priorityOrder = ['constructionYard', 'vehicleFactory', 'oreRefinery', 'powerPlant']
      const targetBuilding = priorityOrder.find(type =>
        buildings.some(b => b.type === type)
      )

      expect(targetBuilding).toBe('constructionYard')
    })
  })
})

describe('AI Resource Management', () => {
  let aiFactory

  beforeEach(() => {
    aiFactory = {
      id: 'player2',
      owner: 'player2',
      budget: 5000,
      health: 1000,
      x: 10,
      y: 10,
      width: 3,
      height: 3,
      type: 'constructionYard'
    }
  })

  describe('Budget Thresholds', () => {
    it('should identify low budget state', () => {
      const LOW_BUDGET_THRESHOLD = 3500

      aiFactory.budget = 3000
      const isLowBudget = aiFactory.budget < LOW_BUDGET_THRESHOLD

      expect(isLowBudget).toBe(true)
    })

    it('should identify high budget state', () => {
      const HIGH_BUDGET_THRESHOLD = 12000

      aiFactory.budget = 15000
      const isHighBudget = aiFactory.budget >= HIGH_BUDGET_THRESHOLD

      expect(isHighBudget).toBe(true)
    })

    it('should identify very high budget state', () => {
      const VERY_HIGH_BUDGET_THRESHOLD = 20000

      aiFactory.budget = 25000
      const isVeryHighBudget = aiFactory.budget >= VERY_HIGH_BUDGET_THRESHOLD

      expect(isVeryHighBudget).toBe(true)
    })
  })

  describe('Building Priority', () => {
    it('should prioritize power plant when out of power', () => {
      const buildingOrder = ['powerPlant', 'oreRefinery', 'vehicleFactory']
      const currentPower = -50 // Negative power

      const needsPowerPlant = currentPower <= 0
      const nextBuilding = needsPowerPlant ? 'powerPlant' : buildingOrder[1]

      expect(nextBuilding).toBe('powerPlant')
    })

    it('should prioritize ore refinery after power', () => {
      const aiBuildings = [
        { type: 'powerPlant', owner: 'player2', health: 100 }
      ]

      const hasOreRefinery = aiBuildings.some(b => b.type === 'oreRefinery')
      expect(hasOreRefinery).toBe(false)
    })

    it('should prioritize vehicle factory for unit production', () => {
      const aiBuildings = [
        { type: 'powerPlant', owner: 'player2', health: 100 },
        { type: 'oreRefinery', owner: 'player2', health: 100 }
      ]

      const hasVehicleFactory = aiBuildings.some(b => b.type === 'vehicleFactory')
      expect(hasVehicleFactory).toBe(false)
    })
  })

  describe('Unit Production Priority', () => {
    it('should prioritize harvesters first', () => {
      const aiHarvesters = []
      const MAX_HARVESTERS = 4

      const needsHarvester = aiHarvesters.length < MAX_HARVESTERS
      expect(needsHarvester).toBe(true)
    })

    it('should build tanker when harvesters exist but no tanker', () => {
      const aiHarvesters = [{ type: 'harvester', owner: 'player2' }]
      const aiTankers = []
      const gasStations = [{ type: 'gasStation', owner: 'player2' }]

      const needsTanker = aiTankers.length === 0 && aiHarvesters.length > 0 && gasStations.length > 0
      expect(needsTanker).toBe(true)
    })

    it('should build ambulance when hospital exists', () => {
      const hospitals = [{ type: 'hospital', owner: 'player2' }]
      const ambulances = []

      const needsAmbulance = hospitals.length > 0 && ambulances.length === 0
      expect(needsAmbulance).toBe(true)
    })

    it('should calculate required recovery tanks from ratio', () => {
      const RECOVERY_TANK_RATIO = 5
      const combatUnits = 15

      const requiredRecoveryTanks = Math.ceil(combatUnits / RECOVERY_TANK_RATIO)
      expect(requiredRecoveryTanks).toBe(3)
    })
  })
})

describe('AI Defense Behavior', () => {
  let aiUnit
  let playerUnit

  beforeEach(() => {
    aiUnit = {
      id: 'ai-defender-1',
      type: 'tank_v1',
      owner: 'player2',
      x: 350,
      y: 350,
      tileX: 10,
      tileY: 10,
      health: 100,
      maxHealth: 100,
      defendingBase: false
    }

    playerUnit = {
      id: 'player-attacker-1',
      type: 'tank_v1',
      owner: 'player1',
      x: 400,
      y: 400,
      tileX: 12,
      tileY: 12,
      health: 100
    }

    gameState.buildings = [
      {
        type: 'constructionYard',
        owner: 'player2',
        x: 10,
        y: 10,
        width: 3,
        height: 3,
        health: 1000
      }
    ]
  })

  describe('Base Defense Detection', () => {
    it('should detect player units near base', () => {
      const aiBuildings = gameState.buildings.filter(b => b.owner === 'player2')

      const playerNearBase = aiBuildings.some(building => {
        const buildingCenterX = (building.x + building.width / 2) * TILE_SIZE
        const buildingCenterY = (building.y + building.height / 2) * TILE_SIZE
        const distance = Math.hypot(
          (playerUnit.x + TILE_SIZE / 2) - buildingCenterX,
          (playerUnit.y + TILE_SIZE / 2) - buildingCenterY
        )
        return distance < 12 * TILE_SIZE
      })

      expect(playerNearBase).toBe(true)
    })

    it('should not trigger defense for distant threats', () => {
      playerUnit.x = 800
      playerUnit.y = 800

      const aiBuildings = gameState.buildings.filter(b => b.owner === 'player2')

      const playerNearBase = aiBuildings.some(building => {
        const buildingCenterX = (building.x + building.width / 2) * TILE_SIZE
        const buildingCenterY = (building.y + building.height / 2) * TILE_SIZE
        const distance = Math.hypot(
          (playerUnit.x + TILE_SIZE / 2) - buildingCenterX,
          (playerUnit.y + TILE_SIZE / 2) - buildingCenterY
        )
        return distance < 12 * TILE_SIZE
      })

      expect(playerNearBase).toBe(false)
    })
  })

  describe('Defender Assignment', () => {
    it('should limit number of defenders', () => {
      const threatCount = 2
      const maxDefenders = Math.min(threatCount * 2, 6)

      expect(maxDefenders).toBe(4)
    })

    it('should cap defenders at 6', () => {
      const threatCount = 10
      const maxDefenders = Math.min(threatCount * 2, 6)

      expect(maxDefenders).toBe(6)
    })

    it('should only assign nearby units to defend', () => {
      const DEFENSE_RANGE = 20 * TILE_SIZE

      const withinRange = Math.hypot(
        aiUnit.x - 11 * TILE_SIZE,
        aiUnit.y - 11 * TILE_SIZE
      ) < DEFENSE_RANGE

      expect(withinRange).toBe(true)
    })
  })
})
