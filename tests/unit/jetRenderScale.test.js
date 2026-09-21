import { describe, expect, it } from 'vitest'
import {
  getJetRenderScale,
  getJetResizeAuditTag,
  LANDED_JET_SCALE
} from '../../src/rendering/jetRenderScale.js'

describe('jetRenderScale', () => {
  it('renders carrier and airstrip jets at 75% while grounded', () => {
    expect(getJetRenderScale({
      carrierId: 'carrier',
      flightState: 'grounded',
      altitude: 0,
      maxAltitude: 128
    })).toBe(LANDED_JET_SCALE)
    expect(getJetRenderScale({
      airstripId: 'airstrip',
      flightState: 'grounded',
      altitude: 0,
      maxAltitude: 128
    })).toBe(LANDED_JET_SCALE)
  })

  it('interpolates only during an explicitly tagged takeoff', () => {
    const jet = {
      airstripId: 'airstrip',
      flightState: 'takeoff',
      manualFlightState: 'takeoff',
      altitude: 64,
      maxAltitude: 128
    }
    expect(getJetRenderScale(jet)).toBeCloseTo(0.875)
    expect(getJetResizeAuditTag(jet)).toMatch(/takeoff/)
    jet.altitude = 128
    expect(getJetRenderScale(jet)).toBe(1)
  })

  it('keeps ordinary ground and flight states at stable prepared sizes', () => {
    expect(getJetRenderScale({
      airstripId: 'airstrip',
      flightState: 'grounded',
      altitude: 64,
      maxAltitude: 128
    })).toBe(LANDED_JET_SCALE)
    expect(getJetRenderScale({
      airstripId: 'airstrip',
      flightState: 'airborne',
      altitude: 64,
      maxAltitude: 128
    })).toBe(1)
  })

  it('does not shrink jets unrelated to a carrier or airstrip', () => {
    expect(getJetRenderScale({ altitude: 0, maxAltitude: 128 })).toBe(1)
  })
})
