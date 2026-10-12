// Accepted unit objectives are fixed at issuance; unrelated idleness never fulfils them.
import { TILE_SIZE } from '../config.js'
const PENDING = Object.freeze({ status: 'pending' })
const COMPLETED = Object.freeze({ status: 'completed' })
let indexRebuilds = 0
let indexedEntities = 0
export function getUnitCompletionMetrics() { return { indexRebuilds, indexedEntities } }
const watchedTargets = new Map()
export function resetUnitCompletionObjectives() { watchedTargets.clear(); indexedContext = null; indexedAt = -Infinity; indexRebuilds = 0; indexedEntities = 0 }
export function registerUnitCompletionObjective(objective) {
  if (objective?.kind !== 'attack' || !objective.target?.id) return
  const key = `${objective.target.entityKind}:${objective.target.id}`
  let entries = watchedTargets.get(key)
  if (!entries) watchedTargets.set(key, entries = new Set())
  entries.add(objective)
}
export function releaseUnitCompletionObjective(objective) {
  if (!objective?.target) return
  const key = `${objective.target.entityKind}:${objective.target.id}`
  const entries = watchedTargets.get(key)
  entries?.delete(objective)
  if (entries?.size === 0) watchedTargets.delete(key)
}
export function noteCompletionTargetDestroyed(entity, entityKind) {
  const key = `${entityKind}:${entity.id}`
  const entries = watchedTargets.get(key)
  if (!entries) return
  for (const objective of entries) if (objective.target.ownerId === entity.owner) objective.destroyed = true
  watchedTargets.delete(key)
}
const unitsById = new Map()
const buildingsById = new Map()
let indexedContext = null
let indexedAt = -Infinity
function targetFor(objective, context, now) {
  if (indexedContext !== context || indexedAt !== now) {
    indexedContext = context; indexedAt = now
    indexRebuilds++
    indexedEntities += (context.units?.length || 0) + (context.buildings?.length || 0)
    unitsById.clear(); buildingsById.clear()
    for (const unit of context.units || []) unitsById.set(unit.id, unit)
    for (const building of context.buildings || []) buildingsById.set(building.id, building)
  }
  return (objective.target.entityKind === 'building' ? buildingsById : unitsById).get(objective.target.id)
}
export function unitCompletionStatus(unit, objective, context, now) {
  if (!objective || !(unit.health > 0) || unit.owner !== objective.ownerId) return { status: 'failed', reason: 'the issuing unit was lost or changed owner' }
  if (objective.issuerId && (unit.policyControl?.dominant?.kind !== 'policy' || unit.policyControl.dominant.policyId !== objective.issuerId || unit.policyControl.dominant.seq !== objective.activationSeq)) return { status: 'failed', reason: 'another command superseded the issuing automation' }
  if (objective.kind === 'attack' && objective.destroyed) return COMPLETED
  if (objective.kind === 'attack') registerUnitCompletionObjective(objective)
  if (objective.kind === 'arrival') {
    const x = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const y = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
    const stopped = !unit.moveTarget && !unit.path?.length
    const distance = Math.hypot(unit.x - objective.tileX * TILE_SIZE, unit.y - objective.tileY * TILE_SIZE)
    if (stopped && x === objective.tileX && y === objective.tileY && distance <= TILE_SIZE / 4) return COMPLETED
    if (!unit.moveTarget && !unit.path?.length) return { status: 'failed', reason: 'the issued destination was not reached' }
  } else if (objective.kind === 'flight') {
    if (unit.flightState === objective.flightState || (objective.flightState === 'airborne' && unit.flightState === 'hovering')) return COMPLETED
    if (unit.manualFlightState && unit.manualFlightState !== objective.command) return { status: 'failed', reason: 'the flight objective was superseded' }
  } else {
    const target = targetFor(objective, context, now)
    if (!target) return { status: 'failed', reason: 'the exact target is no longer available' }
    if (objective.kind === 'attack') {
      if (target.health <= 0) return COMPLETED
      if (target.owner !== objective.target.ownerId) return { status: 'failed', reason: 'the target changed owner' }
      if (unit.target !== target && !unit.path?.length && !unit.moveTarget) return { status: 'failed', reason: 'the issued attack was abandoned' }
    } else if (objective.kind === 'service') {
      if (!(target.health > 0) || target.owner !== objective.target.ownerId) return { status: 'failed', reason: 'the selected service building was lost' }
      const maximum = unit[objective.maximum] ?? objective.expectedMaximum
      const full = Number.isFinite(maximum) && unit[objective.resource] >= maximum
      const cx = (target.x + (target.width || 1) / 2) * TILE_SIZE
      const cy = (target.y + (target.height || 1) / 2) * TILE_SIZE
      if (full && Math.hypot(unit.x + TILE_SIZE / 2 - cx, unit.y + TILE_SIZE / 2 - cy) <= TILE_SIZE * 4) return COMPLETED
      if (!unit.moveTarget && !unit.path?.length && !full && unit.targetWorkshop !== target && unit.refillingTarget !== target && unit.ammoReloadTargetId !== target.id) return { status: 'failed', reason: 'the issued service objective was abandoned' }
    }
  }
  return PENDING
}
