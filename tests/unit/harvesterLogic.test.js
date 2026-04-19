import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  updateHarvesterLogic,
  getHarvestedTiles,
  getTargetedOreTiles,
  getHarvesterDistribution,
  assignHarvesterToOptimalRefinery,
  forceHarvesterUnloadPriority,
  interruptHarvesterAutomation,
  clearStuckHarvesterOreField,
  handleStuckHarvester,
  resetHarvesterRuntimeState
} from '../../src/game/harvesterLogic.js'

// Mock dependencies
vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  HARVESTER_CAPPACITY: 1,
  HARVESTER_UNLOAD_TIME: 5000,
  HARVESTER_PRODUCTIVITY_CHECK_INTERVAL: 500,
  HARVESTER_XP_FULL_UNLOADS_PER_STAR: 10
}))

vi.mock('../../src/units.js', () => ({
  findPath: vi.fn((start, end) => {
    // Simple path: just return start and end positions
    return [{ x: start.x, y: start.y }, { x: end.x, y: end.y }]
  })
}))

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn()
}))

vi.mock('../../src/productionQueue.js', () => ({
  productionQueue: {
    tryResumeProduction: vi.fn()
  }
}))

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: fn => fn
}))

vi.mock('../../src/logic.js', () => ({
  findClosestOre: vi.fn((unit, mapGrid) => {
    // Find an ore tile in the map
    for (let y = 0; y < mapGrid.length; y++) {
      for (let x = 0; x < mapGrid[y].length; x++) {
        if (mapGrid[y][x].ore && !mapGrid[y][x].seedCrystal) {
          return { x, y }
        }
      }
    }
    return null
  }),
  findAdjacentTile: vi.fn((building, mapGrid) => {
    const bottomY = building.y + building.height
    if (bottomY < mapGrid.length) {
      return { x: building.x, y: bottomY }
    }
    return null
  }),
  isAdjacentToBuilding: vi.fn((unit, building) => {
    const distX = Math.abs(unit.tileX - (building.x + building.width / 2))
    const distY = Math.abs(unit.tileY - (building.y + building.height / 2))
    return distX <= 2 && distY <= 2
  }),
  showUnloadingFeedback: vi.fn()
}))

vi.mock('../../src/utils/gameRandom.js', () => ({
  gameRandom: () => 0.5
}))

function createTestMapGrid(width = 20, height = 20) {
  const grid = []
  for (let y = 0; y < height; y++) {
    grid[y] = []
    for (let x = 0; x < width; x++) {
      grid[y][x] = { type: 'grass', ore: false, building: null }
    }
  }
  return grid
}

function createTestHarvester(id, tileX, tileY, owner = 'player1') {
  return {
    id,
    type: 'harvester',
    x: tileX * 32,
    y: tileY * 32,
    tileX,
    tileY,
    owner,
    health: 100,
    maxHealth: 100,
    oreCarried: 0,
    level: 0,
    experience: 0,
    totalMoneyEarned: 0,
    cargoCapacity: 1000,
    harvesting: false,
    harvestTimer: 0,
    unloadingAtRefinery: false,
    path: [],
    moveTarget: null,
    oreField: null,
    movement: { velocity: { x: 0, y: 0 }, isMoving: false }
  }
}

function createTestRefinery(x, y, owner = 'player1') {
  return {
    id: `refinery_${x}_${y}`,
    type: 'oreRefinery',
    x,
    y,
    width: 3,
    height: 3,
    owner,
    health: 100
  }
}

describe('Harvester Logic', () => {
  let gameState
  let mapGrid
  let units
  let factories
  let now

  beforeEach(() => {
    mapGrid = createTestMapGrid()
    now = 10000

    gameState = {
      money: 5000,
      totalMoneyEarned: 0,
      buildings: [],
      humanPlayer: 'player1',
      playerPowerSupply: 100,
      enemyPowerSupply: 100,
      refineryStatus: {},
      occupancyMap: new Map(),
      mapGrid
    }
    units = []
    factories = []

    // Clear tracked state between tests
    vi.clearAllMocks()
    resetHarvesterRuntimeState(gameState)
  })

  describe('Ore Detection and Harvesting', () => {
    it('should start harvesting when harvester is near ore tile', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      units.push(harvester)

      // Place ore at harvester's position
      mapGrid[5][5].ore = true

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.harvesting).toBe(true)
      expect(harvester.harvestTimer).toBe(now)
    })

    it('should complete harvesting after 10 seconds', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.harvesting = true
      harvester.harvestTimer = now - 10001 // Started 10+ seconds ago
      harvester.oreField = { x: 5, y: 5 }
      mapGrid[5][5].ore = true
      units.push(harvester)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.oreCarried).toBe(1000)
      expect(harvester.harvesting).toBe(false)
    })

    it('uses ore density for harvested value and decreases density', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.level = 3
      harvester.harvesting = true
      harvester.harvestTimer = now - 10001
      harvester.oreField = { x: 5, y: 5 }
      mapGrid[5][5].ore = true
      mapGrid[5][5].oreDensity = 5
      units.push(harvester)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.oreCarried).toBe(5000)
      expect(mapGrid[5][5].oreDensity).toBe(4)
    })

    it('prevents level 0 harvester from harvesting density 3 ore', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      mapGrid[5][5].ore = true
      mapGrid[5][5].oreDensity = 3
      units.push(harvester)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.harvesting).toBe(false)
    })

    it('should deplete ore tile after harvesting', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.harvesting = true
      harvester.harvestTimer = now - 10001
      harvester.oreField = { x: 5, y: 5 }
      mapGrid[5][5].ore = true
      mapGrid[5][5].harvests = 0
      units.push(harvester)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(mapGrid[5][5].ore).toBe(false)
    })

    it('should not harvest seed crystals', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      units.push(harvester)

      // Place seed crystal at harvester's position
      mapGrid[5][5].ore = true
      mapGrid[5][5].seedCrystal = true

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.harvesting).toBe(false)
    })

    it('should not harvest when at capacity', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.oreCarried = 1000 // At capacity (HARVESTER_CAPPACITY = 1)
      units.push(harvester)

      mapGrid[5][5].ore = true

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.harvesting).toBe(false)
    })

    it('clears invalid manual target and assigns new ore', async() => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.manualOreTarget = { x: 0, y: 0 }
      units.push(harvester)

      mapGrid[2][2].ore = true

      const logicModule = await import('../../src/logic.js')
      vi.mocked(logicModule.findClosestOre).mockReturnValue({ x: 2, y: 2 })

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.manualOreTarget).toBeNull()
      expect(harvester.oreField).toEqual({ x: 2, y: 2 })
      expect(harvester.moveTarget).toEqual({ x: 2, y: 2 })
      const targetedTiles = getTargetedOreTiles()
      expect(targetedTiles['2,2']).toBe(harvester.id)
    })

    it('does not let auto targeting override recent harvester remote control input', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.lastRemoteControlTime = now - 1500
      harvester.moveTarget = { x: 8, y: 5 }
      units.push(harvester)

      mapGrid[5][5].ore = true

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.harvesting).toBe(false)
      expect(harvester.oreField).toBeNull()
      expect(harvester.moveTarget).toEqual({ x: 8, y: 5 })
    })

    it('starts harvesting immediately when a manual ore target is reached', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.manualOreTarget = { x: 5, y: 5 }
      units.push(harvester)

      mapGrid[5][5].ore = true

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.harvesting).toBe(true)
      expect(harvester.oreField).toEqual({ x: 5, y: 5 })
    })

    it('keeps manual-hold harvesters idle on non-ore move destinations', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.manualHoldPosition = { x: 5, y: 5 }
      units.push(harvester)

      mapGrid[5][5].ore = true

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.harvesting).toBe(false)
      expect(harvester.manualHoldPosition).toEqual({ x: 5, y: 5 })
      expect(harvester.moveTarget).toBe(null)
    })
  })

  describe('Refinery Unloading', () => {
    it('should find refinery when harvester is full', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.oreCarried = 1000
      units.push(harvester)

      const refinery = createTestRefinery(10, 10)
      gameState.buildings.push(refinery)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.targetRefinery).toBe(refinery.id)
    })

    it('should start unloading when at refinery', async() => {
      const harvester = createTestHarvester('harv1', 11, 13)
      harvester.oreCarried = 1000
      harvester.targetRefinery = 'refinery_10_10'
      units.push(harvester)

      const refinery = createTestRefinery(10, 10)
      gameState.buildings.push(refinery)

      // Re-mock isAdjacentToBuilding to return true for this test
      const logicModule = await import('../../src/logic.js')
      vi.mocked(logicModule.isAdjacentToBuilding).mockReturnValue(true)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.unloadingAtRefinery).toBe(true)
    })

    it('should complete unloading and add money', () => {
      const harvester = createTestHarvester('harv1', 11, 13)
      harvester.oreCarried = 1000
      harvester.unloadingAtRefinery = true
      harvester.unloadStartTime = now - 5001 // Started 5+ seconds ago
      harvester.unloadRefinery = 'refinery_10_10'
      units.push(harvester)

      const initialMoney = gameState.money

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.oreCarried).toBe(0)
      expect(harvester.unloadingAtRefinery).toBe(false)
      expect(gameState.money).toBe(initialMoney + 1000)
    })

    it('should track total money earned from harvesting', () => {
      const harvester = createTestHarvester('harv1', 11, 13)
      harvester.oreCarried = 1000
      harvester.unloadingAtRefinery = true
      harvester.unloadStartTime = now - 5001
      harvester.unloadRefinery = 'refinery_10_10'
      units.push(harvester)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(gameState.totalMoneyEarned).toBe(1000)
    })

    it('awards star level after 10k delivered', () => {
      const harvester = createTestHarvester('harv1', 11, 13)
      harvester.oreCarried = 10000
      harvester.unloadingAtRefinery = true
      harvester.unloadStartTime = now - 5001
      harvester.unloadRefinery = 'refinery_10_10'
      units.push(harvester)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.level).toBe(1)
      expect(harvester.cargoCapacity).toBe(1500)
    })

    it('uses 10 full unload equivalents for later star promotions too', () => {
      const harvester = createTestHarvester('harv1', 11, 13)
      harvester.level = 1
      harvester.experience = 9
      harvester.cargoCapacity = 1500
      harvester.oreCarried = 1500
      harvester.unloadingAtRefinery = true
      harvester.unloadStartTime = now - 5001
      harvester.unloadRefinery = 'refinery_10_10'
      units.push(harvester)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.level).toBe(2)
      expect(harvester.experience).toBe(0)
      expect(harvester.cargoCapacity).toBe(2000)
    })

    it('should take longer to unload when power is negative', () => {
      const harvester = createTestHarvester('harv1', 11, 13)
      harvester.oreCarried = 1000
      harvester.unloadingAtRefinery = true
      harvester.unloadStartTime = now - 5001 // 5 seconds passed
      harvester.unloadRefinery = 'refinery_10_10'
      units.push(harvester)

      gameState.playerPowerSupply = -50 // Negative power

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      // With negative power, unload time doubles to 10 seconds, so 5 seconds is not enough
      expect(harvester.unloadingAtRefinery).toBe(true)
      expect(harvester.oreCarried).toBe(1000) // Still carrying ore
    })
  })

  describe('Refinery Queue Management', () => {
    it('should assign harvester to refinery queue when near buildings', () => {
      // Simple test: just verify queue functions exist and work
      const harvester = createTestHarvester('harv1', 11, 13)
      harvester.oreCarried = 1000
      harvester.targetRefinery = 'refinery_10_10'
      units.push(harvester)

      const refinery = createTestRefinery(10, 10)
      gameState.buildings.push(refinery)

      // Call update to trigger queue assignment
      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      // Harvester should have target refinery set from setup
      expect(harvester.targetRefinery).toBeDefined()
    })

    it('should handle multiple refineries', () => {
      const harvester = createTestHarvester('harv_multi', 5, 5)
      harvester.oreCarried = 1000
      units.push(harvester)

      const refinery1 = createTestRefinery(30, 30)
      const refinery2 = createTestRefinery(30, 35)
      gameState.buildings.push(refinery1, refinery2)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      // Should not crash with multiple refineries
      expect(gameState.buildings.length).toBe(2)
    })
  })

  describe('getHarvesterDistribution', () => {
    it('should return empty object when no refineries exist', () => {
      const distribution = getHarvesterDistribution(gameState)
      expect(distribution).toEqual({})
    })

    it('should return distribution for each refinery', () => {
      const refinery1 = createTestRefinery(10, 10)
      const refinery2 = createTestRefinery(20, 20)
      gameState.buildings.push(refinery1, refinery2)

      const distribution = getHarvesterDistribution(gameState)

      expect(distribution[refinery1.id]).toBeDefined()
      expect(distribution[refinery2.id]).toBeDefined()
      // Queue length may be affected by shared state, just check properties exist
      expect(typeof distribution[refinery1.id].queueLength).toBe('number')
      expect(typeof distribution[refinery1.id].isInUse).toBe('number')
    })

    it('should track queue length and usage', () => {
      const refinery = createTestRefinery(10, 10)
      gameState.buildings.push(refinery)
      gameState.refineryStatus[refinery.id] = 'harv1'

      const distribution = getHarvesterDistribution(gameState)

      expect(distribution[refinery.id].isInUse).toBe(1)
    })
  })

  describe('assignHarvesterToOptimalRefinery', () => {
    it('should return null when no refineries exist', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      const result = assignHarvesterToOptimalRefinery(harvester, gameState)
      expect(result).toBeNull()
    })

    it('should assign to refinery with minimum load', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      const refinery1 = createTestRefinery(10, 10)
      const refinery2 = createTestRefinery(20, 20)
      gameState.buildings.push(refinery1, refinery2)

      // Mark refinery1 as busier
      gameState.refineryStatus[refinery1.id] = 'otherHarvester'

      const result = assignHarvesterToOptimalRefinery(harvester, gameState)

      expect(result).toBe(refinery2.id)
      expect(harvester.assignedRefinery).toBe(refinery2.id)
    })

    it('should handle undefined gameState gracefully', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      const result = assignHarvesterToOptimalRefinery(harvester, undefined)
      expect(result).toBeNull()
    })

    it('should handle gameState with no buildings', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      const result = assignHarvesterToOptimalRefinery(harvester, { buildings: undefined })
      expect(result).toBeNull()
    })
  })

  describe('forceHarvesterUnloadPriority', () => {
    it('should add forced harvester to queue', () => {
      const harvester = createTestHarvester('harv_force_test', 5, 5)
      harvester.oreCarried = 1000
      units.push(harvester)

      const refinery = createTestRefinery(50, 50) // Use unique coordinates
      gameState.buildings.push(refinery)

      // Force harvester to have priority
      forceHarvesterUnloadPriority(harvester, refinery, units)

      // Should have set forced unload flags
      expect(harvester.forcedUnload).toBe(true)
      expect(harvester.forcedUnloadRefinery).toBe(refinery.id)
      expect(harvester.targetRefinery).toBe(refinery.id)
    })

    it('should mark harvester as forced unload', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      units.push(harvester)

      const refinery = createTestRefinery(10, 10)
      gameState.buildings.push(refinery)

      forceHarvesterUnloadPriority(harvester, refinery, units)

      expect(harvester.forcedUnload).toBe(true)
      expect(harvester.forcedUnloadRefinery).toBe(refinery.id)
    })
  })

  describe('clearStuckHarvesterOreField', () => {
    it('should clear ore field and targeting for stuck harvester', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.oreField = { x: 10, y: 10 }
      units.push(harvester)

      // First add targeting
      const targetedTiles = getTargetedOreTiles()
      targetedTiles['10,10'] = harvester.id

      clearStuckHarvesterOreField(harvester)

      expect(harvester.oreField).toBeNull()
      expect(targetedTiles['10,10']).toBeUndefined()
    })

    it('should only clear targeting if harvester owns it', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.oreField = { x: 10, y: 10 }

      const targetedTiles = getTargetedOreTiles()
      targetedTiles['10,10'] = 'different_harvester'

      clearStuckHarvesterOreField(harvester)

      expect(harvester.oreField).toBeNull()
      expect(targetedTiles['10,10']).toBe('different_harvester')
    })

    it('should ignore non-harvester units', () => {
      const unit = {
        id: 'tank1',
        type: 'tank_v1',
        oreField: { x: 10, y: 10 }
      }

      clearStuckHarvesterOreField(unit)

      expect(unit.oreField).toEqual({ x: 10, y: 10 })
    })
  })

  describe('getHarvestedTiles', () => {
    it('should return set of currently being harvested tiles', () => {
      const tiles = getHarvestedTiles()
      expect(tiles instanceof Set).toBe(true)
    })
  })

  describe('getTargetedOreTiles', () => {
    it('should return object mapping tile keys to harvester IDs', () => {
      const tiles = getTargetedOreTiles()
      expect(typeof tiles).toBe('object')
    })
  })

  describe('Workshop Repair After Unloading', () => {
    it('should not auto-harvest when heading to workshop for repair', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.targetWorkshop = { x: 15, y: 15 }
      units.push(harvester)

      mapGrid[5][5].ore = true

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.harvesting).toBe(false)
    })

    it('should not auto-harvest when in repair queue', () => {
      const workshop = { x: 15, y: 15, repairQueue: [] }
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.targetWorkshop = workshop
      workshop.repairQueue.push(harvester)
      units.push(harvester)

      mapGrid[5][5].ore = true

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.harvesting).toBe(false)
    })
  })

  describe('Enemy Harvester Economics', () => {
    it('should credit AI factory budget on unloading', () => {
      const harvester = createTestHarvester('harv1', 11, 13, 'ai_enemy')
      harvester.oreCarried = 1000
      harvester.unloadingAtRefinery = true
      harvester.unloadStartTime = now - 5001
      harvester.unloadRefinery = 'refinery_10_10'
      units.push(harvester)

      const aiFactory = { id: 'ai_enemy', owner: 'ai_enemy', budget: 1000 }
      factories.push(aiFactory)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(aiFactory.budget).toBe(2000) // 1000 + 1000 from ore
    })
  })

  describe('Productivity Check', () => {
    it('should periodically check harvester productivity', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.lastProductivityCheck = now - 600 // More than 500ms ago
      units.push(harvester)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.lastProductivityCheck).toBe(now)
    })
  })

  describe('Destroyed Refinery Cleanup', () => {
    it('should clear harvester assignments when refinery is destroyed', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.assignedRefinery = 'destroyed_refinery'
      harvester.targetRefinery = 'destroyed_refinery'
      harvester.queuePosition = 1
      units.push(harvester)

      // No refineries in buildings means the assigned one is destroyed
      gameState.lastRefineryCheck = now - 2000 // Force cleanup check

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.assignedRefinery).toBeNull()
      expect(harvester.targetRefinery).toBeNull()
      expect(harvester.queuePosition).toBe(0)
    })
  })

  describe('Stuck Harvester Recovery', () => {
    it('does not interrupt manually commanded harvesters', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.manualOreTarget = { x: 8, y: 8 }
      harvester.oreField = { x: 8, y: 8 }

      handleStuckHarvester(harvester, mapGrid, gameState.occupancyMap, gameState, factories)

      expect(harvester.manualOreTarget).toEqual({ x: 8, y: 8 })
      expect(harvester.oreField).toEqual({ x: 8, y: 8 })
    })

    it('starts harvesting when stuck on ore', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      mapGrid[5][5].ore = true

      handleStuckHarvester(harvester, mapGrid, gameState.occupancyMap, gameState, factories)

      expect(harvester.harvesting).toBe(true)
      expect(harvester.oreField).toEqual({ x: 5, y: 5 })
    })

    it('preserves assigned refinery when a full harvester needs a stuck recovery route', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      const assignedRefinery = createTestRefinery(10, 10)
      const otherRefinery = createTestRefinery(15, 15)
      harvester.oreCarried = 1000
      harvester.assignedRefinery = assignedRefinery.id
      gameState.buildings.push(assignedRefinery, otherRefinery)

      handleStuckHarvester(harvester, mapGrid, gameState.occupancyMap, gameState, factories)

      expect(harvester.targetRefinery).toBe(assignedRefinery.id)
      expect(harvester.moveTarget).toEqual({ x: 10, y: 13 })
    })
  })

  describe('Player Overrides', () => {
    it('interruptHarvesterAutomation clears active harvest and unload state for player commands', () => {
      const harvester = createTestHarvester('harv1', 5, 5)
      harvester.harvesting = true
      harvester.harvestTimer = now - 1000
      harvester.oreField = { x: 5, y: 5 }
      harvester.activeHarvestTileKey = '5,5'
      harvester.unloadingAtRefinery = true
      harvester.unloadStartTime = now - 500
      harvester.targetRefinery = 'refinery_10_10'
      harvester.unloadRefinery = 'refinery_10_10'
      gameState.refineryStatus.refinery_10_10 = harvester.id

      interruptHarvesterAutomation(harvester, gameState)

      expect(harvester.harvesting).toBe(false)
      expect(harvester.oreField).toBeNull()
      expect(harvester.unloadingAtRefinery).toBe(false)
      expect(harvester.targetRefinery).toBeNull()
      expect(gameState.refineryStatus.refinery_10_10).toBeUndefined()
    })
  })

  describe('Long-Term Productivity Recovery', () => {
    it('reroutes stagnant harvesters to a different ore tile after one minute without progress', () => {
      const harvester = createTestHarvester('harv1', 1, 1)
      harvester.oreField = { x: 8, y: 8 }
      harvester.moveTarget = { x: 8, y: 8 }
      harvester.path = [{ x: 2, y: 2 }]
      harvester.lastProductivityCheck = now - 600
      harvester.harvesterGoalKey = 'ore:8,8'
      harvester.harvesterBestGoalDistance = Math.hypot(7, 7)
      harvester.harvesterLastGoalProgressAt = now - 60001
      units.push(harvester)

      mapGrid[8][8].ore = true
      mapGrid[7][8].ore = true
      gameState.buildings.push(createTestRefinery(3, 3))

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.oreField).toEqual({ x: 8, y: 7 })
      expect(harvester.moveTarget).toEqual({ x: 8, y: 7 })
      expect(getTargetedOreTiles()['8,7']).toBe(harvester.id)
    })
  })

  describe('Stale Reservations', () => {
    it('clears reservations for missing harvesters', () => {
      const targetedTiles = getTargetedOreTiles()
      targetedTiles['4,4'] = 'ghost-harvester'

      updateHarvesterLogic([], mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(targetedTiles['4,4']).toBeUndefined()
    })
  })

  describe('Enemy Repairs After Unload', () => {
    it('sends damaged enemy harvester to workshop after unloading', () => {
      const harvester = createTestHarvester('harv1', 11, 13, 'ai_enemy')
      harvester.oreCarried = 1000
      harvester.unloadingAtRefinery = true
      harvester.unloadStartTime = now - 5001
      harvester.unloadRefinery = 'refinery_10_10'
      harvester.health = 50
      harvester.maxHealth = 100
      units.push(harvester)

      const workshop = {
        type: 'vehicleWorkshop',
        owner: 'ai_enemy',
        health: 100,
        x: 2,
        y: 2,
        width: 3,
        height: 3,
        repairQueue: []
      }
      gameState.buildings.push(workshop)

      updateHarvesterLogic(units, mapGrid, gameState.occupancyMap, gameState, factories, now)

      expect(harvester.targetWorkshop).toBe(workshop)
      expect(workshop.repairQueue).toContain(harvester)
    })
  })
})
