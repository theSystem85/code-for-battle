import { describe, expect, it } from 'vitest'
import { parseCFBL, printCFBL, fromLegacyMachine, toMachine, completionContext } from '../../src/automation/cfbl/index.js'
import { validatePolicy } from '../../src/policies/policySchema.js'
import { completionWaitKind } from '../../src/policies/policyEffects.js'

function source(category, action, suffix = '') {
  return `${category} { scope global; run continuous; start 1; state 1 { do ${action}${suffix}; } }`
}

describe('completion wait authoring', () => {
  for (const [category, action, kind] of [
    ['build unit', 'buildUnits(unitType=tank,quantity=2,delivery=factoryRally)', 'produced'],
    ['build building', 'buildBuilding(buildingType=powerPlant)', 'produced'],
    ['control unit', 'moveForward(tiles=2)', 'done'],
    ['control unit', 'attackNearestEnemy()', 'done'],
    ['control unit', 'takeoff()', 'done']
  ]) {
    it(`round-trips ${action} wait until ${kind} through CFBL and the machine`, () => {
      const parsed = parseCFBL(source(category, action, ` wait until ${kind}`))
      expect(parsed.diagnostics).toEqual([])
      expect(parsed.ast.states[0].effect.waitForCompletion).toBe(true)
      const machine = toMachine(parsed.ast)
      expect(validatePolicy(machine).errors).toEqual([])
      const migrated = fromLegacyMachine(machine)
      expect(migrated.diagnostics).toEqual([])
      const canonical = printCFBL(migrated.ast)
      expect(canonical).toContain(`wait until ${kind};`)
      expect(parseCFBL(canonical).ast.states[0].effect.waitForCompletion).toBe(true)
    })
  }
  it('preserves the source and behavior of actions without the optional wait', () => {
    const ast = parseCFBL(source('control unit', 'moveForward(tiles=2)')).ast
    const canonical = printCFBL(ast)
    expect(canonical).not.toContain('until')
    ast.states[0].effect.waitForCompletion = false
    expect(printCFBL(ast)).toBe(canonical)
  })
  it('rejects wrong completion modes, idle waits and actions without a finite objective', () => {
    for (const text of [
      source('build unit', 'buildUnits()', ' wait until done'),
      source('control unit', 'moveForward()', ' wait until produced'),
      source('control unit', 'turretLeft()', ' wait until done'),
      source('control defence-building', 'holdFire()', ' wait until done'),
      source('control unit', 'wait', ' wait until done')
    ]) expect(parseCFBL(text).diagnostics.length).toBeGreaterThan(0)
    expect(completionWaitKind('protectNearestFriendly', 'unit')).toBeNull()
  })
  it('offers an atomic legal wait insertion and removal through fuzzy completion', () => {
    const original = printCFBL(parseCFBL(source('control unit', 'moveForward(tiles=2)')).ast)
    const at = original.indexOf(';', original.indexOf('moveForward'))
    const context = completionContext(original, at)
    const wait = context.legalOptions.find(option => option.value === 'wait')
    expect(wait).toBeDefined()
    const edited = original.slice(0, context.edits.start) + wait.insertText + original.slice(context.edits.end)
    expect(parseCFBL(edited).diagnostics).toEqual([])
    const remove = completionContext(edited, { start: edited.indexOf('wait until'), end: edited.indexOf('wait until') + 4 })
    const choice = remove.legalOptions.find(option => option.value === 'no-wait')
    expect(choice).toBeDefined()
    const restored = edited.slice(0, remove.edits.start) + choice.insertText + edited.slice(remove.edits.end)
    expect(parseCFBL(restored).ast.states[0].effect.waitForCompletion).toBeUndefined()
  })
})
