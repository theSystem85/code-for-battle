import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'
import { MilestoneSystem, milestoneSystem } from '../../src/game/milestoneSystem.js'

// Mock the dependencies
vi.mock('../../src/ui/videoOverlay.js', () => ({
  playSyncedVideoAudio: vi.fn()
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

describe('milestoneSystem.js', () => {
  let system

  beforeEach(() => {
    vi.clearAllMocks()
    system = new MilestoneSystem()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('MilestoneSystem constructor', () => {
    it('should initialize with empty achieved milestones set', () => {
      expect(system.achievedMilestones).toBeInstanceOf(Set)
      expect(system.achievedMilestones.size).toBe(0)
    })

    it('should initialize with null productionController', () => {
      expect(system.productionController).toBeNull()
    })

    it('should have milestone configurations defined', () => {
      expect(system.milestoneConfig).toBeDefined()
      expect(system.milestoneConfig.firstRefinery).toBeDefined()
      expect(system.milestoneConfig.firstFactory).toBeDefined()
      expect(system.milestoneConfig.tenBuildings).toBeDefined()
    })

    it('should have correct milestone config properties', () => {
      const refineryConfig = system.milestoneConfig.firstRefinery
      expect(refineryConfig.id).toBe('firstRefinery')
      expect(refineryConfig.displayName).toBe('First Refinery Built')
      expect(refineryConfig.videoFilename).toBe('tank_over_crystals')
      expect(refineryConfig.priority).toBe('high')
    })
  })

  describe('setProductionController', () => {
    it('should set the production controller reference', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      expect(system.productionController).toBe(mockController)
    })
  })

  describe('unlockAdvancedTechnology', () => {
    it('should log warning if no productionController is set', () => {
      const warnSpy = vi.spyOn(window.logger, 'warn')
      system.unlockAdvancedTechnology()
      expect(warnSpy).toHaveBeenCalledWith('ProductionController not set, cannot unlock advanced technology')
    })

    it('should call unlockMultipleTypes on productionController', () => {
      const mockController = { unlockMultipleTypes: vi.fn() }
      system.setProductionController(mockController)
      system.unlockAdvancedTechnology()
      expect(mockController.unlockMultipleTypes).toHaveBeenCalledWith(
        ['tank-v2'],
        ['turretGunV2', 'turretGunV3', 'rocketTurret', 'teslaCoil', 'artilleryTurret']
      )
    })
  })

  describe('unlockBasicUnits', () => {
    it('should log warning if no productionController is set', () => {
      const warnSpy = vi.spyOn(window.logger, 'warn')
      system.unlockBasicUnits({})
      expect(warnSpy).toHaveBeenCalledWith('ProductionController not set, cannot unlock basic units')
    })

    it('should unlock tank unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockBasicUnits({})
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('tank')
    })
  })

  describe('unlockHarvester', () => {
    it('should log warning if no productionController is set', () => {
      const warnSpy = vi.spyOn(window.logger, 'warn')
      system.unlockHarvester()
      expect(warnSpy).toHaveBeenCalledWith('ProductionController not set, cannot unlock harvester')
    })

    it('should unlock harvester unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockHarvester()
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('harvester')
    })
  })

  describe('unlockRocketTank', () => {
    it('should unlock rocketTank unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockRocketTank()
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('rocketTank')
    })
  })

  describe('unlockTankV3', () => {
    it('should unlock tank-v3 unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockTankV3()
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('tank-v3')
    })
  })

  describe('unlockAmbulance', () => {
    it('should unlock ambulance unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockAmbulance()
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('ambulance')
    })
  })

  describe('unlockTankerTruck', () => {
    it('should unlock tankerTruck unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockTankerTruck()
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('tankerTruck')
    })
  })

  describe('unlockRecoveryTank', () => {
    it('should unlock recoveryTank unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockRecoveryTank()
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('recoveryTank')
    })
  })

  describe('checkMilestones', () => {
    it('should detect first refinery milestone', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [{ type: 'oreRefinery', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstRefinery')).toBe(true)
    })

    it('should not trigger milestone if already achieved', () => {
      system.achievedMilestones.add('firstRefinery')
      const gameState = {
        humanPlayer: 'player1',
        buildings: [{ type: 'oreRefinery', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      // Should still be achieved, but not re-triggered
      expect(system.isAchieved('firstRefinery')).toBe(true)
    })

    it('should detect first factory and unlock basic units', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      const gameState = {
        humanPlayer: 'player1',
        buildings: [{ type: 'vehicleFactory', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstFactory')).toBe(true)
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('tank')
    })

    it('should unlock harvester when both factory and refinery exist', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      const gameState = {
        humanPlayer: 'player1',
        buildings: [
          { type: 'vehicleFactory', owner: 'player1' },
          { type: 'oreRefinery', owner: 'player1' }
        ]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('harvesterUnlocked')).toBe(true)
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('harvester')
    })

    it('should unlock tanker truck when factory and gas station exist', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      const gameState = {
        humanPlayer: 'player1',
        buildings: [
          { type: 'vehicleFactory', owner: 'player1' },
          { type: 'gasStation', owner: 'player1' }
        ]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('tankerTruckUnlocked')).toBe(true)
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('tankerTruck')
    })

    it('should unlock rocket tank when rocket turret exists', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      const gameState = {
        humanPlayer: 'player1',
        buildings: [{ type: 'rocketTurret', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('rocketTankUnlocked')).toBe(true)
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('rocketTank')
    })

    it('should unlock tank-v3 when 2 vehicle factories exist', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      const gameState = {
        humanPlayer: 'player1',
        buildings: [
          { type: 'vehicleFactory', owner: 'player1' },
          { type: 'vehicleFactory', owner: 'player1' }
        ]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('tankV3Unlocked')).toBe(true)
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('tank-v3')
    })

    it('should unlock recovery tank when workshop exists', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      const gameState = {
        humanPlayer: 'player1',
        buildings: [{ type: 'vehicleWorkshop', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('recoveryTankUnlocked')).toBe(true)
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('recoveryTank')
    })

    it('should detect ten buildings milestone', () => {
      const buildings = Array(10).fill(null).map(() => ({
        type: 'concreteWall',
        owner: 'player1'
      }))
      const gameState = {
        humanPlayer: 'player1',
        buildings
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('tenBuildings')).toBe(true)
    })

    it('should detect first unit milestone', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [],
        units: [{ type: 'tank', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstUnit')).toBe(true)
    })

    it('should not trigger first unit for harvester only', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [],
        units: [{ type: 'harvester', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstUnit')).toBe(false)
    })

    it('should detect first tesla coil milestone', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [{ type: 'teslaCoil', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstTeslaCoil')).toBe(true)
    })

    it('should detect radar built and unlock advanced tech', () => {
      const mockController = { unlockMultipleTypes: vi.fn() }
      system.setProductionController(mockController)
      const gameState = {
        humanPlayer: 'player1',
        buildings: [{ type: 'radarStation', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('radarBuilt')).toBe(true)
      expect(mockController.unlockMultipleTypes).toHaveBeenCalled()
    })

    it('should not trigger for enemy buildings', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [{ type: 'oreRefinery', owner: 'enemy' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstRefinery')).toBe(false)
    })
  })

  describe('triggerMilestone', () => {
    it('should add milestone to achieved set', () => {
      system.triggerMilestone('firstRefinery')
      expect(system.achievedMilestones.has('firstRefinery')).toBe(true)
    })

    it('should not re-trigger already achieved milestone', () => {
      system.achievedMilestones.add('firstRefinery')
      const sizeBefore = system.achievedMilestones.size
      system.triggerMilestone('firstRefinery')
      expect(system.achievedMilestones.size).toBe(sizeBefore)
    })

    it('should log warning for unknown milestone', () => {
      const warnSpy = vi.spyOn(window.logger, 'warn')
      system.triggerMilestone('unknownMilestone')
      expect(warnSpy).toHaveBeenCalledWith('Unknown milestone: unknownMilestone')
    })

    it('should dispatch milestoneAchieved event', () => {
      const eventSpy = vi.fn()
      document.addEventListener('milestoneAchieved', eventSpy)
      system.triggerMilestone('firstRefinery')
      expect(eventSpy).toHaveBeenCalled()
      document.removeEventListener('milestoneAchieved', eventSpy)
    })
  })

  describe('getAchievedMilestones', () => {
    it('should return empty array when no milestones achieved', () => {
      expect(system.getAchievedMilestones()).toEqual([])
    })

    it('should return array of achieved milestone IDs', () => {
      system.achievedMilestones.add('firstRefinery')
      system.achievedMilestones.add('firstFactory')
      const achieved = system.getAchievedMilestones()
      expect(achieved).toContain('firstRefinery')
      expect(achieved).toContain('firstFactory')
      expect(achieved.length).toBe(2)
    })
  })

  describe('reset', () => {
    it('should clear all achieved milestones', () => {
      system.achievedMilestones.add('firstRefinery')
      system.achievedMilestones.add('firstFactory')
      system.reset()
      expect(system.achievedMilestones.size).toBe(0)
    })
  })

  describe('getMilestoneConfig', () => {
    it('should return config for valid milestone ID', () => {
      const config = system.getMilestoneConfig('firstRefinery')
      expect(config).toBeDefined()
      expect(config.id).toBe('firstRefinery')
    })

    it('should return undefined for invalid milestone ID', () => {
      const config = system.getMilestoneConfig('nonexistent')
      expect(config).toBeUndefined()
    })
  })

  describe('isAchieved', () => {
    it('should return false for unachieved milestone', () => {
      expect(system.isAchieved('firstRefinery')).toBe(false)
    })

    it('should return true for achieved milestone', () => {
      system.achievedMilestones.add('firstRefinery')
      expect(system.isAchieved('firstRefinery')).toBe(true)
    })
  })

  describe('setAchievedMilestones', () => {
    it('should set milestones from array', () => {
      system.setAchievedMilestones(['firstRefinery', 'firstFactory'])
      expect(system.isAchieved('firstRefinery')).toBe(true)
      expect(system.isAchieved('firstFactory')).toBe(true)
    })

    it('should clear previous milestones', () => {
      system.achievedMilestones.add('tenBuildings')
      system.setAchievedMilestones(['firstRefinery'])
      expect(system.isAchieved('tenBuildings')).toBe(false)
      expect(system.isAchieved('firstRefinery')).toBe(true)
    })

    it('should handle non-array input gracefully', () => {
      system.setAchievedMilestones(null)
      expect(system.achievedMilestones.size).toBe(0)
    })
  })

  describe('global milestoneSystem instance', () => {
    it('should exist as a singleton', () => {
      expect(milestoneSystem).toBeInstanceOf(MilestoneSystem)
    })
  })
})
