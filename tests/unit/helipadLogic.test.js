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
  getBuildingIdentifier: vi.fn(helipad => `helipad-${helipad.id}`)
}))

vi.mock('../../src/utils/helipadUtils.js', () => ({
  getHelipadLandingCenter: vi.fn(helipad => ({
    x: (helipad.x + (helipad.width ?? 1) / 2) * 32,
    y: (helipad.y + (helipad.height ?? 1) / 2) * 32
  })),
  isHelipadAvailableForUnit: vi.fn(() => true)
}))

import { updateHelipadLogic } from '../../src/game/helipadLogic.js'
import { getHelipadLandingCenter } from '../../src/utils/helipadUtils.js'

const createHelipad = (overrides = {}) => ({
  id: 'h1',
  type: 'helipad',
  health: 100,
  x: 5,
  y: 5,
  width: 2,
  height: 2,
  ...overrides
})

const createApache = (overrides = {}) => ({
  id: 'a1',
  type: 'apache',
  health: 100,
  x: 0,
  y: 0,
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
  autoHoldAltitude: true,
  manualFlightState: 'hover',
  autoHelipadReturnActive: true,
  autoHelipadReturnTargetId: 'old',
  autoHelipadRetryAt: 50,
  noHelipadNotificationTime: 10,
  autoReturnRefilling: false,
  ...overrides
})

describe('helipadLogic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes helipad fuel and ammo defaults', () => {
    const helipad = createHelipad({ fuel: undefined, maxFuel: 0, ammo: undefined, maxAmmo: 0 })

    updateHelipadLogic([], [helipad], {}, 1000)

    expect(helipad.maxFuel).toBe(100)
    expect(helipad.fuel).toBe(100)
    expect(helipad.maxAmmo).toBe(50)
    expect(helipad.ammo).toBe(50)
  })

  it('refills helipad fuel based on reload time and updates needsFuel', () => {
    const helipad = createHelipad({ fuel: 10, maxFuel: 100, fuelReloadTime: 2000 })

    updateHelipadLogic([], [helipad], {}, 0)
    expect(helipad.needsFuel).toBe(true)

    updateHelipadLogic([], [helipad], {}, 1000)

    expect(helipad.fuel).toBe(60)
    expect(helipad.needsFuel).toBe(false)
  })

  it('caps helipad ammo to the allowed reserve', () => {
    const helipad = createHelipad({ ammo: 80, maxAmmo: 100 })

    updateHelipadLogic([], [helipad], {}, 1000)

    expect(helipad.maxAmmo).toBe(50)
    expect(helipad.ammo).toBe(50)
  })

  it('refills ammo from adjacent ammo trucks', () => {
    const helipad = createHelipad({ ammo: 0, maxAmmo: 50 })
    const ammoTruck = {
      id: 'ammo-1',
      type: 'ammunitionTruck',
      health: 100,
      x: 6 * 32,
      y: 5 * 32,
      ammoCargo: 20,
      maxAmmoCargo: 40
    }

    updateHelipadLogic([ammoTruck], [helipad], {}, 1000)

    expect(helipad.ammo).toBe(20)
    expect(ammoTruck.ammoCargo).toBe(0)
    expect(helipad.needsAmmo).toBe(false)
  })

  it('lands and refuels apache helicopters at the helipad', () => {
    const helipad = createHelipad({
      ammo: 10,
      maxAmmo: 50,
      fuel: 50,
      maxFuel: 100,
      fuelReloadTime: 100000
    })
    const landingCenter = getHelipadLandingCenter(helipad)
    const apache = createApache({
      x: landingCenter.x - 16,
      y: landingCenter.y - 16,
      movement: { isMoving: false, currentSpeed: 0 }
    })

    updateHelipadLogic([apache], [helipad], {}, 1000)

    expect(apache.landedHelipadId).toBe('helipad-h1')
    expect(helipad.landedUnitId).toBe('a1')
    expect(apache.rocketAmmo).toBeGreaterThan(0)
    expect(apache.apacheAmmoEmpty).toBe(false)
    expect(apache.canFire).toBe(false)
    expect(apache.gas).toBeGreaterThan(0)
    expect(apache.refuelingAtHelipad).toBe(true)
    expect(helipad.ammo).toBeLessThan(10)
    expect(helipad.fuel).toBeLessThan(50)
    expect(apache.autoHelipadReturnActive).toBe(false)
    expect(apache.autoHelipadReturnTargetId).toBeNull()
    expect(apache.autoHelipadRetryAt).toBe(0)
    expect(apache.noHelipadNotificationTime).toBe(0)
  })


  it('keeps Apache pinned to helipad center while landing even before touchdown', () => {
    const helipad = createHelipad({ ammo: 50, fuel: 100 })
    const landingCenter = getHelipadLandingCenter(helipad)
    const apache = createApache({
      x: landingCenter.x - 10,
      y: landingCenter.y - 8,
      flightState: 'airborne',
      helipadLandingRequested: true,
      selected: true,
      altitude: 40,
      movement: { isMoving: true, currentSpeed: 1 }
    })

    updateHelipadLogic([apache], [helipad], {}, 100)

    expect(apache.x).toBe(landingCenter.x - 16)
    expect(apache.y).toBe(landingCenter.y - 16)
    expect(apache.manualFlightState).toBe('land')
    expect(apache.flightPlan?.mode).toBe('helipad')
    expect(apache.landedHelipadId).toBeNull()
    expect(helipad.landedUnitId ?? null).toBeNull()
  })

  it('waits until an apache is fully settled on the helipad before refilling ammo or fuel', () => {
    const helipad = createHelipad({ ammo: 50, fuel: 100, landedUnitId: null })
    const landingCenter = getHelipadLandingCenter(helipad)
    const apache = createApache({
      x: landingCenter.x - 16,
      y: landingCenter.y - 16,
      flightState: 'grounded',
      rocketAmmo: 0,
      gas: 0,
      movement: { isMoving: false, currentSpeed: 0 }
    })

    updateHelipadLogic([apache], [helipad], {}, 100)

    expect(apache.landedHelipadId).toBeNull()
    expect(helipad.landedUnitId).toBeNull()
    expect(apache.rocketAmmo).toBe(0)
    expect(apache.gas).toBe(0)

    updateHelipadLogic([apache], [helipad], {}, 200)

    expect(apache.landedHelipadId).toBe('helipad-h1')
    expect(helipad.landedUnitId).toBe('a1')
    expect(apache.rocketAmmo).toBeGreaterThan(0)
    expect(apache.gas).toBeGreaterThan(0)
  })

  it('auto relaunches to continue attack after full ammo reload on auto-return', () => {
    const helipad = createHelipad({
      ammo: 50,
      maxAmmo: 50,
      fuel: 50,
      maxFuel: 100,
      fuelReloadTime: 100000
    })
    const landingCenter = getHelipadLandingCenter(helipad)
    const apache = createApache({
      x: landingCenter.x - 16,
      y: landingCenter.y - 16,
      flightState: 'grounded',
      rocketAmmo: 9.98,
      maxRocketAmmo: 10,
      autoHelipadReturnActive: true,
      autoHelipadReturnTargetId: 'helipad-h1',
      autoHelipadReturnAttackTargetId: 'enemy-unit-1',
      autoHelipadReturnAttackTargetType: 'unit'
    })

    updateHelipadLogic([apache], [helipad], {}, 300)

    expect(apache.rocketAmmo).toBe(10)
    expect(apache.helipadLandingRequested).toBe(false)
    expect(apache.manualFlightState).toBe('takeoff')
    expect(apache.autoHoldAltitude).toBe(true)
    expect(apache.canFire).toBe(true)
    expect(apache.landedHelipadId).toBeNull()
    expect(helipad.landedUnitId).toBeNull()
  })
  it('clears stale landed unit references when helicopters depart', () => {
    const helipad = createHelipad({ landedUnitId: 'a1' })
    const landingCenter = getHelipadLandingCenter(helipad)
    const apache = createApache({
      x: landingCenter.x - 16,
      y: landingCenter.y - 16,
      helipadLandingRequested: false,
      landedHelipadId: 'helipad-h1',
      flightState: 'flying'
    })

    updateHelipadLogic([apache], [helipad], {}, 1000)

    expect(helipad.landedUnitId).toBeNull()
    expect(apache.landedHelipadId).toBeNull()
  })

  it('tops up helipad fuel from nearby tanker trucks', () => {
    const helipad = createHelipad({ fuel: 50, maxFuel: 100, fuelReloadTime: 100000 })
    const landingCenter = getHelipadLandingCenter(helipad)
    const tanker = {
      id: 'tanker-1',
      type: 'tankerTruck',
      health: 100,
      x: landingCenter.x - 16,
      y: landingCenter.y - 16,
      supplyGas: 10,
      maxSupplyGas: 200
    }

    updateHelipadLogic([tanker], [helipad], {}, 1000)

    expect(helipad.fuel).toBeGreaterThan(50)
    expect(tanker.supplyGas).toBe(0)
  })
})
