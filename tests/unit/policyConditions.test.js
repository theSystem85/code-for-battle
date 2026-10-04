import { describe, it, expect } from 'vitest'
import {
  CHECKS,
  COMPARE_OPS,
  NUMERIC_FIELDS,
  UNSUPPORTED_CONDITIONS,
  compareCondition,
  describeLeaf
} from '../../src/policies/policyConditions.js'
import { EFFECTS, effectsForVariant, validateEffectParams } from '../../src/policies/policyEffects.js'
import { POLICY_SCHEMA_VERSION, validatePolicy } from '../../src/policies/policySchema.js'
import { evaluateCondition } from '../../src/policies/policyStep.js'

const measureFrom = values => ({
  measure: condition => (condition.type === 'check' ? values[condition.check] : values[condition.field])
})

const compare = (field, op, value, extra = {}) => ({ type: 'compare', field, op, value, ...extra })
const check = (name, extra = {}) => ({ type: 'check', check: name, ...extra })

function policyWith(when, effect = { type: 'hold' }) {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    id: 'p',
    name: 'P',
    variant: 'unit',
    scope: 'perUnit',
    execution: 'continuous',
    initialStateId: 'a',
    states: [
      { id: 'a', name: 'A', effect: null, transitions: [{ id: 't', kind: 'while', when, to: 'b' }] },
      { id: 'b', name: 'B', effect, transitions: [] }
    ]
  }
}

describe('compare operators', () => {
  it('supports ==, <=, >=, < and > against a measured value', () => {
    const view = measureFrom({ fuel: 0.5 })
    const results = COMPARE_OPS.map(op => [op, evaluateCondition(compare('fuel', op, 0.5), view)])
    expect(Object.fromEntries(results)).toEqual({ '==': true, '<=': true, '>=': true, '<': false, '>': false })
    expect(evaluateCondition(compare('fuel', '<', 0.6), view)).toBe(true)
    expect(evaluateCondition(compare('fuel', '>', 0.4), view)).toBe(true)
  })

  it('treats == as equal within the field tolerance', () => {
    expect(evaluateCondition(compare('hp', '==', 0.5), measureFrom({ hp: 0.503 }))).toBe(true)
    expect(evaluateCondition(compare('hp', '==', 0.5), measureFrom({ hp: 0.52 }))).toBe(false)
    expect(evaluateCondition(compare('ammo', '==', 0, { mode: 'absolute' }), measureFrom({ ammo: 0 }))).toBe(true)
    expect(evaluateCondition(compare('ammo', '==', 0, { mode: 'absolute' }), measureFrom({ ammo: 1 }))).toBe(false)
  })

  it('compares angles across the 360 degree wrap for ==', () => {
    expect(compareCondition(compare('rotation', '==', 359), 2)).toBe(true)
    expect(compareCondition(compare('rotation', '==', 90), 180)).toBe(false)
  })

  it('never fires on a measurement that is unavailable', () => {
    const view = measureFrom({})
    expect(evaluateCondition(compare('fuel', '<', 0.9), view)).toBe(false)
    expect(evaluateCondition(compare('fuel', '==', 0), view)).toBe(false)
    expect(evaluateCondition(check('airborne'), view)).toBe(false)
    expect(evaluateCondition({ type: 'not', of: check('airborne') }, view)).toBe(true)
  })

  it('keeps the first-slice hp comparison working without a measure()', () => {
    expect(evaluateCondition(compare('hp', '<', 0.25), { hp: 0.1 })).toBe(true)
    expect(evaluateCondition(compare('enemyDistance', '<=', 5), { enemyDistance: 3 })).toBe(true)
    expect(evaluateCondition(check('airborne'), { hp: 1 })).toBe(false)
  })
})

describe('check leaves and nesting', () => {
  it('reads yes/no checks from the world view', () => {
    const view = measureFrom({ airborne: true, moving: false })
    expect(evaluateCondition(check('airborne'), view)).toBe(true)
    expect(evaluateCondition(check('moving'), view)).toBe(false)
  })

  it('evaluates NOT, AND and OR with nesting', () => {
    const view = measureFrom({ airborne: true, moving: false, ammo: 0.1, hp: 0.9 })
    const lowAmmo = compare('ammo', '<', 0.25)
    const hurt = compare('hp', '<', 0.5)
    expect(evaluateCondition({ type: 'and', of: [check('airborne'), lowAmmo] }, view)).toBe(true)
    expect(evaluateCondition({ type: 'and', of: [check('airborne'), hurt] }, view)).toBe(false)
    expect(evaluateCondition({ type: 'or', of: [hurt, check('moving'), lowAmmo] }, view)).toBe(true)
    expect(evaluateCondition({ type: 'not', of: { type: 'or', of: [hurt, check('moving')] } }, view)).toBe(true)
    const nested = {
      type: 'and',
      of: [
        { type: 'not', of: check('moving') },
        { type: 'or', of: [hurt, { type: 'and', of: [check('airborne'), lowAmmo] }] }
      ]
    }
    expect(evaluateCondition(nested, view)).toBe(true)
  })
})

describe('schema validation of the new conditions', () => {
  it('accepts every catalogued numeric field and check with defaults', () => {
    Object.entries(NUMERIC_FIELDS).forEach(([field, meta]) => {
      if (meta.legacy || !(meta.variants || ['unit']).includes('unit')) return
      const mode = meta.modes[0]
      const value = mode === 'relative' ? 0.5 : Math.min(meta.absRange[1], 1)
      const result = validatePolicy(policyWith(compare(field, '>=', value, { mode })))
      expect(result.errors, field).toEqual([])
    })
    Object.keys(CHECKS).forEach(name => {
      expect(validatePolicy(policyWith(check(name))).errors, name).toEqual([])
    })
  })

  it('rejects unknown fields, unknown checks, bad operators and bad values', () => {
    expect(validatePolicy(policyWith(compare('mana', '<', 1))).valid).toBe(false)
    expect(validatePolicy(policyWith(check('invisible'))).valid).toBe(false)
    expect(validatePolicy(policyWith(compare('fuel', '!=', 0.5))).valid).toBe(false)
    expect(validatePolicy(policyWith(compare('fuel', '<', 'low'))).valid).toBe(false)
    expect(validatePolicy(policyWith(compare('fuel', '<', 1.5))).valid).toBe(false)
  })

  it('rejects a comparison mode a field does not support and bad params', () => {
    expect(validatePolicy(policyWith(compare('money', '<', 0.5, { mode: 'relative' }))).valid).toBe(false)
    expect(validatePolicy(policyWith(compare('rank', '>=', 2, { mode: 'absolute' }))).valid).toBe(true)
    expect(validatePolicy(policyWith(check('inServiceRange', { building: 'castle' }))).valid).toBe(false)
    expect(validatePolicy(policyWith(check('inServiceRange', { building: 'hospital' }))).valid).toBe(true)
  })

  it('validates nested combinators and caps their depth', () => {
    const deep = [0, 1, 2, 3, 4, 5].reduce(inner => ({ type: 'not', of: inner }), check('airborne'))
    expect(validatePolicy(policyWith(deep)).valid).toBe(false)
    const ok = { type: 'and', of: [check('airborne'), { type: 'not', of: compare('fuel', '<', 0.2) }] }
    expect(validatePolicy(policyWith(ok)).valid).toBe(true)
  })

  it('validates effect names and params', () => {
    effectsForVariant('unit').forEach(type => {
      expect(validatePolicy(policyWith(check('moving'), { type })).errors, type).toEqual([])
    })
    expect(validatePolicy(policyWith(check('moving'), { type: 'teleport' })).valid).toBe(false)
    expect(validatePolicy(policyWith(check('moving'), { type: 'moveForward', tiles: 99 })).valid).toBe(false)
    expect(validatePolicy(policyWith(check('moving'), { type: 'requestRefill', resource: 'beer' })).valid).toBe(false)
    expect(validateEffectParams({ type: 'requestRefill', resource: 'fuel' })).toEqual([])
  })
})

describe('descriptions and catalog', () => {
  it('describes leaves in plain words', () => {
    expect(describeLeaf(compare('hp', '<', 0.25))).toBe('HP < 25%')
    expect(describeLeaf(compare('ammo', '==', 0, { mode: 'absolute' }))).toBe('ammo (absolute) == 0')
    expect(describeLeaf(check('inServiceRange', { building: 'hospital' }))).toBe('the unit is in range of a hospital')
    expect(describeLeaf(check('enemyVisible', { targetType: 'apache' }))).toBe('an enemy Apache is visible')
  })

  it('lists conditions the game cannot measure instead of faking them', () => {
    expect(UNSUPPORTED_CONDITIONS.length).toBeGreaterThan(0)
    UNSUPPORTED_CONDITIONS.forEach(item => {
      expect(item.reason.length).toBeGreaterThan(10)
      expect(CHECKS[item.id]).toBeUndefined()
      expect(NUMERIC_FIELDS[item.id]).toBeUndefined()
    })
  })

  it('maps every effect to a command and a repeat mode', () => {
    Object.values(EFFECTS).forEach(effect => {
      expect(typeof effect.command).toBe('string')
      expect(['idle', 'tick']).toContain(effect.repeat)
    })
  })
})
