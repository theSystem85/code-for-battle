import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/config.js', async() => {
  const actual = await vi.importActual('../../src/config.js')
  return {
    ...actual,
    TILE_SIZE: 32,
    HELIPAD_FUEL_CAPACITY: 100,
    HELIPAD_RELOAD_TIME: 1000,
    TANKER_SUPPLY_CAPACITY: 200,
    HELIPAD_AMMO_RESERVE: 50,
    AMMO_TRUCK_RANGE: 1,
    AMMO_RESUPPLY_TIME: 1000,
    AMMO_TRUCK_CARGO: 40
  }
})

vi.mock('../../src/performanceUtils.js', () => ({
  logPerformance: vi.fn(fn => fn)
}))

vi.mock('../../src/utils.js', () => ({
  getBuildingIdentifier: vi.fn(building => `airstrip-${building.id}`)
}))

vi.mock('../../src/utils/helipadUtils.js', () => ({
  getHelipadLandingCenter: vi.fn(building => ({
    x: (building.x + (building.width ?? 1) / 2) * 32,
    y: (building.y + (building.height ?? 1) / 2) * 32
  })),
  isHelipadAvailableForUnit: vi.fn(() => false) // Apaches shouldn't land
}))

import { updateHelipadLogic } from '../../src/game/helipadLogic.js'

const createAirstrip = (overrides = {}) => ({
  id: 'as1',
  type: 'airstrip',
  health: 10000,
  x: 5,
  y: 5,
  width: 12,
  height: 6,
  ...overrides
})

const createApache = (overrides = {}) => ({
  id: 'a1',
  type: 'apache',
  health: 100,
  x: 5 * 32,
  y: 5 * 32,
  flightState: 'grounded',
  helipadLandingRequested: true,
  helipadTargetId: null,
  landedHelipadId: null,
  rocketAmmo: 0,
  maxRocketAmmo: 10,
  apacheAmmoEmpty: true,
  canFire: false,
  gas: 0,
  maxGas: 100,
  ...overrides
})

describe('airstripLogic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes airstrip fuel and ammo defaults', () => {
    const airstrip = createAirstrip({ fuel: undefined, maxFuel: 0, ammo: undefined, maxAmmo: 0 })

    updateHelipadLogic([], [airstrip], {}, 1000)

    expect(airstrip.maxFuel).toBe(100)
    expect(airstrip.fuel).toBe(100)
    expect(airstrip.maxAmmo).toBe(50)
    expect(airstrip.ammo).toBe(50)
  })

  it('refills airstrip fuel based on reload time and updates needsFuel', () => {
    const airstrip = createAirstrip({ fuel: 10, maxFuel: 100, fuelReloadTime: 2000 })

    updateHelipadLogic([], [airstrip], {}, 0)
    expect(airstrip.needsFuel).toBe(true)

    updateHelipadLogic([], [airstrip], {}, 1000)

    expect(airstrip.fuel).toBe(60)
    expect(airstrip.needsFuel).toBe(false)
  })

  it('caps airstrip ammo to the allowed reserve', () => {
    const airstrip = createAirstrip({ ammo: 80, maxAmmo: 100 })

    updateHelipadLogic([], [airstrip], {}, 1000)

    expect(airstrip.maxAmmo).toBe(50)
    expect(airstrip.ammo).toBe(50)
  })

  it('refills airstrip ammo from adjacent ammo trucks', () => {
    const airstrip = createAirstrip({ ammo: 0, maxAmmo: 50 })
    const ammoTruck = {
      id: 'ammo-1',
      type: 'ammunitionTruck',
      health: 100,
      x: 6 * 32,
      y: 5 * 32,
      ammoCargo: 20,
      maxAmmoCargo: 40
    }

    updateHelipadLogic([ammoTruck], [airstrip], {}, 1000)

    expect(airstrip.ammo).toBe(20)
    expect(ammoTruck.ammoCargo).toBe(0)
    expect(airstrip.needsAmmo).toBe(false)
  })

  it('tops up airstrip fuel from nearby tanker trucks', () => {
    const airstrip = createAirstrip({ fuel: 50, maxFuel: 100, fuelReloadTime: 100000 })
    const tanker = {
      id: 'tanker-1',
      type: 'tankerTruck',
      health: 100,
      x: 6 * 32,
      y: 5 * 32,
      supplyGas: 10,
      maxSupplyGas: 200
    }

    updateHelipadLogic([tanker], [airstrip], {}, 1000)

    expect(airstrip.fuel).toBeGreaterThan(50)
    expect(tanker.supplyGas).toBe(0)
  })

  it('does not allow apaches to land on the airstrip', () => {
    const airstrip = createAirstrip({
      ammo: 10,
      maxAmmo: 50,
      fuel: 50,
      maxFuel: 100,
      fuelReloadTime: 100000
    })
    const apache = createApache()

    updateHelipadLogic([apache], [airstrip], {}, 1000)

    expect(apache.landedHelipadId).toBeNull()
    expect(airstrip.landedUnitId).toBeUndefined() // or null, but updateHelipadLogic won't set it for airstrip
  })
})
