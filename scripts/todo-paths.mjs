import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const oid = /^[0-9a-f]{40}$/
export const recordPath = /^TODO\/records\/[0-7]\.jsonl$/
export const promptPath = /^prompt-history\/todo\/[0-9a-f]{32}\.json$/
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

export function todoPathsOnly(diff) {
  if (!diff.endsWith('\0')) return false
  const parts = diff.slice(0, -1).split('\0')
  if (parts.length < 2 || parts.length % 2) return false
  for (let i = 0; i < parts.length; i += 2) {
    const [status, path] = parts.slice(i, i + 2)
    if (status === 'A' && promptPath.test(path)) continue
    if (status === 'M' && recordPath.test(path)) continue
    return false
  }
  return true
}

export function todoRangeOnly(base, head, cwd) {
  if (!oid.test(base || '') || !oid.test(head || '') || base === head) return false
  try {
    git(['merge-base', '--is-ancestor', base, head], cwd)
    const commits = git(['rev-list', '--parents', `${base}..${head}`], cwd).trim().split('\n')
    return commits.every(line => {
      const [commit, parent, mergeParent] = line.split(' ')
      return parent && !mergeParent && todoPathsOnly(
        git(['diff', '--name-status', '--no-renames', '-z', parent, commit, '--'], cwd))
    })
  } catch {
    return false
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [base, head] = process.argv.slice(2)
  process.exitCode = todoRangeOnly(base, head) ? 0 : 1
}
