import { SHARDS, parseRecords, validateRecord, shardFor } from './schema.js'

const branchUrl = 'https://api.github.com/repos/theSystem85/code-for-battle/git/ref/heads/dev'
const rawUrl = 'https://raw.githubusercontent.com/theSystem85/code-for-battle'

async function request(url, cache, format = 'text') {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(url, { cache, credentials: 'omit', signal: controller.signal })
    if (!response.ok) throw new Error(`TODO request failed (${response.status})`)
    return await response[format]()
  } finally {
    clearTimeout(timeout)
  }
}

function decode(raw, shard) {
  return parseRecords(raw).map(record => {
    validateRecord(record)
    if (shard !== undefined && shardFor(record.id) !== shard) throw new Error('TODO record in the wrong shard')
    const { promptIds: _prompt, clarificationPromptIds: _clarification, ...view } = record
    return view
  })
}

function snapshot(records, commit) {
  if (new Set(records.map(record => record.id)).size !== records.length) throw new Error('Duplicate TODO IDs')
  return { commit, records }
}

export async function loadTodos(previous, { local = import.meta.env.DEV } = {}) {
  if (local) {
    return snapshot(decode(await request('/_dev/todos', 'no-store')), null)
  }
  const ref = await request(branchUrl, 'no-cache', 'json')
  const commit = ref.object?.sha
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) throw new Error('Invalid dev revision')
  if (commit === previous?.commit) return previous
  const shards = await Promise.all(SHARDS.map(async shard => {
    const raw = await request(`${rawUrl}/${commit}/TODO/records/${shard}.jsonl`, 'force-cache')
    return decode(raw, shard)
  }))
  return snapshot(shards.flat(), commit)
}
