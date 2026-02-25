import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { playPositionalSound } from '../sound.js'
import { findPath } from '../units.js'
import {
  ensureAirstripOperations,
  setAirstripSlotOccupant,
  clearAirstripSlotOccupant,
  enqueueAirstripRunwayOperation,
  tryClaimAirstripRunwayOperation,
  removeAirstripRunwayQueueEntry,
  releaseAirstripRunwayOperation
} from '../utils/airstripUtils.js'
import { getBuildingIdentifier } from '../utils.js'

const F22_GROUND_TAKEOFF_SPEED_MIN = 0.9
const F22_GROUND_TAKEOFF_SPEED_MAX = 1.7
const F22_LANDING_ROLL_SPEED_MIN = 0.45
const F22_ORBIT_RADIUS = TILE_SIZE * 5
const F22_ORBIT_RPS = 0.16
const F22_RTB_FUEL_RATIO = 0.2

function getUnitCenter(unit) {
  return {
    x: unit.x + TILE_SIZE / 2,
    y: unit.y + TILE_SIZE / 2
  }
}

function ensureRunwayData(unit) {
  if (unit.runwayPoints?.runwayStart && unit.runwayPoints?.runwayLiftOff && unit.runwayPoints?.runwayExit) {
    return
  }

  if (!unit.airstripId || !Array.isArray(gameState.buildings)) {
    return
  }

  const airstrip = gameState.buildings.find(building => getBuildingIdentifier(building) === unit.airstripId)
  if (!airstrip) return

  ensureAirstripOperations(airstrip)
  unit.runwayPoints = airstrip.runwayPoints
}

function getAirstripForUnit(unit) {
  if (!unit.airstripId || !Array.isArray(gameState.buildings)) return null
  return gameState.buildings.find(building => getBuildingIdentifier(building) === unit.airstripId)
}

function reachedWorldPoint(unit, worldPoint, radius = TILE_SIZE * 0.5) {
  if (!worldPoint) return false
  const center = getUnitCenter(unit)
  return Math.hypot(center.x - worldPoint.x, center.y - worldPoint.y) <= radius
}

function routeTaxiToPoint(unit, targetPoint) {
  if (!targetPoint || !Array.isArray(gameState.mapGrid)) return
  const startTile = {
    x: Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE),
    y: Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)
  }
  const destTile = { x: targetPoint.x, y: targetPoint.y }
  const path = findPath(startTile, destTile, gameState.mapGrid, gameState.occupancyMap, undefined, {
    strictDestination: true,
    unitOwner: unit.owner,
    streetOnly: true
  })
  unit.path = path && path.length > 1 ? path.slice(1) : []
  unit.moveTarget = destTile
}

function isRunwayStartClear(unit, runway) {
  if (!Array.isArray(gameState.units) || !runway?.runwayStart) {
    return true
  }

  const startX = runway.runwayStart.worldX
  const startY = runway.runwayStart.worldY
  const clearanceRadius = TILE_SIZE * 0.8

  for (const otherUnit of gameState.units) {
    if (!otherUnit || otherUnit.id === unit.id || otherUnit.health <= 0) continue
    if (otherUnit.type !== 'f22Raptor') continue
    if (otherUnit.flightState !== 'grounded') continue
    const centerX = otherUnit.x + TILE_SIZE / 2
    const centerY = otherUnit.y + TILE_SIZE / 2
    if (Math.hypot(centerX - startX, centerY - startY) <= clearanceRadius) {
      return false
    }
  }

  return true
}

function shouldReturnToAirstrip(unit) {
  if (typeof unit.gas !== 'number' || typeof unit.maxGas !== 'number' || unit.maxGas <= 0) {
    return false
  }
  return unit.gas <= unit.maxGas * F22_RTB_FUEL_RATIO
}

function easeInQuad(t) {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped * clamped
}

function easeInSine(t) {
  const clamped = Math.max(0, Math.min(1, t))
  return 1 - Math.cos((clamped * Math.PI) / 2)
}

function easeOutSine(t) {
  const clamped = Math.max(0, Math.min(1, t))
  return Math.sin((clamped * Math.PI) / 2)
}

function resolveFollowTargetDestination(unit) {
  const assigned = unit.f22AssignedDestination
  if (!assigned?.followTargetId || !Array.isArray(gameState.units)) {
    return assigned
  }

  const followTarget = gameState.units.find(candidate => candidate && candidate.id === assigned.followTargetId && candidate.health > 0)
  if (!followTarget) {
    return assigned
  }

  const centerX = followTarget.x + TILE_SIZE / 2
  let centerY = followTarget.y + TILE_SIZE / 2
  if ((followTarget.type === 'apache' || followTarget.type === 'f22Raptor') && followTarget.altitude) {
    centerY -= followTarget.altitude * 0.4
  }

  return {
    ...assigned,
    x: centerX,
    y: centerY
  }
}

function getTargetCenterFromUnitTarget(target) {
  if (!target || target.health <= 0) return null

  if (target.tileX !== undefined) {
    const centerX = target.x + TILE_SIZE / 2
    let centerY = target.y + TILE_SIZE / 2
    if ((target.type === 'apache' || target.type === 'f22Raptor') && target.altitude) {
      centerY -= target.altitude * 0.4
    }
    return { x: centerX, y: centerY }
  }

  if (typeof target.width === 'number' && typeof target.height === 'number') {
    return {
      x: target.x * TILE_SIZE + (target.width * TILE_SIZE) / 2,
      y: target.y * TILE_SIZE + (target.height * TILE_SIZE) / 2
    }
  }

  return null
}

function updateOrbitFlightPlan(unit, now) {
  const center = resolveFollowTargetDestination(unit)
  if (!center) return

  unit.f22AssignedDestination = center

  const unitCenter = getUnitCenter(unit)
  const distanceToCenter = Math.hypot(unitCenter.x - center.x, unitCenter.y - center.y)
  if (distanceToCenter < F22_ORBIT_RADIUS * 0.55) {
    unit.f22OrbitRadiusBoostUntil = now + 1400
  }

  const orbitRadiusBase = center.mode === 'combat' ? F22_ORBIT_RADIUS * 1.2 : F22_ORBIT_RADIUS
  const boostedRadius = unit.f22OrbitRadiusBoostUntil && unit.f22OrbitRadiusBoostUntil > now
    ? F22_ORBIT_RADIUS * 1.45
    : orbitRadiusBase

  const dtMs = Math.max(16, now - (unit.lastF22Update || now))
  const dt = dtMs / 1000
  const prevAngle = Number.isFinite(unit.f22OrbitAngle) ? unit.f22OrbitAngle : 0
  const orbitRps = center.mode === 'combat' ? F22_ORBIT_RPS * 1.2 : F22_ORBIT_RPS
  const nextAngle = prevAngle + (Math.PI * 2 * orbitRps * dt)
  unit.f22OrbitAngle = nextAngle

  const waveAmount = center.mode === 'combat' ? TILE_SIZE * 2.2 : TILE_SIZE * 0.7
  const radiusWave = Math.sin(nextAngle * 2.4) * waveAmount
  const dynamicRadius = Math.max(TILE_SIZE * 2.5, boostedRadius + radiusWave)

  unit.flightPlan = {
    x: center.x + Math.cos(nextAngle) * dynamicRadius,
    y: center.y + Math.sin(nextAngle) * dynamicRadius,
    stopRadius: TILE_SIZE * 0.2,
    mode: 'orbit',
    destinationTile: center.destinationTile || null,
    followTargetId: center.followTargetId || null
  }
}

export function updateF22FlightState(unit, movement, now) {
  ensureRunwayData(unit)
  const finishTick = () => {
    unit.lastF22Update = now
  }

  if (!unit.f22State) {
    unit.f22State = unit.flightState === 'grounded' ? 'parked' : 'airborne'
  }

  if (!unit.f22AssignedDestination && unit.target?.health > 0) {
    const targetCenter = getTargetCenterFromUnitTarget(unit.target)
    if (targetCenter) {
      unit.f22AssignedDestination = {
        x: targetCenter.x,
        y: targetCenter.y,
        stopRadius: TILE_SIZE * 0.25,
        mode: 'combat',
        destinationTile: null,
        followTargetId: unit.target.id || null
      }
      const unitCenterX = unit.x + TILE_SIZE / 2
      const unitCenterY = unit.y + TILE_SIZE / 2
      unit.f22OrbitAngle = Math.atan2(unitCenterY - targetCenter.y, unitCenterX - targetCenter.x)
    }
  }

  const runway = unit.runwayPoints
  if (!runway) {
    finishTick()
    return
  }

  const airstrip = getAirstripForUnit(unit)
  if (airstrip) {
    ensureAirstripOperations(airstrip)
  }

  if (unit.helipadLandingRequested && unit.f22State === 'airborne') {
    unit.f22State = 'wait_landing_clearance'
  }

  if (unit.f22State === 'parked' && unit.f22PendingTakeoff) {
    if (airstrip) {
      enqueueAirstripRunwayOperation(airstrip, unit.id, 'takeoff')
    }
    unit.f22State = 'wait_takeoff_clearance'
  }

  if (unit.f22State === 'wait_takeoff_clearance') {
    unit.flightState = 'grounded'
    unit.altitude = 0
    unit.shadow = { offset: 0, scale: 1 }
    movement.targetVelocity.x = 0
    movement.targetVelocity.y = 0
    movement.isMoving = false

    const runwayGranted = airstrip ? tryClaimAirstripRunwayOperation(airstrip, unit.id, 'takeoff') : true
    if (!runwayGranted) {
      finishTick()
      return
    }

    if (!isRunwayStartClear(unit, runway)) {
      finishTick()
      return
    }

    if (airstrip) {
      clearAirstripSlotOccupant(airstrip, unit.id)
      if (airstrip.landedUnitId === unit.id) {
        airstrip.landedUnitId = null
      }
    }
    unit.f22State = 'taxi_to_runway_start'
    routeTaxiToPoint(unit, runway.runwayStart)
  }

  if (unit.f22State === 'taxi_to_runway_start') {
    unit.flightState = 'grounded'
    unit.altitude = 0
    unit.shadow = { offset: 0, scale: 1 }
    unit.speedModifier = 1

    const reachedRunwayStart = reachedWorldPoint(unit, { x: runway.runwayStart.worldX, y: runway.runwayStart.worldY }, TILE_SIZE * 0.6)
    if ((!unit.path || unit.path.length === 0) && !reachedRunwayStart) {
      const shouldRetryRoute = !unit.lastF22TaxiRouteAttemptAt || now - unit.lastF22TaxiRouteAttemptAt > 400
      if (shouldRetryRoute) {
        routeTaxiToPoint(unit, runway.runwayStart)
        unit.lastF22TaxiRouteAttemptAt = now
      }
    }

    if ((!unit.path || unit.path.length === 0) && reachedRunwayStart) {
      unit.f22State = 'takeoff_roll'
      unit.manualFlightState = 'takeoff'
      unit.path = []
      unit.moveTarget = null
      unit.direction = 0
      unit.rotation = 0
    }
    finishTick()
    return
  }

  if (unit.f22State === 'takeoff_roll') {
    unit.flightState = 'grounded'
    unit.altitude = 0
    unit.shadow = { offset: 0, scale: 1 }
    unit.direction = 0
    unit.rotation = 0
    movement.isMoving = true
    movement.targetRotation = 0
    const centerX = getUnitCenter(unit).x
    const takeoffStartX = runway.runwayStart.worldX
    const takeoffLiftX = Math.max(takeoffStartX + 1, runway.runwayLiftOff.worldX)
    const rollProgress = Math.max(0, Math.min(1, (centerX - takeoffStartX) / (takeoffLiftX - takeoffStartX)))
    const easedThrottle = easeInQuad(rollProgress)
    movement.targetVelocity.x = F22_GROUND_TAKEOFF_SPEED_MIN + (F22_GROUND_TAKEOFF_SPEED_MAX - F22_GROUND_TAKEOFF_SPEED_MIN) * easedThrottle
    movement.targetVelocity.y = 0

    if (centerX >= runway.runwayLiftOff.worldX) {
      unit.f22State = 'liftoff'
      unit.f22PendingTakeoff = false
    }
    finishTick()
    return
  }

  if (unit.f22State === 'liftoff') {
    unit.flightState = 'takeoff'
    if (!unit.f22TakeoffSoundPlayed) {
      playPositionalSound('f22Takeoff', unit.x, unit.y, 0.55)
      unit.f22TakeoffSoundPlayed = true
    }

    unit.direction = 0
    unit.rotation = 0
    movement.isMoving = true
    movement.targetRotation = 0
    const liftOffStartX = runway.runwayLiftOff.worldX
    const liftOffEndX = Math.max(liftOffStartX + 1, runway.runwayExit.worldX)
    const centerX = getUnitCenter(unit).x
    const climbProgress = Math.max(0, Math.min(1, (centerX - liftOffStartX) / (liftOffEndX - liftOffStartX)))
    movement.targetVelocity.x = unit.airCruiseSpeed * (0.65 + 0.35 * easeOutSine(climbProgress))
    movement.targetVelocity.y = 0

    unit.altitude = unit.maxAltitude * easeInSine(climbProgress)
    const altitudeRatio = Math.min(1, unit.altitude / unit.maxAltitude)
    unit.shadow = {
      offset: altitudeRatio * TILE_SIZE * 1.8,
      scale: 1 + altitudeRatio * 0.5
    }

    if (getUnitCenter(unit).x >= runway.runwayExit.worldX) {
      unit.f22State = 'airborne'
      unit.flightState = 'airborne'
      unit.f22TakeoffSoundPlayed = false
      movement.isMoving = true
      if (airstrip) {
        releaseAirstripRunwayOperation(airstrip, unit.id)
      }
      if (unit.f22AssignedDestination) {
        unit.flightPlan = {
          x: unit.f22AssignedDestination.x,
          y: unit.f22AssignedDestination.y,
          stopRadius: unit.f22AssignedDestination.stopRadius,
          mode: unit.f22AssignedDestination.mode || 'manual',
          destinationTile: unit.f22AssignedDestination.destinationTile || null,
          followTargetId: unit.f22AssignedDestination.followTargetId || null
        }
      }
    }
    finishTick()
    return
  }

  if (unit.f22State === 'wait_landing_clearance' || unit.f22State === 'approach_runway') {
    unit.flightState = 'airborne'
    if (airstrip) {
      enqueueAirstripRunwayOperation(airstrip, unit.id, 'landing')
    }

    const runwayGranted = airstrip ? tryClaimAirstripRunwayOperation(airstrip, unit.id, 'landing') : true
    if (!runwayGranted) {
      unit.f22State = 'wait_landing_clearance'
      const holdingAngle = Number.isFinite(unit.f22OrbitAngle) ? unit.f22OrbitAngle : 0
      unit.f22OrbitAngle = holdingAngle + (Math.PI * 2 * 0.08 * Math.max(0.016, (now - (unit.lastF22Update || now)) / 1000))
      const holdRadius = TILE_SIZE * 3.5
      unit.flightPlan = {
        x: runway.runwayExit.worldX + Math.cos(unit.f22OrbitAngle) * holdRadius,
        y: runway.runwayExit.worldY + Math.sin(unit.f22OrbitAngle) * holdRadius,
        stopRadius: TILE_SIZE * 0.25,
        mode: 'airstrip'
      }
      finishTick()
      return
    }

    unit.f22State = 'approach_runway'
    unit.flightPlan = {
      x: runway.runwayExit.worldX,
      y: runway.runwayExit.worldY,
      stopRadius: TILE_SIZE * 0.35,
      mode: 'airstrip'
    }

    if (reachedWorldPoint(unit, { x: runway.runwayExit.worldX, y: runway.runwayExit.worldY }, TILE_SIZE * 0.5)) {
      unit.f22State = 'landing_roll'
      unit.flightPlan = null
      playPositionalSound('f22Landing', unit.x, unit.y, 0.55)
    }
    finishTick()
    return
  }

  if (unit.f22State === 'landing_roll') {
    unit.flightState = 'landing'
    unit.direction = Math.PI
    unit.rotation = Math.PI
    movement.isMoving = true
    movement.targetRotation = Math.PI
    const centerX = getUnitCenter(unit).x
    const rollStartX = Math.max(runway.runwayLiftOff.worldX + 1, runway.runwayExit.worldX)
    const rollEndX = runway.runwayStart.worldX
    const rollSpan = Math.max(1, rollStartX - rollEndX)
    const landingProgress = Math.max(0, Math.min(1, (rollStartX - centerX) / rollSpan))
    const speedMax = Math.max(F22_GROUND_TAKEOFF_SPEED_MAX * 0.9, unit.airCruiseSpeed * 0.7)
    const easedSpeed = speedMax - (speedMax - F22_LANDING_ROLL_SPEED_MIN) * easeInQuad(landingProgress)
    movement.targetVelocity.x = -easedSpeed
    movement.targetVelocity.y = 0

    const touchDownX = runway.runwayLiftOff.worldX
    const approachStartX = Math.max(touchDownX + 1, runway.runwayExit.worldX)
    const descendProgress = Math.max(0, Math.min(1, (centerX - touchDownX) / (approachStartX - touchDownX)))
    unit.altitude = unit.maxAltitude * easeOutSine(descendProgress)
    const altitudeRatio = Math.min(1, unit.altitude / unit.maxAltitude)
    unit.shadow = {
      offset: altitudeRatio * TILE_SIZE * 1.8,
      scale: 1 + altitudeRatio * 0.5
    }

    if (centerX <= runway.runwayLiftOff.worldX) {
      unit.altitude = 0
      unit.flightState = 'grounded'
    }

    if (centerX <= runway.runwayStart.worldX && unit.altitude <= 1) {
      unit.altitude = 0
      unit.flightState = 'grounded'
      unit.f22State = 'taxi_to_parking'
      const airstrip = getAirstripForUnit(unit)
      if (airstrip && Number.isInteger(unit.airstripParkingSlotIndex)) {
        ensureAirstripOperations(airstrip)
        releaseAirstripRunwayOperation(airstrip, unit.id)
        const parking = airstrip.f22ParkingSpots?.[unit.airstripParkingSlotIndex]
        if (parking) {
          routeTaxiToPoint(unit, parking)
        }
      }
    }
    finishTick()
    return
  }

  if (unit.f22State === 'taxi_to_parking') {
    unit.flightState = 'grounded'
    unit.altitude = 0
    unit.shadow = { offset: 0, scale: 1 }
    if (!unit.path || unit.path.length === 0) {
      const airstrip = getAirstripForUnit(unit)
      if (airstrip && Number.isInteger(unit.airstripParkingSlotIndex)) {
        const parking = airstrip.f22ParkingSpots?.[unit.airstripParkingSlotIndex]
        if (parking && !reachedWorldPoint(unit, { x: parking.worldX, y: parking.worldY }, TILE_SIZE * 0.5)) {
          const shouldRetryRoute = !unit.lastF22TaxiRouteAttemptAt || now - unit.lastF22TaxiRouteAttemptAt > 400
          if (shouldRetryRoute) {
            routeTaxiToPoint(unit, parking)
            unit.lastF22TaxiRouteAttemptAt = now
          }
          finishTick()
          return
        }
        if (parking && reachedWorldPoint(unit, { x: parking.worldX, y: parking.worldY }, TILE_SIZE * 0.5)) {
          unit.f22State = 'parked'
          unit.helipadLandingRequested = false
          unit.f22PendingTakeoff = false
          unit.flightPlan = null
          unit.landedHelipadId = getBuildingIdentifier(airstrip)
          setAirstripSlotOccupant(airstrip, unit.airstripParkingSlotIndex, unit.id)
          airstrip.landedUnitId = unit.id
        }
      }
    }
    finishTick()
    return
  }

  if (unit.f22State === 'airborne') {
    unit.flightState = 'airborne'
    if (!unit.helipadLandingRequested && shouldReturnToAirstrip(unit)) {
      unit.helipadLandingRequested = true
      unit.f22State = 'approach_runway'
      unit.flightPlan = null
      if (airstrip) {
        enqueueAirstripRunwayOperation(airstrip, unit.id, 'landing')
      }
      unit.f22State = 'wait_landing_clearance'
      finishTick()
      return
    }

    if (!unit.flightPlan && unit.f22AssignedDestination) {
      unit.flightPlan = {
        x: unit.f22AssignedDestination.x,
        y: unit.f22AssignedDestination.y,
        stopRadius: unit.f22AssignedDestination.stopRadius,
        mode: unit.f22AssignedDestination.mode || 'manual',
        destinationTile: unit.f22AssignedDestination.destinationTile || null,
        followTargetId: unit.f22AssignedDestination.followTargetId || null
      }
    }

    if (!unit.helipadLandingRequested && unit.f22AssignedDestination) {
      updateOrbitFlightPlan(unit, now)
    }

    const altitudeRatio = Math.min(1, Math.max(0.1, unit.altitude / unit.maxAltitude))
    unit.altitude = Math.max(unit.maxAltitude * 0.8, unit.altitude)
    unit.shadow = {
      offset: altitudeRatio * TILE_SIZE * 1.8,
      scale: 1 + altitudeRatio * 0.5
    }

    if (!unit.lastF22FlightSoundAt || now - unit.lastF22FlightSoundAt > 4500) {
      playPositionalSound('f22Flight', unit.x, unit.y, 0.25)
      unit.lastF22FlightSoundAt = now
    }
    finishTick()
    return
  }

  if (unit.f22State === 'parked') {
    unit.flightState = 'grounded'
    unit.altitude = 0
    unit.shadow = { offset: 0, scale: 1 }
    unit.f22TakeoffSoundPlayed = false
    movement.targetVelocity.x = 0
    movement.targetVelocity.y = 0
    movement.isMoving = false
    if (airstrip) {
      removeAirstripRunwayQueueEntry(airstrip, unit.id)
    }
  }
  finishTick()
}
