// Reconcile invisible identities for accepted text structural edits. Exact unchanged
// constructs retain identity across insertions/reordering; ordinary field edits
// retain the positional identity only when no structural insertion occurred.
const signature = node => JSON.stringify(node, (key, value) =>
  ['id', 'index', 'to', 'elseTo', 'initialStateId', 'range'].includes(key) ? undefined : value)

function correspond(previous, next) {
  const unused = new Set(previous.map((_, index) => index))
  const result = next.map(node => {
    const fingerprint = signature(node)
    for (const index of unused) {
      if (signature(previous[index]) === fingerprint) { unused.delete(index); return index }
    }
    return -1
  })
  if (previous.length === next.length) result.forEach((index, slot) => {
    if (index === -1 && unused.has(slot)) { result[slot] = slot; unused.delete(slot) }
  })
  return result
}

export function reconcileAutomationIdentity(previous, next, identityMap, automationId, revision) {
  const states = correspond(previous.states, next.states)
  const result = { states: [], transitions: [], elses: [] }
  next.states.forEach((state, slot) => {
    const oldSlot = states[slot]
    const stateId = oldSlot < 0 ? `${automationId}:state:edit:${revision}:${slot + 1}` : identityMap.states[oldSlot]
    result.states.push(stateId)
    const oldRules = oldSlot < 0 ? [] : previous.states[oldSlot].transitions
    const rules = correspond(oldRules, state.transitions)
    result.transitions.push(rules.map((index, ruleSlot) => index < 0
      ? `${stateId}:rule:edit:${revision}:${ruleSlot + 1}` : identityMap.transitions[oldSlot][index]))
    result.elses.push(rules.map((index, ruleSlot) => state.transitions[ruleSlot].elseTo == null ? null :
      index < 0 ? `${result.transitions[slot][ruleSlot]}:else` : identityMap.elses?.[oldSlot]?.[index] || `${result.transitions[slot][ruleSlot]}:else`))
  })
  return result
}
