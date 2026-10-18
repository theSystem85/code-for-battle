import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildReleaseFile, formatChangelog } from '../../scripts/release.mjs'

const SCRIPT = resolve('scripts/release.mjs')
const dirs = []

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function scratchRepo() {
  const root = mkdtempSync(join(tmpdir(), 'cfb-release-'))
  dirs.push(root)
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'x', version: '0.62.0' }, null, 2)}\n`)
  writeFileSync(join(root, 'package-lock.json'), `${JSON.stringify({ name: 'x', version: '0.62.0', lockfileVersion: 3, packages: { '': { name: 'x', version: '0.62.0' } } }, null, 2)}\n`)
  mkdirSync(join(root, 'features', 'unreleased', 'features'), { recursive: true })
  mkdirSync(join(root, 'features', 'unreleased', 'bugfixes'), { recursive: true })
  writeFileSync(join(root, 'features', 'unreleased', 'features', '.gitkeep'), '')
  writeFileSync(join(root, 'features', 'unreleased', 'bugfixes', '.gitkeep'), '')
  writeFileSync(join(root, 'features', '0.62.0.json'), JSON.stringify({ version: '0.62.0', features: ['Old'], improvements: [], bugfixes: [] }))
  writeFileSync(join(root, 'features', 'unreleased', 'features', '758-maps.json'), JSON.stringify({ description: 'New maps.' }))
  writeFileSync(join(root, 'features', 'unreleased', 'bugfixes', '759-crash.json'), JSON.stringify({ description: 'Fixed a crash.' }))
  git(root, 'init', '-q', '-b', 'dev')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'feat: base')
  return root
}

function release(root, ...args) {
  return execFileSync('node', [SCRIPT, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CFB_RELEASE_ROOT: root } })
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('npm run release', () => {
  it('[U05187] formats the changelog and release file per category', () => {
    const entries = [{ category: 'features', description: 'A', breaking: true }, { category: 'bugfixes', description: 'B' }]
    expect(buildReleaseFile('1.0.0', entries)).toEqual({ version: '1.0.0', features: ['A'], improvements: [], bugfixes: ['B'] })
    expect(formatChangelog('1.0.0', '0.62.0', entries)).toContain('[BREAKING] A')
  })

  it('[U05188] prints the next version on --dry-run without touching files', () => {
    const root = scratchRepo()
    expect(release(root, '--dry-run')).toContain('v0.62.0 -> v0.63.0')
    expect(existsSync(join(root, 'features', '0.63.0.json'))).toBe(false)
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it('[U05189] folds entries into features/<version>.json, bumps package.json and the lockfile, commits and tags', () => {
    const root = scratchRepo()
    release(root)
    expect(JSON.parse(readFileSync(join(root, 'features', '0.63.0.json'), 'utf8'))).toEqual({
      version: '0.63.0', features: ['New maps.'], improvements: [], bugfixes: ['Fixed a crash.']
    })
    expect(existsSync(join(root, 'features', 'unreleased', 'features', '758-maps.json'))).toBe(false)
    expect(existsSync(join(root, 'features', 'unreleased', 'features', '.gitkeep'))).toBe(true)
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version).toBe('0.63.0')
    const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
    expect([lock.version, lock.packages[''].version]).toEqual(['0.63.0', '0.63.0'])
    expect(git(root, 'log', '-1', '--format=%s')).toBe('chore(release): 0.63.0')
    expect(git(root, 'rev-list', '-n', '1', 'v0.63.0')).toBe(git(root, 'rev-parse', 'HEAD'))
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it('[U05190] refuses to release without entries or with a dirty tree', () => {
    const root = scratchRepo()
    writeFileSync(join(root, 'stray.txt'), 'x')
    expect(() => release(root)).toThrow()
    rmSync(join(root, 'stray.txt'))
    release(root)
    expect(() => release(root)).toThrow()
  })

  it('[U05191] re-points the tag at the rewritten release commit after a rebase-merge', () => {
    const root = scratchRepo()
    release(root)
    const original = git(root, 'rev-parse', 'HEAD')
    // A GitHub rebase-merge recreates the commit with a new id.
    git(root, 'commit', '-q', '--amend', '--no-edit', '--date=2030-01-01T00:00:00Z')
    const rewritten = git(root, 'rev-parse', 'HEAD')
    expect(rewritten).not.toBe(original)
    expect(release(root, '--tag')).toContain('v0.63.0')
    expect(git(root, 'rev-list', '-n', '1', 'v0.63.0')).toBe(rewritten)
  })
})
