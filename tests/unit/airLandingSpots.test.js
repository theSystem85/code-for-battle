import { describe, expect, it } from 'vitest'
import { updateHelipadLogic } from '../../src/game/helipadLogic.js'
import { getAirstripParkingSpots, reserveAirstripParkingSlot, setAirstripSlotOccupant } from '../../src/utils/airstripUtils.js'
import { getAvailableLandingSpots } from '../../src/utils/airLandingSpots.js'

const aircraft = type => ({ id: type, type, owner: 'player1', selected: true, health: 100 })

describe('air landing spots', () => {
  it('[U06992] exposes compatible free helipad and airstrip spots while hiding occupied ones', () => {
    const helipad = { id: 'pad', type: 'helipad', owner: 'player1', health: 100, x: 2, y: 3, width: 2, height: 2 }
    const airstrip = {
      id: 'strip', type: 'airstrip', owner: 'player1', health: 100, x: 10, y: 10, width: 12, height: 6,
      f22OccupiedSlotUnitIds: ['parked', null, null, null, null, null, null],
      f22ReservedSlotUnitIds: [null, 'inbound', null, null, null, null, null]
    }

    const spots = getAvailableLandingSpots([aircraft('apache')], [helipad, airstrip], [])

    expect(spots.filter(spot => spot.kind === 'helipad')).toHaveLength(1)
    expect(spots.filter(spot => spot.kind === 'airstrip').map(spot => spot.index)).toEqual([2, 3, 4, 5, 6])
  })

  it('[U07395] reopens a departed aircraft bay and keeps a different inbound reservation', () => {
    const airstrip = { id: 'strip', type: 'airstrip', owner: 'player1', health: 100, x: 10, y: 10, width: 12, height: 6 }
    const parked = { ...aircraft('apache'), id: 'departing', flightState: 'grounded', landedHelipadId: 'strip', airstripParkingSlotIndex: 2 }
    const spot = getAirstripParkingSpots(airstrip)[2]
    parked.x = spot.worldX - 16
    parked.y = spot.worldY - 16
    const inbound = { ...aircraft('f35'), id: 'inbound', flightState: 'airborne', helipadLandingRequested: true,
      helipadTargetId: 'strip', airstripParkingSlotIndex: 3, x: 0, y: 0 }
    setAirstripSlotOccupant(airstrip, 2, parked.id)
    reserveAirstripParkingSlot(airstrip, inbound.id, 3)
    const free = () => getAvailableLandingSpots([aircraft('f22Raptor')], [airstrip], [parked, inbound]).map(spot => spot.index)

    updateHelipadLogic([parked, inbound], [airstrip], {}, 16)
    expect(free()).not.toContain(2)
    // A saved VTOL aircraft can still have the request that originally landed it.
    Object.assign(parked, { flightState: 'takeoff', manualFlightState: 'takeoff', helipadLandingRequested: true, helipadTargetId: 'strip' })
    updateHelipadLogic([parked, inbound], [airstrip], {}, 16)
    expect(parked.helipadLandingRequested).toBe(false)
    expect(free()).toContain(2)
    expect(free()).not.toContain(3)
    expect(reserveAirstripParkingSlot(airstrip, 'next-aircraft', 2)).toBe(2)
  })

  it('[U07396] reopens carrier deck slots after launch or aircraft loss', () => {
    const carrier = { id: 'carrier', type: 'aircraftCarrier', owner: 'player1', health: 100, x: 100, y: 100, deckSlotCapacity: 4 }
    const launching = { ...aircraft('f22Raptor'), carrierDeckSlotIndex: 0, carrierOperation: { carrierId: 'carrier', state: 'launch' } }
    const destroyed = { ...aircraft('f35'), health: 0, carrierId: 'carrier', carrierDeckSlotIndex: 1 }
    const free = () => getAvailableLandingSpots([aircraft('f22Raptor')], [], [carrier, launching, destroyed]).map(spot => spot.index)
    expect(free()).toEqual([1, 2, 3])
    launching.carrierOperation = null
    expect(free()).toEqual([0, 1, 2, 3])
  })

  it('[U06993] does not expose helipads to F22 Raptors', () => {
    const helipad = { id: 'pad', type: 'helipad', owner: 'player1', health: 100, x: 2, y: 3, width: 2, height: 2 }
    expect(getAvailableLandingSpots([aircraft('f22Raptor')], [helipad], [])).toEqual([])
  })

  it('[U06994] exposes only carrier starts large enough for the selected VTOL aircraft', () => {
    const carrier = { id: 'carrier', type: 'aircraftCarrier', owner: 'player1', health: 100, x: 100, y: 100, deckSlotCapacity: 4 }
    const parked = { id: 'parked', type: 'f22Raptor', carrierId: 'carrier', carrierDeckSlotIndex: 1 }

    const spots = getAvailableLandingSpots([aircraft('apache')], [], [carrier, parked])

    expect(spots.map(spot => spot.index)).toEqual([2])
  })
})
