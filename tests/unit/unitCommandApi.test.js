import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import {
  UNIT_COMMAND_NAMES,
  canExecuteUnitCommand,
  executeUnitCommand,
  refuseUnitCommand
} from '../../src/policies/unitCommandApi.js'
import { isPolicyIssuingOrder } from '../../src/policies/policyIssuer.js'

const ME = 'player1'
const FOE = 'player2'

function makeGrid(size = 40) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ({ type: 'grass' })))
}

function unitAt(id, type, owner, tileX, tileY, extra = {}) {
  return {
    id,
    type,
    owner,
    x: tileX * TILE_SIZE,
    y: tileY * TILE_SIZE,
    tileX,
    tileY,
    health: 100,
    maxHealth: 100,
    direction: 0,
    turretDirection: 0,
    path: [],
    moveTarget: null,
    target: null,
    ...extra
  }
}

let ctx
let issuedAsPolicy

beforeEach(() => {
  issuedAsPolicy = []
  const record = name => vi.fn(() => { issuedAsPolicy.push({ name, policy: isPolicyIssuingOrder() }) })
  ctx = {
    now: 100000,
    mapGrid: makeGrid(),
    units: [],
    buildings: [],
    factories: [],
    getFireRange: () => 10 * TILE_SIZE,
    getFireRate: () => 4000,
    canTarget: () => true,
    fire: vi.fn(() => true),
    commands: {
      handleMovementCommand: record('move'),
      handleAttackCommand: record('attack'),
      handleServiceProviderRequest: vi.fn(() => true),
      handleRepairWorkshopCommand: record('workshop'),
      handleAmbulanceRefillCommand: record('hospital'),
      handleAmmunitionTruckReloadCommand: record('ammoFactory'),
      handleAmbulanceHealCommand: record('heal'),
      handleTankerRefuelCommand: record('refuel'),
      handleAmmunitionTruckResupplyCommand: record('resupply'),
      handleRecoveryTankRepairCommand: record('repair'),
      isUtilityTargetValid: vi.fn(() => true),
      canAmbulanceProvideCrew: () => true,
      canTankerProvideFuel: () => true,
      canAmmunitionTruckProvideAmmo: () => true,
      canRecoveryTankRepair: () => true
    }
  }
})

describe('command registry', () => {
  it('offers every command the spec lists', () => {
    expect(UNIT_COMMAND_NAMES).toEqual(expect.arrayContaining([
      'moveForward', 'moveBackward', 'moveSidewaysLeft', 'moveSidewaysRight', 'turnLeft', 'turnRight',
      'turretLeft', 'turretRight', 'takeoff', 'land', 'aimAndLock', 'fireAtLocked', 'fireForward',
      'requestRefill', 'goToWorkshop', 'goToHospital', 'goToAmmoFactory', 'attackAndChase',
      'attackInRange', 'autoAttackInRange', 'serviceTarget', 'protect', 'retreatTo'
    ]))
  })

  it('refuses unknown commands and units that cannot take commands', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    expect(executeUnitCommand('dance', tank, {}, ctx)).toBe(false)
    expect(refuseUnitCommand('dance', tank, {}, ctx)).toMatch(/unknown/)
    const dead = unitAt('d', 'tank_v1', ME, 10, 10, { health: 0 })
    const embarked = unitAt('e', 'tank_v1', ME, 10, 10, { embarkedOnId: 'ship' })
    const wall = unitAt('b', 'tank_v1', ME, 10, 10, { isBuilding: true })
    UNIT_COMMAND_NAMES.forEach(name => {
      expect(executeUnitCommand(name, dead, {}, ctx), `${name} dead`).toBe(false)
      expect(executeUnitCommand(name, embarked, {}, ctx), `${name} embarked`).toBe(false)
      expect(executeUnitCommand(name, wall, {}, ctx), `${name} building`).toBe(false)
      expect(executeUnitCommand(name, null, {}, ctx), `${name} null`).toBe(false)
    })
    expect(ctx.commands.handleMovementCommand).not.toHaveBeenCalled()
  })
})

describe('movement commands', () => {
  it('moves forwards and backwards along the heading through the movement handler', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    expect(executeUnitCommand('moveForward', tank, { tiles: 3 }, ctx)).toBe(true)
    expect(ctx.commands.handleMovementCommand).toHaveBeenLastCalledWith(
      [tank], 13 * TILE_SIZE + TILE_SIZE / 2, 10 * TILE_SIZE + TILE_SIZE / 2, ctx.mapGrid
    )
    expect(executeUnitCommand('moveBackward', tank, { tiles: 2 }, ctx)).toBe(true)
    expect(ctx.commands.handleMovementCommand).toHaveBeenLastCalledWith(
      [tank], 8 * TILE_SIZE + TILE_SIZE / 2, 10 * TILE_SIZE + TILE_SIZE / 2, ctx.mapGrid
    )
    expect(issuedAsPolicy.every(item => item.policy)).toBe(true)
    expect(isPolicyIssuingOrder()).toBe(false)
  })

  it('refuses a move into water, rock, buildings or off the map', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    ctx.mapGrid[10][12] = { type: 'water' }
    expect(executeUnitCommand('moveForward', tank, { tiles: 2 }, ctx)).toBe(false)
    ctx.mapGrid[10][12] = { type: 'grass', building: {} }
    expect(executeUnitCommand('moveForward', tank, { tiles: 2 }, ctx)).toBe(false)
    const edge = unitAt('e', 'tank_v1', ME, 0, 0, { direction: Math.PI })
    expect(executeUnitCommand('moveForward', edge, { tiles: 2 }, ctx)).toBe(false)
    expect(ctx.commands.handleMovementCommand).not.toHaveBeenCalled()
  })

  it('refuses movement for a crewless or fuel-less unit and a grounded aircraft', () => {
    expect(executeUnitCommand('moveForward', unitAt('a', 'tank_v1', ME, 10, 10, { crew: { driver: false, loader: true } }), {}, ctx)).toBe(false)
    expect(executeUnitCommand('moveForward', unitAt('b', 'tank_v1', ME, 10, 10, { gas: 0, maxGas: 100 }), {}, ctx)).toBe(false)
    expect(executeUnitCommand('moveForward', unitAt('c', 'apache', ME, 10, 10, { flightState: 'grounded' }), {}, ctx)).toBe(false)
    expect(executeUnitCommand('moveForward', unitAt('d', 'apache', ME, 10, 10, { flightState: 'flying' }), {}, ctx)).toBe(true)
  })

  it('moves sideways for helicopters only, left and right of the heading', () => {
    const heli = unitAt('h', 'apache', ME, 10, 10, { flightState: 'flying' })
    expect(executeUnitCommand('moveSidewaysLeft', heli, { tiles: 2 }, ctx)).toBe(true)
    expect(ctx.commands.handleMovementCommand).toHaveBeenLastCalledWith(
      [heli], 10 * TILE_SIZE + TILE_SIZE / 2, 8 * TILE_SIZE + TILE_SIZE / 2, ctx.mapGrid
    )
    expect(executeUnitCommand('moveSidewaysRight', heli, { tiles: 2 }, ctx)).toBe(true)
    expect(ctx.commands.handleMovementCommand).toHaveBeenLastCalledWith(
      [heli], 10 * TILE_SIZE + TILE_SIZE / 2, 12 * TILE_SIZE + TILE_SIZE / 2, ctx.mapGrid
    )
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    const jet = unitAt('j', 'f35', ME, 10, 10, { flightState: 'flying' })
    expect(executeUnitCommand('moveSidewaysLeft', tank, {}, ctx)).toBe(false)
    expect(executeUnitCommand('moveSidewaysRight', jet, {}, ctx)).toBe(false)
  })

  it('turns the wagon left and right in place and refuses while moving or for jets', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    expect(executeUnitCommand('turnRight', tank, {}, ctx)).toBe(true)
    expect(tank.direction).toBeGreaterThan(0)
    const afterRight = tank.direction
    expect(executeUnitCommand('turnLeft', tank, {}, ctx)).toBe(true)
    expect(tank.direction).toBeLessThan(afterRight)
    tank.path = [{ x: 1, y: 1 }]
    expect(executeUnitCommand('turnLeft', tank, {}, ctx)).toBe(false)
    expect(executeUnitCommand('turnLeft', unitAt('j', 'f22Raptor', ME, 10, 10, { flightState: 'flying' }), {}, ctx)).toBe(false)
  })

  it('turns the turret for tanks with a gunner only', () => {
    const tank = unitAt('t', 'tank-v2', ME, 10, 10)
    expect(executeUnitCommand('turretRight', tank, {}, ctx)).toBe(true)
    expect(tank.turretDirection).toBeGreaterThan(0)
    expect(executeUnitCommand('turretLeft', tank, {}, ctx)).toBe(true)
    expect(tank.turretDirection).toBeCloseTo(0)
    expect(executeUnitCommand('turretLeft', unitAt('r', 'rocketTank', ME, 10, 10), {}, ctx)).toBe(false)
    expect(executeUnitCommand('turretLeft', unitAt('h', 'howitzer', ME, 10, 10), {}, ctx)).toBe(false)
    expect(executeUnitCommand('turretLeft', unitAt('a', 'apache', ME, 10, 10), {}, ctx)).toBe(false)
    expect(executeUnitCommand('turretLeft', unitAt('g', 'tank_v1', ME, 10, 10, { crew: { driver: true, gunner: false, loader: true } }), {}, ctx)).toBe(false)
  })
})

describe('takeoff and landing', () => {
  it('lets helicopters and the F-35 take off from the ground and land from the air', () => {
    ;['apache', 'f35'].forEach(type => {
      const grounded = unitAt(`g-${type}`, type, ME, 10, 10, { flightState: 'grounded' })
      expect(executeUnitCommand('takeoff', grounded, {}, ctx)).toBe(true)
      expect(grounded.manualFlightState).toBe('takeoff')
      expect(executeUnitCommand('land', grounded, {}, ctx)).toBe(false)

      const flying = unitAt(`f-${type}`, type, ME, 10, 10, { flightState: 'flying' })
      expect(executeUnitCommand('land', flying, {}, ctx)).toBe(true)
      expect(flying.manualFlightState).toBe('land')
      expect(executeUnitCommand('takeoff', flying, {}, ctx)).toBe(false)
    })
  })

  it('refuses ground vehicles and the F-22', () => {
    expect(executeUnitCommand('takeoff', unitAt('t', 'tank_v1', ME, 10, 10, { flightState: 'grounded' }), {}, ctx)).toBe(false)
    expect(executeUnitCommand('land', unitAt('j', 'f22Raptor', ME, 10, 10, { flightState: 'flying' }), {}, ctx)).toBe(false)
  })
})

describe('aiming and firing', () => {
  it('aims at and locks an enemy without firing', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    const foe = unitAt('e', 'tank_v1', FOE, 10, 15)
    expect(executeUnitCommand('aimAndLock', tank, { target: foe }, ctx)).toBe(true)
    expect(tank.policyLock).toBe(foe)
    expect(tank.turretDirection).toBeGreaterThan(0)
    expect(tank.target).toBeNull()
    expect(ctx.fire).not.toHaveBeenCalled()
  })

  it('refuses to lock friends, dead targets, untargetable units and non-tank shooters', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    expect(executeUnitCommand('aimAndLock', tank, { target: unitAt('f', 'tank_v1', ME, 12, 10) }, ctx)).toBe(false)
    expect(executeUnitCommand('aimAndLock', tank, { target: unitAt('d', 'tank_v1', FOE, 12, 10, { health: 0 }) }, ctx)).toBe(false)
    expect(executeUnitCommand('aimAndLock', tank, { target: null }, ctx)).toBe(false)
    ctx.canTarget = () => false
    expect(executeUnitCommand('aimAndLock', tank, { target: unitAt('e', 'apache', FOE, 12, 10) }, ctx)).toBe(false)
    ctx.canTarget = () => true
    expect(executeUnitCommand('aimAndLock', unitAt('r', 'rocketTank', ME, 10, 10), { target: unitAt('e', 'tank_v1', FOE, 12, 10) }, ctx)).toBe(false)
    expect(tank.policyLock).toBeUndefined()
  })

  it('fires at the locked target only when aimed, in range, loaded and reloaded', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10, { ammunition: 5, maxAmmunition: 10 })
    const foe = unitAt('e', 'tank_v1', FOE, 15, 10)
    expect(executeUnitCommand('fireAtLocked', tank, {}, ctx)).toBe(false)
    expect(refuseUnitCommand('fireAtLocked', tank, {}, ctx)).toMatch(/locked/)

    expect(executeUnitCommand('aimAndLock', tank, { target: foe }, ctx)).toBe(true)
    expect(executeUnitCommand('fireAtLocked', tank, {}, ctx)).toBe(true)
    expect(ctx.fire).toHaveBeenCalledWith(tank, foe, null)

    ctx.fire.mockClear()
    tank.turretDirection = Math.PI
    expect(refuseUnitCommand('fireAtLocked', tank, {}, ctx)).toMatch(/not aimed/)
    tank.turretDirection = 0

    tank.lastShotTime = ctx.now - 1000
    expect(refuseUnitCommand('fireAtLocked', tank, {}, ctx)).toMatch(/reloading/)
    tank.lastShotTime = ctx.now - 5000

    tank.ammunition = 0
    expect(refuseUnitCommand('fireAtLocked', tank, {}, ctx)).toMatch(/ammo/)
    tank.ammunition = 5

    foe.x = 35 * TILE_SIZE
    expect(refuseUnitCommand('fireAtLocked', tank, {}, ctx)).toMatch(/range/)
    foe.x = 15 * TILE_SIZE

    foe.health = 0
    expect(executeUnitCommand('fireAtLocked', tank, {}, ctx)).toBe(false)
    expect(ctx.fire).not.toHaveBeenCalled()
  })

  it('fires into the turret direction without any lock and reports a failed shot', () => {
    const tank = unitAt('t', 'tank-v2', ME, 10, 10, { turretDirection: Math.PI / 2, ammunition: 3, maxAmmunition: 10 })
    expect(executeUnitCommand('fireForward', tank, {}, ctx)).toBe(true)
    const aim = ctx.fire.mock.calls[0][2]
    expect(ctx.fire.mock.calls[0][1]).toBeNull()
    expect(aim.x).toBeCloseTo(10 * TILE_SIZE + TILE_SIZE / 2)
    expect(aim.y).toBeGreaterThan(10 * TILE_SIZE + TILE_SIZE / 2)
    ctx.fire.mockReturnValueOnce(false)
    expect(executeUnitCommand('fireForward', tank, {}, ctx)).toBe(false)
  })

  it('refuses to fire for crews without a loader, units that may not fire and other unit types', () => {
    expect(executeUnitCommand('fireForward', unitAt('a', 'tank_v1', ME, 10, 10, { crew: { driver: true, gunner: true, loader: false } }), {}, ctx)).toBe(false)
    expect(executeUnitCommand('fireForward', unitAt('b', 'tank_v1', ME, 10, 10, { canFire: false }), {}, ctx)).toBe(false)
    expect(executeUnitCommand('fireForward', unitAt('c', 'howitzer', ME, 10, 10), {}, ctx)).toBe(false)
    expect(executeUnitCommand('fireForward', unitAt('d', 'ambulance', ME, 10, 10), {}, ctx)).toBe(false)
    ctx.fire = undefined
    expect(executeUnitCommand('fireForward', unitAt('e', 'tank_v1', ME, 10, 10), {}, ctx)).toBe(false)
  })
})

describe('attack commands', () => {
  it('attacks and chases a hostile target through the attack handler', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    const foe = unitAt('e', 'tank_v1', FOE, 30, 10)
    expect(executeUnitCommand('attackAndChase', tank, { target: foe }, ctx)).toBe(true)
    expect(ctx.commands.handleAttackCommand).toHaveBeenCalledWith([tank], foe, ctx.mapGrid, false, false)
    expect(issuedAsPolicy.at(-1)).toEqual({ name: 'attack', policy: true })
  })

  it('refuses to attack friends, unarmed units and targets that cannot be hit', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    expect(executeUnitCommand('attackAndChase', tank, { target: unitAt('f', 'tank_v1', ME, 12, 10) }, ctx)).toBe(false)
    expect(executeUnitCommand('attackAndChase', unitAt('h', 'harvester', ME, 10, 10), { target: unitAt('e', 'tank_v1', FOE, 12, 10) }, ctx)).toBe(false)
    ctx.canTarget = () => false
    expect(executeUnitCommand('attackAndChase', tank, { target: unitAt('e', 'apache', FOE, 12, 10) }, ctx)).toBe(false)
    expect(ctx.commands.handleAttackCommand).not.toHaveBeenCalled()
  })

  it('attacks in range without chasing and lets go when the target leaves range', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    const foe = unitAt('e', 'tank_v1', FOE, 15, 10)
    expect(executeUnitCommand('attackInRange', tank, { target: foe }, ctx)).toBe(true)
    expect(tank.target).toBe(foe)
    expect(ctx.commands.handleAttackCommand).not.toHaveBeenCalled()
    expect(tank.moveTarget).toBeNull()

    foe.x = 30 * TILE_SIZE
    expect(executeUnitCommand('attackInRange', tank, { target: foe }, ctx)).toBe(false)
    expect(tank.target).toBeNull()
    expect(tank.policyNoChase).toBeNull()
  })

  it('does not drop an order the player gave while releasing a no-chase target', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    const foe = unitAt('e', 'tank_v1', FOE, 30, 10)
    const other = unitAt('o', 'tank_v1', FOE, 12, 10)
    tank.target = other
    expect(executeUnitCommand('attackInRange', tank, { target: foe }, ctx)).toBe(false)
    expect(tank.target).toBe(other)
  })

  it('attacks any enemy in range automatically and does nothing when none is near', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    const near = unitAt('n', 'tank_v1', FOE, 14, 10)
    ctx.units = [tank, near]
    expect(executeUnitCommand('autoAttackInRange', tank, {}, ctx)).toBe(true)
    expect(tank.target).toBe(near)
    near.x = 35 * TILE_SIZE
    expect(executeUnitCommand('autoAttackInRange', tank, {}, ctx)).toBe(false)
    expect(tank.target).toBeNull()
  })
})

describe('service commands', () => {
  it('lets service units service a friendly target that needs it', () => {
    const tank = unitAt('t', 'tank_v1', ME, 12, 10, { health: 30 })
    const cases = [
      ['ambulance', 'heal'], ['tankerTruck', 'refuel'], ['ammunitionTruck', 'resupply'], ['recoveryTank', 'repair']
    ]
    cases.forEach(([type, recorded]) => {
      const provider = unitAt(`p-${type}`, type, ME, 10, 10)
      expect(executeUnitCommand('serviceTarget', provider, { target: tank }, ctx), type).toBe(true)
      expect(issuedAsPolicy.at(-1)).toEqual({ name: recorded, policy: true })
    })
  })

  it('refuses service for combat units, enemies and targets that do not need it', () => {
    const tank = unitAt('t', 'tank_v1', ME, 12, 10)
    const foe = unitAt('e', 'tank_v1', FOE, 12, 10)
    expect(executeUnitCommand('serviceTarget', unitAt('x', 'tank_v1', ME, 10, 10), { target: tank }, ctx)).toBe(false)
    expect(executeUnitCommand('serviceTarget', unitAt('a', 'ambulance', ME, 10, 10), { target: foe }, ctx)).toBe(false)
    ctx.commands.isUtilityTargetValid.mockReturnValue(false)
    expect(executeUnitCommand('serviceTarget', unitAt('a', 'ambulance', ME, 10, 10), { target: tank }, ctx)).toBe(false)
    ctx.commands.isUtilityTargetValid.mockReturnValue(true)
    ctx.commands.canAmbulanceProvideCrew = () => false
    expect(executeUnitCommand('serviceTarget', unitAt('a', 'ambulance', ME, 10, 10), { target: tank }, ctx)).toBe(false)
  })

  it('orders a service unit to refill ammo, health or fuel only when needed and available', () => {
    const tank = unitAt('t', 'tank_v1', ME, 12, 10, { ammunition: 2, maxAmmunition: 10, health: 50, gas: 10, maxGas: 100 })
    const ammoTruck = unitAt('am', 'ammunitionTruck', ME, 14, 10)
    const recovery = unitAt('rec', 'recoveryTank', ME, 14, 11)
    const tanker = unitAt('tk', 'tankerTruck', ME, 14, 12, { supplyGas: 100 })
    ctx.units = [tank, ammoTruck, recovery, tanker]

    expect(executeUnitCommand('requestRefill', tank, { resource: 'ammo' }, ctx)).toBe(true)
    expect(ctx.commands.handleServiceProviderRequest).toHaveBeenLastCalledWith(ammoTruck, [tank], ctx.mapGrid)
    expect(executeUnitCommand('requestRefill', tank, { resource: 'health' }, ctx)).toBe(true)
    expect(ctx.commands.handleServiceProviderRequest).toHaveBeenLastCalledWith(recovery, [tank], ctx.mapGrid)
    expect(executeUnitCommand('requestRefill', tank, { resource: 'fuel' }, ctx)).toBe(true)
    expect(ctx.commands.handleServiceProviderRequest).toHaveBeenLastCalledWith(tanker, [tank], ctx.mapGrid)

    tank.ammunition = 10
    expect(executeUnitCommand('requestRefill', tank, { resource: 'ammo' }, ctx)).toBe(false)
    tank.gas = 100
    expect(executeUnitCommand('requestRefill', tank, { resource: 'fuel' }, ctx)).toBe(false)
    tank.health = 100
    expect(executeUnitCommand('requestRefill', tank, { resource: 'health' }, ctx)).toBe(false)
    expect(executeUnitCommand('requestRefill', tank, { resource: 'beer' }, ctx)).toBe(false)
  })

  it('refuses a refill when no friendly service unit exists or it cannot help', () => {
    const tank = unitAt('t', 'tank_v1', ME, 12, 10, { ammunition: 2, maxAmmunition: 10 })
    const enemyTruck = unitAt('am', 'ammunitionTruck', FOE, 14, 10)
    ctx.units = [tank, enemyTruck]
    expect(executeUnitCommand('requestRefill', tank, { resource: 'ammo' }, ctx)).toBe(false)
    const emptyTruck = unitAt('am2', 'ammunitionTruck', ME, 14, 10)
    ctx.units = [tank, emptyTruck]
    ctx.commands.canAmmunitionTruckProvideAmmo = () => false
    expect(executeUnitCommand('requestRefill', tank, { resource: 'ammo' }, ctx)).toBe(false)
  })

  it('sends units to the nearest friendly workshop, hospital or ammo factory when it makes sense', () => {
    const workshop = { id: 'w', type: 'vehicleWorkshop', owner: ME, x: 20, y: 20, width: 3, height: 3, health: 100 }
    const hospital = { id: 'h', type: 'hospital', owner: ME, x: 25, y: 20, width: 3, height: 3, health: 100 }
    const factory = { id: 'f', type: 'ammunitionFactory', owner: ME, x: 28, y: 20, width: 3, height: 3, health: 100 }
    const enemyWorkshop = { id: 'ew', type: 'vehicleWorkshop', owner: FOE, x: 11, y: 10, width: 3, height: 3, health: 100 }
    ctx.buildings = [enemyWorkshop, workshop, hospital, factory]

    const hurt = unitAt('t', 'tank_v1', ME, 10, 10, { health: 40 })
    expect(executeUnitCommand('goToWorkshop', hurt, {}, ctx)).toBe(true)
    expect(ctx.commands.handleRepairWorkshopCommand).toHaveBeenCalledWith([hurt], workshop, ctx.mapGrid)
    expect(executeUnitCommand('goToWorkshop', unitAt('ok', 'tank_v1', ME, 10, 10), {}, ctx)).toBe(false)
    expect(executeUnitCommand('goToWorkshop', unitAt('air', 'apache', ME, 10, 10, { health: 10 }), {}, ctx)).toBe(false)

    const ambulance = unitAt('am', 'ambulance', ME, 10, 10, { medics: 1, maxMedics: 4 })
    expect(executeUnitCommand('goToHospital', ambulance, {}, ctx)).toBe(true)
    expect(ctx.commands.handleAmbulanceRefillCommand).toHaveBeenCalledWith([ambulance], hospital, ctx.mapGrid)
    expect(executeUnitCommand('goToHospital', hurt, {}, ctx)).toBe(false)
    ambulance.medics = 4
    expect(executeUnitCommand('goToHospital', ambulance, {}, ctx)).toBe(false)

    const truck = unitAt('tr', 'ammunitionTruck', ME, 10, 10, { ammoCargo: 5, maxAmmoCargo: 100 })
    expect(executeUnitCommand('goToAmmoFactory', truck, {}, ctx)).toBe(true)
    expect(ctx.commands.handleAmmunitionTruckReloadCommand).toHaveBeenCalled()
    expect(executeUnitCommand('goToAmmoFactory', hurt, {}, ctx)).toBe(false)
    truck.ammoCargo = 100
    expect(executeUnitCommand('goToAmmoFactory', truck, {}, ctx)).toBe(false)

    ctx.buildings = []
    hurt.health = 10
    expect(executeUnitCommand('goToWorkshop', hurt, {}, ctx)).toBe(false)
  })
})

describe('protect and retreat', () => {
  it('protects a friendly unit by following it', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10, { target: unitAt('x', 'tank_v1', FOE, 12, 10) })
    const friend = unitAt('f', 'harvester', ME, 14, 10)
    expect(executeUnitCommand('protect', tank, { target: friend }, ctx)).toBe(true)
    expect(tank.guardMode).toBe(true)
    expect(tank.guardTarget).toBe(friend)
    expect(tank.guardTargets).toEqual([friend])
    expect(tank.target).toBeNull()
  })

  it('refuses to protect itself, enemies, buildings or the dead', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    expect(executeUnitCommand('protect', tank, { target: tank }, ctx)).toBe(false)
    expect(executeUnitCommand('protect', tank, { target: unitAt('e', 'tank_v1', FOE, 12, 10) }, ctx)).toBe(false)
    expect(executeUnitCommand('protect', tank, { target: { id: 'b', type: 'hospital', owner: ME, x: 3, y: 3, width: 2, height: 2, health: 10, isBuilding: true } }, ctx)).toBe(false)
    expect(executeUnitCommand('protect', tank, { target: unitAt('d', 'tank_v1', ME, 12, 10, { health: 0 }) }, ctx)).toBe(false)
    expect(tank.guardMode).toBeUndefined()
  })

  it('retreats to a walkable tile and refuses blocked or off-map positions', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10)
    expect(executeUnitCommand('retreatTo', tank, { tileX: 4, tileY: 5 }, ctx)).toBe(true)
    expect(ctx.commands.handleMovementCommand).toHaveBeenLastCalledWith(
      [tank], 4 * TILE_SIZE + TILE_SIZE / 2, 5 * TILE_SIZE + TILE_SIZE / 2, ctx.mapGrid
    )
    ctx.mapGrid[5][4] = { type: 'water' }
    expect(executeUnitCommand('retreatTo', tank, { tileX: 4, tileY: 5 }, ctx)).toBe(false)
    expect(executeUnitCommand('retreatTo', tank, { tileX: -1, tileY: 5 }, ctx)).toBe(false)
  })

  it('stops a unit and clears its lock, guard and orders', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10, {
      path: [{ x: 1, y: 1 }], moveTarget: { x: 1, y: 1 }, policyLock: {}, guardMode: true, target: {}
    })
    expect(canExecuteUnitCommand('stop', tank, {}, ctx)).toBe(true)
    expect(executeUnitCommand('stop', tank, {}, ctx)).toBe(true)
    expect(tank.path).toBeNull()
    expect(tank.target).toBeNull()
    expect(tank.policyLock).toBeNull()
    expect(tank.guardMode).toBe(false)
  })
})

describe('refusals leave the unit untouched', () => {
  it('does not change a refused unit', () => {
    const tank = unitAt('t', 'tank_v1', ME, 10, 10, { path: [{ x: 1, y: 1 }] })
    const before = JSON.stringify(tank)
    expect(executeUnitCommand('turnLeft', tank, {}, ctx)).toBe(false)
    expect(executeUnitCommand('takeoff', tank, {}, ctx)).toBe(false)
    expect(executeUnitCommand('moveSidewaysLeft', tank, {}, ctx)).toBe(false)
    expect(JSON.stringify(tank)).toBe(before)
  })
})
