// Unit policy store: documents, global enablement and per-unit bindings.
//
// Policy documents stay pure data. Ownership, enablement and per-unit apply are
// separate records so a mid-battle switch never rewrites the script. Only the
// commanding owner can enable, disable or apply a policy. The owner is a human
// player or an AI faction commanding its own units.

import { validatePolicy } from './policySchema.js'
import { createPolicyRuntime } from './policyStep.js'

const STORAGE_KEY = 'cfb-unit-policies-v1'

let documents = new Map()
let globalEnabled = new Set()
let buildOptIn = new Set()
let sequence = 0
let version = 0
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
  persist()
  listeners.forEach(listener => {
    try {
      listener()
    } catch (err) {
      window.logger?.warn?.('[Policies] listener failed', err)
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

function persist() {
  const store = storage()
  if (!store) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({
      documents: Array.from(documents.values()),
      enabled: Array.from(globalEnabled),
      buildOptIn: Array.from(buildOptIn)
    }))
  } catch {
    // Storage may be full or blocked. Policies stay in memory for this session.
  }
}

export function loadPolicyStore() {
  const store = storage()
  documents = new Map()
  globalEnabled = new Set()
  buildOptIn = new Set()
  if (!store) return
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    ;(parsed.documents || []).forEach(entry => {
      if (entry && entry.policy && validatePolicy(entry.policy).valid) {
        documents.set(entry.policy.id, entry)
      }
    })
    ;(parsed.enabled || []).forEach(id => {
      if (documents.has(id)) globalEnabled.add(id)
    })
    ;(parsed.buildOptIn || []).forEach(owner => {
      if (typeof owner === 'string' && owner) buildOptIn.add(normalizePolicyOwner(owner))
    })
    version += 1
  } catch {
    documents = new Map()
    globalEnabled = new Set()
    buildOptIn = new Set()
  }
}

export function resetPolicyStore() {
  documents = new Map()
  globalEnabled = new Set()
  buildOptIn = new Set()
  sequence = 0
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

/** Enabled global unit policies. Build policies never reach units. */
export function listEnabledGlobalPolicies() {
  const result = []
  globalEnabled.forEach(id => {
    const entry = documents.get(id)
    if (entry && entry.policy.scope === 'global' && !isBuildPolicy(entry.policy)) result.push(entry)
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

/** True when this player let build policies run on their own base. Off by default. */
export function isBuildAutomationOptedIn(ownerId) {
  return Boolean(ownerId) && buildOptIn.has(normalizePolicyOwner(ownerId))
}

/** A player opts in or out for their own base only. Nobody can switch another player's base. */
export function setBuildAutomationOptIn(actorId, enabled, ownerId = actorId) {
  if (!actorId || !canCommandPolicy(actorId, ownerId)) return { ok: false, reason: 'not-owner' }
  const owner = normalizePolicyOwner(ownerId)
  if (enabled) buildOptIn.add(owner)
  else buildOptIn.delete(owner)
  notify()
  return { ok: true }
}

/** Validate and store a policy. A policy can only be replaced by its own owner. */
export function savePolicy(actorId, policy) {
  const validation = validatePolicy(policy)
  if (!validation.valid) return { ok: false, reason: 'invalid', errors: validation.errors }
  const existing = documents.get(policy.id)
  if (existing && !canCommandPolicy(actorId, existing.ownerId)) {
    return { ok: false, reason: 'not-owner', errors: [] }
  }
  const stored = JSON.parse(JSON.stringify(policy))
  documents.set(policy.id, { ownerId: normalizePolicyOwner(actorId), policy: stored })
  if (stored.scope !== 'global') globalEnabled.delete(stored.id)
  notify()
  return { ok: true, errors: [] }
}

export function deletePolicy(actorId, policyId) {
  const entry = documents.get(policyId)
  if (!entry) return { ok: false, reason: 'missing' }
  if (!canCommandPolicy(actorId, entry.ownerId)) return { ok: false, reason: 'not-owner' }
  documents.delete(policyId)
  globalEnabled.delete(policyId)
  notify()
  return { ok: true }
}

/** Switch a global policy on or off. Only the commanding owner may do it. */
export function setPolicyEnabled(actorId, policyId, enabled) {
  const entry = documents.get(policyId)
  if (!entry) return { ok: false, reason: 'missing' }
  if (!canCommandPolicy(actorId, entry.ownerId)) return { ok: false, reason: 'not-owner' }
  if (entry.policy.scope !== 'global') return { ok: false, reason: 'not-global' }
  if (enabled) globalEnabled.add(policyId)
  else globalEnabled.delete(policyId)
  notify()
  return { ok: true }
}

function ensureBindings(unit) {
  if (!Array.isArray(unit.policyBindings)) unit.policyBindings = []
  return unit.policyBindings
}

export function makeBinding(policy, source) {
  return {
    policyId: policy.id,
    source,
    seq: nextPolicySequence(),
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
  const entry = documents.get(policyId)
  if (!entry) return { ok: false, reason: 'missing' }
  if (isBuildPolicy(entry.policy)) return { ok: false, reason: 'build-policy' }
  if (entry.policy.scope !== 'perUnit') return { ok: false, reason: 'not-per-unit' }
  if (!unit || !canCommandPolicy(actorId, unit.owner) || !canCommandPolicy(actorId, entry.ownerId)) {
    return { ok: false, reason: 'not-owner' }
  }
  const bindings = ensureBindings(unit)
  const existingIndex = bindings.findIndex(binding => binding.policyId === policyId && binding.source === 'unit')
  if (existingIndex >= 0) bindings.splice(existingIndex, 1)
  bindings.push(makeBinding(entry.policy, 'unit'))
  if (unit.policyControl && unit.policyControl.order) {
    unit.policyControl.order.active = false
  }
  unit.policyNextEval = 0
  return { ok: true }
}

export function removePolicyFromUnit(actorId, unit, policyId) {
  if (!unit || !canCommandPolicy(actorId, unit.owner)) return { ok: false, reason: 'not-owner' }
  if (Array.isArray(unit.policyBindings)) {
    unit.policyBindings = unit.policyBindings.filter(binding => !(binding.policyId === policyId && binding.source === 'unit'))
  }
  return { ok: true }
}
