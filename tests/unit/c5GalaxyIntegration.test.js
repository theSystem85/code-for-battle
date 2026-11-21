import { describe, expect, it } from 'vitest'
import { embarkC5Vehicle } from '../../src/game/c5Cargo.js'
import { startC5Mission, updateC5GalaxySystem } from '../../src/game/c5GalaxySystem.js'
import { ensureAirstripOperations, setC5ParkingOccupant } from '../../src/utils/airstripUtils.js'

describe('C-5 real simulation wiring', () => {
  it('[U07315] runs a full mission: taxi, takeoff, outbound, airdrop, return, landing, parking, and cargo loss on destruction', () => {
    const airstrip = { id: 'strip', type: 'airstrip', x: 2, y: 2, width: 12, height: 6 }
    ensureAirstripOperations(airstrip)
    const galaxy = { id: 'c5', type: 'c5Galaxy', health: 300, homeAirstripId: 'strip', flightState: 'grounded', altitude: 0, x: 200, y: 200, embarkedUnitIds: [], embarkedUnitTypes: [] }
    const tank = { id: 'tank', type: 'tank-v3', health: 200, weight: 73 }
    const howitzer = { id: 'gun', type: 'howitzer', health: 160, weight: 32 }
    const units = [galaxy, tank, howitzer]
    expect(embarkC5Vehicle(galaxy, tank, units).allowed).toBe(true)
    expect(embarkC5Vehicle(galaxy, howitzer, units).allowed).toBe(true)
    const size = 40
    const mapGrid = Array.from({ length: size }, () => Array.from({ length: size }, () => ({ type: 'land' })))
    const state = { buildings: [airstrip], occupancyMap: Array.from({ length: size }, () => Array(size).fill(0)) }
    startC5Mission(galaxy, { x: 30, y: 30 }, 0)
    const seen = new Set()
    let tick = 0
    for (; tick < 20000 && galaxy.c5Mission; tick++) { updateC5GalaxySystem(units, mapGrid, state, tick); seen.add(galaxy.flightState) }
    expect(galaxy.c5Mission).toBeNull()
    for (const phase of ['taxiOut', 'takeoffRoll', 'climb', 'airborne', 'approach', 'touchdown', 'taxiIn', 'grounded']) expect(seen.has(phase)).toBe(true)
    expect(galaxy.embarkedUnitIds).toEqual([])
    expect([tank, howitzer].every(unit => !unit.hidden && !unit.invulnerable)).toBe(true)
    expect(airstrip.f22OccupiedSlotUnitIds.slice(0, 3)).toEqual(['c5', 'c5', 'c5'])
    const cargo = { id: 'cargo', type: 'tank_v1', health: 100, weight: 42 }
    units.push(cargo)
    embarkC5Vehicle(galaxy, cargo, units); setC5ParkingOccupant(airstrip, galaxy.id); galaxy.health = 0
    updateC5GalaxySystem(units, mapGrid, state, tick + 1)
    expect(cargo.health).toBe(0)
  })
})
