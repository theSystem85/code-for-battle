import { describe, expect, it } from 'vitest'
import { getJetRenderScale, LANDED_JET_SCALE } from '../../src/rendering/jetRenderScale.js'

describe('jetRenderScale', () => {
  it('renders carrier and airstrip jets at 75% while grounded', () => {
    expect(getJetRenderScale({ carrierId: 'carrier', altitude: 0, maxAltitude: 128 })).toBe(LANDED_JET_SCALE)
    expect(getJetRenderScale({ airstripId: 'airstrip', altitude: 0, maxAltitude: 128 })).toBe(LANDED_JET_SCALE)
  })

  it('interpolates continuously between landed and airborne size', () => {
    const jet = { airstripId: 'airstrip', altitude: 64, maxAltitude: 128 }
    expect(getJetRenderScale(jet)).toBeCloseTo(0.875)
    jet.altitude = 128
    expect(getJetRenderScale(jet)).toBe(1)
  })

  it('does not shrink jets unrelated to a carrier or airstrip', () => {
    expect(getJetRenderScale({ altitude: 0, maxAltitude: 128 })).toBe(1)
  })
})
