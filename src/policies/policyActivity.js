// Policy activity: which policies are enabled on units and which of them are
// actively controlling a unit right now. Pure; the engine stores the result.
//
// A policy "actively controls" a unit while:
//   - one of its conditions has fired and the state machine sits inside a
//     "while" hold (runtime.hold is set),
//   - the machine is not in its start state and has not finished (a one-time
//     policy that ran to its end is an end state),
//   - or an "after" delay is running: its condition became true and the unit
//     waits for the delay to be over (the machine still sits in its start
//     state, but the policy is already acting on the unit),
//   - nothing stops it from acting: no paused gate and no running direct order.

import { canCommandPolicy, getPolicyDocument } from './policyStore.js'
import { STEP_GATE } from './policyStep.js'

/**
 * @param {{ runtime: object }} binding
 * @param {{ initialStateId: string }} policy
 * @param {string} gate STEP_GATE value for this binding
 */
export function isBindingControlling(binding, policy, gate) {
  const runtime = binding.runtime
  if (!runtime || runtime.finished || gate !== STEP_GATE.open) return false
  if (runtime.pending) return true
  if (!runtime.hold) return false
  return runtime.currentStateId !== policy.initialStateId
}

/**
 * Count, per policy id, the living units that have the policy enabled and the
 * units it actively controls. Reuses `into` when given.
 * @returns {Map<string, { enabled: number, active: number }>}
 */
export function countPolicyActivity(units, into = new Map()) {
  into.forEach(entry => { entry.enabled = 0; entry.active = 0 })
  if (!Array.isArray(units)) return into
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]
    const bindings = unit && unit.policyBindings
    if (!bindings || bindings.length === 0 || !(unit.health > 0)) continue
    for (let j = 0; j < bindings.length; j++) {
      const binding = bindings[j]
      let entry = into.get(binding.policyId)
      if (!entry) {
        entry = { enabled: 0, active: 0 }
        into.set(binding.policyId, entry)
      }
      entry.enabled += 1
      if (binding.active === true) entry.active += 1
    }
  }
  return into
}

/**
 * True when the in-control indicator belongs on `unit`: a policy controls it,
 * it is alive and it belongs to the local player (legacy owner "player" counts
 * as "player1"). Allocation free; called per unit per frame.
 */
export function shouldShowPolicyIndicator(unit, humanOwner) {
  return unit?.policyActive === true && unit.health > 0 && canCommandPolicy(humanOwner, unit.owner)
}

/** Living units that at least one policy actively controls. */
export function listActivelyControlledUnits(units, out = []) {
  out.length = 0
  if (!Array.isArray(units)) return out
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]
    if (unit && unit.policyActive === true && unit.health > 0) out.push(unit)
  }
  return out
}

/** Tooltip text naming the policies that currently control `unit` (hover only). */
export function describeActivePolicies(unit) {
  const bindings = unit && unit.policyBindings
  const names = []
  if (bindings) {
    for (let i = 0; i < bindings.length; i++) {
      if (bindings[i].active !== true) continue
      const doc = getPolicyDocument(bindings[i].policyId)
      names.push(doc ? doc.name : bindings[i].policyId)
    }
  }
  return names.length ? `Controlled by policy:\n${names.join('\n')}` : 'Controlled by policy'
}

/**
 * Automation status of one unit for lists: which policies control it right
 * now, how many are merely enabled, or none. Allocates; call from throttled UI
 * code only, never from a per-tick or per-frame path.
 * @returns {{ state: 'controlling'|'enabled'|'none', controlling: string[], enabled: number, text: string }}
 */
export function getUnitAutomationStatus(unit) {
  const bindings = unit && unit.policyBindings
  const controlling = []
  let enabled = 0
  if (bindings) {
    for (let i = 0; i < bindings.length; i++) {
      enabled += 1
      if (bindings[i].active !== true) continue
      const doc = getPolicyDocument(bindings[i].policyId)
      controlling.push(doc ? doc.name : bindings[i].policyId)
    }
  }
  if (controlling.length > 0) {
    const label = controlling.length === 1 ? controlling[0] : `${controlling.length} policies`
    return { state: 'controlling', controlling, enabled, text: `⚡ ${label}` }
  }
  if (enabled > 0) {
    return { state: 'enabled', controlling, enabled, text: `🤖 ${enabled} waiting` }
  }
  return { state: 'none', controlling, enabled, text: '🤖 manual' }
}
