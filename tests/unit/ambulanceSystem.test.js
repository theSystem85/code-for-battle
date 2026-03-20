import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  updateAmbulanceLogic,
  canAmbulanceHealUnit,
  assignAmbulanceToHealUnit
} from '../../src/game/ambulanceSystem.js'
import { getUnitCommandsHandler } from '../../src/inputHandler.js'

// Mock dependencies
vi.mock('../../src/config.js', () => ({
  SERVICE_DISCOVERY_RANGE: 10,
  SERVICE_SERVING_RANGE: 1.5,
  TILE_SIZE: 32
}))

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: fn => fn
}))

vi.mock('../../src/inputHandler.js', () => ({
  getUnitCommandsHandler: vi.fn(() => ({
    clearUtilityQueueState: vi.fn(),
    advanceUtilityQueue: vi.fn(),
    assignAmbulanceToTarget: vi.fn(() => true)
  }))
}))

vi.mock('../../src/utils/serviceRadius.js', () => ({
  getServiceRadiusPixels: vi.fn(() => 96) // 3 tiles
}))

vi.mock('../../src/units.js', () => ({
  findPath: vi.fn(() => [{ x: 0, y: 0 }, { x: 1, y: 1 }])
}))

// Import the mock after it's been set up
import { findPath as mockFindPath } from '../../src/units.js'

function createTestAmbulance(id, tileX = 5, tileY = 5, owner = 'player1') {
  return {
    id,
    type: 'ambulance',
    x: tileX * 32,
    y: tileY * 32,
    tileX,
    tileY,
    owner,
    health: 100,
    maxHealth: 100,
    medics: 5,
    healingTarget: null,
    healingTimer: 0,
    crew: { driver: true, loader: true },
    movement: { isMoving: false },
    path: [],
    utilityQueue: null,
    alertMode: false
  }
}

function createTestUnit(id, tileX = 6, tileY = 6, owner = 'player1') {
  return {
    id,
    type: 'tank_v1',
    x: tileX * 32,
    y: tileY * 32,
    tileX,
    tileY,
    owner,
    health: 80,
    maxHealth: 100,
    crew: { driver: true, commander: true, gunner: true, loader: true },
    movement: { isMoving: false }
  }
}

function createTestHospital(x = 10, y = 10, owner = 'player1') {
  return {
    id: `hospital_${x}_${y}`,
    type: 'hospital',
    x,
    y,
    width: 3,
    height: 3,
    owner,
    health: 100
  }
}

describe('Ambulance System', () => {
  let gameState
  let units
  let delta

  beforeEach(() => {
    gameState = {
      mapGrid: [],
      buildings: [],
      humanPlayer: 'player1'
    }
    units = []
    delta = 16 // Default 16ms frame time

    vi.clearAllMocks()
  })

  describe('canAmbulanceHealUnit', () => {
    it('should return true when target has missing crew and ambulance has medics', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = createTestUnit('tank1')
      target.crew.driver = false // One crew member down

      expect(canAmbulanceHealUnit(ambulance, target)).toBe(true)
    })

    it('should return false when ambulance has no loader', () => {
      const ambulance = createTestAmbulance('amb1')
      ambulance.crew.loader = false
      const target = createTestUnit('tank1')
      target.crew.driver = false

      expect(canAmbulanceHealUnit(ambulance, target)).toBe(false)
    })

    it('should return false when target has no crew system', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = createTestUnit('tank1')
      target.crew = null

      expect(canAmbulanceHealUnit(ambulance, target)).toBe(false)
    })

    it('should return false when target crew is not an object', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = createTestUnit('tank1')
      target.crew = 'invalid'

      expect(canAmbulanceHealUnit(ambulance, target)).toBe(false)
    })

    it('should return false when target is moving', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = createTestUnit('tank1')
      target.crew.driver = false
      target.movement = { isMoving: true }

      expect(canAmbulanceHealUnit(ambulance, target)).toBe(false)
    })

    it('should return false when target has full crew', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = createTestUnit('tank1')
      // All crew members alive

      expect(canAmbulanceHealUnit(ambulance, target)).toBe(false)
    })


    it('should not heal enemy or airborne units', () => {
      const ambulance = createTestAmbulance('amb1', 5, 5, 'player1')
      const enemyTarget = createTestUnit('enemy1', 5, 5, 'player2')
      enemyTarget.crew.driver = false
      const airborneApache = {
        id: 'apache1',
        type: 'apache',
        x: 5 * 32,
        y: 5 * 32,
        tileX: 5,
        tileY: 5,
        owner: 'player1',
        health: 100,
        crew: { driver: false, commander: true, gunner: true, loader: true },
        isAirUnit: true,
        flightState: 'airborne',
        movement: { isMoving: false }
      }

      expect(canAmbulanceHealUnit(ambulance, enemyTarget)).toBe(false)
      expect(canAmbulanceHealUnit(ambulance, airborneApache)).toBe(false)
      expect(assignAmbulanceToHealUnit(ambulance, enemyTarget, [])).toBe(false)
      expect(assignAmbulanceToHealUnit(ambulance, airborneApache, [])).toBe(false)
    })

    it('should return false when ambulance has no medics', () => {
      const ambulance = createTestAmbulance('amb1')
      ambulance.medics = 0
      const target = createTestUnit('tank1')
      target.crew.driver = false

      expect(canAmbulanceHealUnit(ambulance, target)).toBe(false)
    })
  })

  describe('assignAmbulanceToHealUnit', () => {
    it('should assign ambulance to heal target unit', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = createTestUnit('tank1')
      target.crew.driver = false

      const result = assignAmbulanceToHealUnit(ambulance, target, [])

      expect(result).toBe(true)
    })

    it('delegates to unit commands handler when available', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = createTestUnit('tank1')
      target.crew.driver = false

      const unitCommands = {
        assignAmbulanceToTarget: vi.fn(() => true)
      }
      getUnitCommandsHandler.mockReturnValueOnce(unitCommands)

      const result = assignAmbulanceToHealUnit(ambulance, target, [])

      expect(result).toBe(true)
      expect(unitCommands.assignAmbulanceToTarget).toHaveBeenCalledWith(
        ambulance,
        target,
        [],
        { suppressNotifications: true }
      )
      expect(ambulance.healingTarget).toBeNull()
    })

    it('should return false when ambulance cannot heal unit', () => {
      const ambulance = createTestAmbulance('amb1')
      ambulance.medics = 0
      const target = createTestUnit('tank1')
      target.crew.driver = false

      const result = assignAmbulanceToHealUnit(ambulance, target, [])

      expect(result).toBe(false)
    })

    it('should return false when ambulance has no loader', () => {
      const ambulance = createTestAmbulance('amb1')
      ambulance.crew.loader = false
      const target = createTestUnit('tank1')
      target.crew.driver = false

      const result = assignAmbulanceToHealUnit(ambulance, target, [])

      expect(result).toBe(false)
    })

    it('should return false when target is moving', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = createTestUnit('tank1')
      target.crew.driver = false
      target.movement = { isMoving: true }

      const result = assignAmbulanceToHealUnit(ambulance, target, [])

      expect(result).toBe(false)
    })

    it('clears movement targets when pathfinding returns empty result', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = {
        id: 'tank1',
        type: 'tank_v1',
        owner: 'player1',
        crew: { driver: false, commander: true, gunner: true, loader: true },
        movement: { isMoving: false },
        tileX: 10,
        tileY: 10,
        x: 320,
        y: 320
      }

      getUnitCommandsHandler.mockReturnValueOnce({ assignAmbulanceToTarget: vi.fn(() => false) })
      // When pathfinding fails, path should be set to empty
      mockFindPath.mockReturnValueOnce([])

      const result = assignAmbulanceToHealUnit(ambulance, target, [{}])

      expect(result).toBe(true)
      expect(ambulance.path).toEqual([])
      expect(ambulance.moveTarget).toBeDefined() // moveTarget is still set even if path is empty
    })
  })

  describe('updateAmbulanceLogic', () => {
    it('should reset beingServedByAmbulance markers at start of update', () => {
      const unit = createTestUnit('tank1')
      unit.beingServedByAmbulance = true
      units.push(unit)
      units.push(createTestAmbulance('amb1'))

      updateAmbulanceLogic(units, gameState, delta)

      expect(unit.beingServedByAmbulance).toBe(false)
    })

    it('should skip processing when no ambulances exist', () => {
      const unit = createTestUnit('tank1')
      units.push(unit)

      // Should not throw
      updateAmbulanceLogic(units, gameState, delta)
    })

    it('should clear healing target when in hospital range', () => {
      const ambulance = createTestAmbulance('amb1', 10, 10)
      ambulance.healingTarget = createTestUnit('tank1')
      units.push(ambulance)

      const hospital = createTestHospital(10, 10)
      gameState.buildings.push(hospital)

      updateAmbulanceLogic(units, gameState, delta)

      expect(ambulance.healingTarget).toBeNull()
    })

    it('should clear healing state when ambulance has no loader', () => {
      const ambulance = createTestAmbulance('amb1')
      ambulance.crew.loader = false
      ambulance.healingTarget = createTestUnit('tank1')
      units.push(ambulance)

      updateAmbulanceLogic(units, gameState, delta)

      expect(ambulance.healingTarget).toBeNull()
      expect(ambulance.healingTimer).toBe(0)
    })

    it('should clear healing target if target unit no longer exists', () => {
      const ambulance = createTestAmbulance('amb1')
      // Reference to non-existent unit
      ambulance.healingTarget = { id: 'nonexistent', tileX: 6, tileY: 6 }
      units.push(ambulance)

      updateAmbulanceLogic(units, gameState, delta)

      expect(ambulance.healingTarget).toBeNull()
    })

    it('should clear healing target when target starts moving', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = createTestUnit('tank1')
      target.crew.driver = false
      ambulance.healingTarget = target
      units.push(ambulance, target)

      // Target starts moving
      target.movement = { isMoving: true }

      updateAmbulanceLogic(units, gameState, delta)

      expect(ambulance.healingTarget).toBeNull()
    })

    it('should heal crew members over time', () => {
      const ambulance = createTestAmbulance('amb1', 6, 6)
      const target = createTestUnit('tank1', 6, 6)
      target.crew.driver = false
      ambulance.healingTarget = target
      ambulance.healingTimer = 1990 // Almost at 2000ms threshold
      units.push(ambulance, target)

      updateAmbulanceLogic(units, gameState, 16)

      // Timer should reach 2000+ and heal one crew member
      expect(target.crew.driver).toBe(true)
      expect(ambulance.medics).toBe(4)
    })

    it('should heal crew in priority order: driver, commander, loader, gunner', () => {
      const ambulance = createTestAmbulance('amb1', 6, 6)
      const target = createTestUnit('tank1', 6, 6)
      target.crew = { driver: false, commander: false, gunner: false, loader: false }
      ambulance.healingTarget = target
      ambulance.healingTimer = 2000 // Ready to heal
      ambulance.medics = 1 // Only one medic
      units.push(ambulance, target)

      updateAmbulanceLogic(units, gameState, 16)

      // Should heal driver first
      expect(target.crew.driver).toBe(true)
      expect(target.crew.commander).toBe(false)
    })

    it('should clear target when fully healed', () => {
      const ambulance = createTestAmbulance('amb1', 6, 6)
      const target = createTestUnit('tank1', 6, 6)
      target.crew = { driver: true, commander: true, gunner: true, loader: true }
      ambulance.healingTarget = target
      units.push(ambulance, target)

      updateAmbulanceLogic(units, gameState, delta)

      expect(ambulance.healingTarget).toBeNull()
    })

    it('should mark target as being served by ambulance', () => {
      const ambulance = createTestAmbulance('amb1', 6, 6)
      const target = createTestUnit('tank1', 6, 6)
      target.crew.driver = false
      ambulance.healingTarget = target
      units.push(ambulance, target)

      updateAmbulanceLogic(units, gameState, delta)

      expect(target.beingServedByAmbulance).toBe(true)
    })

    it('should stop healing when ambulance runs out of medics', () => {
      const ambulance = createTestAmbulance('amb1', 6, 6)
      ambulance.medics = 0
      const target = createTestUnit('tank1', 6, 6)
      target.crew.driver = false
      ambulance.healingTarget = target
      units.push(ambulance, target)

      updateAmbulanceLogic(units, gameState, delta)

      expect(ambulance.healingTarget).toBeNull()
    })
  })

  describe('Alert Mode', () => {
    it('should clear alert state when not in alert mode', () => {
      const ambulance = createTestAmbulance('amb1')
      ambulance.alertMode = false
      ambulance.alertActiveService = true
      ambulance.alertAssignmentId = 'unit1'
      units.push(ambulance)

      updateAmbulanceLogic(units, gameState, delta)

      expect(ambulance.alertActiveService).toBe(false)
      expect(ambulance.alertAssignmentId).toBeNull()
    })

    it('should scan for wounded units in alert mode', () => {
      const ambulance = createTestAmbulance('amb1')
      ambulance.alertMode = true
      ambulance.nextUtilityScanTime = 0
      units.push(ambulance)

      const target = createTestUnit('tank1', 7, 7) // Within range
      target.crew.driver = false
      units.push(target)

      updateAmbulanceLogic(units, gameState, delta)

      // Should have triggered the unit commands handler
      expect(ambulance.alertActiveService).toBe(true)
    })

    it('should update alert scan time after scan', () => {
      const ambulance = createTestAmbulance('amb1')
      ambulance.alertMode = true
      ambulance.nextUtilityScanTime = 0
      units.push(ambulance)

      updateAmbulanceLogic(units, gameState, delta)

      // Should have updated scan time
      expect(ambulance.nextUtilityScanTime).toBeGreaterThan(0)
    })
  })

  describe('Pending Heal Queue', () => {
    it('should process pending heal queue when not busy', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = createTestUnit('tank1')
      target.crew.driver = false
      units.push(ambulance, target)

      ambulance.pendingHealQueue = [{ unitId: target.id }]

      updateAmbulanceLogic(units, gameState, delta)

      expect(ambulance.criticalHealing).toBe(true)
    })

    it('should skip queue entries for units without crew', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = createTestUnit('tank1')
      target.crew = null
      units.push(ambulance, target)

      ambulance.pendingHealQueue = [{ unitId: target.id }]

      updateAmbulanceLogic(units, gameState, delta)

      // Queue should be processed but not result in healing
      expect(ambulance.healingTarget).toBeNull()
    })

    it('should skip queue entries for fully crewed units', () => {
      const ambulance = createTestAmbulance('amb1')
      const target = createTestUnit('tank1')
      // All crew alive
      units.push(ambulance, target)

      ambulance.pendingHealQueue = [{ unitId: target.id }]

      updateAmbulanceLogic(units, gameState, delta)

      expect(ambulance.healingTarget).toBeNull()
    })
  })

  describe('Utility Queue Integration', () => {
    it('should update utility queue state during healing', () => {
      const ambulance = createTestAmbulance('amb1', 6, 6)
      ambulance.utilityQueue = {
        mode: 'heal',
        targets: [],
        currentTargetId: null,
        currentTargetType: null
      }
      const target = createTestUnit('tank1', 6, 6)
      target.crew.driver = false
      ambulance.healingTarget = target
      units.push(ambulance, target)

      updateAmbulanceLogic(units, gameState, delta)

      expect(ambulance.utilityQueue.currentTargetId).toBe(target.id)
      expect(ambulance.utilityQueue.currentTargetType).toBe('unit')
    })

    it('should advance queue when healing completes', () => {
      const ambulance = createTestAmbulance('amb1', 6, 6)
      ambulance.utilityQueue = {
        mode: 'heal',
        targets: [],
        currentTargetId: 'tank1',
        currentTargetType: 'unit'
      }
      // No healing target anymore
      ambulance.healingTarget = null
      units.push(ambulance)

      updateAmbulanceLogic(units, gameState, delta)

      // Should have cleared currentTargetId
      expect(ambulance.utilityQueue.currentTargetId).toBeNull()
    })
  })

  describe('Alert State Tracking', () => {
    it('should update alert state when service starts', () => {
      const ambulance = createTestAmbulance('amb1', 6, 6)
      ambulance.alertMode = true
      ambulance._alertWasServing = false
      const target = createTestUnit('tank1', 6, 6)
      target.crew.driver = false
      ambulance.healingTarget = target
      units.push(ambulance, target)

      updateAmbulanceLogic(units, gameState, delta)

      expect(ambulance.alertActiveService).toBe(true)
    })

    it('should clear alert state when service ends', () => {
      const ambulance = createTestAmbulance('amb1', 6, 6)
      ambulance.alertMode = true
      ambulance._alertWasServing = true
      ambulance.healingTarget = null
      ambulance.alertActiveService = true
      units.push(ambulance)

      updateAmbulanceLogic(units, gameState, delta)

      expect(ambulance.alertActiveService).toBe(false)
      expect(ambulance.nextUtilityScanTime).toBeGreaterThan(0)
    })
  })
})
