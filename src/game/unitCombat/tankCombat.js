import { TILE_SIZE, TANK_FIRE_RANGE } from '../../config.js'
import { smoothRotateTowardsAngle } from '../../logic.js'
import { gameState } from '../../gameState.js'
import { COMBAT_CONFIG } from './combatConfig.js'
import { ensureLineOfSight, getEffectiveFireRange, getEffectiveFireRate, handleTankMovement, isHumanControlledParty, isTurretAimedAtTarget } from './combatHelpers.js'
import { handleApacheVolley, handleRocketBurstFire, handleTankFiring, handleTankV3BurstFire } from './firingHandlers.js'

/**
 * Updates standard tank combat
 */
export function updateTankCombat(unit, units, bullets, mapGrid, now, occupancyMap) {
  if (unit.target && unit.target.health > 0) {
    const CHASE_THRESHOLD = TANK_FIRE_RANGE * TILE_SIZE * COMBAT_CONFIG.CHASE_MULTIPLIER.STANDARD

    // Handle movement using common logic
    const { distance, targetCenterX, targetCenterY } = handleTankMovement(
      unit, unit.target, now, occupancyMap, CHASE_THRESHOLD, mapGrid
    )

    // Fire if in range and allowed to attack
    // Human player units (including remote multiplayer players) can always attack, AI units need AI permission
    const canAttack = isHumanControlledParty(unit.owner) || unit.allowedToAttack === true
    const effectiveRange = getEffectiveFireRange(unit)
    const clearShot = ensureLineOfSight(unit, unit.target, units, mapGrid)
    if (distance <= effectiveRange && canAttack && clearShot) {
      const effectiveFireRate = getEffectiveFireRate(unit, COMBAT_CONFIG.FIRE_RATES.STANDARD)
      handleTankFiring(unit, unit.target, bullets, now, effectiveFireRate, targetCenterX, targetCenterY, 'bullet', units, mapGrid, false, null, clearShot)
    }
  }
}

/**
 * Updates tank-v2 combat with improved targeting and alert mode
 */
export function updateTankV2Combat(unit, units, bullets, mapGrid, now, occupancyMap) {
  // Alert mode: automatically scan for targets when no target is assigned
  // Skip alert mode if unit is retreating
  if (unit.alertMode && isHumanControlledParty(unit.owner) && (!unit.target || unit.target.health <= 0) && !unit.isRetreating) {
    const ALERT_SCAN_RANGE = getEffectiveFireRange(unit)
    const unitCenterX = unit.x + TILE_SIZE / 2
    const unitCenterY = unit.y + TILE_SIZE / 2

    let closestEnemy = null
    let closestDistance = Infinity

    // Scan for enemy units within range
    units.forEach(potentialTarget => {
      if (potentialTarget.owner !== unit.owner && potentialTarget.health > 0) {
        // Check if target is an airborne Apache - only certain units can target them
        const targetIsAirborneApache =
          (potentialTarget.type === 'apache' || potentialTarget.type === 'f22Raptor') &&
          potentialTarget.flightState !== 'grounded'
        const shooterCanHitAir = unit.type === 'rocketTank' || unit.type === 'apache' || unit.type === 'f22Raptor'

        // Skip airborne Apache if this unit can't target air units
        if (targetIsAirborneApache && !shooterCanHitAir) {
          return
        }

        const targetCenterX = potentialTarget.x + TILE_SIZE / 2
        const targetCenterY = potentialTarget.y + TILE_SIZE / 2
        const distance = Math.hypot(targetCenterX - unitCenterX, targetCenterY - unitCenterY)

        if (distance <= ALERT_SCAN_RANGE && distance < closestDistance) {
          closestDistance = distance
          closestEnemy = potentialTarget
        }
      }
    })

    // Also scan for enemy buildings within range
    if (gameState.buildings) {
      gameState.buildings.forEach(building => {
        if (building.owner !== unit.owner && building.health > 0) {
          const buildingCenterX = building.x * TILE_SIZE + (building.width * TILE_SIZE) / 2
          const buildingCenterY = building.y * TILE_SIZE + (building.height * TILE_SIZE) / 2
          const distance = Math.hypot(buildingCenterX - unitCenterX, buildingCenterY - unitCenterY)

          if (distance <= ALERT_SCAN_RANGE && distance < closestDistance) {
            closestDistance = distance
            closestEnemy = building
          }
        }
      })
    }

    // Assign target if found, but don't move to chase it (alert mode stays in position)
    if (closestEnemy) {
      unit.target = closestEnemy
    }
  }

  if (unit.target && unit.target.health > 0) {
    const CHASE_THRESHOLD = TANK_FIRE_RANGE * TILE_SIZE * COMBAT_CONFIG.CHASE_MULTIPLIER.STANDARD

    // Handle movement using common logic, but prevent chasing if in alert mode
    let distance, targetCenterX, targetCenterY

    if (unit.alertMode && isHumanControlledParty(unit.owner)) {
      // Alert mode: don't move, just calculate distance for firing
      const unitCenterX = unit.x + TILE_SIZE / 2
      const unitCenterY = unit.y + TILE_SIZE / 2

      if (unit.target.tileX !== undefined) {
        // Target is a unit
        targetCenterX = unit.target.x + TILE_SIZE / 2
        targetCenterY = unit.target.y + TILE_SIZE / 2
      } else {
        // Target is a building
        targetCenterX = unit.target.x * TILE_SIZE + (unit.target.width * TILE_SIZE) / 2
        targetCenterY = unit.target.y * TILE_SIZE + (unit.target.height * TILE_SIZE) / 2
      }

      distance = Math.hypot(targetCenterX - unitCenterX, targetCenterY - unitCenterY)

      // Clear target if it moves out of range in alert mode
      if (distance > TANK_FIRE_RANGE * TILE_SIZE) {
        unit.target = null
        return
      }
    } else {
      // Normal mode: use standard movement logic
      const result = handleTankMovement(
        unit, unit.target, now, occupancyMap, CHASE_THRESHOLD, mapGrid
      )
      distance = result.distance
      targetCenterX = result.targetCenterX
      targetCenterY = result.targetCenterY
    }

    // Fire if in range and allowed to attack
    // Human player units (including remote multiplayer players) can always attack, AI units need AI permission
    const canAttack = isHumanControlledParty(unit.owner) || unit.allowedToAttack === true
    const effectiveRange = getEffectiveFireRange(unit)
    const clearShot = ensureLineOfSight(unit, unit.target, units, mapGrid)
    if (distance <= effectiveRange && canAttack && clearShot) {
      const effectiveFireRate = getEffectiveFireRate(unit, COMBAT_CONFIG.FIRE_RATES.STANDARD)
      handleTankFiring(unit, unit.target, bullets, now, effectiveFireRate, targetCenterX, targetCenterY, 'bullet', units, mapGrid, false, null, clearShot)
    }
  }
}

/**
 * Updates tank-v3 combat with aim-ahead feature
 */
export function updateTankV3Combat(unit, units, bullets, mapGrid, now, occupancyMap) {
  if (unit.target && unit.target.health > 0) {
    const CHASE_THRESHOLD = TANK_FIRE_RANGE * TILE_SIZE * COMBAT_CONFIG.CHASE_MULTIPLIER.STANDARD

    // Handle movement using common logic
    const { distance, targetCenterX, targetCenterY } = handleTankMovement(
      unit, unit.target, now, occupancyMap, CHASE_THRESHOLD, mapGrid
    )

    // Fire if in range and allowed to attack
    // Human player units (including remote multiplayer players) can always attack, AI units need AI permission
    const canAttack = isHumanControlledParty(unit.owner) || unit.allowedToAttack === true
    const effectiveRange = getEffectiveFireRange(unit)
    const clearShot = ensureLineOfSight(unit, unit.target, units, mapGrid)
    if (distance <= effectiveRange && canAttack && clearShot) {
      // Check if we need to start a new burst or continue existing one
      if (!unit.burstState) {
        // Start new burst if cooldown has passed
        const effectiveFireRate = getEffectiveFireRate(unit, COMBAT_CONFIG.FIRE_RATES.STANDARD)
        if (!unit.lastShotTime || now - unit.lastShotTime >= effectiveFireRate) {
          if (unit.canFire !== false && clearShot) {
            unit.burstState = {
              bulletsToFire: COMBAT_CONFIG.TANK_V3_BURST.COUNT,
              lastBulletTime: 0
            }
          }
        }
      } else {
        // Continue existing burst
        handleTankV3BurstFire(unit, unit.target, bullets, now, targetCenterX, targetCenterY, units, mapGrid)
      }
    }
  }
}

/**
 * Updates rocket tank combat
 */
export function updateRocketTankCombat(unit, units, bullets, mapGrid, now, occupancyMap) {
  const isF22 = unit.type === 'f22Raptor'

  // Clear target and burst if target is destroyed
  if (unit.target && unit.target.health <= 0) {
    unit.target = null
    unit.burstState = null
    if (isF22) {
      unit.volleyState = null
    }
    return
  }

  if (unit.target && unit.target.health > 0) {
    const CHASE_THRESHOLD = TANK_FIRE_RANGE * TILE_SIZE * COMBAT_CONFIG.CHASE_MULTIPLIER.ROCKET

    const rangeMultiplier = unit.type === 'f22Raptor' ? 1 : COMBAT_CONFIG.RANGE_MULTIPLIER.ROCKET
    const rocketRange = getEffectiveFireRange(unit) * rangeMultiplier

    let distance
    let targetCenterX
    let targetCenterY

    if (isF22) {
      const unitCenterX = unit.x + TILE_SIZE / 2
      const unitCenterY = unit.y + TILE_SIZE / 2
      if (unit.target.tileX !== undefined) {
        targetCenterX = unit.target.x + TILE_SIZE / 2
        targetCenterY = unit.target.y + TILE_SIZE / 2
        if ((unit.target.type === 'apache' || unit.target.type === 'f22Raptor') && unit.target.altitude) {
          targetCenterY -= unit.target.altitude * 0.4
        }
      } else {
        targetCenterX = unit.target.x * TILE_SIZE + (unit.target.width * TILE_SIZE) / 2
        targetCenterY = unit.target.y * TILE_SIZE + (unit.target.height * TILE_SIZE) / 2
      }
      distance = Math.hypot(targetCenterX - unitCenterX, targetCenterY - unitCenterY)
    } else {
      // Handle movement using common logic - this already adjusts for Apache altitude
      const result = handleTankMovement(
        unit, unit.target, now, occupancyMap, CHASE_THRESHOLD, mapGrid, rocketRange
      )
      distance = result.distance
      targetCenterX = result.targetCenterX
      targetCenterY = result.targetCenterY
    }

    // Rocket tanks have no turret - must rotate entire body to face target
    const unitCenterX = unit.x + TILE_SIZE / 2
    const unitCenterY = unit.y + TILE_SIZE / 2
    const angleToTarget = Math.atan2(targetCenterY - unitCenterY, targetCenterX - unitCenterX)

    // Rotate body towards target using normal rotation speed
    const rotationSpeed = unit.rotationSpeed || 0.1
    const currentDirection = unit.direction !== undefined ? unit.direction : (unit.movement?.rotation || 0)
    const newDirection = smoothRotateTowardsAngle(currentDirection, angleToTarget, rotationSpeed)

    // Update all direction properties
    unit.direction = newDirection
    if (unit.movement) {
      unit.movement.rotation = newDirection
    }

    // Fire rockets if in range and allowed to attack
    // Human player units (including remote multiplayer players) can always attack, AI units need AI permission
    const canAttack = isHumanControlledParty(unit.owner) || unit.allowedToAttack === true
    const effectiveRange = rocketRange
    const clearShot = true
    const hasActiveF22Volley = isF22 && Boolean(unit.volleyState)
    const minF22AttackDistance = TILE_SIZE * 6
    const inFiringWindow = isF22
      ? (hasActiveF22Volley || (distance <= effectiveRange && distance >= minF22AttackDistance))
      : distance <= effectiveRange
    if (inFiringWindow && canAttack && clearShot) {
      // Check if we need to start a new burst or continue existing one
      if (isF22) {
        if (unit.flightState === 'grounded') {
          unit.volleyState = null
          return
        }
        const readyForNewVolley = !unit.lastShotTime || now - unit.lastShotTime >= getEffectiveFireRate(unit, COMBAT_CONFIG.APACHE.FIRE_RATE)
        if (unit.volleyState || readyForNewVolley) {
          const volleyComplete = handleApacheVolley(unit, unit.target, bullets, now, targetCenterX, targetCenterY, units, mapGrid)
          if (volleyComplete) {
            unit.lastShotTime = now
          }
        }
      } else if (!unit.burstState) {
        // Start new burst if cooldown has passed
        const effectiveFireRate = getEffectiveFireRate(unit, COMBAT_CONFIG.FIRE_RATES.ROCKET)
        if (!unit.lastShotTime || now - unit.lastShotTime >= effectiveFireRate) {
          // Check if we have at least 1 rocket to fire
          const hasAmmo = typeof unit.ammunition !== 'number' || unit.ammunition > 0
          if (hasAmmo && unit.canFire !== false && isTurretAimedAtTarget(unit, unit.target)) {
            // Fire as many rockets as we have ammo for, up to burst count
            const rocketsToFire = typeof unit.ammunition === 'number'
              ? Math.min(COMBAT_CONFIG.ROCKET_BURST.COUNT, unit.ammunition)
              : COMBAT_CONFIG.ROCKET_BURST.COUNT
            // Start burst - don't set lastShotTime yet, only after burst completes
            unit.burstState = {
              rocketsToFire: rocketsToFire,
              lastRocketTime: 0
            }
          }
        }
      } else {
        // Continue existing burst
        handleRocketBurstFire(unit, unit.target, bullets, now, targetCenterX, targetCenterY, units, mapGrid)
      }
    }
  }
}
