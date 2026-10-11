import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { executeUnitCommand } from '../../src/policies/unitCommandApi.js'
import { applyRecordedAutomationRuntime, applyRecordedAutomationUnitCommand, installAutomationReplayContext, recordAutomationRuntime } from '../../src/policies/automationReplay.js'
import { updateUnitPolicies } from '../../src/policies/policyEngine.js'
import { updateBasePolicies } from '../../src/policies/basePolicyEngine.js'

function tank(id = 'u') {
  return { id, type: 'tank', owner: 'player1', health: 100, x: 32, y: 32, tileX: 1, tileY: 1, turretDirection: 0 }
}

beforeEach(() => {
  gameState.replayMode = false
  gameState.simulationTime = 150
  gameState.replay = { recordingActive: true, recordingStartedAt: 0, commands: [] }
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
})
