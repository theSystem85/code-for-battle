import { recordReplayCommand } from '../replayCommandPrimitives.js'
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
import { getCompletionReceipt, releaseCompletionReceipt } from './completionReceipts.js'
import { executeBuildCommand } from './buildCommandApi.js'
import { executeUnitBuildCommand } from './unitBuildCommandApi.js'
import { beginBaseScope, measureBaseLeaf, resetBaseSensors } from './basePolicySensors.js'
import { EFFECTS, describeEffect } from './policyEffects.js'
import {
  canCommandPolicy,
  getCompiledPolicyProgram,
  getPolicyEntry,
  registerAutomationRuntimeProvider,
  validAutomationRuntime,
  isBuildAutomationOptedIn,
  isUnitBuildAutomationOptedIn,
  listEnabledBuildPolicies,
  listEnabledUnitBuildPolicies
} from './policyStore.js'
import { stepCompiledPolicy } from './policyCompiler.js'
import { STEP_GATE, createPolicyRuntime } from './policyStep.js'

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
  for (const run of runs.values()) if (run.runtime.wait?.receiptId) releaseCompletionReceipt(run.runtime.wait.receiptId)
  runs.clear()
  lastPass = -Infinity
  resetBaseSensors()
}

/** Session providers run at save/resync boundaries, outside simulation stepping. */
export function exportBaseAutomationRuntime() {
  return Array.from(runs, ([policyId, run]) => ({
    policyId, ownerId: run.ownerId, behaviorRevision: run.behaviorRevision,
    runtime: globalThis.structuredClone(run.runtime), nextActAt: run.nextActAt,
    pending: globalThis.structuredClone(run.pending), orders: run.orders,
    last: globalThis.structuredClone(run.last)
  }))
}

export function restoreBaseAutomationRuntime(snapshot, options = {}) {
  if (options.authority === 'host-snapshot' || !Array.isArray(snapshot)) return
  if (!options.merge) runs.clear()
  for (const item of snapshot) {
    const entry = getPolicyEntry(item?.policyId)
    if (gameState.humanPlayer && entry && !canCommandPolicy(gameState.humanPlayer, entry.ownerId)) continue
    if (!entry || entry.ownerId !== item.ownerId || entry.behaviorRevision !== item.behaviorRevision) continue
    if (entry.policy.variant !== 'build' && entry.policy.variant !== 'unitBuild') continue
    const program = getCompiledPolicyProgram(item.policyId)
    if (!program || !validAutomationRuntime(item.runtime, entry.policy)) continue
    const hold = item.runtime.hold
    if (hold && (!program.ruleTable[hold.transitionId] || !program.stateTable[hold.returnStateId])) continue
    if (!Number.isFinite(item.nextActAt) || !Number.isFinite(item.orders) || item.orders < 0) continue
    if (item.pending && !entry.policy.states.some(state => JSON.stringify(state.effect) === JSON.stringify(item.pending))) continue
    runs.set(item.policyId, {
      policy: entry.policy, ownerId: entry.ownerId, behaviorRevision: entry.behaviorRevision,
      runtime: globalThis.structuredClone(item.runtime), nextActAt: item.nextActAt,
      pending: globalThis.structuredClone(item.pending), orders: item.orders,
      last: globalThis.structuredClone(item.last)
    })
  }
  // Restore can move simulation time backwards; the next pass must preserve restored runs.
  lastPass = -Infinity
}

registerAutomationRuntimeProvider('base', { export: exportBaseAutomationRuntime, restore: restoreBaseAutomationRuntime, reset: resetBasePolicyEngine })

/** Live state of one enabled build policy, or null when it is not running. */
export function getBasePolicyStatus(policyId) {
  const run = runs.get(policyId)
  if (!run) return null
  const state = run.policy.states.find(item => item.id === run.runtime.currentStateId)
  return {
    stateId: run.runtime.currentStateId,
    stateName: state ? state.name || state.id : run.runtime.currentStateId,
    finished: run.runtime.finished && !run.pending,
    waiting: Boolean(run.pending || run.runtime.wait),
    completionStatus: run.runtime.wait?.status || null,
    completionReason: run.runtime.wait?.reason || null,
    orders: run.orders,
    last: run.last
  }
}

/** One line for the panel: what the policy did last, or why it is waiting. */
export function describeBasePolicyStatus(status) {
  if (!status) return 'Not running'
  if (status.completionStatus === 'failed') return `Blocked: ${status.completionReason || 'production was cancelled'}`
  if (status.completionStatus === 'issuing' && status.last?.reason) return `Waiting to issue: ${status.last.reason}`
  if (status.completionStatus && status.completionReason) return `Waiting: ${status.completionReason}`
  if (status.completionStatus) return 'Waiting until the exact production order is completed'
  if (status.finished) return status.last && status.last.ok ? 'Finished' : 'Finished without an order'
  if (!status.last) return `In state "${status.stateName}"`
  const what = describeEffect(status.last.effect).toLowerCase()
  return status.last.ok ? `Ordered: ${what}` : `Waiting: ${status.last.reason}`
}

function ensureRun(entry) {
  let run = runs.get(entry.policy.id)
  if (!run || run.behaviorRevision !== entry.behaviorRevision) {
    if (run?.runtime.wait?.receiptId) releaseCompletionReceipt(run.runtime.wait.receiptId)
    run = { policy: entry.policy, ownerId: entry.ownerId, behaviorRevision: entry.behaviorRevision, runtime: createPolicyRuntime(entry.policy), nextActAt: 0, pending: null, orders: 0, last: null }
    runs.set(entry.policy.id, run)
  }
  run.policy = entry.policy
  return run
}

function act(run, effect, context, now) {
  const meta = EFFECTS[effect.type]
  if (!meta || (meta.variant !== 'build' && meta.variant !== 'unitBuild')) return
  context.automationId = run.policy.id
  context.automationRevision = run.behaviorRevision
  const result = meta.variant === 'unitBuild'
    ? executeUnitBuildCommand(meta.command, effect, context)
    : executeBuildCommand(meta.command, effect, context)
  run.last = { ok: result.ok, reason: result.reason, effect, at: now }
  run.nextActAt = now + (result.ok ? BASE_REASSERT_MS : BASE_REFUSED_RETRY_MS)
  if (result.ok) {
    run.orders += 1
    run.pending = null
    if (effect.waitForCompletion) run.runtime.wait = { ...run.runtime.wait, status: 'pending', receiptId: result.receiptId, reason: null }
  } else {
    run.pending = effect
    if (effect.waitForCompletion) run.runtime.wait = { ...run.runtime.wait, status: 'issuing', reason: result.reason }
  }
  emit({ type: result.ok ? 'ordered' : 'refused', policyId: run.policy.id, effect, reason: result.reason, at: now })
}

function stepRun(run, context, now) {
  const previousStateId = run.runtime.currentStateId
  const previousRuntime = run.runtime
  const previousOrders = run.orders
  const previousPending = run.pending
  view.now = now
  const program = getCompiledPolicyProgram(run.policy.id)
  if (!program || program.behaviorRevision !== (run.behaviorRevision || 1)) return
  const wait = run.runtime.wait
  if (wait?.receiptId && wait.status === 'pending') {
    const receipt = getCompletionReceipt(wait.receiptId)
    if (!receipt) run.runtime = { ...run.runtime, wait: { ...wait, status: 'failed', reason: 'the exact production receipt was lost' } }
    else if (receipt.status === 'pending' && wait.reason !== receipt.reason) run.runtime = { ...run.runtime, wait: { ...wait, reason: receipt.reason } }
    else if (receipt.status !== 'pending') {
      run.runtime = { ...run.runtime, wait: { ...wait, status: receipt.status, reason: receipt.reason } }
      releaseCompletionReceipt(wait.receiptId)
    }
  }
  const outcome = stepCompiledPolicy(program, run.runtime, view, STEP_GATE.open)
  run.runtime = outcome.runtime
  if (run.runtime.currentStateId !== previousStateId) run.pending = null
  for (let i = 0; i < outcome.effects.length; i++) {
    const item = outcome.effects[i]
    if (item.phase === 'enter' || now >= run.nextActAt) act(run, item.params, context, now)
  }
  if (run.pending && outcome.effects.length === 0 && now >= run.nextActAt) act(run, run.pending, context, now)
  if (gameState.replay?.recordingActive && (run.orders !== previousOrders || run.pending !== previousPending || run.runtime.currentStateId !== previousRuntime.currentStateId || run.runtime.wait !== previousRuntime.wait || run.runtime.pending !== previousRuntime.pending || run.runtime.hold !== previousRuntime.hold || run.runtime.finished !== previousRuntime.finished)) {
    recordReplayCommand({ type: 'automation-base-runtime', snapshot: [{ policyId: run.policy.id, ownerId: run.ownerId,
      behaviorRevision: run.behaviorRevision, runtime: globalThis.structuredClone(run.runtime), nextActAt: run.nextActAt,
      pending: globalThis.structuredClone(run.pending), orders: run.orders, last: globalThis.structuredClone(run.last) }] }, { source: 'automation' })
  }
}

/**
 * Evaluate the enabled build policies of `context.owner`.
 * ctx = { owner, units, buildings, getMoney, getPower, getMoneyEarned?, isPositionVisible?, build }
 */
export function updateBasePolicies(context, now = getSimulationTime(gameState)) {
  if (gameState.replayMode || context.authority === false) return
  if (now >= lastPass && now - lastPass < BASE_EVAL_INTERVAL_MS) return
  if (now < lastPass) resetBasePolicyEngine()
  lastPass = now
  const owner = context.owner
  const runBase = owner && isBuildAutomationOptedIn(owner)
  const runUnits = owner && isUnitBuildAutomationOptedIn(owner)
  if (!owner || (!runBase && !runUnits)) {
    if (runs.size > 0) runs.clear()
    return
  }
  beginBaseScope(context, owner, now)
  const entries = []
  if (runBase) entries.push(...listEnabledBuildPolicies(owner))
  if (runUnits) entries.push(...listEnabledUnitBuildPolicies(owner))
  if (runs.size > 0) {
    runs.forEach((run, id) => {
      if (!entries.some(entry => entry.policy.id === id)) {
        if (run.runtime.wait?.receiptId) releaseCompletionReceipt(run.runtime.wait.receiptId)
        runs.delete(id)
      }
    })
  }
  for (let i = 0; i < entries.length; i++) {
    stepRun(ensureRun(entries[i]), context, now)
  }
}
