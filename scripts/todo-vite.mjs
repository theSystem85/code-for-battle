import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SHARDS, parseRecords } from '../src/todo/schema.js'

const readShard = (root, shard) => readFileSync(resolve(root, 'TODO/records', `${shard}.jsonl`), 'utf8')

export function todoBuildRevisions(root, enabled) {
  if (!enabled) return {}
  return Object.fromEntries(SHARDS.flatMap(shard => parseRecords(readShard(root, shard)))
    .filter(todo => todo.revision > 0 && todo.verificationStatus !== 'NOT_APPLICABLE')
    .map(todo => [todo.id, todo.revision]))
}

export function todoDevPlugin(root) {
  return {
    name: 'cfb-local-todos',
    configureServer(server) {
      server.middlewares.use('/_dev/todos', (_request, response) => {
        try {
          const backlog = SHARDS.map(shard => readShard(root, shard)).join('')
          response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(backlog)
        } catch {
          response.statusCode = 503
          response.end('TODO data unavailable')
        }
      })
    }
  }
}
