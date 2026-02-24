// game/milestoneSystem.js
import { playSyncedVideoAudio } from '../ui/videoOverlay.js'
import { showNotification } from '../ui/notifications.js'

/**
 * Milestone detection and trigger system
 * Tracks game achievements and triggers audio-visual events
 */
export class MilestoneSystem {
  constructor() {
    this.achievedMilestones = new Set()
    this.productionController = null
    this.milestoneConfig = {
      firstRefinery: {
        id: 'firstRefinery',
        displayName: 'First Refinery Built',
        description: 'The first ore refinery has been constructed',
        videoFilename: 'tank_over_crystals',
        priority: 'high'
      },
      firstFactory: {
        id: 'firstFactory',
        displayName: 'First Factory Built',
        description: 'Your industrial capabilities are expanding',
        priority: 'medium'
      },
      tenBuildings: {
        id: 'tenBuildings',
        displayName: 'Industrial Complex',
        description: 'Ten buildings have been constructed',
        priority: 'low'
      },
      firstUnit: {
        id: 'firstUnit',
        displayName: 'First Unit Produced',
        description: 'Your first military unit is ready',
        priority: 'medium'
      },
      firstTeslaCoil: {
        id: 'firstTeslaCoil',
        displayName: 'First Tesla Coil Built',
        description: 'Advanced defensive technology has been deployed',
        videoFilename: 'tesla_coil_hits_tank',
        priority: 'high'
      },
      radarBuilt: {
        id: 'radarBuilt',
        displayName: 'Radar Station Operational',
        description: 'Advanced technologies are now available',
        priority: 'high'
      },
      harvesterUnlocked: {
        id: 'harvesterUnlocked',
        displayName: 'Harvester Available',
        description: 'Resource harvesting capabilities unlocked',
        priority: 'medium'
      },
      rocketTankUnlocked: {
        id: 'rocketTankUnlocked',
        displayName: 'Rocket Tank Available',
        description: 'Advanced rocket technology unlocked',
        priority: 'medium'
      },
      recoveryTankUnlocked: {
        id: 'recoveryTankUnlocked',
        displayName: 'Recovery Tank Available',
        description: 'Field repair capabilities unlocked',
        priority: 'medium'
      },
      tankV3Unlocked: {
        id: 'tankV3Unlocked',
        displayName: 'Heavy Tank Available',
        description: 'Advanced tank production capabilities unlocked',
        priority: 'medium'
      },
      tankerTruckUnlocked: {
        id: 'tankerTruckUnlocked',
        displayName: 'Tanker Truck Available',
        description: 'Mobile refueling capabilities unlocked',
        priority: 'medium'
      },
      firstAirstrip: {
        id: 'firstAirstrip',
        displayName: 'First Airstrip Built',
        description: 'Military aviation capabilities unlocked',
        videoFilename: 'air_strip',
        priority: 'high'
      }
    }
  }

  /**
   * Unlock advanced technology when radar station is built
   */
  unlockAdvancedTechnology() {
    if (!this.productionController) {
      window.logger.warn('ProductionController not set, cannot unlock advanced technology')
      return
    }

    // Define immediate radar unlocks (excluding units with additional requirements)
    const unitsToUnlock = ['tank-v2']
    const buildingsToUnlock = ['turretGunV2', 'turretGunV3', 'rocketTurret', 'teslaCoil', 'artilleryTurret']

    // Unlock multiple types with appropriate sound
    this.productionController.unlockMultipleTypes(unitsToUnlock, buildingsToUnlock)
  }

  /**
   * Unlock basic units when first vehicle factory is built
   */
  unlockBasicUnits(_gameState) {
    if (!this.productionController) {
      window.logger.warn('ProductionController not set, cannot unlock basic units')
      return
    }

    // Unlock basic tank
    this.productionController.unlockUnitType('tank')
  }

  /**
   * Unlock harvester when both vehicle factory and refinery exist
   */
  unlockHarvester() {
    if (!this.productionController) {
      window.logger.warn('ProductionController not set, cannot unlock harvester')
      return
    }

    this.productionController.unlockUnitType('harvester')
  }

  /**
   * Unlock rocket tank when rocket turret is built
   */
  unlockRocketTank() {
    if (!this.productionController) {
      window.logger.warn('ProductionController not set, cannot unlock rocket tank')
      return
    }

    this.productionController.unlockUnitType('rocketTank')
  }

  /**
   * Unlock tank-v3 when 2 vehicle factories exist
   */
  unlockTankV3() {
    if (!this.productionController) {
      window.logger.warn('ProductionController not set, cannot unlock tank-v3')
      return
    }

    this.productionController.unlockUnitType('tank-v3')
  }

  unlockAmbulance() {
    if (!this.productionController) {
      window.logger.warn('ProductionController not set, cannot unlock ambulance')
      return
    }
    this.productionController.unlockUnitType('ambulance')
  }

  unlockTankerTruck() {
    if (!this.productionController) {
      window.logger.warn('ProductionController not set, cannot unlock tanker truck')
      return
    }
    this.productionController.unlockUnitType('tankerTruck')
  }

  unlockRecoveryTank() {
    if (!this.productionController) {
      window.logger.warn('ProductionController not set, cannot unlock recovery tank')
      return
    }
    this.productionController.unlockUnitType('recoveryTank')
  }

  /**
   * Set the production controller reference for unlocking units/buildings
   */
  setProductionController(productionController) {
    this.productionController = productionController
  }

  /**
   * Check if a milestone should be triggered based on game state
   */
  checkMilestones(gameState) {

    // Check for first refinery
    if (!this.achievedMilestones.has('firstRefinery')) {
      const hasRefinery = gameState.buildings?.some(building =>
        building.type === 'oreRefinery' && building.owner === gameState.humanPlayer
      )
      if (hasRefinery) {
        this.triggerMilestone('firstRefinery')
      }
    }

    // Check for first airstrip
    if (!this.achievedMilestones.has('firstAirstrip')) {
      const hasAirstrip = gameState.buildings?.some(building =>
        building.type === 'airstrip' && building.owner === gameState.humanPlayer
      )
      if (hasAirstrip) {
        this.triggerMilestone('firstAirstrip')
      }
    }

    // Check for first factory and unlock basic units
    if (!this.achievedMilestones.has('firstFactory')) {
      const hasFactory = gameState.buildings?.some(building =>
        building.type === 'vehicleFactory' && building.owner === gameState.humanPlayer
      )
      if (hasFactory) {
        this.triggerMilestone('firstFactory')
        this.unlockBasicUnits(gameState)
      }
    }

    // Check for harvester unlock (requires both vehicle factory and refinery)
    if (!this.achievedMilestones.has('harvesterUnlocked')) {
      const hasFactory = gameState.buildings?.some(building =>
        building.type === 'vehicleFactory' && building.owner === gameState.humanPlayer
      )
      const hasRefinery = gameState.buildings?.some(building =>
        building.type === 'oreRefinery' && building.owner === gameState.humanPlayer
      )
      if (hasFactory && hasRefinery) {
        this.triggerMilestone('harvesterUnlocked')
        this.unlockHarvester()
      }
    }

    if (!this.achievedMilestones.has('tankerTruckUnlocked')) {
      const hasFactory = gameState.buildings?.some(b =>
        b.type === 'vehicleFactory' && b.owner === gameState.humanPlayer
      )
      const hasGasStation = gameState.buildings?.some(b =>
        b.type === 'gasStation' && b.owner === gameState.humanPlayer
      )
      if (hasFactory && hasGasStation) {
        this.triggerMilestone('tankerTruckUnlocked')
        this.unlockTankerTruck()
      }
    }

    // Check for rocket turret to unlock rocket tank
    if (!this.achievedMilestones.has('rocketTankUnlocked')) {
      const hasRocketTurret = gameState.buildings?.some(building =>
        building.type === 'rocketTurret' && building.owner === gameState.humanPlayer
      )
      if (hasRocketTurret) {
        this.triggerMilestone('rocketTankUnlocked')
        this.unlockRocketTank()
      }
    }

    // Check for 2 vehicle factories to unlock tank-v3
    if (!this.achievedMilestones.has('tankV3Unlocked')) {
      const vehicleFactories = gameState.buildings?.filter(building =>
        building.type === 'vehicleFactory' && building.owner === gameState.humanPlayer
      )
      if (vehicleFactories && vehicleFactories.length >= 2) {
        this.triggerMilestone('tankV3Unlocked')
        this.unlockTankV3()
      }
    }
    // Check for hospital built to unlock ambulance
    if (!this.achievedMilestones.has('hospitalBuilt')) {
      const hasHospital = gameState.buildings?.some(b => b.type === 'hospital' && b.owner === gameState.humanPlayer)
      if (hasHospital) {
        // this.triggerMilestone("hospitalBuilt")
        this.unlockAmbulance()
      }
    }

    if (!this.achievedMilestones.has('recoveryTankUnlocked')) {
      const hasWorkshop = gameState.buildings?.some(b => b.type === 'vehicleWorkshop' && b.owner === gameState.humanPlayer)
      if (hasWorkshop) {
        this.triggerMilestone('recoveryTankUnlocked')
        this.unlockRecoveryTank()
      }
    }

    // Check for ten buildings
    if (!this.achievedMilestones.has('tenBuildings')) {
      const playerBuildings = gameState.buildings?.filter(building =>
        building.owner === gameState.humanPlayer
      )
      if (playerBuildings && playerBuildings.length >= 10) {
        this.triggerMilestone('tenBuildings')
      }
    }

    // Check for first unit
    if (!this.achievedMilestones.has('firstUnit')) {
      const hasUnit = gameState.units?.some(unit =>
        unit.owner === gameState.humanPlayer && unit.type !== 'harvester'
      )
      if (hasUnit) {
        this.triggerMilestone('firstUnit')
      }
    }

    // Check for first Tesla coil
    if (!this.achievedMilestones.has('firstTeslaCoil')) {
      const hasTeslaCoil = gameState.buildings?.some(building =>
        building.type === 'teslaCoil' && building.owner === gameState.humanPlayer
      )
      if (hasTeslaCoil) {
        this.triggerMilestone('firstTeslaCoil')
      }
    }

    // Check for radar station to unlock advanced units and buildings
    if (!this.achievedMilestones.has('radarBuilt')) {
      const hasRadar = gameState.buildings?.some(building =>
        building.type === 'radarStation' && building.owner === gameState.humanPlayer
      )
      if (hasRadar) {
        this.triggerMilestone('radarBuilt')
        this.unlockAdvancedTechnology()
      }
    }
  }

  /**
   * Trigger a specific milestone
   */
  triggerMilestone(milestoneId) {

    if (this.achievedMilestones.has(milestoneId)) {
      return // Already achieved
    }

    const milestone = this.milestoneConfig[milestoneId]
    if (!milestone) {
      window.logger.warn(`Unknown milestone: ${milestoneId}`)
      return
    }

    this.achievedMilestones.add(milestoneId)

    // Show notification
    showNotification(milestone.displayName, 'achievement')

    // Play video if available
    if (milestone.videoFilename) {
      playSyncedVideoAudio(milestone.videoFilename, {
        title: milestone.displayName,
        description: milestone.description,
        priority: milestone.priority
      })
    }

    // Dispatch custom event for other systems to listen to
    document.dispatchEvent(new CustomEvent('milestoneAchieved', {
      detail: {
        milestone: milestoneId,
        config: milestone
      }
    }))
  }

  /**
   * Get all achieved milestones
   */
  getAchievedMilestones() {
    return Array.from(this.achievedMilestones)
  }

  /**
   * Reset all milestones (for game restart)
   */
  reset() {
    this.achievedMilestones.clear()
  }

  /**
   * Get milestone configuration
   */
  getMilestoneConfig(milestoneId) {
    return this.milestoneConfig[milestoneId]
  }

  /**
   * Check if a milestone is achieved
   */
  isAchieved(milestoneId) {
    return this.achievedMilestones.has(milestoneId)
  }

  /**
   * Set achieved milestones (used for loading saved games)
   */
  setAchievedMilestones(milestoneIds) {
    this.achievedMilestones.clear()
    if (Array.isArray(milestoneIds)) {
      milestoneIds.forEach(id => this.achievedMilestones.add(id))
    }
  }
}

// Create global instance
export const milestoneSystem = new MilestoneSystem()
