import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  TANK_FIRE_RANGE: 6
}))

vi.mock('../../src/units.js', () => ({
  findPathForOwner: vi.fn()
}))

vi.mock('../../src/sound.js', () => ({
  playSound: vi.fn(),
  playPositionalSound: vi.fn()
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    occupancyMap: [],
    attackGroupTargets: [],
    humanPlayer: 'player'
  }
}))

vi.mock('../../src/behaviours/retreat.js', () => ({
  cancelRetreatForUnits: vi.fn()
}))

vi.mock('../../src/game/harvesterLogic.js', () => ({
  forceHarvesterUnloadPriority: vi.fn()
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/main.js', () => ({
  units: []
}))

vi.mock('../../src/utils.js', () => ({
  getBuildingIdentifier: vi.fn(() => 'building-id')
}))

vi.mock('../../src/utils/helipadUtils.js', () => ({
  getHelipadLandingCenter: vi.fn(),
  getHelipadLandingTile: vi.fn()
}))

vi.mock('../../src/game/unitWreckManager.js', () => ({
  getWreckById: vi.fn(),
  findNearestWorkshop: vi.fn(),
  releaseWreckAssignment: vi.fn(),
  getRecycleDurationForWreck: vi.fn()
}))

vi.mock('../../src/game/tankerTruckUtils.js', () => ({
  computeTankerKamikazeApproach: vi.fn(),
  clearTankerKamikazeState: vi.fn(),
  updateKamikazeTargetPoint: vi.fn()
}))

vi.mock('../../src/network/gameCommandSync.js', () => ({
  broadcastUnitMove: vi.fn(),
  broadcastUnitAttack: vi.fn()
}))

vi.mock('../../src/game/unifiedMovement.js', () => ({
  resetUnitVelocityForNewPath: vi.fn()
}))

import { UnitCommandsHandler } from '../../src/input/unitCommands.js'
import {
  getUnitTilePosition,
  computeUtilityApproachPath,
  clearAttackGroupState,
  canAmbulanceProvideCrew,
  canTankerProvideFuel,
  canRecoveryTankRepair,
  canAmmunitionTruckOperate,
  canAmmunitionTruckProvideAmmo,
  isEnemyTargetForUnit,
  getTargetPoint,
  findUnitById
} from '../../src/input/unitCommands.js'
import { findPathForOwner } from '../../src/units.js'
import { playSound } from '../../src/sound.js'
import { showNotification } from '../../src/ui/notifications.js'
import { gameState } from '../../src/gameState.js'
import {
  findNearestWorkshop,
  getRecycleDurationForWreck,
  getWreckById
} from '../../src/game/unitWreckManager.js'
import { units } from '../../src/main.js'
import { getBuildingIdentifier } from '../../src/utils.js'

const createMapGrid = (width = 6, height = 6) =>
  Array.from({ length: height }, () => Array.from({ length: width }, () => 0))

describe('UnitCommandsHandler utility queues', () => {
  let handler
  let mapGrid

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new UnitCommandsHandler()
    mapGrid = createMapGrid()
    units.length = 0
    gameState.attackGroupTargets = []
    gameState.occupancyMap = mapGrid
    gameState.humanPlayer = 'player'
  })

  it('initializes and resets utility queue state when mode changes', () => {
    const unit = {}

    const queue = handler.ensureUtilityQueueState(unit, 'heal')

    expect(queue.mode).toBe('heal')
    expect(queue.targets).toEqual([])
    queue.targets.push({ id: 'u1', type: 'unit' })
    queue.currentTargetId = 'u1'

    handler.ensureUtilityQueueState(unit, 'refuel')

    expect(queue.mode).toBe('refuel')
    expect(queue.targets).toEqual([])
    expect(queue.currentTargetId).toBe(null)
    expect(queue.lockedByUser).toBe(false)
  })

  it('clears utility queue state without removing the queue object', () => {
    const unit = {
      utilityQueue: {
        mode: 'repair',
        targets: [{ id: 'u2', type: 'unit' }],
        currentTargetId: 'u2',
        currentTargetType: 'unit',
        currentTargetAction: 'tow',
        source: 'user',
        lockedByUser: true
      }
    }

    handler.clearUtilityQueueState(unit)

    expect(unit.utilityQueue.mode).toBe(null)
    expect(unit.utilityQueue.targets).toEqual([])
    expect(unit.utilityQueue.currentTargetId).toBe(null)
    expect(unit.utilityQueue.source).toBe(null)
    expect(unit.utilityQueue.lockedByUser).toBe(false)
  })

  it('cancels current utility task state based on unit type', () => {
    const ambulance = { type: 'ambulance', healingTarget: { id: 'u1' }, healingTimer: 5 }
    const tanker = { type: 'tankerTruck', refuelTarget: { id: 'u2' }, refuelTimer: 3, emergencyTarget: 'u3', emergencyMode: true }
    const recovery = {
      type: 'recoveryTank',
      repairTarget: { id: 'u4' },
      repairTargetUnit: { id: 'u4' },
      repairData: { progress: 1 },
      repairStarted: true
    }

    handler.cancelCurrentUtilityTask(ambulance)
    handler.cancelCurrentUtilityTask(tanker)
    handler.cancelCurrentUtilityTask(recovery)

    expect(ambulance.healingTarget).toBe(null)
    expect(ambulance.healingTimer).toBe(0)
    expect(tanker.refuelTarget).toBe(null)
    expect(tanker.refuelTimer).toBe(0)
    expect(tanker.emergencyTarget).toBe(null)
    expect(tanker.emergencyMode).toBe(false)
    expect(recovery.repairTarget).toBe(null)
    expect(recovery.repairTargetUnit).toBe(null)
    expect(recovery.repairData).toBe(null)
    expect(recovery.repairStarted).toBe(false)
  })

  it('validates wreck targets only for repair mode and assigned tanks', () => {
    const serviceUnit = { id: 'rt1', type: 'recoveryTank' }
    const wreck = { id: 'w1', isBeingRestored: false, isBeingRecycled: false, towedBy: null, assignedTankId: null }

    getWreckById.mockReturnValue(wreck)

    expect(handler.isUtilityTargetValid('heal', serviceUnit, { id: 'w1', isWreckTarget: true })).toBe(false)
    expect(handler.isUtilityTargetValid('repair', serviceUnit, { id: 'w1', isWreckTarget: true })).toBe(true)

    getWreckById.mockReturnValue({ ...wreck, assignedTankId: 'rt2' })
    expect(handler.isUtilityTargetValid('repair', serviceUnit, { id: 'w1', isWreckTarget: true })).toBe(false)
  })

  it('validates unit targets based on utility mode requirements', () => {
    const serviceUnit = { id: 'a1', type: 'ambulance', owner: 'player', ammoCargo: 0, maxAmmoCargo: 10 }

    expect(handler.isUtilityTargetValid('heal', serviceUnit, {
      id: 'tank1',
      type: 'tank',
      owner: 'player',
      health: 10,
      crew: { driver: false, gunner: true }
    })).toBe(true)

    expect(handler.isUtilityTargetValid('refuel', serviceUnit, {
      id: 'tank2',
      type: 'tank',
      owner: 'player',
      health: 10,
      gas: 5,
      maxGas: 20
    })).toBe(true)

    expect(handler.isUtilityTargetValid('ammoResupply', serviceUnit, {
      id: 'ammoFactory',
      type: 'ammunitionFactory',
      owner: 'player',
      health: 200
    })).toBe(true)

    expect(handler.isUtilityTargetValid('repair', serviceUnit, {
      id: 'tank3',
      type: 'tank',
      owner: 'player',
      health: 5,
      maxHealth: 10
    })).toBe(true)

    expect(handler.isUtilityTargetValid('repair', serviceUnit, {
      id: 'tank4',
      type: 'tank',
      owner: 'player',
      health: 10,
      maxHealth: 10
    })).toBe(false)
  })

  it('assigns an ambulance to a target and builds movement plan', () => {
    const ambulance = { id: 'amb1', type: 'ambulance', owner: 'player', tileX: 0, tileY: 0, medics: 1, health: 10 }
    const target = { id: 'tank1', type: 'tank', owner: 'player', tileX: 1, tileY: 0, crew: { driver: false, gunner: true } }

    findPathForOwner.mockReturnValue([{ x: 0, y: 0 }, { x: 1, y: 0 }])

    const result = handler.assignAmbulanceToTarget(ambulance, target, mapGrid, { suppressNotifications: true })

    expect(result).toBe(true)
    expect(ambulance.path).toEqual([{ x: 1, y: 0 }])
    expect(ambulance.moveTarget).toEqual({ x: 1, y: 0 })
    expect(ambulance.healingTarget).toBe(target)
    expect(ambulance.healingTimer).toBe(0)
  })

  it('rejects ambulance targets that already have full crew', () => {
    const ambulance = { id: 'amb1', type: 'ambulance', owner: 'player', tileX: 0, tileY: 0, medics: 1, health: 10 }
    const target = { id: 'tank1', type: 'tank', owner: 'player', tileX: 1, tileY: 0, crew: { driver: true, gunner: true } }

    const result = handler.assignAmbulanceToTarget(ambulance, target, mapGrid)

    expect(result).toBe(false)
    expect(showNotification).toHaveBeenCalledWith('Target unit is already fully crewed!', 2000)
  })

  it('assigns a tanker truck to a refuel target', () => {
    const tanker = { id: 'tank1', type: 'tankerTruck', owner: 'player', tileX: 0, tileY: 0, health: 5 }
    const target = { id: 'unit1', type: 'tank', owner: 'player', tileX: 1, tileY: 0, gas: 0, maxGas: 10 }

    findPathForOwner.mockReturnValue([{ x: 0, y: 0 }, { x: 1, y: 0 }])

    const result = handler.assignTankerToTarget(tanker, target, mapGrid, { suppressNotifications: true })

    expect(result).toBe(true)
    expect(tanker.path).toEqual([{ x: 1, y: 0 }])
    expect(tanker.moveTarget).toEqual({ x: 1, y: 0 })
    expect(tanker.refuelTarget).toBe(target)
  })

  it('assigns ammunition trucks for resupply and sets queue metadata', () => {
    const ammoTruck = {
      id: 'ammo1',
      type: 'ammunitionTruck',
      owner: 'player',
      health: 10,
      ammoCargo: 5,
      maxAmmoCargo: 10,
      tileX: 1,
      tileY: 1
    }
    const building = { id: 'b1', type: 'ammunitionFactory', owner: 'player', x: 2, y: 2, width: 2, height: 2, ammo: 0, maxAmmo: 10 }

    findPathForOwner.mockReturnValue([{ x: 1, y: 1 }, { x: 1, y: 2 }])

    const result = handler.assignAmmunitionTruckToTarget(ammoTruck, building, mapGrid, { suppressNotifications: true })

    expect(result).toBe(true)
    expect(ammoTruck.ammoResupplyTarget).toBe(building)
    expect(ammoTruck.ammoResupplyTimer).toBe(0)
    expect(ammoTruck.utilityQueue.currentTargetId).toBe('b1')
    expect(ammoTruck.utilityQueue.currentTargetType).toBe('building')
  })

  it('blocks recovery tasks when another tank is assigned to the wreck', () => {
    const tank = { id: 'rt1', type: 'recoveryTank', owner: 'player', tileX: 0, tileY: 0, health: 10 }
    const wreck = { id: 'w1' }

    getWreckById.mockReturnValue({
      id: 'w1',
      assignedTankId: 'rt2',
      isBeingRestored: false,
      isBeingRecycled: false,
      towedBy: null
    })

    units.push({ id: 'rt2', type: 'recoveryTank', health: 10 })

    const result = handler.assignRecoveryTankToWreck(tank, wreck, mapGrid)

    expect(result).toBe(false)
    expect(showNotification).toHaveBeenCalledWith('Another recovery tank is already assigned to this wreck.', 2000)
  })

  it('assigns recovery tanks to tow wrecks and records workshop data', () => {
    // Recovery tank needs crew with loader for canRecoveryTankRepair to pass
    const tank = {
      id: 'rt1',
      type: 'recoveryTank',
      owner: 'player',
      tileX: 0,
      tileY: 0,
      health: 10,
      crew: { loader: true }
    }
    const wreck = { id: 'w1' }

    // Wreck must have valid coordinates for path computation
    getWreckById.mockReturnValue({
      id: 'w1',
      tileX: 1,
      tileY: 0,
      x: 32,
      y: 0,
      assignedTankId: null,
      isBeingRestored: false,
      isBeingRecycled: false,
      towedBy: null
    })

    findNearestWorkshop.mockReturnValue({
      workshop: { id: 'ws1', owner: 'player', x: 5, y: 5 },
      entryTile: { x: 6, y: 5 }
    })

    findPathForOwner.mockReturnValue([{ x: 0, y: 0 }, { x: 1, y: 0 }])

    const result = handler.assignRecoveryTankToWreck(tank, wreck, mapGrid, { suppressNotifications: true })

    expect(result).toBe(true)
    expect(tank.recoveryTask).toMatchObject({
      wreckId: 'w1',
      mode: 'tow',
      state: 'movingToWreck',
      workshopId: 'ws1',
      workshopOwner: 'player',
      workshopX: 5,
      workshopY: 5,
      workshopEntry: { x: 6, y: 5 }
    })
    expect(tank.guardMode).toBe(false)
    expect(playSound).not.toHaveBeenCalled()
  })

  it('starts the next utility task for queued wreck targets', () => {
    const tank = {
      id: 'rt1',
      type: 'recoveryTank',
      owner: 'player',
      tileX: 0,
      tileY: 0,
      health: 10,
      utilityQueue: {
        mode: 'repair',
        targets: [{ id: 'w2', type: 'wreck', action: 'recycle' }],
        currentTargetId: null,
        currentTargetType: null,
        currentTargetAction: null,
        source: 'user',
        lockedByUser: false
      }
    }

    getWreckById.mockReturnValue({ id: 'w2' })
    getRecycleDurationForWreck.mockReturnValue(10)
    vi.spyOn(handler, 'isUtilityTargetValid').mockReturnValue(true)
    vi.spyOn(handler, 'assignRecoveryTankToWreck').mockReturnValue(true)

    const result = handler.startNextUtilityTask(tank, mapGrid, true)

    expect(result).toBe(true)
    expect(handler.assignRecoveryTankToWreck).toHaveBeenCalledWith(
      tank,
      { id: 'w2' },
      mapGrid,
      { suppressNotifications: true, mode: 'recycle' }
    )
    expect(tank.utilityQueue.currentTargetId).toBe('w2')
    expect(tank.utilityQueue.currentTargetType).toBe('wreck')
    expect(tank.utilityQueue.currentTargetAction).toBe('recycle')
  })

  it('reports queue position for current and queued targets', () => {
    const unit = {
      utilityQueue: {
        currentTargetId: 'u1',
        currentTargetType: 'unit',
        targets: [{ id: 'u2', type: 'unit' }, { id: 'w1', type: 'wreck' }]
      }
    }

    expect(handler.getUtilityQueuePosition(unit, { id: 'u1' })).toBe(1)
    expect(handler.getUtilityQueuePosition(unit, { id: 'u2' })).toBe(2)
    expect(handler.getUtilityQueuePosition(unit, { id: 'w1', isWreckTarget: true })).toBe(3)
  })
})

describe('UnitCommandsHandler handleAttackCommand', () => {
  let handler
  let mapGrid

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new UnitCommandsHandler()
    mapGrid = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ type: 'land' })))
    units.length = 0
    gameState.attackGroupTargets = []
    gameState.occupancyMap = mapGrid
    gameState.humanPlayer = 'player'
  })

  it('should assign attack targets to selected units', () => {
    const selectedUnits = [
      { id: 'u1', type: 'tank', owner: 'player', tileX: 0, tileY: 0, health: 100 },
      { id: 'u2', type: 'tank', owner: 'player', tileX: 1, tileY: 0, health: 100 }
    ]
    const target = { id: 'enemy1', owner: 'enemy', tileX: 5, tileY: 5, x: 160, y: 160, health: 100 }

    findPathForOwner.mockReturnValue([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])

    handler.handleAttackCommand(selectedUnits, target, mapGrid, false)

    expect(selectedUnits[0].target).toBe(target)
    expect(selectedUnits[1].target).toBe(target)
  })

  it('should set forcedAttack when isForceAttack is true', () => {
    const selectedUnits = [
      { id: 'u1', type: 'tank', owner: 'player', tileX: 0, tileY: 0, health: 100 }
    ]
    const target = { id: 'enemy1', owner: 'enemy', tileX: 5, tileY: 5, x: 160, y: 160, health: 100 }

    findPathForOwner.mockReturnValue([{ x: 0, y: 0 }, { x: 2, y: 2 }])

    handler.handleAttackCommand(selectedUnits, target, mapGrid, true)

    expect(selectedUnits[0].forcedAttack).toBe(true)
  })

  it('should handle empty selectedUnits array gracefully', () => {
    const target = { id: 'enemy1', owner: 'enemy', tileX: 5, tileY: 5, x: 160, y: 160, health: 100 }

    expect(() => handler.handleAttackCommand([], target, mapGrid, false)).not.toThrow()
  })
})

describe('UnitCommandsHandler handleRefineryUnloadCommand', () => {
  let handler
  let mapGrid

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new UnitCommandsHandler()
    mapGrid = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ type: 'land' })))
    units.length = 0
    gameState.attackGroupTargets = []
    gameState.occupancyMap = mapGrid
    gameState.humanPlayer = 'player'
  })

  it('should assign refinery to harvesters', () => {
    const harvesters = [
      { id: 'h1', type: 'harvester', owner: 'player', tileX: 0, tileY: 0, oreCarried: 100, health: 100 }
    ]
    const refinery = { id: 'ref1', type: 'refinery', owner: 'player', x: 5, y: 5, width: 2, height: 2, health: 500 }

    findPathForOwner.mockReturnValue([{ x: 0, y: 0 }, { x: 3, y: 5 }])

    handler.handleRefineryUnloadCommand(harvesters, refinery, mapGrid)

    expect(harvesters[0].assignedRefinery).toBe(refinery)
  })

  it('should handle harvesters with no resources', () => {
    const harvesters = [
      { id: 'h1', type: 'harvester', owner: 'player', tileX: 0, tileY: 0, heldResources: 0, health: 100 }
    ]
    const refinery = { id: 'ref1', type: 'refinery', owner: 'player', x: 5, y: 5, width: 2, height: 2, health: 500 }

    findPathForOwner.mockReturnValue([{ x: 0, y: 0 }, { x: 3, y: 5 }])

    // Should still process the command
    expect(() => handler.handleRefineryUnloadCommand(harvesters, refinery, mapGrid)).not.toThrow()
  })
})

describe('UnitCommandsHandler handleHarvesterCommand', () => {
  let handler
  let mapGrid

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new UnitCommandsHandler()
    mapGrid = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => ({ type: 'land', ore: 0 })))
    units.length = 0
    gameState.attackGroupTargets = []
    gameState.occupancyMap = mapGrid
    gameState.humanPlayer = 'player'
  })

  it('should set manualOreTarget when commanding harvesters to ore location', () => {
    const harvesters = [
      { id: 'h1', type: 'harvester', owner: 'player', tileX: 0, tileY: 0, health: 100, x: 0, y: 0 }
    ]
    const oreTarget = { x: 5, y: 5 }
    mapGrid[5][5].ore = 100

    findPathForOwner.mockReturnValue([{ x: 0, y: 0 }, { x: 5, y: 5 }])

    handler.handleHarvesterCommand(harvesters, oreTarget, mapGrid)

    expect(harvesters[0].manualOreTarget).toEqual(oreTarget)
    expect(harvesters[0].moveTarget).toEqual(oreTarget)
  })
})

describe('UnitCommandsHandler attack group and movement', () => {
  let handler
  let mapGrid

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new UnitCommandsHandler()
    mapGrid = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({ type: 'land' })))
    units.length = 0
    gameState.attackGroupTargets = []
    gameState.occupancyMap = mapGrid
    gameState.humanPlayer = 'player'
  })

  it('clears attack group state and attack queues from units', () => {
    const unitWithQueue = { id: 'u1', attackQueue: [{ target: { id: 't1' } }] }
    const unitNoQueue = { id: 'u2' }
    gameState.attackGroupTargets = [{ id: 't1' }]

    handler.clearAttackGroupState([unitWithQueue, unitNoQueue])

    expect(unitWithQueue.attackQueue).toBe(null)
    expect(gameState.attackGroupTargets).toEqual([])
  })

  it('validates canAmbulanceProvideCrew returns false for invalid units', () => {
    expect(handler.canAmbulanceProvideCrew(null)).toBe(false)
    expect(handler.canAmbulanceProvideCrew({ type: 'tank' })).toBe(false)
    expect(handler.canAmbulanceProvideCrew({ type: 'ambulance', health: 0 })).toBe(false)
    expect(handler.canAmbulanceProvideCrew({ type: 'ambulance', health: 10, crew: { loader: false } })).toBe(false)
    expect(handler.canAmbulanceProvideCrew({ type: 'ambulance', health: 10, medics: 0 })).toBe(false)
    expect(handler.canAmbulanceProvideCrew({ type: 'ambulance', health: 10, medics: 1 })).toBe(true)
  })

  it('validates canTankerProvideFuel returns false for invalid units', () => {
    expect(handler.canTankerProvideFuel(null)).toBe(false)
    expect(handler.canTankerProvideFuel({ type: 'tank' })).toBe(false)
    expect(handler.canTankerProvideFuel({ type: 'tankerTruck', health: 0 })).toBe(false)
    expect(handler.canTankerProvideFuel({ type: 'tankerTruck', health: 10, crew: { loader: false } })).toBe(false)
    expect(handler.canTankerProvideFuel({ type: 'tankerTruck', health: 10 })).toBe(true)
  })

  it('validates canRecoveryTankRepair returns false for invalid units', () => {
    expect(handler.canRecoveryTankRepair(null)).toBe(false)
    expect(handler.canRecoveryTankRepair({ type: 'tank' })).toBe(false)
    expect(handler.canRecoveryTankRepair({ type: 'recoveryTank', health: 0 })).toBe(false)
    expect(handler.canRecoveryTankRepair({ type: 'recoveryTank', health: 10, crew: { loader: false } })).toBe(false)
    expect(handler.canRecoveryTankRepair({ type: 'recoveryTank', health: 10 })).toBe(true)
  })

  it('validates canAmmunitionTruckOperate and canAmmunitionTruckProvideAmmo', () => {
    expect(handler.canAmmunitionTruckOperate(null)).toBe(false)
    expect(handler.canAmmunitionTruckOperate({ type: 'tank' })).toBe(false)
    expect(handler.canAmmunitionTruckOperate({ type: 'ammunitionTruck', health: 0 })).toBe(false)
    expect(handler.canAmmunitionTruckOperate({ type: 'ammunitionTruck', health: 10, crew: { loader: false } })).toBe(false)
    expect(handler.canAmmunitionTruckOperate({ type: 'ammunitionTruck', health: 10 })).toBe(true)

    expect(handler.canAmmunitionTruckProvideAmmo({ type: 'ammunitionTruck', health: 10, ammoCargo: 0 })).toBe(false)
    expect(handler.canAmmunitionTruckProvideAmmo({ type: 'ammunitionTruck', health: 10, ammoCargo: 5 })).toBe(true)
  })

  it('cancels recovery task and releases wreck assignment', () => {
    const wreckData = { id: 'w1', assignedTankId: 'rt1', towedBy: 'rt1' }
    getWreckById.mockReturnValue(wreckData)

    const tank = {
      id: 'rt1',
      type: 'recoveryTank',
      recoveryTask: { wreckId: 'w1' },
      towedWreck: { id: 'w1' },
      recoveryProgress: 50
    }

    handler.cancelRecoveryTask(tank)

    expect(tank.recoveryTask).toBe(null)
    expect(tank.towedWreck).toBe(null)
    expect(tank.recoveryProgress).toBe(0)
  })

  it('cancels recovery task does nothing for non-recovery tanks', () => {
    const tank = { id: 'u1', type: 'tank', recoveryTask: null }
    handler.cancelRecoveryTask(tank)
    expect(tank.recoveryTask).toBe(null)
  })

  it('findUnitById returns null for missing id', () => {
    expect(handler.findUnitById(null)).toBe(null)
    expect(handler.findUnitById(undefined)).toBe(null)
    units.push({ id: 'u1', type: 'tank' })
    expect(handler.findUnitById('u1')).toEqual({ id: 'u1', type: 'tank' })
    expect(handler.findUnitById('nonexistent')).toBe(null)
  })

  it('advanceUtilityQueue clears mode when queue is empty', () => {
    const unit = {
      utilityQueue: {
        mode: 'heal',
        targets: [],
        currentTargetId: 'u1',
        currentTargetType: 'unit',
        currentTargetAction: null,
        source: 'user',
        lockedByUser: true
      }
    }

    const result = handler.advanceUtilityQueue(unit, mapGrid, true)

    expect(result).toBe(false)
    expect(unit.utilityQueue.mode).toBe(null)
    expect(unit.utilityQueue.currentTargetId).toBe(null)
    expect(unit.utilityQueue.lockedByUser).toBe(false)
  })

  it('isEnemyTargetForUnit properly detects enemy targets', () => {
    expect(handler.isEnemyTargetForUnit(null, { owner: 'player1' })).toBe(false)
    expect(handler.isEnemyTargetForUnit({ owner: 'player2' }, null)).toBe(false)
    expect(handler.isEnemyTargetForUnit({ owner: 'player2' }, { owner: 'player1' })).toBe(true)
    expect(handler.isEnemyTargetForUnit({ owner: 'player1' }, { owner: 'player1' })).toBe(false)
    expect(handler.isEnemyTargetForUnit({ owner: 'player' }, { owner: 'player1' })).toBe(false)
  })

  it('calculateSemicircleFormation arranges single unit directly in front', () => {
    const units = [{ id: 'u1' }]
    const target = { tileX: 5, tileY: 5, x: 160, y: 160 }
    const safeDistance = 100

    const positions = handler.calculateSemicircleFormation(units, target, safeDistance)

    expect(positions).toHaveLength(1)
    expect(positions[0].x).toBeCloseTo(target.x + 32 / 2 - safeDistance, 1)
  })

  it('calculateSemicircleFormation creates arc for multiple units', () => {
    const selectedUnits = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]
    const target = { tileX: 5, tileY: 5, x: 160, y: 160 }
    const safeDistance = 100

    const positions = handler.calculateSemicircleFormation(selectedUnits, target, safeDistance)

    expect(positions).toHaveLength(3)
    // Positions should form an arc around the target
    positions.forEach(pos => {
      const dx = pos.x - (target.x + 16)
      const dy = pos.y - (target.y + 16)
      const dist = Math.hypot(dx, dy)
      expect(dist).toBeCloseTo(safeDistance, 1)
    })
  })

  it('getTargetPoint returns center for units with tileX', () => {
    const unitTarget = { tileX: 3, tileY: 4, x: 96, y: 128 }
    const point = handler.getTargetPoint(unitTarget, { x: 0, y: 0 })
    expect(point.x).toBe(96 + 16)
    expect(point.y).toBe(128 + 16)
  })

  it('getTargetPoint returns closest point for buildings', () => {
    const buildingTarget = { x: 4, y: 5, width: 2, height: 2 }
    const unitCenter = { x: 64, y: 80 }
    const point = handler.getTargetPoint(buildingTarget, unitCenter)
    // Building is at pixel 128,160 to 192,224. Unit center at 64,80 is to the left and above
    expect(point.x).toBe(128) // Clipped to left edge
    expect(point.y).toBe(160) // Clipped to top edge
  })

  it('handleDamagedUnitToRecoveryTankCommand queues repair targets', () => {
    const recoveryTank = {
      id: 'rt1',
      type: 'recoveryTank',
      owner: 'player',
      tileX: 0,
      tileY: 0,
      health: 100
    }

    const damagedUnits = [
      { id: 'u1', type: 'tank', owner: 'player', health: 50, maxHealth: 100 },
      { id: 'u2', type: 'harvester', owner: 'player', health: 30, maxHealth: 80 }
    ]

    vi.spyOn(handler, 'setUtilityQueue').mockReturnValue({ addedTargets: damagedUnits, started: true })

    handler.handleDamagedUnitToRecoveryTankCommand(damagedUnits, recoveryTank, mapGrid)

    expect(handler.setUtilityQueue).toHaveBeenCalledWith(
      recoveryTank,
      damagedUnits,
      'repair',
      mapGrid,
      { append: true, suppressNotifications: true, priority: true }
    )
    expect(playSound).toHaveBeenCalledWith('movement', 0.5)
  })

  it('handleDamagedUnitToRecoveryTankCommand skips fully healthy units', () => {
    const recoveryTank = { id: 'rt1', type: 'recoveryTank', owner: 'player' }
    const healthyUnits = [
      { id: 'u1', type: 'tank', owner: 'player', health: 100, maxHealth: 100 },
      { id: 'u2', type: 'recoveryTank', owner: 'player', health: 50, maxHealth: 100 } // Skipped due to type
    ]

    vi.spyOn(handler, 'setUtilityQueue')

    handler.handleDamagedUnitToRecoveryTankCommand(healthyUnits, recoveryTank, mapGrid)

    expect(handler.setUtilityQueue).not.toHaveBeenCalled()
  })

  it('issueTankerKamikazeCommand sets kamikaze state and path', async() => {
    const tanker = {
      id: 't1',
      type: 'tankerTruck',
      owner: 'player',
      tileX: 0,
      tileY: 0,
      refuelTarget: { id: 'u1' },
      refuelTimer: 5,
      emergencyTarget: { id: 'u2' },
      emergencyMode: true
    }
    const target = { id: 'enemy1', owner: 'enemy', tileX: 3, tileY: 3, x: 96, y: 96 }

    const { computeTankerKamikazeApproach } = await import('../../src/game/tankerTruckUtils.js')
    computeTankerKamikazeApproach.mockReturnValue({
      path: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }],
      moveTarget: { x: 2, y: 2 }
    })

    handler.issueTankerKamikazeCommand(tanker, target, mapGrid)

    expect(tanker.kamikazeMode).toBe(true)
    expect(tanker.kamikazeTargetId).toBe('enemy1')
    expect(tanker.kamikazeTargetType).toBe('unit')
    expect(tanker.forcedAttack).toBe(true)
    expect(tanker.refuelTarget).toBe(null)
    expect(tanker.refuelTimer).toBe(0)
    expect(tanker.emergencyTarget).toBe(null)
    expect(tanker.emergencyMode).toBe(false)
  })

  it('handleMovementCommand filters out units without commanders', () => {
    const commandableUnit = { id: 'u1', type: 'tank', owner: 'player', tileX: 0, tileY: 0 }
    const noCommanderUnit = {
      id: 'u2',
      type: 'tank',
      owner: 'player',
      tileX: 0,
      tileY: 0,
      crew: { commander: false, driver: true }
    }

    findPathForOwner.mockReturnValue([{ x: 0, y: 0 }, { x: 1, y: 1 }])

    handler.handleMovementCommand([commandableUnit, noCommanderUnit], 32, 32, mapGrid)

    expect(showNotification).not.toHaveBeenCalled() // At least one commandable unit exists
  })

  it('handleMovementCommand shows notification when all units lack commanders', () => {
    const noCommanderUnit = {
      id: 'u1',
      type: 'tank',
      owner: 'player',
      tileX: 0,
      tileY: 0,
      crew: { commander: false, driver: true }
    }

    handler.handleMovementCommand([noCommanderUnit], 32, 32, mapGrid)

    expect(showNotification).toHaveBeenCalledWith('Cannot command units without commanders!', 2000)
  })
  it('handleMovementCommand aborts unreachable movement and notifies human player', () => {
    const unit = { id: 'u1', type: 'tank', owner: 'player', tileX: 0, tileY: 0 }

    findPathForOwner.mockReturnValue(null)

    handler.handleMovementCommand([unit], 96, 96, mapGrid)

    expect(unit.path).toEqual([])
    expect(unit.moveTarget).toBe(null)
    expect(showNotification).toHaveBeenCalledWith('Cannot reach that location. Move command aborted.', 2200)
  })

  it('handleMovementCommand does not notify for unreachable non-human units', () => {
    const aiUnit = { id: 'u2', type: 'tank', owner: 'enemy', tileX: 0, tileY: 0 }

    findPathForOwner.mockReturnValue(null)

    handler.handleMovementCommand([aiUnit], 96, 96, mapGrid)

    expect(showNotification).not.toHaveBeenCalledWith('Cannot reach that location. Move command aborted.', 2200)
  })


  it('handleMovementCommand no-ops F22 already in landing sequence for same airstrip', () => {
    vi.mocked(getBuildingIdentifier).mockImplementation(building => building.id)

    gameState.buildings = [{
      id: 'airstrip-1',
      type: 'airstrip',
      owner: 'player',
      health: 100,
      x: 1,
      y: 1,
      width: 4,
      height: 3,
      runwayPoints: {
        runwayExit: { x: 96, y: 96 }
      }
    }]

    const f22 = {
      id: 'f22-1',
      type: 'f22Raptor',
      owner: 'player',
      tileX: 2,
      tileY: 2,
      x: 64,
      y: 64,
      maxGas: 100,
      gas: 100,
      flightState: 'airborne',
      f22State: 'approach_runway',
      airstripId: 'airstrip-1',
      helipadTargetId: 'airstrip-1',
      landedHelipadId: null,
      target: { id: 'enemy' },
      forcedAttack: true
    }

    const assignSpy = vi.spyOn(handler, 'assignApacheFlight')

    handler.handleMovementCommand([f22], 64, 64, createMapGrid(10, 10))

    expect(assignSpy).not.toHaveBeenCalled()
    expect(f22.target).toEqual({ id: 'enemy' })
    expect(f22.forcedAttack).toBe(true)
  })

  it('handleMovementCommand still assigns F22 flight to a different airstrip', () => {
    vi.mocked(getBuildingIdentifier).mockImplementation(building => building.id)

    gameState.buildings = [{
      id: 'airstrip-2',
      type: 'airstrip',
      owner: 'player',
      health: 100,
      x: 1,
      y: 1,
      width: 4,
      height: 3,
      runwayPoints: {
        runwayExit: { x: 96, y: 96 }
      }
    }]

    const f22 = {
      id: 'f22-2',
      type: 'f22Raptor',
      owner: 'player',
      tileX: 2,
      tileY: 2,
      x: 64,
      y: 64,
      maxGas: 100,
      gas: 100,
      flightState: 'airborne',
      f22State: 'approach_runway',
      airstripId: 'airstrip-1',
      helipadTargetId: 'airstrip-1',
      landedHelipadId: null,
      target: { id: 'enemy' },
      forcedAttack: true
    }

    const assignSpy = vi.spyOn(handler, 'assignApacheFlight').mockReturnValue(true)

    handler.handleMovementCommand([f22], 64, 64, createMapGrid(10, 10))

    expect(assignSpy).toHaveBeenCalledOnce()
    expect(f22.target).toBe(null)
    expect(f22.forcedAttack).toBe(false)
  })


  it('planUtilityAssignments distributes targets among service units', () => {
    const ambulance1 = { id: 'amb1', type: 'ambulance', owner: 'player', tileX: 0, tileY: 0, x: 0, y: 0, health: 10, medics: 2 }
    const ambulance2 = { id: 'amb2', type: 'ambulance', owner: 'player', tileX: 5, tileY: 5, x: 160, y: 160, health: 10, medics: 2 }

    const target1 = { id: 't1', type: 'tank', owner: 'player', tileX: 1, tileY: 0, x: 32, y: 0, health: 50, maxHealth: 100, crew: { driver: false } }
    const target2 = { id: 't2', type: 'tank', owner: 'player', tileX: 4, tileY: 5, x: 128, y: 160, health: 50, maxHealth: 100, crew: { gunner: false } }

    findPathForOwner.mockReturnValue([{ x: 0, y: 0 }, { x: 1, y: 0 }])

    const result = handler.planUtilityAssignments(
      [ambulance1, ambulance2],
      [target1, target2],
      'heal',
      mapGrid
    )

    expect(result.assignments.length).toBeGreaterThan(0)
  })

  it('queueUtilityTargets returns false when no capable units', () => {
    const result = handler.queueUtilityTargets([], [{ id: 't1' }], 'heal', mapGrid)
    expect(result).toBe(false)
  })
})

describe('Exported utility functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    units.length = 0
    gameState.attackGroupTargets = []
  })

  describe('getUnitTilePosition', () => {
    it('returns null for null/undefined unit', () => {
      expect(getUnitTilePosition(null)).toBe(null)
      expect(getUnitTilePosition(undefined)).toBe(null)
    })

    it('returns tile coordinates when unit has tileX/tileY', () => {
      const unit = { tileX: 5, tileY: 3 }
      expect(getUnitTilePosition(unit)).toEqual({ x: 5, y: 3 })
    })

    it('converts pixel coordinates to tile coordinates', () => {
      const unit = { x: 160, y: 96 } // TILE_SIZE = 32, so 160/32 = 5, 96/32 = 3
      expect(getUnitTilePosition(unit)).toEqual({ x: 5, y: 3 })
    })

    it('handles pixel coordinates with offset correctly', () => {
      const unit = { x: 175, y: 111 } // 175 + 16 = 191, floor(191/32) = 5; 111 + 16 = 127, floor(127/32) = 3
      expect(getUnitTilePosition(unit)).toEqual({ x: 5, y: 3 })
    })
  })

  describe('computeUtilityApproachPath', () => {
    let mapGrid

    beforeEach(() => {
      mapGrid = createMapGrid(6, 6)
    })

    it('returns null for invalid inputs', () => {
      expect(computeUtilityApproachPath(null, {}, 'heal', mapGrid)).toBe(null)
      expect(computeUtilityApproachPath({}, null, 'heal', mapGrid)).toBe(null)
      expect(computeUtilityApproachPath({}, {}, 'heal', null)).toBe(null)
      expect(computeUtilityApproachPath({}, {}, 'heal', [])).toBe(null)
    })

    it('returns null when start tile cannot be determined', () => {
      const serviceUnit = { owner: 'player' }
      const target = { tileX: 1, tileY: 1 }
      expect(computeUtilityApproachPath(serviceUnit, target, 'heal', mapGrid)).toBe(null)
    })

    it('computes heal approach path using ambulance offsets', () => {
      const serviceUnit = { tileX: 0, tileY: 0, owner: 'player' }
      const target = { tileX: 2, tileY: 2 }

      findPathForOwner.mockReturnValue([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])

      const result = computeUtilityApproachPath(serviceUnit, target, 'heal', mapGrid)

      expect(result).toBeTruthy()
      expect(result.path).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])
      expect(result.destinationTile).toEqual({ x: 2, y: 2 })
      expect(findPathForOwner).toHaveBeenCalled()
    })

    it('computes repair approach path for wreck targets', () => {
      const serviceUnit = { tileX: 0, tileY: 0, owner: 'player' }
      const target = { tileX: 2, tileY: 2, isWreckTarget: true }

      findPathForOwner.mockReturnValue([{ x: 0, y: 0 }, { x: 1, y: 1 }])

      const result = computeUtilityApproachPath(serviceUnit, target, 'repair', mapGrid)

      expect(result).toBeTruthy()
      expect(findPathForOwner).toHaveBeenCalledWith(
        { x: 0, y: 0 },
        expect.any(Object),
        mapGrid,
        gameState.occupancyMap,
        'player'
      )
    })
  })

  describe('clearAttackGroupState', () => {
    it('clears attack queues from units', () => {
      const unitWithQueue = { id: 'u1', attackQueue: [{ target: { id: 't1' } }] }
      const unitNoQueue = { id: 'u2' }
      gameState.attackGroupTargets = [{ id: 't1' }]

      clearAttackGroupState([unitWithQueue, unitNoQueue])

      expect(unitWithQueue.attackQueue).toBe(null)
      expect(gameState.attackGroupTargets).toEqual([])
    })
  })

  describe('canAmbulanceProvideCrew', () => {
    it('returns false for invalid ambulances', () => {
      expect(canAmbulanceProvideCrew(null)).toBe(false)
      expect(canAmbulanceProvideCrew({ type: 'tank' })).toBe(false)
      expect(canAmbulanceProvideCrew({ type: 'ambulance', health: 0 })).toBe(false)
      expect(canAmbulanceProvideCrew({ type: 'ambulance', health: 10, crew: { loader: false } })).toBe(false)
      expect(canAmbulanceProvideCrew({ type: 'ambulance', health: 10, medics: 0 })).toBe(false)
    })

    it('returns true for valid ambulances', () => {
      expect(canAmbulanceProvideCrew({ type: 'ambulance', health: 10, medics: 1 })).toBe(true)
    })
  })

  describe('canTankerProvideFuel', () => {
    it('returns false for invalid tankers', () => {
      expect(canTankerProvideFuel(null)).toBe(false)
      expect(canTankerProvideFuel({ type: 'tank' })).toBe(false)
      expect(canTankerProvideFuel({ type: 'tankerTruck', health: 0 })).toBe(false)
      expect(canTankerProvideFuel({ type: 'tankerTruck', health: 10, crew: { loader: false } })).toBe(false)
    })

    it('returns true for valid tankers', () => {
      expect(canTankerProvideFuel({ type: 'tankerTruck', health: 10 })).toBe(true)
    })
  })

  describe('canRecoveryTankRepair', () => {
    it('returns false for invalid recovery tanks', () => {
      expect(canRecoveryTankRepair(null)).toBe(false)
      expect(canRecoveryTankRepair({ type: 'tank' })).toBe(false)
      expect(canRecoveryTankRepair({ type: 'recoveryTank', health: 0 })).toBe(false)
      expect(canRecoveryTankRepair({ type: 'recoveryTank', health: 10, crew: { loader: false } })).toBe(false)
    })

    it('returns true for valid recovery tanks', () => {
      expect(canRecoveryTankRepair({ type: 'recoveryTank', health: 10 })).toBe(true)
    })
  })

  describe('canAmmunitionTruckOperate', () => {
    it('returns false for invalid ammo trucks', () => {
      expect(canAmmunitionTruckOperate(null)).toBe(false)
      expect(canAmmunitionTruckOperate({ type: 'tank' })).toBe(false)
      expect(canAmmunitionTruckOperate({ type: 'ammunitionTruck', health: 0 })).toBe(false)
      expect(canAmmunitionTruckOperate({ type: 'ammunitionTruck', health: 10, crew: { loader: false } })).toBe(false)
    })

    it('returns true for operational ammo trucks', () => {
      expect(canAmmunitionTruckOperate({ type: 'ammunitionTruck', health: 10 })).toBe(true)
    })
  })

  describe('canAmmunitionTruckProvideAmmo', () => {
    it('returns false when truck cannot operate', () => {
      expect(canAmmunitionTruckProvideAmmo({ type: 'ammunitionTruck', health: 0 })).toBe(false)
    })

    it('returns false when truck has no ammo', () => {
      expect(canAmmunitionTruckProvideAmmo({ type: 'ammunitionTruck', health: 10, ammoCargo: 0 })).toBe(false)
    })

    it('returns true when truck has ammo', () => {
      expect(canAmmunitionTruckProvideAmmo({ type: 'ammunitionTruck', health: 10, ammoCargo: 5 })).toBe(true)
    })
  })

  describe('isEnemyTargetForUnit', () => {
    it('returns false for invalid inputs', () => {
      expect(isEnemyTargetForUnit(null, { owner: 'player1' })).toBe(false)
      expect(isEnemyTargetForUnit({ owner: 'player2' }, null)).toBe(false)
    })

    it('detects enemy targets correctly', () => {
      expect(isEnemyTargetForUnit({ owner: 'player2' }, { owner: 'player1' })).toBe(true)
      expect(isEnemyTargetForUnit({ owner: 'player1' }, { owner: 'player1' })).toBe(false)
      expect(isEnemyTargetForUnit({ owner: 'player' }, { owner: 'player1' })).toBe(false)
    })
  })

  describe('getTargetPoint', () => {
    it('returns center point for units with tileX', () => {
      const unitTarget = { tileX: 3, tileY: 4, x: 96, y: 128 }
      const point = getTargetPoint(unitTarget, { x: 0, y: 0 })
      expect(point.x).toBe(96 + 16)
      expect(point.y).toBe(128 + 16)
    })

    it('returns closest point on building rectangle', () => {
      const buildingTarget = { x: 4, y: 5, width: 2, height: 2 }
      const unitCenter = { x: 64, y: 80 }
      const point = getTargetPoint(buildingTarget, unitCenter)
      // Building is at pixel 128,160 to 192,224. Unit center at 64,80 is to the left and above
      expect(point.x).toBe(128) // Clipped to left edge
      expect(point.y).toBe(160) // Clipped to top edge
    })
  })

  describe('findUnitById', () => {
    it('returns null for invalid id', () => {
      expect(findUnitById(null)).toBe(null)
      expect(findUnitById(undefined)).toBe(null)
    })

    it('finds unit by id', () => {
      units.push({ id: 'u1', type: 'tank' })
      expect(findUnitById('u1')).toEqual({ id: 'u1', type: 'tank' })
      expect(findUnitById('nonexistent')).toBe(null)
    })
  })
})
