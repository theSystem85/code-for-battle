import { describe, it, expect } from 'vitest'
import { ensureAirstripOperations, reserveAirstripParkingSlot, releaseAirstripParkingSlotReservation, setAirstripSlotOccupant } from '../../src/utils/airstripUtils.js'

describe('airstrip slot reservations', () => {
  it('assigns unique reserved slots and releases correctly', () => {
    const airstrip = { type: 'airstrip', x: 10, y: 10, width: 24, height: 12 }
    ensureAirstripOperations(airstrip)

    const a = reserveAirstripParkingSlot(airstrip, 'f35-a')
    const b = reserveAirstripParkingSlot(airstrip, 'f35-b')

    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a).not.toBe(b)

    setAirstripSlotOccupant(airstrip, a, 'f35-a')
    releaseAirstripParkingSlotReservation(airstrip, 'f35-b')

    expect(airstrip.f22ReservedSlotUnitIds[a]).toBe('f35-a')
    expect(airstrip.f22ReservedSlotUnitIds[b]).toBeNull()
  })
})
