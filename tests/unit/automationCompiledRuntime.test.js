import { describe, expect, it } from 'vitest'
import { createPolicyRuntime, STEP_GATE, stepPolicy } from '../../src/policies/policyStep.js'
import { compilePolicyProgram, stepCompiledPolicy } from '../../src/policies/policyCompiler.js'
import { createBlankPolicy } from '../../src/policies/policyTemplates.js'
import { validatePolicy } from '../../src/policies/policySchema.js'

function machine(kind = 'if') {
  const p = createBlankPolicy('branch')
  p.execution = 'continuous'
  p.initialStateId = 'a'
  p.states = [
    { id: 'a', transitions: [{ id: 'pair', kind, when: { type: 'underFire' }, to: 'b', elseTo: 'c', elseId: 'alternative' }] },
    { id: 'b', effect: { type: 'hold' }, transitions: [] },
    { id: 'c', effect: { type: 'autoAttackInRange' }, transitions: [] }
  ]
  return p
}

describe('IF/ELSE pairs', () => {
  it.each([[true, 'b', 'if', 'pair'], [false, 'c', 'else', 'alternative']])('[U00265] takes initial predicate %s once', (underFire, state, branch, id) => {
    const p = machine()
    const first = stepPolicy(p, createPolicyRuntime(p), { underFire })
    expect(first.runtime.currentStateId).toBe(state)
    expect(first.trace).toMatchObject({ branch, transitionId: id, pairId: 'pair' })
    expect(first.effects[0].transitionId).toBe(id)
    expect(stepPolicy(p, first.runtime, { underFire }).effects).toEqual([])
  })
  it('[U00266] freezes both histories for direct orders and paused gates', () => {
    const p = machine()
    for (const gate of [STEP_GATE.orderRunning, STEP_GATE.paused]) {
      const r = createPolicyRuntime(p)
      const blocked = stepPolicy(p, r, { underFire: false }, { gate })
      expect(blocked.runtime.prev).toBe(r.prev)
      expect(blocked.runtime.currentStateId).toBe('a')
      expect(stepPolicy(p, blocked.runtime, { underFire: false }).runtime.currentStateId).toBe('c')
    }
  })
  it('[U00267] preserves one-time completion and self-transition entry resets', () => {
    const p = machine()
    p.execution = 'oneTime'
    expect(stepPolicy(p, createPolicyRuntime(p), { underFire: false }).runtime.finished).toBe(true)
    p.execution = 'continuous'
    p.states[0].transitions[0].elseTo = 'a'
    const first = stepPolicy(p, createPolicyRuntime(p), {})
    const second = stepPolicy(p, first.runtime, {})
    expect(second.runtime.entered.a).toBe(3)
  })
  it('[U00268] evaluates a pair predicate once and respects ordered priority', () => {
    const p = machine()
    p.states[0].transitions[0].when = { type: 'compare', field: 'hp', op: '<', value: 0.5 }
    p.states[0].transitions.push({ id: 'later', kind: 'if', when: { type: 'always' }, to: 'b' })
    let calls = 0
    const result = stepPolicy(p, createPolicyRuntime(p), { measure: () => { calls++; return 0.9 } })
    expect(calls).toBe(1)
    expect(result.runtime.currentStateId).toBe('c')
  })
  it('[U00269] does not evaluate ELSE while a WHILE target is held', () => {
    const p = machine()
    p.states[1].transitions = [{ id: 'nested', kind: 'if', when: { type: 'always' }, to: 'a', elseTo: 'c' }]
    p.states[0].transitions = [{ id: 'hold', kind: 'while', when: { type: 'underFire' }, to: 'b' }]
    const held = stepPolicy(p, createPolicyRuntime(p), { underFire: true })
    expect(stepPolicy(p, held.runtime, { underFire: true }).runtime.currentStateId).toBe('b')
    const returned = stepPolicy(p, held.runtime, { underFire: false })
    expect(returned.runtime.currentStateId).toBe('a')
    expect(returned.effects).toEqual([])
  })
  it('[U00270] rejects ELSE on AFTER/WHILE and unresolved or duplicate branch IDs', () => {
    expect(validatePolicy(machine('while')).errors.some(e => e.code === 'invalid_else')).toBe(true)
    expect(validatePolicy(machine('after')).errors.some(e => e.code === 'invalid_else')).toBe(true)
    const p = machine()
    p.states[0].transitions[0].elseTo = 'missing'
    expect(validatePolicy(p).valid).toBe(false)
    expect(stepPolicy(p, createPolicyRuntime(p), {}).trace.event).toBe('invalid')
    p.states[0].transitions[0].elseTo = 'c'
    p.states[0].transitions[0].elseId = 'pair'
    expect(validatePolicy(p).valid).toBe(false)
  })
})

describe('prepared runtime', () => {
  it('[U00271] is detached from editor drafts and rejects invalid installation', () => {
    const p = machine()
    const compiled = compilePolicyProgram(p, { behaviorRevision: 3 })
    p.states[0].transitions[0].to = 'missing'
    expect(compiled.behaviorRevision).toBe(3)
    expect(compiled.policy.states[0].transitions[0].to).toBe('b')
    expect(() => compilePolicyProgram(p)).toThrow()
  })
  it('[U00272] matches reference effects, gates, runtime and traces over deterministic mixed-rule sequences', () => {
    const p = machine()
    p.states[0].transitions = [
      { id: 'timer', kind: 'after', delaySeconds: 1, when: { type: 'enemyInRange' }, to: 'b' },
      { id: 'hold', kind: 'while', when: { type: 'underFire' }, until: { type: 'not', of: { type: 'underFire' } }, to: 'c' },
      { id: 'pair', kind: 'if', when: { type: 'and', of: [{ type: 'check', check: 'enemyVisible' }, { type: 'compare', field: 'hp', op: '<', value: 0.5 }] }, to: 'b', elseTo: 'a', elseId: 'alternative' }
    ]
    const compiled = compilePolicyProgram(p)
    let ref = createPolicyRuntime(p)
    let fast = createPolicyRuntime(p)
    for (let i = 0; i < 1000; i++) {
      const view = { now: i * 150, enemyInRange: i % 4 === 0, underFire: i % 7 < 3, measure: leaf => leaf.type === 'check' ? i % 3 === 0 : 0.25 }
      const gate = i % 11 === 0 ? 'paused' : i % 5 === 0 ? 'orderRunning' : 'open'
      const a = stepPolicy(p, ref, view, { gate })
      const b = stepCompiledPolicy(compiled, fast, view, { gate })
      expect(b).toEqual(a)
      ref = a.runtime
      fast = b.runtime
    }
  })
})

describe('prepared numeric comparison defaults', () => {
  it('[U00273] keeps circular tolerance and leaf defaults equal to the reference', () => {
    const p = machine()
    p.states[0].transitions[0].when = { type: 'compare', field: 'turretRotation', mode: 'absolute', op: '==', value: 359 }
    const program = compilePolicyProgram(p)
    const r = createPolicyRuntime(p)
    const view = { measure: () => 1 }
    expect(stepCompiledPolicy(program, r, view)).toEqual(stepPolicy(p, r, view))
  })
})
