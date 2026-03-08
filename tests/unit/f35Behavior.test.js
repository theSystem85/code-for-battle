import { describe, it, expect } from 'vitest'
import { canF35ReleaseWeapons, canF35StartLanding, computeF35BombReleasePoint } from '../../src/game/f35Behavior.js'

describe('f35Behavior helpers', () => {
  it('blocks weapon release on non-airborne states', () => {
    const base = { type: 'f35', altitude: 20, canFire: true, manualFlightState: 'auto' }
    expect(canF35ReleaseWeapons({ ...base, flightState: 'grounded' })).toBe(false)
    expect(canF35ReleaseWeapons({ ...base, flightState: 'landing' })).toBe(false)
    expect(canF35ReleaseWeapons({ ...base, flightState: 'takeoff' })).toBe(false)
    expect(canF35ReleaseWeapons({ ...base, flightState: 'airborne' })).toBe(true)
  })

  it('allows landing only for explicit landing intents', () => {
    const unit = { type: 'f35', commandIntent: 'move', helipadLandingRequested: true, helipadTargetId: 'h1' }
    expect(canF35StartLanding(unit)).toBe(false)
    expect(canF35StartLanding({ ...unit, commandIntent: 'landAtStructure' })).toBe(true)
    expect(canF35StartLanding({ ...unit, commandIntent: 'returnToBase' })).toBe(true)
    expect(canF35StartLanding({
      type: 'f35',
      commandIntent: 'explicitLand',
      helipadLandingRequested: false,
      groundLandingRequested: true,
      groundLandingTarget: { x: 100, y: 100 }
    })).toBe(true)
  })

  it('computes pre-target release points', () => {
    const point = computeF35BombReleasePoint({
      x: 0,
      y: 0,
      direction: 0,
      movement: { velocity: { x: 3, y: 0 }, currentSpeed: 3 },
      airCruiseSpeed: 3,
      speed: 3
    }, 320, 16)

    expect(point.x).toBeLessThan(320)
    expect(point.releaseDistance).toBeGreaterThan(0)
  })
})
