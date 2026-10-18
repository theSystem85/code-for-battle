import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '../setup.js'
import { MilestoneSystem, milestoneSystem } from '../../src/game/milestoneSystem.js'
import { playSyncedVideoAudio } from '../../src/ui/videoOverlay.js'

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
    it('[U02741] should initialize with empty achieved milestones set', () => {
      expect(system.achievedMilestones).toBeInstanceOf(Set)
      expect(system.achievedMilestones.size).toBe(0)
    })

    it('[U02742] should initialize with null productionController', () => {
      expect(system.productionController).toBeNull()
    })

    it('[U02743] should have milestone configurations defined', () => {
      expect(system.milestoneConfig).toBeDefined()
      expect(system.milestoneConfig.firstRefinery).toBeDefined()
      expect(system.milestoneConfig.firstFactory).toBeDefined()
      expect(system.milestoneConfig.tenBuildings).toBeDefined()
    })

    it('[U02744] should have correct milestone config properties', () => {
      const refineryConfig = system.milestoneConfig.firstRefinery
      expect(refineryConfig.id).toBe('firstRefinery')
      expect(refineryConfig.displayName).toBe('First Refinery Built')
      expect(refineryConfig.videoFilename).toBe('tank_over_crystals')
      expect(refineryConfig.priority).toBe('high')
    })
  })

  describe('setProductionController', () => {
    it('[U02745] should set the production controller reference', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      expect(system.productionController).toBe(mockController)
    })
  })

  describe('unlockAdvancedTechnology', () => {
    it('[U02746] should log warning if no productionController is set', () => {
      const warnSpy = vi.spyOn(window.logger, 'warn')
      system.unlockAdvancedTechnology()
      expect(warnSpy).toHaveBeenCalledWith('ProductionController not set, cannot unlock advanced technology')
    })

    it('[U02747] should call unlockMultipleTypes on productionController', () => {
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
    it('[U02748] should log warning if no productionController is set', () => {
      const warnSpy = vi.spyOn(window.logger, 'warn')
      system.unlockBasicUnits({})
      expect(warnSpy).toHaveBeenCalledWith('ProductionController not set, cannot unlock basic units')
    })

    it('[U02749] should unlock tank unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockBasicUnits({})
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('tank')
    })
  })

  describe('unlockHarvester', () => {
    it('[U02750] should log warning if no productionController is set', () => {
      const warnSpy = vi.spyOn(window.logger, 'warn')
      system.unlockHarvester()
      expect(warnSpy).toHaveBeenCalledWith('ProductionController not set, cannot unlock harvester')
    })

    it('[U02751] should unlock harvester unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockHarvester()
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('harvester')
    })
  })

  describe('unlockRocketTank', () => {
    it('[U02752] should unlock rocketTank unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockRocketTank()
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('rocketTank')
    })
  })

  describe('unlockTankV3', () => {
    it('[U02753] should unlock tank-v3 unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockTankV3()
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('tank-v3')
    })
  })

  describe('unlockAmbulance', () => {
    it('[U02754] should unlock ambulance unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockAmbulance()
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('ambulance')
    })
  })

  describe('unlockTankerTruck', () => {
    it('[U02755] should unlock tankerTruck unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockTankerTruck()
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('tankerTruck')
    })
  })

  describe('unlockRecoveryTank', () => {
    it('[U02756] should unlock recoveryTank unit type', () => {
      const mockController = { unlockUnitType: vi.fn() }
      system.setProductionController(mockController)
      system.unlockRecoveryTank()
      expect(mockController.unlockUnitType).toHaveBeenCalledWith('recoveryTank')
    })
  })

  describe('checkMilestones', () => {
    it('[U02757] should detect first refinery milestone', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [{ type: 'oreRefinery', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstRefinery')).toBe(true)
    })

    it('[U02758] should not trigger milestone if already achieved', () => {
      system.achievedMilestones.add('firstRefinery')
      const gameState = {
        humanPlayer: 'player1',
        buildings: [{ type: 'oreRefinery', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      // Should still be achieved, but not re-triggered
      expect(system.isAchieved('firstRefinery')).toBe(true)
    })

    it('[U02759] should detect first factory and unlock basic units', () => {
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

    it('[U02760] should unlock harvester when both factory and refinery exist', () => {
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

    it('[U02761] should unlock tanker truck when factory and gas station exist', () => {
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

    it('[U02762] should unlock rocket tank when rocket turret exists', () => {
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

    it('[U02763] should unlock tank-v3 when 2 vehicle factories exist', () => {
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

    it('[U02764] should unlock recovery tank when workshop exists', () => {
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

    it('[U02765] should detect ten buildings milestone', () => {
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

    it('[U02766] should detect first unit milestone', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [],
        units: [{ type: 'tank', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstUnit')).toBe(true)
    })

    it('[U02767] should not trigger first unit for harvester only', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [],
        units: [{ type: 'harvester', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstUnit')).toBe(false)
    })

    it('[U02768] should detect the first standard tank and play its milestone video once', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [],
        units: [{ type: 'tank_v1', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstTank')).toBe(true)
      expect(playSyncedVideoAudio).toHaveBeenCalledWith('first_tank', expect.objectContaining({
        title: 'First Tank Produced',
        description: 'Your first tank has rolled out of the factory',
        priority: 'high'
      }))

      playSyncedVideoAudio.mockClear()
      gameState.units.push({ type: 'tank_v1', owner: 'player1' })
      system.checkMilestones(gameState)
      expect(playSyncedVideoAudio).not.toHaveBeenCalled()
    })

    it('[U02769] should treat the production alias tank as the standard land tank', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [],
        units: [{ type: 'tank', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstTank')).toBe(true)
      expect(playSyncedVideoAudio).toHaveBeenCalledWith('first_tank', expect.any(Object))
    })

    it('[U02770] should not play the first tank video for other vehicles or enemy tanks', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [],
        units: [
          { type: 'tank-v2', owner: 'player1' },
          { type: 'tank-v3', owner: 'player1' },
          { type: 'harvester', owner: 'player1' },
          { type: 'tank_v1', owner: 'enemy' }
        ]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstTank')).toBe(false)
      expect(playSyncedVideoAudio).not.toHaveBeenCalled()
    })

    it('[U02771] should play a video the first time each new production unit appears', () => {
      const cases = [
        ['mineLayer', 'firstMineLayer', 'first_mine_layer', 'First Mine Layer Produced'],
        ['mineSweeper', 'firstMineSweeper', 'first_mine_sweeper', 'First Mine Sweeper Produced'],
        ['rocketTank', 'firstRocketTankBuilt', 'first_rocket_tank', 'First Rocket Tank Produced'],
        ['howitzer', 'firstHowitzer', 'first_artillery', 'First Howitzer Produced']
      ]
      cases.forEach(([unitType, milestoneId, videoFilename, title]) => {
        const local = new MilestoneSystem()
        local.checkMilestones({
          humanPlayer: 'player1',
          buildings: [],
          units: [{ type: unitType, owner: 'player1' }]
        })
        expect(local.isAchieved(milestoneId)).toBe(true)
        expect(playSyncedVideoAudio).toHaveBeenCalledWith(videoFilename, expect.objectContaining({
          title,
          priority: 'high'
        }))
        playSyncedVideoAudio.mockClear()
        local.checkMilestones({
          humanPlayer: 'player1',
          buildings: [],
          units: [
            { type: unitType, owner: 'player1' },
            { type: unitType, owner: 'player1' }
          ]
        })
        expect(playSyncedVideoAudio).not.toHaveBeenCalled()
      })
    })

    it('[U02772] should not play first-build videos for enemy units or the rocket unlock milestone', () => {
      system.checkMilestones({
        humanPlayer: 'player1',
        buildings: [],
        units: [
          { type: 'mineLayer', owner: 'enemy' },
          { type: 'mineSweeper', owner: 'enemy' },
          { type: 'rocketTank', owner: 'enemy' },
          { type: 'howitzer', owner: 'enemy' }
        ]
      })
      expect(system.isAchieved('firstMineLayer')).toBe(false)
      expect(system.isAchieved('firstMineSweeper')).toBe(false)
      expect(system.isAchieved('firstRocketTankBuilt')).toBe(false)
      expect(system.isAchieved('firstHowitzer')).toBe(false)
      expect(system.isAchieved('rocketTankUnlocked')).toBe(false)
      expect(playSyncedVideoAudio).not.toHaveBeenCalled()
    })

    it('[U02773] should keep achieved first-build milestones across save and load', () => {
      system.setAchievedMilestones(['firstMineLayer', 'firstHowitzer', 'firstRocketTankBuilt'])
      expect(system.getAchievedMilestones()).toEqual(expect.arrayContaining([
        'firstMineLayer',
        'firstHowitzer',
        'firstRocketTankBuilt'
      ]))
      system.checkMilestones({
        humanPlayer: 'player1',
        buildings: [],
        units: [
          { type: 'mineLayer', owner: 'player1' },
          { type: 'howitzer', owner: 'player1' },
          { type: 'rocketTank', owner: 'player1' }
        ]
      })
      expect(playSyncedVideoAudio).not.toHaveBeenCalled()
    })

    it('[U02774] replaces the unit-ready sting with the production-line narrator only the first time', () => {
      expect(system.claimFirstProductionNarration('howitzer')).toBe(true)
      expect(system.isAchieved('firstHowitzer')).toBe(true)
      expect(playSyncedVideoAudio).toHaveBeenCalledWith('first_artillery', expect.any(Object))

      playSyncedVideoAudio.mockClear()
      expect(system.claimFirstProductionNarration('howitzer')).toBe(false)
      expect(playSyncedVideoAudio).not.toHaveBeenCalled()

      expect(system.claimFirstProductionNarration('tank')).toBe(true)
      expect(system.claimFirstProductionNarration('tank_v1')).toBe(false)
      expect(system.claimFirstProductionNarration('harvester')).toBe(false)
      expect(system.claimFirstProductionNarration('mineLayer')).toBe(true)
      expect(system.claimFirstProductionNarration('mineSweeper')).toBe(true)
      expect(system.claimFirstProductionNarration('rocketTank')).toBe(true)
    })

    it('[U02775] should detect first tesla coil milestone', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [{ type: 'teslaCoil', owner: 'player1' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstTeslaCoil')).toBe(true)
    })

    it('[U02776] should detect radar built and unlock advanced tech', () => {
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

    it('[U02777] should not trigger for enemy buildings', () => {
      const gameState = {
        humanPlayer: 'player1',
        buildings: [{ type: 'oreRefinery', owner: 'enemy' }]
      }
      system.checkMilestones(gameState)
      expect(system.isAchieved('firstRefinery')).toBe(false)
    })
  })

  describe('triggerMilestone', () => {
    it('[U02778] should add milestone to achieved set', () => {
      system.triggerMilestone('firstRefinery')
      expect(system.achievedMilestones.has('firstRefinery')).toBe(true)
    })

    it('[U02779] should not re-trigger already achieved milestone', () => {
      system.achievedMilestones.add('firstRefinery')
      const sizeBefore = system.achievedMilestones.size
      system.triggerMilestone('firstRefinery')
      expect(system.achievedMilestones.size).toBe(sizeBefore)
    })

    it('[U02780] should log warning for unknown milestone', () => {
      const warnSpy = vi.spyOn(window.logger, 'warn')
      system.triggerMilestone('unknownMilestone')
      expect(warnSpy).toHaveBeenCalledWith('Unknown milestone: unknownMilestone')
    })

    it('[U02781] should dispatch milestoneAchieved event', () => {
      const eventSpy = vi.fn()
      document.addEventListener('milestoneAchieved', eventSpy)
      system.triggerMilestone('firstRefinery')
      expect(eventSpy).toHaveBeenCalled()
      document.removeEventListener('milestoneAchieved', eventSpy)
    })
  })

  describe('getAchievedMilestones', () => {
    it('[U02782] should return empty array when no milestones achieved', () => {
      expect(system.getAchievedMilestones()).toEqual([])
    })

    it('[U02783] should return array of achieved milestone IDs', () => {
      system.achievedMilestones.add('firstRefinery')
      system.achievedMilestones.add('firstFactory')
      const achieved = system.getAchievedMilestones()
      expect(achieved).toContain('firstRefinery')
      expect(achieved).toContain('firstFactory')
      expect(achieved.length).toBe(2)
    })
  })

  describe('reset', () => {
    it('[U02784] should clear all achieved milestones', () => {
      system.achievedMilestones.add('firstRefinery')
      system.achievedMilestones.add('firstFactory')
      system.reset()
      expect(system.achievedMilestones.size).toBe(0)
    })
  })

  describe('getMilestoneConfig', () => {
    it('[U02785] should return config for valid milestone ID', () => {
      const config = system.getMilestoneConfig('firstRefinery')
      expect(config).toBeDefined()
      expect(config.id).toBe('firstRefinery')
    })

    it('[U02786] should return undefined for invalid milestone ID', () => {
      const config = system.getMilestoneConfig('nonexistent')
      expect(config).toBeUndefined()
    })
  })

  describe('isAchieved', () => {
    it('[U02787] should return false for unachieved milestone', () => {
      expect(system.isAchieved('firstRefinery')).toBe(false)
    })

    it('[U02788] should return true for achieved milestone', () => {
      system.achievedMilestones.add('firstRefinery')
      expect(system.isAchieved('firstRefinery')).toBe(true)
    })
  })

  describe('setAchievedMilestones', () => {
    it('[U02789] should set milestones from array', () => {
      system.setAchievedMilestones(['firstRefinery', 'firstFactory'])
      expect(system.isAchieved('firstRefinery')).toBe(true)
      expect(system.isAchieved('firstFactory')).toBe(true)
    })

    it('[U02790] should clear previous milestones', () => {
      system.achievedMilestones.add('tenBuildings')
      system.setAchievedMilestones(['firstRefinery'])
      expect(system.isAchieved('tenBuildings')).toBe(false)
      expect(system.isAchieved('firstRefinery')).toBe(true)
    })

    it('[U02791] should handle non-array input gracefully', () => {
      system.setAchievedMilestones(null)
      expect(system.achievedMilestones.size).toBe(0)
    })
  })

  describe('global milestoneSystem instance', () => {
    it('[U02792] should exist as a singleton', () => {
      expect(milestoneSystem).toBeInstanceOf(MilestoneSystem)
    })
  })
})
