import { CFBLParser, parseCFBL } from './parser.js'
import { getCatalog } from './catalog.js'
import { lexCFBL } from './lexer.js'
import { decimal } from './printer.js'

/** Fuzzy subsequence ranking shared by all contextual flyouts. */
export function fuzzyOptions(options, query = '') {
  const needle = query.toLowerCase()
  return options.map(option => {
    const text = `${option.value} ${option.label || ''}`.toLowerCase()
    let position = 0
    let score = 0
    for (const char of needle) { const at = text.indexOf(char, position); if (at < 0) return null; score += at - position; position = at + 1 }
    return { option, score }
  }).filter(Boolean).sort((a, b) => a.score - b.score || a.option.value.localeCompare(b.option.value)).map(item => item.option)
}
function defaultCall(name, meta) {
  return `${name}(${meta.params.map(param => `${param.key}=${typeof param.default === 'number' ? decimal(param.default) : param.default}`).join(',')})`
}
function atomEnd(source, start, end) {
  let depth = 0
  let position = end
  if (source[position] === '(') {
    do { const char = source[position++]; if (char === '(') depth++; if (char === ')') depth-- } while (depth > 0 && position < source.length)
  }
  const comparison = /^\.(relative|absolute)\s*(==|<=|>=|<|>)\s*-?\d+(?:\.\d+)?/.exec(source.slice(position))
  if (comparison) position += comparison[0].length
  return position > start ? position : end
}
export function completionContext(source, selection = source.length) {
  const cursor = typeof selection === 'number' ? selection : selection.start ?? selection.selectionStart ?? source.length
  const selectionEnd = typeof selection === 'number' ? cursor : selection.end ?? selection.selectionEnd ?? cursor
  const token = /[A-Za-z0-9_-]+$/.exec(source.slice(0, cursor))
  const numericToken = lexCFBL(source).tokens.find(item => item.type === 'number' && item.start <= cursor && item.end >= selectionEnd)
  const start = numericToken ? numericToken.start : token ? cursor - token[0].length : cursor
  const suffix = /^[A-Za-z0-9_-]*/.exec(source.slice(selectionEnd))[0]
  let end = numericToken ? numericToken.end : selectionEnd + suffix.length
  const parser = new CFBLParser(source.slice(0, start))
  let expected = null
  try { parser.parse() } catch (error) { expected = error }
  const catalog = getCatalog(parser.variant)
  const complete = parseCFBL(source).ast
  if (['effects', 'condition'].includes(expected?.slot)) end = atomEnd(source, start, end)
  const existingWait = expected?.slot === 'action-end' ? /^wait\s+until\s+(?:produced|done)/.exec(source.slice(start)) : null
  if (existingWait) end = start + existingWait[0].length
  let options = (expected?.options || []).map(value => {
    const meta = catalog.fields[value] || catalog.checks[value] || catalog.effects[value]
    let insertText = value
    if (expected?.slot === 'action-end' && value === 'wait') insertText = ` wait until ${parser.actionWaitKind}`
    if (meta && ['effects', 'condition'].includes(expected?.slot)) {
      insertText = defaultCall(value, meta)
      if (catalog.fields[value]) {
        const mode = meta.modes[0]
        const bounds = mode === 'relative' ? meta.range : meta.absRange
        insertText += `.${mode} < ${decimal(Math.max(bounds[0], Math.min(bounds[1], 0)))}`
      }
    }
    return { value, label: meta?.label || value, insertText, description: meta?.label || value }
  })
  // On an accepted document, offer atomic complete edits, never a half-written call.
  if (complete) {
    if (existingWait) options.push({ value: 'no-wait', label: 'Do not wait for completion', insertText: '', description: 'Advance using the normal rules after issuing the action.' })
    if (expected?.slot === 'rule' && !token) {
      const state = complete.states.find(item => item.range.start <= start && item.range.end >= start)
      if (state) options = ['if', 'while', 'after'].map(kind => ({ value: kind, label: `Add ${kind.toUpperCase()} rule`, insertText: `${kind === 'after' ? 'after 10s if' : kind} (always) goto ${state.id};\n    ` }))
    }
    if (expected?.slot === 'state' && !token && complete.states.length < 7) options = [{ value: 'state', label: 'Add state', insertText: `state ${complete.states.length + 1} {\n    do wait;\n  }\n` }]
    options = options.filter(option => parseCFBL(source.slice(0, start) + option.insertText + source.slice(end)).diagnostics.length === 0)
  }
  let numericDomain = expected?.numericDomain
  if (complete && expected?.slot === 'state-index') numericDomain = undefined
  if (complete && expected?.slot === 'state-reference') numericDomain = { ...numericDomain, max: complete.states.length }
  const query = complete ? '' : token?.[0] || ''
  return { slot: expected?.slot || 'complete', legalOptions: fuzzyOptions(options, query), numericDomain, edits: { start, end }, query, variant: parser.variant }
}
