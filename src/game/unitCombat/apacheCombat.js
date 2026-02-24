import { TILE_SIZE } from '../../config.js'
import { smoothRotateTowardsAngle } from '../../logic.js'
import { gameState } from '../../gameState.js'
import { getBuildingIdentifier } from '../../utils.js'
import { getHelipadLandingCenter, getHelipadLandingTile, isHelipadAvailableForUnit } from '../../utils/helipadUtils.js'
import { showNotification } from '../../ui/notifications.js'
import { COMBAT_CONFIG } from './combatConfig.js'
import { getEffectiveFireRange, getEffectiveFireRate, isHumanControlledParty } from './combatHelpers.js'
import { handleApacheVolley } from './firingHandlers.js'

function getApacheTargetCenter(target) {
  if (!target) {
    return null
  }

  if (target.tileX !== undefined) {
    return {
      x: target.x + TILE_SIZE / 2,
      y: target.y + TILE_SIZE / 2
    }
  }

  return {
    x: (target.x + (target.width || 1) / 2) * TILE_SIZE,
    y: (target.y + (target.height || 1) / 2) * TILE_SIZE
  }
}

function resolveStoredApacheTarget(unit, units) {
  if (!unit || !unit.autoHelipadReturnAttackTargetId) {
    return null
  }

  const targetId = unit.autoHelipadReturnAttackTargetId
  const targetType = unit.autoHelipadReturnAttackTargetType

  if (targetType === 'building') {
    return Array.isArray(gameState.buildings)
      ? gameState.buildings.find(building => building && building.id === targetId && building.health > 0)
      : null
  }

  return Array.isArray(units)
    ? units.find(candidate => candidate && candidate.id === targetId && candidate.health > 0)
    : null
}

function clearApacheReturnAttackState(unit) {
  if (!unit) {
    return
  }
  unit.autoHelipadReturnAttackTargetId = null
  unit.autoHelipadReturnAttackTargetType = null
  unit.autoReturnToHelipadOnTargetLoss = false
}

function findNearestHelipadForApache(unit, units) {
  if (!unit || !Array.isArray(gameState.buildings) || gameState.buildings.length === 0) {
    return null
  }

  // F22 Raptors use airstrips; Apaches use helipads
  const padType = unit.type === 'f22Raptor' ? 'airstrip' : 'helipad'

  const candidates = gameState.buildings.filter(building => {
    if (!building || building.type !== padType || building.health <= 0) {
      return false
    }
    if (building.owner && unit.owner && building.owner !== unit.owner) {
      return false
    }
    return true
  })

  if (candidates.length === 0) {
    return null
  }

  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2

  let best = null

  candidates.forEach(helipad => {
    const center = getHelipadLandingCenter(helipad)
    const tile = getHelipadLandingTile(helipad)
    if (!center || !tile) {
      return
    }

    const helipadId = getBuildingIdentifier(helipad)
    if (!isHelipadAvailableForUnit(helipad, units, unit.id)) {
      return
    }
    if (helipad.landedUnitId && helipad.landedUnitId !== unit.id) {
      const occupant = Array.isArray(units) ? units.find(u => u && u.id === helipad.landedUnitId) : null
      const occupantGrounded = occupant && (occupant.type === 'apache' || occupant.type === 'f22Raptor') && occupant.health > 0 && occupant.flightState === 'grounded'
      if (occupantGrounded) {
        return
      }
    }

    const distance = Math.hypot(center.x - unitCenterX, center.y - unitCenterY)
    if (!best || distance < best.distance) {
      best = { helipad, center, tile, distance, helipadId }
    }
  })

  return best
}

function getHelipadById(helipadId) {
  if (!helipadId || !Array.isArray(gameState.buildings)) {
    return null
  }

  return gameState.buildings.find(building => {
    if (!building || (building.type !== 'helipad' && building.type !== 'airstrip') || building.health <= 0) {
      return false
    }
    return getBuildingIdentifier(building) === helipadId
  }) || null
}

function initiateApacheHelipadReturn(unit, helipadInfo) {
  if (!unit || !helipadInfo || !helipadInfo.center || !helipadInfo.tile) {
    return false
  }

  const { helipad, center, tile, helipadId } = helipadInfo
  const stopRadius = Math.max(6, TILE_SIZE * 0.2)

  unit.path = []
  unit.originalPath = null
  unit.moveTarget = { x: tile.x, y: tile.y }
  unit.flightPlan = {
    x: center.x,
    y: center.y,
    stopRadius,
    mode: 'helipad',
    followTargetId: null,
    destinationTile: { ...tile }
  }
  unit.autoHoldAltitude = true

  if (unit.landedHelipadId) {
    const previousHelipad = Array.isArray(gameState.buildings)
      ? gameState.buildings.find(b => getBuildingIdentifier(b) === unit.landedHelipadId)
      : null
    if (previousHelipad && previousHelipad.landedUnitId === unit.id) {
      previousHelipad.landedUnitId = null
    }
    unit.landedHelipadId = null
  }

  unit.helipadLandingRequested = true
  unit.helipadTargetId = helipadId || getBuildingIdentifier(helipad)
  if (unit.flightState === 'grounded') {
    unit.manualFlightState = 'takeoff'
  }
  unit.manualFlightHoverRequested = false
  unit.remoteControlActive = false
  unit.hovering = false
  unit.autoHelipadReturnActive = true
  unit.autoHelipadReturnTargetId = unit.helipadTargetId

  return true
}

export function updateApacheCombat(unit, units, bullets, mapGrid, now, _occupancyMap) {
  if ((!unit.target || unit.target.health <= 0) && unit.autoHelipadReturnAttackTargetId) {
    unit.target = resolveStoredApacheTarget(unit, units)
  }

  if (!unit.target || unit.target.health <= 0) {
    const shouldReturnToHelipad = unit.autoReturnToHelipadOnTargetLoss === true
    if (shouldReturnToHelipad) {
      const alreadyLanding = Boolean(unit.helipadLandingRequested || (unit.flightPlan && unit.flightPlan.mode === 'helipad') || unit.landedHelipadId)
      if (!alreadyLanding) {
        const helipadInfo = findNearestHelipadForApache(unit, units)
        if (helipadInfo) {
          initiateApacheHelipadReturn(unit, helipadInfo)
        }
      }
    }

    clearApacheReturnAttackState(unit)
    unit.volleyState = null
    unit.flightPlan = unit.flightPlan && unit.flightPlan.mode === 'combat' ? null : unit.flightPlan
    return
  }

  if (unit.remoteControlActive) {
    const lastRemoteControlTime = unit.lastRemoteControlTime || 0
    const remoteControlRecentlyActive = lastRemoteControlTime > 0 && now - lastRemoteControlTime < 350
    if (remoteControlRecentlyActive) {
      return
    }
    unit.remoteControlActive = false
  }

  const wasAmmoEmpty = unit.apacheAmmoEmpty === true
  const ammoRemaining = Math.max(0, Math.floor(unit.rocketAmmo || 0))
  const ammoEmpty = ammoRemaining <= 0
  unit.apacheAmmoEmpty = ammoEmpty

  if (ammoEmpty) {
    unit.canFire = false
    unit.volleyState = null

    if (unit.target && unit.target.id) {
      unit.autoHelipadReturnAttackTargetId = unit.target.id
      unit.autoHelipadReturnAttackTargetType = unit.target.tileX !== undefined ? 'unit' : 'building'
      unit.autoReturnToHelipadOnTargetLoss = true
    }

    let alreadyLanding = Boolean(unit.helipadLandingRequested || (unit.flightPlan && unit.flightPlan.mode === 'helipad') || unit.landedHelipadId)

    if (alreadyLanding && unit.helipadTargetId && unit.landedHelipadId !== unit.helipadTargetId) {
      const assignedHelipad = getHelipadById(unit.helipadTargetId)
      const assignedStillAvailable = assignedHelipad && isHelipadAvailableForUnit(assignedHelipad, units, unit.id)

      if (!assignedStillAvailable) {
        unit.helipadLandingRequested = false
        unit.helipadTargetId = null
        if (unit.flightPlan?.mode === 'helipad') {
          unit.flightPlan = null
        }
        alreadyLanding = false
      }
    }

    if (!alreadyLanding) {
      const retryAt = unit.autoHelipadRetryAt || 0
      const shouldAttempt = !wasAmmoEmpty || !unit.autoHelipadReturnActive || now >= retryAt
      if (shouldAttempt) {
        const helipadInfo = findNearestHelipadForApache(unit, units)
        const assigned = helipadInfo ? initiateApacheHelipadReturn(unit, helipadInfo) : false
        if (!assigned) {
          unit.autoHelipadReturnActive = false
          unit.autoHelipadRetryAt = now + 1200
          if (unit.owner === gameState.humanPlayer) {
            const lastNotice = unit.noHelipadNotificationTime || 0
            if (!wasAmmoEmpty || now - lastNotice > 5000) {
              showNotification('No available helipad for Apache resupply!', 2000)
              unit.noHelipadNotificationTime = now
            }
          }
        } else {
          unit.autoHelipadRetryAt = now + 3000
        }
      }
    }
  } else {
    if (unit.autoHelipadReturnActive && typeof unit.maxRocketAmmo === 'number' && unit.rocketAmmo < unit.maxRocketAmmo) {
      unit.canFire = false
      return
    }
    if (unit.autoHelipadReturnActive) {
      unit.autoHelipadReturnActive = false
    }
    if (unit.autoHelipadReturnTargetId) {
      unit.autoHelipadReturnTargetId = null
    }
    if (unit.autoHelipadRetryAt) {
      unit.autoHelipadRetryAt = 0
    }
    // Set canFire to true when ammo is available
    unit.canFire = true
  }

  const targetCenter = getApacheTargetCenter(unit.target)
  if (!targetCenter) {
    unit.volleyState = null
    return
  }

  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2
  const dx = targetCenter.x - unitCenterX
  const dy = targetCenter.y - unitCenterY
  const distance = Math.hypot(dx, dy)

  const canAttack = isHumanControlledParty(unit.owner) || unit.allowedToAttack === true
  const effectiveRange = getEffectiveFireRange(unit) * COMBAT_CONFIG.RANGE_MULTIPLIER.ROCKET
  const inRange = distance <= effectiveRange
  const directOverlapThreshold = TILE_SIZE * 0.45
  const targetDirectlyBelow = distance < directOverlapThreshold

  let existingPlan = unit.flightPlan && unit.flightPlan.mode === 'combat' ? unit.flightPlan : null
  const followTargetId = unit.target.id || null

  const desiredFacing = Math.atan2(dy, dx)
  const currentDirection = typeof unit.direction === 'number' ? unit.direction : 0
  const rotationSpeed = unit.rotationSpeed || 0.18
  const newDirection = smoothRotateTowardsAngle(currentDirection, desiredFacing, rotationSpeed)
  unit.direction = newDirection
  unit.rotation = newDirection
  if (unit.movement) {
    unit.movement.rotation = newDirection
    if (!existingPlan) {
      unit.movement.targetRotation = newDirection
    }
  }

  if (inRange && !targetDirectlyBelow) {
    if (existingPlan) {
      unit.flightPlan = null
      existingPlan = null
    }
    unit.moveTarget = null
  } else if (!unit.helipadLandingRequested) {
    let standOffX = targetCenter.x
    let standOffY = targetCenter.y
    let desiredDistance = distance

    if (targetDirectlyBelow) {
      desiredDistance = Math.max(TILE_SIZE * 1.2, effectiveRange * 0.25)
      const baseAngle = (typeof unit.direction === 'number' ? unit.direction : desiredFacing) + Math.PI / 2
      standOffX = targetCenter.x + Math.cos(baseAngle) * desiredDistance
      standOffY = targetCenter.y + Math.sin(baseAngle) * desiredDistance
    } else {
      let offsetX = unitCenterX - targetCenter.x
      let offsetY = unitCenterY - targetCenter.y
      let offsetMag = Math.hypot(offsetX, offsetY)
      if (offsetMag < 1) {
        offsetX = Math.cos(newDirection)
        offsetY = Math.sin(newDirection)
        offsetMag = 1
      }
      const normX = offsetX / offsetMag
      const normY = offsetY / offsetMag
      desiredDistance = Math.max(TILE_SIZE, Math.min(effectiveRange, offsetMag))
      standOffX = targetCenter.x + normX * desiredDistance
      standOffY = targetCenter.y + normY * desiredDistance
    }

    if (Array.isArray(mapGrid) && mapGrid.length > 0 && Array.isArray(mapGrid[0])) {
      const maxX = mapGrid[0].length * TILE_SIZE - TILE_SIZE / 2
      const maxY = mapGrid.length * TILE_SIZE - TILE_SIZE / 2
      standOffX = Math.max(TILE_SIZE / 2, Math.min(standOffX, maxX))
      standOffY = Math.max(TILE_SIZE / 2, Math.min(standOffY, maxY))
    }

    const standOffTile = {
      x: Math.max(0, Math.floor(standOffX / TILE_SIZE)),
      y: Math.max(0, Math.floor(standOffY / TILE_SIZE))
    }

    const planStopRadius = targetDirectlyBelow
      ? Math.max(12, desiredDistance * 0.3)
      : Math.max(12, desiredDistance * 0.05)
    const distanceToStandOff = Math.hypot(unitCenterX - standOffX, unitCenterY - standOffY)
    const needsPlanUpdate =
      !existingPlan ||
      existingPlan.followTargetId !== followTargetId ||
      Math.abs((existingPlan.desiredRange || 0) - desiredDistance) > 1 ||
      Boolean(existingPlan?.strafe) !== targetDirectlyBelow

    if (needsPlanUpdate || distanceToStandOff > planStopRadius * 1.25) {
      unit.flightPlan = {
        x: standOffX,
        y: standOffY,
        stopRadius: planStopRadius,
        mode: 'combat',
        followTargetId,
        destinationTile: standOffTile,
        desiredRange: desiredDistance,
        strafe: targetDirectlyBelow
      }
      existingPlan = unit.flightPlan
    } else if (existingPlan) {
      existingPlan.x = standOffX
      existingPlan.y = standOffY
      existingPlan.stopRadius = planStopRadius
      existingPlan.destinationTile = standOffTile
      existingPlan.desiredRange = desiredDistance
      existingPlan.strafe = targetDirectlyBelow
    }

    unit.moveTarget = standOffTile
  }

  const helipadLandingInProgress = Boolean(unit.helipadLandingRequested || (unit.flightPlan && unit.flightPlan.mode === 'helipad') || unit.landedHelipadId)
  unit.autoHoldAltitude = !helipadLandingInProgress
  if (!helipadLandingInProgress && unit.flightState === 'grounded') {
    unit.manualFlightState = 'takeoff'
  }

  // Continue any ongoing volley regardless of current range
  if (unit.volleyState && !unit.apacheAmmoEmpty) {
    const volleyComplete = handleApacheVolley(unit, unit.target, bullets, now, targetCenter.x, targetCenter.y, units, mapGrid)
    if (volleyComplete) {
      unit.lastShotTime = now
    }
  }

  if (distance <= effectiveRange && canAttack) {
    if (!unit.volleyState && !unit.apacheAmmoEmpty) {
      const effectiveFireRate = getEffectiveFireRate(unit, COMBAT_CONFIG.APACHE.FIRE_RATE)
      if (!unit.lastShotTime || now - unit.lastShotTime >= effectiveFireRate) {
        if (unit.canFire !== false) {
          const rocketsThisVolley = Math.min(8, ammoRemaining)
          const leftCount = Math.min(4, Math.ceil(rocketsThisVolley / 2))
          const rightCount = Math.min(4, rocketsThisVolley - leftCount)

          unit.volleyState = {
            leftRemaining: leftCount,
            rightRemaining: rightCount,
            lastRocketTime: 0,
            delay: COMBAT_CONFIG.APACHE.VOLLEY_DELAY,
            nextSide: 'left',
            totalInVolley: rocketsThisVolley
          }
        }
      }
    }
  } else {
    // Only cancel volley if target is destroyed or we're switching targets
    // Don't cancel ongoing volleys just because Apache moved out of range
    if (!unit.target || unit.target.health <= 0) {
      unit.volleyState = null
    }
  }
}
