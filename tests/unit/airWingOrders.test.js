import { beforeEach, describe, expect, it } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import { gameState } from '../../src/gameState.js'
import { beginAirstripLanding, updateAirGuard } from '../../src/game/airWingOrders.js'

function airstrip(id = 'strip-1') {
  return {
    id,
    type: 'airstrip',
    owner: 'player1',
    health: 100,
    x: 2,
    y: 2,
    width: 8,
    height: 5
  }
}

describe('air wing orders', () => {
  beforeEach(() => {
    gameState.buildings = []
    gameState.units = []
    gameState.humanPlayer = 'player1'
  })

  it('[U06526] lands an apache on an airstrip and drops its carrier association', () => {
    const strip = airstrip()
    const carrier = {
      id: 'carrier',
      type: 'aircraftCarrier',
      owner: 'player1',
      health: 400,
      x: 10 * TILE_SIZE,
      y: 8 * TILE_SIZE,
      deckSlotCapacity: 4,
      carrierAircraftIds: ['apache'],
      direction: 0
    }
    const apache = {
      id: 'apache',
      type: 'apache',
      owner: 'player1',
      health: 100,
      x: carrier.x,
      y: carrier.y,
      homeCarrierId: carrier.id,
      carrierId: carrier.id,
      carrierDeckSlotIndex: 0,
      carrierOperation: { state: 'parked', carrierId: carrier.id },
      carrierStrikeActive: true,
      flightState: 'grounded'
    }
    gameState.buildings = [strip]
    gameState.units = [carrier, apache]

    const landing = beginAirstripLanding(apache, strip, { units: [carrier, apache] })

    expect(landing?.airstripId).toBe(strip.id)
    expect(apache.homeCarrierId).toBeNull()
    expect(apache.homeAirstripId).toBe(strip.id)
    expect(apache.helipadLandingRequested).toBe(true)
    expect(apache.carrierStrikeActive).toBe(false)
    expect(apache.carrierOperation?.state).toBe('launch')
    expect(apache.flightPlan?.mode).toBe('airstrip')
  })

  it('[U06527] makes an F35 follow its guard target and intercept whoever attacks that target', () => {
    const guarded = {
      id: 'tank',
      type: 'tank',
      owner: 'player1',
      health: 100,
      x: 12 * TILE_SIZE,
      y: 8 * TILE_SIZE,
      tileX: 12,
      tileY: 8
    }
    const enemy = {
      id: 'enemy',
      type: 'tank',
      owner: 'player2',
      health: 80,
      x: 18 * TILE_SIZE,
      y: 8 * TILE_SIZE,
      tileX: 18,
      tileY: 8
    }
    const carrier = {
      id: 'carrier',
      type: 'aircraftCarrier',
      owner: 'player1',
      health: 400,
      x: 4 * TILE_SIZE,
      y: 8 * TILE_SIZE,
      deckSlotCapacity: 4,
      carrierAircraftIds: ['f35'],
      carrierFuel: 400,
      carrierAmmo: 40,
      direction: 0
    }
    const f35 = {
      id: 'f35',
      type: 'f35',
      owner: 'player1',
      health: 100,
      x: carrier.x,
      y: carrier.y,
      homeCarrierId: carrier.id,
      carrierId: carrier.id,
      carrierOperation: { state: 'parked', carrierId: carrier.id },
      flightState: 'grounded',
      guardMode: true,
      guardTarget: guarded,
      rocketAmmo: 4,
      maxRocketAmmo: 4,
      gas: 100,
      maxGas: 100
    }
    const units = [carrier, f35, guarded, enemy]

    updateAirGuard(f35, units, 100)
    expect(f35.carrierOperation.state).toBe('launch')
    expect(f35.target ?? null).toBeNull()

    f35.carrierOperation = null
    f35.carrierId = null
    f35.flightState = 'airborne'
    updateAirGuard(f35, units, 200)
    expect(f35.flightPlan?.mode).toBe('guard')
    expect(f35.flightPlan.followTargetId).toBe(guarded.id)
    expect(f35.target ?? null).toBeNull()

    guarded.lastAttacker = enemy
    updateAirGuard(f35, units, 300)
    expect(f35.target).toBe(enemy)
    expect(f35.airGuardInterceptId).toBe(enemy.id)
    expect(f35.flightPlan?.mode).toBe('combat')
    expect(f35.guardMode).toBe(true)

    f35.rocketAmmo = 0
    updateAirGuard(f35, units, 400)
    expect(f35.carrierOperation).toMatchObject({ state: 'carrier_rendezvous', carrierId: carrier.id })
    expect(f35.guardMode).toBe(true)
    expect(f35.homeCarrierId).toBe(carrier.id)

    enemy.health = 0
    guarded.lastAttacker = null
    f35.carrierOperation = null
    f35.carrierId = null
    f35.flightState = 'airborne'
    f35.rocketAmmo = 4
    updateAirGuard(f35, units, 500)
    expect(f35.target).toBeNull()
    expect(f35.flightPlan?.mode).toBe('guard')
  })

  it('[U06528] keeps an F22 at port until the guarded unit is attacked, then returns after the attacker is gone', () => {
    const strip = airstrip()
    gameState.buildings = [strip]
    const guarded = {
      id: 'tank',
      type: 'tank',
      owner: 'player1',
      health: 100,
      x: 14 * TILE_SIZE,
      y: 9 * TILE_SIZE,
      tileX: 14,
      tileY: 9
    }
    const enemy = {
      id: 'enemy',
      type: 'tank',
      owner: 'player2',
      health: 80,
      x: 20 * TILE_SIZE,
      y: 9 * TILE_SIZE,
      tileX: 20,
      tileY: 9
    }
    const f22 = {
      id: 'f22',
      type: 'f22Raptor',
      owner: 'player1',
      health: 100,
      x: 3 * TILE_SIZE,
      y: 3 * TILE_SIZE,
      flightState: 'grounded',
      f22State: 'parked',
      homeAirstripId: strip.id,
      airstripId: strip.id,
      landedHelipadId: strip.id,
      guardMode: true,
      guardTarget: guarded,
      rocketAmmo: 6,
      maxRocketAmmo: 6,
      gas: 100,
      maxGas: 100
    }

    updateAirGuard(f22, [f22, guarded, enemy], 100)
    expect(f22.f22PendingTakeoff).toBeFalsy()
    expect(f22.target ?? null).toBeNull()
    expect(f22.f22State).toBe('parked')

    guarded.lastAttacker = enemy
    updateAirGuard(f22, [f22, guarded, enemy], 200)
    expect(f22.target).toBe(enemy)
    expect(f22.f22PendingTakeoff).toBe(true)
    expect(f22.f22State).toBe('parked')

    updateAirGuard(f22, [f22, guarded, enemy], 260)
    expect(f22.f22PendingTakeoff).toBe(true)
    expect(f22.target).toBe(enemy)

    enemy.health = 0
    guarded.lastAttacker = null
    updateAirGuard(f22, [f22, guarded, enemy], 300)
    expect(f22.target).toBeNull()
    expect(f22.f22PendingTakeoff).toBe(false)
    expect(f22.f22State).toBe('parked')
    expect(f22.helipadLandingRequested).toBeFalsy()
    expect(f22.homeAirstripId).toBe(strip.id)
    expect(f22.guardMode).toBe(true)

    f22.flightState = 'airborne'
    f22.f22State = 'airborne'
    enemy.health = 80
    guarded.lastAttacker = enemy
    f22.rocketAmmo = 0
    updateAirGuard(f22, [f22, guarded, enemy], 400)
    expect(f22.helipadLandingRequested).toBe(true)
    expect(f22.commandIntent).toBe('returnToBase')
    expect(f22.guardMode).toBe(true)
    expect(f22.homeAirstripId).toBe(strip.id)
  })
})
