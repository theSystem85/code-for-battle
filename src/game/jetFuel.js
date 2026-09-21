import { TILE_SIZE, TILE_LENGTH_METERS } from '../config.js'
import { gameState } from '../gameState.js'
import { playPositionalSound } from '../sound.js'
import { showNotification } from '../ui/notifications.js'
import { getBuildingIdentifier } from '../utils.js'

export const JET_INSUFFICIENT_FUEL_MESSAGE = 'Insufficient fuel for a round trip.'
export const JET_EMERGENCY_LANDING_MESSAGE = 'Jet landed due to fuel.'
export const JET_NEEDS_STREET_TAKEOFF_MESSAGE = 'Jet must be towed onto a street before it can take off.'

export const JET_FUEL_SAFETY_MARGIN = 1.15
export const JET_FALLBACK_RTB_FUEL_RATIO = 0.2
export const JET_EMERGENCY_LANDING_DURATION_MS = 2500
export const JET_STREET_TAKEOFF_DURATION_MS = 1600

const STRIKE_JET_TYPES = new Set(['f22Raptor', 'f35'])
const LANDING_MISSION_MODES = new Set(['airstrip', 'helipad', 'groundLand'])

export function isStrikeJet(unit) {
  return Boolean(unit && STRIKE_JET_TYPES.has(unit.type))
}

export function isLandingMissionMode(mode) {
  return LANDING_MISSION_MODES.has(mode)
}

function getUnitCenter(unit) {
  if (!unit) return null
  return {
    x: (unit.x || 0) + TILE_SIZE / 2,
    y: (unit.y || 0) + TILE_SIZE / 2
  }
}

function getBuildingWorldCenter(building) {
  if (!building) return null
  return {
    x: (building.x + (building.width || 1) / 2) * TILE_SIZE,
    y: (building.y + (building.height || 1) / 2) * TILE_SIZE
  }
}

export function getJetCruiseFuelMultiplier(unit) {
  if (unit?.type === 'f22Raptor') return 3
  return 1
}

export function getJetTakeoffFuelReserve(unit) {
  if (!unit || unit.flightState !== 'grounded') return 0
  const consumption = unit.gasConsumption || 0
  const takeoffTiles = unit.type === 'f22Raptor' ? 8 : 3
  const takeoffMeters = takeoffTiles * TILE_LENGTH_METERS
  const takeoffMultiplier = unit.type === 'f22Raptor' ? 6 : 1
  return consumption * takeoffMeters / 100000 * takeoffMultiplier
}

export function estimateFuelForDistance(unit, distancePx) {
  if (!unit || !Number.isFinite(distancePx) || distancePx <= 0) return 0
  const distTiles = distancePx / TILE_SIZE
  const distMeters = distTiles * TILE_LENGTH_METERS
  return (unit.gasConsumption || 0) * distMeters / 100000 * getJetCruiseFuelMultiplier(unit)
}

export function estimateFuelBetweenPoints(unit, fromX, fromY, toX, toY) {
  if (!Number.isFinite(fromX) || !Number.isFinite(fromY) || !Number.isFinite(toX) || !Number.isFinite(toY)) {
    return 0
  }
  return estimateFuelForDistance(unit, Math.hypot(toX - fromX, toY - fromY))
}

function findBuildingById(buildingId) {
  if (!buildingId || !Array.isArray(gameState.buildings)) return null
  return gameState.buildings.find(building => building && getBuildingIdentifier(building) === buildingId) || null
}

function isUsableHomeBuilding(building, owner) {
  return Boolean(
    building &&
    building.health > 0 &&
    building.owner === owner &&
    (building.type === 'airstrip' || building.type === 'helipad' || building.type === 'aircraftCarrier')
  )
}

export function getJetHomeWorldPosition(unit) {
  if (!unit) return null

  if (unit.homeCarrierId && Array.isArray(gameState.units)) {
    const carrier = gameState.units.find(candidate => candidate && candidate.id === unit.homeCarrierId && candidate.health > 0)
    if (carrier) return getUnitCenter(carrier)
  }

  const boundIds = [unit.airstripId, unit.landedHelipadId, unit.helipadTargetId]
  for (const id of boundIds) {
    const building = findBuildingById(id)
    if (!isUsableHomeBuilding(building, unit.owner)) continue
    if (building.runwayPoints?.runwayExit) {
      return {
        x: building.runwayPoints.runwayExit.worldX ?? building.runwayPoints.runwayExit.x,
        y: building.runwayPoints.runwayExit.worldY ?? building.runwayPoints.runwayExit.y
      }
    }
    return getBuildingWorldCenter(building)
  }

  if (!Array.isArray(gameState.buildings)) return null
  const unitCenter = getUnitCenter(unit)
  if (!unitCenter) return null

  let nearest = null
  let nearestDist = Infinity
  for (const building of gameState.buildings) {
    if (!isUsableHomeBuilding(building, unit.owner)) continue
    if (unit.type === 'f22Raptor' && building.type === 'helipad') continue
    const center = getBuildingWorldCenter(building)
    if (!center) continue
    const dist = Math.hypot(center.x - unitCenter.x, center.y - unitCenter.y)
    if (dist < nearestDist) {
      nearest = center
      nearestDist = dist
    }
  }

  return nearest
}

export function estimateRoundTripFuel(unit, targetX, targetY) {
  const origin = getUnitCenter(unit) || { x: 0, y: 0 }
  const outbound = estimateFuelBetweenPoints(unit, origin.x, origin.y, targetX, targetY)
  const home = getJetHomeWorldPosition(unit) || origin
  const inbound = estimateFuelBetweenPoints(unit, targetX, targetY, home.x, home.y)
  return (outbound + inbound + getJetTakeoffFuelReserve(unit)) * JET_FUEL_SAFETY_MARGIN
}

export function canJetCompleteRoundTrip(unit, targetX, targetY) {
  if (!isStrikeJet(unit)) return true
  if (typeof unit.gas !== 'number' || typeof unit.maxGas !== 'number') return true
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return true
  return unit.gas >= estimateRoundTripFuel(unit, targetX, targetY)
}

export function rejectJetMissionIfImpossible(unit, destCenter, mode) {
  if (!isStrikeJet(unit) || !destCenter || isLandingMissionMode(mode)) {
    return false
  }
  if (unit.flightState === 'grounded' && !canJetTakeOffFromCurrentTile(unit)) {
    notifyHumanJet(unit, JET_NEEDS_STREET_TAKEOFF_MESSAGE)
    return true
  }
  if (!canJetCompleteRoundTrip(unit, destCenter.x, destCenter.y)) {
    notifyHumanJet(unit, JET_INSUFFICIENT_FUEL_MESSAGE)
    return true
  }
  return false
}

export function shouldJetReturnHomeForFuel(unit) {
  if (!isStrikeJet(unit)) return false
  if (unit.homeCarrierId) return false
  if (typeof unit.gas !== 'number' || typeof unit.maxGas !== 'number' || unit.maxGas <= 0) {
    return false
  }

  const origin = getUnitCenter(unit)
  const home = getJetHomeWorldPosition(unit)
  if (!origin || !home) {
    return unit.gas <= unit.maxGas * JET_FALLBACK_RTB_FUEL_RATIO
  }

  const fuelHome = estimateFuelBetweenPoints(unit, origin.x, origin.y, home.x, home.y) * JET_FUEL_SAFETY_MARGIN
  return unit.gas <= fuelHome
}

function getUnitTile(unit) {
  if (!unit) return null
  if (Number.isInteger(unit.tileX) && Number.isInteger(unit.tileY)) {
    return { x: unit.tileX, y: unit.tileY }
  }
  return {
    x: Math.floor(((unit.x || 0) + TILE_SIZE / 2) / TILE_SIZE),
    y: Math.floor(((unit.y || 0) + TILE_SIZE / 2) / TILE_SIZE)
  }
}

export function isStreetOrAirstripTile(tile) {
  return Boolean(tile && (tile.type === 'street' || tile.airstripStreet))
}

export function canJetTakeOffFromCurrentTile(unit, mapGrid = gameState.mapGrid) {
  if (!isStrikeJet(unit)) return true
  if (unit.flightState !== 'grounded') return true
  if (unit.towedBy) return false
  if (unit.landedHelipadId || unit.homeCarrierId) return true
  if (!unit.landedOnGround) return true

  const tilePos = getUnitTile(unit)
  const tile = mapGrid?.[tilePos?.y]?.[tilePos?.x]
  return isStreetOrAirstripTile(tile)
}

export function isGroundedJetNeedingRecovery(unit, mapGrid = gameState.mapGrid) {
  if (!isStrikeJet(unit) || unit.health <= 0) return false
  if (unit.flightState !== 'grounded') return false
  if (unit.towedBy) return true
  return Boolean(unit.landedOnGround && !canJetTakeOffFromCurrentTile(unit, mapGrid))
}

export function isCrewImmobilizedUnit(unit) {
  return Boolean(unit?.crew && (!unit.crew.driver || !unit.crew.commander))
}

export function canRecoveryTankTowTarget(tank, targetUnit, mapGrid = gameState.mapGrid) {
  if (!tank || tank.type !== 'recoveryTank' || tank.health <= 0) return false
  if (!targetUnit || targetUnit.health <= 0 || targetUnit.id === tank.id) return false
  if (targetUnit.restorationProtectedFromRecovery) return false
  if (tank.towedUnit && tank.towedUnit.id === targetUnit.id) return true
  if (tank.towedUnit) return false
  if (isCrewImmobilizedUnit(targetUnit)) return true
  return isGroundedJetNeedingRecovery(targetUnit, mapGrid)
}

export function releaseMountedCargo(carrier) {
  if (!carrier) return false
  let released = false

  if (carrier.towedUnit) {
    const mounted = carrier.towedUnit
    if (mounted.towedBy === carrier || mounted.towedBy === carrier.id) {
      mounted.towedBy = null
    }
    carrier.towedUnit = null
    released = true
  }

  if (carrier.towedWreck) {
    const wreck = carrier.towedWreck
    if (wreck.assignedTankId === carrier.id) {
      wreck.assignedTankId = null
    }
    if (wreck.towedBy === carrier.id || wreck.towedBy === carrier) {
      wreck.towedBy = null
    }
    carrier.towedWreck = null
    released = true
  }

  if (carrier.recoveryTask) {
    carrier.recoveryTask = null
    carrier.recoveryProgress = 0
    released = true
  }

  return released
}

export function notifyHumanJet(unit, message, duration = 3000) {
  if (!unit || unit.owner !== gameState.humanPlayer) return
  showNotification(message, duration)
}

export function beginJetEmergencyFuelLanding(unit, now = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())) {
  if (!isStrikeJet(unit) || unit.flightState === 'grounded') return false
  if (unit.emergencyFuelLanding || unit.f22State === 'emergency_landing') return true

  const center = getUnitCenter(unit)
  unit.emergencyFuelLanding = true
  unit.emergencyLandingStartedAt = now
  unit.emergencyFuelLandingNotified = Boolean(unit.emergencyFuelLandingNotified)
  unit.needsEmergencyFuel = true
  unit.emergencyFuelRequestTime = now
  unit.path = []
  unit.moveTarget = null
  unit.flightPlan = null
  unit.autoHoldAltitude = false
  unit.helipadLandingRequested = false
  unit.target = null
  unit.f22AssignedDestination = null
  unit.f22PendingTakeoff = false
  unit.commandIntent = 'explicitLand'

  if (center) {
    unit.groundLandingRequested = true
    unit.groundLandingTarget = { x: center.x, y: center.y }
  }

  if (unit.type === 'f22Raptor') {
    unit.f22State = 'emergency_landing'
    unit.manualFlightState = 'land'
    if (!unit.f22LandingSoundPlayed) {
      playPositionalSound('f22Landing', unit.x, unit.y, 0.55)
      unit.f22LandingSoundPlayed = true
    }
  } else {
    unit.manualFlightState = 'land'
  }

  return true
}

export function completeJetEmergencyFuelLanding(unit) {
  if (!unit) return
  unit.flightState = 'grounded'
  unit.altitude = 0
  unit.shadow = { offset: 0, scale: 1 }
  unit.landedOnGround = true
  unit.emergencyFuelLanding = false
  unit.f22PendingTakeoff = false
  unit.manualFlightState = 'auto'
  unit.path = []
  unit.moveTarget = null
  unit.flightPlan = null
  unit.target = null
  unit.f22AssignedDestination = null
  if (unit.type === 'f22Raptor') {
    unit.f22State = 'parked'
  }
  if (!unit.emergencyFuelLandingNotified) {
    unit.emergencyFuelLandingNotified = true
    notifyHumanJet(unit, JET_EMERGENCY_LANDING_MESSAGE)
  }
}

export function updateF22EmergencyLanding(unit, movement, now) {
  if (!unit) return false
  if (!unit.emergencyLandingStartedAt) {
    unit.emergencyLandingStartedAt = now
  }

  const elapsed = now - unit.emergencyLandingStartedAt
  const progress = Math.max(0, Math.min(1, elapsed / JET_EMERGENCY_LANDING_DURATION_MS))
  const startAltitude = Math.max(unit.emergencyLandingStartAltitude || unit.altitude || unit.maxAltitude || TILE_SIZE, 1)
  if (!unit.emergencyLandingStartAltitude) {
    unit.emergencyLandingStartAltitude = startAltitude
  }

  unit.flightState = 'landing'
  unit.helipadLandingRequested = false
  unit.f22PendingTakeoff = false
  unit.flightPlan = null
  unit.path = []
  unit.moveTarget = null
  unit.target = null

  const direction = Number.isFinite(unit.direction) ? unit.direction : (movement?.rotation || 0)
  const glideSpeed = Math.max(0.15, (unit.airCruiseSpeed || unit.speed || 1) * 0.35 * (1 - progress))
  if (movement) {
    movement.targetVelocity.x = Math.cos(direction) * glideSpeed
    movement.targetVelocity.y = Math.sin(direction) * glideSpeed
    movement.isMoving = glideSpeed > 0.05
    movement.targetRotation = direction
  }
  unit.direction = direction
  unit.rotation = direction

  const remain = 1 - Math.sin((progress * Math.PI) / 2)
  unit.altitude = Math.max(0, unit.emergencyLandingStartAltitude * remain)
  const altitudeRatio = Math.max(0, Math.min(1, unit.altitude / Math.max(unit.maxAltitude || startAltitude, 1)))
  unit.shadow = {
    offset: altitudeRatio * TILE_SIZE * 1.8,
    scale: 1 + altitudeRatio * 0.5
  }

  if (progress >= 1 || unit.altitude <= 0.5) {
    if (movement) {
      movement.targetVelocity.x = 0
      movement.targetVelocity.y = 0
      movement.isMoving = false
    }
    completeJetEmergencyFuelLanding(unit)
  }

  return true
}

export function updateF22StreetTakeoff(unit, movement, now) {
  if (!unit) return false
  if (!unit.streetTakeoffStartedAt) {
    unit.streetTakeoffStartedAt = now
    if (!unit.f22TakeoffSoundPlayed) {
      playPositionalSound('f22Takeoff', unit.x, unit.y, 0.55)
      unit.f22TakeoffSoundPlayed = true
    }
  }

  const elapsed = now - unit.streetTakeoffStartedAt
  const progress = Math.max(0, Math.min(1, elapsed / JET_STREET_TAKEOFF_DURATION_MS))
  const direction = Number.isFinite(unit.direction) ? unit.direction : 0
  const climb = Math.sin((progress * Math.PI) / 2)
  unit.flightState = progress < 0.35 ? 'grounded' : 'takeoff'
  unit.altitude = (unit.maxAltitude || TILE_SIZE) * climb
  const altitudeRatio = Math.min(1, unit.altitude / Math.max(unit.maxAltitude || TILE_SIZE, 1))
  unit.shadow = {
    offset: altitudeRatio * TILE_SIZE * 1.8,
    scale: 1 + altitudeRatio * 0.5
  }

  const speed = (unit.airCruiseSpeed || unit.speed || 1) * (0.45 + 0.55 * climb)
  if (movement) {
    movement.isMoving = true
    movement.targetRotation = direction
    movement.targetVelocity.x = Math.cos(direction) * speed
    movement.targetVelocity.y = Math.sin(direction) * speed
  }

  if (progress >= 1) {
    unit.f22State = 'airborne'
    unit.flightState = 'airborne'
    unit.f22PendingTakeoff = false
    unit.f22TakeoffSoundPlayed = false
    unit.landedOnGround = false
    unit.streetTakeoffStartedAt = null
    unit.emergencyFuelLandingNotified = false
    unit.emergencyLandingStartAltitude = null
    unit.groundLandingRequested = false
    unit.groundLandingTarget = null
  }

  return true
}
