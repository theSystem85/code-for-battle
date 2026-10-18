/**
 * Unit tests for Tanker and Gas Station logic
 *
 * Tests fuel tracking, gas station refueling mechanics,
 * tanker supply refill, and cost calculation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock config
vi.mock('../../src/config.js', async() => {
  const actual = await vi.importActual('../../src/config.js')
  return {
    ...actual,
    TILE_SIZE: 32,
    GAS_REFILL_TIME: 10000, // 10 seconds to fill
    GAS_REFILL_COST: 100 // $100 cost per full tank
  }
})

// Mock performanceUtils
vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: vi.fn(fn => fn)
}))

// Mock serviceRadius
vi.mock('../../src/utils/serviceRadius.js', () => ({
  getServiceRadiusPixels: vi.fn().mockReturnValue(96) // 3 tiles * 32
}))

import { updateGasStationLogic } from '../../src/game/gasStationLogic.js'
import { getServiceRadiusPixels } from '../../src/utils/serviceRadius.js'

describe('Gas Station Logic', () => {
  let gasStation
  let unit
  let mockGameState

  beforeEach(() => {
    vi.clearAllMocks()

    // Create gas station at tile (5, 5), 2x2 size
    gasStation = {
      id: 'gs-1',
      type: 'gasStation',
      owner: 'player',
      x: 5,
      y: 5,
      width: 2,
      height: 2,
      health: 100
    }

    // Create unit with fuel system near the gas station
    // Station center: (5*32 + 32, 5*32 + 32) = (192, 192)
    unit = {
      id: 'unit-1',
      type: 'tank',
      owner: 'player',
      x: 190, // Close to gas station center
      y: 190,
      health: 100,
      gas: 50,
      maxGas: 100,
      refueling: false,
      gasRefillTimer: 0,
      movement: { isMoving: false }
    }

    mockGameState = {
      humanPlayer: 'player',
      money: 10000,
      factories: []
    }

    // Reset mock
    getServiceRadiusPixels.mockReturnValue(96)
  })

  describe('Basic Refueling', () => {
    it('[U04349] should refuel stationary unit within service radius', () => {
      const delta = 1000 // 1 second

      updateGasStationLogic([unit], [gasStation], mockGameState, delta)

      // fillRate = 100 / 10000 = 0.01 per ms
      // fuel added = 0.01 * 1000 = 10
      expect(unit.gas).toBe(60)
      expect(unit.refueling).toBe(true)
    })

    it('[U04350] should not refuel unit outside service radius', () => {
      unit.x = 500 // Far from gas station
      unit.y = 500

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.gas).toBe(50)
      expect(unit.refueling).toBe(false)
    })

    it('[U04351] should not refuel moving unit', () => {
      unit.movement = { isMoving: true }

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.gas).toBe(50)
      expect(unit.refueling).toBe(false)
    })

    it('[U04352] should not refuel unit at full gas', () => {
      unit.gas = 100
      unit.maxGas = 100

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.gas).toBe(100)
      expect(unit.refueling).toBe(false)
    })

    it('[U04353] should not exceed maxGas when refueling', () => {
      unit.gas = 95
      unit.maxGas = 100

      // Long delta that would overfill
      updateGasStationLogic([unit], [gasStation], mockGameState, 10000)

      expect(unit.gas).toBe(100)
    })

    it('[U04354] should skip units without maxGas property', () => {
      delete unit.maxGas

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.gas).toBe(50) // Unchanged
    })

    it('[U04355] should skip dead units', () => {
      unit.health = 0

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.gas).toBe(50)
    })
  })

  describe('Tanker Truck Supply Refill', () => {
    let tanker

    beforeEach(() => {
      tanker = {
        id: 'tanker-1',
        type: 'tankerTruck',
        owner: 'player',
        x: 190,
        y: 190,
        health: 100,
        gas: 50,
        maxGas: 100,
        supplyGas: 20000,
        maxSupplyGas: 40000,
        refueling: false,
        gasRefillTimer: 0,
        movement: { isMoving: false }
      }
    })

    it('[U04356] should refill tanker supply gas', () => {
      const delta = 1000

      updateGasStationLogic([tanker], [gasStation], mockGameState, delta)

      // Supply fillRate = 40000 / 10000 = 4 per ms
      // Supply added = 4 * 1000 = 4000
      expect(tanker.supplyGas).toBe(24000)
      expect(tanker.refueling).toBe(true)
    })

    it('[U04357] should refill both personal gas and supply gas', () => {
      tanker.gas = 50

      updateGasStationLogic([tanker], [gasStation], mockGameState, 1000)

      expect(tanker.gas).toBeGreaterThan(50)
      expect(tanker.supplyGas).toBeGreaterThan(20000)
    })

    it('[U04358] should not exceed maxSupplyGas', () => {
      tanker.supplyGas = 38000

      updateGasStationLogic([tanker], [gasStation], mockGameState, 10000)

      expect(tanker.supplyGas).toBe(40000)
    })

    it('[U04359] should not refill supply when already full', () => {
      tanker.gas = 100
      tanker.supplyGas = 40000

      updateGasStationLogic([tanker], [gasStation], mockGameState, 1000)

      expect(tanker.refueling).toBe(false)
    })
  })

  describe('Cost Calculation', () => {
    it('[U04360] should deduct money from player during refueling', () => {
      mockGameState.money = 1000

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      // costPerMs = 100 / 10000 = 0.01
      // cost = 0.01 * 1000 = $10
      expect(mockGameState.money).toBe(990)
    })

    it('[U04361] should not go below zero money', () => {
      mockGameState.money = 5

      updateGasStationLogic([unit], [gasStation], mockGameState, 10000)

      expect(mockGameState.money).toBe(0)
    })

    it('[U04362] should deduct from AI factory budget for AI units', () => {
      unit.owner = 'ai-1'
      const aiFactory = { id: 'ai-1', budget: 1000 }
      mockGameState.factories = [aiFactory]

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(aiFactory.budget).toBe(990)
    })

    it('[U04363] should not deduct when unit already full', () => {
      mockGameState.money = 1000
      unit.gas = 100

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(mockGameState.money).toBe(1000)
    })
  })

  describe('Refueling State Management', () => {
    it('[U04364] should set refueling flag when starting refuel', () => {
      unit.refueling = false

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.refueling).toBe(true)
    })

    it('[U04365] should clear refueling flag when leaving area', () => {
      unit.refueling = true
      unit.x = 500

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.refueling).toBe(false)
    })

    it('[U04366] should clear refueling flag when tank is full', () => {
      unit.gas = 100
      unit.refueling = true

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.refueling).toBe(false)
    })

    it('[U04367] should reset gasRefillTimer when leaving area', () => {
      unit.gasRefillTimer = 5000
      unit.x = 500

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.gasRefillTimer).toBe(0)
    })

    it('[U04368] should reset outOfGasPlayed flag when tank full', () => {
      unit.gas = 100
      unit.outOfGasPlayed = true

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.outOfGasPlayed).toBe(false)
    })

    it('[U04369] should accumulate gasRefillTimer while refueling', () => {
      unit.gasRefillTimer = 0

      updateGasStationLogic([unit], [gasStation], mockGameState, 500)
      expect(unit.gasRefillTimer).toBe(500)

      updateGasStationLogic([unit], [gasStation], mockGameState, 300)
      expect(unit.gasRefillTimer).toBe(800)
    })
  })

  describe('Multiple Units and Stations', () => {
    it('[U04370] should handle multiple units at one station', () => {
      const unit2 = {
        id: 'unit-2',
        type: 'tank',
        owner: 'player',
        x: 195,
        y: 195,
        health: 100,
        gas: 30,
        maxGas: 100,
        refueling: false,
        gasRefillTimer: 0,
        movement: { isMoving: false }
      }

      updateGasStationLogic([unit, unit2], [gasStation], mockGameState, 1000)

      expect(unit.gas).toBeGreaterThan(50)
      expect(unit2.gas).toBeGreaterThan(30)
    })

    it('[U04371] should skip if no gas stations', () => {
      const initialGas = unit.gas

      updateGasStationLogic([unit], [], mockGameState, 1000)

      expect(unit.gas).toBe(initialGas)
    })

    it('[U04372] should skip station with zero service radius', () => {
      getServiceRadiusPixels.mockReturnValue(0)

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.gas).toBe(50)
    })
  })

  describe('Unit Position Handling', () => {
    it('[U04373] should use tileX/tileY when x/y is undefined', () => {
      // Position using tileX/tileY instead of x/y
      const tileUnit = {
        id: 'tile-unit',
        type: 'tank',
        owner: 'player',
        tileX: 6, // Near gas station
        tileY: 6,
        x: undefined,
        y: undefined,
        health: 100,
        gas: 50,
        maxGas: 100,
        refueling: false,
        gasRefillTimer: 0,
        movement: { isMoving: false }
      }

      updateGasStationLogic([tileUnit], [gasStation], mockGameState, 1000)

      expect(tileUnit.gas).toBeGreaterThan(50)
    })

    it('[U04374] should calculate distance from station center', () => {
      // Unit just inside radius - need to account for unit center offset
      // Station center: (192, 192), Service radius: 96
      // Unit center = unit.x + 16, unit.y + 16
      // Put unit at position where unit center is within radius
      unit.x = 192 + 70 // 262, unit center at 278, distance ~86 from station center
      unit.y = 192

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.gas).toBeGreaterThan(50)
    })

    it('[U04375] should not refuel unit just outside radius', () => {
      // Unit just outside radius
      unit.x = 192 + 100 // Center + over radius
      unit.y = 192

      updateGasStationLogic([unit], [gasStation], mockGameState, 1000)

      expect(unit.gas).toBe(50)
    })
  })
})

describe('Fuel Tracking', () => {
  it('[U04376] should track gas as percentage of maxGas', () => {
    const unit = {
      gas: 25,
      maxGas: 100
    }

    const percentage = (unit.gas / unit.maxGas) * 100

    expect(percentage).toBe(25)
  })

  it('[U04377] should identify units needing fuel', () => {
    const units = [
      { id: 'u1', gas: 100, maxGas: 100 },
      { id: 'u2', gas: 50, maxGas: 100 },
      { id: 'u3', gas: 10, maxGas: 100 },
      { id: 'u4', gas: 0, maxGas: 100 }
    ]

    const needFuel = units.filter(u => u.gas / u.maxGas < 0.5)

    expect(needFuel.length).toBe(2)
    expect(needFuel.map(u => u.id)).toEqual(['u3', 'u4'])
  })

  it('[U04378] should identify critical fuel units', () => {
    const units = [
      { id: 'u1', gas: 10, maxGas: 100 },
      { id: 'u2', gas: 0, maxGas: 100 },
      { id: 'u3', gas: 50, maxGas: 100 }
    ]

    const critical = units.filter(u => u.gas <= 0)

    expect(critical.length).toBe(1)
    expect(critical[0].id).toBe('u2')
  })
})
