import { describe, it, expect } from 'vitest'
import {
  conditionToRows,
  rowsToCondition,
  makeAtom,
  describeCondition,
  atomKind
} from '../../src/ui/policies/conditionRows.js'
import { validatePolicy } from '../../src/policies/policySchema.js'
import { POLICY_TEMPLATES } from '../../src/policies/policyTemplates.js'

describe('policy condition rows', () => {
  it('round-trips a single atom', () => {
    const atom = makeAtom('hp')
    const parsed = conditionToRows(atom)
    expect(parsed.rows).toHaveLength(1)
    expect(rowsToCondition(parsed.mode, parsed.rows)).toEqual(atom)
  })

  it('round-trips negated rows combined with or', () => {
    const condition = {
      type: 'or',
      of: [makeAtom('underFire'), { type: 'not', of: makeAtom('enemyInRange') }]
    }
    const parsed = conditionToRows(condition)
    expect(parsed.mode).toBe('or')
    expect(parsed.rows.map(r => r.not)).toEqual([false, true])
    expect(rowsToCondition(parsed.mode, parsed.rows)).toEqual(condition)
  })

  it('returns null for nested conditions the builder cannot show as rows', () => {
    const nested = { type: 'and', of: [{ type: 'or', of: [makeAtom('hp'), makeAtom('underFire')] }, makeAtom('hp')] }
    expect(conditionToRows(nested)).toBeNull()
  })

  it('describes conditions in plain language', () => {
    expect(describeCondition(makeAtom('hp'))).toBe('HP < 25%')
    expect(describeCondition({ type: 'and', of: [makeAtom('hp'), makeAtom('enemyInRange')] }))
      .toBe('HP < 25% and an enemy is in range')
    expect(atomKind(makeAtom('enemyDistance'))).toBe('enemyDistance')
  })

  it('shipped templates are valid policies', () => {
    for (const template of POLICY_TEMPLATES) {
      const policy = template.create ? template.create('t1') : template.policy
      expect(validatePolicy(policy).valid).toBe(true)
    }
  })
})
