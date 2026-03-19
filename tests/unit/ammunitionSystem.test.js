
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateAmmunitionSystem } from '../../src/game/ammunitionSystem.js'
import { gameState } from '../../src/gameState.js'
import { getServiceRadiusPixels } from '../../src/utils/serviceRadius.js'

// Mock dependencies
vi.mock('../../src/config.js', () => ({
  TILE_SIZE: 32,
  AMMO_RESUPPLY_TIME: 1000,
  AMMO_FACTORY_RANGE: 5,
  AMMO_TRUCK_RANGE: 3
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: {
    playerPowerSupply: 100,
    enemyPowerSupply: 100
  }
}))

vi.mock('../../src/utils/serviceRadius.js', () => ({
  getServiceRadiusPixels: vi.fn(),
  ensureServiceRadius: vi.fn(),
  isServiceBuilding: vi.fn()
}))

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: (fn) => fn
}))

describe('Ammunition System', () => {
  let units
  let buildings
  const TILE_SIZE = 32

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset gameState
    gameState.playerPowerSupply = 100
    gameState.enemyPowerSupply = 100

    // Setup basic mock data
    units = []
    buildings = []

    // Default mock for getServiceRadiusPixels
    getServiceRadiusPixels.mockReturnValue(5 * TILE_SIZE)
  })

  describe('Resupply from factories', () => {
    it('should resupply a stationary unit within range', () => {
      const factory = {
        id: 'factory1',
        type: 'ammunitionFactory',
        x: 10,
        y: 10,
        width: 2,
        height: 2,
        health: 100,
        owner: 'player'
      }
      buildings.push(factory)

      const unit = {
        id: 'unit1',
        x: 11 * TILE_SIZE,
        y: 11 * TILE_SIZE,
        type: 'tank',
        health: 100,
        maxAmmunition: 100,
        ammunition: 50,
        owner: 'player',
        movement: { isMoving: false }
      }
      units.push(unit)

      // Service radius large enough to cover unit
      getServiceRadiusPixels.mockReturnValue(10 * TILE_SIZE)

      updateAmmunitionSystem(units, buildings, gameState, 100) // 100ms delta

      expect(unit.resupplyingAmmo).toBe(true)
      expect(unit.ammunition).toBeGreaterThan(50)
      expect(unit.ammoRefillTimer).toBe(100)
    })

    it('should NOT resupply a moving unit', () => {
      const factory = {
        id: 'factory1',
        type: 'ammunitionFactory',
        x: 10,
        y: 10,
        width: 2,
        height: 2,
        health: 100,
        owner: 'player'
      }
      buildings.push(factory)

      const unit = {
        id: 'unit1',
        x: 11 * TILE_SIZE,
        y: 11 * TILE_SIZE,
        type: 'tank',
        health: 100,
        maxAmmunition: 100,
        ammunition: 50,
        owner: 'player',
        movement: { isMoving: true }
      }
      units.push(unit)

      getServiceRadiusPixels.mockReturnValue(10 * TILE_SIZE)

      updateAmmunitionSystem(units, buildings, gameState, 100)

      expect(unit.resupplyingAmmo).toBeFalsy()
      expect(unit.ammunition).toBe(50)
    })

    it('should NOT resupply a unit outside range', () => {
      const factory = {
        id: 'factory1',
        type: 'ammunitionFactory',
        x: 10,
        y: 10,
        width: 2,
        height: 2,
        health: 100,
        owner: 'player'
      }
      buildings.push(factory)

      const unit = {
        id: 'unit1',
        x: 50 * TILE_SIZE, // Far away
        y: 50 * TILE_SIZE,
        type: 'tank',
        health: 100,
        maxAmmunition: 100,
        ammunition: 50,
        owner: 'player',
        movement: { isMoving: false }
      }
      units.push(unit)

      getServiceRadiusPixels.mockReturnValue(5 * TILE_SIZE)

      updateAmmunitionSystem(units, buildings, gameState, 100)

      expect(unit.resupplyingAmmo).toBeFalsy()
      expect(unit.ammunition).toBe(50)
    })
  })

  describe('Power Penalty', () => {
    it('should resupply slower when power is negative', () => {
      gameState.playerPowerSupply = -10

      const factory = {
        id: 'factory1',
        type: 'ammunitionFactory',
        x: 10,
        y: 10,
        width: 2,
        height: 2,
        health: 100,
        owner: 'player'
      }
      buildings.push(factory)

      const unit = {
        id: 'unit1',
        x: 11 * TILE_SIZE,
        y: 11 * TILE_SIZE,
        type: 'tank',
        health: 100,
        maxAmmunition: 100,
        ammunition: 50,
        owner: 'player',
        movement: { isMoving: false }
      }
      units.push(unit)

      getServiceRadiusPixels.mockReturnValue(10 * TILE_SIZE)

      // Calculate expected refill
      // Base rate = 100 / 1000 = 0.1 per ms
      // Penalty: 0.1 / 2 = 0.05 per ms
      // Delta = 100ms -> +5 ammo

      updateAmmunitionSystem(units, buildings, gameState, 100)

      expect(unit.resupplyingAmmo).toBe(true)
      // Initial 50 + 5 = 55
      expect(unit.ammunition).toBeCloseTo(55)
    })

    it('should resupply at normal rate when power is positive', () => {
      gameState.playerPowerSupply = 10

      const factory = {
        id: 'factory1',
        type: 'ammunitionFactory',
        x: 10,
        y: 10,
        width: 2,
        height: 2,
        health: 100,
        owner: 'player'
      }
      buildings.push(factory)

      const unit = {
        id: 'unit1',
        x: 11 * TILE_SIZE,
        y: 11 * TILE_SIZE,
        type: 'tank',
        health: 100,
        maxAmmunition: 100,
        ammunition: 50,
        owner: 'player',
        movement: { isMoving: false }
      }
      units.push(unit)

      getServiceRadiusPixels.mockReturnValue(10 * TILE_SIZE)

      // Calculate expected refill
      // Base rate = 100 / 1000 = 0.1 per ms
      // No Penalty: 0.1 per ms
      // Delta = 100ms -> +10 ammo

      updateAmmunitionSystem(units, buildings, gameState, 100)

      expect(unit.resupplyingAmmo).toBe(true)
      // Initial 50 + 10 = 60
      expect(unit.ammunition).toBeCloseTo(60)
    })
  })

  describe('Resupply from trucks', () => {
    it('should resupply a unit from an ammo truck', () => {
      const truck = {
        id: 'truck1',
        type: 'ammunitionTruck',
        x: 10 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        health: 100,
        maxAmmoCargo: 500,
        ammoCargo: 500,
        owner: 'player'
      }
      units.push(truck)

      const tank = {
        id: 'tank1',
        type: 'tank',
        x: 10 * TILE_SIZE, // Same location for simplicity
        y: 10 * TILE_SIZE,
        health: 100,
        maxAmmunition: 100,
        ammunition: 50,
        owner: 'player',
        movement: { isMoving: false }
      }
      units.push(tank)

      // Truck range is 3 tiles = 96 pixels
      // Distance is 0

      updateAmmunitionSystem(units, buildings, gameState, 100)

      expect(tank.resupplyingAmmo).toBe(true)
      expect(tank.ammunition).toBeGreaterThan(50)
      expect(truck.ammoCargo).toBeLessThan(500)
    })


    it('should not resupply enemy or airborne units from an ammo truck', () => {
      const truck = {
        id: 'truck1',
        type: 'ammunitionTruck',
        x: 10 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        health: 100,
        maxAmmoCargo: 500,
        ammoCargo: 500,
        owner: 'player1'
      }
      const enemyTank = {
        id: 'enemy1',
        type: 'tank',
        x: 10 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        health: 100,
        maxAmmunition: 100,
        ammunition: 40,
        owner: 'player2',
        movement: { isMoving: false }
      }
      const airborneApache = {
        id: 'apache1',
        type: 'apache',
        x: 10 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        health: 100,
        maxRocketAmmo: 12,
        rocketAmmo: 2,
        owner: 'player1',
        isAirUnit: true,
        flightState: 'airborne',
        movement: { isMoving: false }
      }
      units.push(truck, enemyTank, airborneApache)

      updateAmmunitionSystem(units, buildings, gameState, 100)

      expect(enemyTank.ammunition).toBe(40)
      expect(enemyTank.resupplyingAmmo).toBeFalsy()
      expect(airborneApache.rocketAmmo).toBe(2)
      expect(airborneApache.resupplyingAmmo).toBeFalsy()
      expect(truck.ammoCargo).toBe(500)
    })

    it('should not resupply if truck has no cargo', () => {
      const truck = {
        id: 'truck1',
        type: 'ammunitionTruck',
        x: 10 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        health: 100,
        maxAmmoCargo: 500,
        ammoCargo: 0,
        owner: 'player'
      }
      units.push(truck)

      const tank = {
        id: 'tank1',
        type: 'tank',
        x: 10 * TILE_SIZE,
        y: 10 * TILE_SIZE,
        health: 100,
        maxAmmunition: 100,
        ammunition: 50,
        owner: 'player',
        movement: { isMoving: false }
      }
      units.push(tank)

      updateAmmunitionSystem(units, buildings, gameState, 100)

      expect(tank.resupplyingAmmo).toBeFalsy()
      expect(tank.ammunition).toBe(50)
    })
  })

  describe('Reloading Ammo Trucks', () => {
    it('should reload ammo truck at factory', () => {
      const factory = {
        id: 'factory1',
        type: 'ammunitionFactory',
        x: 10, // tiles
        y: 10, // tiles
        width: 2,
        height: 2,
        health: 100,
        owner: 'player'
      }
      buildings.push(factory)

      // Truck needs tileX/tileY or x/y that converts to tileX/tileY in range
      // Factory is at 10,10 to 11,11 range +5
      // Truck at 12,12 is within range
      const truck = {
        id: 'truck1',
        type: 'ammunitionTruck',
        x: 12 * TILE_SIZE,
        y: 12 * TILE_SIZE,
        tileX: 12,
        tileY: 12,
        health: 100,
        maxAmmoCargo: 500,
        ammoCargo: 100,
        movement: { isMoving: false },
        owner: 'player'
      }
      units.push(truck)

      // isUnitWithinBuildingRange uses coordinates
      // 12 - 10 = 2 distance each axis. sqrt(8) ~ 2.8 < 5

      updateAmmunitionSystem(units, buildings, gameState, 100)

      expect(truck.reloadingAmmo).toBe(true)
      expect(truck.ammoCargo).toBeGreaterThan(100)
      expect(truck.ammoReloadTargetId).toBe(factory.id)
    })
  })

  describe('Helicopter Logic', () => {
    it('should resupply rockets for apache', () => {
      const factory = {
        id: 'factory1',
        type: 'ammunitionFactory',
        x: 10,
        y: 10,
        width: 2,
        height: 2,
        health: 100,
        owner: 'player'
      }
      buildings.push(factory)

      const heli = {
        id: 'heli1',
        type: 'apache',
        x: 11 * TILE_SIZE,
        y: 11 * TILE_SIZE,
        health: 100,
        maxRocketAmmo: 20,
        rocketAmmo: 5,
        flightState: 'grounded',
        movement: { isMoving: false },
        owner: 'player'
      }
      units.push(heli)

      getServiceRadiusPixels.mockReturnValue(10 * TILE_SIZE)

      updateAmmunitionSystem(units, buildings, gameState, 100)

      expect(heli.resupplyingAmmo).toBe(true)
      expect(heli.rocketAmmo).toBeGreaterThan(5)
    })
  })
})
