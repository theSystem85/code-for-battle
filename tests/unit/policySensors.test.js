import { describe, it, expect, beforeEach } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import { beginUnitScope, measureLeaf, resetSensorIndexes } from '../../src/policies/policySensors.js'
import { recordUnitHit } from '../../src/game/hitRecord.js'

const ME = 'player1'
const FOE = 'player2'

function unitAt(id, owner, tileX, tileY, extra = {}) {
  return {
    id,
    type: 'tank_v1',
    owner,
    x: tileX * TILE_SIZE,
    y: tileY * TILE_SIZE,
    tileX,
    tileY,
    health: 100,
    maxHealth: 100,
    direction: 0,
    path: [],
    moveTarget: null,
    target: null,
    ...extra
  }
}

function building(type, owner, x, y, extra = {}) {
  return { id: `${type}-${x}-${y}`, type, owner, x, y, width: 2, height: 2, health: 100, maxHealth: 100, isBuilding: true, ...extra }
}

const compare = (field, op, value, extra = {}) => ({ type: 'compare', field, op, value, ...extra })
const check = (name, extra = {}) => ({ type: 'check', check: name, ...extra })

let context
let now

function scopeFor(unit, patch = {}) {
  Object.assign(context, patch)
  beginUnitScope(unit, context, now)
  return unit
}

beforeEach(() => {
  resetSensorIndexes()
  now = 100000
  context = {
    units: [],
    buildings: [],
    factories: [],
    getFireRange: () => 10 * TILE_SIZE,
    getFireRate: () => 4000,
    canTarget: () => true,
    isVisible: () => true,
    getMoney: owner => (owner === ME ? 5000 : undefined),
    getPower: () => -20,
    getXpProgress: unit => unit.experience / 200,
    getVisionRange: () => 8
  }
})

describe('own unit numbers', () => {
  it('measures hp, xp and rank in relative and absolute form', () => {
    const tank = scopeFor(unitAt('a', ME, 5, 5, { health: 40, experience: 50, level: 2 }))
    expect(measureLeaf(compare('hp', '<', 0.5))).toBeCloseTo(0.4)
    expect(measureLeaf(compare('hp', '<', 50, { mode: 'absolute' }))).toBe(40)
    expect(measureLeaf(compare('xp', '>', 10, { mode: 'absolute' }))).toBe(50)
    expect(measureLeaf(compare('xp', '>', 0.1, { mode: 'relative' }))).toBeCloseTo(0.25)
    expect(measureLeaf(compare('rank', '>=', 2))).toBe(2)
    expect(tank.health).toBe(40)
  })

  it('measures fuel, ammo and the air-unit rocket ammo', () => {
    scopeFor(unitAt('a', ME, 5, 5, { gas: 25, maxGas: 100, ammunition: 3, maxAmmunition: 12 }))
    expect(measureLeaf(compare('fuel', '<', 0.5))).toBeCloseTo(0.25)
    expect(measureLeaf(compare('ammo', '<', 0.5))).toBeCloseTo(0.25)
    expect(measureLeaf(compare('ammo', '<', 5, { mode: 'absolute' }))).toBe(3)
    scopeFor(unitAt('b', ME, 5, 5, { type: 'apache', rocketAmmo: 4, maxRocketAmmo: 8 }))
    expect(measureLeaf(compare('ammo', '<', 0.6))).toBeCloseTo(0.5)
  })

  it('returns undefined for fields the unit does not have', () => {
    scopeFor(unitAt('a', ME, 5, 5))
    expect(measureLeaf(compare('fuel', '<', 0.5))).toBeUndefined()
    expect(measureLeaf(compare('ammo', '<', 0.5))).toBeUndefined()
    expect(measureLeaf(compare('load', '<', 0.5))).toBeUndefined()
    expect(measureLeaf(compare('crew', '<', 0.5))).toBeUndefined()
    expect(measureLeaf(compare('turretRotation', '<', 10))).toBeUndefined()
  })

  it('measures reload as ready fraction or milliseconds left', () => {
    scopeFor(unitAt('a', ME, 5, 5, { lastShotTime: now - 1000 }))
    expect(measureLeaf(compare('reload', '>=', 0.2))).toBeCloseTo(0.25)
    expect(measureLeaf(compare('reload', '<', 5000, { mode: 'absolute' }))).toBe(3000)
    scopeFor(unitAt('b', ME, 5, 5))
    expect(measureLeaf(compare('reload', '>=', 1))).toBe(1)
    scopeFor(unitAt('c', ME, 5, 5), { getFireRate: () => null })
    expect(measureLeaf(compare('reload', '>=', 1))).toBeUndefined()
  })

  it('measures crew present and cargo load', () => {
    scopeFor(unitAt('a', ME, 5, 5, { crew: { driver: true, commander: false, gunner: true, loader: true } }))
    expect(measureLeaf(compare('crew', '<', 1))).toBeCloseTo(0.75)
    expect(measureLeaf(compare('crew', '<', 4, { mode: 'absolute' }))).toBe(3)
    scopeFor(unitAt('h', ME, 5, 5, { type: 'harvester', oreCarried: 250, cargoCapacity: 1000 }))
    expect(measureLeaf(compare('load', '>', 0.2))).toBeCloseTo(0.25)
    scopeFor(unitAt('m', ME, 5, 5, { type: 'ambulance', medics: 2, maxMedics: 10 }))
    expect(measureLeaf(compare('load', '<', 3, { mode: 'absolute' }))).toBe(2)
  })

  it('measures wagon and turret rotation in degrees', () => {
    const tank = scopeFor(unitAt('a', ME, 5, 5, { direction: Math.PI / 2, turretDirection: Math.PI }))
    expect(measureLeaf(compare('rotation', '==', 90))).toBeCloseTo(90)
    expect(measureLeaf(compare('turretRotation', '==', 180))).toBeCloseTo(180)
    expect(measureLeaf(compare('turretRotation', '>', 20, { mode: 'relative' }))).toBeCloseTo(90)
    tank.direction = -Math.PI / 2
    expect(measureLeaf(compare('rotation', '==', 270))).toBeCloseTo(270)
  })
})

describe('own unit state', () => {
  it('detects airborne, moving, attacking and serving', () => {
    scopeFor(unitAt('a', ME, 5, 5, { type: 'apache', flightState: 'flying' }))
    expect(measureLeaf(check('airborne'))).toBe(true)
    scopeFor(unitAt('b', ME, 5, 5, { type: 'apache', flightState: 'grounded' }))
    expect(measureLeaf(check('airborne'))).toBe(false)

    scopeFor(unitAt('c', ME, 5, 5, { path: [{ x: 1, y: 1 }] }))
    expect(measureLeaf(check('moving'))).toBe(true)

    const victim = unitAt('v', FOE, 8, 5)
    scopeFor(unitAt('d', ME, 5, 5, { target: victim }))
    expect(measureLeaf(check('attacking', { kind: 'unit' }))).toBe(true)
    expect(measureLeaf(check('attacking', { kind: 'building' }))).toBe(false)
    const wall = building('turretGunV1', FOE, 9, 5)
    scopeFor(unitAt('e', ME, 5, 5, { target: wall }))
    expect(measureLeaf(check('attacking', { kind: 'building' }))).toBe(true)

    scopeFor(unitAt('f', ME, 5, 5, { type: 'ambulance', utilityQueue: { currentTargetId: 'x' } }))
    expect(measureLeaf(check('serving'))).toBe(true)
    scopeFor(unitAt('g', ME, 5, 5, { type: 'ambulance' }))
    expect(measureLeaf(check('serving'))).toBe(false)
  })
})

describe('world numbers', () => {
  it('reads base money, power and building counts for the unit owner', () => {
    const tank = unitAt('a', ME, 5, 5)
    scopeFor(tank, {
      buildings: [
        building('powerPlant', ME, 1, 1),
        building('powerPlant', ME, 4, 1),
        building('hospital', ME, 8, 1),
        building('powerPlant', FOE, 20, 1),
        building('powerPlant', ME, 30, 1, { health: 0 })
      ]
    })
    expect(measureLeaf(compare('money', '>=', 1000))).toBe(5000)
    expect(measureLeaf(compare('power', '<', 0))).toBe(-20)
    expect(measureLeaf(compare('buildingCount', '>=', 2, { buildingType: 'powerPlant' }))).toBe(2)
    expect(measureLeaf(compare('buildingCount', '>=', 1, { buildingType: 'any' }))).toBe(3)
    scopeFor(unitAt('f', FOE, 5, 5))
    expect(measureLeaf(compare('money', '>=', 1))).toBeUndefined()
  })

  it('measures distance only to enemies the owner can see', () => {
    const tank = unitAt('a', ME, 5, 5)
    const near = unitAt('n', FOE, 11, 5)
    const hidden = unitAt('h', FOE, 7, 5)
    scopeFor(tank, {
      units: [tank, near, hidden],
      isVisible: (unit, px) => px > 10 * TILE_SIZE
    })
    expect(measureLeaf(compare('distance', '<', 10, { kind: 'unit' }))).toBeCloseTo(6)
    scopeFor(tank, { isVisible: () => false })
    expect(measureLeaf(compare('distance', '<', 10, { kind: 'unit' }))).toBeUndefined()
    const turret = building('turretGunV1', FOE, 5, 12)
    scopeFor(tank, { buildings: [turret], isVisible: () => true })
    expect(measureLeaf(compare('distance', '<', 10, { kind: 'building' }))).toBeGreaterThan(5)
  })
})

describe('service and protection checks', () => {
  it('detects units under service by a unit or a building', () => {
    const tank = unitAt('t', ME, 5, 5)
    const ambulance = unitAt('amb', ME, 6, 5, { type: 'ambulance', utilityQueue: { currentTargetId: 't' } })
    scopeFor(tank, { units: [tank, ambulance] })
    expect(measureLeaf(check('underService'))).toBe(true)
    expect(measureLeaf(check('underServiceByUnit'))).toBe(true)

    resetSensorIndexes()
    const workshop = building('vehicleWorkshop', ME, 10, 10, { repairSlots: [{ unit: tank }] })
    scopeFor(tank, { units: [tank], buildings: [workshop] })
    expect(measureLeaf(check('underService'))).toBe(true)
    expect(measureLeaf(check('underServiceByUnit'))).toBe(false)
    expect(measureLeaf(check('parkedAt', { place: 'vehicleWorkshop' }))).toBe(true)
  })

  it('detects service buildings in range using their service radius', () => {
    const tank = unitAt('t', ME, 10, 10)
    const hospital = building('hospital', ME, 10, 11)
    scopeFor(tank, { units: [tank], buildings: [hospital] })
    expect(measureLeaf(check('inServiceRange', { building: 'hospital' }))).toBe(true)
    expect(measureLeaf(check('inServiceRange', { building: 'gasStation' }))).toBe(false)
    const far = building('hospital', ME, 30, 30)
    scopeFor(tank, { buildings: [far] })
    expect(measureLeaf(check('inServiceRange', { building: 'hospital' }))).toBe(false)
  })

  it('detects protection by a guarding unit', () => {
    const tank = unitAt('t', ME, 5, 5)
    const guard = unitAt('g', ME, 6, 6, { guardMode: true, guardTarget: tank, guardTargets: [tank] })
    scopeFor(tank, { units: [tank, guard] })
    expect(measureLeaf(check('protectedByUnit'))).toBe(true)
    resetSensorIndexes()
    scopeFor(guard, { units: [tank, guard] })
    expect(measureLeaf(check('protectedByUnit'))).toBe(false)
  })

  it('detects defense buildings and friendly units covering the unit', () => {
    const tank = unitAt('t', ME, 10, 10)
    const turret = building('turretGunV1', ME, 12, 10, { fireRange: 8 })
    scopeFor(tank, { units: [tank], buildings: [turret] })
    expect(measureLeaf(check('inDefenseRange', { by: 'building' }))).toBe(true)
    const farTurret = building('turretGunV1', ME, 35, 35, { fireRange: 8 })
    scopeFor(tank, { buildings: [farTurret] })
    expect(measureLeaf(check('inDefenseRange', { by: 'building' }))).toBe(false)
    const buddy = unitAt('b', ME, 13, 10)
    scopeFor(tank, { units: [tank, buddy], buildings: [] })
    expect(measureLeaf(check('inDefenseRange', { by: 'unit' }))).toBe(true)
  })

  it('detects an airstrip or helipad the aircraft is parked on', () => {
    const heli = unitAt('h', ME, 10, 10, { type: 'apache', flightState: 'grounded' })
    const pad = building('helipad', ME, 10, 10)
    scopeFor(heli, { units: [heli], buildings: [pad] })
    expect(measureLeaf(check('parkedAt', { place: 'helipad' }))).toBe(true)
    expect(measureLeaf(check('parkedAt', { place: 'airstrip' }))).toBe(false)
    heli.flightState = 'flying'
    expect(measureLeaf(check('parkedAt', { place: 'helipad' }))).toBe(false)
  })
})

describe('hits and attacks', () => {
  it('tells direct from indirect hits and unit from building attackers', () => {
    const tank = unitAt('t', ME, 5, 5)
    const foe = unitAt('f', FOE, 12, 5)
    const turret = building('turretGunV1', FOE, 14, 5)
    recordUnitHit(tank, foe, true, now - 500)
    scopeFor(tank, { units: [tank, foe], buildings: [turret] })
    expect(measureLeaf(check('hitDirect', { by: 'unit' }))).toBe(true)
    expect(measureLeaf(check('hitDirect', { by: 'building' }))).toBe(false)
    expect(measureLeaf(check('hitIndirect', { by: 'unit' }))).toBe(false)

    recordUnitHit(tank, turret, false, now - 200)
    scopeFor(tank)
    expect(measureLeaf(check('hitIndirect', { by: 'building' }))).toBe(true)
    expect(measureLeaf(check('hitDirect', { by: 'building' }))).toBe(false)
  })

  it('forgets hits after the hit window', () => {
    const tank = unitAt('t', ME, 5, 5)
    const foe = unitAt('f', FOE, 12, 5)
    recordUnitHit(tank, foe, true, now - 10000)
    scopeFor(tank, { units: [tank, foe] })
    expect(measureLeaf(check('hitDirect', { by: 'unit' }))).toBe(false)
  })

  it('reports being under attack only when the attacker is visible', () => {
    const tank = unitAt('t', ME, 5, 5)
    const foe = unitAt('f', FOE, 20, 5)
    recordUnitHit(tank, foe, true, now - 300)
    scopeFor(tank, { units: [tank, foe], isVisible: () => true })
    expect(measureLeaf(check('underAttackBy', { by: 'unit' }))).toBe(true)
    scopeFor(tank, { isVisible: () => false })
    expect(measureLeaf(check('underAttackBy', { by: 'unit' }))).toBe(false)
    scopeFor(tank, { isVisible: () => true })
    foe.health = 0
    expect(measureLeaf(check('underAttackBy', { by: 'unit' }))).toBe(false)
  })

  it('does not store hit records where saves or network sync would copy them', () => {
    const tank = unitAt('t', ME, 5, 5)
    recordUnitHit(tank, unitAt('f', FOE, 8, 5), true, 1)
    expect(Object.keys(tank)).not.toContain('lastHit')
    expect(JSON.stringify(tank)).not.toContain('attacker')
  })
})

describe('sensing', () => {
  it('sees enemies of a type or any type when visible', () => {
    const tank = unitAt('t', ME, 5, 5)
    const heli = unitAt('e1', FOE, 30, 30, { type: 'apache' })
    const hiddenTank = unitAt('e2', FOE, 31, 30, { type: 'tank-v3' })
    scopeFor(tank, { units: [tank, heli, hiddenTank], isVisible: (unit, px) => px < 31 * TILE_SIZE })
    expect(measureLeaf(check('enemyVisible', { targetType: 'any' }))).toBe(true)
    expect(measureLeaf(check('enemyVisible', { targetType: 'apache' }))).toBe(true)
    expect(measureLeaf(check('enemyVisible', { targetType: 'tank-v3' }))).toBe(false)
  })

  it('finds enemies of a type inside the own fire range', () => {
    const tank = unitAt('t', ME, 5, 5)
    const near = unitAt('e1', FOE, 12, 5, { type: 'rocketTank' })
    const far = unitAt('e2', FOE, 30, 5, { type: 'howitzer' })
    scopeFor(tank, { units: [tank, near, far] })
    expect(measureLeaf(check('enemyInFireRange', { targetType: 'any' }))).toBe(true)
    expect(measureLeaf(check('enemyInFireRange', { targetType: 'rocketTank' }))).toBe(true)
    expect(measureLeaf(check('enemyInFireRange', { targetType: 'howitzer' }))).toBe(false)
    scopeFor(tank, { canTarget: () => false })
    expect(measureLeaf(check('enemyInFireRange', { targetType: 'any' }))).toBe(false)
  })

  it('detects own units standing inside an enemy fire range', () => {
    const tank = unitAt('t', ME, 5, 5)
    const buddy = unitAt('b', ME, 6, 5, { type: 'rocketTank' })
    const gun = unitAt('e1', FOE, 12, 5, { type: 'howitzer' })
    scopeFor(tank, { units: [tank, buddy, gun], getFireRange: unit => (unit === gun ? 9 : 4) * TILE_SIZE })
    expect(measureLeaf(check('myUnitsInEnemyRange', { unitType: 'any' }))).toBe(true)
    expect(measureLeaf(check('myUnitsInEnemyRange', { unitType: 'rocketTank' }))).toBe(true)
    expect(measureLeaf(check('myUnitsInEnemyRange', { unitType: 'harvester' }))).toBe(false)
    scopeFor(tank, { getFireRange: () => 2 * TILE_SIZE })
    expect(measureLeaf(check('myUnitsInEnemyRange', { unitType: 'any' }))).toBe(false)
  })

  it('knows when an enemy can be attacked', () => {
    const tank = unitAt('t', ME, 5, 5)
    const foe = unitAt('e1', FOE, 12, 5)
    scopeFor(tank, { units: [tank, foe] })
    expect(measureLeaf(check('canAttack', { kind: 'unit' }))).toBe(true)
    expect(measureLeaf(check('canAttack', { kind: 'building' }))).toBe(false)
    scopeFor(tank, { canTarget: () => false })
    expect(measureLeaf(check('canAttack', { kind: 'unit' }))).toBe(false)
  })

  it('reports being inside the visible range of an enemy unit or building', () => {
    const tank = unitAt('t', ME, 5, 5)
    const foe = unitAt('e1', FOE, 11, 5)
    scopeFor(tank, { units: [tank, foe], getVisionRange: () => 8 })
    expect(measureLeaf(check('inVisibleRange', { by: 'unit' }))).toBe(true)
    scopeFor(tank, { getVisionRange: () => 3 })
    expect(measureLeaf(check('inVisibleRange', { by: 'unit' }))).toBe(false)
    const tower = building('turretGunV1', FOE, 8, 5)
    scopeFor(tank, { buildings: [tower], getVisionRange: () => 6 })
    expect(measureLeaf(check('inVisibleRange', { by: 'building' }))).toBe(true)
  })
})
