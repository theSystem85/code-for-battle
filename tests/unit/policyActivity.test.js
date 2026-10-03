import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { TILE_SIZE } from '../../src/config.js'
import {
  POLICY_EVAL_INTERVAL_MS,
  getUnitPolicySummary,
  noteDirectOrder,
  pausePolicyUntilOrderDone,
  updateUnitPolicies
} from '../../src/policies/policyEngine.js'
import { countPolicyActivity, isBindingControlling, listActivelyControlledUnits } from '../../src/policies/policyActivity.js'
import { applyPolicyToUnit, resetPolicyStore, savePolicy } from '../../src/policies/policyStore.js'
import { POLICY_SCHEMA_VERSION } from '../../src/policies/policySchema.js'
import { STEP_GATE } from '../../src/policies/policyStep.js'
import { POLICY_TEMPLATES } from '../../src/policies/policyTemplates.js'
import { resetSensorIndexes } from '../../src/policies/policySensors.js'

const ME = 'player1'
const FOE = 'player2'

function makeGrid(size = 40) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ({ type: 'grass' })))
}

function makeUnit(id, owner, tileX, tileY, extra = {}) {
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
    turretDirection: 0,
    path: [],
    moveTarget: null,
    target: null,
    ...extra
  }
}

function whilePolicy(id, when, effect, extra = {}) {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id,
    name: id,
    variant: 'unit',
    scope: 'perUnit',
    execution: 'continuous',
    folderId: null,
    initialStateId: 'watch',
    states: [
      { id: 'watch', name: 'Watch', effect: null, transitions: [{ id: `${id}-t`, kind: 'while', when, to: 'react' }] },
      { id: 'react', name: 'React', effect, transitions: [] }
    ],
    ...extra
  }
}

function world(units = []) {
  const moves = []
  const commands = {
    handleMovementCommand: vi.fn((list, x, y) => {
      moves.push({ x, y })
      list.forEach(unit => {
        unit.target = null
        unit.moveTarget = { x: Math.floor(x / TILE_SIZE), y: Math.floor(y / TILE_SIZE) }
        unit.path = [{ x: 1, y: 1 }]
      })
      noteDirectOrder(list)
    }),
    handleAttackCommand: vi.fn((list, target) => {
      list.forEach(unit => { unit.target = target })
      noteDirectOrder(list)
    })
  }
  const context = { units, mapGrid: makeGrid(), buildings: [], factories: [], commands, getFireRange: () => 10 * TILE_SIZE }
  const clock = { now: 1000 }
  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) {
      clock.now += POLICY_EVAL_INTERVAL_MS
      updateUnitPolicies(units, context, clock.now)
    }
  }
  return { commands, context, clock, tick, moves }
}

beforeEach(() => {
  resetPolicyStore()
  resetSensorIndexes()
})

describe('active control definition', () => {
  const policy = { initialStateId: 'watch' }
  const holding = { runtime: { hold: { transitionId: 't' }, finished: false, currentStateId: 'react' } }

  it('is active only inside a while hold, away from the start state, not finished and unpaused', () => {
    expect(isBindingControlling(holding, policy, STEP_GATE.open)).toBe(true)
    expect(isBindingControlling({ runtime: { ...holding.runtime, hold: null } }, policy, STEP_GATE.open)).toBe(false)
    expect(isBindingControlling({ runtime: { ...holding.runtime, currentStateId: 'watch' } }, policy, STEP_GATE.open)).toBe(false)
    expect(isBindingControlling({ runtime: { ...holding.runtime, finished: true } }, policy, STEP_GATE.open)).toBe(false)
    expect(isBindingControlling(holding, policy, STEP_GATE.paused)).toBe(false)
    expect(isBindingControlling(holding, policy, STEP_GATE.orderRunning)).toBe(false)
  })
})

describe('policy activity in the engine', () => {
  it('counts enabled units and actively controlled units per policy', () => {
    const doc = whilePolicy('low-hp', { type: 'compare', field: 'hp', op: '<', value: 0.5 }, { type: 'hold' })
    expect(savePolicy(ME, doc).ok).toBe(true)
    const hurt = makeUnit('a', ME, 10, 10, { health: 30 })
    const healthy = makeUnit('b', ME, 12, 10)
    const third = makeUnit('c', ME, 14, 10, { health: 10 })
    const units = [hurt, healthy, third]
    ;[hurt, healthy, third].forEach(unit => expect(applyPolicyToUnit(ME, unit, 'low-hp').ok).toBe(true))
    const w = world(units)

    w.tick(2)
    const counts = countPolicyActivity(units)
    expect(counts.get('low-hp')).toEqual({ enabled: 3, active: 2 })
    expect(listActivelyControlledUnits(units).map(unit => unit.id)).toEqual(['a', 'c'])
    expect(hurt.policyActive).toBe(true)
    expect(healthy.policyActive).toBe(false)
    expect(getUnitPolicySummary(hurt)[0].active).toBe(true)

    hurt.health = 90
    w.tick(2)
    expect(countPolicyActivity(units).get('low-hp')).toEqual({ enabled: 3, active: 1 })
    expect(hurt.policyActive).toBe(false)
  })

  it('ignores dead units and an if-rule that already fired', () => {
    const ifDoc = whilePolicy('once', { type: 'compare', field: 'hp', op: '<', value: 0.5 }, { type: 'hold' })
    ifDoc.states[0].transitions[0].kind = 'if'
    expect(savePolicy(ME, ifDoc).ok).toBe(true)
    const unit = makeUnit('a', ME, 10, 10, { health: 10 })
    const dead = makeUnit('d', ME, 12, 10, { health: 0 })
    applyPolicyToUnit(ME, unit, 'once')
    applyPolicyToUnit(ME, dead, 'once')
    const w = world([unit, dead])
    w.tick(3)
    expect(countPolicyActivity([unit, dead]).get('once')).toEqual({ enabled: 1, active: 0 })
  })

  it('stops counting a policy as controlling while a direct order runs or the policy is paused', () => {
    const doc = whilePolicy('low-hp', { type: 'compare', field: 'hp', op: '<', value: 0.5 }, { type: 'hold' })
    savePolicy(ME, doc)
    const unit = makeUnit('a', ME, 10, 10, { health: 10 })
    const enemy = makeUnit('e', FOE, 30, 10)
    applyPolicyToUnit(ME, unit, 'low-hp')
    const w = world([unit, enemy])
    w.tick(2)
    expect(unit.policyActive).toBe(true)

    w.commands.handleAttackCommand([unit], enemy)
    w.tick(1)
    expect(unit.policyActive).toBe(false)

    expect(pausePolicyUntilOrderDone(unit, 'low-hp')).toBe(true)
    w.tick(1)
    expect(unit.policyActive).toBe(false)
  })
})

describe('new conditions and effects through the engine', () => {
  it('turns the wagon every evaluation while a check condition holds', () => {
    const doc = whilePolicy('spin', { type: 'compare', field: 'fuel', op: '<', value: 0.5 }, { type: 'turnRight' })
    savePolicy(ME, doc)
    const tank = makeUnit('a', ME, 10, 10, { gas: 20, maxGas: 100 })
    applyPolicyToUnit(ME, tank, 'spin')
    const w = world([tank])

    w.tick(1)
    const first = tank.direction
    expect(first).toBeGreaterThan(0)
    w.tick(3)
    expect(tank.direction).toBeGreaterThan(first)

    tank.gas = 90
    w.tick(1)
    const stopped = tank.direction
    w.tick(3)
    expect(tank.direction).toBe(stopped)
  })

  it('gives refused commands no effect but keeps the policy running', () => {
    const doc = whilePolicy('lift', { type: 'check', check: 'moving' }, { type: 'takeoff' })
    savePolicy(ME, doc)
    const tank = makeUnit('a', ME, 10, 10, { moveTarget: { x: 1, y: 1 } })
    applyPolicyToUnit(ME, tank, 'lift')
    const w = world([tank])
    expect(() => w.tick(4)).not.toThrow()
    expect(tank.manualFlightState).toBeUndefined()
    expect(tank.policyActive).toBe(true)
  })

  it('runs a service-oriented effect on a helicopter through the same API', () => {
    const doc = whilePolicy('liftoff', { type: 'check', check: 'parkedAt', place: 'helipad' }, { type: 'takeoff' })
    savePolicy(ME, doc)
    const heli = makeUnit('h', ME, 10, 10, { type: 'apache', flightState: 'grounded' })
    const pad = { id: 'pad', type: 'helipad', owner: ME, x: 10, y: 10, width: 2, height: 2, health: 100 }
    applyPolicyToUnit(ME, heli, 'liftoff')
    const w = world([heli])
    w.context.buildings = [pad]
    w.tick(2)
    expect(heli.manualFlightState).toBe('takeoff')
  })

  it('keeps the shipped templates working', () => {
    POLICY_TEMPLATES.forEach(template => {
      expect(savePolicy(ME, template.create(`tpl-${template.id}`)).ok).toBe(true)
    })
  })
})

describe('the command API is the only way policy code moves units', () => {
  const dir = join(process.cwd(), 'src/policies')
  const forbidden = [
    /\bunit\.path\s*=[^=]/,
    /\bunit\.moveTarget\s*=[^=]/,
    /\bunit\.target\s*=[^=]/,
    /\bunit\.guardMode\s*=[^=]/,
    /\bunit\.direction\s*=[^=]/,
    /\bunit\.turretDirection\s*=[^=]/,
    /\bunit\.x\s*=[^=]/,
    /\bunit\.y\s*=[^=]/,
    /\bunit\.manualFlightState\s*=[^=]/,
    /handleMovementCommand|handleAttackCommand/
  ]

  it('does not move, aim or order units anywhere outside unitCommandApi.js', () => {
    const offenders = []
    readdirSync(dir).filter(name => name.endsWith('.js') && name !== 'unitCommandApi.js').forEach(name => {
      const text = readFileSync(join(dir, name), 'utf8')
      text.split('\n').forEach((line, index) => {
        const code = line.replace(/\/\/.*$/, '').trim()
        if (code.startsWith('*') || code.startsWith('/*')) return
        forbidden.forEach(pattern => {
          if (pattern.test(code)) offenders.push(`${name}:${index + 1}: ${code}`)
        })
      })
    })
    expect(offenders).toEqual([])
  })
})
