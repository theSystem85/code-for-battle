import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bumpVersion,
  computeAppVersion,
  parseVersion,
  readUnreleasedEntries,
  validateEntry,
  versionDefines
} from '../../scripts/versioning.mjs'
import { APP_VERSION } from '../../src/version.js'

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
  it('[U05197] parses MAJOR.MINOR.PATCH and rejects anything else', () => {
    expect(parseVersion('0.62.0')).toEqual([0, 62, 0])
    expect(() => parseVersion('0.62')).toThrow()
    expect(() => parseVersion('0.62.0-pr7')).toThrow()
  })

  it('[U05198] bumps patch for fixes and improvements, minor for features and major for breaking entries', () => {
    expect(bumpVersion('0.62.0', [])).toBe('0.62.0')
    expect(bumpVersion('0.62.0', [{ category: 'bugfixes' }, { category: 'improvements' }])).toBe('0.62.1')
    expect(bumpVersion('0.62.3', [{ category: 'bugfixes' }, { category: 'features' }])).toBe('0.63.0')
    expect(bumpVersion('0.62.3', [{ category: 'bugfixes', breaking: true }, { category: 'features' }])).toBe('1.0.0')
  })

  it('[U05199] validates entry files: a description string, optional boolean breaking, nothing else', () => {
    expect(validateEntry({ description: 'Faster loading.' })).toEqual([])
    expect(validateEntry({ description: 'New maps.', breaking: true })).toEqual([])
    expect(validateEntry({ description: '' })).toHaveLength(1)
    expect(validateEntry({ description: 'x', breaking: 'yes' })).toHaveLength(1)
    expect(validateEntry({ description: 'x', version: '1.0.0' })).toHaveLength(1)
    expect(validateEntry(['x'])).toHaveLength(1)
  })

  it('[U05200] computes the version from package.json plus unreleased entries in sorted file order', () => {
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

  it('[U05201] fails the build on an invalid entry file instead of guessing', () => {
    const root = scratchRepo('0.62.0', { features: { 'bad.json': '{ nope', 'empty.json': { description: ' ' } } })
    expect(readUnreleasedEntries(root).errors).toHaveLength(2)
    expect(() => computeAppVersion(root)).toThrow(/Invalid unreleased/)
  })

  it('[U05202] defines the same plain version for deploy previews, dev and production', () => {
    const root = scratchRepo('1.2.3', { features: { 'x.json': { description: 'X' } } })
    for (const env of [{ CONTEXT: 'deploy-preview', REVIEW_ID: '9' }, { CONTEXT: 'branch-deploy', BRANCH: 'dev' }, { CONTEXT: 'production' }, {}]) {
      const saved = { ...process.env }
      Object.assign(process.env, env)
      try {
        expect(versionDefines(root)).toEqual({ __APP_VERSION__: '"1.3.0"' })
      } finally {
        for (const key of ['CONTEXT', 'REVIEW_ID', 'BRANCH']) {
          if (key in saved) process.env[key] = saved[key]
          else delete process.env[key]
        }
      }
    }
  })

  it('[U05203] injects the computed repository version into src/version.js', () => {
    expect(APP_VERSION).toBe(computeAppVersion(process.cwd()).version)
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

})
