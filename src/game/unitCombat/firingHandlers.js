import { TILE_SIZE, TANK_BULLET_SPEED, HOWITZER_PROJECTILE_SPEED, HOWITZER_EXPLOSION_RADIUS_TILES } from '../../config.js'
import { playSound, playPositionalSound } from '../../sound.js'
import { hasClearShot } from '../../logic.js'
import { gameState } from '../../gameState.js'
import { showNotification } from '../../ui/notifications.js'
import { getRocketSpawnPoint } from '../../rendering/rocketTankImageRenderer.js'
import { getApacheRocketSpawnPoints } from '../../rendering/apacheImageRenderer.js'
import { isHowitzerGunReadyToFire, getHowitzerLaunchAngle } from '../howitzerGunController.js'
import { gameRandom } from '../../utils/gameRandom.js'
import { COMBAT_CONFIG } from './combatConfig.js'
import { applyTargetingSpread, getDamageForUnitType, getHowitzerDamage, isTurretAimedAtTarget } from './combatHelpers.js'

/**
 * Common firing logic helper - handles bullet creation
 */
export function handleTankFiring(unit, target, bullets, now, fireRate, targetCenterX, targetCenterY, projectileType = 'bullet', units, mapGrid, usePredictiveAiming = false, overrideTarget = null, clearShotOverride = null) {
  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2

  // Check crew restrictions for firing
  if (unit.crew && typeof unit.crew === 'object' && !unit.crew.loader) {
    // Tank cannot fire without loader
    return false
  }

  // Check ammunition availability
  const ammoField = (unit.type === 'apache' || unit.type === 'f22Raptor') ? 'rocketAmmo' : 'ammunition'
  const ammoValue = unit[ammoField]
  if (typeof ammoValue === 'number' && ammoValue <= 0) {
    // Unit has no ammunition, cannot fire
    // Show notification only for player units and only once per unit
    if (unit.owner === gameState.humanPlayer && !unit.noAmmoNotificationShown) {
      showNotification('No Ammunition - Resupply Required', 3000)
      playSound('i_am_out_of_ammo', 1.0, 0, true) // Stackable so multiple units can announce
      unit.noAmmoNotificationShown = true
    }
    return false
  } else if (ammoValue > 0) {
    // Reset notification flag when unit has ammo again
    unit.noAmmoNotificationShown = false
  }

  if (!unit.lastShotTime || now - unit.lastShotTime >= fireRate) {
    // Check if turret is properly aimed at the target before firing
    const clearShot = (unit.type === 'apache' || unit.type === 'f22Raptor' || unit.type === 'rocketTank')
      ? true
      : (clearShotOverride ?? hasClearShot(unit, target, units, mapGrid))
    const turretAimed = (unit.type === 'apache' || unit.type === 'f22Raptor') ? true : isTurretAimedAtTarget(unit, target)
    if (unit.canFire !== false && clearShot && turretAimed) {
      const targetIsAirborneApache = target && (target.type === 'apache' || target.type === 'f22Raptor') && target.flightState !== 'grounded'
      const shooterCanHitAir =
        unit.type === 'rocketTank' ||
        unit.type === 'apache' ||
        unit.type === 'f22Raptor' ||
        unit.type === 'rocketTurret'
      if (targetIsAirborneApache && !shooterCanHitAir) {
        return false
      }
      // Calculate aim position (with predictive aiming if enabled)
      let aimX = overrideTarget ? overrideTarget.x : targetCenterX
      let aimY = overrideTarget ? overrideTarget.y : targetCenterY

      if (!overrideTarget && usePredictiveAiming && target.lastKnownX !== undefined && target.lastKnownY !== undefined) {
        const targetVelX = targetCenterX - target.lastKnownX
        const targetVelY = targetCenterY - target.lastKnownY
        const bulletSpeed = projectileType === 'rocket' ? 3 : TANK_BULLET_SPEED
        const distance = Math.sqrt((targetCenterX - unitCenterX) ** 2 + (targetCenterY - unitCenterY) ** 2)

        // Conservative predictive aiming with velocity damping
        const velocityMagnitude = Math.hypot(targetVelX, targetVelY)
        const dampingFactor = Math.min(1, 20 / (velocityMagnitude + 1)) // Reduce prediction for fast targets
        const baseLead = Math.min(0.3, distance / (bulletSpeed * 100)) // Scale with distance
        const leadFactor = baseLead * dampingFactor

        aimX = targetCenterX + targetVelX * leadFactor
        aimY = targetCenterY + targetVelY * leadFactor
      }

      // Store current position for next frame's velocity calculation (for predictive aiming)
      if (usePredictiveAiming && !overrideTarget) {
        target.lastKnownX = targetCenterX
        target.lastKnownY = targetCenterY
      }

      let finalTarget
      if (overrideTarget) {
        finalTarget = overrideTarget
      } else {
        finalTarget = applyTargetingSpread(unitCenterX, unitCenterY, aimX, aimY, projectileType, unit.type)
      }

      const angle = Math.atan2(finalTarget.y - unitCenterY, finalTarget.x - unitCenterX)

      const isRocketTankRocket = projectileType === 'rocket' && unit.type === 'rocketTank'
      const isApacheRocket = projectileType === 'rocket' && (unit.type === 'apache' || unit.type === 'f22Raptor')
      const bulletSpeed = isRocketTankRocket
        ? 6
        : (projectileType === 'rocket' ? (isApacheRocket ? 5 : 3) : TANK_BULLET_SPEED)

      let rocketSpawn = null
      if (isRocketTankRocket) {
        rocketSpawn = getRocketSpawnPoint(unit, unitCenterX, unitCenterY)
      } else if (isApacheRocket) {
        rocketSpawn = unit.customRocketSpawn || getApacheRocketSpawnPoints(unit, unitCenterX, unitCenterY).left
      }

      const bullet = {
        id: Date.now() + gameRandom(),
        x: (isRocketTankRocket || isApacheRocket) ? rocketSpawn.x : unitCenterX,
        y: (isRocketTankRocket || isApacheRocket) ? rocketSpawn.y : unitCenterY,
        speed: bulletSpeed,
        baseDamage: getDamageForUnitType(unit.type),
        active: true,
        shooter: unit,
        homing: isRocketTankRocket ? true : (isApacheRocket ? false : (projectileType === 'rocket')),
        target: projectileType === 'rocket' && !isApacheRocket ? target : null,
        targetPosition: { x: finalTarget.x, y: finalTarget.y },
        startTime: now,
        projectileType
      }

      // For rocket tank rockets, explicitly ensure target is set for burst consistency
      if (isRocketTankRocket && target) {
        bullet.target = target
        bullet.burstRocket = true // Mark as part of a burst for debugging/tracking
      }

      if (isApacheRocket) {
        bullet.explosionRadius = TILE_SIZE
        bullet.skipCollisionChecks = true
        bullet.maxFlightTime = 3000 // 3 seconds max flight time before forced explosion
        bullet.creationTime = now
        bullet.startX = rocketSpawn.x
        bullet.startY = rocketSpawn.y
        bullet.apacheTargetRadius = TILE_SIZE * 0.3
        // Apache rockets fly straight to their target position
        const dx = finalTarget.x - rocketSpawn.x
        const dy = finalTarget.y - rocketSpawn.y
        const distance = Math.hypot(dx, dy)
        bullet.vx = (dx / distance) * bulletSpeed
        bullet.vy = (dy / distance) * bulletSpeed
        bullet.f22Rocket = unit.type === 'f22Raptor'
      }

      if (isRocketTankRocket) {
        const dx = finalTarget.x - rocketSpawn.x
        const dy = finalTarget.y - rocketSpawn.y
        const distance = Math.hypot(dx, dy)
        bullet.ballistic = true
        bullet.startX = rocketSpawn.x
        bullet.startY = rocketSpawn.y
        bullet.targetX = finalTarget.x
        bullet.targetY = finalTarget.y
        bullet.dx = dx
        bullet.dy = dy
        bullet.distance = distance
        bullet.flightDuration = distance / bulletSpeed
        bullet.ballisticDuration = bullet.flightDuration / 2
        bullet.arcHeight = Math.max(50, distance * 0.3)
        bullet.originType = 'rocketTank'
        // Skip collision checks so rockets fly over units/wrecks/buildings to hit their target
        bullet.skipCollisionChecks = true
        bullet.maxFlightTime = 5000
        bullet.creationTime = now
      } else if (!bullet.homing) {
        bullet.vx = bullet.speed * Math.cos(angle)
        bullet.vy = bullet.speed * Math.sin(angle)
      }

      bullets.push(bullet)

      // Deplete ammunition when firing (skip apache/f22 - handled in handleApacheVolley)
      if (unit.type !== 'apache' && unit.type !== 'f22Raptor') {
        if (typeof unit.ammunition === 'number') {
          // Rocket tanks fire 1 rocket at a time in burst, so deplete by 1
          // Other units use ammoPerShot
          const ammoToUse = unit.type === 'rocketTank' ? 1 : (unit.ammoPerShot || 1)
          unit.ammunition = Math.max(0, unit.ammunition - ammoToUse)
        }
      }

      const soundName = projectileType === 'rocket' ? 'shoot_rocket' : 'shoot'
      const vol = projectileType === 'rocket' ? 0.3 : 0.5
      playPositionalSound(soundName, bullet.x, bullet.y, vol)
      unit.lastShotTime = now

      // Trigger recoil and muzzle flash animations
      unit.recoilStartTime = now
      unit.muzzleFlashStartTime = now

      if (isApacheRocket && unit.customRocketSpawn) {
        delete unit.customRocketSpawn
      }
      if (isApacheRocket) {
        bullet.originType = 'apacheRocket'
        bullet.apacheTargetId = target ? target.id : null
      }

      return true
    }
  }
  return false
}

/**
 * Handle burst fire for rocket tanks (replaces setTimeout)
 */
export function handleRocketBurstFire(unit, target, bullets, now, targetCenterX, targetCenterY, units, mapGrid) {
  // Initialize full burst state on first fire (might have been partially initialized in updateRocketTankCombat)
  if (!unit.burstState.burstTarget) {
    // Complete the burst state initialization - store target reference for all rockets in this burst
    unit.burstState.burstTarget = target
    unit.burstState.burstTargetCenter = { x: targetCenterX, y: targetCenterY }
  }

  // Fire rockets with proper timing in the game loop
  if (unit.burstState.rocketsToFire > 0 &&
        now - unit.burstState.lastRocketTime >= COMBAT_CONFIG.ROCKET_BURST.DELAY) {

    // Use the stored burst target to ensure all rockets in the burst target the same unit
    const burstTarget = unit.burstState.burstTarget && unit.burstState.burstTarget.health > 0 ? unit.burstState.burstTarget : target

    // Use current target center position for dynamic tracking (target may have moved)
    let currentTargetCenterX = targetCenterX
    let currentTargetCenterY = targetCenterY

    // If target is alive, use its current position for homing
    if (burstTarget && burstTarget.health > 0) {
      if (typeof burstTarget.width === 'number' && typeof burstTarget.height === 'number') {
        // Building target
        currentTargetCenterX = burstTarget.x * TILE_SIZE + (burstTarget.width * TILE_SIZE) / 2
        currentTargetCenterY = burstTarget.y * TILE_SIZE + (burstTarget.height * TILE_SIZE) / 2
      } else {
        // Unit target - use current position
        currentTargetCenterX = burstTarget.x + TILE_SIZE / 2
        currentTargetCenterY = burstTarget.y + TILE_SIZE / 2
        // Adjust for Apache altitude visual offset
        if ((burstTarget.type === 'apache' || burstTarget.type === 'f22Raptor') && burstTarget.altitude) {
          currentTargetCenterY -= burstTarget.altitude * 0.4
        }
      }
    }

    // Fire the rocket - no overrideTarget, let normal targeting spread apply per-rocket
    // The target unit reference ensures homing works correctly
    const fired = handleTankFiring(unit, burstTarget, bullets, now, 0, currentTargetCenterX, currentTargetCenterY, 'rocket', units, mapGrid, false, null)

    if (fired) {
      unit.burstState.rocketsToFire--
      unit.burstState.lastRocketTime = now

      if (unit.burstState.rocketsToFire <= 0) {
        unit.burstState = null // Reset burst state
        unit.lastShotTime = now // Set cooldown for next burst
        return true // Burst complete
      }
    }
  }

  return false // Burst still in progress or failed
}

/**
 * Handle multi-rocket volley for Apache helicopter
 */
export function handleApacheVolley(unit, target, bullets, now, targetCenterX, targetCenterY, units, mapGrid) {
  const estimateF22RocketDamage = targetEntity => {
    if (!targetEntity) return 30
    const armor = targetEntity.armor && targetEntity.armor > 0 ? targetEntity.armor : 1
    const isTankFamily = ['tank', 'tank_v1', 'tank-v2', 'tank-v3'].includes(targetEntity.type)
    const rawDamage = isTankFamily ? 50 : 30
    return Math.max(1, Math.round(rawDamage / armor))
  }

  const getF22PendingRocketCount = targetEntity => {
    if (!Array.isArray(bullets) || !targetEntity) return 0
    return bullets.reduce((count, bullet) => {
      if (!bullet?.active || !bullet.f22Rocket) return count
      if (bullet.shooter?.id !== unit.id) return count
      if (bullet.target === targetEntity) return count + 1
      if (targetEntity.id && bullet.apacheTargetId === targetEntity.id) return count + 1
      return count
    }, 0)
  }

  const availableAmmo = Math.max(0, Math.floor(unit.rocketAmmo || 0))
  const isF22 = unit.type === 'f22Raptor'
  if (availableAmmo <= 0) {
    unit.volleyState = null
    unit.apacheAmmoEmpty = true
    unit.canFire = false
    return true
  }

  if (!unit.volleyState) {
    let rocketsThisVolley = isF22 ? availableAmmo : Math.min(8, availableAmmo)

    if (isF22 && target?.health > 0) {
      const estimatedDamage = estimateF22RocketDamage(target)
      const pendingRockets = getF22PendingRocketCount(target)
      const pendingDamage = pendingRockets * estimatedDamage
      const remainingHealth = Math.max(0, target.health - pendingDamage)
      const rocketsRequired = Math.max(1, Math.ceil(remainingHealth / estimatedDamage))
      rocketsThisVolley = Math.max(1, Math.min(rocketsThisVolley, rocketsRequired))
    }

    const leftCount = Math.min(4, Math.ceil(rocketsThisVolley / 2))
    const rightCount = Math.min(4, rocketsThisVolley - leftCount)

    unit.volleyState = {
      leftRemaining: leftCount,
      rightRemaining: rightCount,
      lastRocketTime: 0,
      delay: isF22 ? 333 : COMBAT_CONFIG.APACHE.VOLLEY_DELAY,
      nextSide: 'left',
      totalInVolley: rocketsThisVolley
    }
  }

  const state = unit.volleyState
  if (state.leftRemaining <= 0 && state.rightRemaining <= 0) {
    unit.volleyState = null
    return true
  }

  if (now - state.lastRocketTime < state.delay) {
    return false
  }

  let side = state.nextSide
  if (side === 'left' && state.leftRemaining <= 0) side = 'right'
  if (side === 'right' && state.rightRemaining <= 0) side = 'left'

  if (state.leftRemaining <= 0 && state.rightRemaining <= 0) {
    unit.volleyState = null
    return true
  }

  const centerX = unit.x + TILE_SIZE / 2
  const centerY = unit.y + TILE_SIZE / 2
  const spawnPoints = getApacheRocketSpawnPoints(unit, centerX, centerY)
  const spawn = spawnPoints[side] || { x: centerX, y: centerY }

  let approachVectorX = targetCenterX - centerX
  let approachVectorY = targetCenterY - centerY
  let approachDistance = Math.hypot(approachVectorX, approachVectorY)
  if (approachDistance < 1) {
    const fallbackAngle = unit.direction || 0
    approachVectorX = Math.cos(fallbackAngle)
    approachVectorY = Math.sin(fallbackAngle)
    approachDistance = 1
  }

  const forwardNormX = approachVectorX / approachDistance
  const forwardNormY = approachVectorY / approachDistance
  const maxImpactDistance = Math.min(approachDistance, TILE_SIZE * 0.9)
  const desiredImpactDistance = Math.max(
    Math.min(TILE_SIZE * 0.3, maxImpactDistance),
    Math.min(approachDistance * 0.6, maxImpactDistance)
  )

  const baseImpactX = targetCenterX - forwardNormX * desiredImpactDistance
  const baseImpactY = targetCenterY - forwardNormY * desiredImpactDistance
  const perpendicularX = -forwardNormY
  const perpendicularY = forwardNormX
  const lateralSpan = Math.min(TILE_SIZE * 0.35, approachDistance * 0.25)
  const lateralOffset = (gameRandom() - 0.5) * 2 * lateralSpan
  const forwardJitter = (gameRandom() - 0.5) * Math.min(TILE_SIZE * 0.2, desiredImpactDistance * 0.4)

  let impactX = baseImpactX - forwardNormX * forwardJitter + perpendicularX * lateralOffset
  let impactY = baseImpactY - forwardNormY * forwardJitter + perpendicularY * lateralOffset

  if (Array.isArray(mapGrid) && mapGrid.length > 0 && Array.isArray(mapGrid[0])) {
    const mapWidth = mapGrid[0].length * TILE_SIZE
    const mapHeight = mapGrid.length * TILE_SIZE
    const minX = TILE_SIZE * 0.5
    const minY = TILE_SIZE * 0.5
    const maxX = Math.max(minX, mapWidth - TILE_SIZE * 0.5)
    const maxY = Math.max(minY, mapHeight - TILE_SIZE * 0.5)
    impactX = Math.max(minX, Math.min(impactX, maxX))
    impactY = Math.max(minY, Math.min(impactY, maxY))
  }

  const overrideTarget = { x: impactX, y: impactY }

  unit.customRocketSpawn = spawn
  const fired = handleTankFiring(
    unit,
    target,
    bullets,
    now,
    0,
    overrideTarget.x,
    overrideTarget.y,
    'rocket',
    units,
    mapGrid,
    false,
    overrideTarget // Override target to bypass targeting spread
  )
  unit.customRocketSpawn = null

  if (fired) {
    unit.rocketAmmo = Math.max(0, (unit.rocketAmmo || 0) - 1)
    if (side === 'left') {
      state.leftRemaining = Math.max(0, state.leftRemaining - 1)
    } else {
      state.rightRemaining = Math.max(0, state.rightRemaining - 1)
    }
    state.lastRocketTime = now
    state.nextSide = side === 'left' ? 'right' : 'left'

    if (state.leftRemaining <= 0 && state.rightRemaining <= 0) {
      unit.volleyState = null
      return true
    }
    if (unit.rocketAmmo <= 0) {
      unit.apacheAmmoEmpty = true
      unit.canFire = false
      unit.volleyState = null
      return true
    }
  }

  return false
}

/**
 * Handle burst fire for tank V3 (2 bullets per burst)
 */
export function handleTankV3BurstFire(unit, target, bullets, now, targetCenterX, targetCenterY, units, mapGrid) {
  if (!unit.burstState) {
    unit.burstState = {
      bulletsToFire: COMBAT_CONFIG.TANK_V3_BURST.COUNT,
      lastBulletTime: 0
    }
  }

  // Fire bullets with proper timing in the game loop
  if (unit.burstState.bulletsToFire > 0 &&
        now - unit.burstState.lastBulletTime >= COMBAT_CONFIG.TANK_V3_BURST.DELAY) {

    // Calculate fresh predictive aim for each shot in the burst
    let aimX = targetCenterX
    let aimY = targetCenterY

    // Apply predictive aiming if we have previous target position data
    if (target.lastKnownX !== undefined && target.lastKnownY !== undefined) {
      const unitCenterX = unit.x + TILE_SIZE / 2
      const unitCenterY = unit.y + TILE_SIZE / 2
      const targetVelX = targetCenterX - target.lastKnownX
      const targetVelY = targetCenterY - target.lastKnownY
      const bulletSpeed = TANK_BULLET_SPEED
      const distance = Math.hypot(targetCenterX - unitCenterX, targetCenterY - unitCenterY)

      // Conservative predictive aiming with velocity damping
      // Reduce prediction strength for high velocities to avoid overshooting
      const velocityMagnitude = Math.hypot(targetVelX, targetVelY)
      const dampingFactor = Math.min(1, 20 / (velocityMagnitude + 1)) // Reduce prediction for fast targets
      const baseLead = Math.min(0.3, distance / (bulletSpeed * 100)) // Scale with distance
      const leadFactor = baseLead * dampingFactor

      aimX = targetCenterX + targetVelX * leadFactor
      aimY = targetCenterY + targetVelY * leadFactor
    }

    // Update target position for next frame's velocity calculation
    target.lastKnownX = targetCenterX
    target.lastKnownY = targetCenterY

    // Don't apply targeting spread here - it will be applied in handleTankFiring
    const aimTarget = { x: aimX, y: aimY }

    const fired = handleTankFiring(
      unit,
      target,
      bullets,
      now,
      0,
      targetCenterX,
      targetCenterY,
      'bullet',
      units,
      mapGrid,
      false,
      aimTarget
    )

    if (fired) {
      unit.burstState.bulletsToFire--
      unit.burstState.lastBulletTime = now

      if (unit.burstState.bulletsToFire <= 0) {
        unit.burstState = null // Reset burst state
        unit.lastShotTime = now // Set cooldown for next burst
        return true // Burst complete
      }
    }
  }

  return false // Burst still in progress or failed
}

export function fireHowitzerShell(unit, aimTarget, bullets, now) {
  if (!isHowitzerGunReadyToFire(unit)) {
    return
  }
  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2

  const launchAngle = getHowitzerLaunchAngle(unit)
  const muzzleDistance = TILE_SIZE
  const muzzleX = unitCenterX + muzzleDistance * Math.cos(launchAngle)
  const muzzleY = unitCenterY + muzzleDistance * Math.sin(launchAngle)

  const dx = aimTarget.x - muzzleX
  const dy = aimTarget.y - muzzleY
  const distance = Math.hypot(dx, dy)
  const flightDuration = distance / HOWITZER_PROJECTILE_SPEED
  const arcHeight = distance * 0.5

  const projectile = {
    id: Date.now() + gameRandom(),
    x: muzzleX,
    y: muzzleY,
    speed: HOWITZER_PROJECTILE_SPEED,
    baseDamage: getHowitzerDamage(unit),
    active: true,
    shooter: unit,
    startTime: now,
    parabolic: true,
    startX: muzzleX,
    startY: muzzleY,
    targetX: aimTarget.x,
    targetY: aimTarget.y,
    dx,
    dy,
    distance,
    flightDuration,
    arcHeight,
    targetPosition: { x: aimTarget.x, y: aimTarget.y },
    explosionRadius: TILE_SIZE * HOWITZER_EXPLOSION_RADIUS_TILES,
    projectileType: 'artillery',
    launchAngle
  }

  bullets.push(projectile)

  // Deplete ammunition when firing
  if (typeof unit.ammunition === 'number' && typeof unit.ammoPerShot === 'number') {
    unit.ammunition = Math.max(0, unit.ammunition - unit.ammoPerShot)
  }

  playPositionalSound('shoot_heavy', muzzleX, muzzleY, 0.5)
  unit.lastShotTime = now
  unit.recoilStartTime = now
  unit.muzzleFlashStartTime = now
}
