import {
  TILE_SIZE,
  TANK_FIRE_RANGE,
  TURRET_AIMING_THRESHOLD,
  HOWITZER_FIRE_RANGE,
  HOWITZER_MIN_RANGE,
  HOWITZER_FIREPOWER,
  HOWITZER_FIRE_COOLDOWN,
  APACHE_RANGE_REDUCTION
} from '../../config.js'
import { hasClearShot, angleDiff, findPositionWithClearShot } from '../../logic.js'
import { stopUnitMovement } from '../unifiedMovement.js'
import { gameState } from '../../gameState.js'
import { isPositionVisibleToPlayer } from '../shadowOfWar.js'
import { gameRandom } from '../../utils/gameRandom.js'
import { COMBAT_CONFIG } from './combatConfig.js'

/**
 * Check if a party is controlled by a human player (not AI)
 * In multiplayer, any party with aiActive === false is human-controlled
 * @param {string} owner - The owner/partyId to check
 * @returns {boolean} True if the party is human-controlled
 */
export function isHumanControlledParty(owner) {
  // Always allow the local human player
  if (owner === gameState.humanPlayer) {
    return true
  }
  // Check partyStates for multiplayer - any party with aiActive === false is human
  if (Array.isArray(gameState.partyStates)) {
    const partyState = gameState.partyStates.find(p => p.partyId === owner)
    if (partyState && partyState.aiActive === false) {
      return true
    }
  }
  return false
}

/**
 * Check if the turret is properly aimed at the target
 * @param {Object} unit - Tank unit
 * @param {Object} target - Target to aim at
 * @returns {boolean} True if turret is aimed within threshold
 */
export function isTurretAimedAtTarget(unit, target) {
  if (!target) {
    return false
  }

  if (unit.type === 'howitzer') {
    const unitCenterX = unit.x + TILE_SIZE / 2
    const unitCenterY = unit.y + TILE_SIZE / 2

    let targetCenterX
    let targetCenterY

    if (target.tileX !== undefined) {
      targetCenterX = target.x + TILE_SIZE / 2
      targetCenterY = target.y + TILE_SIZE / 2
    } else {
      targetCenterX = target.x * TILE_SIZE + (target.width * TILE_SIZE) / 2
      targetCenterY = target.y * TILE_SIZE + (target.height * TILE_SIZE) / 2
    }

    const angleToTarget = Math.atan2(targetCenterY - unitCenterY, targetCenterX - unitCenterX)
    const angleDifference = Math.abs(angleDiff(unit.direction || 0, angleToTarget))
    return angleDifference <= TURRET_AIMING_THRESHOLD
  }

  if (unit.turretDirection === undefined) {
    return false
  }

  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2

  let targetCenterX, targetCenterY

  if (target.tileX !== undefined) {
    // Target is a unit
    targetCenterX = target.x + TILE_SIZE / 2
    targetCenterY = target.y + TILE_SIZE / 2
  } else {
    // Target is a building
    targetCenterX = target.x * TILE_SIZE + (target.width * TILE_SIZE) / 2
    targetCenterY = target.y * TILE_SIZE + (target.height * TILE_SIZE) / 2
  }

  // Calculate the angle to target
  const angleToTarget = Math.atan2(targetCenterY - unitCenterY, targetCenterX - unitCenterX)

  // Check if turret is aimed within the threshold
  const angleDifference = Math.abs(angleDiff(unit.turretDirection, angleToTarget))

  // Tank V3 has better aiming precision
  const aimingThreshold = unit.type === 'tank-v3' ? TURRET_AIMING_THRESHOLD * 0.5 : TURRET_AIMING_THRESHOLD

  return angleDifference <= aimingThreshold
}

/**
 * Enhanced targeting spread with controlled randomness for better accuracy
 */
export function applyTargetingSpread(shooterX, shooterY, targetX, targetY, projectileType, unitType = null) {
  // Skip spread for rockets to maintain precision
  if (projectileType === 'rocket') {
    return { x: targetX, y: targetY }
  }

  // Calculate base angle and distance from shooter to target
  const baseAngle = Math.atan2(targetY - shooterY, targetX - shooterX)
  const distance = Math.hypot(targetX - shooterX, targetY - shooterY)

  // Different spread amounts based on unit type
  let maxAngleOffset
  if (unitType === 'tank-v3') {
    maxAngleOffset = 0.009 // about 0.5 degrees - very accurate
  } else if (unitType === 'tank-v2') {
    maxAngleOffset = 0.017 // about 1 degree
  } else {
    maxAngleOffset = 0.035 // about 2 degrees for standard tanks
  }

  const angleOffset = (gameRandom() * 2 - 1) * maxAngleOffset
  const finalAngle = baseAngle + angleOffset

  return {
    x: shooterX + Math.cos(finalAngle) * distance,
    y: shooterY + Math.sin(finalAngle) * distance
  }
}

/**
 * Common combat logic helper - handles stopping when in range
 * NOTE: Path calculation is handled by updateUnitMovement() in unitMovement.js
 * This function only handles the "stop when in range" logic
 */

export function handleTankMovement(unit, target, now, occupancyMap, chaseThreshold, mapGrid, rangeOverride = null) {
  // Skip movement handling if unit is retreating (retreat behavior handles movement)
  if (unit.isRetreating) {
    // Still calculate distance for firing decisions
    const unitCenterX = unit.x + TILE_SIZE / 2
    const unitCenterY = unit.y + TILE_SIZE / 2

    let targetCenterX, targetCenterY

    if (target.tileX !== undefined) {
      // Target is a unit
      targetCenterX = target.x + TILE_SIZE / 2
      targetCenterY = target.y + TILE_SIZE / 2
      // Adjust for Apache altitude visual offset
      if (target.type === 'apache' && target.altitude) {
        targetCenterY -= target.altitude * 0.4
      }
    } else {
      // Target is a building
      targetCenterX = target.x * TILE_SIZE + (target.width * TILE_SIZE) / 2
      targetCenterY = target.y * TILE_SIZE + (target.height * TILE_SIZE) / 2
    }

    const distance = Math.hypot(targetCenterX - unitCenterX, targetCenterY - unitCenterY)
    return { distance, targetCenterX, targetCenterY }
  }

  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2

  let targetCenterX, targetCenterY

  if (target.tileX !== undefined) {
    // Target is a unit
    targetCenterX = target.x + TILE_SIZE / 2
    targetCenterY = target.y + TILE_SIZE / 2
    // Adjust for Apache altitude visual offset
    if (target.type === 'apache' && target.altitude) {
      targetCenterY -= target.altitude * 0.4
    }
  } else {
    // Target is a building
    targetCenterX = target.x * TILE_SIZE + (target.width * TILE_SIZE) / 2
    targetCenterY = target.y * TILE_SIZE + (target.height * TILE_SIZE) / 2
  }

  const distance = Math.hypot(targetCenterX - unitCenterX, targetCenterY - unitCenterY)

  // Combat movement logic - stop and attack if in range
  // Exception: Don't stop movement if unit is retreating
  const effectiveRange = typeof rangeOverride === 'number' ? rangeOverride : getEffectiveFireRange(unit)
  if (distance <= effectiveRange && !unit.isRetreating && !unit.remoteControlActive) {
    // In firing range - stop all movement and clear path
    if (unit.path && unit.path.length > 0) {
      unit.path = [] // Clear path to stop movement when in range
      unit.moveTarget = null // Clear movement target when in firing range
    }
    // Force stop using unified movement system
    stopUnitMovement(unit)
  }
  // NOTE: Path calculation when out of range is handled by updateUnitMovement() in unitMovement.js
  // This function should NOT recalculate paths - that causes duplicate path calculations and erratic movement

  return { distance, targetCenterX, targetCenterY }
}

export function ensureLineOfSight(unit, target, units, mapGrid) {
  if (!target) {
    return false
  }

  if (!mapGrid) {
    return true
  }

  const clearShot = hasClearShot(unit, target, units, mapGrid)

  if (!clearShot && !unit.findingClearShot) {
    unit.findingClearShot = true
    findPositionWithClearShot(unit, target, units, mapGrid)
  }

  return clearShot
}

/**
 * Get damage value based on unit type
 */
export function getDamageForUnitType(unitType) {
  switch (unitType) {
    case 'tank-v3': return COMBAT_CONFIG.DAMAGE.TANK_V3
    case 'rocketTank': return COMBAT_CONFIG.DAMAGE.ROCKET
    case 'apache': return COMBAT_CONFIG.DAMAGE.APACHE
    default: return COMBAT_CONFIG.DAMAGE.STANDARD
  }
}

/**
 * Get the effective fire range for a unit (including level bonuses)
 * @param {Object} unit - The unit to get fire range for
 * @returns {number} Effective fire range in pixels
 */
export function getEffectiveFireRange(unit) {
  if (unit.type === 'howitzer') {
    let baseRange = HOWITZER_FIRE_RANGE * TILE_SIZE
    if (unit.rangeMultiplier) {
      baseRange *= unit.rangeMultiplier
    }
    return baseRange
  }

  let baseRange = TANK_FIRE_RANGE * TILE_SIZE

  if (unit.type === 'apache') {
    baseRange *= APACHE_RANGE_REDUCTION
  } else if (unit.type === 'f22Raptor') {
    baseRange = 16 * TILE_SIZE
  }

  if (unit.level >= 1) {
    baseRange *= (unit.rangeMultiplier || 1.2)
  }

  return baseRange
}

/**
 * Get the effective fire rate for a unit (including level bonuses)
 * @param {Object} unit - The unit to get fire rate for
 * @param {number} baseFireRate - Base fire rate in milliseconds
 * @returns {number} Effective fire rate in milliseconds
 */
export function getEffectiveFireRate(unit, baseFireRate) {
  let effectiveRate = baseFireRate

  // Apply level 3 bonus: 33% fire rate increase (faster firing = lower milliseconds)
  if (unit.level >= 3) {
    effectiveRate = baseFireRate / (unit.fireRateMultiplier || 1.33)
  }

  return effectiveRate
}

export function getHowitzerRange(unit) {
  const rangeMultiplier = unit.rangeMultiplier || 1
  return HOWITZER_FIRE_RANGE * TILE_SIZE * rangeMultiplier
}

export function getHowitzerMinRange() {
  return HOWITZER_MIN_RANGE * TILE_SIZE
}

export function getHowitzerCooldown(unit) {
  const fireRateMultiplier = unit.fireRateMultiplier || 1
  return HOWITZER_FIRE_COOLDOWN / fireRateMultiplier
}

export function getHowitzerDamage(unit) {
  const damageMultiplier = unit.damageMultiplier || 1
  return HOWITZER_FIREPOWER * damageMultiplier
}

export function isHowitzerTargetVisible(unit, target, mapGrid) {
  if (!gameState.shadowOfWarEnabled) {
    return true
  }

  if (!target) return false

  let targetCenterX
  let targetCenterY

  if (target.tileX !== undefined) {
    targetCenterX = target.x + TILE_SIZE / 2
    targetCenterY = target.y + TILE_SIZE / 2
  } else {
    targetCenterX = target.x * TILE_SIZE + (target.width * TILE_SIZE) / 2
    targetCenterY = target.y * TILE_SIZE + (target.height * TILE_SIZE) / 2
  }

  return isPositionVisibleToPlayer(gameState, mapGrid, targetCenterX, targetCenterY)
}

/**
 * Apply armor reduction to incoming damage
 * @param {Object} unit - The unit taking damage
 * @param {number} baseDamage - Base damage amount
 * @returns {number} Reduced damage after armor
 */
export function _applyArmorReduction(unit, baseDamage) {
  if (unit.armor && unit.armor > 1) {
    // Armor reduces damage by a percentage
    // Level 2 gives 50% armor increase
    const armorMultiplier = unit.armor
    return baseDamage / armorMultiplier
  }
  return baseDamage
}
