import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { executeUnitCommand } from '../../src/policies/unitCommandApi.js'
import { applyRecordedAutomationRuntime, applyRecordedAutomationUnitCommand, installAutomationReplayContext, recordAutomationRuntime } from '../../src/policies/automationReplay.js'
import { updateUnitPolicies } from '../../src/policies/policyEngine.js'
import { updateBasePolicies } from '../../src/policies/basePolicyEngine.js'
import { resetPolicyStore, savePolicy } from '../../src/policies/policyStore.js'
import { createBlankPolicy } from '../../src/policies/policyTemplates.js'
import { applyRecordedAutomationDefenceIntent } from '../../src/policies/automationReplay.js'

function tank(id = 'u') {
  return { id, type: 'tank', owner: 'player1', health: 100, x: 32, y: 32, tileX: 1, tileY: 1, turretDirection: 0 }
}

beforeEach(() => {
  gameState.replayMode = false
  gameState.simulationTime = 150
  gameState.replay = { recordingActive: true, recordingStartedAt: 0, commands: [] }
  resetPolicyStore()
})

describe('automation replay outputs', () => {
  it('records only accepted commands and replays the command without live machine execution', () => {
    const unit = tank()
    const ctx = { units: [unit], mapGrid: [], buildings: [], now: 150 }
    installAutomationReplayContext(ctx)
    expect(executeUnitCommand('turretLeft', unit, {}, ctx)).toBe(true)
    expect(executeUnitCommand('unknown', unit, {}, ctx)).toBe(false)
    expect(gameState.replay.commands).toHaveLength(1)
    const recorded = gameState.replay.commands[0].command
    expect(recorded.type).toBe('automation-unit-command')
    const rotation = unit.turretDirection
    const restored = tank()
    gameState.units = [restored]
    gameState.replayMode = true
    expect(applyRecordedAutomationUnitCommand(recorded, () => restored, {})).toBe(true)
    expect(restored.turretDirection).toBe(rotation)
    expect(gameState.replay.commands).toHaveLength(1)
    restored.policyBindings = [{ policyId: 'missing', runtime: { currentStateId: 'unchanged' } }]
    updateUnitPolicies([restored], ctx, 150)
    expect(restored.policyBindings[0].runtime.currentStateId).toBe('unchanged')
    const getMoney = vi.fn()
    updateBasePolicies({ owner: 'player1', getMoney }, 150)
    expect(getMoney).not.toHaveBeenCalled()
  })
  it('refuses foreign and unresolved replay entity references', () => {
    const unit = tank()
    installAutomationReplayContext({})
    const command = { name: 'turretLeft', owner: 'enemy', unitRef: { id: 'u' }, args: {} }
    expect(applyRecordedAutomationUnitCommand(command, () => unit, {})).toBe(false)
    expect(applyRecordedAutomationUnitCommand({ ...command, owner: 'player1', targetRef: { id: 'missing' } }, ref => ref.id === 'u' ? unit : null, {})).toBe(false)
  })
  it('records state changes but not idle/held cadence snapshots', () => {
    const entity = tank()
    const old = { currentStateId: 'a', hold: null, pending: null, finished: false }
    const binding = { policyId: 'p', behaviorRevision: 2, runtime: { ...old } }
    recordAutomationRuntime(entity, binding, old, { event: 'idle' })
    expect(gameState.replay.commands).toEqual([])
    binding.runtime.currentStateId = 'b'
    recordAutomationRuntime(entity, binding, old, { event: 'fired', branch: 'else' })
    entity.policyBindings = [{ policyId: 'p', behaviorRevision: 2, runtime: old }]
    const command = gameState.replay.commands[0].command
    expect(applyRecordedAutomationRuntime(command, () => entity)).toBe(true)
    expect(entity.policyBindings[0].runtime.currentStateId).toBe('b')
    expect(entity.policyBindings[0].lastTrace.branch).toBe('else')
  })
  it('refreshes defence inspection through a recorded hold and its cleanup without evaluation', () => {
    const policy = createBlankPolicy('replay-defence', 'defence')
    expect(savePolicy('player1', policy).ok).toBe(true)
    const building = { id: 'turret', isBuilding: true, owner: 'player1', policyBindings: [
      { policyId: policy.id, behaviorRevision: 1, runtime: { currentStateId: policy.initialStateId, hold: null, pending: null, finished: false } }
    ] }
    const resolve = () => building
    const intent = { entityRef: { id: building.id }, owner: building.owner, intent: { issuerId: policy.id, action: 'holdFire' }, control: policy.id }
    expect(applyRecordedAutomationDefenceIntent(intent, resolve)).toBe(true)
    expect(building.policyActive).toBe(true)
    expect(building.policyActiveCount).toBe(1)
    expect(applyRecordedAutomationDefenceIntent({ ...intent, intent: null, control: null }, resolve)).toBe(true)
    expect(building.policyActive).toBe(false)
    expect(building.policyBindings[0].active).toBe(false)
  })
  it('removes a completed individual unit binding during output-only replay', () => {
    const entity = tank()
    entity.policyBindings = [{ policyId: 'completed', source: 'unit', behaviorRevision: 1, runtime: {} }]
    expect(applyRecordedAutomationRuntime({ policyId: 'completed', behaviorRevision: 1,
      runtime: { currentStateId: 'end', finished: true }, trace: { event: 'finished' } }, () => entity)).toBe(true)
    expect(entity.policyBindings).toEqual([])
    expect(entity.policyActive).toBe(false)
  })
})
