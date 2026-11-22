import { describe, expect, it, vi } from 'vitest'
import { C5_MAX_PAYLOAD_TONS, UNIT_PROPERTIES } from '../../src/config.js'
import {
  advanceC5Airdrop,
  beginC5Airdrop,
  embarkC5Vehicle,
  evaluateC5Load,
  findC5DropTile,
  getC5CargoWeight
} from '../../src/game/c5Cargo.js'

const galaxy = () => ({ id: 'c5', embarkedUnitIds: [], embarkedUnitTypes: [] })
const vehicle = (id, type, weight) => ({ id, type, weight, health: 100 })

describe('C-5 Galaxy cargo', () => {
  it('[U07321] defines weight and airlift eligibility for every playable unit', () => {
    for (const [type, properties] of Object.entries(UNIT_PROPERTIES)) {
      if (type === 'base') continue
      expect(properties.weight, type).toBeGreaterThan(0)
      expect(typeof properties.airliftable, type).toBe('boolean')
    }
  })

  it('[U07322] accepts an exact 122 t manifest without a unit-count limit', () => {
    const transport = galaxy()
    const units = new Map()
    for (let index = 0; index < 30; index++) {
      const unit = vehicle(`a${index}`, 'ambulance', 4)
      units.set(unit.id, unit)
      expect(embarkC5Vehicle(transport, unit, units).allowed).toBe(true)
    }
    const last = vehicle('last', 'ambulance', 2)
    units.set(last.id, last)
    expect(embarkC5Vehicle(transport, last, units).allowed).toBe(true)
    expect(getC5CargoWeight(transport, units)).toBe(C5_MAX_PAYLOAD_TONS)
  })

  it('[U07323] rejects over-limit, individually overweight, and non-airliftable cargo', () => {
    const transport = galaxy()
    const units = new Map([['tank', vehicle('tank', 'tank-v3', 73)]])
    transport.embarkedUnitIds.push('tank')
    expect(evaluateC5Load(transport, vehicle('other', 'tank-v2', 60), units)).toMatchObject({ allowed: false, free: 49 })
    expect(evaluateC5Load(galaxy(), vehicle('huge', 'tank-v3', 123), new Map()).allowed).toBe(false)
    expect(evaluateC5Load(galaxy(), vehicle('jet', 'f22Raptor', 19.7), new Map()).allowed).toBe(false)
  })

  it('[U07324] chooses the first deterministic free passable land tile', () => {
    expect(findC5DropTile({ x: 5, y: 5 }, (x, y) => x === 4 && y === 4)).toEqual({ x: 4, y: 4 })
  })

  it('[U07326] keeps cargo aboard when no drop tile is valid', () => {
    const transport = galaxy()
    const unit = vehicle('tank', 'tank_v1', 42)
    const units = new Map([[unit.id, unit]])
    embarkC5Vehicle(transport, unit, units)
    beginC5Airdrop(transport, { x: 2, y: 2 }, 10)
    const notify = vi.fn()
    advanceC5Airdrop(transport, 10, units, () => false, notify)
    expect(transport.embarkedUnitIds).toEqual(['tank'])
    expect(notify).toHaveBeenCalledOnce()
  })

  it('[U07327] round-trips cargo and deterministic drop queue state through JSON', () => {
    const transport = galaxy()
    transport.embarkedUnitIds = ['one']
    transport.embarkedUnitTypes = ['tank_v1']
    beginC5Airdrop(transport, { x: 8, y: 9 }, 123)
    expect(JSON.parse(JSON.stringify(transport))).toEqual(transport)
  })
})

it('[U07328] advances deterministic takeoff and landing altitude state', async() => {
  const { advanceC5FlightAnimation } = await import('../../src/game/c5Cargo.js')
  const unit = { flightState: 'takingOff', altitude: 0, maxAltitude: 90 }
  for (let tick = 0; tick < 90; tick++) advanceC5FlightAnimation(unit)
  expect(unit).toMatchObject({ flightState: 'airborne', altitude: 90 })
  unit.flightState = 'landing'
  for (let tick = 0; tick < 90; tick++) advanceC5FlightAnimation(unit)
  expect(unit).toMatchObject({ flightState: 'grounded', altitude: 0 })
})
