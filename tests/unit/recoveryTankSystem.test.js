import { describe, it, expect, beforeEach, vi } from 'vitest'
import { updateRecoveryTankLogic } from '../../src/game/recoveryTankSystem.js'
import { findPath } from '../../src/units.js'
import { releaseWreckAssignment } from '../../src/game/unitWreckManager.js'
import { playSound } from '../../src/sound.js'

// Mock dependencies
vi.mock('../../src/config.js', async(importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    TILE_SIZE: 32,
    SERVICE_DISCOVERY_RANGE: 10,
    SERVICE_SERVING_RANGE: 1.5
  }
})

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn()
}))

vi.mock('../../src/utils.js', () => ({
  getUnitCost: vi.fn(type => {
    const costs = {
      tank_v1: 1000,
      harvester: 500,
      apache: 2000
    }
    return costs[type] || 1000
  })
}))

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: fn => fn
}))

vi.mock('../../src/units.js', () => ({
  findPath: vi.fn((start, end) => {
    // Handle undefined end gracefully
    if (!end || typeof end.x === 'undefined') {
      return []
    }
    return [{ x: start.x, y: start.y }, { x: end.x, y: end.y }]
  })
}))

vi.mock('../../src/inputHandler.js', () => ({
  getUnitCommandsHandler: vi.fn(() => ({
    clearUtilityQueueState: vi.fn(),
    advanceUtilityQueue: vi.fn(),
    assignRecoveryTankToTarget: vi.fn(() => true),
    assignRecoveryTankToWreck: vi.fn(() => true)
  }))
}))

vi.mock('../../src/game/unitWreckManager.js', () => ({
  getWreckById: vi.fn((gameState, id) => {
    if (!gameState.unitWrecks) return null
    return gameState.unitWrecks.find(w => w.id === id) || null
  }),
  removeWreckById: vi.fn((gameState, id) => {
    if (!gameState.unitWrecks) return null
    const index = gameState.unitWrecks.findIndex(w => w.id === id)
    if (index === -1) return null
    const wreck = gameState.unitWrecks[index]
    gameState.unitWrecks.splice(index, 1)
    return wreck
  }),
  updateWreckPositionFromTank: vi.fn((wreck, tank) => {
    wreck.x = tank.x
    wreck.y = tank.y - 16
    wreck.tileX = tank.tileX
    wreck.tileY = tank.tileY
  }),
  releaseWreckAssignment: vi.fn((wreck) => {
    wreck.assignedTankId = null
    wreck.towedBy = null
  })
}))

function createTestRecoveryTank(id, tileX = 5, tileY = 5, owner = 'player1') {
  return {
    id,
    type: 'recoveryTank',
    x: tileX * 32,
    y: tileY * 32,
    tileX,
    tileY,
    owner,
    health: 100,
    maxHealth: 100,
    speed: 0.525,
    currentSpeed: 0.525,
    loadedSpeed: 0.33,
    crew: { driver: true, loader: true },
    movement: { isMoving: false },
    path: [],
    recoveryTask: null,
    towedWreck: null,
    towedUnit: null,
    repairTarget: null,
    repairData: null,
    repairStarted: false,
    utilityQueue: null,
    alertMode: false,
    recoveryProgress: 0
  }
}

function createTestWreck(id, tileX = 10, tileY = 10, owner = 'player1') {
  return {
    id,
    x: tileX * 32,
    y: tileY * 32,
    tileX,
    tileY,
    owner,
    unitType: 'tank_v1',
    cost: 1000,
    buildDuration: 5000,
    towedBy: null,
    assignedTankId: null,
    isBeingRecycled: false,
    isBeingRestored: false
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
    health: 50,
    maxHealth: 100,
    movement: { isMoving: false }
  }
}

function createTestWorkshop(x = 15, y = 15, owner = 'player1') {
  return {
    id: `workshop_${x}_${y}`,
    type: 'vehicleWorkshop',
    x,
    y,
    width: 3,
    height: 3,
    owner,
    health: 100,
    restorationQueue: []
  }
}

describe('Recovery Tank System', () => {
  let gameState
  let units
  let delta

  beforeEach(() => {
    gameState = {
      money: 5000,
      totalMoneyEarned: 0,
      mapGrid: [],
      occupancyMap: new Map(),
      buildings: [],
      unitWrecks: [],
      humanPlayer: 'player1'
    }
    units = []
    delta = 16 // Default 16ms frame time

    vi.clearAllMocks()
  })

  describe('updateRecoveryTankLogic', () => {
    it('should skip processing when no recovery tanks exist', () => {
      const unit = createTestUnit('tank1')
      units.push(unit)

      // Should not throw
      updateRecoveryTankLogic(units, gameState, delta)
    })

    it('should update speed when towing a unit', () => {
      const recoveryTank = createTestRecoveryTank('rt1')
      recoveryTank.towedUnit = createTestUnit('tank1')
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.speed).toBe(0.33)
    })

    it('should update speed when towing a wreck', () => {
      const recoveryTank = createTestRecoveryTank('rt1')
      const wreck = createTestWreck('wreck1')
      recoveryTank.towedWreck = wreck
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.speed).toBe(0.33)
    })

    it('should restore normal speed when not towing', () => {
      const recoveryTank = createTestRecoveryTank('rt1')
      recoveryTank.speed = 0.33 // Was towing before
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.speed).toBe(0.525)
    })


    it('should not auto-repair enemy or airborne units', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 6, 6, 'player1')
      const enemyTarget = createTestUnit('enemy1', 6, 6, 'player2')
      enemyTarget.health = 50
      const airborneApache = {
        id: 'apache1',
        type: 'apache',
        x: 6 * 32,
        y: 6 * 32,
        tileX: 6,
        tileY: 6,
        owner: 'player1',
        health: 50,
        maxHealth: 100,
        isAirUnit: true,
        flightState: 'airborne',
        movement: { isMoving: false }
      }
      units.push(recoveryTank, enemyTarget, airborneApache)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.repairTarget).toBeNull()
      expect(enemyTarget.health).toBe(50)
      expect(airborneApache.health).toBe(50)
    })

    it('should update towed unit position', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 8, 8)
      const towedUnit = createTestUnit('tank1', 0, 0)
      recoveryTank.towedUnit = towedUnit
      units.push(recoveryTank, towedUnit)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(towedUnit.x).toBe(recoveryTank.x)
      expect(towedUnit.y).toBe(recoveryTank.y - 16)
    })
  })

  describe('Crew Requirements', () => {
    it('should clear repair state when tank has no loader', () => {
      const recoveryTank = createTestRecoveryTank('rt1')
      recoveryTank.crew.loader = false
      recoveryTank.repairTarget = createTestUnit('tank1')
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.repairTarget).toBeNull()
      expect(recoveryTank.repairData).toBeNull()
    })

    it('should not start repairs without loader', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 6, 6)
      recoveryTank.crew.loader = false
      const target = createTestUnit('tank1', 6, 6)
      units.push(recoveryTank, target)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.repairTarget).toBeNull()
    })
  })

  describe('Tow Task Handling', () => {
    it('should clear recovery task when wreck no longer exists', () => {
      const recoveryTank = createTestRecoveryTank('rt1')
      recoveryTank.recoveryTask = {
        wreckId: 'nonexistent',
        mode: 'tow',
        state: 'movingToWreck'
      }
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.recoveryTask).toBeNull()
      expect(recoveryTank.towedWreck).toBeNull()
    })

    it('should attach wreck when close enough during tow task', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 10, 10)
      const wreck = createTestWreck('wreck1', 10, 10)
      const workshop = createTestWorkshop(15, 15)

      gameState.unitWrecks.push(wreck)
      gameState.buildings.push(workshop)

      recoveryTank.recoveryTask = {
        wreckId: wreck.id,
        mode: 'tow',
        state: 'movingToWreck',
        workshopId: workshop.id,
        workshopEntry: { x: 15, y: 18 }
      }
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.towedWreck).toBe(wreck)
      expect(wreck.towedBy).toBe(recoveryTank.id)
      expect(recoveryTank.recoveryTask.state).toBe('towingToWorkshop')
    })

    it('should not attach wreck already towed by another tank', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 10, 10)
      const wreck = createTestWreck('wreck1', 10, 10)
      wreck.towedBy = 'other_tank'
      gameState.unitWrecks.push(wreck)

      recoveryTank.recoveryTask = {
        wreckId: wreck.id,
        mode: 'tow',
        state: 'movingToWreck'
      }
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.recoveryTask).toBeNull()
      expect(recoveryTank.towedWreck).toBeNull()
    })

    it('should cancel tow task when no path to workshop exists', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 10, 10)
      const wreck = createTestWreck('wreck1', 10, 10)
      const workshop = createTestWorkshop(15, 15)

      gameState.unitWrecks.push(wreck)
      gameState.buildings.push(workshop)

      vi.mocked(findPath).mockReturnValueOnce([])

      recoveryTank.recoveryTask = {
        wreckId: wreck.id,
        mode: 'tow',
        state: 'movingToWreck',
        workshopId: workshop.id,
        workshopEntry: { x: 15, y: 18 }
      }
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(releaseWreckAssignment).toHaveBeenCalledWith(wreck)
      expect(recoveryTank.recoveryTask).toBeNull()
      expect(recoveryTank.towedWreck).toBeNull()
      expect(playSound).toHaveBeenCalledWith('repairCancelled', 0.6)
    })

    it('should cancel towing when workshop is destroyed', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 15, 18)
      const wreck = createTestWreck('wreck1', 12, 12)
      const workshop = createTestWorkshop(15, 15)
      workshop.health = 0

      gameState.unitWrecks.push(wreck)
      gameState.buildings.push(workshop)

      recoveryTank.recoveryTask = {
        wreckId: wreck.id,
        mode: 'tow',
        state: 'towingToWorkshop',
        workshopId: workshop.id,
        workshopEntry: { x: 15, y: 18 }
      }
      recoveryTank.towedWreck = wreck
      wreck.towedBy = recoveryTank.id
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(releaseWreckAssignment).toHaveBeenCalledWith(wreck)
      expect(recoveryTank.recoveryTask).toBeNull()
      expect(recoveryTank.towedWreck).toBeNull()
      expect(playSound).toHaveBeenCalledWith('repairCancelled', 0.6)
    })

    it('should finalize restoration when reaching workshop entry', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 15, 18)
      const wreck = createTestWreck('wreck1', 12, 12)
      const workshop = createTestWorkshop(15, 15)

      gameState.unitWrecks.push(wreck)
      gameState.buildings.push(workshop)

      recoveryTank.recoveryTask = {
        wreckId: wreck.id,
        mode: 'tow',
        state: 'towingToWorkshop',
        workshopId: workshop.id,
        workshopEntry: { x: 15, y: 18 }
      }
      recoveryTank.towedWreck = wreck
      wreck.towedBy = recoveryTank.id
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(workshop.restorationQueue).toHaveLength(1)
      expect(workshop.restorationQueue[0]).toMatchObject({
        wreckId: wreck.id,
        unitType: wreck.unitType
      })
      expect(recoveryTank.recoveryTask).toBeNull()
      expect(recoveryTank.towedWreck).toBeNull()
      expect(playSound).toHaveBeenCalledWith('deposit', 0.7)
    })
  })

  describe('Recycle Task Handling', () => {
    it('should start recycling when close to wreck', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 10, 10)
      const wreck = createTestWreck('wreck1', 10, 10)
      gameState.unitWrecks.push(wreck)

      recoveryTank.recoveryTask = {
        wreckId: wreck.id,
        mode: 'recycle',
        state: 'movingToWreck',
        recycleDuration: 3000
      }
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.recoveryTask.state).toBe('recycling')
      expect(wreck.isBeingRecycled).toBe(true)
    })

    it('should update recycling progress over time', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 10, 10)
      const wreck = createTestWreck('wreck1', 10, 10)
      gameState.unitWrecks.push(wreck)

      recoveryTank.recoveryTask = {
        wreckId: wreck.id,
        mode: 'recycle',
        state: 'recycling',
        recycleDuration: 1000,
        elapsed: 0
      }
      wreck.isBeingRecycled = true
      wreck.assignedTankId = recoveryTank.id
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.recoveryTask.elapsed).toBe(16)
      expect(recoveryTank.recoveryProgress).toBeCloseTo(0.016, 2)
    })

    it('should complete recycling and add money', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 10, 10)
      const wreck = createTestWreck('wreck1', 10, 10)
      wreck.cost = 1000
      gameState.unitWrecks.push(wreck)

      recoveryTank.recoveryTask = {
        wreckId: wreck.id,
        mode: 'recycle',
        state: 'recycling',
        recycleDuration: 1000,
        elapsed: 999
      }
      wreck.isBeingRecycled = true
      wreck.assignedTankId = recoveryTank.id
      units.push(recoveryTank)

      const initialMoney = gameState.money

      updateRecoveryTankLogic(units, gameState, delta)

      // 33% of 1000 = 330
      expect(gameState.money).toBe(initialMoney + 330)
      expect(recoveryTank.recoveryTask).toBeNull()
    })

    it('should remove wreck after recycling', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 10, 10)
      const wreck = createTestWreck('wreck1', 10, 10)
      gameState.unitWrecks.push(wreck)

      recoveryTank.recoveryTask = {
        wreckId: wreck.id,
        mode: 'recycle',
        state: 'recycling',
        recycleDuration: 1000,
        elapsed: 999
      }
      wreck.isBeingRecycled = true
      wreck.assignedTankId = recoveryTank.id
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(gameState.unitWrecks).toHaveLength(0)
    })
  })

  describe('Auto-Repair Logic', () => {
    it('should auto-acquire nearby damaged units', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 6, 6)
      const target = createTestUnit('tank1', 6, 6)
      target.health = 50
      target.maxHealth = 100
      units.push(recoveryTank, target)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.repairTarget).toBe(target)
      expect(recoveryTank.repairStarted).toBe(true)
    })

    it('should calculate repair costs based on unit value', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 6, 6)
      const target = createTestUnit('tank1', 6, 6)
      target.health = 50
      target.maxHealth = 100
      units.push(recoveryTank, target)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.repairData).toBeDefined()
      expect(recoveryTank.repairData.totalCost).toBe(250) // 25% of 1000
    })

    it('should heal target over time', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 6, 6)
      const target = createTestUnit('tank1', 6, 6)
      target.health = 50
      target.maxHealth = 100
      recoveryTank.repairTarget = target
      recoveryTank.repairStarted = true
      recoveryTank.repairData = {
        totalCost: 250,
        healthPerMs: 0.1,
        costPerMs: 0.05,
        soundCooldown: 0,
        repairFinishedSoundPlayed: false,
        repairStartSoundPlayed: true
      }
      units.push(recoveryTank, target)

      const initialHealth = target.health

      updateRecoveryTankLogic(units, gameState, delta)

      expect(target.health).toBeGreaterThan(initialHealth)
    })

    it('should deduct money during repairs', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 6, 6)
      const target = createTestUnit('tank1', 6, 6)
      target.health = 50
      target.maxHealth = 100
      recoveryTank.repairTarget = target
      recoveryTank.repairStarted = true
      recoveryTank.repairData = {
        totalCost: 250,
        healthPerMs: 0.1,
        costPerMs: 0.05,
        soundCooldown: 0,
        repairFinishedSoundPlayed: false,
        repairStartSoundPlayed: true
      }
      units.push(recoveryTank, target)

      const initialMoney = gameState.money

      updateRecoveryTankLogic(units, gameState, delta)

      expect(gameState.money).toBeLessThan(initialMoney)
    })

    it('should stop repair when target moves', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 6, 6)
      const target = createTestUnit('tank1', 6, 6)
      target.health = 50
      target.movement = { isMoving: true }
      recoveryTank.repairTarget = target
      units.push(recoveryTank, target)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.repairTarget).toBeNull()
    })

    it('should stop repair when target moves out of range', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 6, 6)
      const target = createTestUnit('tank1', 20, 20) // Too far
      target.health = 50
      recoveryTank.repairTarget = target
      units.push(recoveryTank, target)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.repairTarget).toBeNull()
    })

    it('should complete repair when target reaches full health', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 6, 6)
      const target = createTestUnit('tank1', 6, 6)
      target.health = 99.9
      target.maxHealth = 100
      recoveryTank.repairTarget = target
      recoveryTank.repairStarted = true
      recoveryTank.repairData = {
        totalCost: 250,
        healthPerMs: 10, // High rate to complete quickly
        costPerMs: 0.001,
        soundCooldown: 0,
        repairFinishedSoundPlayed: false,
        repairStartSoundPlayed: true
      }
      units.push(recoveryTank, target)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(target.health).toBe(100)
    })

    it('should pause repair when out of money', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 6, 6)
      const target = createTestUnit('tank1', 6, 6)
      target.health = 50
      recoveryTank.repairTarget = target
      recoveryTank.repairStarted = true
      recoveryTank.repairData = {
        totalCost: 250,
        healthPerMs: 0.1,
        costPerMs: 10, // High cost rate
        soundCooldown: 0,
        repairFinishedSoundPlayed: false,
        repairStartSoundPlayed: true
      }
      units.push(recoveryTank, target)

      gameState.money = 0

      const healthBefore = target.health

      updateRecoveryTankLogic(units, gameState, delta)

      expect(target.health).toBe(healthBefore) // No healing
    })
  })

  describe('Alert Mode', () => {
    it('should clear alert state when not in alert mode', () => {
      const recoveryTank = createTestRecoveryTank('rt1')
      recoveryTank.alertMode = false
      recoveryTank.alertActiveService = true
      recoveryTank.alertAssignmentId = 'unit1'
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.alertActiveService).toBe(false)
      expect(recoveryTank.alertAssignmentId).toBeNull()
    })

    it('should scan for damaged units in alert mode', () => {
      const recoveryTank = createTestRecoveryTank('rt1')
      recoveryTank.alertMode = true
      recoveryTank.nextUtilityScanTime = 0
      const target = createTestUnit('tank1', 7, 7)
      target.health = 50
      units.push(recoveryTank, target)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.alertActiveService).toBe(true)
    })

    it('should scan for wrecks in alert mode', () => {
      const recoveryTank = createTestRecoveryTank('rt1')
      recoveryTank.alertMode = true
      recoveryTank.nextUtilityScanTime = 0
      const wreck = createTestWreck('wreck1', 7, 7)
      gameState.unitWrecks.push(wreck)
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.alertActiveService).toBe(true)
    })

    it('should prefer damaged units over wrecks', () => {
      const recoveryTank = createTestRecoveryTank('rt1')
      recoveryTank.alertMode = true
      recoveryTank.nextUtilityScanTime = 0
      const target = createTestUnit('tank1', 7, 7)
      target.health = 50
      const wreck = createTestWreck('wreck1', 7, 7)
      gameState.unitWrecks.push(wreck)
      units.push(recoveryTank, target)

      updateRecoveryTankLogic(units, gameState, delta)

      // Should have assigned to the damaged unit
      expect(recoveryTank.alertAssignmentType).toBe('unit')
    })
  })

  describe('Utility Queue Integration', () => {
    it('should track wreck in utility queue during recovery task', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 10, 10)
      recoveryTank.utilityQueue = {
        mode: 'repair',
        targets: [],
        currentTargetId: 'wreck1', // Pre-set the current target
        currentTargetType: 'wreck'
      }
      const wreck = createTestWreck('wreck1', 10, 10)
      const workshop = createTestWorkshop(15, 15)
      gameState.unitWrecks.push(wreck)
      gameState.buildings.push(workshop)
      recoveryTank.recoveryTask = {
        wreckId: wreck.id,
        mode: 'tow',
        state: 'towingToWorkshop', // Already towing state
        workshopId: workshop.id,
        workshopEntry: { x: 15, y: 18 }
      }
      recoveryTank.towedWreck = wreck
      wreck.towedBy = recoveryTank.id
      units.push(recoveryTank)

      // All state is set up, now run
      updateRecoveryTankLogic(units, gameState, delta)

      // Utility queue should maintain wreck tracking
      expect(recoveryTank.utilityQueue.currentTargetType).toBe('wreck')
    })

    it('should track unit in utility queue during repair', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 6, 6)
      recoveryTank.utilityQueue = {
        mode: 'repair',
        targets: [],
        currentTargetId: null,
        currentTargetType: null
      }
      const target = createTestUnit('tank1', 6, 6)
      target.health = 50
      recoveryTank.repairTarget = target
      recoveryTank.repairTargetUnit = target
      units.push(recoveryTank, target)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.utilityQueue.currentTargetId).toBe(target.id)
      expect(recoveryTank.utilityQueue.currentTargetType).toBe('unit')
    })
  })

  describe('Alert State Tracking', () => {
    it('should update alert state when service starts', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 6, 6)
      recoveryTank.alertMode = true
      recoveryTank._alertWasServing = false
      const target = createTestUnit('tank1', 6, 6)
      target.health = 50
      recoveryTank.repairTarget = target
      units.push(recoveryTank, target)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.alertActiveService).toBe(true)
    })

    it('should clear alert state when service ends', () => {
      const recoveryTank = createTestRecoveryTank('rt1')
      recoveryTank.alertMode = true
      recoveryTank._alertWasServing = true
      recoveryTank.recoveryTask = null
      recoveryTank.repairTarget = null
      recoveryTank.alertActiveService = true
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.alertActiveService).toBe(false)
      expect(recoveryTank.nextUtilityScanTime).toBeGreaterThan(0)
    })
  })

  describe('Recovery Task Priority', () => {
    it('should clear repair state when recovery task is active', () => {
      const recoveryTank = createTestRecoveryTank('rt1', 10, 10)
      recoveryTank.repairTarget = createTestUnit('tank1')
      recoveryTank.repairData = { totalCost: 100 }
      const wreck = createTestWreck('wreck1', 10, 10)
      const workshop = createTestWorkshop(15, 15)
      gameState.unitWrecks.push(wreck)
      gameState.buildings.push(workshop)
      recoveryTank.recoveryTask = {
        wreckId: wreck.id,
        mode: 'tow',
        state: 'movingToWreck',
        workshopId: workshop.id,
        workshopEntry: { x: 15, y: 18 }
      }
      units.push(recoveryTank)

      updateRecoveryTankLogic(units, gameState, delta)

      expect(recoveryTank.repairTarget).toBeNull()
      expect(recoveryTank.repairData).toBeNull()
    })
  })
})
