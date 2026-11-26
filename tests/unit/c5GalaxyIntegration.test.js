import { checkUnitCollision } from '../../src/game/bulletCollision.js'
import { describe, expect, it } from 'vitest'
import { beginC5Airdrop, C5_DROP_DESCENT_TICKS, embarkC5Vehicle } from '../../src/game/c5Cargo.js'
import { applyC5Order, startC5Mission, updateC5GalaxySystem } from '../../src/game/c5GalaxySystem.js'
import { TILE_SIZE, UNIT_PROPERTIES } from '../../src/config.js'
import { ensureAirstripOperations, setC5ParkingOccupant } from '../../src/utils/airstripUtils.js'

describe('C-5 real simulation wiring', () => {
  it('[U07391] retargets a patrol transport in flight without returning to base between legs', () => {
    const galaxy = { id: 'c5-patrol', type: 'c5Galaxy', health: 300, x: 100, y: 100, flightState: 'airborne', altitude: 100, patrol: { index: 0 } }
    const mapGrid = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => ({ type: 'land' })))
    expect(startC5Mission(galaxy, { x: 20, y: 20 }, 0, { mapGrid, drop: false })).toBe(true)
    const mission = galaxy.c5Mission
    expect(startC5Mission(galaxy, { x: 25, y: 15 }, 1, { mapGrid, drop: false })).toBe(true)
    expect(galaxy.c5Mission).toBe(mission)
    expect(mission).toMatchObject({ phase: 'outbound', target: { x: 25, y: 15 }, path: null, drop: false })
    const state = { buildings: [], occupancyMap: mapGrid.map(row => row.map(() => 0)) }
    for (let tick = 0; tick < 10000 && mission.phase === 'outbound'; tick++) updateC5GalaxySystem([galaxy], mapGrid, state, tick)
    expect(mission.phase).toBe('patrolHold')
    expect(galaxy.flightState).toBe('airborne')
    galaxy.health = 0
    expect(startC5Mission(galaxy, { x: 20, y: 20 }, 2, { mapGrid, drop: false })).toBe(false)
  })
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
    let approaches = 0
    let turningSteps = 0
    const { runwayStart, runwayExit } = airstrip.runwayPoints
    for (; tick < 20000 && galaxy.c5Mission; tick++) {
      const { x, y, direction, flightState, altitude } = galaxy
      updateC5GalaxySystem(units, mapGrid, state, tick)
      seen.add(galaxy.flightState)
      if (flightState === 'takeoffRoll' && galaxy.flightState === 'climb') {
        expect(galaxy.x + TILE_SIZE / 2).toBeCloseTo(runwayExit.worldX)
        expect(galaxy.altitude).toBe(0)
      }
      if (flightState === 'approach') {
        approaches++
        expect(galaxy.x).toBeGreaterThan(x)
        expect(galaxy.altitude).toBeLessThan(altitude)
        expect(galaxy.direction).toBeCloseTo(0)
        if (galaxy.flightState === 'touchdown') expect(galaxy.x + TILE_SIZE / 2).toBeCloseTo(runwayStart.worldX)
      }
      if (flightState === 'airborne' && galaxy.flightState === 'airborne' && galaxy.direction !== direction) {
        turningSteps++
        expect(Math.hypot(galaxy.x - x, galaxy.y - y)).toBeGreaterThan(0)
      }
    }
    expect(UNIT_PROPERTIES.c5Galaxy.speed).toBeCloseTo(3.3)
    expect(approaches).toBeGreaterThan(60)
    expect(turningSteps).toBeGreaterThan(10)
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

  it('[U07316] keeps released cargo descending after the aircraft is destroyed and only accepts anti-air hits in flight', () => {
    const galaxy = { id: 'galaxy', type: 'c5Galaxy', owner: 'player1', health: 300, flightState: 'airborne',
      altitude: 144, x: 320, y: 320, c5Mission: { phase: 'dropping' } }
    const released = { id: 'first', type: 'tank_v1', owner: 'player1', health: 100, weight: 42 }
    const aboard = { id: 'second', type: 'tank-v2', owner: 'player1', health: 150, weight: 60 }
    const units = [galaxy, released, aboard]
    const mapGrid = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => ({ type: 'land' })))
    const state = { mapGrid, occupancyMap: mapGrid.map(row => row.map(() => 0)) }
    embarkC5Vehicle(galaxy, released, units)
    embarkC5Vehicle(galaxy, aboard, units)
    beginC5Airdrop(galaxy, { x: 10, y: 10 }, 1)

    updateC5GalaxySystem(units, mapGrid, state, 1)
    const bullet = { x: released.x + 16, y: released.y + 16 - released.altitude * 0.4 }
    expect(checkUnitCollision({ ...bullet, shooter: { owner: 'player2', type: 'turretGunV1' } }, released)).toBe(false)
    expect(checkUnitCollision({ ...bullet, shooter: { owner: 'player2', type: 'rocketTurret' } }, released)).toBe(true)
    expect(C5_DROP_DESCENT_TICKS).toBe(270)
    expect(released.c5Drop).toMatchObject({ landTick: 271 })
    expect(aboard.embarkedOnId).toBe(galaxy.id)

    galaxy.health = 0
    updateC5GalaxySystem(units, mapGrid, state, 2)
    expect(aboard).toMatchObject({ health: 0, hidden: false, embarkedOnId: null, c5CargoDestroyed: true })
    expect(released.c5Drop).not.toBeNull()
    units.splice(0, 1)
    updateC5GalaxySystem(units, mapGrid, state, 270)
    expect(released.c5Drop).not.toBeNull()
    updateC5GalaxySystem(units, mapGrid, state, 271)
    expect(released).toMatchObject({ health: 100, tileX: 10, tileY: 10, c5Drop: null, altitude: 0 })
  })

  it('[U07317] rejects a water target and orders from another player', () => {
    const galaxy = { id: 'galaxy', type: 'c5Galaxy', owner: 'player1', health: 300, flightState: 'grounded',
      x: 0, y: 0, embarkedUnitIds: ['cargo'] }
    const mapGrid = [[{ type: 'land' }, { type: 'water' }, { type: 'land' }]]
    const state = { mapGrid }
    const units = [galaxy]
    expect(applyC5Order('airdrop', { galaxyId: galaxy.id, target: { x: 1, y: 0 } }, 'player1', units, state)).toBe(false)
    expect(applyC5Order('airdrop', { galaxyId: galaxy.id, target: { x: 2, y: 0 } }, 'player2', units, state)).toBe(false)
    expect(applyC5Order('airdrop', { galaxyId: galaxy.id, target: { x: 2, y: 0 } }, 'player1', units, state)).toBe(true)
    expect(galaxy.c5Mission.target).toEqual({ x: 2, y: 0 })
  })


  it('[U07330] turns the parked Galaxy toward boarding cargo and routes it through the nose', () => {
    const galaxy = { id: 'galaxy', type: 'c5Galaxy', owner: 'player1', health: 300, flightState: 'grounded',
      x: 224, y: 224, direction: 0, embarkedUnitIds: [], embarkedUnitTypes: [] }
    const cargo = { id: 'cargo', type: 'tank_v1', owner: 'player1', health: 100, x: 224, y: 320,
      c5Boarding: { galaxyId: galaxy.id, tile: { x: 7, y: 10 }, loading: false } }
    const mapGrid = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => ({ type: 'land' })))
    const state = { mapGrid, occupancyMap: mapGrid.map(row => row.map(() => 0)) }
    const units = [galaxy, cargo]
    let noseY = null
    for (let tick = 0; tick < 200 && !cargo.embarkedOnId; tick++) {
      updateC5GalaxySystem(units, mapGrid, state, tick)
      if (cargo.c5Boarding?.atNose && noseY === null) noseY = cargo.y
    }
    expect(galaxy.direction).toBeCloseTo(Math.PI / 2)
    expect(noseY - galaxy.y).toBeGreaterThan(TILE_SIZE)
    expect(cargo.embarkedOnId).toBe(galaxy.id)
  })

})
