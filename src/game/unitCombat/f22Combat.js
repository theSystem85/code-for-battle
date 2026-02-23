import { TILE_SIZE } from '../../config.js'
import { smoothRotateTowardsAngle } from '../../logic.js'
import { gameState } from '../../gameState.js'
import { getBuildingIdentifier } from '../../utils.js'
import { getHelipadLandingCenter, getHelipadLandingTile, isHelipadAvailableForUnit } from '../../utils/helipadUtils.js'
import { showNotification } from '../../ui/notifications.js'
import { getEffectiveFireRange, getEffectiveFireRate, isHumanControlledParty } from './combatHelpers.js'
import { handleTankFiring } from './firingHandlers.js'

const F22_FIRE_RATE = 4000
const F22_RANGE_MULTIPLIER = 1.8

function getF22TargetCenter(target) {
  if (!target) return null
  if (target.tileX !== undefined) {
    return { x: target.x + TILE_SIZE / 2, y: target.y + TILE_SIZE / 2 }
  }
  return {
    x: (target.x + (target.width || 1) / 2) * TILE_SIZE,
    y: (target.y + (target.height || 1) / 2) * TILE_SIZE
  }
}

function findNearestHelipadForF22(unit, units) {
  if (!unit || !Array.isArray(gameState.buildings) || gameState.buildings.length === 0) return null

  const candidates = gameState.buildings.filter(b => {
    if (!b || b.type !== 'helipad' || b.health <= 0) return false
    if (b.owner && unit.owner && b.owner !== unit.owner) return false
    return true
  })

  if (candidates.length === 0) return null

  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2
  let best = null

  candidates.forEach(helipad => {
    const center = getHelipadLandingCenter(helipad)
    const tile = getHelipadLandingTile(helipad)
    if (!center || !tile) return

    const helipadId = getBuildingIdentifier(helipad)
    if (!isHelipadAvailableForUnit(helipad, units, unit.id)) return
    if (helipad.landedUnitId && helipad.landedUnitId !== unit.id) {
      const occupant = Array.isArray(units) ? units.find(u => u && u.id === helipad.landedUnitId) : null
      const occupantGrounded = occupant && occupant.isAirUnit && occupant.health > 0 && occupant.flightState === 'grounded'
      if (occupantGrounded) return
    }

    const distance = Math.hypot(center.x - unitCenterX, center.y - unitCenterY)
    if (!best || distance < best.distance) {
      best = { helipad, center, tile, helipadId, distance }
    }
  })

  return best
}

function initiateF22HelipadReturn(unit, helipadInfo) {
  if (!unit || !helipadInfo) return false

  const { center, tile, helipadId } = helipadInfo

  unit.helipadLandingRequested = true
  unit.helipadTargetId = helipadId
  unit.autoHoldAltitude = true
  unit.flightPlan = {
    x: center.x,
    y: center.y,
    stopRadius: Math.max(6, TILE_SIZE * 0.5),
    mode: 'helipad',
    followTargetId: null,
    destinationTile: { ...tile }
  }
  unit.moveTarget = { ...tile }
  unit.hovering = false
  unit.autoHelipadReturnActive = true
  unit.autoHelipadReturnTargetId = unit.helipadTargetId

  return true
}

export function updateF22Combat(unit, units, bullets, mapGrid, now, _occupancyMap) {
  if (!unit.target || unit.target.health <= 0) {
    unit.target = null
    unit.flightPlan = unit.flightPlan && unit.flightPlan.mode === 'combat' ? null : unit.flightPlan
    return
  }

  const wasMissileEmpty = unit.missileAmmoEmpty === true
  const missileAmmo = Math.max(0, Math.floor(unit.missileAmmo || 0))
  const missileEmpty = missileAmmo <= 0
  unit.missileAmmoEmpty = missileEmpty

  if (missileEmpty) {
    unit.canFire = false

    if (unit.target && unit.target.id) {
      unit.autoHelipadReturnAttackTargetId = unit.target.id
      unit.autoHelipadReturnAttackTargetType = unit.target.tileX !== undefined ? 'unit' : 'building'
      unit.autoReturnToHelipadOnTargetLoss = true
    }

    const alreadyLanding = Boolean(
      unit.helipadLandingRequested ||
      (unit.flightPlan && unit.flightPlan.mode === 'helipad') ||
      unit.landedHelipadId
    )

    if (!alreadyLanding) {
      const retryAt = unit.autoHelipadRetryAt || 0
      const shouldAttempt = !wasMissileEmpty || !unit.autoHelipadReturnActive || now >= retryAt
      if (shouldAttempt) {
        const helipadInfo = findNearestHelipadForF22(unit, units)
        const assigned = helipadInfo ? initiateF22HelipadReturn(unit, helipadInfo) : false
        if (!assigned) {
          unit.autoHelipadReturnActive = false
          unit.autoHelipadRetryAt = now + 1200
          if (unit.owner === gameState.humanPlayer) {
            const lastNotice = unit.noHelipadNotificationTime || 0
            if (!wasMissileEmpty || now - lastNotice > 5000) {
              showNotification('No available helipad for F22 resupply!', 2000)
              unit.noHelipadNotificationTime = now
            }
          }
        } else {
          unit.autoHelipadRetryAt = now + 3000
        }
      }
    }
    return
  }

  if (unit.autoHelipadReturnActive && missileAmmo < unit.maxMissileAmmo) {
    unit.canFire = false
    return
  }
  if (unit.autoHelipadReturnActive) {
    unit.autoHelipadReturnActive = false
  }
  if (unit.autoHelipadRetryAt) {
    unit.autoHelipadRetryAt = 0
  }
  unit.canFire = true

  const targetCenter = getF22TargetCenter(unit.target)
  if (!targetCenter) return

  const unitCenterX = unit.x + TILE_SIZE / 2
  const unitCenterY = unit.y + TILE_SIZE / 2
  const dx = targetCenter.x - unitCenterX
  const dy = targetCenter.y - unitCenterY
  const distance = Math.hypot(dx, dy)

  const canAttack = isHumanControlledParty(unit.owner) || unit.allowedToAttack === true
  const effectiveRange = getEffectiveFireRange(unit) * F22_RANGE_MULTIPLIER
  const inRange = distance <= effectiveRange

  const desiredFacing = Math.atan2(dy, dx)
  const currentDirection = typeof unit.direction === 'number' ? unit.direction : 0
  const rotationSpeed = unit.rotationSpeed || 0.22
  const newDirection = smoothRotateTowardsAngle(currentDirection, desiredFacing, rotationSpeed)
  unit.direction = newDirection
  unit.rotation = newDirection
  if (unit.movement) {
    unit.movement.rotation = newDirection
  }

  if (!inRange && !unit.helipadLandingRequested) {
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
    const desiredDistance = Math.max(TILE_SIZE * 2, Math.min(effectiveRange * 0.9, offsetMag))
    let standOffX = targetCenter.x + normX * desiredDistance
    let standOffY = targetCenter.y + normY * desiredDistance

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

    const planStopRadius = Math.max(12, desiredDistance * 0.05)
    const existingPlan = unit.flightPlan && unit.flightPlan.mode === 'combat' ? unit.flightPlan : null

    if (!existingPlan || Math.hypot(unitCenterX - standOffX, unitCenterY - standOffY) > planStopRadius * 1.25) {
      unit.flightPlan = {
        x: standOffX,
        y: standOffY,
        stopRadius: planStopRadius,
        mode: 'combat',
        followTargetId: unit.target.id || null,
        destinationTile: standOffTile,
        desiredRange: desiredDistance
      }
    }
    unit.moveTarget = standOffTile
  } else if (inRange) {
    if (unit.flightPlan && unit.flightPlan.mode === 'combat') {
      unit.flightPlan = null
    }
    unit.moveTarget = null
  }

  const helipadLandingInProgress = Boolean(
    unit.helipadLandingRequested ||
    (unit.flightPlan && unit.flightPlan.mode === 'helipad') ||
    unit.landedHelipadId
  )
  unit.autoHoldAltitude = !helipadLandingInProgress
  if (!helipadLandingInProgress && unit.flightState === 'grounded') {
    unit.manualFlightState = 'takeoff'
  }

  if (inRange && canAttack && unit.canFire !== false) {
    const effectiveFireRate = getEffectiveFireRate(unit, F22_FIRE_RATE)
    if (!unit.lastShotTime || now - unit.lastShotTime >= effectiveFireRate) {
      unit.customRocketSpawn = {
        x: unitCenterX,
        y: unitCenterY - TILE_SIZE * 0.15
      }
      handleTankFiring(
        unit, unit.target, bullets, now, 0,
        targetCenter.x, targetCenter.y,
        'rocket', units, mapGrid, false, null
      )
    }
  }
}
