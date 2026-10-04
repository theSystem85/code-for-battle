// Base policy engine: runs build policies (base automation) for one player.
//
// A build policy is the same inert state machine as a unit policy, stepped with
// stepPolicy. It never touches a building or a tile itself. An effect becomes
// one call on the build command API (buildCommandApi.js), which queues the
// construction through the normal production queue and refuses whatever the
// engine would refuse (money, tech, queue, placement).
//
// Who runs: only a player who opted in (policyStore.setBuildAutomationOptIn),
// only for their own base, only for build policies they own and enabled. In
// multiplayer every client runs this for its own player. Nobody can run build
// policies on another player's base. Enemy AI does not use this engine.
//
// Hot path: updateBasePolicies is called every simulation tick but returns at
// once unless BASE_EVAL_INTERVAL_MS of simulation time has passed. A pass costs
// one array of the enabled policies and, lazily, one scan of the entity lists.

import { getSimulationTime } from '../game/time.js'
import { gameState } from '../gameState.js'
import { executeBuildCommand } from './buildCommandApi.js'
import { beginBaseScope, measureBaseLeaf, resetBaseSensors } from './basePolicySensors.js'
import { EFFECTS, describeEffect } from './policyEffects.js'
import { isBuildAutomationOptedIn, listEnabledBuildPolicies } from './policyStore.js'
import { STEP_GATE, createPolicyRuntime, stepPolicy } from './policyStep.js'

export const BASE_EVAL_INTERVAL_MS = 1000
export const BASE_REASSERT_MS = 2000
export const BASE_REFUSED_RETRY_MS = 5000

const runs = new Map()
const listeners = new Set()
const view = { now: 0, measure: measureBaseLeaf }
let lastPass = -Infinity

export function subscribeBasePolicyEvents(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(event) {
  listeners.forEach(listener => {
    try {
      listener(event)
    } catch (err) {
      window.logger?.warn?.('[BasePolicies] listener failed', err)
    }
  })
}

export function resetBasePolicyEngine() {
  runs.clear()
  lastPass = -Infinity
  resetBaseSensors()
}

/** Live state of one enabled build policy, or null when it is not running. */
export function getBasePolicyStatus(policyId) {
  const run = runs.get(policyId)
  if (!run) return null
  const state = run.policy.states.find(item => item.id === run.runtime.currentStateId)
  return {
    stateId: run.runtime.currentStateId,
    stateName: state ? state.name || state.id : run.runtime.currentStateId,
    finished: run.runtime.finished && !run.pending,
    waiting: Boolean(run.pending),
    orders: run.orders,
    last: run.last
  }
}

/** One line for the panel: what the policy did last, or why it is waiting. */
export function describeBasePolicyStatus(status) {
  if (!status) return 'Not running'
  if (status.finished) return status.last && status.last.ok ? 'Finished' : 'Finished without an order'
  if (!status.last) return `In state "${status.stateName}"`
  const what = describeEffect(status.last.effect).toLowerCase()
  return status.last.ok ? `Ordered: ${what}` : `Waiting: ${status.last.reason}`
}

function ensureRun(entry) {
  let run = runs.get(entry.policy.id)
  if (!run || run.policy !== entry.policy) {
    run = { policy: entry.policy, runtime: createPolicyRuntime(entry.policy), nextActAt: 0, pending: null, orders: 0, last: null }
    runs.set(entry.policy.id, run)
  }
  return run
}

function act(run, effect, context, now) {
  const meta = EFFECTS[effect.type]
  if (!meta || meta.variant !== 'build') return
  const result = executeBuildCommand(meta.command, effect, context)
  run.last = { ok: result.ok, reason: result.reason, effect, at: now }
  run.nextActAt = now + (result.ok ? BASE_REASSERT_MS : BASE_REFUSED_RETRY_MS)
  if (result.ok) {
    run.orders += 1
    run.pending = null
  } else {
    run.pending = effect
  }
  emit({ type: result.ok ? 'ordered' : 'refused', policyId: run.policy.id, effect, reason: result.reason, at: now })
}

function stepRun(run, context, now) {
  const previousStateId = run.runtime.currentStateId
  view.now = now
  const outcome = stepPolicy(run.policy, run.runtime, view, { gate: STEP_GATE.open })
  run.runtime = outcome.runtime
  if (run.runtime.currentStateId !== previousStateId) run.pending = null
  for (let i = 0; i < outcome.effects.length; i++) {
    const item = outcome.effects[i]
    if (item.phase === 'enter' || now >= run.nextActAt) act(run, item.params, context, now)
  }
  if (run.pending && outcome.effects.length === 0 && now >= run.nextActAt) act(run, run.pending, context, now)
}

/**
 * Evaluate the enabled build policies of `context.owner`.
 * ctx = { owner, units, buildings, getMoney, getPower, getMoneyEarned?, isPositionVisible?, build }
 */
export function updateBasePolicies(context, now = getSimulationTime(gameState)) {
  if (now >= lastPass && now - lastPass < BASE_EVAL_INTERVAL_MS) return
  if (now < lastPass) resetBasePolicyEngine()
  lastPass = now
  const owner = context.owner
  if (!owner || !isBuildAutomationOptedIn(owner)) {
    if (runs.size > 0) runs.clear()
    return
  }
  beginBaseScope(context, owner, now)
  const entries = listEnabledBuildPolicies(owner)
  if (runs.size > 0) {
    runs.forEach((run, id) => {
      if (!entries.some(entry => entry.policy.id === id)) runs.delete(id)
    })
  }
  for (let i = 0; i < entries.length; i++) {
    stepRun(ensureRun(entries[i]), context, now)
  }
}
