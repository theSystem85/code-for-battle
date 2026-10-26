// Patience for units that have a destination but are not actually getting anywhere.
// Pathfinding ignores other moving units, so a crowd can sit on one route while
// physics only shoves them around. After 10 seconds without about a meter of
// travel, the unit asks the existing local-dodge path to step aside.
import { CURSOR_METERS_PER_TILE, MOVE_TARGET_REACHED_THRESHOLD, TILE_SIZE } from '../config.js'
import { normalizeAngle } from './movementHelpers.js'

export const MOVE_PATIENCE_SECONDS = 10
export const MOVE_PATIENCE_CHECK_MS = 1000
export const MOVE_PATIENCE_MIN_METERS = 1
// Gameplay distances use 10 m per tile (CURSOR_METERS_PER_TILE). TILE_LENGTH_METERS
// is 1000 and only scales fuel use; 1 m on that scale would be a fraction of a pixel
// and would treat physics jitter as real movement.
export const MOVE_PATIENCE_MIN_DISTANCE = (TILE_SIZE / CURSOR_METERS_PER_TILE) * MOVE_PATIENCE_MIN_METERS

export const STUCK_CLUSTER_MIN_UNITS = 5
export const STUCK_CLUSTER_RADIUS_TILES = 5
export const STUCK_CLUSTER_MEMORY_MS = MOVE_PATIENCE_SECONDS * MOVE_PATIENCE_CHECK_MS
export const STUCK_CLUSTER_NOTIFY_COOLDOWN_MS = 30000
const STUCK_CLUSTER_GEOMETRY_CAP = 48

const PATIENCE_EXEMPT_TYPES = new Set(['apache', 'f35', 'f22Raptor'])

const stuckScratch = []
const centerScratch = []
const boundaryCenterBuf = [
  { x: 0, y: 0 },
  { x: 0, y: 0 }
]

let stuckClusterNotifier = () => {}

export function registerStuckClusterNotifier(notifier) {
  stuckClusterNotifier = typeof notifier === 'function' ? notifier : () => {}
}

function isFiniteTarget(target) {
  return Boolean(target) && Number.isFinite(target.x) && Number.isFinite(target.y)
}

function isOwnedByHuman(unit, humanPlayer) {
  if (!unit) return false
  const human = humanPlayer || 'player1'
  return unit.owner === human || (human === 'player1' && unit.owner === 'player')
}

function isPatienceExempt(unit) {
  if (PATIENCE_EXEMPT_TYPES.has(unit.type) || unit.isAirUnit) return true
  if (unit.factoryExit || unit.embarkedOnId || unit.carrierOperation || unit.transportOperation) return true
  if (unit.mapHoldPosition) return true
  if (unit.crew && typeof unit.crew === 'object' && !unit.crew.driver) return true
  return false
}

function phaseForUnit(unit) {
  const key = `${unit.id ?? ''}|${unit.type ?? ''}|${unit.owner ?? ''}`
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % MOVE_PATIENCE_CHECK_MS
}

function armCheck(patience, unit, now) {
  patience.remaining = MOVE_PATIENCE_SECONDS
  patience.lastX = unit.x
  patience.lastY = unit.y
  if (!Number.isFinite(patience.phase)) patience.phase = phaseForUnit(unit)
  patience.nextCheckTime = now + MOVE_PATIENCE_CHECK_MS + patience.phase
}

function clearStuckMarks(unit) {
  const patience = unit?.movePatience
  if (!patience) return
  patience.immobile = false
  patience.expiredAt = 0
}

export function resetMovePatience(unit, now) {
  if (!unit) return
  unit.movePatienceResetRequested = false
  const target = unit.moveTarget
  if (!isFiniteTarget(target) || isPatienceExempt(unit)) return

  let patience = unit.movePatience
  if (!patience) {
    patience = {
      remaining: MOVE_PATIENCE_SECONDS,
      lastX: unit.x,
      lastY: unit.y,
      targetX: target.x,
      targetY: target.y,
      immobile: false,
      expiredAt: 0,
      phase: phaseForUnit(unit),
      nextCheckTime: now
    }
    unit.movePatience = patience
  }

  patience.targetX = target.x
  patience.targetY = target.y
  patience.immobile = false
  patience.expiredAt = 0
  armCheck(patience, unit, now)
}

export function noteLocalDodge(unit, now) {
  const patience = unit?.movePatience
  if (!patience || !Number.isFinite(now)) return
  // A dodge refills the budget. Keep the stuck marks so a dodge that does not
  // actually move the unit still counts toward a player stuck-cluster notice.
  armCheck(patience, unit, now)
}

function hasArrived(unit, target) {
  if (unit.path && unit.path.length > 0) return false
  const tileX = Math.floor(((unit.x || 0) + TILE_SIZE / 2) / TILE_SIZE)
  const tileY = Math.floor(((unit.y || 0) + TILE_SIZE / 2) / TILE_SIZE)
  return Math.hypot(target.x - tileX, target.y - tileY) < MOVE_TARGET_REACHED_THRESHOLD
}

function isNavalAlignmentStall(unit) {
  if (!unit.isNaval || !unit.movement) return false
  if ((unit.movement.currentSpeed || 0) >= 0.02) return false
  const delta = normalizeAngle((unit.movement.targetRotation || 0) - (unit.direction || 0))
  return Math.abs(delta) >= Math.PI / 12
}

function elapsedSteps(patience, now) {
  const span = now - patience.nextCheckTime
  if (!Number.isFinite(span)) return 1
  const steps = Math.floor(span / MOVE_PATIENCE_CHECK_MS) + 1
  return steps < 1 ? 1 : steps
}

function samplePosition(patience, unit) {
  patience.lastX = unit.x
  patience.lastY = unit.y
}

// Returns true when patience has run out and the caller should enter dodge mode.
// The per-tick path is a single timestamp compare; distance work waits for the 1s sample.
export function updateMovePatience(unit, now) {
  if (!unit || !Number.isFinite(unit.health) || unit.health <= 0 || !Number.isFinite(now)) return false

  if (isPatienceExempt(unit)) {
    unit.movePatienceResetRequested = false
    const patience = unit.movePatience
    if (patience && now >= patience.nextCheckTime) {
      clearStuckMarks(unit)
      samplePosition(patience, unit)
      patience.nextCheckTime = now + MOVE_PATIENCE_CHECK_MS + (patience.phase || 0)
    }
    return false
  }

  const target = unit.moveTarget
  if (!isFiniteTarget(target)) {
    clearStuckMarks(unit)
    unit.movePatienceResetRequested = false
    return false
  }

  const patience = unit.movePatience
  const targetChanged = !patience || patience.targetX !== target.x || patience.targetY !== target.y
  if (!patience || targetChanged || unit.movePatienceResetRequested) {
    resetMovePatience(unit, now)
    return false
  }

  if (now < patience.nextCheckTime) return false

  const steps = elapsedSteps(patience, now)
  patience.nextCheckTime += steps * MOVE_PATIENCE_CHECK_MS

  if (unit.isDodging || hasArrived(unit, target) || unit.harvesting || unit.unloadingAtRefinery) {
    if (!unit.isDodging) clearStuckMarks(unit)
    samplePosition(patience, unit)
    return false
  }

  if (isNavalAlignmentStall(unit)) {
    samplePosition(patience, unit)
    return false
  }

  const moved = Math.hypot((unit.x || 0) - patience.lastX, (unit.y || 0) - patience.lastY)
  samplePosition(patience, unit)
  // 0.001px keeps an exact meter above the cutoff when the sample lands on a float boundary.
  if (moved + 0.001 >= MOVE_PATIENCE_MIN_DISTANCE * steps) {
    clearStuckMarks(unit)
    return false
  }

  patience.immobile = true
  patience.remaining -= Math.min(steps, MOVE_PATIENCE_SECONDS)
  if (patience.remaining > 0) return false

  patience.remaining = MOVE_PATIENCE_SECONDS
  patience.expiredAt = now
  patience.immobile = true
  return true
}

function ensureCenter(index) {
  let entry = centerScratch[index]
  if (!entry) {
    entry = { x: 0, y: 0, unit: null, dist2: 0 }
    centerScratch[index] = entry
  }
  return entry
}

function releaseCenters(count) {
  for (let i = 0; i < count; i++) {
    if (centerScratch[i]) centerScratch[i].unit = null
  }
  stuckScratch.length = 0
}

function isClusterMember(unit, now, humanPlayer) {
  if (!unit || !Number.isFinite(unit.health) || unit.health <= 0) return false
  if (!isFiniteTarget(unit.moveTarget) || !isOwnedByHuman(unit, humanPlayer)) return false
  const patience = unit.movePatience
  if (!patience || !patience.immobile || !patience.expiredAt) return false
  return now - patience.expiredAt <= STUCK_CLUSTER_MEMORY_MS
}

function countInside(centerX, centerY, count, radius2) {
  let inside = 0
  for (let i = 0; i < count; i++) {
    const entry = centerScratch[i]
    const dx = entry.x - centerX
    const dy = entry.y - centerY
    if (dx * dx + dy * dy <= radius2) inside++
  }
  return inside
}

function finishCluster(centerX, centerY, count, radius2) {
  const members = []
  for (let i = 0; i < count; i++) {
    const entry = centerScratch[i]
    const dx = entry.x - centerX
    const dy = entry.y - centerY
    if (dx * dx + dy * dy <= radius2) members.push(entry.unit)
  }
  return {
    members,
    center: { x: centerX, y: centerY }
  }
}

function boundaryCenters(a, b, radius) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d2 = dx * dx + dy * dy
  const maxD = radius * 2
  if (d2 <= 0 || d2 > maxD * maxD) return 0
  const d = Math.sqrt(d2)
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const h2 = radius * radius - d2 / 4
  if (h2 <= 1e-6) {
    boundaryCenterBuf[0].x = midX
    boundaryCenterBuf[0].y = midY
    return 1
  }
  const h = Math.sqrt(h2) / d
  const ox = -dy * h
  const oy = dx * h
  boundaryCenterBuf[0].x = midX + ox
  boundaryCenterBuf[0].y = midY + oy
  boundaryCenterBuf[1].x = midX - ox
  boundaryCenterBuf[1].y = midY - oy
  return 2
}

function keepClosest(count) {
  const ranked = centerScratch.slice(0, count).sort((a, b) => a.dist2 - b.dist2)
  for (let i = 0; i < count; i++) {
    centerScratch[i] = ranked[i]
    if (i < STUCK_CLUSTER_GEOMETRY_CAP) stuckScratch[i] = ranked[i].unit
    else ranked[i].unit = null
  }
  stuckScratch.length = STUCK_CLUSTER_GEOMETRY_CAP
  return STUCK_CLUSTER_GEOMETRY_CAP
}

export function findPlayerStuckCluster(units, origin, now, humanPlayer = 'player1') {
  if (!origin || !Array.isArray(units) || !Number.isFinite(now)) return null

  const radius = STUCK_CLUSTER_RADIUS_TILES * TILE_SIZE
  const radius2 = radius * radius
  const reach = radius * 2
  const reach2 = reach * reach
  const originX = (origin.x || 0) + TILE_SIZE / 2
  const originY = (origin.y || 0) + TILE_SIZE / 2

  stuckScratch.length = 0
  for (let i = 0; i < units.length; i++) {
    const unit = units[i]
    if (!isClusterMember(unit, now, humanPlayer)) continue
    const x = unit.x + TILE_SIZE / 2
    const y = unit.y + TILE_SIZE / 2
    const dx = x - originX
    const dy = y - originY
    const dist2 = dx * dx + dy * dy
    if (dist2 > reach2) continue
    const entry = ensureCenter(stuckScratch.length)
    entry.x = x
    entry.y = y
    entry.unit = unit
    entry.dist2 = dist2
    stuckScratch.push(unit)
  }

  let count = stuckScratch.length
  if (count <= STUCK_CLUSTER_MIN_UNITS) {
    releaseCenters(count)
    return null
  }

  if (count > STUCK_CLUSTER_GEOMETRY_CAP) count = keepClosest(count)

  let bestCount = countInside(originX, originY, count, radius2)
  let bestX = originX
  let bestY = originY

  if (bestCount <= STUCK_CLUSTER_MIN_UNITS) {
    for (let i = 0; i < count; i++) {
      const a = centerScratch[i]
      const covered = countInside(a.x, a.y, count, radius2)
      if (covered > bestCount) {
        bestCount = covered
        bestX = a.x
        bestY = a.y
      }
      for (let j = i + 1; j < count; j++) {
        const centers = boundaryCenters(a, centerScratch[j], radius)
        for (let k = 0; k < centers; k++) {
          const center = boundaryCenterBuf[k]
          const pairCovered = countInside(center.x, center.y, count, radius2)
          if (pairCovered > bestCount) {
            bestCount = pairCovered
            bestX = center.x
            bestY = center.y
          }
        }
      }
    }
  }

  if (bestCount <= STUCK_CLUSTER_MIN_UNITS) {
    releaseCenters(count)
    return null
  }

  const cluster = finishCluster(bestX, bestY, count, radius2)
  releaseCenters(count)
  return cluster
}

export function reportPlayerStuckCluster(unit, units, gameState, now) {
  const humanPlayer = gameState?.humanPlayer || 'player1'
  if (!isOwnedByHuman(unit, humanPlayer) || !Array.isArray(units)) return null
  const cluster = findPlayerStuckCluster(units, unit, now, humanPlayer)
  if (!cluster) return null
  stuckClusterNotifier(cluster, gameState, now)
  return cluster
}
