// Unit policy engine: runs policy state machines for units and decides how a
// policy interacts with direct orders.
//
// Rules (see docs/programmable-units-feature-list.md):
// - A direct order wins the moment it is given. Policies on that unit pause
//   until the order is complete and the unit would otherwise be idle.
// - "if" rules fire once, on the step their condition becomes true. They are
//   frozen while a direct order runs.
// - "while" rules hold their state until an end condition. A while-condition
//   that newly becomes true takes over even a running direct order.
// - Several policies can be active. The last direct order or the last newly
//   triggered condition is dominant.
//
// Hot path: updateUnitPolicies runs every simulation tick for every unit but
// only does work for units that carry bindings, and then at most once per
// POLICY_EVAL_INTERVAL_MS. Units without policies cost one property read.

import { TILE_SIZE } from '../config.js'
import { getSimulationTime } from '../game/time.js'
import { gameState } from '../gameState.js'
import { EFFECTS, effectRepeat } from './policyEffects.js'
import { isBindingControlling } from './policyActivity.js'
import { isPolicyIssuingOrder, runAsPolicy } from './policyIssuer.js'
import { beginUnitScope, isUnitScopeCurrent, getScopeEnemy, getScopeEnemyDistanceTiles, isScopeEnemyInRange, measureLeaf } from './policySensors.js'
import { unitCompletionStatus, registerUnitCompletionObjective, releaseUnitCompletionObjective } from './unitCompletion.js'
import { recordAutomationRuntime } from './automationReplay.js'
import { stepCompiledPolicy } from './policyCompiler.js'
import { STEP_GATE } from './policyStep.js'
import { executeUnitCommand, findServiceTarget } from './unitCommandApi.js'
import { ENEMY_SCAN_TILES, findNearestEnemy, findNearestFriendly, isHostile, unitCenter } from './policyWorld.js'
import {
  canCommandPolicy,
  getCompiledPolicyProgram,
  refreshAutomationBinding,
  registerAutomationEntity,
  getPolicyDocument,
  getPolicyEntry,
  getPolicyStoreVersion,
  listEnabledGlobalPolicies,
  makeBinding,
  nextPolicySequence
} from './policyStore.js'

export const POLICY_EVAL_INTERVAL_MS = 150
export const ORDER_START_GRACE_MS = 500
export const REASSERT_INTERVAL_MS = 1000
export const UNDER_FIRE_WINDOW_MS = 3000
export { ENEMY_SCAN_TILES, findNearestEnemy }
export const RETREAT_ARRIVAL_TILES = 3

/** Units that can carry policies: combat vehicles, helicopters/F-35 and service units. */
export const PROGRAMMABLE_UNIT_TYPES = Object.freeze(new Set([
  'tank', 'tank_v1', 'tank-v2', 'tank-v3', 'rocketTank', 'howitzer',
  'apache', 'f35', 'ambulance', 'tankerTruck', 'ammunitionTruck', 'recoveryTank'
]))

export function isProgrammableUnit(unit) {
  return Boolean(unit) && PROGRAMMABLE_UNIT_TYPES.has(unit.type)
}

const eventListeners = new Set()

export { isPolicyIssuingOrder, runAsPolicy }

export function subscribePolicyEvents(listener) {
  eventListeners.add(listener)
  return () => eventListeners.delete(listener)
}

function emit(event) {
  eventListeners.forEach(listener => {
    try {
      listener(event)
    } catch (err) {
      window.logger?.warn?.('[Policies] event listener failed', err)
    }
  })
}

function ensureControl(unit) {
  if (!unit.policyControl) {
    unit.policyControl = { order: null, dominant: null }
  }
  return unit.policyControl
}

function holdsTarget(order, target) {
  Object.defineProperty(order, 'targetRef', { value: target, enumerable: false, writable: true })
}

function isHolding(binding) {
  return binding.runtime.hold != null
}

/**
 * Record a direct order. Call after the order was applied to the units.
 * Orders issued by a policy are ignored.
 */
export function noteDirectOrder(units, now = getSimulationTime(gameState)) {
  if (isPolicyIssuingOrder() || !Array.isArray(units)) return
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]
    if (!unit) continue
    const control = ensureControl(unit)
    for (const binding of unit.policyBindings || []) {
      if (binding.runtime.wait) {
        releaseUnitCompletionObjective(binding.runtime.wait.objective)
        binding.runtime.wait = { ...binding.runtime.wait, status: 'failed', reason: 'a direct order superseded this objective' }
      }
    }
    let conflicting = null
    const bindings = unit.policyBindings
    if (bindings && control.dominant && control.dominant.kind === 'policy') {
      for (let j = 0; j < bindings.length; j++) {
        const binding = bindings[j]
        if (isHolding(binding) && binding.policyId === control.dominant.policyId) {
          const doc = getPolicyDocument(binding.policyId)
          if (!conflicting) conflicting = []
          conflicting.push({ id: binding.policyId, name: doc ? doc.name : binding.policyId })
        }
      }
    }
    const order = { seq: nextPolicySequence(), active: true, issuedAt: now, sawBusy: false }
    holdsTarget(order, unit.target || null)
    control.order = order
    control.dominant = { kind: 'order', seq: order.seq }
    if (conflicting) {
      emit({ type: 'conflict', unit, unitId: unit.id, orderSeq: order.seq, policies: conflicting })
    }
  }
}

/** Pause a policy on one unit until the current direct order is fulfilled. */
export function pausePolicyUntilOrderDone(unit, policyId) {
  const control = unit && unit.policyControl
  if (!control || !control.order || !control.order.active || !Array.isArray(unit.policyBindings)) return false
  let paused = false
  unit.policyBindings.forEach(binding => {
    if (!policyId || binding.policyId === policyId) {
      binding.pausedUntilOrderSeq = control.order.seq
      paused = true
    }
  })
  return paused
}

function hasLiveTarget(unit, orderTarget, strict) {
  const target = unit.target
  if (!target || !(target.health > 0)) return false
  return strict ? true : target === orderTarget
}

/** True when the unit has nothing left to do. */
export function isUnitIdle(unit, orderTarget = null, strict = true) {
  if (unit.moveTarget) return false
  if (unit.path && unit.path.length > 0) return false
  if (unit.attackQueue && unit.attackQueue.length > 0) return false
  if (unit.commandQueue && unit.commandQueue.length > 0) return false
  if (unit.currentCommand || unit.isRetreating) return false
  return !hasLiveTarget(unit, orderTarget, strict)
}

function updateOrderCompletion(unit, control, now) {
  const order = control.order
  if (isUnitIdle(unit, order.targetRef, false)) {
    if (order.sawBusy || now - order.issuedAt >= ORDER_START_GRACE_MS) {
      order.active = false
      emit({ type: 'orderFulfilled', unit, unitId: unit.id, orderSeq: order.seq })
    }
  } else {
    order.sawBusy = true
  }
}

const sharedView = { now: 0, hp: 1, enemyDistance: Infinity, enemyInRange: false, underFire: false, measure: measureLeaf }

function buildWorldView(unit, needsEnemy, context, now) {
  beginUnitScope(unit, context, now)
  sharedView.now = now
  sharedView.hp = unit.maxHealth > 0 ? Math.max(0, unit.health / unit.maxHealth) : 1
  sharedView.underFire = Number.isFinite(unit.lastDamageTime) && now - unit.lastDamageTime <= UNDER_FIRE_WINDOW_MS
  sharedView.enemyDistance = Infinity
  sharedView.enemyInRange = false
  if (needsEnemy) {
    sharedView.enemyDistance = getScopeEnemyDistanceTiles()
    sharedView.enemyInRange = isScopeEnemyInRange()
  }
  return sharedView
}

function isWalkableRetreatTile(mapGrid, x, y) {
  const tile = mapGrid[y] && mapGrid[y][x]
  if (!tile) return false
  return tile.type !== 'water' && tile.type !== 'rock' && !tile.building && !tile.seedCrystal
}

/**
 * Closest free tile next to the closest friendly building. Returns null when
 * the unit already is within RETREAT_ARRIVAL_TILES of that building.
 */
export function findRetreatTile(unit, buildings, mapGrid) {
  const center = unitCenter(unit)
  let base = null
  let baseSq = Infinity
  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i]
    if (!building || !(building.health > 0) || !canCommandPolicy(unit.owner, building.owner)) continue
    const cx = (building.x + (building.width || 1) / 2) * TILE_SIZE
    const cy = (building.y + (building.height || 1) / 2) * TILE_SIZE
    const distSq = (cx - center.x) ** 2 + (cy - center.y) ** 2
    if (distSq < baseSq) {
      base = building
      baseSq = distSq
    }
  }
  if (!base) return null

  const width = base.width || 1
  const height = base.height || 1
  const unitTileX = Math.floor(center.x / TILE_SIZE)
  const unitTileY = Math.floor(center.y / TILE_SIZE)
  const dxTiles = Math.max(base.x - unitTileX, 0, unitTileX - (base.x + width - 1))
  const dyTiles = Math.max(base.y - unitTileY, 0, unitTileY - (base.y + height - 1))
  if (Math.hypot(dxTiles, dyTiles) <= RETREAT_ARRIVAL_TILES) return null

  let best = null
  let bestSq = Infinity
  for (let ring = 2; ring <= 4 && !best; ring++) {
    for (let y = base.y - ring; y <= base.y + height - 1 + ring; y++) {
      for (let x = base.x - ring; x <= base.x + width - 1 + ring; x++) {
        const onRing = x === base.x - ring || x === base.x + width - 1 + ring ||
          y === base.y - ring || y === base.y + height - 1 + ring
        if (!onRing || !isWalkableRetreatTile(mapGrid, x, y)) continue
        const distSq = (x - unitTileX) ** 2 + (y - unitTileY) ** 2
        if (distSq < bestSq) {
          best = { x, y }
          bestSq = distSq
        }
      }
    }
  }
  return best
}

const effectArgs = { target: null, tiles: undefined, resource: undefined, tileX: 0, tileY: 0 }

function resetArgs() {
  effectArgs.target = null
  effectArgs.tiles = undefined
  effectArgs.resource = undefined
  effectArgs.tileX = 0
  effectArgs.tileY = 0
  return effectArgs
}

function nearestEnemyForEffect(unit, context) {
  if (!isUnitScopeCurrent(unit, context)) return findNearestEnemy(unit, context.units)
  const enemy = getScopeEnemy()
  return enemy && isHostile(unit, enemy) ? enemy : null
}

/**
 * Carry out one policy effect on a unit through the unit command API.
 * Returns true when the engine allowed the command and something changed.
 */
export function applyPolicyEffect(unit, effect, context) {
  const meta = EFFECTS[effect.type]
  if (!meta) return false
  const params = effect.params || effect
  const args = resetArgs()
  switch (effect.type) {
    case 'retreat': {
      const bases = context.factories && context.factories.length ? context.buildings.concat(context.factories) : context.buildings
      const tile = findRetreatTile(unit, bases, context.mapGrid)
      if (!tile) return false
      args.tileX = tile.x
      args.tileY = tile.y
      break
    }
    case 'attackNearestEnemy':
    case 'aimNearestEnemy':
      args.target = nearestEnemyForEffect(unit, context)
      if (!args.target) return false
      break
    case 'protectNearestFriendly':
      args.target = findNearestFriendly(unit, context.units)
      if (!args.target) return false
      break
    case 'serviceNearestFriendly':
      args.target = findServiceTarget(unit, context)
      if (!args.target) return false
      break
    case 'moveForward':
    case 'moveBackward':
    case 'moveLeft':
    case 'moveRight':
      args.tiles = params.tiles
      break
    case 'requestRefill':
      args.resource = params.resource
      break
    default:
      break
  }
  context.captureCompletionObjective = params.waitForCompletion === true
  const accepted = executeUnitCommand(meta.command, unit, args, context)
  context.captureCompletionObjective = false
  return accepted
}

function bindingGate(binding, control) {
  const order = control && control.order
  if (!order || !order.active) return STEP_GATE.open
  return binding.pausedUntilOrderSeq === order.seq ? STEP_GATE.paused : STEP_GATE.orderRunning
}

let cachedGlobals = null
let cachedGlobalsVersion = -1

function enabledGlobals(version) {
  if (cachedGlobalsVersion !== version) {
    cachedGlobals = listEnabledGlobalPolicies()
    cachedGlobalsVersion = version
  }
  return cachedGlobals
}

function syncGlobalBindings(unit, globals, version) {
  unit.policySyncVersion = version
  let bindings = unit.policyBindings
  if (bindings && bindings.length) {
    bindings = bindings.filter(binding => {
      const keep = binding.source !== 'global' || globals.some(entry => entry.policy.id === binding.policyId && canCommandPolicy(entry.ownerId, unit.owner))
      if (!keep) releaseUnitCompletionObjective(binding.runtime.wait?.objective)
      return keep
    })
    unit.policyBindings = bindings
    if (bindings.length === 0) {
      unit.policyActive = false
      unit.policyActiveCount = 0
    }
  }
  if (!isProgrammableUnit(unit) || globals.length === 0) return
  for (let i = 0; i < globals.length; i++) {
    const entry = globals[i]
    if (!canCommandPolicy(entry.ownerId, unit.owner)) continue
    if (!unit.policyBindings) unit.policyBindings = []
    if (unit.policyBindings.some(binding => binding.policyId === entry.policy.id && binding.source === 'global')) continue
    registerAutomationEntity(unit)
    unit.policyBindings.push(makeBinding(entry.policy, 'global'))
    unit.policyNextEval = 0
  }
}

export function getUnitPolicySummary(unit) {
  const bindings = unit && unit.policyBindings
  if (!bindings) return []
  return bindings.map(binding => {
    const doc = getPolicyDocument(binding.policyId)
    const control = unit.policyControl
    return {
      policyId: binding.policyId,
      name: doc ? doc.name : binding.policyId,
      source: binding.source,
      holding: isHolding(binding),
      finished: binding.runtime.finished,
      paused: bindingGate(binding, control) === STEP_GATE.paused,
      active: binding.active === true,
      waiting: Boolean(binding.runtime.wait && binding.runtime.wait.status !== 'completed'),
      completionStatus: binding.runtime.wait?.status || null,
      completionReason: binding.runtime.wait?.reason || null,
      stateId: binding.runtime.currentStateId
    }
  })
}

function processUnit(unit, context, now) {
  const control = ensureControl(unit)
  if (control.order && control.order.active) {
    updateOrderCompletion(unit, control, now)
  }

  const bindings = unit.policyBindings
  let override = null
  let holder = null
  let needsEnemy = false
  for (let i = 0; i < bindings.length; i++) {
    const program = getCompiledPolicyProgram(bindings[i].policyId)
    if (program && (program.sensorDependencyMask & 1)) {
      needsEnemy = true
      break
    }
  }
  const view = buildWorldView(unit, needsEnemy, context, now)

  let removeBindings = false
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i]
    const doc = getPolicyDocument(binding.policyId)
    if (!doc) {
      releaseUnitCompletionObjective(binding.runtime.wait?.objective)
      binding.dead = true
      removeBindings = true
      continue
    }
    const program = getCompiledPolicyProgram(binding.policyId)
    if (!program) continue // Invalid/unprepared revisions never execute partially.
    if (binding.docRef !== doc) {
      refreshAutomationBinding(binding, doc)
      binding.docRef = doc
    }
    const previousRuntime = binding.runtime
    if (binding.runtime.wait?.status === 'pending' && bindingGate(binding, control) === STEP_GATE.open) {
      const outcome = unitCompletionStatus(unit, binding.runtime.wait.objective, context, now)
      if (outcome.status !== 'pending') {
        releaseUnitCompletionObjective(binding.runtime.wait.objective)
        binding.runtime = { ...binding.runtime, wait: { ...binding.runtime.wait, ...outcome } }
      }
    }
    const { runtime, effects, trace } = stepCompiledPolicy(program, binding.runtime, view, bindingGate(binding, control))
    binding.runtime = runtime
    binding.lastTrace = trace
    recordAutomationRuntime(unit, binding, previousRuntime, trace)
    if (runtime.finished && binding.source === 'unit') {
      binding.dead = true
      removeBindings = true
    }
    for (let j = 0; j < effects.length; j++) {
      const effect = effects[j]
      if (effect.phase === 'enter') {
        if (override?.binding.runtime.wait?.status === 'issuing') {
          const displaced = override.binding
          displaced.runtime.wait = { ...displaced.runtime.wait, status: 'failed', reason: 'another automation superseded this command before issuance' }
          recordAutomationRuntime(unit, displaced, { ...displaced.runtime, wait: null }, displaced.lastTrace)
        }
        override = { binding, effect }
      } else if (effect.phase === 'hold' && (!holder || binding.activationSeq >= holder.binding.activationSeq)) {
        holder = { binding, effect }
      }
    }
  }

  if (override) {
    const { binding, effect } = override
    binding.activationSeq = nextPolicySequence()
    control.dominant = { kind: 'policy', seq: binding.activationSeq, policyId: binding.policyId }
    if (control.order && control.order.active) {
      control.order.active = false
      emit({ type: 'orderOverridden', unit, unitId: unit.id, policyId: binding.policyId })
    }
    const accepted = applyPolicyEffect(unit, effect, context)
    if (effect.params.waitForCompletion) {
      binding.runtime.wait = { ...binding.runtime.wait, status: accepted && context.completionObjective ? 'pending' : 'failed',
        objective: accepted ? context.completionObjective : null, reason: accepted ? null : 'the unit command was refused' }
      if (accepted && context.completionObjective) {
        context.completionObjective.issuerId = binding.policyId
        context.completionObjective.activationSeq = binding.activationSeq
        registerUnitCompletionObjective(context.completionObjective)
      }
      recordAutomationRuntime(unit, binding, { ...binding.runtime, wait: null }, binding.lastTrace)
    }
    emit({ type: 'policyActivated', unit, unitId: unit.id, policyId: binding.policyId, kind: effect.kind })
  } else if (holder) {
    const everyTick = effectRepeat(holder.effect.type) === 'tick'
    if (everyTick || (now >= holder.binding.nextReassertAt && isUnitIdle(unit))) {
      if (!everyTick) holder.binding.nextReassertAt = now + REASSERT_INTERVAL_MS
      applyPolicyEffect(unit, holder.effect, context)
    }
  }

  if (removeBindings) {
    unit.policyBindings = bindings.filter(binding => !binding.dead)
  }
  refreshActivity(unit, control)
}

/**
 * Recompute the activity flags of one unit right away, e.g. after a policy was
 * applied to or removed from it by hand, instead of waiting for the next
 * evaluation (which is skipped entirely for units without bindings).
 */
export function refreshUnitPolicyActivity(unit) {
  if (!unit) return
  refreshActivity(unit, unit.policyControl || null)
}

/** Record which policies control the unit right now (see policyActivity.js). */
function refreshActivity(unit, control) {
  const bindings = unit.policyBindings
  let active = 0
  if (bindings) {
    for (let i = 0; i < bindings.length; i++) {
      const binding = bindings[i]
      const doc = getPolicyDocument(binding.policyId)
      binding.active = Boolean(doc) && isBindingControlling(binding, doc, bindingGate(binding, control))
      if (binding.active) active += 1
    }
  }
  unit.policyActiveCount = active
  unit.policyActive = active > 0
}

/**
 * Per-tick entry. `context` carries { units, mapGrid, buildings, factories, commands, getFireRange? }.
 */
export function updateUnitPolicies(units, context, now = getSimulationTime(gameState)) {
  if (gameState.replayMode || context.authority === false) return
  context.now = now
  const version = getPolicyStoreVersion()
  const globals = enabledGlobals(version)
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]
    if (unit.policySyncVersion !== version) {
      syncGlobalBindings(unit, globals, version)
    }
    const bindings = unit.policyBindings
    if (!bindings || bindings.length === 0) continue
    if (unit.factoryExit || !(unit.health > 0)) continue
    if (now < (unit.policyNextEval || 0)) continue
    unit.policyNextEval = now + POLICY_EVAL_INTERVAL_MS
    processUnit(unit, context, now)
  }
}

export function getPolicyName(policyId) {
  const entry = getPolicyEntry(policyId)
  return entry ? entry.policy.name : policyId
}
