import { beforeEach, describe, expect, it } from 'vitest'
import { gameState } from '../../src/gameState.js'
import { TILE_SIZE } from '../../src/config.js'
import { createBlankPolicy } from '../../src/policies/policyTemplates.js'
import { DEFENCE_CAPABILITIES, isDefenceReady, defenceCapabilityReason } from '../../src/policies/defenceCapabilities.js'
import { executeDefenceCommand, clearDefenceIntent, noteDefenceDirectOrder, releaseDefenceManualOverride } from '../../src/policies/defenceCommandApi.js'
import { canDefenceTarget, nearestDefenceEnemy, measureDefenceLeaf, prepareDefenceWorld, defenceTargetById } from '../../src/policies/defenceSensors.js'
import { updateDefencePolicies, getDefencePolicySummary, teardownDefenceAutomation } from '../../src/policies/defencePolicyEngine.js'
import { applyPolicyToBuilding, deletePolicy, exportAutomationSession, getPolicyDocument, resetPolicyStore, restoreAutomationSession, savePolicy, setPolicyEnabled } from '../../src/policies/policyStore.js'
import { applyRecordedAutomationDefenceIntent, recordAutomationDefenceIntent } from '../../src/policies/automationReplay.js'

function turret(type = 'turretGunV1', owner = 'player1', id = 'building') {
  return { id, type, owner, isBuilding: true, constructionFinished: true, health: 100, maxHealth: 100, x: 10, y: 10, width: 2, height: 2,
    turretDirection: 0, fireRange: 8, minFireRange: 0, fireCooldown: 1000, ammo: 20, maxAmmo: 20 }
}
function context(buildings = [], units = []) {
  return { buildings, units, now: 150, owner: 'player1', isVisible: () => true, getPower: () => 100, getMoney: () => 1000, hasLineOfSight: () => true }
}
function policy(id = 'defence', kind = 'while', scope = 'perUnit', effect = 'holdFire') {
  const doc = createBlankPolicy(id, 'defence')
  doc.scope = scope
  doc.initialStateId = 's1'
  doc.states = [
    { id: 's1', name: '1', effect: null, transitions: [{ id: 'rule', kind, when: { type: 'compare', field: 'hp', mode: 'relative', op: '<', value: 0.5 }, to: 's2', ...(kind === 'after' ? { delaySeconds: 1 } : {}) }] },
    { id: 's2', name: '2', effect: { type: effect }, transitions: [] }
  ]
  expect(savePolicy('player1', doc).ok).toBe(true)
  return getPolicyDocument(id)
}

beforeEach(() => { localStorage.clear(); resetPolicyStore(); gameState.replayMode = false; gameState.replay = { recordingActive: false, commands: [] } })

describe('defence capabilities and commands', () => {
  it.each(Object.keys(DEFENCE_CAPABILITIES))('offers only real %s capabilities and accepts its supported actions', type => {
    const building = turret(type)
    const enemy = { id: 'enemy', type: 'tank', owner: 'player2', health: 100, x: 12 * TILE_SIZE, y: 10 * TILE_SIZE }
    const ctx = { ...context([building], [enemy]), nearestEnemy: () => enemy, targetById: () => enemy, canTarget: () => true }
    for (const action of DEFENCE_CAPABILITIES[type].actions) {
      building.automationIntent = { targetId: 'enemy' }
      expect(executeDefenceCommand(building, { type: action }, ctx, { issuerId: 'p', revision: 1 }).accepted).toBe(true)
    }
    expect(executeDefenceCommand(building, { type: 'moveForward' }, ctx).reason).toBe('unsupported-capability')
    if (type === 'teslaCoil') expect(defenceCapabilityReason(building, 'fields', 'turretRotation')).toBe('unsupported-capability')
    if (!type.startsWith('turretGun')) expect(executeDefenceCommand(building, { type: 'fireForward' }, ctx).reason).toBe('unsupported-capability')
  })

  it('refuses owner, dead/construction, cooldown, power, ammo and unavailable target atomically', () => {
    const b = turret('rocketTurret')
    const target = { id: 'enemy', health: 10 }
    const ctx = { ...context(), targetById: () => target, canTarget: () => true }
    b.automationIntent = { targetId: 'enemy', issuerId: 'prior' }
    const prior = b.automationIntent
    expect(executeDefenceCommand(b, { type: 'holdFire' }, { ...ctx, owner: 'player2' }).reason).toBe('foreign-owner')
    b.constructionFinished = false
    expect(executeDefenceCommand(b, { type: 'holdFire' }, ctx).reason).toBe('incomplete-or-dead')
    b.constructionFinished = true
    expect(executeDefenceCommand(b, { type: 'fireAtLocked' }, { ...ctx, getPower: () => -1 }).reason).toBe('low-power')
    b.ammo = 0
    expect(executeDefenceCommand(b, { type: 'fireAtLocked' }, ctx).reason).toBe('empty-ammo')
    b.ammo = 1; b.lastShotTime = 100
    expect(executeDefenceCommand(b, { type: 'fireAtLocked' }, ctx).reason).toBe('reload-pending')
    expect(executeDefenceCommand(b, { type: 'aimNearestEnemy' }, ctx).reason).toBe('no-valid-target')
    expect(b.automationIntent).toBe(prior)
    b.holdFire = true
    expect(executeDefenceCommand(b, { type: 'resumeFire' }, ctx).reason).toBe('manual-hold-fire')
  })

  it('never grants hidden, airborne or submerged targets; uses deterministic centers and locks', () => {
    const b = turret()
    const near = { id: 'a', type: 'tank', owner: 'player2', health: 100, x: 12 * TILE_SIZE, y: 11 * TILE_SIZE }
    const same = { ...near, id: 'b' }
    const ctx = context([b], [same, near])
    expect(nearestDefenceEnemy(b, ctx, true)).toBe(near)
    expect(canDefenceTarget(b, near, { ...ctx, isVisible: () => false })).toBe(false)
    expect(canDefenceTarget(b, { ...near, type: 'submarine', depthState: 'submerged' }, ctx)).toBe(false)
    expect(canDefenceTarget(b, { ...near, type: 'apache', flightState: 'airborne' }, ctx)).toBe(false)
    expect(canDefenceTarget(turret('rocketTurret'), { ...near, type: 'apache', flightState: 'airborne' }, ctx)).toBe(true)
    expect(canDefenceTarget(b, near, { ...ctx, hasLineOfSight: () => false })).toBe(false)
    b.minFireRange = 4
    expect(canDefenceTarget(b, near, ctx)).toBe(false)
    expect(measureDefenceLeaf(b, { type: 'compare', field: 'enemyDistance', mode: 'absolute' }, ctx)).toBe(Math.hypot(1.5, 0.5))
    prepareDefenceWorld(ctx)
    expect(defenceTargetById('a')).toBe(near)
    expect(measureDefenceLeaf(turret('teslaCoil'), { type: 'compare', field: 'ammo', mode: 'relative' }, ctx)).toBeUndefined()
  })
})

describe('compiled defence machine lifecycle', () => {
  it('runs WHILE at simulation cadence and clears only its temporary owned intent on return', () => {
    const b = turret(); b.health = 20
    policy()
    expect(applyPolicyToBuilding('player1', b, 'defence').ok).toBe(true)
    const ctx = context([b])
    updateDefencePolicies([b], ctx, 150)
    expect(b.automationIntent).toMatchObject({ action: 'holdFire', issuerId: 'defence', temporary: true })
    expect(getDefencePolicySummary(b)[0]).toMatchObject({ stateIndex: 2, holding: true })
    expect(clearDefenceIntent(b, 'other')).toBe(false)
    b.health = 100
    updateDefencePolicies([b], ctx, 299)
    expect(b.automationIntent).not.toBeNull()
    updateDefencePolicies([b], ctx, 300)
    expect(b.automationIntent).toBeNull()
    expect(getDefencePolicySummary(b)[0].stateIndex).toBe(1)
  })

  it('supports IF/ELSE and simulation-time AFTER without executing initial actions', () => {
    const b = turret()
    const doc = policy('paired', 'if')
    const changed = JSON.parse(JSON.stringify(doc))
    changed.states.push({ id: 's3', name: '3', effect: { type: 'turretRight' }, transitions: [] })
    changed.states[0].transitions[0].elseTo = 's3'
    expect(savePolicy('player1', changed).ok).toBe(true)
    applyPolicyToBuilding('player1', b, 'paired')
    const ctx = context([b])
    updateDefencePolicies([b], ctx, 150)
    expect(b.automationIntent.action).toBe('turretRight')
    const delayed = turret('turretGunV1', 'player1', 'delayed'); delayed.health = 20
    policy('delay', 'after')
    applyPolicyToBuilding('player1', delayed, 'delay')
    updateDefencePolicies([delayed], context([delayed]), 150)
    expect(delayed.automationIntent).toBeUndefined()
    updateDefencePolicies([delayed], context([delayed]), 1000)
    expect(delayed.automationIntent).toBeUndefined()
    updateDefencePolicies([delayed], context([delayed]), 1150)
    expect(delayed.automationIntent.action).toBe('holdFire')
  })

  it('binds only completed owner defences globally including newly completed buildings and tears down sale/death', () => {
    policy('global', 'if', 'global')
    setPolicyEnabled('player1', 'global', true)
    const b = turret(); b.health = 20
    const enemy = turret('turretGunV1', 'player2', 'foreign')
    const pending = turret('rocketTurret', 'player1', 'new'); pending.constructionFinished = false
    const buildings = [b, enemy, pending]
    const ctx = context(buildings)
    updateDefencePolicies(buildings, ctx, 150)
    expect(b.policyBindings[0].entityKind).toBe('building')
    expect(enemy.policyBindings).toEqual([])
    expect(pending.policyBindings).toBeUndefined()
    pending.constructionFinished = true; pending.health = 20
    updateDefencePolicies(buildings, ctx, 300)
    expect(pending.automationIntent.action).toBe('holdFire')
    b.isBeingSold = true; pending.health = 0
    updateDefencePolicies(buildings, ctx, 450)
    expect(b.automationIntent).toBeNull()
    expect(pending.policyBindings).toBeNull()
    expect(isDefenceReady(b)).toBe(false)
  })

  it('manual hold is persistent; manual attacks win immediately; explicit release allows fresh WHILE takeovers', () => {
    const b = turret(); b.health = 20
    policy(); applyPolicyToBuilding('player1', b, 'defence')
    const ctx = context([b])
    b.holdFire = true; noteDefenceDirectOrder(b, 'holdFire', 100)
    updateDefencePolicies([b], ctx, 150)
    expect(b.automationIntent).toBeUndefined()
    expect(b.policyBindings[0].runtime.hold).toBeNull()
    releaseDefenceManualOverride(b)
    updateDefencePolicies([b], ctx, 300)
    expect(b.automationIntent.action).toBe('holdFire')
    noteDefenceDirectOrder(b, 'attack', 350)
    expect(b.automationIntent).toBeNull()
    expect(b.policyBindings[0].active).toBe(false)
  })

  it('retains terminal one-time command ownership, serializes typed intent/runtime, clears revision/delete and skips replay', () => {
    const b = turret(); b.health = 20
    const doc = policy('terminal', 'if')
    expect(savePolicy('player1', { ...doc, execution: 'oneTime' }).ok).toBe(true)
    applyPolicyToBuilding('player1', b, 'terminal')
    const ctx = context([b])
    updateDefencePolicies([b], ctx, 150)
    expect(b.policyBindings[0].runtime.finished).toBe(true)
    expect(b.automationIntent.action).toBe('holdFire')
    const snapshot = exportAutomationSession([b])
    const restored = turret()
    expect(restoreAutomationSession(snapshot, [restored]).ok).toBe(true)
    expect(restored.automationIntent).toEqual(b.automationIntent)
    expect(restored.policyBindings[0].entityKind).toBe('building')
    gameState.replayMode = true
    const before = restored.policyBindings[0].runtime
    updateDefencePolicies([restored], ctx, 300)
    expect(restored.policyBindings[0].runtime).toBe(before)
    gameState.replayMode = false
    deletePolicy('player1', 'terminal')
    expect(restored.automationIntent).toBeNull()
    teardownDefenceAutomation(restored)
    expect(restored.policyBindings).toBeNull()
  })

  it('records accepted final intents and replays them without a live engine', () => {
    const b = turret()
    b.automationIntent = { issuerId: 'p', owner: 'player1', action: 'holdFire', revision: 1, temporary: false }
    gameState.replay = { recordingActive: true, recordingStartedAt: 0, commands: [] }
    recordAutomationDefenceIntent(b)
    const command = gameState.replay.commands[0].command
    const restored = turret()
    expect(applyRecordedAutomationDefenceIntent(command, () => restored)).toBe(true)
    expect(restored.automationIntent).toEqual(b.automationIntent)
    expect(applyRecordedAutomationDefenceIntent(command, () => turret('turretGunV1', 'player2'))).toBe(false)
  })

  it('newer transitions dominate older held reassertions even when the new action resumes normal fire', () => {
    const b = turret(); b.health = 20
    policy('old', 'while'); policy('new', 'if', 'perUnit', 'resumeFire')
    applyPolicyToBuilding('player1', b, 'old'); applyPolicyToBuilding('player1', b, 'new')
    const ctx = context([b])
    updateDefencePolicies([b], ctx, 150)
    expect(b.automationIntent).toBeNull()
    expect(b.automationControl).toBe('new')
    updateDefencePolicies([b], ctx, 300)
    expect(b.automationIntent).toBeNull()
    expect(b.automationControl).toBe('new')
  })

  it('re-enabling resets global runtimes and ownership changes remove old owner bindings/intents', () => {
    const b = turret(); b.health = 20
    policy('global-restart', 'if', 'global'); setPolicyEnabled('player1', 'global-restart', true)
    const ctx = context([b])
    updateDefencePolicies([b], ctx, 150)
    const oldRuntime = b.policyBindings[0].runtime
    setPolicyEnabled('player1', 'global-restart', false)
    expect(b.automationIntent).toBeNull()
    setPolicyEnabled('player1', 'global-restart', true)
    updateDefencePolicies([b], ctx, 300)
    expect(b.policyBindings[0].runtime).not.toBe(oldRuntime)
    expect(b.automationIntent.action).toBe('holdFire')
    b.owner = 'player2'
    updateDefencePolicies([b], ctx, 450)
    expect(b.policyBindings).toEqual([])
    expect(b.automationIntent).toBeNull()
  })
})
