import { buildingData, createBuilding, placeBuilding } from '../buildings.js'
import { isGroundAircraftDelivery } from '../production/aircraftProduction.js'
import { findPathForOwner } from '../units.js'
import { ensureAirstripOperations } from '../utils/airstripUtils.js'
import { canPave } from './harvesterStreets.js'

const lastRoadAttempt = new WeakMap()

export function buildAircraftStreet(factory, units, buildings, mapGrid, occupancy, state, now) {
  if (factory.budget < buildingData.street.cost || now - (lastRoadAttempt.get(factory) ?? -Infinity) < 1000) return
  lastRoadAttempt.set(factory, now)
  const owner = factory.owner || factory.id
  const aircraft = units.find(unit => unit.owner === owner && unit.health > 0 && !unit.factoryExit &&
    isGroundAircraftDelivery(unit) && !unit.aircraftDelivery.route)
  if (!aircraft) return

  function canRoute(x, y) {
    const tile = mapGrid[y]?.[x]
    return tile?.type === 'street' || tile?.airstripStreet || canPave(tile, mapGrid, x, y)
  }

  const start = { x: aircraft.tileX, y: aircraft.tileY }
  if (!canRoute(start.x, start.y)) return
  const options = { cardinalOnly: true, strictDestination: true, tileFilter: canRoute }
  for (const strip of buildings) {
    if (strip.type !== 'airstrip') continue
    ensureAirstripOperations(strip)
    const destination = strip.f22ParkingSpots[aircraft.type === 'c5Galaxy' ? 1 : 0]
    const route = findPathForOwner(start, destination, mapGrid, null, owner, options)
    const next = route.find(({ x, y }) => canPave(mapGrid[y][x], mapGrid, x, y))
    if (!next) continue
    const street = createBuilding('street', next.x, next.y)
    street.owner = owner
    placeBuilding(street, mapGrid, occupancy)
    state.buildings.push(street)
    factory.budget -= buildingData.street.cost
    return street
  }
}
