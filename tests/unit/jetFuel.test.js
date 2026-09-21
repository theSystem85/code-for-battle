import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/sound.js', () => ({
  playPositionalSound: vi.fn()
}))

import { TILE_SIZE } from '../../src/config.js'
import { gameState } from '../../src/gameState.js'
import { showNotification } from '../../src/ui/notifications.js'
import {
  beginJetEmergencyFuelLanding,
  canJetCompleteRoundTrip,
  canJetTakeOffFromCurrentTile,
  canRecoveryTankTowTarget,
  completeJetEmergencyFuelLanding,
  estimateRoundTripFuel,
  isStrikeJet,
  JET_EMERGENCY_LANDING_MESSAGE,
  JET_INSUFFICIENT_FUEL_MESSAGE,
  rejectJetMissionIfImpossible,
  releaseMountedCargo,
  shouldJetReturnHomeForFuel,
  updateF22EmergencyLanding
} from '../../src/game/jetFuel.js'

function createJet(overrides = {}) {
  return {
    id: 'jet-1',
    type: 'f22Raptor',
    owner: 'player1',
    x: 0,
    y: 0,
    tileX: 0,
    tileY: 0,
    gas: 8000,
    maxGas: 8000,
    gasConsumption: 200,
    flightState: 'grounded',
    altitude: 0,
    maxAltitude: 64,
    health: 80,
    landedOnGround: false,
    movement: {
      velocity: { x: 0, y: 0 },
      targetVelocity: { x: 0, y: 0 },
      isMoving: false,
      rotation: 0
    },
    ...overrides
  }
}

describe('jet fuel and recovery helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gameState.humanPlayer = 'player1'
    gameState.buildings = [{
      id: 'strip-1',
      type: 'airstrip',
      owner: 'player1',
      health: 100,
      x: 0,
      y: 0,
      width: 4,
      height: 3,
      runwayPoints: {
        runwayExit: { worldX: TILE_SIZE, worldY: TILE_SIZE }
      }
    }]
    gameState.units = []
    gameState.mapGrid = [
      [{ type: 'land' }, { type: 'street' }],
      [{ type: 'land' }, { type: 'land' }]
    ]
  })

  it('identifies strike jets', () => {
    expect(isStrikeJet({ type: 'f22Raptor' })).toBe(true)
    expect(isStrikeJet({ type: 'f35' })).toBe(true)
    expect(isStrikeJet({ type: 'apache' })).toBe(false)
  })

  it('requires enough fuel for a target plus the flight home', () => {
    const jet = createJet({ gas: 50, flightState: 'grounded' })
    const farX = 80 * TILE_SIZE
    const farY = 80 * TILE_SIZE
    expect(estimateRoundTripFuel(jet, farX, farY)).toBeGreaterThan(jet.gas)
    expect(canJetCompleteRoundTrip(jet, farX, farY)).toBe(false)
    expect(canJetCompleteRoundTrip(createJet({ gas: 8000 }), farX, farY)).toBe(true)
  })

  it('turns back when remaining fuel is only enough to reach home', () => {
    const jet = createJet({
      x: 40 * TILE_SIZE,
      y: 0,
      gas: 80,
      flightState: 'airborne'
    })
    expect(shouldJetReturnHomeForFuel(jet)).toBe(true)
    expect(shouldJetReturnHomeForFuel(createJet({
      x: TILE_SIZE,
      y: TILE_SIZE,
      gas: 8000,
      flightState: 'airborne'
    }))).toBe(false)
  })

  it('blocks takeoff for grounded emergency-landed jets that are not on a street', () => {
    const jet = createJet({
      landedOnGround: true,
      tileX: 0,
      tileY: 0,
      x: 0,
      y: 0
    })
    expect(canJetTakeOffFromCurrentTile(jet)).toBe(false)
    expect(canJetTakeOffFromCurrentTile({
      ...jet,
      tileX: 1,
      tileY: 0,
      x: TILE_SIZE,
      y: 0
    })).toBe(true)
    expect(canJetTakeOffFromCurrentTile({ ...jet, towedBy: 'rt1' })).toBe(false)
  })

  it('allows recovery tanks to mount grounded immobilized jets and crewless tanks', () => {
    const tank = { id: 'rt1', type: 'recoveryTank', health: 100, towedUnit: null }
    const groundedJet = createJet({ landedOnGround: true, tileX: 0, tileY: 0, x: 0, y: 0 })
    const immobileTank = { id: 't1', health: 50, crew: { driver: false, commander: true } }
    expect(canRecoveryTankTowTarget(tank, groundedJet)).toBe(true)
    expect(canRecoveryTankTowTarget(tank, immobileTank)).toBe(true)
    expect(canRecoveryTankTowTarget(tank, createJet({ landedOnGround: false }))).toBe(false)
  })

  it('releases any mounted unit or wreck from a recovery tank', () => {
    const mounted = { id: 'jet-1', towedBy: 'rt1' }
    const wreck = { id: 'w1', towedBy: 'rt1', assignedTankId: 'rt1' }
    const tank = { id: 'rt1', towedUnit: mounted, towedWreck: wreck, recoveryTask: { wreckId: 'w1' }, recoveryProgress: 0.4 }
    expect(releaseMountedCargo(tank)).toBe(true)
    expect(tank.towedUnit).toBeNull()
    expect(tank.towedWreck).toBeNull()
    expect(mounted.towedBy).toBeNull()
    expect(tank.recoveryTask).toBeNull()
  })

  it('starts an emergency landing that keeps the jet alive', () => {
    const jet = createJet({
      flightState: 'airborne',
      altitude: 40,
      f22State: 'airborne',
      gas: 0
    })
    expect(beginJetEmergencyFuelLanding(jet, 1000)).toBe(true)
    expect(jet.emergencyFuelLanding).toBe(true)
    expect(jet.f22State).toBe('emergency_landing')
    expect(jet.commandIntent).toBe('explicitLand')
    expect(jet.health).toBe(80)

    updateF22EmergencyLanding(jet, jet.movement, 1000 + 3000)
    expect(jet.flightState).toBe('grounded')
    expect(jet.landedOnGround).toBe(true)
    expect(jet.health).toBe(80)
    expect(showNotification).toHaveBeenCalledWith(JET_EMERGENCY_LANDING_MESSAGE, 3000)
  })

  it('refuses an impossible long-range order before takeoff', () => {
    const jet = createJet({ gas: 20, flightState: 'grounded', f22State: 'parked' })
    const rejected = rejectJetMissionIfImpossible(jet, {
      x: 90 * TILE_SIZE,
      y: 90 * TILE_SIZE
    }, 'combat')
    expect(rejected).toBe(true)
    expect(showNotification).toHaveBeenCalledWith(JET_INSUFFICIENT_FUEL_MESSAGE, 3000)
  })

  it('completes emergency landing without inventing a new animation owner', () => {
    const jet = createJet({
      type: 'f35',
      flightState: 'landing',
      emergencyFuelLanding: true,
      altitude: 0
    })
    completeJetEmergencyFuelLanding(jet)
    expect(jet.landedOnGround).toBe(true)
    expect(jet.flightState).toBe('grounded')
    expect(jet.emergencyFuelLanding).toBe(false)
  })
})
