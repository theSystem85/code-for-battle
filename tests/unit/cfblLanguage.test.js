import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CFBL_CATALOG, completionContext, decimal, fromLegacyMachine, fuzzyOptions, getCatalog, parseCFBL, printCFBL, toMachine } from '../../src/automation/cfbl/index.js'
import { POLICY_TEMPLATES } from '../../src/policies/policyTemplates.js'
import { createPolicyRuntime, stepPolicy } from '../../src/policies/policyStep.js'

const program = (condition = 'always', effect = 'wait', variant = 'control unit', extra = '') => `${variant} { scope global; run continuous; start 1; state 1 { do ${effect}; if (${condition}) goto 1; ${extra} } }`
const parse = source => {
  const result = parseCFBL(source)
  expect(result.diagnostics, source).toEqual([])
  return result.ast
}

describe('CFBL language v1', () => {
  it('parses every reference example and prints canonically', () => {
    const reference = readFileSync('docs/cfbl-language-reference.md', 'utf8')
    for (const [, source] of reference.matchAll(/```cfbl\n([\s\S]*?)```/g)) {
      const canonical = printCFBL(parse(source))
      expect(printCFBL(parse(canonical))).toBe(canonical)
    }
  })
  it('round-trips every shipped template, with invisible identity retained', () => {
    for (const template of POLICY_TEMPLATES) {
      const original = template.create('fixture')
      const imported = fromLegacyMachine(original)
      expect(imported.diagnostics).toEqual([])
      const restored = toMachine(parse(printCFBL(imported.ast)), { automationId: original.id, identityMap: imported.identityMap, name: original.name })
      expect(fromLegacyMachine(restored).ast).toEqual(imported.ast)
      expect(restored.states.map(state => state.id)).toEqual(original.states.map(state => state.id))
    }
  })
  it('differentially steps all template projections through damaged, idle, combat and delayed views', () => {
    for (const template of POLICY_TEMPLATES) {
      const original = template.create('fixture')
      const imported = fromLegacyMachine(original)
      const projection = toMachine(parse(printCFBL(imported.ast)), { automationId: original.id, identityMap: imported.identityMap })
      let before = createPolicyRuntime(original)
      let after = createPolicyRuntime(projection)
      for (let time = 0; time < 40000; time += 1000) {
        const view = { hp: time < 15000 ? 0.1 : 0.9, enemyInRange: time % 3000 === 0, underFire: false, enemyDistance: 8, now: time, idle: true, measure: leaf => leaf.type === 'compare' ? leaf.field === 'hp' ? time < 15000 ? 0.1 : 0.9 : 100 : false }
        const a = stepPolicy(original, before, view)
        const b = stepPolicy(projection, after, view)
        before = a.runtime
        after = b.runtime
        expect(b.runtime).toEqual(a.runtime)
        expect(b.effects).toEqual(a.effects)
      }
    }
  })
  it('covers each field, category, comparison mode and operator at both bounds', () => {
    for (const variant of ['unit', 'build', 'unitBuild', 'defence']) {
      const category = { unit: 'control unit', build: 'build building', unitBuild: 'build unit', defence: 'control defence-building' }[variant]
      for (const [field, meta] of Object.entries(getCatalog(variant).fields)) for (const mode of meta.modes) for (const op of ['==', '<=', '>=', '<', '>']) for (const value of mode === 'relative' ? meta.range : meta.absRange) parse(program(`${field}().${mode} ${op} ${value}`, 'wait', category))
    }
  })
  it('covers every check/effect enum and explicit defaults from typed catalogs', () => {
    for (const variant of ['unit', 'build', 'unitBuild', 'defence']) {
      const category = { unit: 'control unit', build: 'build building', unitBuild: 'build unit', defence: 'control defence-building' }[variant]
      const catalog = getCatalog(variant)
      for (const [kind, entries] of Object.entries(catalog)) {
        if (kind === 'fields') continue
        for (const [name, meta] of Object.entries(entries)) {
          const calls = [`${name}()`]
          for (const param of meta.params) for (const value of param.options?.map(option => option.value) || [param.min, param.max]) calls.push(`${name}(${param.key}=${value})`)
          for (const call of calls) parse(program(kind === 'checks' ? call : 'always', kind === 'effects' ? call : 'wait', category))
        }
      }
    }
    expect(CFBL_CATALOG.effects.buildUnits.params[1].integer).toBe(true)
  })
  it('preserves precedence and explicit nested groups up to four edges', () => {
    const ast = parse(program('always or underFire and not enemyInRange'))
    expect(ast.states[0].transitions[0].when.type).toBe('or')
    expect(ast.states[0].transitions[0].when.of[1].type).toBe('and')
    parse(program('not (not (not (not always)))'))
    expect(parseCFBL(program('not (not (not (not (not always))))')).diagnostics[0].code).toBe('condition_depth')
    const grouped = parse(program('(always and (underFire and enemyInRange))'))
    expect(fromLegacyMachine(toMachine(parse(printCFBL(grouped)))).ast).toEqual(fromLegacyMachine(toMachine(grouped)).ast)
  })
  it('keeps fractional tiles and exact finite decimal expansion', () => {
    parse(program('hp().relative == 0.0000001', 'moveForward(tiles=1.25)'))
    for (const value of [1e-7, -1e-10, 1e21, Number.MIN_VALUE]) {
      expect(decimal(value)).not.toMatch(/e/)
      expect(Number(decimal(value))).toBe(value)
    }
  })
  it('preserves IF/ELSE targets and WHILE UNTIL with forward references', () => {
    const ast = parse('control unit { scope individual; run once; start 2; state 1 { do wait; if (always) goto 2; else goto 1; while (always) until (underFire) goto 2; } state 2 { do hold(); } }')
    const machine = toMachine(ast)
    expect(machine.states[0].transitions[0].elseTo).toBe(machine.states[0].id)
    expect(parse(printCFBL(ast)).initialStateId).toBe(2)
  })
  it.each(['hp().percent < 25', 'hp().relative < 2', 'moving(kind=unit)', 'enemyVisible(targetType=tank)', 'crewByRole()', 'hp(x=1).relative < 1', 'hp().relative != 1', 'HP().relative < 1', 'not not always', 'hp().relative < 1e-7', 'hp().relative < 01', 'rank().relative < 1'])('rejects illegal condition %s', condition => {
    const result = parseCFBL(program(condition))
    expect(result.ast).toBeUndefined()
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0].range).toEqual({ start: result.diagnostics[0].start, end: result.diagnostics[0].end })
  })
  it.each(['buildUnits(quantity=1.5)', 'buildUnits(quantity=0)', 'buildUnits(unitType=any)', 'buildUnits(quantity=1,quantity=2)', 'buildBuilding()', 'wait()'])('rejects illegal unit production action %s', effect => {
    expect(parseCFBL(program('always', effect, 'build unit')).diagnostics.length).toBeGreaterThan(0)
  })
  it('rejects unresolved, repeated, skipped and excessive states and misplaced ELSE', () => {
    for (const source of [program('always').replace('goto 1', 'goto 2'), program().replace('state 1', 'state 2'), program('always', 'wait', 'control unit', 'else goto 1; else goto 1;'), program().replace('state 1', 'state 8'), program().replace('global', 'individual').replace('control unit', 'build unit')]) expect(parseCFBL(source).diagnostics.length).toBeGreaterThan(0)
  })
  it('rejects decimal spellings for generated indexes and delays', () => {
    for (const source of [program().replace('start 1', 'start 1.0'), program().replace('state 1', 'state 1.0'), program().replace('if (always)', 'after 1.0s if (always)')]) expect(parseCFBL(source).diagnostics.length).toBeGreaterThan(0)
  })
  it('offers all legal replacements on accepted source, with generated indexes protected', () => {
    const source = program('always', 'wait')
    const at = source.indexOf('wait') + 4
    expect(completionContext(source, at).legalOptions.some(option => option.value === 'retreat')).toBe(true)
    const stateIndex = source.indexOf('state 1') + 6
    expect(completionContext(source, stateIndex).numericDomain).toBeUndefined()
    const reference = source.indexOf('goto 1') + 5
    expect(completionContext(source, reference).numericDomain).toMatchObject({ min: 1, max: 1 })
  })
  it('reports malformed imported quantities rather than rounding', () => {
    const ast = parse(program('always', 'buildUnits()', 'build unit'))
    const machine = toMachine(ast)
    machine.states[0].effect.quantity = 1.5
    expect(fromLegacyMachine(machine).diagnostics[0].code).toBe('parameter_domain')
  })
  it('offers grammar/category-aware completion, domains and fuzzy search', () => {
    expect(completionContext('').legalOptions.map(item => item.value)).toEqual(['build', 'control'])
    const prefix = 'control unit { scope global; run continuous; start 1; state 1 { do '
    expect(completionContext(prefix).legalOptions.some(item => item.value === 'wait')).toBe(true)
    expect(completionContext(prefix + 'build').legalOptions).toEqual([])
    const fields = completionContext(prefix + 'wait; if (hp().relative < ')
    expect(fields.numericDomain).toEqual({ min: 0, max: 1 })
    expect(completionContext(prefix + 'moveForward(tiles=').numericDomain).toMatchObject({ min: 1, max: 20 })
    expect(completionContext(prefix + 'requestRefill(resource=').legalOptions.map(item => item.value)).toEqual(['ammo', 'fuel', 'health'])
    expect(fuzzyOptions([{ value: 'autoAttackInRange', label: 'Attack enemies in range' }], 'aa ir')).toHaveLength(1)
  })
})
