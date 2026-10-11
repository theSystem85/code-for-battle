// Defence automation shares the compiled state-machine executor. This pass is
// host/simulation only; authoring, parsing and compilation stay in the store.
import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { recordAutomationRuntime, recordAutomationDefenceIntent } from './automationReplay.js'
import { stepCompiledPolicy } from './policyCompiler.js'
import { canCommandPolicy, getCompiledPolicyProgram, getPolicyDocument, getPolicyEntry, getPolicyStoreVersion, listEnabledGlobalDefencePolicies, makeBinding, nextPolicySequence, registerAutomationEntity, refreshAutomationBinding } from './policyStore.js'
import { clearDefenceIntent, executeDefenceCommand } from './defenceCommandApi.js'
import { isDefenceReady, isProgrammableDefence } from './defenceCapabilities.js'
import { canDefenceTarget, defenceTargetById, measureDefenceLeaf, nearestDefenceEnemy, prepareDefenceWorld } from './defenceSensors.js'

export const DEFENCE_EVAL_INTERVAL_MS = 150
let storeVersion = -1
let globals = []
const registrations = new WeakMap()
const scope = { building: null, context: null }
const view = { now: 0, hp: 0, underFire: false, enemyInRange: false, enemyDistance: Infinity, measure: leaf => measureDefenceLeaf(scope.building, leaf, scope.context) }
const commandContext = {
  owner: null, now: 0, authoritative: true,
  nearestEnemy: building => nearestDefenceEnemy(building, scope.context, true),
  targetById: defenceTargetById,
  canTarget: (building, target) => canDefenceTarget(building, target, scope.context),
  getPower: owner => scope.context.getPower?.(owner)
}
const commandOwnership = { issuerId: null, revision: 0, transitionId: null, temporary: false, sequence: 0 }

export function teardownDefenceAutomation(building) {
  clearDefenceIntent(building)
  building.policyBindings = null
  building.policyActive = false
  building.automationControl = null
  building.automationControlSequence = 0
  building.automationManualOverride = null
  delete building.defenceAutomationStoreVersion
  delete building.defenceAutomationOwner
  registrations.get(building)?.()
  registrations.delete(building)
}

function reconcile(building) {
  let bindings = building.policyBindings
  if (!bindings) bindings = building.policyBindings = []
  for (let i = bindings.length - 1; i >= 0; i--) {
    const binding = bindings[i]
    const entry = getPolicyEntry(binding.policyId)
    const activeGlobal = binding.source !== 'global' || globals.some(item => item.policy.id === binding.policyId)
    if (!entry || entry.policy.variant !== 'defence' || !canCommandPolicy(building.owner, entry.ownerId) || !activeGlobal) {
      clearDefenceIntent(building, binding.policyId)
      bindings.splice(i, 1)
      continue
    }
    if (refreshAutomationBinding(binding, entry.policy)) clearDefenceIntent(building, binding.policyId)
  }
  for (const entry of globals) {
    if (!canCommandPolicy(building.owner, entry.ownerId) || bindings.some(binding => binding.policyId === entry.policy.id)) continue
    const binding = makeBinding(entry.policy, 'global')
    binding.entityKind = 'building'
    bindings.push(binding)
  }
  building.defenceAutomationStoreVersion = storeVersion
}

function manualGate(building, binding) {
  const override = building.automationManualOverride
  if (building.holdFire || override?.persistent) return 'paused'
  if (!override) return 'open'
  const live = building.forcedAttackTarget?.health > 0 || building.forcedAttackQueue?.some(target => target?.health > 0)
  if (!live) { building.automationManualOverride = null; return 'open' }
  if (building.automationControl === binding.policyId && binding.runtime.hold) return 'open'
  return binding.pausedUntilOrderSeq === override.issuedAt ? 'paused' : 'orderRunning'
}

export function pauseDefencePolicyUntilOrderDone(building, policyId) {
  if (!building?.automationManualOverride) return false
  for (const binding of building.policyBindings || []) if (!policyId || binding.policyId === policyId) binding.pausedUntilOrderSeq = building.automationManualOverride.issuedAt
  return true
}

/** Called once per authoritative tick, ~60–120 Hz; active machines step at 150ms.
 * Forty turrets therefore run at most267steps/sec, independent of renderDPR.
 * No parsing or world scans occur when no defence program/intent is present.
 */
export function updateDefencePolicies(buildings, context, now) {
  if (context.authoritative === false || context.replayMode || gameState.replayMode) return
  const nextVersion = getPolicyStoreVersion()
  if (nextVersion !== storeVersion) { globals = listEnabledGlobalDefencePolicies(); storeVersion = nextVersion }
  context.now = now
  let worldPrepared = false
  for (const building of buildings || []) {
    if (!isProgrammableDefence(building)) continue
    if (!isDefenceReady(building)) {
      if (building.policyBindings || building.automationIntent) teardownDefenceAutomation(building)
      continue
    }
    if (building.automationIntent && !canCommandPolicy(building.owner, building.automationIntent.owner)) clearDefenceIntent(building)
    if (!globals.length && !building.policyBindings?.length && !building.automationIntent) continue
    if (!registrations.has(building)) registrations.set(building, registerAutomationEntity(building))
    if (building.defenceAutomationOwner && building.defenceAutomationOwner !== building.owner) {
      clearDefenceIntent(building)
      building.automationManualOverride = null
      building.automationControl = null
      building.automationControlSequence = 0
      building.holdFire = false
    }
    if (building.defenceAutomationStoreVersion !== storeVersion || building.defenceAutomationOwner !== building.owner) {
      reconcile(building)
      building.defenceAutomationOwner = building.owner
      building.policyActive = Boolean(building.policyBindings?.some(binding => binding.active))
    }
    if (!building.policyBindings?.length || now < (building.policyNextEval || 0)) continue
    building.policyNextEval = now + DEFENCE_EVAL_INTERVAL_MS
    if (!worldPrepared) { prepareDefenceWorld(context); worldPrepared = true }
    scope.building = building
    scope.context = context
    view.now = now
    view.hp = building.maxHealth > 0 ? building.health / building.maxHealth : 0
    view.underFire = Number.isFinite(building.lastDamageTime) && now - building.lastDamageTime <= 3000
    building.policyActive = false
    for (const binding of building.policyBindings) {
      const program = getCompiledPolicyProgram(binding.policyId)
      if (!program || binding.runtime.finished) {
        binding.active = building.automationIntent?.issuerId === binding.policyId && ['holdFire', 'aimNearestEnemy', 'turretLeft', 'turretRight'].includes(building.automationIntent.action)
        if (binding.active) building.policyActive = true
        continue
      }
      const gate = manualGate(building, binding)
      if (program.sensorDependencyMask & 1) {
        const enemy = nearestDefenceEnemy(building, context)
        view.enemyInRange = Boolean(enemy && canDefenceTarget(building, enemy, context))
        view.enemyDistance = enemy ? Math.hypot(enemy.x + TILE_SIZE / 2 - (building.x + building.width / 2) * TILE_SIZE, enemy.y + TILE_SIZE / 2 - (building.y + building.height / 2) * TILE_SIZE) / TILE_SIZE : Infinity
      }
      const previousRuntime = binding.runtime
      const previousIntent = building.automationIntent
      const previousFireRequest = previousIntent?.fireRequested
      const previousControl = building.automationControl
      const outcome = stepCompiledPolicy(program, binding.runtime, view, { gate })
      binding.runtime = outcome.runtime
      binding.lastTrace = outcome.trace
      if (outcome.trace.event === 'holdEnded') {
        clearDefenceIntent(building, binding.policyId, outcome.trace.transitionId)
        if (building.automationControl === binding.policyId) building.automationControl = null
        if (!building.automationControl) building.automationControlSequence = 0
      }
      for (const issued of outcome.effects) {
        if (issued.phase === 'enter') binding.activationSeq = nextPolicySequence()
        if (issued.phase === 'hold' && (building.automationControlSequence || 0) > (binding.activationSeq || 0)) continue
        commandContext.owner = building.owner
        commandContext.now = now
        commandOwnership.issuerId = binding.policyId
        commandOwnership.revision = binding.behaviorRevision
        commandOwnership.transitionId = issued.transitionId
        commandOwnership.temporary = Boolean(outcome.runtime.hold)
        commandOwnership.sequence = binding.activationSeq || 0
        binding.lastCommandResult = executeDefenceCommand(building, issued.params, commandContext, commandOwnership)
        if (binding.lastCommandResult.accepted) {
          building.automationControl = binding.policyId
          building.automationControlSequence = binding.activationSeq || 0
          if (previousIntent !== building.automationIntent || previousFireRequest !== building.automationIntent?.fireRequested || previousControl !== building.automationControl) recordAutomationDefenceIntent(building)
        }
      }
      if (!outcome.effects.length && previousIntent !== building.automationIntent) recordAutomationDefenceIntent(building)
      recordAutomationRuntime(building, binding, previousRuntime, outcome.trace)
      binding.active = gate !== 'paused' && Boolean(outcome.runtime.pending || (building.automationIntent?.issuerId === binding.policyId) || (outcome.runtime.hold && building.automationControl === binding.policyId))
      if (binding.active) building.policyActive = true
    }
  }
}

export function getDefencePolicySummary(building) {
  return (building?.policyBindings || []).map(binding => {
    const policy = getPolicyDocument(binding.policyId)
    const state = policy?.states.findIndex(item => item.id === binding.runtime.currentStateId)
    return { policyId: binding.policyId, name: policy?.name || binding.policyId, source: binding.source, stateIndex: state == null ? null : state + 1, enabled: true,
      active: Boolean(binding.active), holding: Boolean(binding.runtime.hold), pending: binding.runtime.pending,
      status: !isDefenceReady(building) ? 'inactive' : building.automationManualOverride ? 'manual' : binding.active ? 'controlling' : 'waiting', result: binding.lastCommandResult }
  })
}
