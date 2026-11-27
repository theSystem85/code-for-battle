import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idFor, makeRecord, patchRecord, findTodos, redactPrompt, validateTodos, editToken } from '../../scripts/todo.mjs'
import { todoPathsOnly, todoRangeOnly } from '../../scripts/todo-paths.mjs'
import { decideNetlifyBuild } from '../../scripts/netlify-ignore.mjs'
import { ID_PATTERN, SHARDS } from '../../src/todo/schema.js'
import { loadTodos } from '../../src/todo/publication.js'
import { VIEWS } from '../../src/todo/views.js'
import { buildUnreleasedRelease, mergeReleaseEntries } from '../../src/ui/releaseData.js'

const paths = []
const root = () => {
  const path = mkdtempSync(join(tmpdir(), 'cfb-todo-'))
  paths.push(path)
  return path
}

afterEach(() => {
  vi.unstubAllGlobals()
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true })
})

const at = '2024-11-27T13:00:00.000Z'
const later = '2024-11-27T13:05:00.000Z'
const seed = (data = {}) => ({
  title: 'Repair patrol route',
  description: 'The second waypoint is skipped.',
  type: 'bug',
  subsystem: 'Units',
  questions: ['Which waypoint?'],
  ...data
})
const historyId = '22'.repeat(16)

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function cli(cwd, command, input) {
  return JSON.parse(execFileSync(process.execPath, [resolve('scripts/todo.mjs'), command], { cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }))
}

function init() {
  const cwd = root()
  git(cwd, 'init', '-q', '-b', 'dev')
  git(cwd, 'config', 'user.email', 'todo@example.invalid')
  git(cwd, 'config', 'user.name', 'TODO test')
  mkdirSync(join(cwd, 'TODO/records'), { recursive: true })
  mkdirSync(join(cwd, 'prompt-history/todo'), { recursive: true })
  for (const shard of SHARDS) writeFileSync(join(cwd, 'TODO/records', `${shard}.jsonl`), '')
  writeFileSync(join(cwd, 'game.js'), 'initial')
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-qm', 'baseline')
  return cwd
}

describe('repository TODO records', () => {
  it('[U07401] gives separate stable classification IDs and keeps them through a refinement', () => {
    const id = idFor('bug')
    expect(id).toMatch(ID_PATTERN)
    expect(id).toMatch(/^BUG-/)
    expect(idFor('bug')).not.toBe(id)
    expect(idFor('feature')).toMatch(/^FEAT-/)
    expect(idFor('improvement')).toMatch(/^IMP-/)
    const original = makeRecord(seed(), id, at)
    const changed = patchRecord(original, { type: 'improvement', title: 'Patrol refinements' }, later)
    expect(changed).toMatchObject({ id, createdAt: at, updatedAt: later, type: 'improvement' })
  })

  it('[U07402] guards manual QA by revision and preserves QA history on retests', () => {
    const original = makeRecord(seed(), undefined, at)
    const implemented = patchRecord(original, { status: 'IMPLEMENTED' }, later)
    expect(implemented).toMatchObject({ revision: 1, verificationStatus: 'NOT_TESTED' })
    const passed = patchRecord(implemented, { verification: { revision: 1, status: 'PASSED' } }, later)
    const retest = patchRecord(passed, { advanceRevision: true }, later)
    expect(retest).toMatchObject({ revision: 2, verificationStatus: 'RETEST_REQUIRED', lastVerifiedRevision: 1 })
    expect(retest.verificationHistory).toEqual(passed.verificationHistory)
    expect(() => patchRecord(retest, { verification: { revision: 1, status: 'FAILED' } }, later)).toThrow(/current implemented revision/)
    expect(VIEWS['Awaiting QA'](retest, { [retest.id]: 1 })).toBe(false)
    expect(VIEWS['Awaiting QA'](retest, { [retest.id]: 2 })).toBe(true)
  })

  it('[U07403] rejects missing and circular dependencies and excludes unfinished prerequisite work from ready queries', () => {
    const parent = makeRecord(seed())
    const child = makeRecord(seed({ title: 'Improve patrol', questions: [], dependencies: [parent.id], status: 'READY',
      acceptanceCriteria: ['Patrol continues'], complexity: 'S' }))
    expect(() => validateTodos([child])).toThrow(/Missing dependency/)
    expect(() => validateTodos([child, { ...parent, dependencies: [child.id] }])).toThrow(/cycle/)
    expect(findTodos([parent, child], { ready: true })).toEqual([])
    expect(findTodos([{ ...parent, status: 'IMPLEMENTED' }, child], { ready: true })).toEqual([child])
    expect(findTodos([parent, child], { text: 'repair POINT' })).toEqual([parent])
  })

  it('[U07404] records redacted text once and rejects duplicate or stale concurrent edits', () => {
    const cwd = init()
    const payload = { operation: 'create', text: 'Please repair patrol. api_key=example-secret', changes: [{ create: seed() }] }
    const [id] = cli(cwd, 'apply', JSON.stringify(payload))
    expect(() => cli(cwd, 'apply', JSON.stringify(payload))).toThrow(/Matching title/)
    git(cwd, 'add', 'TODO/records', 'prompt-history/todo')
    expect(cli(cwd, 'staged')).toEqual({ records: 1 })
    git(cwd, 'commit', '-qm', 'first TODO')
    const file = git(cwd, 'ls-tree', '-r', '--name-only', 'HEAD', 'prompt-history/todo')
    expect(JSON.parse(readFileSync(join(cwd, file), 'utf8'))).toMatchObject({
      todoIds: [id], text: 'Please repair patrol. api_key=[REDACTED]'
    })
    expect(redactPrompt('Authorization: Bearer fake')).not.toContain('fake')
    const edit = { operation: 'refine', voice: true, changes: [{ id, expectedToken: 'stale', patch: { priority: 'high' } }] }
    expect(() => cli(cwd, 'apply', JSON.stringify(edit))).toThrow(/Concurrent update/)
    expect(cli(cwd, 'validate')).toEqual({ records: 1 })
    expect(git(cwd, 'status', '--porcelain')).toBe('')
  })

  it('[U07405] replays independent changes in the same shard and keeps both interactions', () => {
    const cwd = init()
    const first = 'BUG-' + 'a'.repeat(32)
    const second = 'BUG-' + 'b'.repeat(31) + 'a'
    const start = makeRecord(seed(), first, at)
    const next = makeRecord(seed({ title: 'Capture broken route' }), second, at)
    const file = join(cwd, 'TODO/records/2.jsonl')
    writeFileSync(file, JSON.stringify(start) + '\n' + JSON.stringify(next) + '\n')
    git(cwd, 'add', 'TODO/records')
    git(cwd, 'commit', '-qm', 'seed records')
    const edit = record => JSON.stringify({
      operation: 'refine', text: 'Raise the priority',
      changes: [{ id: record.id, expectedToken: editToken(record), patch: { priority: 'high' } }]
    })
    cli(cwd, 'apply', edit(start))
    git(cwd, 'add', 'TODO/records', 'prompt-history/todo')
    git(cwd, 'commit', '-qm', 'upstream agent')
    cli(cwd, 'apply', edit(next))
    git(cwd, 'add', 'TODO/records', 'prompt-history/todo')
    expect(cli(cwd, 'staged')).toEqual({ records: 2 })
    expect(readFileSync(file, 'utf8').match(/"priority":"high"/g)).toHaveLength(2)
    expect(git(cwd, 'ls-files', 'prompt-history/todo').split('\n')).toHaveLength(2)
    writeFileSync(join(cwd, 'game.js'), 'unrelated user update')
    expect(() => cli(cwd, 'staged')).toThrow()
    expect(readFileSync(join(cwd, 'game.js'), 'utf8')).toBe('unrelated user update')
  })

  it('[U07406] rejects renamed and removed files, mixed ranges and source changes reverted within a push', async() => {
    const cwd = init()
    const base = git(cwd, 'rev-parse', 'HEAD')
    const allowed = ['M', 'TODO/records/0.jsonl', 'A', `prompt-history/todo/${historyId}.json`, ''].join('\0')
    expect(todoPathsOnly(allowed)).toBe(true)
    expect(todoPathsOnly(allowed.replace('M', 'D'))).toBe(false)
    expect(todoPathsOnly(allowed.replace('M', 'R100'))).toBe(false)
    expect(todoPathsOnly(allowed.replace('0.jsonl', '0.js'))).toBe(false)
    writeFileSync(join(cwd, 'TODO/records/0.jsonl'), '\n')
    git(cwd, 'commit', '-qam', 'data only')
    const todo = git(cwd, 'rev-parse', 'HEAD')
    expect(todoRangeOnly(base, todo, cwd)).toBe(true)
    expect(todoRangeOnly(todo, base, cwd)).toBe(false)
    expect((await decideNetlifyBuild({ CONTEXT: 'branch-deploy', BRANCH: 'dev', CACHED_COMMIT_REF: base, COMMIT_REF: todo }, cwd)).build).toBe(false)
    writeFileSync(join(cwd, 'game.js'), 'modified')
    git(cwd, 'commit', '-qam', 'code')
    git(cwd, 'revert', '--no-edit', 'HEAD')
    expect(todoRangeOnly(base, git(cwd, 'rev-parse', 'HEAD'), cwd)).toBe(false)
  })

  it('[U07408] pins the deployed backlog to one Git ref and refreshes only on change', async() => {
    const record = makeRecord(seed())
    const first = 'a'.repeat(40)
    const second = 'b'.repeat(40)
    let ref = first
    const fetch = vi.fn(async url => {
      if (url.startsWith('https://api.github.com')) return { ok: true, json: async() => ({ object: { sha: ref } }) }
      const body = url.endsWith(`/${Number.parseInt(record.id.at(-1), 16) % 8}.jsonl`) ? JSON.stringify(record) : ''
      return { ok: true, text: async() => body }
    })
    vi.stubGlobal('fetch', fetch)
    const snapshot = await loadTodos(null, { local: false })
    expect(snapshot.commit).toBe(first)
    expect(snapshot.records).toHaveLength(1)
    expect(snapshot.records[0]).not.toHaveProperty('promptIds')
    expect(fetch.mock.calls.slice(1).every(([url]) => url.includes(`/${first}/TODO/records/`))).toBe(true)
    fetch.mockClear()
    expect(await loadTodos(snapshot, { local: false })).toBe(snapshot)
    expect(fetch).toHaveBeenCalledTimes(1)
    ref = second
    expect((await loadTodos(snapshot, { local: false })).commit).toBe(second)
  })

  it('[U07407] keeps traceability in release metadata without changing digest text', () => {
    const id = idFor('feature')
    const release = buildUnreleasedRelease({ 'features/unreleased/features/test.json': { description: 'Patrol works.', todoIds: [id] } }, '1.0.0')
    const combined = mergeReleaseEntries([{ version: '1.0.0', features: ['Previous note'] }], release)[0]
    expect(combined.features).toEqual(['Previous note', 'Patrol works.'])
    expect(combined.todoIds).toEqual({ features: { 1: [id] } })
  })
})
