// Unit policy store: documents, global enablement and per-unit bindings.
//
// Policy documents stay pure data. Ownership, enablement and per-unit apply are
// separate records so a mid-battle switch never rewrites the script. Only the
// commanding owner can enable, disable or apply a policy. The owner is a human
// player or an AI faction commanding its own units.

import { validatePolicy } from './policySchema.js'
import { compilePolicyProgram } from './policyCompiler.js'
import { reconcileAutomationIdentity } from '../automation/automationIdentity.js'
import { createPolicyRuntime } from './policyStep.js'
import { parseCFBL, printCFBL, toMachine, fromLegacyMachine } from '../automation/cfbl/index.js'

const LEGACY_STORAGE_KEY = 'cfb-unit-policies-v1'
const STORAGE_KEY = 'cfb-automations-v2'
let recovery = []
const boundEntities = new Set()
const mutationListeners = new Set()
let restoring = false
let authoringAllowed = () => true
export function setAutomationAuthoringGuard(guard) { authoringAllowed = guard }
const receivedSequences = new Map()
let receivedBindingSequence = null
const runtimeProviders = new Map()
const compiledPrograms = new Map()
const DEFENCE_TYPES = new Set(['turretGunV1', 'turretGunV2', 'turretGunV3', 'rocketTurret', 'teslaCoil', 'artilleryTurret'])
function clearDefenceIntent(policyId) {
  boundEntities.forEach(entity => {
    if (entity.automationIntent?.issuerId === policyId) entity.automationIntent = null
  })
}
function freezeRecord(record) {
  if (Object.isFrozen(record)) return record
  const program = compiledPrograms.get(record.id)
  if (program?.policy.name === record.displayName) record.policy = program.policy
  else record.policy = Object.freeze({ ...record.policy, states: program?.policy.states || record.policy.states })
  const map = record.identityMap
  for (const row of [...map.transitions, ...(map.elses || [])]) Object.freeze(row)
  Object.freeze(map.states)
  Object.freeze(map.transitions)
  if (map.elses) Object.freeze(map.elses)
  Object.freeze(map)
  return Object.freeze(record)
}
export function getCompiledPolicyProgram(id) { return compiledPrograms.get(id) || null }

export function registerAutomationRuntimeProvider(id, provider) {
  runtimeProviders.set(id, provider)
  return () => runtimeProviders.delete(id)
}

let documents = new Map()
let globalEnabled = new Set()
let buildOptIn = new Set()
let unitBuildOptIn = new Set()
let sequence = 0
let version = 0
let behaviorHash = 0
export function getAutomationBehaviorHash() { return behaviorHash }
function refreshBehaviorHash() {
  const values = Array.from(documents.values()).sort((a, b) => a.id.localeCompare(b.id))
    .map(entry => [entry.id, entry.ownerId, entry.languageVersion, entry.behaviorRevision, entry.source])
  const text = JSON.stringify([values, Array.from(globalEnabled).sort(), Array.from(buildOptIn).sort(), Array.from(unitBuildOptIn).sort()])
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0
  behaviorHash = hash
}
refreshBehaviorHash()
const listeners = new Set()

export function normalizePolicyOwner(owner) {
  return owner === 'player' ? 'player1' : owner
}

/** True when `actorId` is the commanding owner named by `ownerId`. */
export function canCommandPolicy(actorId, ownerId) {
  if (!actorId || !ownerId) return false
  return normalizePolicyOwner(actorId) === normalizePolicyOwner(ownerId)
}

export function nextPolicySequence() {
  sequence += 1
  return sequence
}

export function getPolicyStoreVersion() {
  return version
}

function notify() {
  version += 1
  refreshBehaviorHash()
  persist()
  listeners.forEach(listener => {
    try {
      listener()
    } catch (err) {
      globalThis.window?.logger?.warn?.('[Policies] listener failed', err)
    }
  })
}

export function subscribePolicyStore(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function entityKind(entity) { return entity.isBuilding ? 'building' : 'unit' }
function serializedControl(control) {
  const result = clone(control || null)
  const target = control?.order?.targetRef
  if (result?.order && target?.id) result.order.targetIdentity = { id: target.id, entityKind: entityKind(target), owner: target.owner }
  return result
}

function persistedEntry(entry) {
  const { policy: _projection, ...record } = entry
  return record
}

export function exportAutomationSession(entities = []) {
  return {
    recordVersion: 2,
    records: Array.from(documents.values(), persistedEntry),
    enabled: Array.from(globalEnabled),
    buildOptIn: Array.from(buildOptIn),
    unitBuildOptIn: Array.from(unitBuildOptIn),
    sequence,
    ownerSequences: Array.from(receivedSequences),
    recovery: clone(recovery),
    productionRuntime: Object.fromEntries(Array.from(runtimeProviders, ([id, provider]) => [id, provider.export()])),
    entityBindings: entities.filter(entity => entity.policyBindings?.length || entity.policyControl || entity.automationIntent || entity.automationManualOverride)
      .map(entity => ({ id: entity.id, entityKind: entityKind(entity), kind: entity.type, owner: entity.owner,
        policyBindings: clone(entity.policyBindings || []), policyControl: serializedControl(entity.policyControl),
        policyNextEval: entity.policyNextEval || 0, automationIntent: clone(entity.automationIntent || null),
        automationManualOverride: clone(entity.automationManualOverride || null) }))
  }
}

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)) }

function persist() {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(exportAutomationSession()))
    return true
  } catch {
    recovery.push({ reason: 'storage-write-failed', message: 'Automation changes remain usable in memory. Export a backup before closing.' })
    return false
  }
}

export function getAutomationRecovery() { return clone(recovery) }
export function exportAutomationRecovery() {
  return JSON.stringify({ session: exportAutomationSession(), recovery,
    legacyBackup: storage()?.getItem(LEGACY_STORAGE_KEY) || null, automationBackup: storage()?.getItem(STORAGE_KEY) || null }, null, 2)
}

function recordFromSource(input) {
  if (input.languageVersion !== 1 || input.recordVersion !== 2) throw new Error('Unsupported automation/language version.')
  if (input.behaviorRevision != null && (!Number.isSafeInteger(input.behaviorRevision) || input.behaviorRevision < 1)) throw new Error('Invalid behavior revision.')
  if (input.revision != null && (!Number.isSafeInteger(input.revision) || input.revision < 1)) throw new Error('Invalid document revision.')
  if (typeof input.id !== 'string' || !input.id || typeof input.ownerId !== 'string' || !input.ownerId) throw new Error('Automation identity or owner is missing.')
  const parsed = parseCFBL(input.source, { languageVersion: input.languageVersion })
  if (parsed.diagnostics.length || !parsed.ast) throw new Error(parsed.diagnostics.map(item => item.message).join(' '))
  const source = printCFBL(parsed.ast)
  if (input.identityMap) {
    const map = input.identityMap
    const used = new Set()
    if (!Array.isArray(map.states) || map.states.length !== parsed.ast.states.length || !Array.isArray(map.transitions)) throw new Error('Invalid automation identity map.')
    parsed.ast.states.forEach((state, index) => {
      const ids = [map.states[index], ...(map.transitions[index] || [])]
      if (!Array.isArray(map.transitions[index]) || map.transitions[index].length !== state.transitions.length) throw new Error('Invalid automation rule identity map.')
      if (Array.isArray(map.elses?.[index])) ids.push(...map.elses[index].filter(Boolean))
      for (const id of ids) {
        if (typeof id !== 'string' || !id || used.has(id)) throw new Error('Duplicate or missing automation identity.')
        used.add(id)
      }
    })
  }
  const policy = toMachine(parsed.ast, { automationId: input.id, identityMap: input.identityMap, name: input.displayName })
  const check = validatePolicy(policy)
  if (!check.valid) throw new Error(check.errors.map(item => item.message).join(' '))
  return { recordVersion: 2, languageVersion: 1, id: input.id, ownerId: normalizePolicyOwner(input.ownerId),
    displayName: policy.name, source, behaviorRevision: Math.max(1, input.behaviorRevision || 1),
    revision: Math.max(1, input.revision || input.behaviorRevision || 1),
    identityMap: fromLegacyMachine(policy).identityMap, policy }
}

export function restoreAutomationSession(payload, entities = [], { authority = 'save' } = {}) {
  if (!payload || payload.recordVersion !== 2 || (payload.records != null && !Array.isArray(payload.records))) return { ok: false, reason: 'unsupported-version' }
  for (const key of ['enabled', 'buildOptIn', 'unitBuildOptIn', 'entityBindings', 'ownerSequences']) {
    if (payload[key] != null && !Array.isArray(payload[key])) return { ok: false, reason: 'invalid-session' }
  }
  const previousDocuments = documents
  const previousEnabled = globalEnabled
  const previousBuildOptIn = buildOptIn
  const previousUnitOptIn = unitBuildOptIn
  const nextDocuments = payload.records == null ? new Map(documents) : new Map()
  const errors = []
  for (const entry of payload.records || []) {
    try {
      const existing = documents.get(entry.id)
      const record = existing && existing.source === entry.source && existing.behaviorRevision === entry.behaviorRevision && existing.displayName === entry.displayName && existing.revision === (entry.revision || entry.behaviorRevision)
        ? existing : recordFromSource(entry)
      if (nextDocuments.has(record.id)) throw new Error('Duplicate automation ID.')
      const compiled = compiledPrograms.get(record.id)
      if (!compiled || compiled.behaviorRevision !== record.behaviorRevision || existing?.source !== record.source) {
        compiledPrograms.set(record.id, compilePolicyProgram(record.policy, { behaviorRevision: record.behaviorRevision }))
      }
      nextDocuments.set(record.id, freezeRecord(record))
    } catch (error) { errors.push({ id: entry?.id, reason: 'invalid-record', message: error.message, entry: clone(entry) }) }
  }
  if (Array.isArray(payload.recovery)) recovery = clone(payload.recovery)
  recovery.push(...errors)
  documents = nextDocuments
  for (const id of compiledPrograms.keys()) if (!documents.has(id)) compiledPrograms.delete(id)
  globalEnabled = new Set((payload.enabled || []).filter(id => documents.has(id) && documents.get(id).policy.scope === 'global'))
  buildOptIn = new Set((payload.buildOptIn || []).filter(owner => typeof owner === 'string').map(normalizePolicyOwner))
  unitBuildOptIn = new Set((payload.unitBuildOptIn || []).filter(owner => typeof owner === 'string').map(normalizePolicyOwner))
  const restoredSequence = Number.isSafeInteger(payload.sequence) && payload.sequence >= 0 ? payload.sequence : 0
  if (authority === 'host-snapshot') sequence = Math.max(sequence, restoredSequence)
  else { sequence = restoredSequence; receivedSequences.clear() }
  for (const [owner, commandSequence] of payload.ownerSequences || []) {
    if (typeof owner === 'string' && Number.isSafeInteger(commandSequence) && commandSequence >= 0) {
      const normalized = normalizePolicyOwner(owner)
      receivedSequences.set(normalized, Math.max(commandSequence, receivedSequences.get(normalized) || 0))
    }
  }
  const byId = new Map(entities.map(entity => [`${entityKind(entity)}:${entity.id}`, entity]))
  for (const saved of payload.entityBindings || []) {
    if (!saved || (saved.policyBindings != null && !Array.isArray(saved.policyBindings))) continue
    const entity = byId.get(`${saved.entityKind || 'unit'}:${saved.id}`)
    if (!entity || !canCommandPolicy(saved.owner, entity.owner)) continue
    entity.policyBindings = (saved.policyBindings || []).filter(binding => {
      const entry = documents.get(binding.policyId)
      return entry && entry.policy.variant === (entity.isBuilding ? 'defence' : 'unit') && canCommandPolicy(entity.owner, entry.ownerId) &&
        binding.behaviorRevision === entry.behaviorRevision && validRuntime(binding.runtime, entry.policy)
    }).map(clone)
    entity.policyControl = clone(saved.policyControl || null)
    const order = entity.policyControl?.order
    if (order) {
      const identity = order.targetIdentity
      const target = identity ? byId.get(`${identity.entityKind}:${identity.id}`) : null
      const compatible = target && (!identity.owner || normalizePolicyOwner(target.owner) === normalizePolicyOwner(identity.owner))
      Object.defineProperty(order, 'targetRef', { value: compatible ? target : null, enumerable: false, writable: true })
    }
    entity.automationIntent = clone(saved.automationIntent || null)
    entity.automationManualOverride = clone(saved.automationManualOverride || null)
    entity.policyNextEval = saved.policyNextEval || 0
    entity.policySyncVersion = -1
    registerAutomationEntity(entity)
  }
  if (authority !== 'host-snapshot') {
    for (const [id, snapshot] of Object.entries(payload.productionRuntime || {})) runtimeProviders.get(id)?.restore(snapshot, { authority })
  }
  const sameSet = (left, right) => left.size === right.size && Array.from(left).every(value => right.has(value))
  const changed = previousDocuments.size !== documents.size || Array.from(documents).some(([id, entry]) => previousDocuments.get(id) !== entry) ||
    !sameSet(previousEnabled, globalEnabled) || !sameSet(previousBuildOptIn, buildOptIn) || !sameSet(previousUnitOptIn, unitBuildOptIn)
  if (changed) {
    version += 1
    refreshBehaviorHash()
    listeners.forEach(listener => {
      try { listener() } catch (error) { globalThis.window?.logger?.warn?.('[Automation] snapshot listener failed', error) }
    })
  }
  return { ok: true, errors }
}

function validRuntime(runtime, policy) {
  if (!runtime || !policy.states.some(state => state.id === runtime.currentStateId)) return false
  const states = new Set(policy.states.map(state => state.id))
  const rules = new Set(policy.states.flatMap(state => state.transitions.flatMap(rule => rule.elseTo == null ? [rule.id] : [rule.id, rule.elseId || `${rule.id}:else`])))
  if (Object.keys(runtime.prev || {}).some(id => !rules.has(id))) return false
  if (Object.keys(runtime.pending || {}).some(id => !rules.has(id))) return false
  if (Object.keys(runtime.entered || {}).some(id => !states.has(id))) return false
  if (runtime.hold) {
    const source = policy.states.find(state => state.id === runtime.hold.returnStateId)
    const rule = source?.transitions.find(rule => rule.id === runtime.hold.transitionId)
    if (!rule || rule.kind !== 'while' || rule.to !== runtime.currentStateId) return false
  }
  if (typeof runtime.finished !== 'boolean' || !Number.isSafeInteger(runtime.steps) || runtime.steps < 0) return false
  if (Object.values(runtime.prev || {}).some(value => typeof value !== 'boolean')) return false
  if (Object.values(runtime.pending || {}).some(value => !Number.isFinite(value) || value < 0)) return false
  if (Object.values(runtime.entered || {}).some(value => !Number.isSafeInteger(value) || value < 0)) return false
  return true
}

export function loadPolicyStore() {
  const store = storage()
  resetPolicyStore()
  recovery = []
  if (!store) return
  try {
    const current = store.getItem(STORAGE_KEY)
    if (current) {
      const result = restoreAutomationSession(JSON.parse(current))
      if (!result.ok) throw new Error('Unsupported automation store version; export the backup to recover it.')
      return
    }
    const raw = store.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return
    const legacy = JSON.parse(raw)
    const records = []
    for (const entry of legacy.documents || []) {
      try {
        const validation = validatePolicy(entry.policy)
        if (!validation.valid) throw new Error(validation.errors.map(error => error.message).join(' '))
        const adapted = fromLegacyMachine(entry.policy)
        if (adapted.diagnostics.length) throw new Error(adapted.diagnostics.map(error => error.message).join(' '))
        records.push({ recordVersion: 2, languageVersion: 1, id: entry.policy.id,
          ownerId: entry.ownerId, displayName: entry.policy.name, behaviorRevision: 1,
          source: printCFBL(adapted.ast), identityMap: adapted.identityMap })
      } catch (error) { recovery.push({ id: entry?.policy?.id, reason: 'legacy-migration', message: error.message, entry }) }
    }
    restoreAutomationSession({ recordVersion: 2, records, enabled: legacy.enabled,
      buildOptIn: legacy.buildOptIn, unitBuildOptIn: legacy.unitBuildOptIn })
    persist() // The legacy key is deliberately retained, including quarantined records.
  } catch (error) { recovery.push({ reason: 'store-read-failed', message: error.message }) }
}

export function registerAutomationEntity(entity) {
  if (entity) boundEntities.add(entity)
  return () => boundEntities.delete(entity)
}

export function refreshAutomationBinding(binding, policy) {
  const entry = documents.get(policy.id)
  if (!entry || binding.behaviorRevision === entry.behaviorRevision) return false
  binding.runtime = createPolicyRuntime(policy)
  binding.behaviorRevision = entry.behaviorRevision
  binding.activationSeq = 0
  binding.nextReassertAt = 0
  delete binding.pausedUntilOrderSeq
  delete binding.dead
  return true
}

export function subscribeAutomationMutations(listener) {
  mutationListeners.add(listener)
  return () => mutationListeners.delete(listener)
}
function mutation(operation, actorId, payload) {
  if (restoring) return
  const commandSequence = nextPolicySequence()
  receivedSequences.set(normalizePolicyOwner(actorId), commandSequence)
  for (const listener of mutationListeners) {
    try { listener({ operation, actorId: normalizePolicyOwner(actorId), payload: clone(payload), sequence: commandSequence }) }
    catch (error) { globalThis.window?.logger?.warn?.('[Automation] command delivery failed', error) }
  }
}

export function resetPolicyStore() {
  documents = new Map()
  globalEnabled = new Set()
  buildOptIn = new Set()
  unitBuildOptIn = new Set()
  sequence = 0
  boundEntities.clear()
  compiledPrograms.clear()
  receivedSequences.clear()
  refreshBehaviorHash()
  version += 1
}

export function getPolicyEntry(policyId) {
  return documents.get(policyId) || null
}

export function getPolicyDocument(policyId) {
  const entry = documents.get(policyId)
  return entry ? entry.policy : null
}

export function listPolicies(ownerId) {
  const result = []
  documents.forEach(entry => {
    if (!ownerId || canCommandPolicy(ownerId, entry.ownerId)) result.push(entry)
  })
  return result
}

export function isPolicyEnabled(policyId) {
  return globalEnabled.has(policyId)
}

export function isBuildPolicy(policy) {
  return Boolean(policy) && policy.variant === 'build'
}

export function isUnitBuildPolicy(policy) {
  return Boolean(policy) && policy.variant === 'unitBuild'
}

/** Enabled global unit policies. Build policies never reach units. */
export function listEnabledGlobalPolicies() {
  const result = []
  globalEnabled.forEach(id => {
    const entry = documents.get(id)
    if (entry && entry.policy.scope === 'global' && entry.policy.variant === 'unit') result.push(entry)
  })
  return result
}

/** Enabled build policies of one owner, in a stable order. */
export function listEnabledBuildPolicies(ownerId) {
  const result = []
  globalEnabled.forEach(id => {
    const entry = documents.get(id)
    if (entry && isBuildPolicy(entry.policy) && canCommandPolicy(ownerId, entry.ownerId)) result.push(entry)
  })
  return result
}

export function listEnabledUnitBuildPolicies(ownerId) {
  const result = []
  globalEnabled.forEach(id => {
    const entry = documents.get(id)
    if (entry && isUnitBuildPolicy(entry.policy) && canCommandPolicy(ownerId, entry.ownerId)) result.push(entry)
  })
  return result
}

/** True when this player let build policies run on their own base. Off by default. */
export function isBuildAutomationOptedIn(ownerId) {
  return Boolean(ownerId) && buildOptIn.has(normalizePolicyOwner(ownerId))
}

/** A player opts in or out for their own base only. Nobody can switch another player's base. */
export function setBuildAutomationOptIn(actorId, enabled, ownerId = actorId) {
  if (!restoring && !authoringAllowed()) return { ok: false, reason: 'replay-locked' }
  if (!actorId || !canCommandPolicy(actorId, ownerId)) return { ok: false, reason: 'not-owner' }
  const owner = normalizePolicyOwner(ownerId)
  if (enabled) buildOptIn.add(owner)
  else buildOptIn.delete(owner)
  notify()
  mutation('buildOptIn', actorId, { enabled, ownerId })
  return { ok: true }
}

export function isUnitBuildAutomationOptedIn(ownerId) {
  return Boolean(ownerId) && unitBuildOptIn.has(normalizePolicyOwner(ownerId))
}

export function setUnitBuildAutomationOptIn(actorId, enabled, ownerId = actorId) {
  if (!restoring && !authoringAllowed()) return { ok: false, reason: 'replay-locked' }
  if (!actorId || !canCommandPolicy(actorId, ownerId)) return { ok: false, reason: 'not-owner' }
  const owner = normalizePolicyOwner(ownerId)
  if (enabled) unitBuildOptIn.add(owner)
  else unitBuildOptIn.delete(owner)
  notify()
  mutation('unitBuildOptIn', actorId, { enabled, ownerId })
  return { ok: true }
}

/** Validate and store a policy. A policy can only be replaced by its own owner. */
export function savePolicy(actorId, policy) {
  const validation = validatePolicy(policy)
  if (!validation.valid) return { ok: false, reason: 'invalid', errors: validation.errors }
  const converted = fromLegacyMachine(policy)
  if (converted.diagnostics.length) return { ok: false, reason: 'invalid', errors: converted.diagnostics }
  return saveAutomationSource(actorId, { id: policy.id, name: policy.name,
    source: printCFBL(converted.ast), identityMap: converted.identityMap })
}

export function saveAutomationSource(actorId, { id, name, source, baseRevision, identityMap, behaviorRevision, recordRevision }) {
  if (!restoring && !authoringAllowed()) return { ok: false, reason: 'replay-locked' }
  const existing = documents.get(id)
  if (!actorId || (existing && !canCommandPolicy(actorId, existing.ownerId))) return { ok: false, reason: 'not-owner', errors: [] }
  if (baseRevision != null && baseRevision !== (existing?.revision || existing?.behaviorRevision || 0)) return { ok: false, reason: 'stale-version', errors: [] }
  let record
  try {
    let map = identityMap
    if (!map && existing) {
      const parsed = parseCFBL(source)
      if (parsed.ast && !parsed.diagnostics.length) map = reconcileAutomationIdentity(parseCFBL(existing.source).ast, parsed.ast, existing.identityMap, id, existing.behaviorRevision + 1)
    }
    record = recordFromSource({ recordVersion: 2, languageVersion: 1, id,
      ownerId: actorId, displayName: name, source, identityMap: map,
      behaviorRevision: existing?.behaviorRevision || 1 })
  } catch (error) { return { ok: false, reason: 'invalid', errors: [{ message: error.message }] } }
  const changed = !existing || existing.source !== record.source || (behaviorRevision != null && behaviorRevision !== existing.behaviorRevision)
  record.revision = existing ? existing.revision + (changed || existing.displayName !== record.displayName ? 1 : 0) : 1
  if (behaviorRevision != null) {
    if (!Number.isSafeInteger(behaviorRevision) || behaviorRevision < 1 || (existing && changed && behaviorRevision <= existing.behaviorRevision)) return { ok: false, reason: 'stale-version', errors: [] }
    record.behaviorRevision = behaviorRevision
    if (Number.isSafeInteger(recordRevision) && recordRevision >= record.revision) record.revision = recordRevision
  } else if (existing && changed) record.behaviorRevision += 1
  if (existing && !changed) record.identityMap = existing.identityMap
  if (existing && !changed) record.policy = existing.policy.name === record.displayName ? existing.policy : { ...existing.policy, name: record.displayName }
  if (changed) compiledPrograms.set(id, compilePolicyProgram(record.policy, { behaviorRevision: record.behaviorRevision }))
  documents.set(id, freezeRecord(record))
  if (record.policy.scope !== 'global') globalEnabled.delete(id)
  if (changed) clearDefenceIntent(id)
  if (changed) boundEntities.forEach(entity => {
    for (const binding of entity.policyBindings || []) {
      if (binding.policyId === id) { refreshAutomationBinding(binding, record.policy); entity.policyNextEval = 0 }
    }
  })
  if (changed || existing?.displayName !== record.displayName) {
    notify()
    mutation('save', actorId, persistedEntry(record))
  }
  return { ok: true, errors: [], behaviorRevision: record.behaviorRevision, revision: record.revision, source: record.source }
}

export function applyAutomationMutation(command, entities = []) {
  if (!command || !command.actorId || !command.payload || !Number.isSafeInteger(command.sequence) || command.sequence < 1) return { ok: false, reason: 'invalid-command' }
  const owner = normalizePolicyOwner(command.actorId)
  if (command.sequence <= (receivedSequences.get(owner) || 0)) return { ok: true, duplicate: true }
  restoring = true
  receivedBindingSequence = command.payload?.bindingSequence ?? null
  try {
    const payload = command.payload
    const result = (() => {
      switch (command.operation) {
        case 'save':
          if (!canCommandPolicy(command.actorId, payload.ownerId) || payload.languageVersion !== 1) return { ok: false, reason: 'not-owner' }
          return saveAutomationSource(command.actorId, { id: payload.id, name: payload.displayName,
            source: payload.source, identityMap: payload.identityMap, behaviorRevision: payload.behaviorRevision, recordRevision: payload.revision })
        case 'enable': return setPolicyEnabled(command.actorId, payload.policyId, payload.enabled)
        case 'delete': return deletePolicy(command.actorId, payload.policyId)
        case 'buildOptIn': return setBuildAutomationOptIn(command.actorId, payload.enabled, payload.ownerId)
        case 'unitBuildOptIn': return setUnitBuildAutomationOptIn(command.actorId, payload.enabled, payload.ownerId)
        case 'applyBuilding': return applyPolicyToBuilding(command.actorId, entities.find(entity => entity.id === payload.entityId && entity.isBuilding && canCommandPolicy(command.actorId, entity.owner)), payload.policyId)
        case 'removeBuilding': return removePolicyFromBuilding(command.actorId, entities.find(entity => entity.id === payload.entityId && entity.isBuilding && canCommandPolicy(command.actorId, entity.owner)), payload.policyId)
        case 'apply': return applyPolicyToUnit(command.actorId, entities.find(entity => entity.id === payload.entityId && (entity.isBuilding ? 'building' : 'unit') === (payload.entityKind || 'unit') && canCommandPolicy(command.actorId, entity.owner)), payload.policyId)
        case 'remove': return removePolicyFromUnit(command.actorId, entities.find(entity => entity.id === payload.entityId && (entity.isBuilding ? 'building' : 'unit') === (payload.entityKind || 'unit') && canCommandPolicy(command.actorId, entity.owner)), payload.policyId)
        default: return { ok: false, reason: 'invalid-command' }
      }
    })()
    if (result.ok) { receivedSequences.set(owner, command.sequence); sequence = Math.max(sequence, command.sequence) }
    return result
  } finally { restoring = false; receivedBindingSequence = null }
}

export function deletePolicy(actorId, policyId) {
  if (!restoring && !authoringAllowed()) return { ok: false, reason: 'replay-locked' }
  const entry = documents.get(policyId)
  if (!entry) return { ok: false, reason: 'missing' }
  if (!canCommandPolicy(actorId, entry.ownerId)) return { ok: false, reason: 'not-owner' }
  clearDefenceIntent(policyId)
  documents.delete(policyId)
  compiledPrograms.delete(policyId)
  globalEnabled.delete(policyId)
  notify()
  mutation('delete', actorId, { policyId })
  return { ok: true }
}

/** Switch a global policy on or off. Only the commanding owner may do it. */
export function setPolicyEnabled(actorId, policyId, enabled) {
  if (!restoring && !authoringAllowed()) return { ok: false, reason: 'replay-locked' }
  const entry = documents.get(policyId)
  if (!entry) return { ok: false, reason: 'missing' }
  if (!canCommandPolicy(actorId, entry.ownerId)) return { ok: false, reason: 'not-owner' }
  if (entry.policy.scope !== 'global') return { ok: false, reason: 'not-global' }
  if (enabled) globalEnabled.add(policyId)
  else { globalEnabled.delete(policyId); clearDefenceIntent(policyId) }
  notify()
  mutation('enable', actorId, { policyId, enabled })
  return { ok: true }
}

function ensureBindings(unit) {
  if (!Array.isArray(unit.policyBindings)) unit.policyBindings = []
  return unit.policyBindings
}

export function makeBinding(policy, source) {
  return {
    policyId: policy.id,
    behaviorRevision: documents.get(policy.id)?.behaviorRevision || 1,
    source,
    seq: receivedBindingSequence ?? nextPolicySequence(),
    activationSeq: 0,
    runtime: createPolicyRuntime(policy),
    nextReassertAt: 0
  }
}

/**
 * Apply a per-unit policy. Only the unit's commanding owner, who must also own
 * the policy, can apply it. Applying counts as the newest command for the unit,
 * so it takes effect now, and a one-time policy starts immediately.
 */
export function applyPolicyToUnit(actorId, unit, policyId) {
  if (!restoring && !authoringAllowed()) return { ok: false, reason: 'replay-locked' }
  const entry = documents.get(policyId)
  if (!entry) return { ok: false, reason: 'missing' }
  if (entry.policy.variant !== 'unit') return { ok: false, reason: 'build-policy' }
  if (entry.policy.scope !== 'perUnit') return { ok: false, reason: 'not-per-unit' }
  if (!unit || !canCommandPolicy(actorId, unit.owner) || !canCommandPolicy(actorId, entry.ownerId)) {
    return { ok: false, reason: 'not-owner' }
  }
  registerAutomationEntity(unit)
  const bindings = ensureBindings(unit)
  const existingIndex = bindings.findIndex(binding => binding.policyId === policyId && binding.source === 'unit')
  if (existingIndex >= 0) bindings.splice(existingIndex, 1)
  bindings.push(makeBinding(entry.policy, 'unit'))
  if (unit.policyControl && unit.policyControl.order) {
    unit.policyControl.order.active = false
  }
  unit.policyNextEval = 0
  mutation('apply', actorId, { entityKind: 'unit', entityId: unit.id, policyId, bindingSequence: bindings[bindings.length - 1].seq })
  return { ok: true }
}

export function removePolicyFromUnit(actorId, unit, policyId) {
  if (!restoring && !authoringAllowed()) return { ok: false, reason: 'replay-locked' }
  if (!unit || !canCommandPolicy(actorId, unit.owner)) return { ok: false, reason: 'not-owner' }
  if (Array.isArray(unit.policyBindings)) {
    unit.policyBindings = unit.policyBindings.filter(binding => !(binding.policyId === policyId && binding.source === 'unit'))
  }
  mutation('remove', actorId, { entityKind: 'unit', entityId: unit.id, policyId })
  return { ok: true }
}

/** Defence bindings reuse the same store/runtime contract while remaining typed. */
export function listEnabledGlobalDefencePolicies() {
  return Array.from(globalEnabled, id => documents.get(id)).filter(entry => entry?.policy.variant === 'defence' && entry.policy.scope === 'global')
}

export function applyPolicyToBuilding(actorId, building, policyId) {
  if (!restoring && !authoringAllowed()) return { ok: false, reason: 'replay-locked' }
  const entry = documents.get(policyId)
  if (!entry) return { ok: false, reason: 'missing' }
  if (entry.policy.variant !== 'defence' || entry.policy.scope !== 'perUnit') return { ok: false, reason: 'not-defence-control' }
  if (!building?.isBuilding || !canCommandPolicy(actorId, building.owner) || !canCommandPolicy(actorId, entry.ownerId)) return { ok: false, reason: 'not-owner' }
  if (!DEFENCE_TYPES.has(building.type) || !(building.health > 0) || building.constructionFinished === false || building.isBeingSold || building.selling) return { ok: false, reason: 'inactive-defence' }
  registerAutomationEntity(building)
  const bindings = ensureBindings(building)
  const index = bindings.findIndex(binding => binding.policyId === policyId && binding.source === 'building')
  if (index >= 0) bindings.splice(index, 1)
  const binding = makeBinding(entry.policy, 'building')
  binding.entityKind = 'building'
  bindings.push(binding)
  building.policyNextEval = 0
  mutation('applyBuilding', actorId, { entityKind: 'building', entityId: building.id, policyId, bindingSequence: binding.seq })
  return { ok: true }
}

export function removePolicyFromBuilding(actorId, building, policyId) {
  if (!restoring && !authoringAllowed()) return { ok: false, reason: 'replay-locked' }
  if (!building?.isBuilding || !canCommandPolicy(actorId, building.owner)) return { ok: false, reason: 'not-owner' }
  if (building.automationIntent?.issuerId === policyId) building.automationIntent = null
  if (Array.isArray(building.policyBindings)) building.policyBindings = building.policyBindings.filter(binding => !(binding.policyId === policyId && binding.source === 'building'))
  mutation('removeBuilding', actorId, { entityKind: 'building', entityId: building.id, policyId })
  return { ok: true }
}
