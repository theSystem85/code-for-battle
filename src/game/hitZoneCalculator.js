// hitZoneCalculator.js - Calculates damage multipliers based on hit angle
import { HIT_ZONE_DAMAGE_MULTIPLIERS } from '../config.js'

/**
 * Determine if a unit is a tank that should have hit zone damage multipliers
 * @param {Object} unit - The unit being hit
 * @returns {boolean} True if the unit should have hit zone damage
 */
export function isTankUnit(unit) {
  if (!unit || !unit.type) return false

  const tankTypes = [
    'tank', 'tank_v1', 'tank_v2', 'tank_v3',
    'tank-v2', 'tank-v3', 'lightTank', 'rocketTank'
  ]

  return tankTypes.includes(unit.type)
}

/**
 * Calculate the hit zone damage multiplier based on the angle of attack
 * @param {Object} bullet - The bullet hitting the unit
 * @param {Object} unit - The unit being hit
 * @returns {Object} { multiplier: number, isRearHit: boolean }
 */
export function calculateHitZoneDamageMultiplier(bullet, unit) {
  // Default result for non-tank units
  const defaultResult = { multiplier: 1.0, isRearHit: false }

  if (!isTankUnit(unit)) {
    return defaultResult
  }

  // Get unit and bullet positions
  const unitCenterX = unit.x + 16 // TILE_SIZE / 2 = 32 / 2 = 16
  const unitCenterY = unit.y + 16
  const bulletX = bullet.x
  const bulletY = bullet.y

  // Calculate the angle from unit to bullet (attack direction)
  const attackAngle = Math.atan2(bulletY - unitCenterY, bulletX - unitCenterX)

  // Get unit's facing direction (tank direction or turret direction if available)
  const unitFacingAngle = unit.direction || unit.turretDirection || 0

  // Calculate the relative angle between unit facing and attack direction
  let relativeAngle = attackAngle - unitFacingAngle

  // Normalize the angle to [-π, π] range
  while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI
  while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI

  // Convert to absolute angle for zone calculation
  const absAngle = Math.abs(relativeAngle)

  // Determine hit zone based on relative angle
  // Front: -45° to +45° (π/4 radians)
  // Side: 45° to 135° (π/4 to 3π/4 radians)
  // Rear: 135° to 180° (3π/4 to π radians)

  if (absAngle <= Math.PI / 4) {
    // Front hit
    return {
      multiplier: HIT_ZONE_DAMAGE_MULTIPLIERS.FRONT,
      isRearHit: false
    }
  } else if (absAngle <= 3 * Math.PI / 4) {
    // Side hit
    return {
      multiplier: HIT_ZONE_DAMAGE_MULTIPLIERS.SIDE,
      isRearHit: false
    }
  } else {
    // Rear hit (critical damage)
    return {
      multiplier: HIT_ZONE_DAMAGE_MULTIPLIERS.REAR,
      isRearHit: true
    }
  }
}
