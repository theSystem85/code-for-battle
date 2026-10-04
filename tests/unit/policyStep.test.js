import { describe, it, expect } from 'vitest'
import {
  MAX_POLICY_STATES,
  POLICY_SCHEMA_VERSION,
  describePolicyProblem,
  validatePolicy
} from '../../src/policies/policySchema.js'
import { STEP_GATE, createPolicyRuntime, stepPolicy } from '../../src/policies/policyStep.js'
import { POLICY_TEMPLATES, createBlankPolicy } from '../../src/policies/policyTemplates.js'

const hpBelow = value => ({ type: 'compare', field: 'hp', op: '<', value })
const view = (hp, extra = {}) => ({ hp, enemyDistance: Infinity, enemyInRange: false, underFire: false, ...extra })

function retreatIf() {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id: 'retreat-if',
    name: 'Retreat if hurt',
    variant: 'unit',
    scope: 'perUnit',
    execution: 'oneTime',
    initialStateId: 'watch',
    states: [
      { id: 'watch', name: 'Watch', effect: null, transitions: [{ id: 't1', kind: 'if', when: hpBelow(0.25), to: 'retreat' }] },
      { id: 'retreat', name: 'Retreat', effect: { type: 'retreat' }, transitions: [] }
    ]
  }
}

function retreatWhile() {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id: 'retreat-while',
    name: 'Retreat while hurt',
    variant: 'unit',
    scope: 'perUnit',
    execution: 'continuous',
    initialStateId: 'watch',
    states: [
      { id: 'watch', name: 'Watch', effect: null, transitions: [{ id: 't1', kind: 'while', when: hpBelow(0.25), to: 'retreat' }] },
      { id: 'retreat', name: 'Retreat', effect: { type: 'retreat' }, transitions: [] }
    ]
  }
}

function run(policy, views, options = {}) {
  let runtime = createPolicyRuntime(policy)
  const log = []
  views.forEach(v => {
    const result = stepPolicy(policy, runtime, v, options)
    runtime = result.runtime
    log.push(result)
  })
  return { runtime, log }
}

describe('validatePolicy', () => {
  it('accepts the shipped templates and a blank draft', () => {
    POLICY_TEMPLATES.forEach(template => {
      expect(validatePolicy(template.create('x')).valid).toBe(true)
    })
    expect(validatePolicy(createBlankPolicy('draft')).valid).toBe(true)
  })

  it('rejects more than 7 states and says why', () => {
    const policy = retreatIf()
    for (let i = 0; i < MAX_POLICY_STATES; i++) {
      policy.states.push({ id: `extra${i}`, name: `Extra ${i}`, effect: null, transitions: [] })
    }
    const validation = validatePolicy(policy)
    expect(validation.valid).toBe(false)
    expect(validation.errors.some(e => e.code === 'too_many_states')).toBe(true)
    expect(describePolicyProblem(validation)).toMatch(/More than 7 states/)
  })

  it('accepts exactly 7 states', () => {
    const policy = retreatIf()
    for (let i = 0; i < MAX_POLICY_STATES - 2; i++) {
      policy.states.push({ id: `extra${i}`, name: `Extra ${i}`, effect: null, transitions: [] })
    }
    expect(policy.states).toHaveLength(7)
    expect(validatePolicy(policy).valid).toBe(true)
  })

  it('rejects a build policy that is not global, a missing scope, unknown targets and bad conditions', () => {
    expect(validatePolicy({ ...retreatIf(), variant: 'build' }).errors.map(e => e.code)).toContain('build_scope')
    expect(validatePolicy({ ...retreatIf(), variant: undefined }).errors.map(e => e.code)).toContain('variant_missing')
    expect(validatePolicy({ ...retreatIf(), scope: undefined }).errors.map(e => e.code)).toContain('scope_missing')

    const unknownTarget = retreatIf()
    unknownTarget.states[0].transitions[0].to = 'nowhere'
    expect(validatePolicy(unknownTarget).errors.map(e => e.code)).toContain('unknown_state')

    const badCondition = retreatIf()
    badCondition.states[0].transitions[0].when = { type: 'compare', field: 'hp', op: '<', value: 4 }
    expect(validatePolicy(badCondition).errors.map(e => e.code)).toContain('invalid_condition')

    const untilOnIf = retreatIf()
    untilOnIf.states[0].transitions[0].until = hpBelow(0.5)
    expect(validatePolicy(untilOnIf).valid).toBe(false)
  })
})

describe('stepPolicy', () => {
  it('"if" fires once when the condition becomes true and never again', () => {
    const policy = { ...retreatIf(), execution: 'continuous' }
    policy.states[1].transitions = [{ id: 't2', kind: 'if', when: { type: 'compare', field: 'hp', op: '>=', value: 0.6 }, to: 'watch' }]
    const { log } = run(policy, [view(1), view(0.2), view(0.2), view(0.1), view(0.7), view(0.2)])
    const fired = log.map(r => r.effects.length)
    expect(fired).toEqual([0, 1, 0, 0, 0, 1])
    expect(log[1].effects[0]).toMatchObject({ type: 'retreat', phase: 'enter', kind: 'if' })
    expect(log[1].trace.event).toBe('fired')
  })

  it('a one-time "if" policy finishes after it fired', () => {
    const { runtime, log } = run(retreatIf(), [view(1), view(0.2), view(0.2)])
    expect(runtime.finished).toBe(true)
    expect(log[2].trace.event).toBe('finished')
  })

  it('"while" enters on the rising edge, keeps asserting, and ends when the condition stops', () => {
    const { log, runtime } = run(retreatWhile(), [view(1), view(0.2), view(0.2), view(0.2), view(0.5)])
    expect(log[1].effects[0]).toMatchObject({ phase: 'enter', kind: 'while' })
    expect(log[2].effects[0]).toMatchObject({ phase: 'hold', kind: 'while' })
    expect(log[3].effects[0]).toMatchObject({ phase: 'hold' })
    expect(log[4].trace.event).toBe('holdEnded')
    expect(log[4].effects).toEqual([])
    expect(runtime.currentStateId).toBe('watch')
    expect(runtime.hold).toBeNull()
  })

  it('supports an explicit end condition for hysteresis', () => {
    const policy = retreatWhile()
    policy.states[0].transitions[0].until = { type: 'compare', field: 'hp', op: '>=', value: 0.6 }
    const { log } = run(policy, [view(0.2), view(0.4), view(0.5), view(0.7)])
    expect(log[1].trace.event).toBe('holding')
    expect(log[2].trace.event).toBe('holding')
    expect(log[3].trace.event).toBe('holdEnded')
  })

  it('starts the "while" hold at once when the condition already holds on apply', () => {
    const { log } = run(retreatWhile(), [view(0.1)])
    expect(log[0].trace.event).toBe('holdStarted')
  })

  it('freezes "if" rules while a direct order runs but still lets a newly true "while" take over', () => {
    const open = { gate: STEP_GATE.orderRunning }
    const ifRun = run(retreatIf(), [view(1), view(0.2), view(0.1)], open)
    expect(ifRun.log.every(r => r.effects.length === 0)).toBe(true)
    expect(ifRun.runtime.currentStateId).toBe('watch')

    const whileRun = run(retreatWhile(), [view(1), view(0.2)], open)
    expect(whileRun.log[1].effects[0]).toMatchObject({ phase: 'enter', kind: 'while' })
  })

  it('an "if" that became true during a direct order fires once the order is done', () => {
    const policy = retreatIf()
    let runtime = createPolicyRuntime(policy)
    runtime = stepPolicy(policy, runtime, view(1), { gate: STEP_GATE.open }).runtime
    runtime = stepPolicy(policy, runtime, view(0.2), { gate: STEP_GATE.orderRunning }).runtime
    expect(runtime.currentStateId).toBe('watch')
    const resumed = stepPolicy(policy, runtime, view(0.2), { gate: STEP_GATE.open })
    expect(resumed.effects).toHaveLength(1)
  })

  it('suspends hold re-assertion during an order, but still ends the hold', () => {
    const policy = retreatWhile()
    let runtime = stepPolicy(policy, createPolicyRuntime(policy), view(0.2)).runtime
    const during = stepPolicy(policy, runtime, view(0.2), { gate: STEP_GATE.orderRunning })
    expect(during.effects).toEqual([])
    expect(during.trace.event).toBe('holdSuspended')
    runtime = during.runtime
    const ended = stepPolicy(policy, runtime, view(0.9), { gate: STEP_GATE.orderRunning })
    expect(ended.trace.event).toBe('holdEnded')
  })

  it('does nothing while paused by the owner', () => {
    const policy = retreatWhile()
    const runtime = createPolicyRuntime(policy)
    const result = stepPolicy(policy, runtime, view(0.1), { gate: STEP_GATE.paused })
    expect(result.runtime).toBe(runtime)
    expect(result.effects).toEqual([])
    expect(result.trace.event).toBe('paused')
  })

  it('is deterministic and does not mutate its inputs', () => {
    const policy = retreatWhile()
    const frozen = JSON.stringify(policy)
    const runtime = createPolicyRuntime(policy)
    const runtimeSnapshot = JSON.stringify(runtime)
    const a = stepPolicy(policy, runtime, view(0.2))
    const b = stepPolicy(policy, runtime, view(0.2))
    expect(a).toEqual(b)
    expect(JSON.stringify(policy)).toBe(frozen)
    expect(JSON.stringify(runtime)).toBe(runtimeSnapshot)
  })

  it('evaluates and / or / not and enemy conditions', () => {
    const policy = retreatIf()
    policy.states[0].transitions[0].when = {
      type: 'and',
      of: [{ type: 'enemyInRange' }, { type: 'not', of: { type: 'underFire' } }, hpBelow(0.5)]
    }
    expect(validatePolicy(policy).valid).toBe(true)
    const { log } = run(policy, [
      view(0.4, { enemyInRange: true, underFire: true }),
      view(0.4, { enemyInRange: true, underFire: false })
    ])
    expect(log[0].effects).toHaveLength(0)
    expect(log[1].effects).toHaveLength(1)
  })
})
