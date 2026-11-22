import { TILE_SIZE } from '../config.js'
import { gameState } from '../gameState.js'
import { getBuildingIdentifier } from '../utils.js'
import { ownersAreEnemies } from './movementHelpers.js'
import { shouldAircraftReturnForFuel } from './jetFuel.js'
import { releaseAircraftForRebase, requestCarrierLanding, requestCarrierLaunch } from './navalFleetSystem.js'
import {
  getAirstripParkingSpots,
  getAirstripRunwayPoints,
  reserveAirstripParkingSlot
} from '../utils/airstripUtils.js'

export const AIR_WING_TYPES = new Set(['apache', 'f22Raptor', 'f35'])
const F22_LANDING_STATES = new Set(['wait_landing_clearance', 'approach_runway', 'landing_roll', 'taxi_to_parking'])

function entityCenter(entity) {
  if (!entity) return null
  if (entity.isBuilding || entity.tileX === undefined) {
    return {
      x: (entity.x + (entity.width || 1) / 2) * TILE_SIZE,
      y: (entity.y + (entity.height || 1) / 2) * TILE_SIZE
    }
  }
  return {
    x: entity.x + TILE_SIZE / 2,
    y: entity.y + TILE_SIZE / 2
  }
}

function findLiveEntity(targetId, units) {
  if (!targetId) return null
  const unit = (units || []).find(candidate => candidate && candidate.id === targetId && candidate.health > 0)
  if (unit) return unit
  return (gameState.buildings || []).find(building => building && (building.id === targetId || getBuildingIdentifier(building) === targetId) && building.health > 0) || null
}

function liveEnemyAttacker(candidate, defender) {
  if (!candidate || candidate.health <= 0 || !defender) return null
  if (!ownersAreEnemies(defender.owner, candidate.owner)) return null
  return candidate
}

function isParkedOnCarrier(unit) {
  return Boolean(unit.carrierId && unit.carrierOperation?.state === 'parked')
}

function isParkedAtAirstrip(unit) {
  if (unit.flightState !== 'grounded' || unit.f22PendingTakeoff) return false
  if (unit.type === 'f22Raptor') return unit.f22State === 'parked'
  return Boolean(unit.landedHelipadId)
}

function isReturningHome(unit) {
  const state = unit.carrierOperation?.state
  if (state && state !== 'parked' && state !== 'launch' && state !== 'launch_taxi') return true
  if (unit.helipadLandingRequested && (unit.commandIntent === 'returnToBase' || unit.commandIntent === 'landAtStructure')) {
    return true
  }
  if (unit.type === 'f22Raptor' && F22_LANDING_STATES.has(unit.f22State)) return true
  return false
}

function homePointFor(unit, units) {
  if (unit.homeCarrierId) {
    const carrier = (units || []).find(candidate => candidate && candidate.id === unit.homeCarrierId && candidate.health > 0)
    if (carrier) return entityCenter(carrier)
  }
  const stripId = unit.homeAirstripId || unit.airstripId
  const strip = (gameState.buildings || []).find(building => getBuildingIdentifier(building) === stripId && building.health > 0)
  if (strip) return entityCenter({ ...strip, isBuilding: true })
  return null
}

function needsCombatRefill(unit, units) {
  const ammoEmpty = typeof unit.maxRocketAmmo === 'number' && unit.maxRocketAmmo > 0 && (unit.rocketAmmo || 0) <= 0
  return ammoEmpty || shouldAircraftReturnForFuel(unit, homePointFor(unit, units))
}

function serviceReady(unit) {
  const ammoReady = typeof unit.maxRocketAmmo !== 'number' || unit.maxRocketAmmo <= 0 || (unit.rocketAmmo || 0) >= unit.maxRocketAmmo - 0.05
  const fuelReady = typeof unit.maxGas !== 'number' || unit.maxGas <= 0 || unit.gas >= unit.maxGas * 0.98
  return ammoReady && fuelReady
}

export function unitsBasedAtAirstrip(airstrip, units) {
  const airstripId = getBuildingIdentifier(airstrip)
  if (!airstripId) return []
  return (units || []).filter(unit => {
    if (!unit || unit.health <= 0 || !AIR_WING_TYPES.has(unit.type) || unit.homeCarrierId) return false
    return unit.homeAirstripId === airstripId || unit.airstripId === airstripId || unit.landedHelipadId === airstripId
  })
}

export function unitsBasedAtSelectedAirstrips(selectedUnits, units) {
  const seen = new Set()
  const based = []
  ;(selectedUnits || []).forEach(selected => {
    if (!selected?.isBuilding || selected.type !== 'airstrip' || selected.health <= 0) return
    unitsBasedAtAirstrip(selected, units).forEach(unit => {
      if (!unit.id || seen.has(unit.id)) return
      seen.add(unit.id)
      based.push(unit)
    })
  })
  return based
}

export function beginHelipadRebase(unit, units = gameState.units) {
  if (!unit) return false
  unit.homeAirstripId = null
  return releaseAircraftForRebase(unit, units)
}

export function beginAirstripLanding(unit, airstrip, options = {}) {
  if (!unit || !airstrip || airstrip.health <= 0) return null
  const airstripId = getBuildingIdentifier(airstrip)
  const preferred = Number.isInteger(options.slotIndex) ? options.slotIndex : unit.airstripParkingSlotIndex
  const reserved = reserveAirstripParkingSlot(airstrip, unit.id, preferred)
  const slotIndex = Number.isInteger(reserved) && reserved >= 0 ? reserved : null
  const slot = slotIndex === null ? null : getAirstripParkingSpots(airstrip)[slotIndex] || null
  if (!slot) return null
  unit.homeAirstripId = airstripId
  unit.airstripId = airstripId
  unit.helipadTargetId = airstripId
  unit.airstripParkingSlotIndex = slotIndex
  unit.commandIntent = options.intent || 'landAtStructure'
  unit.helipadLandingRequested = true
  unit.groundLandingRequested = false
  unit.groundLandingTarget = null
  unit.manualFlightHoverRequested = false
  unit.target = options.keepTarget ? unit.target : null
  releaseAircraftForRebase(unit, options.units || gameState.units)
  if (unit.type === 'f22Raptor') {
    unit.runwayPoints = getAirstripRunwayPoints(airstrip)
    unit.f22PendingTakeoff = false
    unit.f22AssignedDestination = null
    unit.flightPlan = null
    if (!F22_LANDING_STATES.has(unit.f22State) && unit.f22State !== 'parked') {
      unit.f22State = 'airborne'
    }
  } else if (slot) {
    unit.flightPlan = {
      x: slot.worldX,
      y: slot.worldY,
      stopRadius: options.stopRadius || TILE_SIZE * 0.22,
      mode: 'airstrip',
      followTargetId: null,
      destinationTile: { x: slot.x, y: slot.y }
    }
    unit.moveTarget = { x: slot.x, y: slot.y }
    if (unit.flightState === 'grounded' && !unit.carrierOperation) unit.manualFlightState = 'takeoff'
  }
  return { airstripId, slotIndex, slot }
}

function findHomeCarrier(unit, units) {
  if (!unit.homeCarrierId) return null
  return (units || []).find(candidate => candidate && candidate.id === unit.homeCarrierId && candidate.type === 'aircraftCarrier' && candidate.health > 0) || null
}

function findHomeAirstrip(unit) {
  const airstripId = unit.homeAirstripId || unit.airstripId
  if (!airstripId) return null
  return (gameState.buildings || []).find(building => building && building.type === 'airstrip' && building.health > 0 && getBuildingIdentifier(building) === airstripId) || null
}

function returnToPort(unit, units, now) {
  if (isReturningHome(unit) || isParkedOnCarrier(unit)) return true
  const carrier = findHomeCarrier(unit, units)
  if (carrier) {
    requestCarrierLanding(unit, carrier, units, now, { preserveMission: true })
    return true
  }
  if (isParkedAtAirstrip(unit) && unit.homeAirstripId && unit.landedHelipadId === unit.homeAirstripId) return true
  const strip = findHomeAirstrip(unit)
  if (strip && !isReturningHome(unit)) {
    beginAirstripLanding(unit, strip, { intent: 'returnToBase', keepTarget: false, units })
    return true
  }
  return false
}

function engageTarget(unit, target, units, now) {
  if (!target) return
  const alreadyLeavingPort = unit.f22PendingTakeoff ||
    unit.f22State === 'wait_takeoff_clearance' ||
    unit.f22State === 'taxi_to_runway_start' ||
    unit.f22State === 'takeoff_roll' ||
    unit.f22State === 'liftoff' ||
    unit.carrierOperation?.state === 'launch' ||
    unit.carrierOperation?.state === 'launch_taxi'
  if (unit.target?.id === target.id && !isReturningHome(unit) && (alreadyLeavingPort || (!isParkedOnCarrier(unit) && unit.flightState !== 'grounded'))) {
    return
  }
  unit.target = target
  unit.allowedToAttack = true
  unit.forcedAttack = false
  unit.commandIntent = 'attack'
  unit.helipadLandingRequested = false
  const center = entityCenter(target)
  if (!center) return
  if (unit.type === 'f22Raptor') {
    unit.f22AssignedDestination = {
      x: center.x,
      y: center.y,
      stopRadius: TILE_SIZE * 0.6,
      mode: 'combat',
      destinationTile: null,
      followTargetId: target.id || null
    }
    unit.flightPlan = null
    if (isParkedOnCarrier(unit)) {
      requestCarrierLaunch(unit, null, now)
      return
    }
    if (unit.flightState === 'grounded' && (!unit.f22State || unit.f22State === 'parked')) {
      unit.f22PendingTakeoff = true
      unit.f22State = 'parked'
    }
    return
  }

  const plan = unit.flightPlan && unit.flightPlan.mode === 'combat' ? unit.flightPlan : null
  if (plan) {
    plan.x = center.x
    plan.y = center.y
    plan.followTargetId = target.id || null
  } else {
    unit.flightPlan = {
      x: center.x,
      y: center.y,
      stopRadius: TILE_SIZE * 0.4,
      mode: 'combat',
      followTargetId: target.id || null,
      destinationTile: null
    }
  }
  if (isParkedOnCarrier(unit)) {
    requestCarrierLaunch(unit, null, now)
    return
  }
  if (unit.flightState === 'grounded') {
    unit.manualFlightState = 'takeoff'
    unit.landedHelipadId = null
  }
}

function followGuardedUnit(unit, guarded, units, now) {
  const center = entityCenter(guarded)
  if (!center) return
  const followX = center.x - TILE_SIZE * 2.2
  const followY = center.y - TILE_SIZE * 0.6
  if (unit.type === 'f22Raptor') {
    const destination = unit.f22AssignedDestination
    if (destination?.mode === 'guard') {
      destination.x = followX
      destination.y = followY
    } else {
      unit.f22AssignedDestination = { x: followX, y: followY, stopRadius: TILE_SIZE * 1.4, mode: 'guard', destinationTile: null, followTargetId: null }
    }
    if (isParkedOnCarrier(unit)) requestCarrierLaunch(unit, null, now)
    else if (unit.flightState === 'grounded' && (!unit.f22State || unit.f22State === 'parked')) {
      unit.f22PendingTakeoff = true
      unit.f22State = 'parked'
    }
    unit.helipadLandingRequested = false
    unit.commandIntent = 'guard'
    return
  }
  if (isParkedOnCarrier(unit)) {
    requestCarrierLaunch(unit, null, now)
    return
  }
  if (unit.carrierOperation) return
  const plan = unit.flightPlan && unit.flightPlan.mode === 'guard' ? unit.flightPlan : null
  if (plan) {
    plan.x = followX
    plan.y = followY
    plan.followTargetId = guarded.id || null
  } else {
    unit.flightPlan = {
      x: followX,
      y: followY,
      stopRadius: TILE_SIZE * 1.4,
      mode: 'guard',
      followTargetId: guarded.id || null,
      destinationTile: null
    }
  }
  unit.moveTarget = {
    x: Math.floor(followX / TILE_SIZE),
    y: Math.floor(followY / TILE_SIZE)
  }
  unit.helipadLandingRequested = false
  unit.commandIntent = 'guard'
  if (unit.flightState === 'grounded') unit.manualFlightState = 'takeoff'
}

function resolveGuardIntercept(unit, guarded, units) {
  const fresh = liveEnemyAttacker(guarded?.lastAttacker, unit) || liveEnemyAttacker(unit.lastAttacker, unit)
  if (fresh) {
    unit.airGuardInterceptId = fresh.id
    return fresh
  }
  return findLiveEntity(unit.airGuardInterceptId, units)
}

export function updateAirGuard(unit, units, now) {
  if (!unit || !AIR_WING_TYPES.has(unit.type)) return
  if (!unit.guardMode || !unit.guardTarget || unit.guardTarget.health <= 0) {
    if (unit.airGuardActive) {
      unit.airGuardActive = false
      unit.airGuardInterceptId = null
      unit.target = null
      if (unit.type === 'f22Raptor') returnToPort(unit, units, now)
    }
    return
  }

  unit.airGuardActive = true
  unit.carrierStrikeActive = false
  if (unit.guardOrderMode === 'follow') {
    unit.target = null
    unit.airGuardInterceptId = null
    followGuardedUnit(unit, unit.guardTarget, units, now)
    return
  }
  const intercept = resolveGuardIntercept(unit, unit.guardTarget, units)
  const parked = isParkedOnCarrier(unit) || isParkedAtAirstrip(unit)
  if (intercept && parked && !serviceReady(unit)) return
  if (intercept && !parked && needsCombatRefill(unit, units)) {
    unit.target = null
    returnToPort(unit, units, now)
    return
  }
  if (intercept) {
    unit.airGuardInterceptId = intercept.id
    engageTarget(unit, intercept, units, now)
    return
  }

  unit.airGuardInterceptId = null
  if (unit.target) unit.target = null
  if (unit.type === 'f22Raptor') {
    if (unit.f22PendingTakeoff && (!unit.f22State || unit.f22State === 'parked')) {
      unit.f22PendingTakeoff = false
      unit.f22AssignedDestination = null
      return
    }
    if (!parked) returnToPort(unit, units, now)
    return
  }
  followGuardedUnit(unit, unit.guardTarget, units, now)
}
