import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import {
  POLICY_EVAL_INTERVAL_MS,
  isUnitIdle,
  noteDirectOrder,
  pausePolicyUntilOrderDone,
  subscribePolicyEvents,
  updateUnitPolicies
} from '../../src/policies/policyEngine.js'
import {
  applyPolicyToUnit,
  resetPolicyStore,
  savePolicy,
  setPolicyEnabled,
  deletePolicy,
  canCommandPolicy
} from '../../src/policies/policyStore.js'
import { POLICY_TEMPLATES } from '../../src/policies/policyTemplates.js'

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
    path: [],
    moveTarget: null,
    target: null,
    ...extra
  }
}

function createWorld() {
  const tank = makeUnit('t1', ME, 20, 20)
  const enemy = makeUnit('e1', FOE, 30, 20)
  const yard = { id: ME, type: 'constructionYard', owner: ME, x: 2, y: 2, width: 3, height: 3, health: 100 }
  const moves = []
  const attacks = []
  const commands = {
    handleMovementCommand: vi.fn((units, x, y) => {
      moves.push({ x, y })
      units.forEach(unit => {
        unit.target = null
        unit.moveTarget = { x: Math.floor(x / TILE_SIZE), y: Math.floor(y / TILE_SIZE) }
        unit.path = [{ x: 1, y: 1 }]
        unit.commandQueue = []
        unit.currentCommand = null
      })
      noteDirectOrder(units)
    }),
    handleAttackCommand: vi.fn((units, target) => {
      attacks.push(target)
      units.forEach(unit => {
        unit.target = target
        unit.moveTarget = null
        unit.path = []
      })
      noteDirectOrder(units)
    })
  }
  const units = [tank, enemy]
  const context = { units, mapGrid: makeGrid(), buildings: [], factories: [yard], commands }
  const clock = { now: 1000 }
  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) {
      clock.now += POLICY_EVAL_INTERVAL_MS
      updateUnitPolicies(units, context, clock.now)
    }
  }
  const userAttack = () => {
    commands.handleAttackCommand([tank], enemy)
  }
  return { tank, enemy, commands, moves, attacks, context, clock, tick, userAttack }
}

function install(template, id, scope) {
  const doc = POLICY_TEMPLATES.find(item => item.id === template).create(id)
  if (scope) doc.scope = scope
  expect(savePolicy(ME, doc).ok).toBe(true)
  return doc
}

describe('policy engine: direct orders and policies', () => {
  beforeEach(() => {
    resetPolicyStore()
  })

  it('a while-condition that becomes true after an attack order overrides it, and a newer order wins again', () => {
    const world = createWorld()
    const events = []
    const unsubscribe = subscribePolicyEvents(event => events.push(event))
    install('retreat-while-hurt', 'retreat-while')
    expect(applyPolicyToUnit(ME, world.tank, 'retreat-while').ok).toBe(true)

    world.userAttack()
    world.tick(3)
    expect(world.commands.handleMovementCommand).not.toHaveBeenCalled()
    expect(world.tank.target).toBe(world.enemy)

    world.tank.health = 20
    world.tick()
    expect(world.commands.handleMovementCommand).toHaveBeenCalledTimes(1)
    expect(world.tank.target).toBeNull()
    expect(world.tank.moveTarget).toBeTruthy()
    expect(events.some(event => event.type === 'orderOverridden')).toBe(true)

    world.userAttack()
    expect(world.tank.target).toBe(world.enemy)
    const conflict = events.find(event => event.type === 'conflict')
    expect(conflict).toBeTruthy()
    expect(conflict.policies[0]).toMatchObject({ id: 'retreat-while', name: 'Retreat while HP < 25%' })

    world.tick(6)
    expect(world.commands.handleMovementCommand).toHaveBeenCalledTimes(1)
    expect(world.tank.target).toBe(world.enemy)
    unsubscribe()
  })

  it('without a pause, a newly re-triggered while-condition overrides the newer order again', () => {
    const world = createWorld()
    install('retreat-while-hurt', 'retreat-while')
    applyPolicyToUnit(ME, world.tank, 'retreat-while')
    world.tank.health = 20
    world.tick()
    expect(world.commands.handleMovementCommand).toHaveBeenCalledTimes(1)

    world.userAttack()
    world.tank.health = 90
    world.tick()
    world.tank.health = 10
    world.tick()
    expect(world.commands.handleMovementCommand).toHaveBeenCalledTimes(2)
  })

  it('"pause until the order is fulfilled" blocks that re-trigger and lifts when the order ends', () => {
    const world = createWorld()
    install('retreat-while-hurt', 'retreat-while')
    applyPolicyToUnit(ME, world.tank, 'retreat-while')
    world.tank.health = 20
    world.tick()
    world.userAttack()
    expect(pausePolicyUntilOrderDone(world.tank, 'retreat-while')).toBe(true)

    world.tank.health = 90
    world.tick()
    world.tank.health = 10
    world.tick(3)
    expect(world.commands.handleMovementCommand).toHaveBeenCalledTimes(1)
    expect(world.tank.target).toBe(world.enemy)

    world.enemy.health = 0
    world.tank.target = world.enemy
    world.tank.path = []
    world.tick(2)
    expect(world.tank.policyControl.order.active).toBe(false)
    expect(world.commands.handleMovementCommand).toHaveBeenCalledTimes(2)

    world.tank.health = 90
    world.tick()
    world.tank.health = 10
    world.tick()
    expect(world.commands.handleMovementCommand).toHaveBeenCalledTimes(3)
  })

  it('a held while-policy takes over again once a direct order is fulfilled', () => {
    const world = createWorld()
    install('retreat-while-hurt', 'retreat-while')
    applyPolicyToUnit(ME, world.tank, 'retreat-while')
    world.tank.health = 20
    world.tick()
    world.userAttack()
    world.enemy.health = 0
    world.tick(4)
    expect(world.tank.policyControl.order.active).toBe(false)
    expect(world.commands.handleMovementCommand.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(world.tank.moveTarget).toBeTruthy()
  })

  it('an "if" fires once and then does not override later orders', () => {
    const world = createWorld()
    install('retreat-if-hurt', 'retreat-if')
    applyPolicyToUnit(ME, world.tank, 'retreat-if')
    world.tick()
    world.tank.health = 20
    world.tick()
    expect(world.commands.handleMovementCommand).toHaveBeenCalledTimes(1)
    expect(world.tank.policyBindings).toHaveLength(0)

    world.userAttack()
    world.tick(8)
    expect(world.commands.handleMovementCommand).toHaveBeenCalledTimes(1)
    expect(world.tank.target).toBe(world.enemy)
  })

  it('an "if" does not interrupt a running order and fires when the order is done', () => {
    const world = createWorld()
    install('retreat-if-hurt', 'retreat-if')
    applyPolicyToUnit(ME, world.tank, 'retreat-if')
    world.tick()
    world.userAttack()
    world.tank.health = 20
    world.tick(4)
    expect(world.commands.handleMovementCommand).not.toHaveBeenCalled()
    expect(world.tank.target).toBe(world.enemy)

    world.enemy.health = 0
    world.tick(3)
    expect(world.commands.handleMovementCommand).toHaveBeenCalledTimes(1)
  })

  it('the last newly triggered condition wins among several policies', () => {
    const world = createWorld()
    install('retreat-while-hurt', 'retreat-while')
    const attack = POLICY_TEMPLATES.find(item => item.id === 'engage-in-range').create('attack-while')
    attack.scope = 'perUnit'
    expect(savePolicy(ME, attack).ok).toBe(true)
    applyPolicyToUnit(ME, world.tank, 'retreat-while')
    applyPolicyToUnit(ME, world.tank, 'attack-while')

    world.enemy.x = 24 * TILE_SIZE
    world.enemy.tileX = 24
    world.tick()
    expect(world.commands.handleAttackCommand).toHaveBeenCalledTimes(1)
    expect(world.commands.handleMovementCommand).not.toHaveBeenCalled()

    world.tank.health = 15
    world.tick()
    expect(world.commands.handleMovementCommand).toHaveBeenCalledTimes(1)

    world.tank.health = 100
    world.tick()
    const bindings = world.tank.policyBindings
    expect(bindings.find(binding => binding.policyId === 'retreat-while').runtime.hold).toBeNull()
    expect(bindings.find(binding => binding.policyId === 'attack-while').runtime.hold).toBeTruthy()
  })

  it('a policy-issued order is not recorded as a direct order', () => {
    const world = createWorld()
    install('retreat-while-hurt', 'retreat-while')
    applyPolicyToUnit(ME, world.tank, 'retreat-while')
    world.tank.health = 20
    world.tick()
    expect(world.tank.policyControl.dominant.kind).toBe('policy')
  })

  it('does no per-unit work for units without policies', () => {
    const world = createWorld()
    world.tick(5)
    expect(world.tank.policyBindings).toBeUndefined()
    expect(world.tank.policyControl).toBeUndefined()
  })

  it('treats a unit with a leftover auto target as idle for order completion', () => {
    const unit = makeUnit('a', ME, 1, 1, { target: { health: 10 } })
    expect(isUnitIdle(unit, null, false)).toBe(true)
    expect(isUnitIdle(unit)).toBe(false)
  })
})

describe('policy engine: global policies and ownership', () => {
  beforeEach(() => {
    resetPolicyStore()
  })

  it('a global policy applies to all owned programmable units while enabled', () => {
    const world = createWorld()
    install('engage-in-range', 'engage')
    world.enemy.x = 24 * TILE_SIZE
    world.tick(2)
    expect(world.commands.handleAttackCommand).not.toHaveBeenCalled()

    expect(setPolicyEnabled(ME, 'engage', true).ok).toBe(true)
    world.tick(2)
    expect(world.commands.handleAttackCommand).toHaveBeenCalledTimes(1)
    expect(world.tank.policyBindings).toHaveLength(1)
    expect(world.enemy.policyBindings).toBeUndefined()

    setPolicyEnabled(ME, 'engage', false)
    world.tick()
    expect(world.tank.policyBindings).toHaveLength(0)
  })

  it('only the commanding owner can enable, disable or apply a policy', () => {
    const world = createWorld()
    install('engage-in-range', 'engage')
    install('retreat-while-hurt', 'retreat-while')
    expect(setPolicyEnabled(FOE, 'engage', true)).toMatchObject({ ok: false, reason: 'not-owner' })
    expect(applyPolicyToUnit(FOE, world.tank, 'retreat-while')).toMatchObject({ ok: false, reason: 'not-owner' })
    expect(applyPolicyToUnit(ME, world.enemy, 'retreat-while')).toMatchObject({ ok: false, reason: 'not-owner' })
    expect(deletePolicy(FOE, 'engage')).toMatchObject({ ok: false, reason: 'not-owner' })
    expect(savePolicy(FOE, { ...POLICY_TEMPLATES[0].create('engage') }).ok).toBe(false)
    expect(setPolicyEnabled(ME, 'engage', true).ok).toBe(true)
  })

  it('an AI faction commands its own units with the same rules', () => {
    const doc = POLICY_TEMPLATES.find(item => item.id === 'engage-in-range').create('ai-engage')
    expect(savePolicy('enemy_ai', doc).ok).toBe(true)
    expect(setPolicyEnabled('enemy_ai', 'ai-engage', true).ok).toBe(true)
    expect(setPolicyEnabled(ME, 'ai-engage', false).ok).toBe(false)
    expect(canCommandPolicy('player', 'player1')).toBe(true)
  })

  it('does not enable a per-unit policy globally', () => {
    install('retreat-while-hurt', 'retreat-while')
    expect(setPolicyEnabled(ME, 'retreat-while', true)).toMatchObject({ ok: false, reason: 'not-global' })
  })

  it('one-time per-unit policies start immediately on apply and detach when finished', () => {
    const world = createWorld()
    install('retreat-if-hurt', 'retreat-if')
    world.tank.health = 10
    applyPolicyToUnit(ME, world.tank, 'retreat-if')
    world.tick()
    expect(world.commands.handleMovementCommand).toHaveBeenCalledTimes(1)
    expect(world.tank.policyBindings).toHaveLength(0)
  })
})
