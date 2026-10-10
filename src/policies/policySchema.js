// Policy document (unit and build variants): schema constants and validation.
//
// A policy is inert JSON. It holds no owner, no enabled flag and no recipient
// list; those live in the policy store. The shape below is versioned and stable.

import { EFFECT_TYPES, isKnownEffect, validateEffectParams } from './policyEffects.js'
import { MAX_AFTER_DELAY_SECONDS, MIN_AFTER_DELAY_SECONDS, formatDelay, isValidDelaySeconds } from './policyDelay.js'
import {
  CHECKS,
  COMPARE_OPS,
  CONDITION_TYPES,
  NUMERIC_FIELDS,
  effectiveMode,
  fieldModes,
  fieldsForVariant,
  isAvailableIn,
  isCheck,
  validateLeafParams
} from './policyConditions.js'

export { EFFECT_TYPES }

const COMPARE_FIELDS = Object.freeze(Object.keys(NUMERIC_FIELDS))

export const POLICY_SCHEMA_VERSION = 1
export const MAX_POLICY_STATES = 7

export const POLICY_VARIANTS = Object.freeze(['unit', 'build', 'unitBuild'])
export const POLICY_SCOPES = Object.freeze(['global', 'perUnit'])
export const POLICY_EXECUTIONS = Object.freeze(['oneTime', 'continuous'])
export const TRANSITION_KINDS = Object.freeze(['if', 'while', 'after'])

export { COMPARE_OPS, CONDITION_TYPES, COMPARE_FIELDS }

const MAX_CONDITION_DEPTH = 4

function error(code, message, path) {
  return { code, message, path }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function validateCompare(condition, path, errors, variant) {
  if (!COMPARE_FIELDS.includes(condition.field)) {
    errors.push(error('invalid_condition', `A comparison needs a field: ${COMPARE_FIELDS.join(', ')}.`, path))
    return
  }
  if (!isAvailableIn(NUMERIC_FIELDS[condition.field], variant)) {
    errors.push(error('invalid_condition',
      `${NUMERIC_FIELDS[condition.field].label} cannot be used in a ${variant} policy. Available: ${fieldsForVariant(variant).map(field => NUMERIC_FIELDS[field].label).join(', ')}.`,
      path))
    return
  }
  if (!COMPARE_OPS.includes(condition.op)) {
    errors.push(error('invalid_condition', `A comparison needs an operator (${COMPARE_OPS.join(', ')}).`, path))
  }
  if (typeof condition.value !== 'number' || !Number.isFinite(condition.value)) {
    errors.push(error('invalid_condition', 'A comparison needs a numeric value.', path))
    return
  }
  const meta = NUMERIC_FIELDS[condition.field]
  if (condition.mode != null && !fieldModes(condition.field).includes(condition.mode)) {
    errors.push(error('invalid_condition', `${meta.label} cannot be compared as "${condition.mode}".`, path))
    return
  }
  const mode = effectiveMode(condition)
  const range = mode === 'relative' ? meta.range : meta.absRange
  if (range && (condition.value < range[0] || condition.value > range[1])) {
    errors.push(error(
      'invalid_condition',
      mode === 'relative' && !meta.relativeAsDegrees
        ? `${meta.label} is compared as a fraction between ${range[0]} and ${range[1]}.`
        : `${meta.label} must be between ${range[0]} and ${range[1]}.`,
      path
    ))
  }
  validateLeafParams(condition).forEach(message => errors.push(error('invalid_condition', message, path)))
}

function validateCondition(condition, path, errors, variant, depth = 0) {
  if (!condition || typeof condition !== 'object') {
    errors.push(error('invalid_condition', 'A condition is missing.', path))
    return
  }
  if (!CONDITION_TYPES.includes(condition.type)) {
    errors.push(error('invalid_condition', `Unknown condition type "${condition.type}".`, path))
    return
  }
  if (variant === 'build' && (condition.type === 'enemyInRange' || condition.type === 'underFire' || condition.type === 'check')) {
    errors.push(error('invalid_condition', 'Build policies measure the base (money, counts, power), not a single unit.', path))
    return
  }
  if (condition.type === 'compare') {
    validateCompare(condition, path, errors, variant)
    return
  }
  if (condition.type === 'check') {
    if (!isCheck(condition.check)) {
      errors.push(error('invalid_condition', `Unknown check "${condition.check}".`, path))
      return
    }
    if (!isAvailableIn(CHECKS[condition.check], variant)) {
      errors.push(error('invalid_condition', `"${CHECKS[condition.check].label}" cannot be used in a ${variant} policy.`, path))
      return
    }
    validateLeafParams(condition).forEach(message => errors.push(error('invalid_condition', message, path)))
    return
  }
  if (condition.type === 'not') {
    if (depth >= MAX_CONDITION_DEPTH) {
      errors.push(error('invalid_condition', 'Conditions are nested too deeply.', path))
      return
    }
    validateCondition(condition.of, `${path}.of`, errors, variant, depth + 1)
    return
  }
  if (condition.type === 'and' || condition.type === 'or') {
    if (!Array.isArray(condition.of) || condition.of.length === 0) {
      errors.push(error('invalid_condition', `"${condition.type}" needs at least one condition.`, path))
      return
    }
    if (depth >= MAX_CONDITION_DEPTH) {
      errors.push(error('invalid_condition', 'Conditions are nested too deeply.', path))
      return
    }
    condition.of.forEach((child, index) => {
      validateCondition(child, `${path}.of[${index}]`, errors, variant, depth + 1)
    })
  }
}

function validateState(state, index, stateIds, errors, transitionIds, variant) {
  const path = `states[${index}]`
  if (!state || typeof state !== 'object') {
    errors.push(error('invalid_state', `State ${index + 1} is not valid.`, path))
    return
  }
  if (state.effect != null) {
    if (typeof state.effect !== 'object' || !isKnownEffect(state.effect.type, variant)) {
      errors.push(error('invalid_effect', `State "${state.name || state.id}" has an action that ${variant === 'build' ? 'a build policy cannot do' : 'is unknown'}.`, `${path}.effect`))
    } else {
      validateEffectParams(state.effect).forEach(message => {
        errors.push(error('invalid_effect', `State "${state.name || state.id}": ${message}`, `${path}.effect`))
      })
    }
  }
  const transitions = state.transitions == null ? [] : state.transitions
  if (!Array.isArray(transitions)) {
    errors.push(error('invalid_state', `State "${state.name || state.id}" has invalid transitions.`, `${path}.transitions`))
    return
  }
  transitions.forEach((transition, tIndex) => {
    const tPath = `${path}.transitions[${tIndex}]`
    if (!transition || typeof transition !== 'object') {
      errors.push(error('invalid_transition', 'A transition is not valid.', tPath))
      return
    }
    if (!isNonEmptyString(transition.id)) {
      errors.push(error('missing_transition_id', 'Every transition needs an id.', tPath))
    } else if (transitionIds.has(transition.id)) {
      errors.push(error('duplicate_transition_id', `Transition id "${transition.id}" is used twice.`, tPath))
    } else {
      transitionIds.add(transition.id)
    }
    if (!TRANSITION_KINDS.includes(transition.kind)) {
      errors.push(error('invalid_transition_kind', 'A rule must be "if", "while" or "after".', `${tPath}.kind`))
    }
    if (!stateIds.has(transition.to)) {
      errors.push(error('unknown_state', `A rule in "${state.name || state.id}" points to a state that does not exist.`, `${tPath}.to`))
    }
    validateCondition(transition.when, `${tPath}.when`, errors, variant)
    if (transition.kind === 'after') {
      if (!isValidDelaySeconds(transition.delaySeconds)) {
        errors.push(error('invalid_delay',
          `An "after" rule needs a delay between ${formatDelay(MIN_AFTER_DELAY_SECONDS)} and ${formatDelay(MAX_AFTER_DELAY_SECONDS)}.`,
          `${tPath}.delaySeconds`))
      }
    } else if (transition.delaySeconds != null) {
      errors.push(error('invalid_transition', 'Only "after" rules can have a delay.', `${tPath}.delaySeconds`))
    }
    if (transition.until != null) {
      if (transition.kind !== 'while') {
        errors.push(error('invalid_transition', 'Only "while" rules can have an end condition.', `${tPath}.until`))
      } else {
        validateCondition(transition.until, `${tPath}.until`, errors, variant)
      }
    }
  })
}

/**
 * Validate a policy document or draft.
 * @returns {{ valid: boolean, errors: Array<{ code: string, message: string, path: string }> }}
 */
export function validatePolicy(policy) {
  const errors = []
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return { valid: false, errors: [error('invalid_document', 'The policy is not a valid document.', '')] }
  }

  if (policy.schemaVersion !== POLICY_SCHEMA_VERSION) {
    errors.push(error('schema_version', `Unsupported schema version (expected ${POLICY_SCHEMA_VERSION}).`, 'schemaVersion'))
  }
  if (!isNonEmptyString(policy.id)) {
    errors.push(error('missing_id', 'The policy needs an id.', 'id'))
  }
  if (!isNonEmptyString(policy.name)) {
    errors.push(error('missing_name', 'The policy needs a name.', 'name'))
  }

  if (policy.variant == null) {
    errors.push(error('variant_missing', 'The policy needs a variant.', 'variant'))
  } else if (!POLICY_VARIANTS.includes(policy.variant)) {
    errors.push(error('variant_invalid', `Unknown policy variant "${policy.variant}".`, 'variant'))
  }

  const variant = POLICY_VARIANTS.includes(policy.variant) ? policy.variant : 'unit'
  if (!POLICY_SCOPES.includes(policy.scope)) {
    errors.push(error('scope_missing', 'A unit policy needs a scope: global or per unit.', 'scope'))
  } else if (variant !== 'unit' && policy.scope !== 'global') {
    errors.push(error('build_scope', 'Build automation applies to the whole production system, so its scope must be global.', 'scope'))
  }
  if (!POLICY_EXECUTIONS.includes(policy.execution)) {
    errors.push(error('execution_invalid', 'The policy needs an execution mode: one-time or continuous.', 'execution'))
  }

  const states = Array.isArray(policy.states) ? policy.states : null
  if (!states || states.length === 0) {
    errors.push(error('no_states', 'The policy needs at least one state.', 'states'))
  } else {
    if (states.length > MAX_POLICY_STATES) {
      errors.push(error(
        'too_many_states',
        `More than ${MAX_POLICY_STATES} states (this draft has ${states.length}). Remove ${states.length - MAX_POLICY_STATES} to save.`,
        'states'
      ))
    }
    const stateIds = new Set()
    states.forEach((state, index) => {
      if (!state || !isNonEmptyString(state.id)) {
        errors.push(error('missing_state_id', `State ${index + 1} needs an id.`, `states[${index}].id`))
      } else if (stateIds.has(state.id)) {
        errors.push(error('duplicate_state_id', `State id "${state.id}" is used twice.`, `states[${index}].id`))
      } else {
        stateIds.add(state.id)
      }
    })
    if (!stateIds.has(policy.initialStateId)) {
      errors.push(error('missing_initial_state', 'The start state does not exist.', 'initialStateId'))
    }
    const transitionIds = new Set()
    states.forEach((state, index) => validateState(state, index, stateIds, errors, transitionIds, variant))
  }

  return { valid: errors.length === 0, errors }
}

/** Single human-readable line for the first problem, or null when valid. */
export function describePolicyProblem(validation) {
  if (!validation || validation.valid || !validation.errors.length) return null
  const tooMany = validation.errors.find(item => item.code === 'too_many_states')
  return (tooMany || validation.errors[0]).message
}
