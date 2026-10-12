import { getCatalog } from './catalog.js'
import { completionWaitKind } from '../../policies/policyEffects.js'

export function validateCFBL(ast) {
  const diagnostics = []
  const issue = (code, message, node = ast) => {
    const range = node?.range || { start: 0, end: 0 }
    diagnostics.push({ code, message, ...range, range })
  }
  if (!ast || !['unit', 'build', 'unitBuild', 'defence'].includes(ast.variant)) { issue('category', 'Unknown automation category.'); return diagnostics }
  const catalog = getCatalog(ast.variant)
  if (!['global', 'perUnit'].includes(ast.scope) || ['build', 'unitBuild'].includes(ast.variant) && ast.scope !== 'global') issue('scope', 'Production automation requires global scope.')
  if (!['continuous', 'oneTime'].includes(ast.execution)) issue('execution', 'Unknown execution mode.')
  const states = ast.states || []
  if (states.length < 1 || states.length > 7) issue('state_count', 'Use between one and seven states.')
  if (!states.some(state => state.id === ast.initialStateId)) issue('state_reference', 'The start state does not exist.')
  function params(node, meta, reserved) {
    if (!meta) { issue('catalog_terminal', 'Unknown or unavailable catalog terminal.', node); return }
    for (const key of Object.keys(node)) if (!reserved.includes(key) && !meta.params.some(param => param.key === key)) issue('parameter', `Unknown parameter ${key}.`, node)
    for (const param of meta.params) {
      const value = node[param.key] ?? param.default
      if (param.options ? !param.options.some(option => option.value === value) : !Number.isFinite(value) || value < param.min || value > param.max || param.integer && !Number.isInteger(value)) issue('parameter_domain', `Invalid ${param.key} value.`, node)
    }
  }
  function condition(node, depth = 0) {
    if (!node || typeof node !== 'object') { issue('condition', 'Missing condition.'); return }
    if (['and', 'or', 'not'].includes(node.type)) {
      if (depth >= 4) issue('condition_depth', 'Conditions allow four combinator edges.', node)
      const children = node.type === 'not' ? [node.of] : node.of
      if (!Array.isArray(children) || !children.length) { issue('condition', 'Empty boolean group.', node); return }
      children.forEach(child => condition(child, depth + 1))
    } else if (node.type === 'compare') {
      const meta = catalog.fields[node.field]
      params(node, meta, ['type', 'field', 'mode', 'op', 'value', 'range'])
      if (!meta) return
      const mode = node.mode || meta.modes[0]
      if (!meta.modes.includes(mode)) issue('comparison_mode', 'Unavailable comparison mode.', node)
      const range = mode === 'relative' ? meta.range : meta.absRange
      if (!['==', '<=', '>=', '<', '>'].includes(node.op) || !Number.isFinite(node.value) || range && (node.value < range[0] || node.value > range[1])) issue('comparison_domain', 'Invalid comparison operator or value.', node)
    } else if (node.type === 'check') params(node, catalog.checks[node.check], ['type', 'check', 'range'])
    else if (!['always', ...(['unit', 'defence'].includes(ast.variant) ? ['enemyInRange', 'underFire'] : [])].includes(node.type)) issue('condition', 'Unknown or unavailable condition.', node)
  }
  states.forEach((state, index) => {
    if (state.id !== index + 1) issue('state_index', 'States must be declared in contiguous index order 1 through n.', state)
    if (state.effect) {
      params(state.effect, catalog.effects[state.effect.type], ['type', 'range', 'waitForCompletion'])
      if (state.effect.waitForCompletion !== undefined && typeof state.effect.waitForCompletion !== 'boolean') issue('completion_wait', 'Completion wait must be a boolean.', state)
      if (state.effect.waitForCompletion === true && !completionWaitKind(state.effect.type, ast.variant)) issue('completion_wait', 'This action has no finite completion objective.', state)
    }
    for (const rule of state.transitions || []) {
      if (!['if', 'while', 'after'].includes(rule.kind)) issue('rule', 'Unknown rule kind.', rule)
      if (!states.some(item => item.id === rule.to)) issue('state_reference', 'Rule target does not exist.', rule)
      if (rule.elseTo != null && (rule.kind !== 'if' || !states.some(item => item.id === rule.elseTo))) issue('else_target', 'ELSE requires an IF and an existing target.', rule)
      condition(rule.when)
      if (rule.until) { if (rule.kind !== 'while') issue('until', 'UNTIL requires WHILE.', rule); condition(rule.until) }
      if (rule.kind === 'after' && (!Number.isInteger(rule.delaySeconds) || rule.delaySeconds < 1 || rule.delaySeconds > 3600)) issue('delay', 'Delay must be an integer from 1 to 3600 seconds.', rule)
      if (rule.kind !== 'after' && rule.delaySeconds != null) issue('delay', 'Only AFTER has a delay.', rule)
    }
  })
  return diagnostics
}
