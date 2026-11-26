import { TILE_SIZE } from '../config.js'
import { getBuildingIdentifier } from '../utils.js'
import { getAirstripParkingSpots } from './airstripUtils.js'
import { getHelipadLandingCenter } from './helipadUtils.js'

export const LANDING_AIRCRAFT_TYPES = new Set(['apache', 'f22Raptor', 'f35', 'c5Galaxy'])
export const CARRIER_AIRCRAFT_SLOT_WEIGHT = Object.freeze({ f22Raptor: 1, f35: 2, apache: 2 })

const CARRIER_DECK_POINTS = [
  { forward: -1.25, right: 0.55 },
  { forward: -0.25, right: 0.55 },
  { forward: 0.75, right: 0.55 },
  { forward: 1.7, right: 0.55 }
]

export function getCarrierDeckSlotPoint(carrier, index, point = {}) {
  const slot = CARRIER_DECK_POINTS[index] || CARRIER_DECK_POINTS[0]
  const direction = carrier.direction || 0
  const forward = slot.forward * TILE_SIZE
  const right = slot.right * TILE_SIZE
  const cos = Math.cos(direction)
  const sin = Math.sin(direction)
  point.x = carrier.x + TILE_SIZE / 2 + cos * forward - sin * right
  point.y = carrier.y + TILE_SIZE / 2 + sin * forward + cos * right
  return point
}

export function getOccupiedCarrierDeckSlots(carrier, units, ignoredUnitIds = []) {
  const ignored = new Set(Array.isArray(ignoredUnitIds) ? ignoredUnitIds : [ignoredUnitIds])
  const occupied = new Set()
  ;(units || []).forEach(unit => {
    if (!unit || unit.health <= 0 || ignored.has(unit.id)) return
    const carrierId = unit.carrierOperation?.carrierId || unit.carrierId
    if (carrierId !== carrier.id || !Number.isInteger(unit.carrierDeckSlotIndex)) return
    const weight = CARRIER_AIRCRAFT_SLOT_WEIGHT[unit.type] || 1
    for (let offset = 0; offset < weight; offset++) occupied.add(unit.carrierDeckSlotIndex + offset)
  })
  return occupied
}

function selectedAirTypes(selectedUnits) {
  return new Set((selectedUnits || []).filter(unit => unit?.selected !== false && LANDING_AIRCRAFT_TYPES.has(unit.type)).map(unit => unit.type))
}

export function getAvailableLandingSpots(selectedUnits, buildings, units) {
  const types = selectedAirTypes(selectedUnits)
  if (types.size === 0) return []
  const spots = []

  ;(buildings || []).forEach(building => {
    if (!building || building.health <= 0 || building.owner !== selectedUnits[0]?.owner) return
    if (building.type === 'helipad' && (types.has('apache') || types.has('f35')) && !building.landedUnitId) {
      const center = getHelipadLandingCenter(building)
      if (center) spots.push({ kind: 'helipad', structure: building, structureId: getBuildingIdentifier(building), index: 0, worldX: center.x, worldY: center.y })
    }
    if (building.type === 'airstrip') {
      const occupied = building.f22OccupiedSlotUnitIds || []
      const reserved = building.f22ReservedSlotUnitIds || []
      getAirstripParkingSpots(building).forEach((slot, index) => {
        if (!occupied[index] && !reserved[index]) {
          spots.push({ kind: 'airstrip', structure: building, structureId: getBuildingIdentifier(building), index, worldX: slot.worldX, worldY: slot.worldY, tileX: slot.x, tileY: slot.y })
        }
      })
    }
  })

  ;(units || []).forEach(carrier => {
    if (carrier?.type !== 'aircraftCarrier' || carrier.health <= 0 || carrier.owner !== selectedUnits[0]?.owner) return
    const occupied = getOccupiedCarrierDeckSlots(carrier, units)
    const capacity = carrier.deckSlotCapacity || 4
    for (let index = 0; index < capacity; index++) {
      if (occupied.has(index)) continue
      const compatible = Array.from(types).some(type => {
        const weight = CARRIER_AIRCRAFT_SLOT_WEIGHT[type]
        if (!weight) return false
        for (let offset = 0; offset < weight; offset++) {
          if (index + offset >= capacity || occupied.has(index + offset)) return false
        }
        return true
      })
      if (!compatible) continue
      const point = getCarrierDeckSlotPoint(carrier, index)
      spots.push({ kind: 'carrier', structure: carrier, structureId: carrier.id, index, worldX: point.x, worldY: point.y })
    }
  })
  return spots
}

export function findLandingSpotAtWorld(selectedUnits, buildings, units, worldX, worldY) {
  let best = null
  let bestDistance = TILE_SIZE * 0.55
  getAvailableLandingSpots(selectedUnits, buildings, units).forEach(spot => {
    const distance = Math.hypot(worldX - spot.worldX, worldY - spot.worldY)
    if (distance <= bestDistance) {
      best = spot
      bestDistance = distance
    }
  })
  return best
}
