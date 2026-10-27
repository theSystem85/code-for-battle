import { describe, expect, it } from 'vitest'
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
