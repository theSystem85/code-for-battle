import { describe, expect, it } from 'vitest'
import { AMMO_RESUPPLY_TIME, GAS_REFILL_TIME, TILE_SIZE } from '../../src/config.js'
import { updateAmmunitionSystem } from '../../src/game/ammunitionSystem.js'
import { updateGasStationLogic } from '../../src/game/gasStationLogic.js'
import { updateHospitalLogic } from '../../src/game/hospitalLogic.js'
import { updateShipyardServiceLogic } from '../../src/game/shipyardServiceLogic.js'
import { isReturningForSupplies } from '../../src/game/serviceUnitIndex.js'
import { updateSupplyReturns } from '../../src/game/supplyReturn.js'

function map(type) {
  return Array.from({ length: 24 }, () => Array.from({ length: 24 }, () => ({ type })))
}

function building(type, x, owner = 'player1') {
  return { id: type, type, x, y: 8, width: 3, height: 3, owner, health: 100 }
}

function moveTo(unit, tile) {
  unit.x = tile.x * TILE_SIZE
  unit.y = tile.y * TILE_SIZE
  unit.tileX = tile.x
  unit.tileY = tile.y
  unit.path = []
  unit.moveTarget = null
}

describe('automatic supply returns', () => {
  it.each([
    ['ambulance', 'hospital', 'medics', 'maxMedics', 10, updateHospitalLogic],
    ['tankerTruck', 'gasStation', 'supplyGas', 'maxSupplyGas', 1000, updateGasStationLogic],
    ['ammunitionTruck', 'ammunitionFactory', 'ammoCargo', 'maxAmmoCargo', 500, updateAmmunitionSystem]
  ])('[U07351] routes a depleted %s to a friendly building and holds it there until full', (type, depot, cargo, capacity, maximum, refill) => {
    const grid = map('land')
    const buildings = [building(depot, 3, 'player2'), building(depot, 16)]
    const state = { humanPlayer: 'player1', simulationTime: 1000, buildings, money: 100 }
    const unit = { id: type, type, owner: 'player1', health: 100, gas: 50, maxGas: 50, [cargo]: 0, [capacity]: maximum }
    moveTo(unit, { x: 2, y: 9 })

    updateSupplyReturns([unit], state, grid, null)
    expect(isReturningForSupplies(unit)).toBe(true)
    expect(unit.moveTarget.x).toBeGreaterThan(10)
    expect(unit.path.at(-1)).toEqual(unit.moveTarget)

    moveTo(unit, unit.moveTarget)
    refill([unit], buildings, state, 2000)
    state.simulationTime += 2000
    updateSupplyReturns([unit], state, grid, null)
    expect(unit[cargo]).toBeGreaterThan(0)
    expect(unit[cargo]).toBeLessThan(maximum)
    expect(isReturningForSupplies(unit)).toBe(true)

    refill([unit], buildings, state, 30000)
    state.simulationTime += 30000
    updateSupplyReturns([unit], state, grid, null)
    expect(unit[cargo]).toBe(maximum)
    expect(isReturningForSupplies(unit)).toBe(false)
  })

  it('[U07352] restocks an empty supply ship when a friendly shipyard can replenish its cargo', () => {
    const grid = map('water')
    const buildings = [building('shipyard', 16), building('ammunitionFactory', 15)]
    const state = { humanPlayer: 'player1', simulationTime: 1000, buildings }
    const ship = { id: 'ship', type: 'supplyShip', isNaval: true, owner: 'player1', health: 100,
      supplyAmmo: 0, maxSupplyAmmo: 100, supplyFuel: 0, maxSupplyFuel: 100 }
    moveTo(ship, { x: 6, y: 9 })

    updateSupplyReturns([ship], state, grid, null)
    expect(isReturningForSupplies(ship)).toBe(true)
    expect(ship.path.at(-1)).toEqual(ship.moveTarget)

    moveTo(ship, ship.moveTarget)
    const delta = Math.max(AMMO_RESUPPLY_TIME, GAS_REFILL_TIME)
    updateShipyardServiceLogic([ship], buildings, grid, delta)
    state.simulationTime += delta
    updateSupplyReturns([ship], state, grid, null)
    expect(ship.supplyAmmo).toBe(ship.maxSupplyAmmo)
    expect(ship.supplyFuel).toBe(0)
    expect(isReturningForSupplies(ship)).toBe(false)
  })
})
