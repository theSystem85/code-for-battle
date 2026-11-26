import { parsePatrolRoute } from '../utils/patrolRoute.js'
export { parsePatrolRoute }
import { TILE_SIZE, HOWITZER_MIN_RANGE } from '../config.js'
import { getSpatialQuadtree } from './spatialQuadtree.js'
import { getEffectiveFireRange } from './unitCombat/fireRange.js'
import { runAsPolicy } from '../policies/policyIssuer.js'
import { withoutUnitCommandBroadcast } from '../network/commandBroadcastScope.js'

export const PATROL_PERK_ID = 'cc.unit.do.patrol'
const AIR_TYPES = new Set(['apache', 'f22Raptor', 'f35', 'c5Galaxy'])
const groups = new Map()
const carrierWings = new Map()
const EMPTY_WING = []
const ARMED_TYPES = new Set(['tank', 'tank_v1', 'tank-v2', 'tank-v3', 'lightTank', 'rocketTank', 'howitzer', 'apache', 'f22Raptor', 'f35', 'destroyer', 'battleship', 'submarine', 'aircraftCarrier'])
const normalizeOwner = owner => owner === 'player' ? 'player1' : owner


export function cancelPatrol(unit) {
  if (unit.patrol && unit.c5Mission?.phase === 'patrolHold') {
    unit.c5Mission.phase = 'return'
    unit.c5Mission.path = null
  }
  unit.patrol = null
}

export function patrolUnitAvailable(unit) {
  return Boolean(unit && !unit.isBuilding && unit.health > 0 && !unit.factoryExit && !unit.aircraftDelivery &&
    !unit.embarkedOnId && !unit.transportOperation && !unit.transportTransfer && !unit.transportBoardingLocked && (!unit.c5Mission || unit.patrol && unit.c5Mission.drop === false) &&
    unit.crew?.commander !== false)
}

export function validPatrolPoints(unit, points, grid) {
  return Array.isArray(points) && points.length > 0 && points.length <= 256 && points.every(point => {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.y < 0) return false
    const tile = grid?.[Math.floor(point.y / TILE_SIZE)]?.[Math.floor(point.x / TILE_SIZE)]
    if (!tile) return false
    if (unit.isAirUnit || AIR_TYPES.has(unit.type)) return true
    return unit.isNaval ? tile.type === 'water' : !['water', 'rock'].includes(tile.type) && !tile.building && !tile.seedCrystal
  })
}

function loopLength(points) {
  let length = 0
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length]
    length += Math.hypot(next.x - points[i].x, next.y - points[i].y)
  }
  return length
}

export function beginPatrol(selected, points, ctx) {
  if (!ctx.commands?.handleMovementCommand || !selected.length || selected.some(unit => !patrolUnitAvailable(unit) || !validPatrolPoints(unit, points, ctx.mapGrid))) return false
  const route = points.map(point => ({ x: (Math.floor(point.x / TILE_SIZE) + 0.5) * TILE_SIZE, y: (Math.floor(point.y / TILE_SIZE) + 0.5) * TILE_SIZE }))
  if (route.length === 1) {
    let origin = {
      x: selected.reduce((sum, unit) => sum + unit.x + TILE_SIZE / 2, 0) / selected.length,
      y: selected.reduce((sum, unit) => sum + unit.y + TILE_SIZE / 2, 0) / selected.length
    }
    if (!selected.every(unit => validPatrolPoints(unit, [origin], ctx.mapGrid))) {
      origin = null
      for (const candidate of selected) {
        const point = { x: candidate.x + TILE_SIZE / 2, y: candidate.y + TILE_SIZE / 2 }
        if (selected.every(unit => validPatrolPoints(unit, [point], ctx.mapGrid))) { origin = point; break }
      }
      if (!origin) return false
    }
    route.unshift(origin)
  }
  if (loopLength(route) < TILE_SIZE) return false
  const cohorts = new Map()
  for (const unit of selected) {
    const key = unit.formationActive && unit.groupNumber ? `formation-${unit.groupNumber}` : `unit-${unit.id}`
    if (!cohorts.has(key)) cohorts.set(key, [])
    cohorts.get(key).push(unit)
  }
  const now = ctx.now || 0
  const speed = Math.max(0.1, Math.min(...selected.map(unit => unit.movement?.maxSpeed || unit.speed || 1)))
  const interval = loopLength(route) / (speed * 60) * 1000 / cohorts.size
  let cohortIndex = 0
  for (const [key, members] of cohorts) {
    const groupId = `${selected[0].id}:${now}:${key}`
    for (const unit of members) {
      // Go through the ordinary order path to cancel previous work before installing the loop.
      const flightState = unit.flightState
      ctx.commands.handleMovementCommand([unit], unit.x + TILE_SIZE / 2, unit.y + TILE_SIZE / 2, ctx.mapGrid)
      if (unit.type === 'c5Galaxy') { unit.c5Mission = null; unit.flightState = flightState }
      unit.path = []
      unit.moveTarget = null
      unit.target = null
      unit.alertMode = false
      unit.canFire = true
      unit.patrol = { points: route, index: points.length === 1 ? 1 : 0, startAt: now + interval * cohortIndex,
        groupId, moving: false, nextScanAt: now, retryAt: 0 }
    }
    cohortIndex++
  }
  return true
}

function arrived(unit, patrol) {
  const point = patrol.points[patrol.index]
  const offset = unit.formationActive && unit.formationOffset
  const dx = unit.x + TILE_SIZE / 2 - point.x - (offset?.x || 0)
  const dy = unit.y + TILE_SIZE / 2 - point.y - (offset?.y || 0)
  const tolerance = AIR_TYPES.has(unit.type) ? TILE_SIZE * 2 : TILE_SIZE * 0.85
  return dx * dx + dy * dy < tolerance * tolerance
}

function acquireEnemy(unit, patrol, ctx, now) {
  if (now < patrol.nextScanAt) return
  patrol.nextScanAt = now + 250
  const tree = getSpatialQuadtree()
  if (!tree || !ctx.canTarget || !ARMED_TYPES.has(unit.type)) return
  const range = getEffectiveFireRange(unit)
  const x = unit.x + TILE_SIZE / 2
  const y = unit.y + TILE_SIZE / 2
  let best = null
  let bestSq = range * range
  for (let domain = 0; domain < 2; domain++) {
    const candidates = domain ? tree.queryNearbyAir(x, y, range, unit.id) : tree.queryNearbyGround(x, y, range, unit.id)
    for (let i = 0; i < candidates.length; i++) {
      const target = candidates[i]
      if (!(target.health > 0) || target.factoryExit || target.embarkedOnId || target.invulnerable || !target.owner || normalizeOwner(target.owner) === normalizeOwner(unit.owner) || !ctx.canTarget(unit, target)) continue
      const tx = target.x + TILE_SIZE / 2
      const ty = target.y + TILE_SIZE / 2
      const distance = (tx - x) ** 2 + (ty - y) ** 2
      if (unit.type === 'howitzer' && distance < (HOWITZER_MIN_RANGE * TILE_SIZE) ** 2) continue
      if (distance <= bestSq && (!ctx.isVisible || ctx.isVisible(unit, tx, ty))) { best = target; bestSq = distance }
    }
  }
  unit.target = best
  unit.forcedAttack = false
  const targetId = best?.id || null
  const wing = carrierWings.get(unit.id) || EMPTY_WING
  const needsCarrierLaunch = unit.type === 'aircraftCarrier' && wing.length && !unit.carrierStrikeTargetIds?.length
  if (targetId !== patrol.targetId || needsCarrierLaunch) {
    patrol.targetId = targetId
    if (best && ctx.onPatrolTarget) ctx.onPatrolTarget(unit, best, wing)
  }
}

function indexCarrierWings(units) {
  for (const wing of carrierWings.values()) wing.length = 0
  for (const unit of units) {
    if (unit.patrol || (!AIR_TYPES.has(unit.type) || unit.type === 'c5Galaxy')) continue
    const id = unit.carrierOperation?.carrierId || unit.carrierId || unit.homeCarrierId
    if (!id) continue
    let wing = carrierWings.get(id)
    if (!wing) { wing = []; carrierWings.set(id, wing) }
    wing.push(unit)
  }
  for (const [id, wing] of carrierWings) if (!wing.length) carrierWings.delete(id)
}

// One bounded pass per tick. Group records/member arrays are reused after first use.
export function updatePatrols(units, ctx, now) {
  for (const group of groups.values()) group.members.length = 0
  let needsCarrierWings = false
  let hasCarrier = false
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]
    const patrol = unit.patrol
    if (!patrol) continue
    if (!patrolUnitAvailable(unit)) { cancelPatrol(unit); continue }
    let group = groups.get(patrol.groupId)
    if (!group) { group = { members: [], pending: [], targets: [] }; groups.set(patrol.groupId, group) }
    group.members.push(unit)
    if (unit.type === 'aircraftCarrier') {
      hasCarrier = true
      if (now >= patrol.nextScanAt) needsCarrierWings = true
    }
  }
  if (needsCarrierWings) indexCarrierWings(units)
  else if (!hasCarrier) carrierWings.clear()
  for (const [id, group] of groups) {
    if (!group.members.length) { groups.delete(id); continue }
    for (const unit of group.members) acquireEnemy(unit, unit.patrol, ctx, now)
    const lead = group.members[0].patrol
    if (now < lead.startAt) continue
    let ready = true
    for (const unit of group.members) if (!arrived(unit, unit.patrol)) { ready = false; break }
    if (ready) {
      for (const unit of group.members) {
        unit.patrol.index = (unit.patrol.index + 1) % unit.patrol.points.length
        unit.patrol.moving = false
        unit.patrol.retryAt = 0
      }
    }
    const pending = group.pending
    const targets = group.targets
    pending.length = 0
    targets.length = 0
    for (const unit of group.members) {
      const patrol = unit.patrol
      if (arrived(unit, patrol) || patrol.moving && (unit.path?.length || unit.moveTarget || unit.flightPlan?.mode === 'move') || now < patrol.retryAt) continue
      pending.push(unit)
      targets.push(unit.target)
    }
    if (pending.length) {
      const patrol = pending[0].patrol
      const point = patrol.points[patrol.index]
      // One formation order prepares path options once for the entire cohort.
      withoutUnitCommandBroadcast(() => runAsPolicy(() => ctx.commands.handleMovementCommand(pending, point.x, point.y, ctx.mapGrid)))
      for (let i = 0; i < pending.length; i++) {
        const unit = pending[i]
        unit.target = targets[i]
        unit.patrol.moving = true
        unit.patrol.retryAt = now + 1000
      }
    }
  }
}
