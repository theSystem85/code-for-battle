import { getCatalog } from './catalog.js'

/** Expand JavaScript exponent notation without changing its finite value. */
export function decimal(value) {
  const text = String(value)
  if (!/[eE]/.test(text)) return text
  const [mantissa, exponent] = text.toLowerCase().split('e')
  const negative = mantissa.startsWith('-')
  const unsigned = negative ? mantissa.slice(1) : mantissa
  const [whole, fraction = ''] = unsigned.split('.')
  const digits = whole + fraction
  const position = whole.length + Number(exponent)
  const expanded = position <= 0 ? `0.${'0'.repeat(-position)}${digits}` : position >= digits.length ? digits + '0'.repeat(position - digits.length) : `${digits.slice(0, position)}.${digits.slice(position)}`
  return (negative ? '-' : '') + expanded
}
export function printCFBL(ast) {
  const catalog = getCatalog(ast.variant)
  const call = (name, node, meta) => `${name}(${(meta?.params || []).map(param => `${param.key}=${typeof (node[param.key] ?? param.default) === 'number' ? decimal(node[param.key] ?? param.default) : node[param.key] ?? param.default}`).join(',')})`
  function condition(node) {
    if (node.type === 'not') return `not (${condition(node.of)})`
    if (node.type === 'and' || node.type === 'or') return `(${node.of.map(condition).join(` ${node.type} `)})`
    if (node.type === 'check') return call(node.check, node, catalog.checks[node.check])
    if (node.type === 'compare') { const meta = catalog.fields[node.field]; return `${call(node.field, node, meta)}.${node.mode || meta.modes[0]} ${node.op} ${decimal(node.value)}` }
    return node.type
  }
  const category = ast.variant === 'unit' ? 'control unit' : ast.variant === 'defence' ? 'control defence-building' : ast.variant === 'unitBuild' ? 'build unit' : 'build building'
  const lines = [`${category} {`, `  scope ${ast.scope === 'perUnit' ? 'individual' : 'global'};`, `  run ${ast.execution === 'oneTime' ? 'once' : 'continuous'};`, `  start ${ast.initialStateId};`]
  for (const state of ast.states) {
    lines.push(`  state ${state.id} {`, `    do ${state.effect ? call(state.effect.type, state.effect, catalog.effects[state.effect.type]) : 'wait'};`)
    for (const rule of state.transitions || []) {
      const head = rule.kind === 'after' ? `after ${decimal(rule.delaySeconds)}s if` : rule.kind
      lines.push(`    ${head} (${condition(rule.when)})${rule.until ? ` until (${condition(rule.until)})` : ''} goto ${rule.to};`)
      if (rule.elseTo != null) lines.push(`    else goto ${rule.elseTo};`)
    }
    lines.push('  }')
  }
  lines.push('}')
  return lines.join('\n')
}
