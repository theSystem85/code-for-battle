// Policy activity: which policies are enabled on units and which of them are
// actively controlling a unit right now. Pure; the engine stores the result.
//
// A policy "actively controls" a unit while:
//   - one of its conditions has fired and the state machine sits inside a
//     "while" hold (runtime.hold is set),
//   - the machine is not in its start state and has not finished (a one-time
//     policy that ran to its end is an end state),
//   - nothing stops it from acting: no paused gate and no running direct order.

import { STEP_GATE } from './policyStep.js'

/**
 * @param {{ runtime: object }} binding
 * @param {{ initialStateId: string }} policy
 * @param {string} gate STEP_GATE value for this binding
 */
export function isBindingControlling(binding, policy, gate) {
  const runtime = binding.runtime
  if (!runtime || runtime.finished || !runtime.hold) return false
  if (runtime.currentStateId === policy.initialStateId) return false
  return gate === STEP_GATE.open
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
