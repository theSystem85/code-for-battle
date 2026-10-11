import { getCatalog } from './catalog.js'
import { validateCFBL } from './validation.js'

function clean(value) {
  if (Array.isArray(value)) return value.map(clean)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['range', 'index'].includes(key)).map(([key, child]) => [key, clean(child)]))
  return value
}
export function toMachine(ast, { automationId = 'automation', identityMap = {}, name = 'Automation' } = {}) {
  identityMap = identityMap && typeof identityMap === 'object' ? identityMap : {}
  const usedIds = new Set()
  const stable = (candidate, fallback) => {
    let id = typeof candidate === 'string' && candidate.trim() && !usedIds.has(candidate) ? candidate : fallback
    let suffix = 1
    while (usedIds.has(id)) id = `${fallback}:${suffix++}`
    usedIds.add(id)
    return id
  }
  const ids = ast.states.map((state, index) => stable(identityMap.states?.[index], `${automationId}:state:${state.id}`))
  return { schemaVersion: 1, id: automationId, name, variant: ast.variant, scope: ast.scope, execution: ast.execution, folderId: null, initialStateId: ids[ast.initialStateId - 1], states: ast.states.map((state, index) => ({ id: ids[index], name: String(index + 1), effect: clean(state.effect), transitions: state.transitions.map((rule, rIndex) => {
    const id = stable(identityMap.transitions?.[index]?.[rIndex], `${automationId}:rule:${index + 1}:${rIndex + 1}`)
    return { ...clean(rule), id, to: ids[rule.to - 1], ...(rule.elseTo == null ? {} : { elseTo: ids[rule.elseTo - 1], elseId: stable(identityMap.elses?.[index]?.[rIndex], `${id}:else`) }) }
  }) })) }
}
export function fromLegacyMachine(machine) {
  const states = machine.states || []
  const indices = new Map(states.map((state, index) => [state.id, index + 1]))
  const catalog = getCatalog(machine.variant)
  const identityMap = { states: states.map(state => state.id), transitions: states.map(state => (state.transitions || []).map(rule => rule.id)), elses: states.map(state => (state.transitions || []).map(rule => rule.elseId || null)) }
  function normalized(node) {
    if (!node) return null
    const copy = clean(node)
    if (copy.type === 'and' || copy.type === 'or') copy.of = copy.of.map(normalized)
    else if (copy.type === 'not') copy.of = normalized(copy.of)
    else {
      const meta = copy.type === 'compare' ? catalog.fields[copy.field] : copy.type === 'check' ? catalog.checks[copy.check] : catalog.effects[copy.type]
      for (const param of meta?.params || []) if (copy[param.key] === undefined) copy[param.key] = param.default
      if (copy.type === 'compare' && copy.mode == null) copy.mode = meta?.modes[0]
    }
    return copy
  }
  const ast = { languageVersion: 1, variant: machine.variant, scope: machine.scope, execution: machine.execution, initialStateId: indices.get(machine.initialStateId), states: states.map((state, index) => ({ id: index + 1, index: index + 1, effect: normalized(state.effect), transitions: (state.transitions || []).map(rule => ({ kind: rule.kind, when: normalized(rule.when), to: indices.get(rule.to), ...(rule.elseTo == null ? {} : { elseTo: indices.get(rule.elseTo) }), ...(rule.until == null ? {} : { until: normalized(rule.until) }), ...(rule.delaySeconds == null ? {} : { delaySeconds: rule.delaySeconds }) })) })) }
  return { ast, identityMap, diagnostics: validateCFBL(ast) }
}
