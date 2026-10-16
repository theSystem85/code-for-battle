// Replay records accepted automation commands, not a second evaluation of CFBL.
import { gameState } from '../gameState.js'
import { createReplayEntityReference, recordReplayCommand } from '../replayCommandPrimitives.js'
import { executeUnitCommand } from './unitCommandApi.js'
import { refreshRecordedAutomationActivity } from './policyActivity.js'

let replayContext = null
export function installAutomationReplayContext(context) { replayContext = context }

export function recordAutomationUnitCommand(name, unit, args) {
  if (gameState.replayMode || !gameState.replay?.recordingActive) return
  const resolvedTarget = name === 'autoAttackInRange' ? unit.policyNoChase : args.target
  recordReplayCommand({
    type: 'automation-unit-command', owner: unit.owner,
    unitRef: createReplayEntityReference(unit),
    name: name === 'autoAttackInRange' ? 'attackInRange' : name,
    args: { ...(args.order ? { order: args.order } : {}), tiles: args.tiles, tileX: args.tileX, tileY: args.tileY, resource: args.resource },
    targetRef: resolvedTarget ? createReplayEntityReference(resolvedTarget) : null,
    control: globalThis.structuredClone(unit.policyControl || null),
    orderTargetRef: unit.policyControl?.order?.targetRef ? createReplayEntityReference(unit.policyControl.order.targetRef) : null
  }, { source: 'automation' })
}

export function applyRecordedAutomationUnitCommand(command, resolveEntity, commands) {
  if (!replayContext) return false
  const unit = resolveEntity(command.unitRef)
  if (!unit || unit.isBuilding || unit.owner !== command.owner) return false
  const target = command.targetRef ? resolveEntity(command.targetRef) : null
  if (command.targetRef && !target) return false
  replayContext.now = gameState.simulationTime || 0
  replayContext.units = gameState.units || []
  replayContext.buildings = gameState.buildings || []
  replayContext.factories = gameState.factories || []
  replayContext.mapGrid = gameState.mapGrid || []
  replayContext.bullets = gameState.bullets || []
  replayContext.commands = commands
  const accepted = executeUnitCommand(command.name, unit, { ...command.args, target }, replayContext)
  if (accepted && 'control' in command) {
    unit.policyControl = globalThis.structuredClone(command.control)
    if (unit.policyControl?.order) Object.defineProperty(unit.policyControl.order, 'targetRef', {
      value: command.orderTargetRef ? resolveEntity(command.orderTargetRef) : null, enumerable: false, writable: true
    })
  }
  if (accepted) refreshRecordedAutomationActivity(unit)
  return accepted
}

export function recordAutomationRuntime(entity, binding, previousRuntime, trace) {
  if (gameState.replayMode || !gameState.replay?.recordingActive) return
  // Idle/held reassertions do not grow a full per-evaluation state history.
  if (binding.runtime.currentStateId === previousRuntime.currentStateId &&
      binding.runtime.hold === previousRuntime.hold && binding.runtime.pending === previousRuntime.pending &&
      binding.runtime.finished === previousRuntime.finished && binding.runtime.wait === previousRuntime.wait) return
  recordReplayCommand({
    type: 'automation-runtime', entityRef: createReplayEntityReference(entity),
    policyId: binding.policyId, behaviorRevision: binding.behaviorRevision,
    runtime: globalThis.structuredClone(binding.runtime), trace: { ...trace }
  }, { source: 'automation' })
}

export function applyRecordedAutomationRuntime(command, resolveEntity) {
  const entity = resolveEntity(command.entityRef)
  const binding = entity?.policyBindings?.find(item => item.policyId === command.policyId && item.behaviorRevision === command.behaviorRevision)
  if (!binding || !command.runtime) return false
  binding.runtime = globalThis.structuredClone(command.runtime)
  binding.lastTrace = { ...command.trace }
  if (!entity.isBuilding && binding.source === 'unit' && binding.runtime.finished) {
    entity.policyBindings.splice(entity.policyBindings.indexOf(binding), 1)
  }
  refreshRecordedAutomationActivity(entity)
  return true
}

export function recordAutomationDefenceIntent(building) {
  if (gameState.replayMode || !gameState.replay?.recordingActive) return
  recordReplayCommand({ type: 'automation-defence-intent', entityRef: createReplayEntityReference(building), owner: building.owner,
    intent: globalThis.structuredClone(building.automationIntent || null),
    manualOverride: globalThis.structuredClone(building.automationManualOverride || null), control: building.automationControl || null, controlSequence: building.automationControlSequence || 0
  }, { source: 'automation' })
}

export function applyRecordedAutomationDefenceIntent(command, resolveEntity) {
  const building = resolveEntity(command.entityRef)
  if (!building?.isBuilding || building.owner !== command.owner) return false
  building.automationIntent = globalThis.structuredClone(command.intent)
  building.automationManualOverride = globalThis.structuredClone(command.manualOverride)
  building.automationControl = command.control
  building.automationControlSequence = command.controlSequence || 0
  refreshRecordedAutomationActivity(building)
  return true
}
