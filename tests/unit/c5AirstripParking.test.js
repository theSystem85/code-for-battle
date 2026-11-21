import { describe, expect, it } from 'vitest'
import { claimAirstripParkingSlot, releaseC5ParkingSlots, reserveC5ParkingSlots, setC5ParkingOccupant } from '../../src/utils/airstripUtils.js'

const airstrip = () => ({ type: 'airstrip', x: 0, y: 0, width: 12, height: 6 })

describe('C-5 airstrip parking', () => {
  it('[U07313] reserves and occupies all three lower slots atomically', () => {
    const strip = airstrip()
    expect(reserveC5ParkingSlots(strip, 'galaxy')).toEqual([0, 1, 2])
    expect(setC5ParkingOccupant(strip, 'galaxy')).toBe(true)
    expect(strip.f22OccupiedSlotUnitIds.slice(0, 3)).toEqual(['galaxy', 'galaxy', 'galaxy'])
    expect(claimAirstripParkingSlot(strip)).toBe(3)
    releaseC5ParkingSlots(strip, 'galaxy')
    expect(claimAirstripParkingSlot(strip)).toBe(0)
  })

  it('[U07314] refuses a partial three-slot reservation', () => {
    const strip = airstrip()
    reserveC5ParkingSlots(strip, 'first')
    expect(reserveC5ParkingSlots(strip, 'second')).toBeNull()
  })
})
