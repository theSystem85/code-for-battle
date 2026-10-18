import { describe, expect, it } from 'vitest'
import { assignIds, checkIds, findTestDeclarations, formatId, prefixForFile, scan } from '../../scripts/test-ids.mjs'

const entry = (file, source) => {
  const tests = findTestDeclarations(source).map(decl => {
    const match = /^\[([UE])(\d{5})\] /.exec(decl.title)
    return { ...decl, id: match ? `${match[1]}${match[2]}` : null, idPrefix: match ? match[1] : null }
  })
  return { file, prefix: prefixForFile(file), source, tests }
}

describe('test ID tooling', () => {
  it('[U05204] finds it/test declarations including modifiers and .each, but not describe, step or regex .test()', () => {
    const source = [
      "describe('suite', () => {",
      "  it('plain', () => {})",
      '  it.skip("skipped", () => {})',
      '  test.only(`template ${1}`, () => {})',
      "  it.each([[1, ')'], [2, '(']])('each %s', () => {})",
      "  test.skipIf(process.env.CI)('conditional', () => {})",
      "  test.describe('nested', () => {})",
      "  test.step('a step', async() => {})",
      "  /it\\('nope'\\)/.test('it(\\'x\\')')",
      "  // it('commented')",
      "  const s = \"it('in a string')\"",
      "  test.skip(isCi, 'runtime skip reason')",
      '})'
    ].join('\n')
    expect(findTestDeclarations(source).map(decl => decl.title)).toEqual(['plain', 'skipped', 'template ${1}', 'each %s', 'conditional'])
  })

  it('[U05205] uses E for tests/e2e and U elsewhere with five zero-padded digits', () => {
    expect(prefixForFile('tests/e2e/a.test.js')).toBe('E')
    expect(prefixForFile('tests/unit/a.test.js')).toBe('U')
    expect(formatId('U', 42)).toBe('U00042')
  })

  it('[U05206] reports missing, misplaced, wrong-prefix and duplicate IDs', () => {
    const problems = checkIds([
      entry('tests/unit/a.test.js', "it('[U00001] ok')\nit('no id')\nit('x [U00002]')\nit('[E00003] wrong')"),
      entry('tests/unit/b.test.js', "it('[U00001] again')")
    ])
    expect(problems).toHaveLength(4)
    expect(problems.join('\n')).toMatch(/missing test ID/)
    expect(problems.join('\n')).toMatch(/misplaced/)
    expect(problems.join('\n')).toMatch(/should use the U prefix/)
    expect(problems.join('\n')).toMatch(/duplicate U00001/)
  })

  it('[U05207] assigns the next free IDs deterministically and fixes duplicates', () => {
    const changes = assignIds([
      entry('tests/unit/a.test.js', "it('[U00007] keep')\nit('new one')"),
      entry('tests/unit/b.test.js', "it('[U00007] dup')"),
      entry('tests/e2e/c.test.js', "test('flow')")
    ])
    expect(changes.map(change => change.source)).toEqual([
      "it('[U00007] keep')\nit('[U00008] new one')",
      "it('[U00009] dup')",
      "test('[E00001] flow')"
    ])
  })

  it('[U05208] keeps every test in the repository identified and unique', () => {
    const scanned = scan()
    expect(scanned.reduce((sum, file) => sum + file.tests.length, 0)).toBeGreaterThan(5000)
    expect(checkIds(scanned)).toEqual([])
  })
})
