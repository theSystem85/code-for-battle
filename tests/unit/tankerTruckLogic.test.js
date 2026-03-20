import { describe, it, expect, beforeEach, vi } from 'vitest'
import '../setup.js'

// Mock dependencies
vi.mock('../../src/config.js', async() => {
  const actual = await vi.importActual('../../src/config.js')
  return {
    ...actual,
    TILE_SIZE: 32,
    GAS_REFILL_TIME: 10000,
    TANKER_SUPPLY_CAPACITY: 10000,
    SERVICE_DISCOVERY_RANGE: 10,
    SERVICE_SERVING_RANGE: 1.5
  }
})

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: vi.fn(fn => fn)
}))

vi.mock('../../src/units.js', () => ({
  findPath: vi.fn()
}))

vi.mock('../../src/inputHandler.js', () => ({
  getUnitCommandsHandler: vi.fn(() => ({
    clearUtilityQueueState: () => {},
    advanceUtilityQueue: () => {},
    setUtilityQueue: () => {}
  }))
}))

vi.mock('../../src/game/unifiedMovement.js', () => ({
  stopUnitMovement: vi.fn()
}))

vi.mock('../../src/game/tankerTruckUtils.js', () => ({
  computeTankerKamikazeApproach: vi.fn(),
  clearTankerKamikazeState: vi.fn(),
  updateKamikazeTargetPoint: vi.fn(),
  detonateTankerTruck: vi.fn()
}))

import { updateTankerTruckLogic } from '../../src/game/tankerTruckLogic.js'
import { stopUnitMovement } from '../../src/game/unifiedMovement.js'
import { getUnitCommandsHandler } from '../../src/inputHandler.js'

describe('tankerTruckLogic.js', () => {
  let gameState

  beforeEach(() => {
    vi.resetAllMocks()
    // Restore default mock implementation
    getUnitCommandsHandler.mockImplementation(() => ({
      clearUtilityQueueState: () => {},
      advanceUtilityQueue: () => {},
      setUtilityQueue: () => {}
    }))
    gameState = {
      mapGrid: Array(100).fill(null).map(() => Array(100).fill(0)),
      buildings: [],
      units: []
    }
  })

  describe('updateTankerTruckLogic', () => {
    it('should do nothing if no tankers exist', () => {
      const units = [
        { id: 'u1', type: 'tank', health: 100 }
      ]

      updateTankerTruckLogic(units, gameState, 16)

      expect(stopUnitMovement).not.toHaveBeenCalled()
    })

    it('should skip dead tankers', () => {
      const units = [
        { id: 't1', type: 'tankerTruck', health: 0, tileX: 10, tileY: 10 },
        { id: 't2', type: 'tankerTruck', health: 100, tileX: 10, tileY: 10 }
      ]

      updateTankerTruckLogic(units, gameState, 16)

      // Should only process alive tanker
      // Dead tanker shouldn't be processed
    })

    it('should initialize tanker supply gas if undefined', () => {
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        tileX: 10,
        tileY: 10
      }
      const units = [tanker]

      updateTankerTruckLogic(units, gameState, 16)

      expect(tanker.supplyGas).toBe(10000)
      expect(tanker.maxSupplyGas).toBe(10000)
    })

    it('should clear tanker state if crew lacks loader', () => {
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        tileX: 10,
        tileY: 10,
        crew: { driver: true, loader: false },
        refuelTarget: {},
        emergencyTarget: {},
        refuelTimer: 5000
      }
      const units = [tanker]

      const mockCommands = {
        clearUtilityQueueState: vi.fn()
      }
      getUnitCommandsHandler.mockReturnValue(mockCommands)

      updateTankerTruckLogic(units, gameState, 16)

      expect(tanker.refuelTarget).toBe(null)
      expect(tanker.emergencyTarget).toBe(null)
      expect(tanker.refuelTimer).toBe(0)
      expect(mockCommands.clearUtilityQueueState).toHaveBeenCalledWith(tanker)
    })

    it('should find and refuel nearby low-gas units', () => {
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000
      }
      const lowGasUnit = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: tanker.owner,
        tileX: 10,
        tileY: 10,
        gas: 100,
        maxGas: 1000
      }
      const units = [tanker, lowGasUnit]

      updateTankerTruckLogic(units, gameState, 100)

      expect(tanker.refuelTarget).toBeDefined()
      expect(stopUnitMovement).toHaveBeenCalledWith(tanker)
    })

    it('should refuel target unit when in range', () => {
      const target = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 100,
        maxGas: 1000
      }
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000,
        refuelTarget: target,
        refuelTimer: 0
      }
      const units = [tanker, target]

      const initialGas = target.gas

      updateTankerTruckLogic(units, gameState, 100)

      expect(target.gas).toBeGreaterThan(initialGas)
      expect(tanker.supplyGas).toBeLessThan(10000)
    })

    it('should use emergency refuel rate when target is out of gas', () => {
      const target = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 0,
        maxGas: 1000
      }
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000,
        refuelTarget: target,
        refuelTimer: 0
      }
      const units = [tanker, target]

      updateTankerTruckLogic(units, gameState, 100)

      // Emergency refueling should fill faster (2x rate)
      expect(target.gas).toBeGreaterThan(0)
    })


    it('should not refuel enemy or airborne units', () => {
      const enemyTarget = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: 2,
        tileX: 10,
        tileY: 10,
        gas: 100,
        maxGas: 1000,
        movement: { isMoving: false }
      }
      const airborneApache = {
        id: 'u2',
        type: 'apache',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 100,
        maxGas: 1000,
        isAirUnit: true,
        flightState: 'airborne',
        movement: { isMoving: false }
      }
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000,
        refuelTarget: airborneApache,
        refuelTimer: 0
      }
      const units = [tanker, enemyTarget, airborneApache]

      updateTankerTruckLogic(units, gameState, 100)

      expect(enemyTarget.gas).toBe(100)
      expect(airborneApache.gas).toBe(100)
      expect(tanker.refuelTarget).toBe(null)
      expect(tanker.supplyGas).toBe(10000)
    })

    it('should stop refueling when target is full', () => {
      const target = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 980,
        maxGas: 1000
      }
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000,
        refuelTarget: target,
        refuelTimer: 0
      }
      const units = [tanker, target]

      updateTankerTruckLogic(units, gameState, 100)

      expect(tanker.refuelTarget).toBe(null)
      expect(tanker.refuelTimer).toBe(0)
    })

    it('should clear refuel target if target dies', () => {
      const target = {
        id: 'u1',
        type: 'tank',
        health: 0,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 100,
        maxGas: 1000
      }
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000,
        refuelTarget: target,
        refuelTimer: 5000
      }
      const units = [tanker, target]

      updateTankerTruckLogic(units, gameState, 16)

      expect(tanker.refuelTarget).toBe(null)
      expect(tanker.refuelTimer).toBe(0)
    })

    it('should clear refuel target if target moves away', () => {
      const target = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: 1,
        tileX: 20,
        tileY: 20,
        gas: 100,
        maxGas: 1000
      }
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000,
        refuelTarget: target,
        refuelTimer: 5000
      }
      const units = [tanker, target]

      updateTankerTruckLogic(units, gameState, 16)

      expect(tanker.refuelTarget).toBe(null)
      expect(tanker.refuelTimer).toBe(0)
    })

    it('should clear refuel target if target starts moving', () => {
      const target = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 100,
        maxGas: 1000,
        movement: { isMoving: true }
      }
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000,
        refuelTarget: target,
        refuelTimer: 5000
      }
      const units = [tanker, target]

      updateTankerTruckLogic(units, gameState, 16)

      expect(tanker.refuelTarget).toBe(null)
      expect(tanker.refuelTimer).toBe(0)
    })

    it('should not refuel units from different owner', () => {
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000
      }
      const enemyUnit = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: 2,
        tileX: 10,
        tileY: 10,
        gas: 100,
        maxGas: 1000
      }
      const units = [tanker, enemyUnit]

      updateTankerTruckLogic(units, gameState, 16)

      expect(tanker.refuelTarget).toBe(undefined)
    })

    it('should not refuel units without gas property', () => {
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000
      }
      const unitNoGas = {
        id: 'u1',
        type: 'building',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10
      }
      const units = [tanker, unitNoGas]

      updateTankerTruckLogic(units, gameState, 16)

      expect(tanker.refuelTarget).toBe(undefined)
    })

    it('should prioritize units with lower fuel percentage', () => {
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000
      }
      const unit1 = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 300,
        maxGas: 1000
      }
      const unit2 = {
        id: 'u2',
        type: 'tank',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 100,
        maxGas: 1000
      }
      const units = [tanker, unit1, unit2]

      updateTankerTruckLogic(units, gameState, 16)

      expect(tanker.refuelTarget).toBeDefined()
      expect(tanker.refuelTarget.id).toBe('u2')
    })

    it('should stop refueling when tanker runs out of supply', () => {
      const target = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 100,
        maxGas: 1000
      }
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 0,
        maxSupplyGas: 10000,
        refuelTarget: target,
        refuelTimer: 5000
      }
      const units = [tanker, target]

      updateTankerTruckLogic(units, gameState, 16)

      expect(tanker.refuelTarget).toBe(null)
      expect(tanker.refuelTimer).toBe(0)
    })

    it('should clear emergency flags after successful refuel', () => {
      const target = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 0,
        maxGas: 1000,
        needsEmergencyFuel: true,
        emergencyFuelRequestTime: 1000,
        outOfGasPlayed: true
      }
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000,
        refuelTarget: target,
        refuelTimer: 0,
        emergencyMode: true
      }
      const units = [tanker, target]

      // Refuel enough to reach emergency threshold (20%)
      updateTankerTruckLogic(units, gameState, 5000)

      expect(target.needsEmergencyFuel).toBe(false)
      expect(target.emergencyFuelRequestTime).toBe(null)
      expect(target.outOfGasPlayed).toBe(false)
      expect(tanker.emergencyMode).toBe(false)
    })

    it('should handle alert mode scanning', () => {
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000,
        alertMode: true,
        nextUtilityScanTime: 0
      }
      const lowGasUnit = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 100,
        maxGas: 1000
      }
      const units = [tanker, lowGasUnit]

      const mockCommands = {
        setUtilityQueue: vi.fn().mockReturnValue({
          addedTargets: [lowGasUnit],
          started: true
        })
      }
      getUnitCommandsHandler.mockReturnValue(mockCommands)

      updateTankerTruckLogic(units, gameState, 16)

      expect(mockCommands.setUtilityQueue).toHaveBeenCalledWith(
        tanker,
        expect.arrayContaining([lowGasUnit]),
        'refuel',
        gameState.mapGrid,
        expect.objectContaining({
          suppressNotifications: true,
          source: 'auto'
        })
      )
      expect(tanker.alertActiveService).toBe(true)
      expect(tanker.nextUtilityScanTime).toBeGreaterThan(0)
    })

    it('should clear utility queue lock when inactive', () => {
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        utilityQueue: {
          lockedByUser: true,
          mode: 'refuel',
          targets: [],
          currentTargetId: null,
          source: 'user'
        }
      }
      const units = [tanker]

      updateTankerTruckLogic(units, gameState, 16)

      expect(tanker.utilityQueue.lockedByUser).toBe(false)
      expect(tanker.utilityQueue.source).toBe(null)
    })

    it('should skip units that are currently moving', () => {
      const tanker = {
        id: 't1',
        type: 'tankerTruck',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        supplyGas: 10000,
        maxSupplyGas: 10000
      }
      const movingUnit = {
        id: 'u1',
        type: 'tank',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 100,
        maxGas: 1000,
        movement: { isMoving: true }
      }
      const stationaryUnit = {
        id: 'u2',
        type: 'tank',
        health: 100,
        owner: 1,
        tileX: 10,
        tileY: 10,
        gas: 100,
        maxGas: 1000
      }
      const units = [tanker, movingUnit, stationaryUnit]

      updateTankerTruckLogic(units, gameState, 16)

      expect(tanker.refuelTarget).toBeDefined()
      expect(tanker.refuelTarget.id).toBe('u2')
    })
  })
})
