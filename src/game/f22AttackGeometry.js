import { TILE_SIZE } from '../config.js'

/** Closest the F22 may be to a target and still release rockets. */
export const F22_MIN_ATTACK_DISTANCE = TILE_SIZE * 6

/** Unmodified F22 weapon range. Leveled jets are scaled and capped below. */
export const F22_DEFAULT_WEAPON_RANGE = TILE_SIZE * 16

const F22_MAX_WEAPON_RANGE = TILE_SIZE * 20

/**
 * Effective F22 weapon range. Kept beside the egress math so flight planning
 * does not import the combat module (that import cycle breaks unit tests).
 * Must stay aligned with getEffectiveFireRange for f22Raptor.
 */
export function getF22WeaponRange(unit) {
  let range = F22_DEFAULT_WEAPON_RANGE
  if (unit?.level >= 1) {
    range *= (unit.rangeMultiplier || 1.2)
  }
  return Math.min(range, F22_MAX_WEAPON_RANGE)
}

/**
 * Cruise fraction used once the jet is inside the firing window.
 * Matches the established combat-orbit slowdown.
 */
export const F22_ATTACK_PASS_SPEED_MULTIPLIER = 0.62

/**
 * Yaw scale applied to F22 flight-plan steering in movementCore.
 * Egress distance is derived from this same rate so the outbound leg
 * stays outside the real turning circle.
 */
export const F22_FLIGHT_YAW_SCALE = 0.28

const PASS_LEAD = TILE_SIZE * 8
const EGRESS_WAYPOINT_LEAD = TILE_SIZE * 4
const PASSED_MARGIN = TILE_SIZE * 0.75
const EGRESS_WAYPOINT_CAPTURE = TILE_SIZE * 2

export function getF22FlightYawPerTick(unit) {
  const rotationSpeed = Number(unit?.rotationSpeed) || 0.18
  return Math.max(0.02, rotationSpeed * F22_FLIGHT_YAW_SCALE)
}

/**
 * Minimum turn radius at cruise, in pixels.
 * Speed and yaw are both per movement tick, matching movementCore.
 */
export function getF22TurnRadius(unit) {
  const speed = Number(unit?.airCruiseSpeed || unit?.speed) || 6.075
  const yaw = getF22FlightYawPerTick(unit)
  return speed / yaw
}

/**
 * How far from the target the jet must fly after a pass before the next
 * inbound run. Weapon range alone is not enough: a half-turn started on
 * the engagement circle finishes inside it, so the next pass never lines up.
 * Two turn radii plus a short margin let the reversal complete outside range.
 */
export function getF22ReattackEgressDistance(weaponRange, turnRadius) {
  const range = Number.isFinite(weaponRange) && weaponRange > 0
    ? weaponRange
    : F22_DEFAULT_WEAPON_RANGE
  const turn = Number.isFinite(turnRadius) && turnRadius > 0
    ? turnRadius
    : TILE_SIZE * 7
  return range + turn * 2 + TILE_SIZE * 4
}

function normalizeAngle(angle) {
  const twoPi = Math.PI * 2
  let wrapped = angle % twoPi
  if (wrapped < 0) wrapped += twoPi
  return wrapped
}

function clampCoord(value, min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value
  return Math.max(min, Math.min(max, value))
}

/**
 * Pick an outbound point at the egress distance. The attack heading wins
 * when it stays on the map; otherwise the farthest in-bounds heading is used
 * so a target near the border does not trap the jet in a short circle.
 */
function selectEgressWaypoint(targetX, targetY, axis, egressDistance, bounds) {
  let bestX = targetX
  let bestY = targetY
  let bestScore = -Infinity
  let bestAchieved = 0

  for (let i = 0; i < 8; i++) {
    const angle = axis + (i * Math.PI) / 4
    const rawX = targetX + Math.cos(angle) * egressDistance
    const rawY = targetY + Math.sin(angle) * egressDistance
    const x = bounds ? clampCoord(rawX, bounds.minX, bounds.maxX) : rawX
    const y = bounds ? clampCoord(rawY, bounds.minY, bounds.maxY) : rawY
    const achieved = Math.hypot(x - targetX, y - targetY)
    // A few pixels of preference keeps the forward heading when distances tie.
    const score = achieved - i * 0.5
    if (score > bestScore) {
      bestScore = score
      bestAchieved = achieved
      bestX = x
      bestY = y
    }
  }

  return { x: bestX, y: bestY, achieved: bestAchieved }
}

/**
 * Plans one combat waypoint for an F22 attack run.
 * Inbound homes through a standoff pass inside the firing window.
 * After that pass, egress continues outbound until the jet can turn around
 * and re-enter the window on the next run. Ammo-empty return is left to
 * the existing airborne state machine.
 */
export function planF22CombatAttack(unit, targetCenter, bounds, weaponRange) {
  const range = Number.isFinite(weaponRange) && weaponRange > 0
    ? weaponRange
    : F22_DEFAULT_WEAPON_RANGE
  const turnRadius = getF22TurnRadius(unit)
  const egressDistance = getF22ReattackEgressDistance(range, turnRadius)

  const ux = unit.x + TILE_SIZE / 2
  const uy = unit.y + TILE_SIZE / 2
  const targetX = targetCenter.x
  const targetY = targetCenter.y
  const distance = Math.hypot(ux - targetX, uy - targetY)

  const nextTargetId = unit.f22AssignedDestination?.followTargetId ?? unit.target?.id ?? null
  if (unit.f22AttackTargetId !== nextTargetId) {
    unit.f22AttackTargetId = nextTargetId
    unit.f22AttackAxis = null
    unit.f22AttackPhase = null
  }

  if (!Number.isFinite(unit.f22AttackAxis)) {
    if (distance < range) {
      unit.f22AttackAxis = Math.atan2(uy - targetY, ux - targetX)
      unit.f22AttackPhase = 'egress'
    } else {
      unit.f22AttackAxis = Math.atan2(targetY - uy, targetX - ux)
      unit.f22AttackPhase = 'inbound'
    }
  }

  let axis = unit.f22AttackAxis
  let axisX = Math.cos(axis)
  let axisY = Math.sin(axis)
  let passX = targetX - axisY * F22_MIN_ATTACK_DISTANCE
  let passY = targetY + axisX * F22_MIN_ATTACK_DISTANCE

  const egressPoint = selectEgressWaypoint(targetX, targetY, axis, egressDistance + EGRESS_WAYPOINT_LEAD, bounds)
  const distToEgressPoint = Math.hypot(ux - egressPoint.x, uy - egressPoint.y)
  const egressReached = distance >= egressDistance || (
    egressPoint.achieved < egressDistance * 0.98 &&
    distToEgressPoint <= EGRESS_WAYPOINT_CAPTURE
  )

  if (unit.f22AttackPhase === 'egress' && egressReached) {
    axis = normalizeAngle(axis + Math.PI)
    unit.f22AttackAxis = axis
    unit.f22AttackPhase = 'inbound'
    axisX = Math.cos(axis)
    axisY = Math.sin(axis)
    passX = targetX - axisY * F22_MIN_ATTACK_DISTANCE
    passY = targetY + axisX * F22_MIN_ATTACK_DISTANCE
  } else if (unit.f22AttackPhase !== 'egress') {
    const alongToPass = (passX - ux) * axisX + (passY - uy) * axisY
    if (alongToPass < -PASSED_MARGIN) {
      unit.f22AttackPhase = 'egress'
    } else {
      unit.f22AttackPhase = 'inbound'
    }
  }

  let waypointX
  let waypointY
  if (unit.f22AttackPhase === 'egress') {
    const outbound = selectEgressWaypoint(targetX, targetY, axis, egressDistance + EGRESS_WAYPOINT_LEAD, bounds)
    waypointX = outbound.x
    waypointY = outbound.y
  } else {
    const toPassX = passX - ux
    const toPassY = passY - uy
    const mag = Math.hypot(toPassX, toPassY)
    if (mag < TILE_SIZE) {
      waypointX = passX + axisX * PASS_LEAD
      waypointY = passY + axisY * PASS_LEAD
    } else {
      waypointX = passX + (toPassX / mag) * PASS_LEAD
      waypointY = passY + (toPassY / mag) * PASS_LEAD
    }
    if (bounds) {
      waypointX = clampCoord(waypointX, bounds.minX, bounds.maxX)
      waypointY = clampCoord(waypointY, bounds.minY, bounds.maxY)
    }
  }

  return {
    x: waypointX,
    y: waypointY,
    phase: unit.f22AttackPhase,
    egressDistance,
    turnRadius,
    weaponRange: range,
    speedMultiplier: distance <= range ? F22_ATTACK_PASS_SPEED_MULTIPLIER : 1
  }
}
