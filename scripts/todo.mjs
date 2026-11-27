import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { ID_PATTERN, PROMPT_PATTERN, SCHEMA_VERSION, SHARDS, TYPES, PRIORITIES, isText, isTimestamp, shardFor, parseRecords, validateRecord } from '../src/todo/schema.js'
import { todoPathsOnly } from './todo-paths.mjs'

export const idFor = type => {
  if (!Object.hasOwn(TYPES, type)) throw new Error('Unknown TODO type')
  return `${TYPES[type]}-${randomUUID().replaceAll('-', '')}`
}
const promptFile = id => `prompt-history/todo/${id}.json`
const shardFile = shard => `TODO/records/${shard}.jsonl`
export const readShard = shard => parseRecords(readFileSync(shardFile(shard), 'utf8'))
export const readTodos = () => SHARDS.flatMap(readShard)
export const serialize = records => records.sort((a, b) => a.id.localeCompare(b.id)).map(record => JSON.stringify(record) + '\n').join('')
const now = () => new Date().toISOString()
export const editToken = record => createHash('sha256').update(JSON.stringify(record)).digest('hex')

export function makeRecord(data, id = idFor(data.type), at = now()) {
  return validateRecord({
    priority: 'untriaged', complexity: null, acceptanceCriteria: [], questions: [], references: [],
    dependencies: [], implementationRefs: [], promptIds: [], clarificationPromptIds: [],
    status: 'NEEDS_CLARIFICATION', verificationStatus: 'NOT_TESTED', revision: 0,
    lastVerifiedRevision: null, verificationHistory: [],
    ...data, id, schemaVersion: SCHEMA_VERSION, createdAt: at, updatedAt: at
  })
}

export function patchRecord(old, patch, at = now()) {
  const { advanceRevision, verification, ...fields } = patch
  for (const key of ['id', 'schemaVersion', 'createdAt', 'updatedAt', 'revision', 'lastVerifiedRevision', 'verificationHistory', 'promptIds', 'clarificationPromptIds', 'editToken']) {
    if (Object.hasOwn(fields, key)) throw new Error(`Cannot patch ${key} directly`)
  }
  if (['PASSED', 'FAILED', 'RETEST_REQUIRED'].includes(fields.verificationStatus)) {
    throw new Error('Use verification for manual results. Retest status follows revision changes.')
  }
  if (advanceRevision !== undefined && typeof advanceRevision !== 'boolean') throw new Error('advanceRevision must be boolean')
  if (advanceRevision && verification) throw new Error('Record new implementation and manual verification separately')
  const next = { ...old, ...fields, updatedAt: at }
  if (advanceRevision || (next.status === 'IMPLEMENTED' && old.revision === 0)) {
    next.revision++
    if (old.lastVerifiedRevision !== null) next.verificationStatus = 'RETEST_REQUIRED'
    else if (next.verificationStatus !== 'NOT_APPLICABLE') next.verificationStatus = 'NOT_TESTED'
  }
  if (next.status === 'CANCELLED') next.verificationStatus = 'NOT_APPLICABLE'
  if (verification !== undefined) {
    if (next.status !== 'IMPLEMENTED' || !['PASSED', 'FAILED'].includes(verification.status) || verification.revision !== next.revision) {
      throw new Error('Manual verification must identify the current implemented revision as PASSED or FAILED')
    }
    next.verificationStatus = verification.status
    const result = { status: verification.status, revision: next.revision, at }
    if (verification.notes !== undefined) result.notes = verification.notes
    next.verificationHistory = [...old.verificationHistory, result]
    next.lastVerifiedRevision = next.revision
  }
  return validateRecord(next)
}

const operations = ['create', 'refine', 'cancel', 'verify', 'reconcile']
export function redactPrompt(text) {
  if (!isText(text)) throw new Error('A text interaction requires a reviewed user prompt')
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:gh[pousr]_[\w]{20,}|github_pat_[\w]{20,}|sk-[\w-]{16,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED]')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/(["']?(?:password|api[_ -]?key|access[_ -]?token|secret|authorization)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,}]+)/gi, '$1[REDACTED]')
}

function validatePrompt(prompt) {
  if (prompt.schemaVersion !== SCHEMA_VERSION || !PROMPT_PATTERN.test(prompt.id) || !isTimestamp(prompt.at) ||
      !isText(prompt.text) || !operations.includes(prompt.operation) || !Array.isArray(prompt.todoIds) ||
      !prompt.todoIds.length || !prompt.todoIds.every(id => ID_PATTERN.test(id)) ||
      (prompt.harness !== undefined && !isText(prompt.harness)) ||
      !Array.isArray(prompt.previousPromptIds) || !prompt.previousPromptIds.every(id => PROMPT_PATTERN.test(id))) {
    throw new Error(`Invalid prompt record ${prompt.id}`)
  }
  return prompt
}

export function validateTodos(records, newPrompt) {
  const byId = new Map()
  const legacy = new Set()
  const checkPrompt = id => {
    if (id !== newPrompt?.id && !existsSync(promptFile(id))) throw new Error(`Missing prompt record ${id}`)
  }
  for (const id of newPrompt?.previousPromptIds ?? []) checkPrompt(id)
  for (const record of records) {
    validateRecord(record)
    if (byId.has(record.id)) throw new Error(`Duplicate TODO ID ${record.id}`)
    byId.set(record.id, record)
    for (const alias of record.legacyIds ?? []) {
      if (legacy.has(alias)) throw new Error(`Duplicate legacy ID ${alias}`)
      legacy.add(alias)
    }
    for (const id of [...record.promptIds, ...record.clarificationPromptIds]) checkPrompt(id)
  }
  const visited = new Set()
  const visiting = new Set()
  const visit = id => {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error(`Dependency cycle involving ${id}`)
    if (!byId.has(id)) throw new Error(`Missing dependency ${id}`)
    visiting.add(id)
    for (const dependency of byId.get(id).dependencies) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of byId.keys()) visit(id)
}

const normalize = value => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replaceAll(/\s+/g, ' ')
export function findTodos(records, { text = '', status, type, subsystem, verificationStatus, ready = false, sort = 'priority' } = {}) {
  const implemented = new Set(records.filter(record => record.status === 'IMPLEMENTED').map(record => record.id))
  const terms = normalize(text).split(' ').filter(Boolean)
  const matching = records.filter(record => {
    if (status && record.status !== status || type && record.type !== type || subsystem && record.subsystem !== subsystem ||
        verificationStatus && record.verificationStatus !== verificationStatus) return false
    if (ready && (record.status !== 'READY' || !record.dependencies.every(dep => implemented.has(dep)))) return false
    if (!terms.length) return true
    const searchable = normalize([record.id, record.title, record.description, record.subsystem, record.type, ...record.references, ...(record.tags ?? []), ...(record.legacyIds ?? [])].join(' '))
    return terms.every(term => searchable.includes(term))
  })
  return matching.sort((a, b) => (sort === 'created' ? b.createdAt.localeCompare(a.createdAt) :
    sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) :
      PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority)) || a.id.localeCompare(b.id))
}

function apply({ operation, text, voice = false, harness, previousPromptIds = [], clarification = false, changes }) {
  if (!operations.includes(operation) || !Array.isArray(changes) || !changes.length) throw new Error('Operation and changes are required')
  const records = readTodos()
  const next = new Map(records.map(record => [record.id, record]))
  const touched = new Set()
  const ids = new Set()
  const at = now()
  const interaction = voice ? null : randomUUID().replaceAll('-', '')
  for (const change of changes) {
    const { id, create, patch } = change
    if (!!create === !!patch || (patch && !id) || (id && !ID_PATTERN.test(id))) throw new Error('Use create or supply id and patch')
    let record
    if (create) {
      const candidate = normalize(create.title ?? '')
      const duplicate = [...next.values()].find(existing => normalize(existing.title) === candidate && existing.status !== 'CANCELLED')
      if (duplicate && change.confirmDistinct !== true) throw new Error(`Matching title on ${duplicate.id}. Refine it or confirm the distinction.`)
      if (id && !id.startsWith(`${TYPES[create.type]}-`)) throw new Error('New TODO ID prefix must match its type')
      record = makeRecord({ ...create, promptIds: [], clarificationPromptIds: [] }, id, at)
      if (next.has(record.id)) throw new Error(`TODO already exists: ${record.id}`)
    } else {
      const old = next.get(id)
      if (!old) throw new Error(`Unknown TODO ${id}`)
      if (change.expectedToken !== editToken(old)) throw new Error(`Concurrent update to ${id}. Read the latest record before retrying.`)
      record = patchRecord(old, patch, at)
      if (JSON.stringify({ ...record, updatedAt: old.updatedAt }) === JSON.stringify(old)) continue
    }
    if (ids.has(record.id)) throw new Error(`Multiple operations on ${record.id}`)
    if (interaction) {
      const key = clarification ? 'clarificationPromptIds' : 'promptIds'
      record[key] = [...record[key], interaction]
    }
    ids.add(record.id)
    touched.add(shardFor(record.id))
    next.set(record.id, record)
  }
  if (!ids.size) return []
  const todoIds = [...ids]
  const prompt = interaction ? validatePrompt({ schemaVersion: SCHEMA_VERSION, id: interaction, at, text: redactPrompt(text), harness, todoIds, operation, previousPromptIds }) : null
  validateTodos([...next.values()], prompt)
  // Use a clean isolated worktree. Nothing is committed if any write fails.
  if (prompt) writeFileSync(promptFile(prompt.id), JSON.stringify(prompt, null, 2) + '\n', { flag: 'wx' })
  for (const shard of touched) writeFileSync(shardFile(shard), serialize([...next.values()].filter(record => shardFor(record.id) === shard)))
  return todoIds
}

function verifyStaged() {
  const staged = execFileSync('git', ['diff', '--cached', '--name-status', '--no-renames', '-z'], { encoding: 'utf8' })
  if (!todoPathsOnly(staged)) throw new Error('Staged paths are outside the TODO-only allowlist or there is nothing staged')
  execFileSync('git', ['diff', '--quiet'], { stdio: 'ignore' })
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' })
  if (untracked) throw new Error('Use a clean worktree with only the intended TODO changes staged')
  const paths = staged.slice(0, -1).split('\0').filter((_field, index) => index % 2)
  for (const path of paths) {
    const indexed = execFileSync('git', ['ls-files', '--stage', '--', path], { encoding: 'utf8' })
    if (!indexed.startsWith('100644 ')) throw new Error(`Expected a regular data file at ${path}`)
    if (path.startsWith('TODO/')) {
      const previous = execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' })
      const next = new Map(parseRecords(readFileSync(path, 'utf8')).map(record => [record.id, record]))
      for (const old of parseRecords(previous)) {
        const record = next.get(old.id)
        if (!record || record.createdAt !== old.createdAt || record.revision < old.revision ||
            !['promptIds', 'clarificationPromptIds', 'verificationHistory'].every(field =>
              JSON.stringify(record[field].slice(0, old[field].length)) === JSON.stringify(old[field]))) {
          throw new Error(`Preserve identity and history for ${old.id}. Use CANCELLED to remove an item from active views.`)
        }
      }
    }
  }
  return paths.filter(path => path.startsWith('prompt-history/')).map(path => path.split('/').at(-1))
}

function readPrompt(id) {
  if (!PROMPT_PATTERN.test(id || '')) throw new Error('Provide a valid prompt history ID')
  const prompt = validatePrompt(JSON.parse(readFileSync(promptFile(id), 'utf8')))
  if (prompt.id !== id) throw new Error(`Prompt filename mismatch ${id}`)
  return prompt
}

const allPromptNames = () => existsSync('prompt-history/todo') ? readdirSync('prompt-history/todo') : []

function validateRepository(promptNames) {
  const records = SHARDS.flatMap(shard => {
    const raw = readFileSync(shardFile(shard), 'utf8')
    const items = parseRecords(raw)
    if (items.some(record => typeof record.id !== 'string' || shardFor(record.id) !== shard) || serialize(items) !== raw) {
      throw new Error(`Misplaced or non-canonical records in shard ${shard}`)
    }
    return items
  })
  for (const name of promptNames) {
    if (!/^[0-9a-f]{32}\.json$/.test(name)) throw new Error(`Unexpected prompt history path ${name}`)
    const prompt = readPrompt(name.slice(0, -5))
    for (const id of prompt.previousPromptIds) {
      if (!existsSync(promptFile(id))) throw new Error(`Missing previous prompt ${id}`)
    }
    for (const id of prompt.todoIds) {
      const item = records.find(record => record.id === id)
      if (!item || ![...item.promptIds, ...item.clarificationPromptIds].includes(prompt.id)) {
        throw new Error(`TODO ${id} does not reference prompt ${prompt.id}`)
      }
    }
  }
  validateTodos(records)
  return records.length
}

function run([command, ...args]) {
  switch (command) {
    case 'id': return idFor(args[0])
    case 'get': {
      const [id] = args
      if (!id) throw new Error('Provide a TODO ID or legacy ID')
      const records = ID_PATTERN.test(id) ? readShard(shardFor(id)) : readTodos()
      const record = records.find(record => record.id === id || record.legacyIds?.includes(id))
      if (!record) throw new Error(`Unknown TODO ${id}`)
      return { ...record, editToken: editToken(record) }
    }
    case 'query': return findTodos(readTodos(), JSON.parse(args[0] || '{}'))
    case 'apply': return apply(JSON.parse(readFileSync(0, 'utf8')))
    case 'prompt': return readPrompt(args[0])
    case 'validate': return { records: validateRepository(allPromptNames()) }
    case 'staged': return { records: validateRepository(verifyStaged()) }
    default: throw new Error('Usage: node scripts/todo.mjs id|query|get|prompt|apply|validate|staged')
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = run(process.argv.slice(2))
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
