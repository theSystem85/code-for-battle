// Private source-backed draft shared by DAV and ATV. Queries and DOM never enter it.
import { parseCFBL, printCFBL, fromLegacyMachine, toMachine } from './cfbl/index.js'
import { reconcileAutomationIdentity } from './automationIdentity.js'
import { getPolicyEntry, saveAutomationSource, canCommandPolicy } from '../policies/policyStore.js'

const copy = value => JSON.parse(JSON.stringify(value))
const VIEW_KEY = 'cfb-automation-editor-view'
function preferredView() {
  try { return globalThis.localStorage?.getItem(VIEW_KEY) === 'atv' ? 'atv' : 'dav' }
  catch { return 'dav' }
}

export function createAutomationDraft(actorId, policyOrId) {
  const entry = getPolicyEntry(typeof policyOrId === 'string' ? policyOrId : policyOrId.id)
  if (entry && !canCommandPolicy(actorId, entry.ownerId)) throw new Error('Only the automation owner can edit it.')
  const original = typeof policyOrId === 'string' ? entry?.policy : policyOrId
  if (!original) throw new Error('Automation not found.')
  const converted = fromLegacyMachine(original)
  if (converted.diagnostics.length) throw new Error(converted.diagnostics.map(error => error.message).join(' '))
  let state = {
    automationId: original.id, name: original.name, baseRevision: entry?.revision || entry?.behaviorRevision || 0,
    draftRevision: 0, source: printCFBL(converted.ast), astProjection: converted.ast,
    identityMap: converted.identityMap, policy: copy(original), diagnostics: [], viewPreference: preferredView()
  }
  let closed = false
  const listeners = new Set()
  const undoHistory = []
  const redoHistory = []
  function snapshot() { return { ...copy(state), canUndo: undoHistory.length > 0, canRedo: redoHistory.length > 0 } }
  function publish() { for (const listener of listeners) listener(snapshot()) }
  function reject(errors) { return { ok: false, reason: 'invalid', errors } }
  function accept(source, identityMap = state.identityMap, name = state.name) {
    if (closed) return { ok: false, reason: 'closed' }
    const parsed = parseCFBL(source, { languageVersion: 1 })
    if (parsed.diagnostics.length || !parsed.ast) return reject(parsed.diagnostics)
    if (entry && parsed.ast.variant !== entry.policy.variant) return reject([{ message: 'The category of a saved automation cannot change. Create a new automation.' }])
    const canonical = printCFBL(parsed.ast)
    const policy = toMachine(parsed.ast, { automationId: state.automationId, identityMap, name })
    const converted = fromLegacyMachine(policy)
    if (converted.diagnostics.length) return reject(converted.diagnostics)
    if (canonical === state.source && name === state.name) return { ok: true }
    undoHistory.push(copy(state))
    redoHistory.length = 0
    state = { ...state, source: canonical, name, policy, astProjection: parsed.ast,
      identityMap: converted.identityMap, draftRevision: state.draftRevision + 1, diagnostics: [] }
    publish()
    return { ok: true }
  }
  function history(from, to) {
    if (closed || !from.length) return { ok: false, reason: closed ? 'closed' : 'empty-history' }
    const revision = state.draftRevision + 1
    to.push(copy(state))
    const viewPreference = state.viewPreference
    state = { ...from.pop(), draftRevision: revision, viewPreference }
    publish()
    return { ok: true }
  }
  return {
    getSnapshot: snapshot,
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener) },
    setSource(source) {
      const parsed = parseCFBL(source, { languageVersion: 1 })
      if (!parsed.ast || parsed.diagnostics.length) return reject(parsed.diagnostics)
      return accept(source, reconcileAutomationIdentity(state.astProjection, parsed.ast, state.identityMap, state.automationId, state.draftRevision + 1))
    },
    transact(operation) {
      if (closed) return { ok: false, reason: 'closed' }
      let policy = copy(state.policy)
      try {
        if (typeof operation === 'function') policy = operation(policy) || policy
        else {
          const target = policy.states.find(item => item.id === operation.stateId)
          const rule = target?.transitions.find(item => item.id === operation.ruleId)
          switch (operation.type) {
            case 'setName': policy.name = operation.value; break
            case 'replaceMachine': policy = copy(operation.policy); break
            case 'setEffect': if (!target) throw new Error('State missing.'); target.effect = copy(operation.effect); break
            case 'setCondition': if (!rule) throw new Error('Rule missing.'); rule.when = copy(operation.condition); break
            case 'setElseTarget': if (!rule || rule.kind !== 'if') throw new Error('ELSE requires an IF rule.')
              if (operation.targetId == null) delete rule.elseTo
              else rule.elseTo = operation.targetId
              break
            case 'insertState': policy.states.splice(operation.index ?? policy.states.length, 0, copy(operation.state)); break
            default: throw new Error('Unknown automation operation.')
          }
        }
        const converted = fromLegacyMachine(policy)
        if (converted.diagnostics.length) return reject(converted.diagnostics)
        return accept(printCFBL(converted.ast), converted.identityMap, policy.name)
      } catch (error) { return reject([{ message: error.message }]) }
    },
    setView(view) {
      if (closed || !['dav', 'atv'].includes(view)) return { ok: false, reason: 'invalid-view' }
      state.viewPreference = view
      try { globalThis.localStorage?.setItem(VIEW_KEY, view) } catch { /* Preference is optional. */ }
      publish()
      return { ok: true }
    },
    undo() { return history(undoHistory, redoHistory) },
    redo() { return history(redoHistory, undoHistory) },
    save() {
      if (closed) return { ok: false, reason: 'closed' }
      const result = saveAutomationSource(actorId, { id: state.automationId, name: state.name,
        source: state.source, identityMap: state.identityMap, baseRevision: state.baseRevision })
      if (result.ok) { state.baseRevision = result.revision; publish() }
      return result
    },
    cancel() { closed = true; listeners.clear(); undoHistory.length = 0; redoHistory.length = 0 }
  }
}
