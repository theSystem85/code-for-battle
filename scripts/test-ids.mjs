#!/usr/bin/env node
// Test IDs: every unit/integration test declaration carries [U00001]-style IDs,
// every Playwright e2e test [E00001]-style IDs, at the start of its title:
//   it('[U00042] clears track marks on restart', ...)
//   test('[E00007] skirmish loads', async ({ page }) => ...)
//
// npm run test:ids            check: fail on missing, malformed, duplicate or wrong-prefix IDs
// npm run test:ids:assign     give every declaration without an ID the next free ID
// npm run test:ids:list -- [paths or substrings...] [--json|--markdown]
//                             list IDs per file (for PR test plan tables)
//
// IDs belong to the source declaration. A test declared inside a loop or with
// .each shares one ID across its generated cases. IDs are never reused or
// renumbered; deleting a test retires its ID.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const TEST_ROOTS = ['tests/unit', 'tests/integration', 'tests/e2e']
const TEST_FILE = /\.(test|spec)\.(m?js|ts)$/
const ID_AT_START = /^\[([UE])(\d{5})\] /
const ANY_ID = /\[([UE])\d+\]/
const MODIFIERS = new Set(['only', 'skip', 'todo', 'fails', 'concurrent', 'sequential', 'fixme', 'fail', 'slow'])
const CALL_MODIFIERS = new Set(['each', 'for', 'skipIf', 'runIf'])

export function prefixForFile(file) {
  return file.split(/[\\/]/).includes('e2e') ? 'E' : 'U'
}

export function formatId(prefix, number) {
  return `${prefix}${String(number).padStart(5, '0')}`
}

const isIdentChar = ch => /[A-Za-z0-9_$]/.test(ch)

// Minimal JS lexer: finds it(...)/test(...) declarations whose first argument
// is a string or template literal. Skips comments, strings, templates and
// regex literals so parentheses inside them never confuse the scan.
export function findTestDeclarations(source) {
  const found = []
  let i = 0
  const n = source.length
  let lastSignificant = ''

  function skipString(pos) {
    const quote = source[pos]
    let j = pos + 1
    while (j < n) {
      const ch = source[j]
      if (ch === '\\') { j += 2; continue }
      if (ch === quote) return j + 1
      if (quote === '`' && ch === '$' && source[j + 1] === '{') { j = skipBalanced(j + 1, '{', '}'); continue }
      if (ch === '\n' && quote !== '`') return j
      j++
    }
    return j
  }

  function skipRegex(pos) {
    let j = pos + 1
    let inClass = false
    while (j < n) {
      const ch = source[j]
      if (ch === '\\') { j += 2; continue }
      if (ch === '[') inClass = true
      else if (ch === ']') inClass = false
      else if (ch === '/' && !inClass) { j++; break }
      else if (ch === '\n') break
      j++
    }
    while (j < n && /[a-z]/i.test(source[j])) j++
    return j
  }

  function skipTrivia(pos) {
    let j = pos
    while (j < n) {
      if (/\s/.test(source[j])) { j++; continue }
      if (source.startsWith('//', j)) { const end = source.indexOf('\n', j); j = end < 0 ? n : end + 1; continue }
      if (source.startsWith('/*', j)) { const end = source.indexOf('*/', j + 2); j = end < 0 ? n : end + 2; continue }
      break
    }
    return j
  }

  // pos points at the opening bracket; returns index after the matching close.
  function skipBalanced(pos, open, close) {
    let depth = 0
    let j = pos
    let prev = ''
    while (j < n) {
      const ch = source[j]
      if (ch === '"' || ch === '\'' || ch === '`') { j = skipString(j); prev = 'a'; continue }
      if (source.startsWith('//', j) || source.startsWith('/*', j)) { j = skipTrivia(j); continue }
      if (ch === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) { j = skipRegex(j); prev = 'a'; continue }
      if (ch === open) depth++
      else if (ch === close) { depth--; if (depth === 0) return j + 1 }
      if (!/\s/.test(ch)) prev = ch
      j++
    }
    return j
  }

  while (i < n) {
    const ch = source[i]
    if (ch === '"' || ch === '\'' || ch === '`') { i = skipString(i); lastSignificant = 'a'; continue }
    if (source.startsWith('//', i) || source.startsWith('/*', i)) { i = skipTrivia(i); continue }
    if (ch === '/') {
      if (lastSignificant === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSignificant) || /\b(return|typeof|case|in|of)$/.test(source.slice(Math.max(0, i - 8), i).trimEnd())) {
        i = skipRegex(i); lastSignificant = 'a'; continue
      }
    }
    if ((ch === 'i' || ch === 't') && !isIdentChar(source[i - 1] || '') && source[i - 1] !== '.') {
      const word = source.startsWith('it', i) && !isIdentChar(source[i + 2] || '') ? 'it'
        : source.startsWith('test', i) && !isIdentChar(source[i + 4] || '') ? 'test' : null
      if (word) {
        let j = i + word.length
        let ok = true
        for (;;) {
          const k = skipTrivia(j)
          if (source[k] !== '.') { j = k; break }
          const m = /^[A-Za-z_$][\w$]*/.exec(source.slice(skipTrivia(k + 1), skipTrivia(k + 1) + 40))
          if (!m) { ok = false; break }
          const name = m[0]
          let after = skipTrivia(k + 1) + name.length
          if (CALL_MODIFIERS.has(name)) {
            const p = skipTrivia(after)
            if (source[p] !== '(') { ok = false; break }
            after = skipBalanced(p, '(', ')')
            // `.each(...)` is followed by the actual call; `skipIf(x)` too.
          } else if (!MODIFIERS.has(name)) { ok = false; break }
          j = after
        }
        if (ok && source[j] === '(') {
          const argStart = skipTrivia(j + 1)
          const q = source[argStart]
          if (q === '\'' || q === '"' || q === '`') {
            const end = skipString(argStart)
            found.push({ index: argStart + 1, quote: q, title: source.slice(argStart + 1, end - 1), line: source.slice(0, argStart).split('\n').length })
          }
        }
        i += word.length
        lastSignificant = 'a'
        continue
      }
    }
    if (!/\s/.test(ch)) lastSignificant = ch
    i++
  }
  return found
}

export function listTestFiles(root = ROOT, roots = TEST_ROOTS) {
  const files = []
  const walk = dir => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full) } else if (TEST_FILE.test(entry.name)) files.push(full)
    }
  }
  for (const r of roots) walk(join(root, r))
  return files.map(f => relative(root, f).split(sep).join('/')).sort()
}

export function scan(root = ROOT, files = listTestFiles(root)) {
  return files.map(file => {
    const source = readFileSync(join(root, file), 'utf8')
    const prefix = prefixForFile(file)
    const tests = findTestDeclarations(source).map(decl => {
      const match = ID_AT_START.exec(decl.title)
      return { ...decl, id: match ? `${match[1]}${match[2]}` : null, idPrefix: match ? match[1] : null }
    })
    return { file, prefix, source, tests }
  })
}

export function checkIds(scanned) {
  const problems = []
  const seen = new Map()
  for (const { file, prefix, tests } of scanned) {
    for (const t of tests) {
      const where = `${file}:${t.line}`
      if (!t.id) {
        problems.push(ANY_ID.test(t.title) ? `${where} malformed or misplaced test ID in "${t.title}"` : `${where} missing test ID in "${t.title}"`)
        continue
      }
      if (t.idPrefix !== prefix) problems.push(`${where} ${t.id} should use the ${prefix} prefix in this folder`)
      if (seen.has(t.id)) problems.push(`${where} duplicate ${t.id} (first used at ${seen.get(t.id)})`)
      else seen.set(t.id, where)
    }
  }
  return problems
}

export function assignIds(scanned) {
  const max = { U: 0, E: 0 }
  for (const { tests } of scanned) for (const t of tests) if (t.id) max[t.idPrefix] = Math.max(max[t.idPrefix], Number(t.id.slice(1)))
  const used = new Set(scanned.flatMap(s => s.tests.map(t => t.id).filter(Boolean)))
  const changes = []
  const seen = new Set()
  for (const entry of scanned) {
    const edits = []
    for (const t of entry.tests) {
      // Duplicates keep the first occurrence and get a fresh ID for the rest.
      const duplicate = t.id && seen.has(t.id)
      if (t.id && !duplicate && t.idPrefix === entry.prefix) { seen.add(t.id); continue }
      let next
      do { next = formatId(entry.prefix, ++max[entry.prefix]) } while (used.has(next))
      used.add(next)
      seen.add(next)
      const strip = t.id ? t.title.length - t.title.replace(ID_AT_START, '').length : 0
      edits.push({ index: t.index, remove: strip, insert: `[${next}] ` })
    }
    if (!edits.length) continue
    let source = entry.source
    for (const e of edits.sort((a, b) => b.index - a.index)) {
      source = source.slice(0, e.index) + e.insert + source.slice(e.index + e.remove)
    }
    changes.push({ file: entry.file, source, count: edits.length })
  }
  return changes
}

function main(argv) {
  const [command = 'check', ...rest] = argv
  const scanned = scan()
  if (command === 'check') {
    const problems = checkIds(scanned)
    const total = scanned.reduce((sum, s) => sum + s.tests.length, 0)
    if (problems.length) {
      console.error(problems.join('\n'))
      console.error(`\ntest-ids: ${problems.length} problem(s) in ${total} test declarations. Run \`npm run test:ids:assign\` to add missing IDs.`)
      return 1
    }
    console.log(`test-ids: ${total} test declarations, all IDs present and unique.`)
    return 0
  }
  if (command === 'assign') {
    const changes = assignIds(scanned)
    for (const c of changes) writeFileSync(join(ROOT, c.file), c.source)
    console.log(`test-ids: assigned ${changes.reduce((s, c) => s + c.count, 0)} ID(s) in ${changes.length} file(s).`)
    return 0
  }
  if (command === 'list') {
    const format = rest.includes('--json') ? 'json' : rest.includes('--markdown') ? 'markdown' : 'text'
    const filters = rest.filter(arg => !arg.startsWith('--'))
    const rows = scanned
      .filter(s => !filters.length || filters.some(f => s.file.includes(f)))
      .map(s => ({ file: s.file, ids: s.tests.map(t => t.id).filter(Boolean), tests: s.tests.map(t => ({ id: t.id, title: t.title.replace(ID_AT_START, ''), line: t.line })) }))
    if (format === 'json') console.log(JSON.stringify(rows, null, 2))
    else if (format === 'markdown') {
      console.log('| File | Unit | E2E |\n|---|---|---|')
      for (const r of rows) {
        const unit = r.ids.filter(id => id.startsWith('U'))
        const e2e = r.ids.filter(id => id.startsWith('E'))
        console.log(`| \`${r.file}\` | ${unit.length}${unit.length ? `: ${unit.join(', ')}` : ''} | ${e2e.length}${e2e.length ? `: ${e2e.join(', ')}` : ''} |`)
      }
    } else for (const r of rows) console.log(`${r.file} (${r.ids.length}): ${r.ids.join(', ')}`)
    return 0
  }
  console.error(`Unknown command "${command}". Use check, assign or list.`)
  return 2
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
