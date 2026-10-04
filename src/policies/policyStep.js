// Pure policy state-machine step. No game objects, no clocks, no side effects.
//
// stepPolicy(policy, runtime, worldView, { gate }) -> { runtime, effects, trace }
//
// "if"    transition: taken once, on the step its condition becomes true.
// "while" transition: taken the same way, then the target state is HELD until
//                     the end condition is met (default: the condition is no
//                     longer true). A held state keeps asserting its effect.
//
// gate (how a direct order interacts with the policy):
//   "open"         everything is evaluated.
//   "orderRunning" a direct order is in progress. "if" rules and hold
//                  re-assertion are frozen; a "while" rule that newly becomes
//                  true still takes over, and end conditions still end holds.
//   "paused"       the owner paused the policy until the order is done. Nothing
//                  is evaluated.

import { compareCondition } from './policyConditions.js'

export const STEP_GATE = Object.freeze({
  open: 'open',
  orderRunning: 'orderRunning',
  paused: 'paused'
})

export function createPolicyRuntime(policy) {
  return {
    currentStateId: policy.initialStateId,
    finished: false,
    hold: null,
    prev: {},
    steps: 0
  }
}

function legacyMeasure(condition, view) {
  if (condition.field === 'hp') return view.hp
  if (condition.field === 'enemyDistance') return view.enemyDistance
  return undefined
}

/**
 * `view.measure(leaf)` returns a number for compare leaves and a boolean for
 * check leaves, or undefined when the unit cannot be measured that way.
 */
export function evaluateCondition(condition, view) {
  switch (condition.type) {
    case 'always':
      return true
    case 'enemyInRange':
      return view.enemyInRange === true
    case 'underFire':
      return view.underFire === true
    case 'not':
      return !evaluateCondition(condition.of, view)
    case 'and':
      for (let i = 0; i < condition.of.length; i++) {
        if (!evaluateCondition(condition.of[i], view)) return false
      }
      return true
    case 'or':
      for (let i = 0; i < condition.of.length; i++) {
        if (evaluateCondition(condition.of[i], view)) return true
      }
      return false
    case 'compare': {
      const actual = view.measure ? view.measure(condition) : legacyMeasure(condition, view)
      if (typeof actual !== 'number' || Number.isNaN(actual)) return false
      return compareCondition(condition, actual)
    }
    case 'check':
      return view.measure ? view.measure(condition) === true : false
    default:
      return false
  }
}

function findState(policy, stateId) {
  for (let i = 0; i < policy.states.length; i++) {
    if (policy.states[i].id === stateId) return policy.states[i]
  }
  return null
}

function findTransition(policy, transitionId) {
  for (let i = 0; i < policy.states.length; i++) {
    const transitions = policy.states[i].transitions || []
    for (let j = 0; j < transitions.length; j++) {
      if (transitions[j].id === transitionId) return transitions[j]
    }
  }
  return null
}

function makeEffect(state, phase, kind, transitionId) {
  return {
    type: state.effect.type,
    params: state.effect,
    phase,
    kind,
    stateId: state.id,
    transitionId
  }
}

function buildTrace(from, to, extra) {
  return {
    fromStateId: from,
    toStateId: to,
    transitionId: null,
    kind: null,
    event: 'idle',
    gate: 'open',
    holding: false,
    finished: false,
    ...extra
  }
}

export function stepPolicy(policy, runtime, worldView, options = {}) {
  const gate = options.gate || STEP_GATE.open

  if (runtime.finished) {
    return {
      runtime,
      effects: [],
      trace: buildTrace(runtime.currentStateId, runtime.currentStateId, { event: 'finished', gate, finished: true })
    }
  }

  if (gate === STEP_GATE.paused) {
    return {
      runtime,
      effects: [],
      trace: buildTrace(runtime.currentStateId, runtime.currentStateId, {
        event: 'paused',
        gate,
        holding: runtime.hold != null
      })
    }
  }

  const state = findState(policy, runtime.currentStateId)
  const next = {
    currentStateId: runtime.currentStateId,
    finished: false,
    hold: runtime.hold,
    prev: runtime.prev,
    steps: runtime.steps + 1
  }
  const effects = []

  if (runtime.hold) {
    const transition = findTransition(policy, runtime.hold.transitionId)
    const ended = transition
      ? (transition.until ? evaluateCondition(transition.until, worldView) : !evaluateCondition(transition.when, worldView))
      : true
    if (ended) {
      const returnStateId = runtime.hold.returnStateId
      next.currentStateId = returnStateId
      next.hold = null
      next.prev = transition ? { [transition.id]: evaluateCondition(transition.when, worldView) } : {}
      next.finished = policy.execution === 'oneTime'
      return {
        runtime: next,
        effects,
        trace: buildTrace(state.id, returnStateId, {
          transitionId: runtime.hold.transitionId,
          kind: 'while',
          event: 'holdEnded',
          gate,
          finished: next.finished
        })
      }
    }
    if (gate === STEP_GATE.open && state.effect) {
      effects.push(makeEffect(state, 'hold', 'while', runtime.hold.transitionId))
    }
    return {
      runtime: next,
      effects,
      trace: buildTrace(state.id, state.id, {
        transitionId: runtime.hold.transitionId,
        kind: 'while',
        event: gate === STEP_GATE.open ? 'holding' : 'holdSuspended',
        gate,
        holding: true
      })
    }
  }

  const transitions = state.transitions || []
  let taken = null
  let prev = null
  for (let i = 0; i < transitions.length; i++) {
    const transition = transitions[i]
    if (transition.kind === 'if' && gate !== STEP_GATE.open) continue
    const holds = evaluateCondition(transition.when, worldView)
    if (prev === null) prev = { ...runtime.prev }
    const was = runtime.prev[transition.id] === true
    prev[transition.id] = holds
    if (holds && !was) {
      taken = transition
      break
    }
  }

  if (!taken) {
    if (prev !== null) next.prev = prev
    return {
      runtime: next,
      effects,
      trace: buildTrace(state.id, state.id, { gate })
    }
  }

  const target = findState(policy, taken.to)
  next.currentStateId = target.id
  next.prev = {}
  if (taken.kind === 'while') {
    next.hold = { transitionId: taken.id, returnStateId: state.id }
  } else {
    const terminal = !target.transitions || target.transitions.length === 0
    next.finished = policy.execution === 'oneTime' && terminal
  }
  if (target.effect) {
    effects.push(makeEffect(target, 'enter', taken.kind, taken.id))
  }
  return {
    runtime: next,
    effects,
    trace: buildTrace(state.id, target.id, {
      transitionId: taken.id,
      kind: taken.kind,
      event: taken.kind === 'while' ? 'holdStarted' : 'fired',
      gate,
      holding: taken.kind === 'while',
      finished: next.finished
    })
  }
}
