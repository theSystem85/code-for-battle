import { applyUnitBuildDelivery } from '../policies/unitBuildDelivery.js'
import { isGroundAircraftDelivery } from '../production/aircraftProduction.js'
import { TILE_SIZE } from '../config.js'
import { getBuildingIdentifier } from '../utils.js'
import { hasBlockingBuilding } from '../utils/buildingPassability.js'
import {
  canReserveC5ParkingSlots, ensureAirstripOperations, reserveAirstripParkingSlot, reserveC5ParkingSlots,
  releaseAirstripParkingSlotReservation, releaseC5ParkingSlots, setAirstripSlotOccupant, setC5ParkingOccupant
} from '../utils/airstripUtils.js'
import { getHelipadLandingCenter, getHelipadLandingTile, isHelipadAvailableForUnit } from '../utils/helipadUtils.js'
import { findPathForOwner } from '../units.js'
import { assignApacheFlight } from '../input/unitCommands/airCommands.js'
import { focusAndSelectUnit, getUnitDisplayName } from './attackNotifications.js'
import { showNotification } from '../ui/notifications.js'
import { addMovableOccupancy, fixedOccupancyCount, hasMovableOccupancy } from './occupancyTags.js'
import { changeC5GroundOccupancy } from './c5Cargo.js'

const DELIVERY_RETRY_MS = 1000
const TAXI_PIXELS_PER_MS = 0.045
const facilitiesById = new Map()
const flightDestinations = new Set()
const streetRouteOptions = Object.freeze({ streetOnly: true, strictDestination: true, cardinalOnly: true, includeMovableOccupancy: true })
const APACHE_DESTINATIONS = ['helipad', 'airstrip']
const F35_DESTINATIONS = ['airstrip', 'helipad']

export function showAircraftDeliveryBlock(unit) {
  const name = getUnitDisplayName(unit.type)
  const instructions = unit.aircraftDelivery.blocked === 'street'
    ? ' is blocked. Build a street from the Plane Factory to the Airstrip.'
    : ' is waiting for an available airstrip parking slot.'
  const onActivate = () => focusAndSelectUnit(unit)
  showNotification(name + instructions, 6000, {
    onActivate,
    renderContent(notification) {
      const link = document.createElement('button')
      link.type = 'button'
      link.className = 'notification__inline-link'
      link.textContent = name
      link.style.cssText = 'background:none;border:0;padding:0;color:#ffd54f;font:inherit;text-decoration:underline;cursor:pointer'
      link.addEventListener('click', onActivate)
      notification.append(link, instructions)
    }
  })
}

function isStreet(tile) {
  return (tile?.type === 'street' || tile?.airstripStreet) && !hasBlockingBuilding(tile) && !tile.seedCrystal && !tile.impassable
}

function findTaxiRoute(unit, mapGrid, occupancy) {
  if (!isStreet(mapGrid[unit.tileY]?.[unit.tileX])) return 'street'
  let hasFreeParking = false
  let hasStreetConnection = false
  const galaxy = unit.type === 'c5Galaxy'
  const start = { x: unit.tileX, y: unit.tileY }
  for (const [targetId, strip] of facilitiesById) {
    if (strip.owner !== unit.owner || strip.type !== 'airstrip') continue
    ensureAirstripOperations(strip)
    if (galaxy && !canReserveC5ParkingSlots(strip, unit.id)) continue
    const spots = strip.f22ParkingSpots
    // Keep the three adjacent lower bays available for a Galaxy when possible.
    for (let offset = 0; offset < spots.length; offset++) {
      const spot = spots[(offset + 3) % spots.length]
      if (galaxy ? spot.index !== 1 : strip.f22OccupiedSlotUnitIds[spot.index] || strip.f22ReservedSlotUnitIds[spot.index]) continue
      hasFreeParking = true
      const route = findPathForOwner(start, spot, mapGrid, occupancy, unit.owner, streetRouteOptions)
      if (!route.length) {
        if (!hasStreetConnection) {
          hasStreetConnection = findPathForOwner(start, spot, mapGrid, null, unit.owner, streetRouteOptions).length > 0
        }
        continue
      }
      if (galaxy) reserveC5ParkingSlots(strip, unit.id)
      else reserveAirstripParkingSlot(strip, unit.id, spot.index)
      return {
        targetId, slot: spot.index, facing: spot.facing, next: 0,
        route: [
          ...route.map(tile => ({ x: tile.x * TILE_SIZE, y: tile.y * TILE_SIZE })),
          { x: spot.worldX - TILE_SIZE / 2, y: spot.worldY - TILE_SIZE / 2 }
        ]
      }
    }
  }
  if (!hasFreeParking) return 'parking'
  return hasStreetConnection ? 'traffic' : 'street'
}

function releaseTaxiReservation(unit, strip) {
  if (!strip) return
  if (unit.type === 'c5Galaxy') releaseC5ParkingSlots(strip, unit.id)
  else releaseAirstripParkingSlotReservation(strip, unit.id)
}

function isClearTaxiTile(unit, mapGrid, occupancy, x, y) {
  if (!isStreet(mapGrid[y]?.[x])) return false
  const value = occupancy?.[y]?.[x]
  const atCurrentTile = x === unit.tileX && y === unit.tileY
  const ownFixedOccupancy = unit.type === 'c5Galaxy' && unit.c5GroundOccupancy &&
    Math.abs(x - unit.tileX) <= 1 && Math.abs(y - unit.tileY) <= 1 ? 1 : 0
  return fixedOccupancyCount(value) <= ownFixedOccupancy && (atCurrentTile || !hasMovableOccupancy(value))
}

function advanceTaxi(unit, mapGrid, occupancy, delta) {
  const delivery = unit.aircraftDelivery
  const point = delivery.route[delivery.next]
  const x = Math.floor((point.x + TILE_SIZE / 2) / TILE_SIZE)
  const y = Math.floor((point.y + TILE_SIZE / 2) / TILE_SIZE)
  if (!isStreet(mapGrid[y]?.[x])) return 'disconnected'
  if (!isClearTaxiTile(unit, mapGrid, occupancy, x, y)) return 'traffic'

  const dx = point.x - unit.x
  const dy = point.y - unit.y
  const distance = Math.hypot(dx, dy)
  const step = Math.min(distance, Math.max(0, delta) * TAXI_PIXELS_PER_MS)
  const fraction = distance ? step / distance : 1
  const nextX = unit.x + dx * fraction
  const nextY = unit.y + dy * fraction
  const tileX = Math.floor((nextX + TILE_SIZE / 2) / TILE_SIZE)
  const tileY = Math.floor((nextY + TILE_SIZE / 2) / TILE_SIZE)
  const movedTile = tileX !== unit.tileX || tileY !== unit.tileY
  const galaxy = unit.type === 'c5Galaxy'
  if (movedTile && galaxy) changeC5GroundOccupancy(unit, occupancy, -1)
  if (movedTile && !galaxy && occupancy?.[unit.tileY]?.[unit.tileX] !== undefined) {
    occupancy[unit.tileY][unit.tileX] = addMovableOccupancy(occupancy[unit.tileY][unit.tileX], -1)
  }
  if (distance > 0) unit.direction = unit.rotation = Math.atan2(dy, dx)
  unit.x = nextX
  unit.y = nextY
  unit.tileX = tileX
  unit.tileY = tileY
  if (movedTile && galaxy) changeC5GroundOccupancy(unit, occupancy, 1)
  if (movedTile && !galaxy && occupancy?.[tileY]?.[tileX] !== undefined) {
    occupancy[tileY][tileX] = addMovableOccupancy(occupancy[tileY][tileX], 1)
  }
  if (step < distance) return
  delivery.next++
  if (delivery.next === delivery.route.length) return 'parked'
}

function parkAircraft(unit, strip, delivery) {
  unit.airstripId = unit.homeAirstripId = unit.landedHelipadId = unit.helipadTargetId = delivery.targetId
  unit.airstripParkingSlotIndex = delivery.slot
  unit.direction = unit.rotation = delivery.facing
  unit.runwayPoints = strip.runwayPoints
  if (unit.type === 'c5Galaxy') setC5ParkingOccupant(strip, unit.id)
  else {
    setAirstripSlotOccupant(strip, delivery.slot, unit.id)
    unit.f22State = 'parked'
    unit.f22PendingTakeoff = false
    unit.f22AssignedDestination = null
    unit.path = []
    unit.moveTarget = null
  }
  finishDelivery(unit)
}

function finishDelivery(unit) {
  const order = unit.aircraftDelivery.order
  delete unit.aircraftDelivery
  if (order) applyUnitBuildDelivery(unit, order)
}

function dispatchFlight(unit, units) {
  const destinationTypes = unit.type === 'apache' ? APACHE_DESTINATIONS : F35_DESTINATIONS
  for (const type of destinationTypes) {
    if (dispatchToFacility(unit, units, type)) return
  }
}

function dispatchToFacility(unit, units, type) {
  for (const [id, facility] of facilitiesById) {
    if (facility.owner !== unit.owner || facility.type !== type) continue
    if (facility.type === 'helipad') {
      if (flightDestinations.has(id) || !isHelipadAvailableForUnit(facility, units, unit.id)) continue
      if (!assignApacheFlight(unit, getHelipadLandingTile(facility), getHelipadLandingCenter(facility), { mode: 'helipad', helipadId: id })) continue
      flightDestinations.add(id)
    } else {
      ensureAirstripOperations(facility)
      const slot = facility.f22ParkingSpots.find(spot =>
        !facility.f22OccupiedSlotUnitIds[spot.index] && !facility.f22ReservedSlotUnitIds[spot.index])
      if (!slot || !assignApacheFlight(unit, slot, { x: slot.worldX, y: slot.worldY }, { mode: 'airstrip', airstrip: facility, airstripParkingSlotIndex: slot.index })) continue
    }
    unit.aircraftDelivery.targetId = id
    return true
  }
}

export function updateAircraftDeliveries(units, state, mapGrid, occupancy, now, delta) {
  let indexed = false
  for (const unit of units) {
    const delivery = unit.aircraftDelivery
    if (!delivery || unit.factoryExit) continue
    if (!indexed) {
      facilitiesById.clear()
      flightDestinations.clear()
      for (const building of state.buildings || []) {
        if (building.health > 0 && !building.isBeingSold &&
          (building.type === 'airstrip' || building.type === 'helipad')) facilitiesById.set(getBuildingIdentifier(building), building)
      }
      for (const aircraft of units) {
        if (aircraft.health > 0 && aircraft.helipadLandingRequested && aircraft.helipadTargetId) flightDestinations.add(aircraft.helipadTargetId)
      }
      indexed = true
    }

    const facility = facilitiesById.get(delivery.targetId)
    if (unit.health <= 0) {
      if (isGroundAircraftDelivery(unit)) releaseTaxiReservation(unit, facility)
      delete unit.aircraftDelivery
      continue
    }
    if (isGroundAircraftDelivery(unit)) {
      if (facility && delivery.route) {
        const status = advanceTaxi(unit, mapGrid, occupancy, delta)
        if (status === 'parked') parkAircraft(unit, facility, delivery)
        if (status !== 'disconnected' && (status !== 'traffic' || now < delivery.retryAt)) continue
      }
      if (delivery.route) {
        releaseTaxiReservation(unit, facility)
        delivery.targetId = null
        delivery.route = null
      }
      if (now < (delivery.retryAt || 0)) continue
      delivery.retryAt = now + DELIVERY_RETRY_MS
      const hasGalaxyOccupancy = unit.type === 'c5Galaxy' && unit.c5GroundOccupancy
      if (hasGalaxyOccupancy) changeC5GroundOccupancy(unit, occupancy, -1)
      const route = findTaxiRoute(unit, mapGrid, occupancy)
      if (hasGalaxyOccupancy) changeC5GroundOccupancy(unit, occupancy, 1)
      if (typeof route !== 'string') {
        Object.assign(delivery, route)
        delivery.blocked = null
      } else if (route !== 'traffic' && delivery.blocked !== route) {
        delivery.blocked = route
        if (unit.owner === state.humanPlayer) showAircraftDeliveryBlock(unit)
      }
    } else if (facility) {
      if (unit.landedHelipadId === delivery.targetId ||
        (!unit.helipadLandingRequested && unit.helipadTargetId !== delivery.targetId)) finishDelivery(unit)
    } else if (now >= (delivery.retryAt || 0)) {
      delivery.retryAt = now + DELIVERY_RETRY_MS
      dispatchFlight(unit, units)
    }
  }
}
