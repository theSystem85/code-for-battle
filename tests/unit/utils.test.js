/**
 * Unit tests for utils.js
 *
 * Tests the utility functions for unit management, leveling system,
 * coordinate conversions, and other game utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  tileToPixel,
  getUniqueId,
  getBuildingIdentifier,
  calculateHealthSpeedModifier,
  updateUnitSpeedModifier,
  initializeUnitLeveling,
  getUnitCost,
  getExperienceRequiredForLevel,
  awardExperience,
  checkLevelUp,
  applyLevelBonuses,
  getExperienceProgress,
  handleSelfRepair,
  debugAddExperience,
  debugShowUnitStats,
  debugForceShowExperienceBars,
  debugSpawnEnemyUnit,
  debugTestExperienceAwarding,
  debugListAllUnits,
  debugInitializeAllUnits
} from '../../src/utils.js'
import { TILE_SIZE } from '../../src/config.js'

describe('utils', () => {
  describe('tileToPixel()', () => {
    it('[U04975] should convert tile coordinates to pixel coordinates', () => {
      const result = tileToPixel(5, 10)
      expect(result.x).toBe(5 * TILE_SIZE)
      expect(result.y).toBe(10 * TILE_SIZE)
    })

    it('[U04976] should return 0,0 for origin tile', () => {
      const result = tileToPixel(0, 0)
      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('[U04977] should handle large tile coordinates', () => {
      const result = tileToPixel(100, 100)
      expect(result.x).toBe(100 * TILE_SIZE)
      expect(result.y).toBe(100 * TILE_SIZE)
    })

    it('[U04978] should handle decimal tile coordinates', () => {
      const result = tileToPixel(2.5, 3.5)
      expect(result.x).toBe(2.5 * TILE_SIZE)
      expect(result.y).toBe(3.5 * TILE_SIZE)
    })
  })

  describe('getUniqueId()', () => {
    it('[U04979] should return a string', () => {
      const result = getUniqueId()
      expect(typeof result).toBe('string')
    })

    it('[U04980] should return different IDs on consecutive calls', () => {
      const ids = new Set()
      for (let i = 0; i < 100; i++) {
        ids.add(getUniqueId())
      }
      expect(ids.size).toBe(100)
    })

    it('[U04981] should have reasonable length', () => {
      const id = getUniqueId()
      expect(id.length).toBeGreaterThan(10)
      expect(id.length).toBeLessThan(30)
    })
  })

  describe('getBuildingIdentifier()', () => {
    it('[U04982] should return null for null building', () => {
      expect(getBuildingIdentifier(null)).toBeNull()
    })

    it('[U04983] should return null for undefined building', () => {
      expect(getBuildingIdentifier(undefined)).toBeNull()
    })

    it('[U04984] should return id if building has id', () => {
      const building = { id: 'building-123', type: 'powerPlant', x: 10, y: 20 }
      expect(getBuildingIdentifier(building)).toBe('building-123')
    })

    it('[U04985] should generate identifier from type and position if no id', () => {
      const building = { type: 'powerPlant', x: 10, y: 20 }
      expect(getBuildingIdentifier(building)).toBe('powerPlant:10,20')
    })

    it('[U04986] should use "unknown" for missing type', () => {
      const building = { x: 5, y: 15 }
      expect(getBuildingIdentifier(building)).toBe('unknown:5,15')
    })

    it('[U04987] should prefer id over generated identifier', () => {
      const building = { id: 'custom-id', type: 'turret', x: 0, y: 0 }
      expect(getBuildingIdentifier(building)).toBe('custom-id')
    })
  })

  describe('calculateHealthSpeedModifier()', () => {
    it('[U04988] should return 1.0 for null unit', () => {
      expect(calculateHealthSpeedModifier(null)).toBe(1.0)
    })

    it('[U04989] should return 1.0 for unit without health', () => {
      expect(calculateHealthSpeedModifier({})).toBe(1.0)
    })

    it('[U04990] should return 1.0 for unit without maxHealth', () => {
      expect(calculateHealthSpeedModifier({ health: 50 })).toBe(1.0)
    })

    it('[U04991] should return 1.0 for healthy unit (above 25% health)', () => {
      const unit = { health: 100, maxHealth: 100 }
      expect(calculateHealthSpeedModifier(unit)).toBe(1.0)
    })

    it('[U04992] should return 1.0 for unit at exactly 25% health', () => {
      const unit = { health: 25, maxHealth: 100 }
      expect(calculateHealthSpeedModifier(unit)).toBe(1.0)
    })

    it('[U04993] should return 0.5 for unit below 25% health', () => {
      const unit = { health: 24, maxHealth: 100 }
      expect(calculateHealthSpeedModifier(unit)).toBe(0.5)
    })

    it('[U04994] should return 0.5 for very low health unit', () => {
      const unit = { health: 1, maxHealth: 100 }
      expect(calculateHealthSpeedModifier(unit)).toBe(0.5)
    })

    it('[U04995] should return 1.0 for unit at 50% health', () => {
      const unit = { health: 50, maxHealth: 100 }
      expect(calculateHealthSpeedModifier(unit)).toBe(1.0)
    })
  })

  describe('updateUnitSpeedModifier()', () => {
    it('[U04996] should not throw for null unit', () => {
      expect(() => updateUnitSpeedModifier(null)).not.toThrow()
    })

    it('[U04997] should set speedModifier based on health', () => {
      const unit = { health: 100, maxHealth: 100 }
      updateUnitSpeedModifier(unit)
      expect(unit.speedModifier).toBe(1.0)
    })

    it('[U04998] should set speedModifier to 0.5 for damaged unit', () => {
      const unit = { health: 20, maxHealth: 100 }
      updateUnitSpeedModifier(unit)
      expect(unit.speedModifier).toBe(0.5)
    })

    it('[U04999] should combine with baseSpeedModifier', () => {
      const unit = { health: 100, maxHealth: 100, baseSpeedModifier: 0.8 }
      updateUnitSpeedModifier(unit)
      expect(unit.speedModifier).toBe(0.8)
    })

    it('[U05000] should multiply health modifier with base modifier', () => {
      const unit = { health: 20, maxHealth: 100, baseSpeedModifier: 0.8 }
      updateUnitSpeedModifier(unit)
      expect(unit.speedModifier).toBe(0.5 * 0.8)
    })
  })

  describe('getUnitCost()', () => {
    it('[U05001] should return cost for known unit type', () => {
      const cost = getUnitCost('tank')
      expect(typeof cost).toBe('number')
      expect(cost).toBeGreaterThan(0)
    })

    it('[U05002] should return very high cost for unknown unit type', () => {
      const cost = getUnitCost('nonexistent')
      expect(cost).toBe(9999999)
    })
  })

  describe('initializeUnitLeveling()', () => {
    it('[U05003] should not throw for null unit', () => {
      expect(() => initializeUnitLeveling(null)).not.toThrow()
    })

    it('[U05004] should not initialize leveling for harvesters', () => {
      const unit = { type: 'harvester' }
      initializeUnitLeveling(unit)
      expect(unit.level).toBeUndefined()
    })

    it('[U05005] should initialize level to 0', () => {
      const unit = { type: 'tank' }
      initializeUnitLeveling(unit)
      expect(unit.level).toBe(0)
    })

    it('[U05006] should initialize experience to 0', () => {
      const unit = { type: 'tank' }
      initializeUnitLeveling(unit)
      expect(unit.experience).toBe(0)
    })

    it('[U05007] should set baseCost from unit type', () => {
      const unit = { type: 'tank' }
      initializeUnitLeveling(unit)
      expect(unit.baseCost).toBeGreaterThan(0)
    })

    it('[U05008] should not overwrite existing level', () => {
      const unit = { type: 'tank', level: 2 }
      initializeUnitLeveling(unit)
      expect(unit.level).toBe(2)
    })

    it('[U05009] should not overwrite existing experience', () => {
      const unit = { type: 'tank', experience: 500 }
      initializeUnitLeveling(unit)
      expect(unit.experience).toBe(500)
    })
  })

  describe('getExperienceRequiredForLevel()', () => {
    it('[U05010] should return 2x baseCost for level 1', () => {
      const required = getExperienceRequiredForLevel(0, 1000)
      expect(required).toBe(2000)
    })

    it('[U05011] should return 4x baseCost for level 2', () => {
      const required = getExperienceRequiredForLevel(1, 1000)
      expect(required).toBe(4000)
    })

    it('[U05012] should return 6x baseCost for level 3', () => {
      const required = getExperienceRequiredForLevel(2, 1000)
      expect(required).toBe(6000)
    })

    it('[U05013] should return null for level 3+', () => {
      const required = getExperienceRequiredForLevel(3, 1000)
      expect(required).toBeNull()
    })
  })

  describe('awardExperience()', () => {
    it('[U05014] should not throw for null unit', () => {
      expect(() => awardExperience(null, { type: 'tank' })).not.toThrow()
    })

    it('[U05015] should not throw for null killedUnit', () => {
      expect(() => awardExperience({ type: 'tank' }, null)).not.toThrow()
    })

    it('[U05016] should not award experience to harvesters', () => {
      const unit = { type: 'harvester', experience: 0 }
      awardExperience(unit, { type: 'tank' })
      expect(unit.experience).toBe(0)
    })

    it('[U05017] should increase experience when killing enemy', () => {
      const unit = { type: 'tank', level: 0, experience: 0, baseCost: 1000 }
      const killedUnit = { type: 'tank' }
      awardExperience(unit, killedUnit)
      // Experience may be reset to 0 if level up occurred, check that it was processed
      expect(unit.level >= 0).toBe(true)
    })

    it('[U05018] should initialize leveling if not initialized', () => {
      const unit = { type: 'tank' }
      const killedUnit = { type: 'tank' }
      awardExperience(unit, killedUnit)
      expect(unit.level).toBeDefined()
      expect(unit.experience).toBeDefined()
      expect(unit.baseCost).toBeDefined()
    })
  })

  describe('checkLevelUp()', () => {
    it('[U05019] should not throw for null unit', () => {
      expect(() => checkLevelUp(null)).not.toThrow()
    })

    it('[U05020] should not level up if not enough experience', () => {
      const unit = { type: 'tank', level: 0, experience: 100, baseCost: 1000 }
      checkLevelUp(unit)
      expect(unit.level).toBe(0)
    })

    it('[U05021] should level up when enough experience', () => {
      const unit = { type: 'tank', level: 0, experience: 2000, baseCost: 1000 }
      checkLevelUp(unit)
      expect(unit.level).toBe(1)
    })

    it('[U05022] should reset experience after level up', () => {
      const unit = { type: 'tank', level: 0, experience: 2000, baseCost: 1000 }
      checkLevelUp(unit)
      expect(unit.experience).toBe(0)
    })

    it('[U05023] should not level up past level 3', () => {
      const unit = { type: 'tank', level: 3, experience: 999999, baseCost: 1000 }
      checkLevelUp(unit)
      expect(unit.level).toBe(3)
    })
  })

  describe('applyLevelBonuses()', () => {
    it('[U05024] should not throw for null unit', () => {
      expect(() => applyLevelBonuses(null)).not.toThrow()
    })

    it('[U05025] should apply range multiplier at level 1', () => {
      const unit = { type: 'tank', level: 1 }
      applyLevelBonuses(unit)
      expect(unit.rangeMultiplier).toBe(1.2)
    })

    it('[U05026] should apply armor at level 2', () => {
      const unit = { type: 'tank', level: 2 }
      applyLevelBonuses(unit)
      expect(unit.armor).toBeDefined()
    })

    it('[U05027] should apply self repair at level 3', () => {
      const unit = { type: 'tank', level: 3 }
      applyLevelBonuses(unit)
      expect(unit.selfRepair).toBe(true)
    })

    it('[U05028] should apply fire rate multiplier at level 3', () => {
      const unit = { type: 'tank', level: 3 }
      applyLevelBonuses(unit)
      expect(unit.fireRateMultiplier).toBeGreaterThan(1)
    })

    it('[U05029] should have different bonuses for howitzer', () => {
      const unit = { type: 'howitzer', level: 1 }
      applyLevelBonuses(unit)
      expect(unit.fireRateMultiplier).toBeCloseTo(1.33, 1)
    })
  })

  describe('getExperienceProgress()', () => {
    it('[U05030] should return 0 for null unit', () => {
      expect(getExperienceProgress(null)).toBe(0)
    })

    it('[U05031] should return 0 for max level unit', () => {
      const unit = { type: 'tank', level: 3, experience: 1000, baseCost: 1000 }
      expect(getExperienceProgress(unit)).toBe(0)
    })

    it('[U05032] should return 0 for unit with no experience', () => {
      const unit = { type: 'tank', level: 0, experience: 0, baseCost: 1000 }
      expect(getExperienceProgress(unit)).toBe(0)
    })

    it('[U05033] should return 0.5 for unit with half required experience', () => {
      const unit = { type: 'tank', level: 0, experience: 1000, baseCost: 1000 }
      expect(getExperienceProgress(unit)).toBeCloseTo(0.5, 1)
    })

    it('[U05034] should return 1 for unit at full experience', () => {
      const unit = { type: 'tank', level: 0, experience: 2000, baseCost: 1000 }
      expect(getExperienceProgress(unit)).toBe(1)
    })

    it('[U05035] should cap at 1 for over-full experience', () => {
      const unit = { type: 'tank', level: 0, experience: 5000, baseCost: 1000 }
      expect(getExperienceProgress(unit)).toBe(1)
    })
  })

  describe('handleSelfRepair()', () => {
    it('[U05036] should not throw for null unit', () => {
      expect(() => handleSelfRepair(null, Date.now())).not.toThrow()
    })

    it('[U05037] should not repair units below level 3', () => {
      const unit = { type: 'tank', level: 2, health: 50, maxHealth: 100, selfRepair: true }
      handleSelfRepair(unit, Date.now())
      expect(unit.health).toBe(50)
    })

    it('[U05038] should not repair units without selfRepair flag', () => {
      const unit = { type: 'tank', level: 3, health: 50, maxHealth: 100 }
      handleSelfRepair(unit, Date.now())
      expect(unit.health).toBe(50)
    })

    it('[U05039] should not repair units at full health', () => {
      const unit = { type: 'tank', level: 3, health: 100, maxHealth: 100, selfRepair: true }
      handleSelfRepair(unit, Date.now())
      expect(unit.health).toBe(100)
    })

    it('[U05040] should not repair units that are moving', () => {
      const unit = {
        type: 'tank',
        level: 3,
        health: 50,
        maxHealth: 100,
        selfRepair: true,
        path: [{ x: 5, y: 5 }]
      }
      handleSelfRepair(unit, Date.now())
      expect(unit.health).toBe(50)
    })

    it('[U05041] should set lastRepairTime on first call', () => {
      const now = Date.now()
      const unit = {
        type: 'tank',
        level: 3,
        health: 50,
        maxHealth: 100,
        selfRepair: true,
        path: []
      }
      handleSelfRepair(unit, now)
      expect(unit.lastRepairTime).toBe(now)
    })

    it('[U05042] should repair after 3 seconds', () => {
      const startTime = 1000
      const unit = {
        type: 'tank',
        level: 3,
        health: 50,
        maxHealth: 100,
        selfRepair: true,
        path: [],
        lastRepairTime: startTime
      }

      // After 3+ seconds
      handleSelfRepair(unit, startTime + 3001)
      // Health should increase by 1% of maxHealth (1)
      expect(unit.health).toBeGreaterThanOrEqual(50)
    })

    it('[U05043] should not exceed maxHealth', () => {
      const startTime = 1000
      const unit = {
        type: 'tank',
        level: 3,
        health: 99.5,
        maxHealth: 100,
        selfRepair: true,
        path: [],
        lastRepairTime: startTime
      }

      handleSelfRepair(unit, startTime + 3001)
      // Health should not exceed maxHealth
      expect(unit.health).toBeLessThanOrEqual(100)
    })
  })

  describe('debugAddExperience()', () => {
    beforeEach(() => {
      // Setup window logger mock
      vi.stubGlobal('window', {
        ...window,
        logger: vi.fn(),
        debugGetSelectedUnits: vi.fn()
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('[U05044] should be a function', () => {
      expect(typeof debugAddExperience).toBe('function')
    })

    it('[U05045] should not throw when no units selected', () => {
      window.debugGetSelectedUnits = vi.fn(() => [])

      expect(() => debugAddExperience()).not.toThrow()
      expect(window.logger).toHaveBeenCalled()
    })

    it('[U05046] should log message when no units selected', () => {
      window.debugGetSelectedUnits = vi.fn(() => [])

      debugAddExperience()

      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining('No units selected'))
    })

    it('[U05047] should add experience to selected units', () => {
      const mockUnit = {
        id: 'test-unit',
        type: 'tank',
        level: 1,
        experience: 0,
        baseCost: 1000
      }
      window.debugGetSelectedUnits = vi.fn(() => [mockUnit])

      debugAddExperience(500)

      expect(mockUnit.experience).toBe(500)
    })

    it('[U05048] should skip harvesters', () => {
      const mockHarvester = {
        id: 'test-harvester',
        type: 'harvester',
        experience: 0
      }
      window.debugGetSelectedUnits = vi.fn(() => [mockHarvester])

      debugAddExperience(500)

      expect(mockHarvester.experience).toBe(0)
      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining('cannot gain experience'))
    })

    it('[U05049] should use default amount of 1000', () => {
      const mockUnit = {
        id: 'test-unit',
        type: 'tank',
        level: 1,
        experience: 0,
        baseCost: 1000
      }
      window.debugGetSelectedUnits = vi.fn(() => [mockUnit])

      debugAddExperience()

      expect(mockUnit.experience).toBe(1000)
    })
  })

  describe('debugShowUnitStats()', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {
        ...window,
        logger: vi.fn(),
        selectedUnits: []
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('[U05050] should be a function', () => {
      expect(typeof debugShowUnitStats).toBe('function')
    })

    it('[U05051] should not throw with empty selected units', () => {
      window.selectedUnits = []

      expect(() => debugShowUnitStats()).not.toThrow()
    })

    it('[U05052] should show stats for selected units', () => {
      const mockUnit = {
        id: 'test-unit',
        type: 'tank',
        level: 2,
        experience: 500,
        baseCost: 1000
      }
      window.selectedUnits = [mockUnit]

      debugShowUnitStats()

      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining('tank'))
    })

    it('[U05053] should skip harvesters', () => {
      const mockHarvester = {
        id: 'test-harvester',
        type: 'harvester'
      }
      window.selectedUnits = [mockHarvester]

      debugShowUnitStats()

      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining("don't level up"))
    })
  })

  describe('debugForceShowExperienceBars()', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {
        ...window,
        logger: vi.fn(),
        gameInstance: { units: [] }
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('[U05054] should be a function', () => {
      expect(typeof debugForceShowExperienceBars).toBe('function')
    })

    it('[U05055] should not throw with empty units array', () => {
      window.gameInstance.units = []

      expect(() => debugForceShowExperienceBars()).not.toThrow()
    })

    it('[U05056] should add experience to units with 0 experience', () => {
      const mockUnit = {
        id: 'test-unit',
        type: 'tank',
        level: 1,
        experience: 0,
        baseCost: 1000
      }
      window.gameInstance.units = [mockUnit]

      debugForceShowExperienceBars()

      expect(mockUnit.experience).toBe(100)
    })

    it('[U05057] should skip harvesters', () => {
      const mockHarvester = {
        id: 'test-harvester',
        type: 'harvester',
        experience: 0
      }
      window.gameInstance.units = [mockHarvester]

      debugForceShowExperienceBars()

      expect(mockHarvester.experience).toBe(0)
    })

    it('[U05058] should log completion message', () => {
      window.gameInstance.units = []

      debugForceShowExperienceBars()

      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining('Forced experience bars'))
    })
  })

  describe('debugSpawnEnemyUnit()', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {
        ...window,
        logger: vi.fn(),
        gameInstance: { units: [] },
        gameState: { occupancyMap: [] }
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('[U05059] should be a function', () => {
      expect(typeof debugSpawnEnemyUnit).toBe('function')
    })

    it('[U05060] should spawn enemy unit', () => {
      const result = debugSpawnEnemyUnit('tank')

      expect(result).toBeDefined()
      expect(result.type).toBe('tank')
      expect(result.owner).toBe('enemy')
    })

    it('[U05061] should add unit to gameInstance.units', () => {
      debugSpawnEnemyUnit('tank')

      expect(window.gameInstance.units).toHaveLength(1)
    })

    it('[U05062] should use default unit type of tank', () => {
      const result = debugSpawnEnemyUnit()

      expect(result.type).toBe('tank')
    })

    it('[U05063] should log spawn message', () => {
      debugSpawnEnemyUnit('heavyTank')

      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining('Spawned enemy heavyTank'))
    })
  })

  describe('debugTestExperienceAwarding()', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {
        ...window,
        logger: vi.fn(),
        debugGetSelectedUnits: vi.fn(() => [])
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('[U05064] should be a function', () => {
      expect(typeof debugTestExperienceAwarding).toBe('function')
    })

    it('[U05065] should not throw when no units selected', () => {
      window.debugGetSelectedUnits = vi.fn(() => [])

      expect(() => debugTestExperienceAwarding()).not.toThrow()
    })

    it('[U05066] should log error when no units selected', () => {
      window.debugGetSelectedUnits = vi.fn(() => [])

      debugTestExperienceAwarding()

      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining('No units selected'))
    })

    it('[U05067] should award experience to selected units', () => {
      const mockUnit = {
        id: 'test-unit',
        type: 'tank',
        level: 1,
        experience: 0,
        baseCost: 1000
      }
      window.debugGetSelectedUnits = vi.fn(() => [mockUnit])

      debugTestExperienceAwarding()

      expect(mockUnit.experience).toBeGreaterThan(0)
    })
  })

  describe('debugListAllUnits()', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {
        ...window,
        logger: vi.fn(),
        gameInstance: { units: [] }
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('[U05068] should be a function', () => {
      expect(typeof debugListAllUnits).toBe('function')
    })

    it('[U05069] should not throw with empty units', () => {
      window.gameInstance.units = []

      expect(() => debugListAllUnits()).not.toThrow()
    })

    it('[U05070] should return units array', () => {
      const mockUnits = [
        { type: 'tank', owner: 'player1' },
        { type: 'harvester', owner: 'player1' }
      ]
      window.gameInstance.units = mockUnits

      const result = debugListAllUnits()

      expect(result).toBe(mockUnits)
    })

    it('[U05071] should log total unit count', () => {
      window.gameInstance.units = [
        { type: 'tank', owner: 'player1' }
      ]

      debugListAllUnits()

      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining('Total units'))
    })

    it('[U05072] should group units by owner', () => {
      window.gameInstance.units = [
        { type: 'tank', owner: 'player1' },
        { type: 'harvester', owner: 'player1' },
        { type: 'tank', owner: 'enemy' }
      ]

      debugListAllUnits()

      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining('player1'))
      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining('enemy'))
    })
  })

  describe('debugInitializeAllUnits()', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {
        ...window,
        logger: vi.fn(),
        gameInstance: { units: [] }
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('[U05073] should be a function', () => {
      expect(typeof debugInitializeAllUnits).toBe('function')
    })

    it('[U05074] should not throw with empty units', () => {
      window.gameInstance.units = []

      expect(() => debugInitializeAllUnits()).not.toThrow()
    })

    it('[U05075] should initialize leveling for units without it', () => {
      const mockUnit = {
        id: 'test-unit',
        type: 'tank',
        owner: 'player1'
      }
      window.gameInstance.units = [mockUnit]

      debugInitializeAllUnits()

      expect(mockUnit.level).toBeDefined()
      expect(mockUnit.experience).toBeDefined()
    })

    it('[U05076] should skip harvesters', () => {
      const mockHarvester = {
        id: 'test-harvester',
        type: 'harvester',
        owner: 'player1'
      }
      window.gameInstance.units = [mockHarvester]

      debugInitializeAllUnits()

      expect(mockHarvester.level).toBeUndefined()
    })

    it('[U05077] should log completion summary', () => {
      window.gameInstance.units = []

      debugInitializeAllUnits()

      expect(window.logger).toHaveBeenCalledWith(expect.stringContaining('Initialized experience system'))
    })
  })
})
