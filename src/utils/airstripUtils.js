import { TILE_SIZE } from '../config.js'
import {
  AIRSTRIP_SOURCE_WIDTH,
  AIRSTRIP_SOURCE_HEIGHT,
  AIRSTRIP_DEFAULT_WIDTH,
  AIRSTRIP_DEFAULT_HEIGHT
} from './buildingPassability.js'

const F22_PARKED_FACING = -3 * Math.PI / 4

const AIRSTRIP_WORLD_POINTS = Object.freeze({
  parkingSpots: [
    { x: 113, y: 378, facing: F22_PARKED_FACING },
    { x: 241, y: 378, facing: F22_PARKED_FACING },
    { x: 369, y: 378, facing: F22_PARKED_FACING },
    { x: 497, y: 378, facing: F22_PARKED_FACING },
    { x: 625, y: 378, facing: F22_PARKED_FACING },
    { x: 515, y: 62, facing: F22_PARKED_FACING },
    { x: 615, y: 62, facing: F22_PARKED_FACING }
  ],
  runwayStart: { x: 30, y: 240, facing: 0 },
  runwayLiftOff: { x: 433, y: 240, facing: 0 },
  runwayExit: { x: 768, y: 240, facing: 0 }
})

function getAirstripWorldOrigin(airstrip) {
  return {
    x: airstrip.x * TILE_SIZE,
    y: airstrip.y * TILE_SIZE
  }
}

function getAirstripRenderedSize(airstrip) {
  return {
    width: (airstrip.width || AIRSTRIP_DEFAULT_WIDTH) * TILE_SIZE,
    height: (airstrip.height || AIRSTRIP_DEFAULT_HEIGHT) * TILE_SIZE
  }
}

function toWorldPointFromSource(airstrip, sourcePoint) {
  const origin = getAirstripWorldOrigin(airstrip)
  const rendered = getAirstripRenderedSize(airstrip)
  return {
    x: origin.x + (sourcePoint.x / AIRSTRIP_SOURCE_WIDTH) * rendered.width,
    y: origin.y + (sourcePoint.y / AIRSTRIP_SOURCE_HEIGHT) * rendered.height,
    facing: sourcePoint.facing
  }
}

function toTilePosition(worldPoint) {
  return {
    x: Math.floor(worldPoint.x / TILE_SIZE),
    y: Math.floor(worldPoint.y / TILE_SIZE)
  }
}

function toSlotPoint(worldPoint, index = null) {
  const tile = toTilePosition(worldPoint)
  return {
    x: tile.x,
    y: tile.y,
    worldX: worldPoint.x,
    worldY: worldPoint.y,
    facing: worldPoint.facing,
    index
  }
}

export function getAirstripParkingSpots(airstrip) {
  if (!airstrip) return []
  return AIRSTRIP_WORLD_POINTS.parkingSpots.map((spot, index) => {
    const world = toWorldPointFromSource(airstrip, spot)
    return toSlotPoint(world, index)
  })
}

export function getAirstripRunwayPoints(airstrip) {
  if (!airstrip) return null
  const runwayStart = toWorldPointFromSource(airstrip, AIRSTRIP_WORLD_POINTS.runwayStart)
  const runwayLiftOff = toWorldPointFromSource(airstrip, AIRSTRIP_WORLD_POINTS.runwayLiftOff)
  const runwayExit = toWorldPointFromSource(airstrip, AIRSTRIP_WORLD_POINTS.runwayExit)

  return {
    runwayStart: toSlotPoint(runwayStart),
    runwayLiftOff: toSlotPoint(runwayLiftOff),
    runwayExit: toSlotPoint(runwayExit)
  }
}

export function ensureAirstripOperations(airstrip) {
  if (!airstrip || airstrip.type !== 'airstrip') {
    return
  }

  if (!Array.isArray(airstrip.f22ParkingSpots) || !airstrip.f22ParkingSpots.length) {
    airstrip.f22ParkingSpots = getAirstripParkingSpots(airstrip)
  }

  if (!airstrip.runwayPoints) {
    airstrip.runwayPoints = getAirstripRunwayPoints(airstrip)
  }

  if (!Array.isArray(airstrip.f22OccupiedSlotUnitIds) || airstrip.f22OccupiedSlotUnitIds.length !== airstrip.f22ParkingSpots.length) {
    airstrip.f22OccupiedSlotUnitIds = airstrip.f22ParkingSpots.map(() => null)
  }

  if (!Array.isArray(airstrip.f22ReservedSlotUnitIds) || airstrip.f22ReservedSlotUnitIds.length !== airstrip.f22ParkingSpots.length) {
    airstrip.f22ReservedSlotUnitIds = airstrip.f22ParkingSpots.map(() => null)
  }

  if (!Array.isArray(airstrip.f22RunwayTakeoffQueue)) {
    airstrip.f22RunwayTakeoffQueue = []
  }

  if (!Array.isArray(airstrip.f22RunwayLandingQueue)) {
    airstrip.f22RunwayLandingQueue = []
  }

  if (!airstrip.f22RunwayOperation || typeof airstrip.f22RunwayOperation !== 'object') {
    airstrip.f22RunwayOperation = null
  }
}

export function claimAirstripParkingSlot(airstrip, preferredIndex = null) {
  ensureAirstripOperations(airstrip)
  if (!airstrip?.f22OccupiedSlotUnitIds) return null
  const reserved = airstrip.f22ReservedSlotUnitIds || []

  if (Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < airstrip.f22OccupiedSlotUnitIds.length) {
    if (!airstrip.f22OccupiedSlotUnitIds[preferredIndex] && !reserved[preferredIndex]) {
      return preferredIndex
    }
  }

  return airstrip.f22OccupiedSlotUnitIds.findIndex((slotId, index) => !slotId && !reserved[index])
}

export function reserveAirstripParkingSlot(airstrip, unitId, preferredIndex = null) {
  ensureAirstripOperations(airstrip)
  if (!airstrip?.f22ReservedSlotUnitIds || !unitId) return null

  const existingReservation = airstrip.f22ReservedSlotUnitIds.findIndex(id => id === unitId)
  if (existingReservation >= 0) {
    return existingReservation
  }

  const slotIndex = claimAirstripParkingSlot(airstrip, preferredIndex)
  if (!Number.isInteger(slotIndex) || slotIndex < 0) {
    return null
  }

  airstrip.f22ReservedSlotUnitIds[slotIndex] = unitId
  return slotIndex
}

export function releaseAirstripParkingSlotReservation(airstrip, unitId) {
  ensureAirstripOperations(airstrip)
  if (!airstrip?.f22ReservedSlotUnitIds || !unitId) return
  const index = airstrip.f22ReservedSlotUnitIds.findIndex(id => id === unitId)
  if (index >= 0) {
    airstrip.f22ReservedSlotUnitIds[index] = null
  }
}

export function setAirstripSlotOccupant(airstrip, slotIndex, unitId) {
  ensureAirstripOperations(airstrip)
  if (!airstrip?.f22OccupiedSlotUnitIds) return
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= airstrip.f22OccupiedSlotUnitIds.length) return
  airstrip.f22OccupiedSlotUnitIds[slotIndex] = unitId || null
  if (airstrip.f22ReservedSlotUnitIds && slotIndex < airstrip.f22ReservedSlotUnitIds.length) {
    airstrip.f22ReservedSlotUnitIds[slotIndex] = unitId || null
  }
}

export function clearAirstripSlotOccupant(airstrip, unitId) {
  ensureAirstripOperations(airstrip)
  if (!airstrip?.f22OccupiedSlotUnitIds || !unitId) return
  const index = airstrip.f22OccupiedSlotUnitIds.findIndex(id => id === unitId)
  if (index >= 0) {
    airstrip.f22OccupiedSlotUnitIds[index] = null
    if (airstrip.f22ReservedSlotUnitIds && index < airstrip.f22ReservedSlotUnitIds.length && airstrip.f22ReservedSlotUnitIds[index] === unitId) {
      airstrip.f22ReservedSlotUnitIds[index] = null
    }
  }
}

// Repair stale claims from interrupted flights and saves. The caller indexes aircraft
// once for all airstrips so each slot takes at most two lookups per tick.
export function reconcileAirstripParking(airstrip, airstripId, aircraftById) {
  const occupied = airstrip.f22OccupiedSlotUnitIds
  const reserved = airstrip.f22ReservedSlotUnitIds
  for (let index = 0; index < occupied.length; index++) {
    const occupant = occupied[index] && aircraftById.get(occupied[index])
    if (occupied[index] && !isHoldingAirstripSlot(occupant, airstrip, airstripId, index)) {
      if (airstrip.landedUnitId === occupied[index]) airstrip.landedUnitId = null
      if (occupant?.landedHelipadId === airstripId && occupant.flightState !== 'grounded') {
        occupant.landedHelipadId = null
        if (occupant.manualFlightState === 'takeoff' && occupant.helipadTargetId === airstripId &&
            occupant.airstripParkingSlotIndex === index) {
          occupant.helipadLandingRequested = false
        }
      }
      occupied[index] = null
    }

    if (!reserved[index] || reserved[index] === occupied[index]) continue
    const aircraft = aircraftById.get(reserved[index])
    const delivery = aircraft?.aircraftDelivery
    const delivering = delivery?.targetId === airstripId &&
      (aircraft.type === 'c5Galaxy' ? C5_LOWER_SLOT_INDICES.includes(index) : delivery.slot === index)
    const landing = aircraft?.helipadLandingRequested && aircraft.helipadTargetId === airstripId &&
      aircraft.airstripParkingSlotIndex === index
    if (!delivering && !landing) reserved[index] = null
  }
}

function isHoldingAirstripSlot(aircraft, airstrip, airstripId, index) {
  if (!aircraft || aircraft.carrierOperation) return false
  if (aircraft.type === 'f22Raptor') {
    if (aircraft.airstripParkingSlotIndex !== index) return false
    if (aircraft.f22State === 'taxi_to_parking') return aircraft.airstripId === airstripId
    return aircraft.flightState === 'grounded' && aircraft.landedHelipadId === airstripId &&
      (aircraft.f22State === 'parked' || aircraft.f22State === 'wait_takeoff_clearance')
  }
  if (aircraft.flightState !== 'grounded') return false
  const galaxy = aircraft.type === 'c5Galaxy'
  const parkedAt = galaxy ? aircraft.homeAirstripId ?? aircraft.airstripId : aircraft.landedHelipadId
  if (parkedAt !== airstripId || (galaxy ? !C5_LOWER_SLOT_INDICES.includes(index) : aircraft.airstripParkingSlotIndex !== index)) return false
  const spot = airstrip.f22ParkingSpots[galaxy ? C5_LOWER_SLOT_INDICES[1] : index]
  return Math.abs(aircraft.x + TILE_SIZE / 2 - spot.worldX) <= TILE_SIZE / 2 &&
    Math.abs(aircraft.y + TILE_SIZE / 2 - spot.worldY) <= TILE_SIZE / 2
}

export const C5_LOWER_SLOT_INDICES = Object.freeze([0, 1, 2])

export function getC5ParkingPosition(airstrip) {
  ensureAirstripOperations(airstrip)
  const center = airstrip.f22ParkingSpots[C5_LOWER_SLOT_INDICES[1]]
  return { x: center.worldX - TILE_SIZE / 2, y: center.worldY - TILE_SIZE / 2 }
}

export function canReserveC5ParkingSlots(airstrip, unitId = null) {
  ensureAirstripOperations(airstrip)
  return Boolean(airstrip?.f22ReservedSlotUnitIds) && C5_LOWER_SLOT_INDICES.every(index =>
    (!airstrip.f22OccupiedSlotUnitIds[index] || airstrip.f22OccupiedSlotUnitIds[index] === unitId) &&
    (!airstrip.f22ReservedSlotUnitIds[index] || airstrip.f22ReservedSlotUnitIds[index] === unitId))
}

export function reserveC5ParkingSlots(airstrip, unitId) {
  if (!unitId || !canReserveC5ParkingSlots(airstrip, unitId)) return null
  C5_LOWER_SLOT_INDICES.forEach(index => { airstrip.f22ReservedSlotUnitIds[index] = unitId })
  return [...C5_LOWER_SLOT_INDICES]
}

export function setC5ParkingOccupant(airstrip, unitId) {
  if (!reserveC5ParkingSlots(airstrip, unitId)) return false
  C5_LOWER_SLOT_INDICES.forEach(index => { airstrip.f22OccupiedSlotUnitIds[index] = unitId })
  return true
}

export function releaseC5ParkingSlots(airstrip, unitId) {
  ensureAirstripOperations(airstrip)
  C5_LOWER_SLOT_INDICES.forEach(index => {
    if (airstrip.f22OccupiedSlotUnitIds[index] === unitId) airstrip.f22OccupiedSlotUnitIds[index] = null
    if (airstrip.f22ReservedSlotUnitIds[index] === unitId) airstrip.f22ReservedSlotUnitIds[index] = null
  })
}

function ensureRunwayQueue(airstrip, operationType) {
  ensureAirstripOperations(airstrip)
  if (operationType === 'landing') {
    return airstrip.f22RunwayLandingQueue
  }
  return airstrip.f22RunwayTakeoffQueue
}

export function enqueueAirstripRunwayOperation(airstrip, unitId, operationType = 'takeoff') {
  if (!airstrip || !unitId) return
  const queue = ensureRunwayQueue(airstrip, operationType)
  if (!queue.includes(unitId)) {
    queue.push(unitId)
  }
}

export function removeAirstripRunwayQueueEntry(airstrip, unitId, operationType = null) {
  if (!airstrip || !unitId) return
  ensureAirstripOperations(airstrip)

  const removeFromQueue = queueName => {
    const queue = airstrip[queueName]
    if (!Array.isArray(queue)) return
    const index = queue.indexOf(unitId)
    if (index >= 0) {
      queue.splice(index, 1)
    }
  }

  if (!operationType || operationType === 'takeoff') {
    removeFromQueue('f22RunwayTakeoffQueue')
  }

  if (!operationType || operationType === 'landing') {
    removeFromQueue('f22RunwayLandingQueue')
  }
}

export function tryClaimAirstripRunwayOperation(airstrip, unitId, operationType = 'takeoff') {
  if (!airstrip || !unitId) return false
  ensureAirstripOperations(airstrip)

  const queue = ensureRunwayQueue(airstrip, operationType)
  if (!queue.includes(unitId)) {
    queue.push(unitId)
  }

  if (airstrip.f22RunwayOperation?.unitId === unitId) {
    return true
  }

  if (airstrip.f22RunwayOperation) {
    return false
  }

  if (queue[0] !== unitId) {
    return false
  }

  airstrip.f22RunwayOperation = {
    unitId,
    type: operationType
  }
  return true
}

export function releaseAirstripRunwayOperation(airstrip, unitId) {
  if (!airstrip || !unitId) return
  ensureAirstripOperations(airstrip)

  if (airstrip.f22RunwayOperation?.unitId === unitId) {
    airstrip.f22RunwayOperation = null
  }

  removeAirstripRunwayQueueEntry(airstrip, unitId)
}
