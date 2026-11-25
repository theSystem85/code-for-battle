import { TILE_SIZE, UNIT_COSTS } from '../config.js'
import { getServiceRadiusPixels } from '../utils/serviceRadius.js'
import { normalizeServiceOwner } from './serviceUnitIndex.js'

export function getWorkshopUnitSalePrice(unit, buildings, owner) {
  if (!unit || !owner || normalizeServiceOwner(unit.owner) !== normalizeServiceOwner(owner) ||
      unit.health <= 0 || !(unit.health >= unit.maxHealth) || !Number.isFinite(unit.maxHealth) ||
      unit.factoryExit || unit.aircraftDelivery || unit.embarkedOnId || unit.embarkedUnitIds?.length ||
      unit.transportTransfer || unit.transportOperation || unit.carrierAircraftIds?.length || unit.c5Drop || unit.c5Boarding ||
      unit.towedWreck || unit.towedUnit || unit.towedBy || unit.altitude > 0 ||
      (unit.isAirUnit && unit.flightState !== 'grounded')) return 0

  const cost = UNIT_COSTS[unit.type]
  if (!Number.isFinite(cost) || cost <= 0) return 0
  const centerX = unit.x + TILE_SIZE / 2
  const centerY = unit.y + TILE_SIZE / 2
  const hasWorkshop = buildings?.some(workshop =>
    workshop?.type === 'vehicleWorkshop' && workshop.health > 0 && !workshop.isBeingSold &&
    workshop.constructionFinished !== false && normalizeServiceOwner(workshop.owner) === normalizeServiceOwner(owner) &&
    Math.hypot(centerX - (workshop.x + workshop.width / 2) * TILE_SIZE,
      centerY - (workshop.y + workshop.height / 2) * TILE_SIZE) <= getServiceRadiusPixels(workshop)
  )
  return hasWorkshop ? Math.floor(cost * 66 / 100) : 0
}
