import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutomationDraft } from '../../src/automation/automationDraft.js'
import {
  applyAutomationMutation, applyPolicyToUnit, exportAutomationSession, getAutomationRecovery,
  getPolicyDocument, getPolicyEntry, isPolicyEnabled, loadPolicyStore, resetPolicyStore,
  restoreAutomationSession, savePolicy, setPolicyEnabled, setBuildAutomationOptIn,
  setUnitBuildAutomationOptIn, isBuildAutomationOptedIn, isUnitBuildAutomationOptedIn
} from '../../src/policies/policyStore.js'
import { POLICY_TEMPLATES } from '../../src/policies/policyTemplates.js'
import { parseCFBL, printCFBL } from '../../src/automation/cfbl/index.js'

const machine = id => { const policy = POLICY_TEMPLATES[0].create(id); policy.scope = 'global'; return policy }

beforeEach(() => { localStorage.clear(); resetPolicyStore() })

describe('authoritative source and shared drafts', () => {
  it('[U00300] DAV-only save persists source without an independently editable machine', () => {
    expect(savePolicy('player', machine('source')).ok).toBe(true)
    const entry = getPolicyEntry('source')
    expect(entry.ownerId).toBe('player1')
    expect(parseCFBL(entry.source).diagnostics).toEqual([])
    const stored = JSON.parse(localStorage.getItem('cfb-automations-v2'))
    expect(stored.records[0].policy).toBeUndefined()
    expect(stored.records[0].source).toBe(entry.source)
    loadPolicyStore()
    expect(getPolicyEntry('source').source).toBe(entry.source)
  })

  it('[U00301] switches views, undo and redo synchronously without executing the draft', () => {
    savePolicy('player1', machine('draft'))
    const original = getPolicyEntry('draft').source
    const draft = createAutomationDraft('player1', 'draft')
    const revisions = []
    draft.subscribe(snapshot => revisions.push(snapshot.draftRevision))
    expect(draft.transact(policy => { policy.states[0].effect = { type: 'hold' }; return policy }).ok).toBe(true)
    expect(getPolicyEntry('draft').source).toBe(original)
    const changed = draft.getSnapshot().source
    expect(changed).not.toBe(original)
    draft.setView('atv')
    expect(draft.getSnapshot().source).toBe(changed)
    expect(draft.undo().ok).toBe(true)
    expect(draft.getSnapshot().source).toBe(original)
    draft.setView('dav')
    draft.redo()
    expect(draft.getSnapshot().source).toBe(changed)
    expect(draft.save().ok).toBe(true)
    expect(getPolicyEntry('draft').source).toBe(changed)
    expect(revisions).toContain(1)
  })

  it('[U00302] rejects invalid text and stale saves; cancel never changes the store', () => {
    savePolicy('player1', machine('stale'))
    const draft = createAutomationDraft('player1', 'stale')
    const original = draft.getSnapshot().source
    expect(draft.setSource('control unit eval javascript').ok).toBe(false)
    expect(draft.getSnapshot().source).toBe(original)
    const other = machine('stale')
    other.states[0].effect = { type: 'hold' }
    savePolicy('player1', other)
    expect(draft.save()).toMatchObject({ ok: false, reason: 'stale-version' })
    const current = getPolicyEntry('stale').source
    draft.cancel()
    expect(getPolicyEntry('stale').source).toBe(current)
  })

  it('[U00303] metadata rename and canonical no-op preserve bound runtime; behavior resets it without cancelling manual orders', () => {
    const policy = machine('bound')
    policy.scope = 'perUnit'
    savePolicy('player1', policy)
    const unit = { id: 'unit', owner: 'player1' }
    applyPolicyToUnit('player1', unit, 'bound')
    const runtime = unit.policyBindings[0].runtime
    runtime.steps = 19
    unit.policyControl = { order: { active: true, seq: 88 } }
    savePolicy('player1', { ...getPolicyDocument('bound'), name: 'Renamed' })
    expect(unit.policyBindings[0].runtime).toBe(runtime)
    expect(getPolicyEntry('bound').behaviorRevision).toBe(1)
    const changed = JSON.parse(JSON.stringify(getPolicyDocument('bound')))
    changed.states[0].effect = { type: 'hold' }
    savePolicy('player1', changed)
    expect(unit.policyBindings[0].runtime).not.toBe(runtime)
    expect(unit.policyBindings[0].runtime.steps).toBe(0)
    expect(unit.policyControl.order.active).toBe(true)
  })
})

describe('migration and resumable session', () => {
  it('[U00304] retains legacy source, non-first initial state, enablement, opt-ins and corrupt entry recovery idempotently', () => {
    const policy = machine('legacy')
    policy.initialStateId = policy.states.at(-1).id
    const legacy = { documents: [{ ownerId: 'player', policy }, { ownerId: 'player1', policy: { id: 'corrupt' } }],
      enabled: [], buildOptIn: ['player'], unitBuildOptIn: ['player'] }
    const raw = JSON.stringify(legacy)
    localStorage.setItem('cfb-unit-policies-v1', raw)
    loadPolicyStore()
    expect(getPolicyDocument('legacy').initialStateId).toBe(policy.initialStateId)
    expect(isPolicyEnabled('legacy')).toBe(false)
    expect(isBuildAutomationOptedIn('player1')).toBe(true)
    expect(isUnitBuildAutomationOptedIn('player1')).toBe(true)
    expect(getAutomationRecovery()[0]).toMatchObject({ id: 'corrupt', reason: 'legacy-migration' })
    expect(localStorage.getItem('cfb-unit-policies-v1')).toBe(raw)
    loadPolicyStore()
    expect(exportAutomationSession().records).toHaveLength(1)
    expect(getAutomationRecovery()[0].id).toBe('corrupt')
  })

  it('[U00305] full storage preserves a usable in-memory migration and old recovery backup', () => {
    const raw = JSON.stringify({ documents: [{ ownerId: 'player1', policy: machine('full') }] })
    localStorage.setItem('cfb-unit-policies-v1', raw)
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
    loadPolicyStore()
    expect(getPolicyEntry('full')).not.toBeNull()
    expect(getAutomationRecovery().some(error => error.reason === 'storage-write-failed')).toBe(true)
    expect(localStorage.getItem('cfb-unit-policies-v1')).toBe(raw)
    write.mockRestore()
  })

  it('[U00306] restores matching mid-delay and finished runtimes, keeps identities and rejects mismatched revisions', () => {
    const policy = machine('resume')
    policy.scope = 'perUnit'
    savePolicy('player1', policy)
    const unit = { id: 'u', owner: 'player1' }
    applyPolicyToUnit('player1', unit, 'resume')
    const binding = unit.policyBindings[0]
    binding.runtime.finished = true
    binding.runtime.steps = 12
    const session = exportAutomationSession([unit])
    const restored = { id: 'u', owner: 'player1' }
    expect(restoreAutomationSession(session, [restored]).ok).toBe(true)
    expect(restored.policyBindings[0].runtime).toEqual(binding.runtime)
    const projection = getPolicyDocument('resume')
    restoreAutomationSession({ ...session, records: undefined }, [restored])
    expect(getPolicyDocument('resume')).toBe(projection)
    expect(restored.policyBindings[0].runtime.steps).toBe(12)
    session.entityBindings[0].policyBindings[0].behaviorRevision += 1
    restoreAutomationSession(session, [restored])
    expect(restored.policyBindings).toEqual([])
  })

  it('[U00307] rejects foreign owner edits and suppresses duplicate per-unit applies', () => {
    const policy = machine('network')
    policy.scope = 'perUnit'
    savePolicy('player1', policy)
    const command = { operation: 'apply', actorId: 'player1', sequence: 50,
      payload: { entityKind: 'unit', entityId: 'u', policyId: policy.id, bindingSequence: 49 } }
    const unit = { id: 'u', owner: 'player1' }
    expect(applyAutomationMutation(command, [unit]).ok).toBe(true)
    unit.policyBindings[0].runtime.steps = 5
    expect(applyAutomationMutation(command, [unit])).toMatchObject({ ok: true, duplicate: true })
    expect(unit.policyBindings[0].runtime.steps).toBe(5)
    expect(applyAutomationMutation({ ...command, actorId: 'player2', sequence: 51 }, [unit])).toMatchObject({ ok: false, reason: 'not-owner' })
  })

  it('[U00308] source alone grants neither enablement nor production opt-in', () => {
    savePolicy('player1', machine('isolated'))
    const saved = exportAutomationSession()
    setPolicyEnabled('player1', 'isolated', true)
    setBuildAutomationOptIn('player1', true)
    setUnitBuildAutomationOptIn('player1', true)
    restoreAutomationSession(saved)
    expect(isPolicyEnabled('isolated')).toBe(false)
    expect(isBuildAutomationOptedIn('player1')).toBe(false)
    expect(isUnitBuildAutomationOptedIn('player1')).toBe(false)
  })
})

it('[U00309] remembers the view independently of source and rejects saved category changes', () => {
  savePolicy('player1', machine('category'))
  const draft = createAutomationDraft('player1', 'category')
  draft.setView('atv')
  expect(createAutomationDraft('player1', 'category').getSnapshot().viewPreference).toBe('atv')
  const parsed = parseCFBL(draft.getSnapshot().source)
  parsed.ast.variant = 'defence'
  expect(draft.setSource(printCFBL(parsed.ast)).ok).toBe(false)
})

it('[U00310] text insertions, deletions and reordering preserve old identities, and new nodes receive distinct IDs', () => {
  const policy = machine('identity')
  savePolicy('player1', policy)
  const draft = createAutomationDraft('player1', 'identity')
  const original = draft.getSnapshot()
  const ast = parseCFBL(original.source).ast
  const added = { id: 2, index: 2, effect: { type: 'hold' }, transitions: [] }
  ast.states[1].id = 3
  ast.states[1].index = 3
  ast.states[0].transitions[0].to = 3
  ast.states.splice(1, 0, added)
  expect(draft.setSource(printCFBL(ast)).ok).toBe(true)
  const inserted = draft.getSnapshot()
  expect(inserted.identityMap.states[0]).toBe(original.identityMap.states[0])
  expect(inserted.identityMap.states[2]).toBe(original.identityMap.states[1])
  expect(inserted.identityMap.states[1]).not.toBe(original.identityMap.states[1])
  draft.undo()
  expect(draft.getSnapshot().identityMap).toEqual(original.identityMap)
  draft.redo()
  expect(draft.getSnapshot().identityMap).toEqual(inserted.identityMap)
  ast.states.splice(1, 1)
  ast.states[1].id = 2
  ast.states[1].index = 2
  ast.states[0].transitions[0].to = 2
  draft.setSource(printCFBL(ast))
  expect(draft.getSnapshot().identityMap).toEqual(original.identityMap)
  ast.states.reverse()
  ast.states.forEach((state, index) => { state.id = index + 1; state.index = index + 1 })
  ast.initialStateId = 2
  ast.states[1].transitions[0].to = 1
  expect(draft.setSource(printCFBL(ast)).ok).toBe(true)
  expect(draft.getSnapshot().identityMap.states).toEqual([...original.identityMap.states].reverse())
})

it('[U00311] repeated runtime-only snapshots preserve compiled artifact identity and never restore another executor’s producer', async() => {
  const { getCompiledPolicyProgram, registerAutomationRuntimeProvider, getPolicyStoreVersion } = await import('../../src/policies/policyStore.js')
  savePolicy('player1', machine('prepared'))
  const exportRuntime = vi.fn(() => [{ ownerId: 'player1', runtime: { steps: 7 } }])
  const restoreRuntime = vi.fn()
  const unregister = registerAutomationRuntimeProvider('test-owner-producer', { export: exportRuntime, restore: restoreRuntime })
  const session = exportAutomationSession()
  const program = getCompiledPolicyProgram('prepared')
  const version = getPolicyStoreVersion()
  for (let count = 0; count < 5; count++) {
    restoreAutomationSession({ ...session, records: undefined }, [], { authority: 'host-snapshot' })
    expect(getCompiledPolicyProgram('prepared')).toBe(program)
    expect(getPolicyStoreVersion()).toBe(version)
  }
  expect(restoreRuntime).not.toHaveBeenCalled()
  restoreAutomationSession(session)
  expect(restoreRuntime).toHaveBeenCalledOnce()
  unregister()
})

it('[U00312] detects a stale metadata-only rename without resetting behavior', () => {
  savePolicy('player1', machine('rename-conflict'))
  const draft = createAutomationDraft('player1', 'rename-conflict')
  savePolicy('player1', { ...getPolicyDocument('rename-conflict'), name: 'Other title' })
  expect(getPolicyEntry('rename-conflict').behaviorRevision).toBe(1)
  expect(draft.save()).toMatchObject({ ok: false, reason: 'stale-version' })
})

it('[U00313] typed session bindings never target a building with the same ID as a unit', () => {
  const policy = machine('collision')
  policy.scope = 'perUnit'
  savePolicy('player1', policy)
  const unit = { id: 'same', type: 'tank', owner: 'player1' }
  applyPolicyToUnit('player1', unit, policy.id)
  const session = exportAutomationSession([unit])
  const restored = { id: 'same', type: 'tank', owner: 'player1' }
  const building = { id: 'same', type: 'turretGunV1', owner: 'player1', isBuilding: true }
  restoreAutomationSession(session, [building, restored])
  expect(restored.policyBindings).toHaveLength(1)
  expect(building.policyBindings).toBeUndefined()
  session.entityBindings[0].entityKind = 'building'
  restoreAutomationSession(session, [building, restored])
  expect(building.policyBindings).toEqual([])
})

it('[U00314] resumes active AFTER and WHILE progression rather than restarting the program', async() => {
  const { createPolicyRuntime, stepPolicy } = await import('../../src/policies/policyStep.js')
  for (const templateId of ['advance-after-delay', 'retreat-while-hurt']) {
    const policy = POLICY_TEMPLATES.find(template => template.id === templateId).create(templateId)
    savePolicy('player1', policy)
    const unit = { id: templateId, owner: 'player1' }
    applyPolicyToUnit('player1', unit, policy.id)
    const savedPolicy = getPolicyDocument(policy.id)
    const view = { now: 1500, hp: 0.1 }
    unit.policyBindings[0].runtime = stepPolicy(savedPolicy, createPolicyRuntime(savedPolicy), view).runtime
    const resumed = { id: unit.id, owner: 'player1' }
    restoreAutomationSession(exportAutomationSession([unit]), [resumed])
    expect(resumed.policyBindings[0].runtime).toEqual(unit.policyBindings[0].runtime)
    const nextView = { now: 6000, hp: 0.1 }
    expect(stepPolicy(savedPolicy, resumed.policyBindings[0].runtime, nextView)).toEqual(stepPolicy(savedPolicy, unit.policyBindings[0].runtime, nextView))
  }
})

it('[U00315] installs the sender’s agreed behavior revision on a new executing peer', async() => {
  const { getCompiledPolicyProgram } = await import('../../src/policies/policyStore.js')
  savePolicy('player1', machine('peer-source'))
  const record = exportAutomationSession().records[0]
  resetPolicyStore()
  const command = { operation: 'save', actorId: 'player1', sequence: 90,
    payload: { ...record, behaviorRevision: 7, revision: 9 } }
  expect(applyAutomationMutation(command).ok).toBe(true)
  expect(getPolicyEntry(record.id).behaviorRevision).toBe(7)
  expect(getCompiledPolicyProgram(record.id).behaviorRevision).toBe(7)
  expect(getPolicyEntry(record.id).revision).toBe(9)
  expect(isPolicyEnabled(record.id)).toBe(false)
  const program = getCompiledPolicyProgram(record.id)
  expect(applyAutomationMutation(command)).toMatchObject({ duplicate: true })
  expect(getCompiledPolicyProgram(record.id)).toBe(program)
})

it('[U00316] restores the live manual attack reference and preserves its arbitration gate', async() => {
  const { noteDirectOrder, isUnitIdle, updateUnitPolicies } = await import('../../src/policies/policyEngine.js')
  const policy = machine('manual-gate')
  policy.scope = 'perUnit'
  savePolicy('player1', policy)
  const enemy = { id: 'target', type: 'tank_v1', owner: 'player2', health: 100, x: 64, y: 64 }
  const unit = { id: 'manual', type: 'tank_v1', owner: 'player1', health: 10, maxHealth: 100, x: 0, y: 0, target: enemy }
  applyPolicyToUnit('player1', unit, policy.id)
  noteDirectOrder([unit], 100)
  const session = exportAutomationSession([unit, enemy])
  expect(session.entityBindings[0].policyControl.order.targetIdentity).toMatchObject({ id: enemy.id, entityKind: 'unit' })
  const restoredEnemy = { ...enemy }
  const restored = { ...unit, policyBindings: [], policyControl: null, target: restoredEnemy }
  restoreAutomationSession(session, [restored, restoredEnemy])
  expect(restored.policyControl.order.targetRef).toBe(restoredEnemy)
  expect(Object.keys(restored.policyControl.order)).not.toContain('targetRef')
  expect(isUnitIdle(restored, restored.policyControl.order.targetRef, false)).toBe(false)
  const context = { units: [restored, restoredEnemy], buildings: [], factories: [], mapGrid: [] }
  updateUnitPolicies(context.units, context, 2000)
  expect(restored.policyControl.order.active).toBe(true)
  expect(restored.policyBindings[0].runtime.currentStateId).toBe(policy.initialStateId)
})
