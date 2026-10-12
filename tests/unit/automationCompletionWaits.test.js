import { beforeEach, expect, it, vi } from 'vitest'
import { TILE_SIZE } from '../../src/config.js'
import { gameState } from '../../src/gameState.js'
import { createBlankPolicy } from '../../src/policies/policyTemplates.js'
import { applyPolicyToUnit, exportAutomationSession, getPolicyDocument, resetPolicyStore, restoreAutomationSession, savePolicy, setPolicyEnabled, setBuildAutomationOptIn, setUnitBuildAutomationOptIn } from '../../src/policies/policyStore.js'
import { createPolicyRuntime, stepPolicy } from '../../src/policies/policyStep.js'
import { updateUnitPolicies, noteDirectOrder } from '../../src/policies/policyEngine.js'
import { exportBaseAutomationRuntime, getBasePolicyStatus, resetBasePolicyEngine, updateBasePolicies } from '../../src/policies/basePolicyEngine.js'
import { applyProductionCompletionAck, completeProductionItem, createCompletionReceipt, failCompletionReceipt, getCompletionReceipt } from '../../src/policies/completionReceipts.js'
import { noteCompletionTargetDestroyed, unitCompletionStatus } from '../../src/policies/unitCompletion.js'

const OWNER = 'player1'
function machine(id, effect, variant = 'unit', terminal = false) {
  const p = createBlankPolicy(id)
  p.variant = variant
  p.scope = variant === 'unit' ? 'perUnit' : 'global'
  p.execution = terminal ? 'oneTime' : 'continuous'
  p.initialStateId = 'watch'
  p.states = [
    { id: 'watch', effect: null, transitions: [{ id: 'start', kind: 'if', when: { type: 'always' }, to: 'act' }] },
    { id: 'act', effect: { ...effect, waitForCompletion: true }, transitions: terminal ? [] : [{ id: 'next', kind: 'if', when: { type: 'always' }, to: 'done' }] },
    ...(!terminal ? [{ id: 'done', effect: null, transitions: [] }] : [])
  ]
  return p
}
function unit(id = 'unit') { return { id, type: 'tank', owner: OWNER, health: 100, maxHealth: 100, x: 32, y: 32, tileX: 1, tileY: 1, direction: 0, path: [] } }
function unitContext(actor) {
  const movement = vi.fn((actors, px, py) => { actors[0].moveTarget = { x: Math.floor(px / TILE_SIZE), y: Math.floor(py / TILE_SIZE) }; actors[0].path = [{ ...actors[0].moveTarget }] })
  return { units: [actor], buildings: [], factories: [], mapGrid: Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => ({ type: 'grass' }))), commands: { handleMovementCommand: movement }, movement }
}
beforeEach(() => { localStorage.clear(); resetPolicyStore(); resetBasePolicyEngine(); gameState.replayMode = false; gameState.replay = null; gameState.humanPlayer = OWNER })

it('pure step freezes rules and one-time completion until the accepted objective completes', () => {
  const p = machine('pure', { type: 'moveForward', tiles: 2 }, 'unit', true)
  const entered = stepPolicy(p, createPolicyRuntime(p), {})
  expect(entered.runtime.finished).toBe(false)
  expect(entered.runtime.wait.status).toBe('issuing')
  expect(stepPolicy(p, entered.runtime, {}).effects).toEqual([])
  entered.runtime.wait.status = 'completed'
  expect(stepPolicy(p, entered.runtime, {}).runtime.finished).toBe(true)
})

it('an exact movement waits for stopped arrival, never unrelated idle, and is not reissued', () => {
  const p = machine('move', { type: 'moveForward', tiles: 2 })
  expect(savePolicy(OWNER, p).ok).toBe(true)
  const actor = unit()
  applyPolicyToUnit(OWNER, actor, p.id)
  const ctx = unitContext(actor)
  updateUnitPolicies(ctx.units, ctx, 0)
  expect(ctx.movement).toHaveBeenCalledTimes(1)
  expect(actor.policyBindings[0].runtime.currentStateId).toBe('act')
  updateUnitPolicies(ctx.units, ctx, 150)
  expect(ctx.movement).toHaveBeenCalledTimes(1)
  actor.x = 3 * TILE_SIZE
  updateUnitPolicies(ctx.units, ctx, 300)
  expect(actor.policyBindings[0].runtime.currentStateId).toBe('act')
  actor.moveTarget = null; actor.path = []
  updateUnitPolicies(ctx.units, ctx, 450)
  expect(actor.policyBindings[0].runtime.currentStateId).toBe('done')
  expect(ctx.movement).toHaveBeenCalledTimes(1)
})

it('manual replacement fails a receipt instead of completing another objective', () => {
  const p = machine('manual', { type: 'moveForward', tiles: 2 }, 'unit', true)
  savePolicy(OWNER, p)
  const actor = unit(); applyPolicyToUnit(OWNER, actor, p.id)
  const ctx = unitContext(actor); updateUnitPolicies(ctx.units, ctx, 0)
  noteDirectOrder([actor], 20)
  actor.path = []; actor.moveTarget = null
  updateUnitPolicies(ctx.units, ctx, 1000)
  expect(actor.policyBindings).toHaveLength(1)
  expect(actor.policyBindings[0].runtime.wait).toMatchObject({ status: 'failed', reason: 'a direct order superseded this objective' })
  expect(actor.policyBindings[0].runtime.finished).toBe(false)
})

it('tracks exact attack destruction after target cleanup, without accepting a missing/sold target', () => {
  const actor = unit()
  const enemy = { ...unit('enemy'), owner: 'player2' }
  const objective = { kind: 'attack', ownerId: OWNER, target: { entityKind: 'unit', id: enemy.id, ownerId: enemy.owner } }
  actor.target = enemy
  const ctx = { units: [actor, enemy], buildings: [] }
  expect(unitCompletionStatus(actor, objective, ctx, 0).status).toBe('pending')
  enemy.health = 0; noteCompletionTargetDestroyed(enemy, 'unit'); ctx.units = [actor]
  expect(unitCompletionStatus(actor, objective, ctx, 150).status).toBe('completed')
  expect(unitCompletionStatus(actor, { ...objective, destroyed: false, target: { ...objective.target, id: 'missing' } }, ctx, 300).status).toBe('failed')
})

function baseContext() {
  let receiptId
  const queue = vi.fn((type, placement, id) => { receiptId = id; return true })
  return { owner: OWNER, units: [], buildings: [], getMoney: () => 10000, getPower: () => 20,
    build: { lockReason: () => null, hasConstructionYard: () => true, isAvailable: () => true, isQueueBusy: () => false, getCost: () => 100, findPlacement: () => ({ x: 3, y: 3 }), queue }, queue,
    receipt: () => receiptId }
}

it('production waits for its exact receipt, survives save/restore and retries only refusals', () => {
  const p = machine('building', { type: 'buildBuilding', buildingType: 'powerPlant' }, 'build', true)
  expect(savePolicy(OWNER, p).ok).toBe(true)
  setPolicyEnabled(OWNER, p.id, true); setBuildAutomationOptIn(OWNER, true)
  const ctx = baseContext(); updateBasePolicies(ctx, 0)
  const id = ctx.receipt()
  expect(getBasePolicyStatus(p.id)).toMatchObject({ waiting: true, finished: false })
  updateBasePolicies(ctx, 1000); expect(ctx.queue).toHaveBeenCalledTimes(1)
  const snapshot = exportAutomationSession([])
  resetPolicyStore(); restoreAutomationSession(snapshot)
  expect(getCompletionReceipt(id)?.status).toBe('pending')
  completeProductionItem(id, `${id}:building`)
  updateBasePolicies(ctx, 2000)
  expect(getBasePolicyStatus(p.id).finished).toBe(true)
  expect(getCompletionReceipt(id)).toBeNull()
  expect(ctx.queue).toHaveBeenCalledTimes(1)
})

it('unit stack completion is exact, owner isolated and duplicate acknowledgement safe', () => {
  const p = machine('stack', { type: 'buildUnits', unitType: 'tank', quantity: 2, delivery: 'factoryRally' }, 'unitBuild', true)
  savePolicy(OWNER, p); setPolicyEnabled(OWNER, p.id, true); setUnitBuildAutomationOptIn(OWNER, true)
  let receiptId
  const queue = vi.fn(order => { receiptId = order.receiptId; return true })
  const ctx = { owner: OWNER, units: [], buildings: [], unitBuild: { lockReason: () => null, isAvailable: () => true, queueLength: () => 0, queue } }
  updateBasePolicies(ctx, 0)
  expect(getCompletionReceipt(receiptId).remaining).toBe(2)
  applyProductionCompletionAck({ receiptId, itemId: `${receiptId}:0`, ownerId: 'player2', status: 'completed' })
  expect(getCompletionReceipt(receiptId).remaining).toBe(2)
  applyProductionCompletionAck({ receiptId, itemId: `${receiptId}:0`, ownerId: OWNER, status: 'completed' })
  applyProductionCompletionAck({ receiptId, itemId: `${receiptId}:0`, ownerId: OWNER, status: 'completed' })
  updateBasePolicies(ctx, 1000)
  expect(getBasePolicyStatus(p.id).finished).toBe(false)
  expect(getCompletionReceipt(receiptId).remaining).toBe(1)
  applyProductionCompletionAck({ receiptId, itemId: `${receiptId}:1`, ownerId: OWNER, status: 'completed' })
  updateBasePolicies(ctx, 2000)
  expect(getBasePolicyStatus(p.id).finished).toBe(true)
  expect(queue).toHaveBeenCalledTimes(1)
})

it('cancellation and revision/reset cleanup do not falsely finish or leak production receipts', () => {
  const p = machine('cancel', { type: 'buildBuilding', buildingType: 'powerPlant' }, 'build', true)
  savePolicy(OWNER, p); setPolicyEnabled(OWNER, p.id, true); setBuildAutomationOptIn(OWNER, true)
  const ctx = baseContext(); updateBasePolicies(ctx, 0)
  const id = ctx.receipt(); failCompletionReceipt(id)
  updateBasePolicies(ctx, 1000)
  expect(getBasePolicyStatus(p.id)).toMatchObject({ finished: false, completionStatus: 'failed' })
  const orphan = createCompletionReceipt(OWNER, p.id)
  resetPolicyStore()
  expect(getCompletionReceipt(orphan)).toBeNull()
  expect(exportBaseAutomationRuntime()).toEqual([])
})

it('waits survive unit runtime round-trip and compile without hidden source changes', () => {
  const p = machine('persist', { type: 'moveForward', tiles: 2 })
  savePolicy(OWNER, p)
  const actor = unit(); applyPolicyToUnit(OWNER, actor, p.id)
  const ctx = unitContext(actor); updateUnitPolicies(ctx.units, ctx, 0)
  const session = exportAutomationSession([actor])
  const restored = unit(); restoreAutomationSession(session, [restored])
  expect(restored.policyBindings[0].runtime.wait.status).toBe('pending')
  expect(getPolicyDocument(p.id).states[1].effect.waitForCompletion).toBe(true)
})


it('a competing automation fails the unissued wait and cannot fulfil the previous issuer objective', () => {
  const actor = unit()
  const first = machine('first', { type: 'moveForward', tiles: 2 })
  const second = machine('second', { type: 'moveForward', tiles: 3 })
  savePolicy(OWNER, first); savePolicy(OWNER, second)
  applyPolicyToUnit(OWNER, actor, first.id); applyPolicyToUnit(OWNER, actor, second.id)
  const ctx = unitContext(actor); updateUnitPolicies(ctx.units, ctx, 0)
  expect(ctx.movement).toHaveBeenCalledTimes(1)
  const a = actor.policyBindings.find(b => b.policyId === 'first')
  const b = actor.policyBindings.find(b => b.policyId === 'second')
  expect(a.runtime.wait.status).toBe('failed')
  expect(b.runtime.wait.status).toBe('pending')
  actor.policyControl.dominant = { kind: 'policy', policyId: 'third', seq: 999 }
  updateUnitPolicies(ctx.units, ctx, 150)
  expect(b.runtime.wait.status).toBe('failed')
})

it('WHILE cannot return or reissue its finite effect until completion, and THEN returns without reissuing', () => {
  const p = machine('while', { type: 'moveForward', tiles: 2 })
  p.states[0].transitions[0] = { id: 'start', kind: 'while', when: { type: 'underFire' }, to: 'act' }
  let r = createPolicyRuntime(p)
  let outcome = stepPolicy(p, r, { underFire: true })
  r = outcome.runtime
  expect(stepPolicy(p, r, { underFire: false }).runtime.currentStateId).toBe('act')
  r.wait.status = 'completed'
  outcome = stepPolicy(p, r, { underFire: true })
  expect(outcome.effects).toEqual([])
  outcome = stepPolicy(p, outcome.runtime, { underFire: false })
  expect(outcome.runtime.currentStateId).toBe('watch')
  expect(outcome.effects).toEqual([])
})

it('unit refusals and unrelated idleness remain blocked rather than treating failure as completion', () => {
  const p = machine('refused', { type: 'moveForward', tiles: 2 }, 'unit', true)
  savePolicy(OWNER, p)
  const actor = unit(); applyPolicyToUnit(OWNER, actor, p.id)
  const ctx = unitContext(actor); ctx.mapGrid[1][3].type = 'rock'
  updateUnitPolicies(ctx.units, ctx, 0)
  expect(actor.policyBindings[0].runtime.wait.status).toBe('failed')
  updateUnitPolicies(ctx.units, ctx, 150)
  expect(actor.policyBindings[0].runtime.finished).toBe(false)
  expect(ctx.movement).not.toHaveBeenCalled()
})

it('service completion requires full resource at the exact still-owned provider, while flight waits for its actual state', () => {
  const actor = { ...unit(), type: 'ambulance', medics: 0, maxMedics: 4, refillingTarget: null }
  const hospital = { id: 'hospital', isBuilding: true, owner: OWNER, x: 5, y: 5, width: 2, height: 2, health: 100 }
  actor.refillingTarget = hospital
  const ctx = { units: [actor], buildings: [hospital] }
  const objective = { kind: 'service', ownerId: OWNER, target: { entityKind: 'building', id: hospital.id, ownerId: OWNER }, resource: 'medics', maximum: 'maxMedics' }
  expect(unitCompletionStatus(actor, objective, ctx, 0).status).toBe('pending')
  actor.medics = 4
  expect(unitCompletionStatus(actor, objective, ctx, 150).status).toBe('pending')
  actor.x = 6 * TILE_SIZE; actor.y = 6 * TILE_SIZE
  expect(unitCompletionStatus(actor, objective, ctx, 300).status).toBe('completed')
  hospital.owner = 'player2'
  expect(unitCompletionStatus(actor, objective, ctx, 450).status).toBe('failed')
  const flight = { kind: 'flight', ownerId: OWNER, flightState: 'grounded', command: 'land' }
  actor.flightState = 'landing'; actor.manualFlightState = 'land'
  expect(unitCompletionStatus(actor, flight, ctx, 600).status).toBe('pending')
  actor.flightState = 'grounded'
  expect(unitCompletionStatus(actor, flight, ctx, 750).status).toBe('completed')
})

it('behaviour revision releases old exact-target watchers and starts a fresh objective', () => {
  const p = machine('revision', { type: 'attackNearestEnemy' })
  savePolicy(OWNER, p)
  const actor = unit(); const enemy = { ...unit('enemy'), owner: 'player2', x: 64 }
  applyPolicyToUnit(OWNER, actor, p.id)
  const ctx = unitContext(actor); ctx.units.push(enemy); ctx.commands.handleAttackCommand = vi.fn(actors => { actors[0].target = enemy })
  updateUnitPolicies(ctx.units, ctx, 0)
  const objective = actor.policyBindings[0].runtime.wait.objective
  const edited = machine('revision', { type: 'moveForward', tiles: 3 })
  savePolicy(OWNER, edited)
  enemy.health = 0; noteCompletionTargetDestroyed(enemy, 'unit')
  expect(objective.destroyed).not.toBe(true)
  expect(actor.policyBindings[0].runtime.wait).toBeUndefined()
})


it('host source resync does not erase the owning client completion receipt or its production run', () => {
  const p = machine('resync', { type: 'buildBuilding', buildingType: 'powerPlant' }, 'build', true)
  savePolicy(OWNER, p); setPolicyEnabled(OWNER, p.id, true); setBuildAutomationOptIn(OWNER, true)
  const ctx = baseContext(); updateBasePolicies(ctx, 0)
  const id = ctx.receipt()
  const host = exportAutomationSession([])
  host.productionRuntime = { base: [], 'completion-receipts': [] }
  restoreAutomationSession(host, [], { authority: 'host-snapshot' })
  expect(getCompletionReceipt(id).status).toBe('pending')
  expect(getBasePolicyStatus(p.id).waiting).toBe(true)
})

it('build refusal retries at the existing cadence and issues only one receipt after acceptance', () => {
  const p = machine('retry', { type: 'buildBuilding', buildingType: 'powerPlant' }, 'build', true)
  savePolicy(OWNER, p); setPolicyEnabled(OWNER, p.id, true); setBuildAutomationOptIn(OWNER, true)
  const ctx = baseContext()
  let busy = true
  ctx.build.isQueueBusy = () => busy
  updateBasePolicies(ctx, 0)
  expect(getBasePolicyStatus(p.id).completionStatus).toBe('issuing')
  busy = false
  updateBasePolicies(ctx, 1000)
  expect(ctx.queue).not.toHaveBeenCalled()
  updateBasePolicies(ctx, 5000)
  expect(ctx.queue).toHaveBeenCalledTimes(1)
  expect(getCompletionReceipt(ctx.receipt()).status).toBe('pending')
  updateBasePolicies(ctx, 10000)
  expect(ctx.queue).toHaveBeenCalledTimes(1)
})
