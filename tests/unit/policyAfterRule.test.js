import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import { validatePolicy, POLICY_SCHEMA_VERSION } from '../../src/policies/policySchema.js'
import { STEP_GATE, createPolicyRuntime, stepPolicy } from '../../src/policies/policyStep.js'
import { POLICY_TEMPLATES } from '../../src/policies/policyTemplates.js'
import { formatDelay, joinDelay, splitDelay } from '../../src/policies/policyDelay.js'
import { POLICY_EVAL_INTERVAL_MS, noteDirectOrder, updateUnitPolicies } from '../../src/policies/policyEngine.js'
import { countPolicyActivity } from '../../src/policies/policyActivity.js'
import { applyPolicyToUnit, resetPolicyStore, savePolicy } from '../../src/policies/policyStore.js'
import { describeCondition, describeRuleTrigger } from '../../src/ui/policies/conditionRows.js'
import { NUMERIC_FIELDS } from '../../src/policies/policyConditions.js'

const ME = 'player1'
const hpBelow = value => ({ type: 'compare', field: 'hp', op: '<', value })

function afterPolicy(overrides = {}) {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id: 'wait-then-move',
    name: 'Wait then move',
    variant: 'unit',
    scope: 'perUnit',
    execution: 'continuous',
    initialStateId: 'watch',
    states: [
      {
        id: 'watch',
        name: 'Watch',
        effect: null,
        transitions: [{ id: 'r1', kind: 'after', when: hpBelow(0.5), delaySeconds: 10, to: 'go' }]
      },
      { id: 'go', name: 'Go', effect: { type: 'moveForward', tiles: 2 }, transitions: [] }
    ],
    ...overrides
  }
}

const view = (now, hp) => ({ now, hp, enemyDistance: Infinity, enemyInRange: false, underFire: false })

describe('policy delay helpers', () => {
  it('splits, joins and formats whole seconds', () => {
    expect(splitDelay(150)).toEqual({ minutes: 2, seconds: 30 })
    expect(joinDelay(2, 30)).toBe(150)
    expect(formatDelay(10)).toBe('10s')
    expect(formatDelay(120)).toBe('2m')
    expect(formatDelay(90)).toBe('1m 30s')
  })
})

describe('after rule: schema', () => {
  it('accepts an after rule with a whole-second delay', () => {
    expect(validatePolicy(afterPolicy()).valid).toBe(true)
  })

  it('rejects an after rule without a valid delay', () => {
    const missing = afterPolicy()
    delete missing.states[0].transitions[0].delaySeconds
    const result = validatePolicy(missing)
    expect(result.valid).toBe(false)
    expect(result.errors.some(error => error.code === 'invalid_delay')).toBe(true)

    for (const bad of [0, -5, 1.5, 3601, '10']) {
      const policy = afterPolicy()
      policy.states[0].transitions[0].delaySeconds = bad
      expect(validatePolicy(policy).valid).toBe(false)
    }
  })

  it('rejects a delay on an if or while rule', () => {
    const policy = afterPolicy()
    policy.states[0].transitions[0].kind = 'if'
    expect(validatePolicy(policy).valid).toBe(false)
  })

  it('ships a valid after template', () => {
    const template = POLICY_TEMPLATES.find(item => item.id === 'advance-after-delay')
    const doc = template.create('t')
    expect(validatePolicy(doc).valid).toBe(true)
    expect(doc.states[0].transitions[0]).toMatchObject({ kind: 'after', delaySeconds: 10 })
  })
})

describe('after rule: step', () => {
  it('waits for the delay, then fires once', () => {
    const policy = afterPolicy()
    let runtime = createPolicyRuntime(policy)

    let result = stepPolicy(policy, runtime, view(1000, 0.4))
    expect(result.trace.event).toBe('delayStarted')
    expect(result.effects).toHaveLength(0)
    runtime = result.runtime
    expect(runtime.pending).toEqual({ r1: 11000 })

    result = stepPolicy(policy, runtime, view(10999, 0.4))
    expect(result.effects).toHaveLength(0)
    runtime = result.runtime

    result = stepPolicy(policy, runtime, view(11000, 0.4))
    expect(result.trace.event).toBe('delayElapsed')
    expect(result.effects).toHaveLength(1)
    expect(result.effects[0]).toMatchObject({ type: 'moveForward', kind: 'after', phase: 'enter' })
    expect(result.runtime.currentStateId).toBe('go')
    expect(result.runtime.pending).toBeNull()
  })

  it('starts over when the condition stops being true during the delay', () => {
    const policy = afterPolicy()
    let runtime = createPolicyRuntime(policy)
    runtime = stepPolicy(policy, runtime, view(1000, 0.4)).runtime
    runtime = stepPolicy(policy, runtime, view(5000, 0.9)).runtime
    expect(runtime.pending).toBeNull()
    runtime = stepPolicy(policy, runtime, view(12000, 0.4)).runtime
    expect(runtime.pending).toEqual({ r1: 22000 })
    expect(runtime.currentStateId).toBe('watch')
  })

  it('drops a running delay while a direct order runs and does not evaluate it when paused', () => {
    const policy = afterPolicy()
    let runtime = createPolicyRuntime(policy)
    runtime = stepPolicy(policy, runtime, view(1000, 0.4)).runtime
    runtime = stepPolicy(policy, runtime, view(2000, 0.4), { gate: STEP_GATE.orderRunning }).runtime
    expect(runtime.pending).toBeNull()
    const paused = stepPolicy(policy, runtime, view(60000, 0.4), { gate: STEP_GATE.paused })
    expect(paused.effects).toHaveLength(0)
    expect(paused.runtime.currentStateId).toBe('watch')
  })

  it('counts how often each state was entered', () => {
    const policy = {
      ...afterPolicy(),
      states: [
        {
          id: 'watch',
          name: 'Watch',
          effect: null,
          transitions: [{ id: 'r1', kind: 'while', when: hpBelow(0.25), to: 'flee' }]
        },
        { id: 'flee', name: 'Flee', effect: { type: 'retreat' }, transitions: [] }
      ]
    }
    let runtime = createPolicyRuntime(policy)
    expect(runtime.entered).toEqual({ watch: 1 })
    runtime = stepPolicy(policy, runtime, view(0, 0.1)).runtime
    expect(runtime.entered).toEqual({ watch: 1, flee: 1 })
    runtime = stepPolicy(policy, runtime, view(0, 0.9)).runtime
    expect(runtime.currentStateId).toBe('watch')
    expect(runtime.entered).toEqual({ watch: 2, flee: 1 })
    runtime = stepPolicy(policy, runtime, view(0, 0.1)).runtime
    expect(runtime.entered).toEqual({ watch: 2, flee: 2 })
  })
})

describe('rule trigger text', () => {
  it('shows the full condition inside the rule kind', () => {
    const ammo = { type: 'compare', field: 'ammo', op: '==', value: 1 }
    expect(describeRuleTrigger({ kind: 'if', when: ammo })).toBe(`if(${describeCondition(ammo)})`)
    expect(describeRuleTrigger({ kind: 'if', when: ammo })).toMatch(/^if\(ammo == 100%\)$/)
    expect(describeRuleTrigger({ kind: 'after', delaySeconds: 90, when: ammo })).toBe(`after 1m 30s if(${describeCondition(ammo)})`)
    expect(describeRuleTrigger({ kind: 'while', when: ammo, until: hpBelow(0.5) })).toContain(' until(')
  })

  it('labels the health field "HP" and never "hit points"', () => {
    expect(NUMERIC_FIELDS.hp.label).toBe('HP')
    expect(describeCondition(hpBelow(0.25)).toLowerCase()).not.toContain('hit point')
    POLICY_TEMPLATES.forEach(template => {
      expect(`${template.label} ${template.description}`.toLowerCase()).not.toMatch(/hit points|health points/)
    })
  })
})

function makeUnit(extra = {}) {
  return {
    id: 'u1',
    type: 'tank_v1',
    owner: ME,
    x: 20 * TILE_SIZE,
    y: 20 * TILE_SIZE,
    tileX: 20,
    tileY: 20,
    health: 100,
    maxHealth: 100,
    direction: 0,
    path: [],
    moveTarget: null,
    target: null,
    ...extra
  }
}

function world(unit) {
  const moves = []
  const commands = {
    handleMovementCommand: vi.fn((units, x, y) => {
      moves.push({ x, y })
      units.forEach(item => {
        item.moveTarget = { x: Math.floor(x / TILE_SIZE), y: Math.floor(y / TILE_SIZE) }
        item.path = [{ x: 1, y: 1 }]
      })
      noteDirectOrder(units)
    }),
    handleAttackCommand: vi.fn()
  }
  const grid = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => ({ type: 'grass' })))
  const units = [unit]
  const context = { units, mapGrid: grid, buildings: [], factories: [], commands }
  const clock = { now: 1000 }
  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) {
      clock.now += POLICY_EVAL_INTERVAL_MS
      updateUnitPolicies(units, context, clock.now)
    }
  }
  return { commands, moves, tick, clock }
}

describe('after rule: engine', () => {
  beforeEach(() => resetPolicyStore())

  it('does nothing, then moves forward after the delay, and counts as in control while waiting', () => {
    const doc = POLICY_TEMPLATES.find(item => item.id === 'advance-after-delay').create('adv')
    expect(savePolicy(ME, doc).ok).toBe(true)
    const unit = makeUnit()
    const w = world(unit)
    applyPolicyToUnit(ME, unit, 'adv')

    w.tick(1)
    expect(w.commands.handleMovementCommand).not.toHaveBeenCalled()
    expect(unit.policyActive).toBe(true)
    expect(countPolicyActivity([unit]).get('adv')).toEqual({ enabled: 1, active: 1 })

    w.tick(Math.floor(9000 / POLICY_EVAL_INTERVAL_MS))
    expect(w.commands.handleMovementCommand).not.toHaveBeenCalled()

    w.tick(Math.ceil(2000 / POLICY_EVAL_INTERVAL_MS))
    expect(w.commands.handleMovementCommand).toHaveBeenCalledTimes(1)
    const dx = Math.abs(w.moves[0].x - (unit.x + TILE_SIZE / 2))
    const dy = Math.abs(w.moves[0].y - (unit.y + TILE_SIZE / 2))
    expect(Math.round((dx + dy) / TILE_SIZE)).toBe(2)
  })

  it('a direct order during the delay cancels it and the delay restarts afterwards', () => {
    const doc = POLICY_TEMPLATES.find(item => item.id === 'advance-after-delay').create('adv')
    savePolicy(ME, doc)
    const unit = makeUnit()
    const w = world(unit)
    applyPolicyToUnit(ME, unit, 'adv')
    w.tick(10)
    noteDirectOrder([unit])
    unit.moveTarget = { x: 1, y: 1 }
    w.tick(2)
    expect(unit.policyBindings[0].runtime.pending).toBeNull()
    expect(unit.policyActive).toBe(false)
  })
})
