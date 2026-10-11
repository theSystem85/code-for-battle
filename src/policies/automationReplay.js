// Replay records accepted automation commands, not a second evaluation of CFBL.
import { gameState } from '../gameState.js'
import { createReplayEntityReference, recordReplayCommand } from '../replayCommandPrimitives.js'
import { executeUnitCommand } from './unitCommandApi.js'

let replayContext = null
export function installAutomationReplayContext(context) { replayContext = context }

export function recordAutomationUnitCommand(name, unit, args) {
  if (gameState.replayMode || !gameState.replay?.recordingActive) return
  const resolvedTarget = name === 'autoAttackInRange' ? unit.policyNoChase : args.target
  recordReplayCommand({
    type: 'automation-unit-command', owner: unit.owner,
    unitRef: createReplayEntityReference(unit),
    name: name === 'autoAttackInRange' ? 'attackInRange' : name,
    args: { tiles: args.tiles, tileX: args.tileX, tileY: args.tileY, resource: args.resource },
    targetRef: resolvedTarget ? createReplayEntityReference(resolvedTarget) : null
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
  return executeUnitCommand(command.name, unit, { ...command.args, target }, replayContext)
}

export function recordAutomationRuntime(entity, binding, previousRuntime, trace) {
  if (gameState.replayMode || !gameState.replay?.recordingActive) return
  // Idle/held reassertions do not grow a full per-evaluation state history.
  if (binding.runtime.currentStateId === previousRuntime.currentStateId &&
      binding.runtime.hold === previousRuntime.hold && binding.runtime.pending === previousRuntime.pending &&
      binding.runtime.finished === previousRuntime.finished) return
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
  return true
}
