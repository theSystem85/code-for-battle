import { TILE_SIZE } from '../config.js'

const NON_AIRBORNE_F35_STATES = new Set(['landing', 'takeoff'])

export function isF35AirborneForCombat(unit) {
  if (!unit || unit.type !== 'f35') return false
  if (unit.flightState === 'grounded') return false
  if (NON_AIRBORNE_F35_STATES.has(unit.flightState)) return false
  if (unit.isLanding || unit.isTakingOff || unit.isTaxiing || unit.isParked) return false
  if (unit.manualFlightState === 'land' || unit.manualFlightState === 'takeoff') return false
  if (unit.altitude <= 2) return false
  return true
}

export function canF35ReleaseWeapons(unit) {
  return isF35AirborneForCombat(unit) && unit.canFire !== false
}

export function canF35StartLanding(unit) {
  if (!unit || unit.type !== 'f35') return false
  const intent = unit.commandIntent || 'move'
  if (intent !== 'landAtStructure' && intent !== 'explicitLand' && intent !== 'returnToBase') {
    return false
  }

  if (!unit.helipadLandingRequested && !unit.groundLandingRequested) {
    return false
  }

  if (unit.helipadLandingRequested) {
    return Boolean(unit.helipadTargetId)
  }

  if (unit.groundLandingRequested) {
    return Boolean(unit.groundLandingTarget && Number.isFinite(unit.groundLandingTarget.x) && Number.isFinite(unit.groundLandingTarget.y))
  }

  return false
}

export function computeF35BombReleasePoint(unit, targetCenterX, targetCenterY) {
  const centerX = unit.x + TILE_SIZE / 2
  const centerY = unit.y + TILE_SIZE / 2
  const vx = unit.movement?.velocity?.x ?? Math.cos(unit.direction || 0) * (unit.movement?.currentSpeed || unit.airCruiseSpeed || unit.speed || 0)
  const vy = unit.movement?.velocity?.y ?? Math.sin(unit.direction || 0) * (unit.movement?.currentSpeed || unit.airCruiseSpeed || unit.speed || 0)
  const speed = Math.max(0.1, Math.hypot(vx, vy))
  const speedBasedTiles = Math.max(1, Math.min(3, speed / 1.2))
  const releaseDistance = speedBasedTiles * TILE_SIZE
  const dx = targetCenterX - centerX
  const dy = targetCenterY - centerY
  const distance = Math.max(1, Math.hypot(dx, dy))
  return {
    x: targetCenterX - (dx / distance) * releaseDistance,
    y: targetCenterY - (dy / distance) * releaseDistance,
    releaseDistance
  }
}
