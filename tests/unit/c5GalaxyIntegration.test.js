import { describe, expect, it } from 'vitest'
import { beginC5Airdrop, embarkC5Vehicle } from '../../src/game/c5Cargo.js'
import { updateC5GalaxySystem } from '../../src/game/c5GalaxySystem.js'
import { ensureAirstripOperations, setC5ParkingOccupant } from '../../src/utils/airstripUtils.js'

describe('C-5 real simulation wiring', () => {
  it('[U07315] advances flight, airdrops cargo, parks, and destroys loaded cargo through the wired tick system', () => {
    const airstrip = { id: 'strip', type: 'airstrip', x: 2, y: 2, width: 12, height: 6 }
    ensureAirstripOperations(airstrip)
    const galaxy = { id: 'c5', type: 'c5Galaxy', health: 300, homeAirstripId: 'strip', flightState: 'takingOff', altitude: 0, maxAltitude: 90, embarkedUnitIds: [], embarkedUnitTypes: [] }
    const tank = { id: 'tank', type: 'tank-v3', health: 200, weight: 73 }
    const howitzer = { id: 'gun', type: 'howitzer', health: 160, weight: 32 }
    const units = [galaxy, tank, howitzer]
    expect(embarkC5Vehicle(galaxy, tank, units).allowed).toBe(true)
    expect(embarkC5Vehicle(galaxy, howitzer, units).allowed).toBe(true)
    const mapGrid = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => ({ type: 'land' })))
    const state = { buildings: [airstrip], occupancyMap: Array.from({ length: 20 }, () => Array(20).fill(0)) }
    for (let tick = 0; tick < 90; tick++) updateC5GalaxySystem(units, mapGrid, state, tick)
    expect(galaxy.flightState).toBe('airborne')
    beginC5Airdrop(galaxy, { x: 15, y: 15 }, 90)
    for (let tick = 90; tick <= 220; tick++) updateC5GalaxySystem(units, mapGrid, state, tick)
    expect([tank, howitzer].every(unit => !unit.hidden && !unit.invulnerable)).toBe(true)
    galaxy.flightState = 'landing'
    for (let tick = 221; tick < 311; tick++) updateC5GalaxySystem(units, mapGrid, state, tick)
    expect(airstrip.f22OccupiedSlotUnitIds.slice(0, 3)).toEqual(['c5', 'c5', 'c5'])
    const cargo = { id: 'cargo', type: 'tank_v1', health: 100, weight: 42 }
    units.push(cargo); galaxy.embarkedUnitIds = []; galaxy.embarkedUnitTypes = []
    embarkC5Vehicle(galaxy, cargo, units); setC5ParkingOccupant(airstrip, galaxy.id); galaxy.health = 0
    updateC5GalaxySystem(units, mapGrid, state, 312)
    expect(cargo.health).toBe(0)
  })
})
