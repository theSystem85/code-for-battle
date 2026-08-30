import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/config.js', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    TILE_SIZE: 32
  }
})

vi.mock('../../src/logic.js', () => ({
  smoothRotateTowardsAngle: vi.fn((current, target) => target)
}))

const hoisted = vi.hoisted(() => ({
  gameState: {
    buildings: [],
    humanPlayer: 'player1'
  }
}))

vi.mock('../../src/gameState.js', () => ({
  gameState: hoisted.gameState
}))

vi.mock('../../src/utils.js', () => ({
  getBuildingIdentifier: vi.fn(building => building?.id || null)
}))

vi.mock('../../src/utils/helipadUtils.js', () => ({
  getHelipadLandingCenter: vi.fn(helipad => ({ x: helipad.x * 32 + 16, y: helipad.y * 32 + 16 })),
  getHelipadLandingTile: vi.fn(helipad => ({ x: helipad.x, y: helipad.y })),
  isHelipadAvailableForUnit: vi.fn(() => true)
}))

vi.mock('../../src/ui/notifications.js', () => ({
  showNotification: vi.fn()
}))

vi.mock('../../src/game/unitCombat/combatHelpers.js', () => ({
  getEffectiveFireRange: vi.fn(() => 5),
  getEffectiveFireRate: vi.fn(() => 100),
  isHumanControlledParty: vi.fn(() => true)
}))

vi.mock('../../src/game/unitCombat/firingHandlers.js', () => ({
  handleApacheVolley: vi.fn(() => true)
}))

import { updateApacheCombat } from '../../src/game/unitCombat/apacheCombat.js'
import { isHelipadAvailableForUnit } from '../../src/utils/helipadUtils.js'
import { handleApacheVolley } from '../../src/game/unitCombat/firingHandlers.js'
import { getEffectiveFireRange } from '../../src/game/unitCombat/combatHelpers.js'

function createApache(overrides = {}) {
  return {
    id: 'apache-1',
    type: 'apache',
    owner: 'player1',
    x: 100,
    y: 100,
    direction: 0,
    rotation: 0,
    rotationSpeed: 0.18,
    movement: {},
    rocketAmmo: 0,
    maxRocketAmmo: 10,
    apacheAmmoEmpty: false,
    canFire: true,
    target: null,
    volleyState: null,
    flightPlan: null,
    helipadLandingRequested: false,
    landedHelipadId: null,
    autoHelipadReturnActive: false,
    autoHelipadRetryAt: 0,
    ...overrides
  }
}

describe('apacheCombat auto helipad return flow', () => {
  beforeEach(() => {
    hoisted.gameState.buildings.length = 0
    isHelipadAvailableForUnit.mockReset()
    isHelipadAvailableForUnit.mockReturnValue(true)
    handleApacheVolley.mockClear()
    getEffectiveFireRange.mockReturnValue(5)
  })

  it('stores current target when ammo empties and heads to helipad', () => {
    hoisted.gameState.buildings.push({ id: 'pad-1', type: 'helipad', x: 4, y: 4, health: 100, owner: 'player1' })
    const enemy = { id: 'enemy-1', type: 'tank', x: 200, y: 200, tileX: 6, tileY: 6, health: 100 }
    const apache = createApache({ target: enemy, rocketAmmo: 0 })

    updateApacheCombat(apache, [apache, enemy], [], [[{}]], 1000)

    expect(apache.autoHelipadReturnAttackTargetId).toBe('enemy-1')
    expect(apache.autoReturnToHelipadOnTargetLoss).toBe(true)
    expect(apache.helipadLandingRequested).toBe(true)
    expect(apache.flightPlan?.mode).toBe('helipad')
  })

  it('ignores stale remote-control state so ammo-empty apache still auto-returns', () => {
    hoisted.gameState.buildings.push({ id: 'pad-1', type: 'helipad', x: 4, y: 4, health: 100, owner: 'player1' })
    const enemy = { id: 'enemy-1', type: 'tank', x: 200, y: 200, tileX: 6, tileY: 6, health: 100 }
    const apache = createApache({
      target: enemy,
      rocketAmmo: 0,
      remoteControlActive: true,
      lastRemoteControlTime: -5000
    })

    updateApacheCombat(apache, [apache, enemy], [], [[{}]], 1000)

    expect(apache.remoteControlActive).toBe(false)
    expect(apache.helipadLandingRequested).toBe(true)
    expect(apache.flightPlan?.mode).toBe('helipad')
  })

  it('keeps return target state until target is gone, then clears and returns to helipad', () => {
    hoisted.gameState.buildings.push({ id: 'pad-1', type: 'helipad', x: 4, y: 4, health: 100, owner: 'player1' })
    const apache = createApache({
      target: null,
      autoReturnToHelipadOnTargetLoss: true,
      autoHelipadReturnAttackTargetId: 'enemy-1',
      autoHelipadReturnAttackTargetType: 'unit',
      helipadLandingRequested: false
    })
    const deadEnemy = { id: 'enemy-1', type: 'tank', x: 200, y: 200, tileX: 6, tileY: 6, health: 0 }

    updateApacheCombat(apache, [apache, deadEnemy], [], [[{}]], 1000)

    expect(apache.helipadLandingRequested).toBe(true)
    expect(apache.flightPlan?.mode).toBe('helipad')
    expect(apache.autoHelipadReturnAttackTargetId).toBeNull()
    expect(apache.autoReturnToHelipadOnTargetLoss).toBe(false)
  })

  it('reroutes to another free helipad when assigned return pad becomes unavailable', () => {
    const pad1 = { id: 'pad-1', type: 'helipad', x: 4, y: 4, health: 100, owner: 'player1' }
    const pad2 = { id: 'pad-2', type: 'helipad', x: 8, y: 8, health: 100, owner: 'player1' }
    hoisted.gameState.buildings.push(pad1, pad2)

    const enemy = { id: 'enemy-1', type: 'tank', x: 200, y: 200, tileX: 6, tileY: 6, health: 100 }
    const apache = createApache({
      target: enemy,
      rocketAmmo: 0,
      apacheAmmoEmpty: true,
      helipadLandingRequested: true,
      helipadTargetId: 'pad-1',
      flightPlan: {
        x: 4 * 32 + 16,
        y: 4 * 32 + 16,
        mode: 'helipad',
        stopRadius: 6,
        destinationTile: { x: 4, y: 4 }
      }
    })

    isHelipadAvailableForUnit.mockImplementation(helipad => helipad.id !== 'pad-1')

    updateApacheCombat(apache, [apache, enemy], [], [[{}]], 1000)

    expect(apache.helipadLandingRequested).toBe(true)
    expect(apache.helipadTargetId).toBe('pad-2')
    expect(apache.flightPlan?.mode).toBe('helipad')
  })

  it('gives player command priority over stored auto-return target recovery', () => {
    const enemy = { id: 'enemy-1', type: 'tank', x: 200, y: 200, tileX: 6, tileY: 6, health: 100 }
    const apache = createApache({
      target: null,
      autoHelipadReturnActive: true,
      autoHelipadReturnAttackTargetId: 'enemy-1',
      autoHelipadReturnAttackTargetType: 'unit',
      autoReturnToHelipadOnTargetLoss: true,
      lastPlayerCommandTime: 1000
    })

    updateApacheCombat(apache, [apache, enemy], [], [[{}]], 1500)

    expect(apache.target).toBeNull()
    expect(apache.autoHelipadReturnActive).toBe(false)
    expect(apache.autoHelipadReturnAttackTargetId).toBeNull()
    expect(apache.autoReturnToHelipadOnTargetLoss).toBe(false)
  })

  it('respects the retry delay when no helipad is available', () => {
    hoisted.gameState.buildings.push({ id: 'pad-1', type: 'helipad', x: 4, y: 4, health: 100, owner: 'player1' })
    isHelipadAvailableForUnit.mockReturnValue(false)
    const enemy = { id: 'enemy-1', type: 'tank', x: 200, y: 200, tileX: 6, tileY: 6, health: 100 }
    const apache = createApache({ target: enemy, rocketAmmo: 0, apacheAmmoEmpty: true })

    updateApacheCombat(apache, [apache, enemy], [], [[{}]], 1000)
    updateApacheCombat(apache, [apache, enemy], [], [[{}]], 1100)

    expect(isHelipadAvailableForUnit).toHaveBeenCalledTimes(1)
    expect(apache.autoHelipadRetryAt).toBe(2200)
  })

  it('aims volleys at the visible airborne target position', () => {
    const airborneTarget = {
      id: 'enemy-apache',
      type: 'apache',
      x: 100,
      y: 100,
      tileX: 3,
      tileY: 3,
      health: 100,
      flightState: 'airborne',
      altitude: 80
    }
    const apache = createApache({
      target: airborneTarget,
      rocketAmmo: 5,
      apacheAmmoEmpty: false,
      volleyState: { leftRemaining: 1, rightRemaining: 0 }
    })

    updateApacheCombat(apache, [apache, airborneTarget], [], [[{}]], 1000)

    expect(handleApacheVolley).toHaveBeenCalledWith(
      apache,
      airborneTarget,
      [],
      1000,
      116,
      84,
      [apache, airborneTarget],
      [[{}]]
    )
  })

  it('starts firing immediately after an explicit player attack command', () => {
    getEffectiveFireRange.mockReturnValue(100)
    const enemy = { id: 'enemy-1', type: 'tank', x: 180, y: 100, tileX: 6, tileY: 3, health: 100 }
    const apache = createApache({
      target: enemy,
      commandIntent: 'attack',
      rocketAmmo: 8,
      // Reproduces a loaded-game clock mismatch where wall-clock command time
      // is ahead of the restored simulation clock.
      lastPlayerCommandTime: 500000
    })

    updateApacheCombat(apache, [apache, enemy], [], [[{}]], 1000)

    expect(apache.target).toBe(enemy)
    expect(apache.volleyState).toMatchObject({
      leftRemaining: 4,
      rightRemaining: 4,
      totalInVolley: 8
    })

    updateApacheCombat(apache, [apache, enemy], [], [[{}]], 1180)
    expect(handleApacheVolley).toHaveBeenCalledWith(
      apache,
      enemy,
      [],
      1180,
      196,
      116,
      [apache, enemy],
      [[{}]]
    )
  })

  it('refreshes its combat flight plan when a commanded target moves', () => {
    getEffectiveFireRange.mockReturnValue(100)
    const mapGrid = Array.from({ length: 30 }, () => Array.from({ length: 30 }, () => ({})))
    const enemy = { id: 'enemy-1', type: 'tank', x: 400, y: 100, tileX: 12, tileY: 3, health: 100 }
    const apache = createApache({
      target: enemy,
      commandIntent: 'attack',
      rocketAmmo: 8,
      lastPlayerCommandTime: 1000
    })

    updateApacheCombat(apache, [apache, enemy], [], mapGrid, 1000)
    const firstFlightPlan = apache.flightPlan
    const firstDestinationX = apache.flightPlan.x

    enemy.x = 500
    enemy.tileX = 15
    updateApacheCombat(apache, [apache, enemy], [], mapGrid, 1016)

    expect(apache.target).toBe(enemy)
    expect(apache.flightPlan).toBe(firstFlightPlan)
    expect(apache.flightPlan.mode).toBe('combat')
    expect(apache.flightPlan.followTargetId).toBe('enemy-1')
    expect(apache.flightPlan.x).toBeGreaterThan(firstDestinationX)
  })
})
