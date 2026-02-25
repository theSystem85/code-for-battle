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

  if (Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < airstrip.f22OccupiedSlotUnitIds.length) {
    if (!airstrip.f22OccupiedSlotUnitIds[preferredIndex]) {
      return preferredIndex
    }
  }

  return airstrip.f22OccupiedSlotUnitIds.findIndex(slotId => !slotId)
}

export function setAirstripSlotOccupant(airstrip, slotIndex, unitId) {
  ensureAirstripOperations(airstrip)
  if (!airstrip?.f22OccupiedSlotUnitIds) return
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= airstrip.f22OccupiedSlotUnitIds.length) return
  airstrip.f22OccupiedSlotUnitIds[slotIndex] = unitId || null
}

export function clearAirstripSlotOccupant(airstrip, unitId) {
  ensureAirstripOperations(airstrip)
  if (!airstrip?.f22OccupiedSlotUnitIds || !unitId) return
  const index = airstrip.f22OccupiedSlotUnitIds.findIndex(id => id === unitId)
  if (index >= 0) {
    airstrip.f22OccupiedSlotUnitIds[index] = null
  }
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
