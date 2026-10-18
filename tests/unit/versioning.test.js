import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bumpVersion,
  computeAppVersion,
  computeVersionLabel,
  parseVersion,
  readUnreleasedEntries,
  validateEntry,
  versionDefines
} from '../../scripts/versioning.mjs'
import { APP_VERSION, APP_VERSION_LABEL } from '../../src/version.js'

const dirs = []
function scratchRepo(version, entries = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cfb-version-'))
  dirs.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version }))
  for (const [category, files] of Object.entries(entries)) {
    mkdirSync(join(root, 'features', 'unreleased', category), { recursive: true })
    for (const [name, data] of Object.entries(files)) {
      writeFileSync(join(root, 'features', 'unreleased', category, name), typeof data === 'string' ? data : JSON.stringify(data))
    }
  }
  return root
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('build-time versioning', () => {
  it('parses MAJOR.MINOR.PATCH and rejects anything else', () => {
    expect(parseVersion('0.62.0')).toEqual([0, 62, 0])
    expect(() => parseVersion('0.62')).toThrow()
    expect(() => parseVersion('0.62.0-pr7')).toThrow()
  })

  it('bumps patch for fixes and improvements, minor for features and major for breaking entries', () => {
    expect(bumpVersion('0.62.0', [])).toBe('0.62.0')
    expect(bumpVersion('0.62.0', [{ category: 'bugfixes' }, { category: 'improvements' }])).toBe('0.62.1')
    expect(bumpVersion('0.62.3', [{ category: 'bugfixes' }, { category: 'features' }])).toBe('0.63.0')
    expect(bumpVersion('0.62.3', [{ category: 'bugfixes', breaking: true }, { category: 'features' }])).toBe('1.0.0')
  })

  it('validates entry files: a description string, optional boolean breaking, nothing else', () => {
    expect(validateEntry({ description: 'Faster loading.' })).toEqual([])
    expect(validateEntry({ description: 'New maps.', breaking: true })).toEqual([])
    expect(validateEntry({ description: '' })).toHaveLength(1)
    expect(validateEntry({ description: 'x', breaking: 'yes' })).toHaveLength(1)
    expect(validateEntry({ description: 'x', version: '1.0.0' })).toHaveLength(1)
    expect(validateEntry(['x'])).toHaveLength(1)
  })

  it('computes the version from package.json plus unreleased entries in sorted file order', () => {
    const root = scratchRepo('0.62.0', {
      improvements: { 'b-second.json': { description: 'Second' }, 'a-first.json': { description: 'First' } },
      bugfixes: { '757-fix.json': { description: 'Fix' } }
    })
    const result = computeAppVersion(root)
    expect(result.baseVersion).toBe('0.62.0')
    expect(result.version).toBe('0.62.1')
    expect(result.entries.map(entry => entry.description)).toEqual(['First', 'Second', 'Fix'])
    expect(computeAppVersion(scratchRepo('0.62.0')).version).toBe('0.62.0')
  })

  it('fails the build on an invalid entry file instead of guessing', () => {
    const root = scratchRepo('0.62.0', { features: { 'bad.json': '{ nope', 'empty.json': { description: ' ' } } })
    expect(readUnreleasedEntries(root).errors).toHaveLength(2)
    expect(() => computeAppVersion(root)).toThrow(/Invalid unreleased/)
  })

  it('labels deploy previews with their PR number and leaves production and dev plain', () => {
    expect(computeVersionLabel('0.62.1', { CONTEXT: 'deploy-preview', REVIEW_ID: '757' })).toBe('0.62.1-pr757')
    expect(computeVersionLabel('0.62.1', { CONTEXT: 'production', REVIEW_ID: '757' })).toBe('0.62.1')
    expect(computeVersionLabel('0.62.1', { CONTEXT: 'branch-deploy', BRANCH: 'dev' })).toBe('0.62.1')
    expect(computeVersionLabel('0.62.1', {})).toBe('0.62.1')
    const defines = versionDefines(scratchRepo('1.2.3', { features: { 'x.json': { description: 'X' } } }), { CONTEXT: 'deploy-preview', REVIEW_ID: '9' })
    expect(defines).toEqual({ __APP_VERSION__: '"1.3.0"', __APP_VERSION_LABEL__: '"1.3.0-pr9"' })
  })

  it('injects the computed repository version into src/version.js', () => {
    expect(APP_VERSION).toBe(computeAppVersion(process.cwd()).version)
    expect(APP_VERSION_LABEL.startsWith(APP_VERSION)).toBe(true)
  })
})
